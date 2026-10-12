from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from typing import List, Optional
import json as _json
import html as _html
import logging
from app.core.database import get_db
from app import models, schemas
from app.core import security
from app.api.deps import get_current_user
from app.core.rate_limiter import login_limiter, registration_limiter

logger = logging.getLogger(__name__)

router = APIRouter()

# Pre-computed dummy hash to prevent timing attacks / user enumeration
_DUMMY_PASSWORD_HASH = security.get_password_hash("harvest_auth_timing_attack_defense_padding_hash_2026")

def _get_client_ip(request: Request) -> str:
    """Extract client IP respecting X-Forwarded-For when behind trusted reverse proxies."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

def _get_frontend_origin() -> str:
    """Returns the configured frontend origin for postMessage targeting."""
    try:
        from app.core.config import settings
        origin = getattr(settings, "FRONTEND_ORIGIN", None)
        if origin and origin not in ("*", ""):
            return origin
    except Exception:
        pass
    return "*"  # fallback for local dev only


def _get_google_auth_redirect_uri(request: Request) -> str:
    """Computes Google OAuth callback URL with robust handling of proxies and environment settings."""
    from app.core.config import settings
    configured = getattr(settings, "GOOGLE_AUTH_REDIRECT_URI", None)

    # Extract real incoming scheme & host (handling reverse proxies like Render/Cloudflare/Nginx)
    proto = request.headers.get("x-forwarded-proto") or (request.url.scheme if request.url else "https")
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or (request.url.netloc if request.url else "")
    is_request_local = any(h in host.lower() for h in ("localhost", "127.0.0.1", "0.0.0.0")) if host else False

    # If configured explicitly in environment:
    if configured and configured.strip():
        uri = configured.strip()
        # Safeguard: If configured as localhost, but request arrived on a public domain (e.g. Render/Railway),
        # prevent breaking the OAuth flow by auto-adapting to the public domain.
        if not is_request_local and host and ("localhost" in uri or "127.0.0.1" in uri):
            logger.warning(
                f"GOOGLE_AUTH_REDIRECT_URI is set to localhost ('{uri}'), but traffic arrived from public host '{host}'. "
                f"Auto-resolving redirect URI to '{proto}://{host}/api/v1/users/auth/google/callback'."
            )
            return f"{proto}://{host}/api/v1/users/auth/google/callback"
        return uri

    # Dynamic fallback based on incoming request
    if host:
        return f"{proto}://{host}/api/v1/users/auth/google/callback"
    base_url = str(request.base_url).rstrip("/")
    return f"{base_url}/api/v1/users/auth/google/callback"


def _get_platform_oauth_redirect_uri(platform: str, request: Request) -> str:
    """Computes OAuth callback URL for social platforms (youtube, facebook, instagram)."""
    from app.core.config import settings

    if platform == "youtube":
        configured = getattr(settings, "GOOGLE_REDIRECT_URI", None)
    elif platform == "facebook":
        configured = getattr(settings, "META_REDIRECT_URI", None)
    elif platform == "instagram":
        configured = getattr(settings, "INSTAGRAM_REDIRECT_URI", None)
    else:
        configured = None

    proto = request.headers.get("x-forwarded-proto") or (request.url.scheme if request.url else "https")
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or (request.url.netloc if request.url else "")
    is_request_local = any(h in host.lower() for h in ("localhost", "127.0.0.1", "0.0.0.0")) if host else False

    if configured and configured.strip():
        uri = configured.strip()
        if not is_request_local and host and ("localhost" in uri or "127.0.0.1" in uri):
            logger.warning(
                f"{platform.upper()} redirect URI is set to localhost ('{uri}'), but traffic arrived from '{host}'. "
                f"Auto-resolving redirect URI to '{proto}://{host}/api/v1/users/auth/{platform}/callback'."
            )
            return f"{proto}://{host}/api/v1/users/auth/{platform}/callback"
        return uri

    if host:
        return f"{proto}://{host}/api/v1/users/auth/{platform}/callback"
    base_url = str(request.base_url).rstrip("/")
    return f"{base_url}/api/v1/users/auth/{platform}/callback"


@router.post("/register", response_model=schemas.Token)
def register_user(
    user_in: schemas.UserCreate,
    request: Request,
    db: Session = Depends(get_db)
):
    client_ip = _get_client_ip(request)
    
    # 1. Rate-limit registrations per IP (e.g. max 10 per hour)
    allowed, retry_after = registration_limiter.check_rate_limit(f"reg_ip_{client_ip}", max_requests=10, window_seconds=3600)
    if not allowed:
        logger.warning(f"SECURITY AUDIT: Rate limit exceeded for registration from IP {client_ip}")
        raise HTTPException(
            status_code=429,
            detail=f"Too many account creation attempts. Please wait {retry_after} seconds before trying again."
        )

    # 2. Check existing user by normalized email
    normalized_email = user_in.email.strip().lower()
    existing_user = db.query(models.User).filter(models.User.email == normalized_email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="An account with this email address already exists.")
    
    # 3. Hash password and persist user
    hashed_password = security.get_password_hash(user_in.password)
    db_user = models.User(
        email=normalized_email,
        full_name=user_in.full_name,
        hashed_password=hashed_password,
        is_active=True
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    logger.info(f"SECURITY AUDIT: User registered successfully (id={db_user.id}, email='{normalized_email}', ip={client_ip})")

    access_token = security.create_access_token(subject=db_user.id)
    return schemas.Token(access_token=access_token, token_type="bearer", user=db_user)


@router.post("/login", response_model=schemas.Token)
def login_user(
    login_in: schemas.LoginRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    client_ip = _get_client_ip(request)
    normalized_email = login_in.email.strip().lower()
    email_key = f"login_email_{normalized_email}"
    ip_key = f"login_ip_{client_ip}"

    # 1. Check account / IP lockout
    is_locked_email, remaining_email = login_limiter.is_locked(email_key)
    if is_locked_email:
        logger.warning(f"SECURITY AUDIT: Blocked login attempt on locked email '{normalized_email}' from IP {client_ip}")
        raise HTTPException(
            status_code=429,
            detail=f"Account temporarily locked due to multiple failed login attempts. Please wait {remaining_email} seconds before trying again."
        )

    is_locked_ip, remaining_ip = login_limiter.is_locked(ip_key)
    if is_locked_ip:
        logger.warning(f"SECURITY AUDIT: Blocked login attempt from locked IP {client_ip}")
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed login attempts from this network. Please wait {remaining_ip} seconds before trying again."
        )

    # 2. Query user & constant-time password verification (timing attack prevention)
    user = db.query(models.User).filter(models.User.email == normalized_email).first()
    if user is None:
        # Run dummy verification so execution time matches real verification, preventing user enumeration
        security.verify_password(login_in.password, _DUMMY_PASSWORD_HASH)
        is_valid = False
    else:
        is_valid = security.verify_password(login_in.password, user.hashed_password)

    # 3. Handle verification failure
    if not is_valid:
        is_locked, attempts, remaining = login_limiter.record_failed_attempt(email_key, max_attempts=5, window_seconds=900, lockout_seconds=900)
        login_limiter.record_failed_attempt(ip_key, max_attempts=15, window_seconds=900, lockout_seconds=900)

        logger.warning(f"SECURITY AUDIT: Failed login for '{normalized_email}' from IP {client_ip} (attempt #{attempts})")

        if is_locked:
            raise HTTPException(
                status_code=429,
                detail=f"Too many failed login attempts. Account temporarily locked for {remaining} seconds."
            )
        
        remaining_attempts = max(0, 5 - attempts)
        msg = "Incorrect email or password."
        if remaining_attempts <= 2:
            msg += f" {remaining_attempts} attempt{'s' if remaining_attempts != 1 else ''} remaining before temporary lockout."
        raise HTTPException(status_code=400, detail=msg)

    # 4. Check active status
    if not user.is_active:
        logger.warning(f"SECURITY AUDIT: Inactive user '{normalized_email}' attempted login from IP {client_ip}")
        raise HTTPException(status_code=403, detail="Your account is deactivated. Please contact support.")

    # 5. Success: clear failed attempts and issue token
    login_limiter.clear_failed_attempts(email_key)
    login_limiter.clear_failed_attempts(ip_key)
    logger.info(f"SECURITY AUDIT: Successful login for user id={user.id} ('{normalized_email}') from IP {client_ip}")

    access_token = security.create_access_token(subject=user.id)
    return schemas.Token(access_token=access_token, token_type="bearer", user=user)


@router.get("/me", response_model=schemas.User)
def get_user_me(
    current_user: models.User = Depends(get_current_user)
):
    return current_user


@router.get("/{user_id}/connections", response_model=List[schemas.SocialConnection])
def read_user_connections(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Enforce current_user ID
    user_id = current_user.id
    db_user = current_user

    connections = list(db_user.social_connections)
    from app.core.config import settings

    # Add Facebook connection if configured in .env but not in DB
    if settings.FACEBOOK_ACCESS_TOKEN and settings.FACEBOOK_PAGE_ID:
        if not any(c.platform == "facebook" for c in connections):
            connections.append(models.SocialConnection(
                user_id=user_id,
                platform="facebook",
                account_name="Facebook Page (Env Config)",
                account_handle="@env_configured",
                account_avatar="https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=100",
                credentials={
                    "facebook_access_token": settings.FACEBOOK_ACCESS_TOKEN,
                    "facebook_page_id": settings.FACEBOOK_PAGE_ID
                }
            ))

    # Add YouTube connection if configured in .env but not in DB
    if settings.YOUTUBE_ACCESS_TOKEN:
        if not any(c.platform == "youtube" for c in connections):
            connections.append(models.SocialConnection(
                user_id=user_id,
                platform="youtube",
                account_name="YouTube Channel (Env Config)",
                account_handle="@env_configured",
                account_avatar="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100",
                credentials={
                    "youtube_access_token": settings.YOUTUBE_ACCESS_TOKEN
                }
            ))

    # Add Instagram connection if configured in .env but not in DB
    if settings.INSTAGRAM_ACCESS_TOKEN and settings.INSTAGRAM_BUSINESS_ID:
        if not any(c.platform == "instagram" for c in connections):
            connections.append(models.SocialConnection(
                user_id=user_id,
                platform="instagram",
                account_name="Instagram Business (Env Config)",
                account_handle="@env_configured",
                account_avatar="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100",
                credentials={
                    "instagram_access_token": settings.INSTAGRAM_ACCESS_TOKEN,
                    "instagram_business_id": settings.INSTAGRAM_BUSINESS_ID,
                    "public_video_url": settings.PUBLIC_VIDEO_URL
                }
            ))

    return connections

@router.post("/{user_id}/connections", response_model=schemas.SocialConnection)
def save_user_connection(
    user_id: int,
    connection_in: schemas.SocialConnectionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    user_id = current_user.id
    db_user = current_user

    # Verify credentials via SocialPublishService
    from app.services.social_publish_service import SocialPublishService
    try:
        verification_details = SocialPublishService.verify_connection(
            platform=connection_in.platform,
            credentials=connection_in.credentials
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))

    # Check if connection for this platform already exists for the user
    db_conn = db.query(models.SocialConnection).filter(
        models.SocialConnection.user_id == user_id,
        models.SocialConnection.platform == connection_in.platform
    ).first()

    if db_conn:
        db_conn.account_name = verification_details["account_name"]
        db_conn.account_handle = verification_details["account_handle"]
        db_conn.account_avatar = verification_details["account_avatar"]
        db_conn.credentials = verification_details["credentials"]
    else:
        db_conn = models.SocialConnection(
            user_id=user_id,
            platform=connection_in.platform,
            account_name=verification_details["account_name"],
            account_handle=verification_details["account_handle"],
            account_avatar=verification_details["account_avatar"],
            credentials=verification_details["credentials"]
        )
        db.add(db_conn)

    db.commit()
    db.refresh(db_conn)
    return db_conn

@router.delete("/{user_id}/connections/{platform}")
def delete_user_connection(
    user_id: int,
    platform: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    user_id = current_user.id

    db_conn = db.query(models.SocialConnection).filter(
        models.SocialConnection.user_id == user_id,
        models.SocialConnection.platform == platform
    ).first()

    if not db_conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    db.delete(db_conn)
    db.commit()
    return {"message": f"Successfully disconnected platform {platform}"}

@router.get("/auth/google/login")
def google_auth_login(request: Request):
    """Initiates Google OAuth for both User Login and YouTube Channel authorization."""
    from app.core.config import settings

    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=400,
            detail="Google OAuth credentials are not configured in backend .env. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
        )

    # Scopes needed for both Login (identity/profile) AND YouTube video upload & read
    scopes = [
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/youtube.upload",
        "https://www.googleapis.com/auth/youtube.readonly",
    ]

    redirect_uri = _get_google_auth_redirect_uri(request)

    auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        "?response_type=code"
        f"&client_id={settings.GOOGLE_CLIENT_ID}"
        f"&redirect_uri={redirect_uri}"
        f"&scope={'%20'.join(scopes)}"
        "&access_type=offline&prompt=consent"
    )
    return RedirectResponse(url=auth_url)


@router.get("/auth/google/callback", response_class=HTMLResponse)
def google_auth_callback(
    request: Request,
    code: Optional[str] = None,
    error: Optional[str] = None,
    error_description: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Handles Google OAuth callback, logs in / registers the user, and connects YouTube channel."""
    import requests
    import secrets
    from app.core.config import settings
    _origin = _get_frontend_origin()

    if error or error_description:
        err_msg = error_description or error or "Google login was cancelled or failed."
        err_json = _json.dumps(str(err_msg))
        return f"""
        <html>
          <body>
            <script>
              window.opener ? window.opener.postMessage({{
                type: 'HARVEST_GOOGLE_LOGIN_FAILURE',
                error: {err_json}
              }}, {_json.dumps(_origin)}) : alert({err_json});
              window.close();
            </script>
          </body>
        </html>
        """

    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code from Google.")

    try:
        redirect_uri = _get_google_auth_redirect_uri(request)

        # Exchange code for tokens
        token_url = "https://oauth2.googleapis.com/token"
        data = {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri
        }
        res = requests.post(token_url, data=data, timeout=15)
        res.raise_for_status()
        token_data = res.json()

        google_access_token = token_data.get("access_token")
        google_refresh_token = token_data.get("refresh_token")

        # Fetch user profile from Google UserInfo
        userinfo_url = "https://www.googleapis.com/oauth2/v3/userinfo"
        userinfo_res = requests.get(
            userinfo_url,
            headers={"Authorization": f"Bearer {google_access_token}"},
            timeout=10
        )
        userinfo_res.raise_for_status()
        user_info = userinfo_res.json()

        email = user_info.get("email", "").strip().lower()
        if not email:
            raise ValueError("No email address provided by Google account.")

        full_name = user_info.get("name") or email.split("@")[0]
        avatar_url = user_info.get("picture")

        # Find or create user in Harvest DB
        db_user = db.query(models.User).filter(models.User.email == email).first()
        if not db_user:
            random_pw = secrets.token_urlsafe(32)
            db_user = models.User(
                email=email,
                full_name=full_name,
                hashed_password=security.get_password_hash(random_pw),
                is_active=True
            )
            db.add(db_user)
            db.commit()
            db.refresh(db_user)
            logger.info(f"New user created via Google OAuth: id={db_user.id}, email={email}")
        else:
            if full_name and not db_user.full_name:
                db_user.full_name = full_name
                db.commit()
                db.refresh(db_user)

        # Connect YouTube if YouTube scopes were granted
        try:
            from app.services.social_publish_service import SocialPublishService
            youtube_details = SocialPublishService.verify_connection("youtube", {
                "youtube_access_token": google_access_token,
                "youtube_refresh_token": google_refresh_token
            })
            if youtube_details:
                db_conn = db.query(models.SocialConnection).filter(
                    models.SocialConnection.user_id == db_user.id,
                    models.SocialConnection.platform == "youtube"
                ).first()
                new_creds = youtube_details.get("credentials") or {}
                if db_conn:
                    if not new_creds.get("youtube_refresh_token") and db_conn.credentials:
                        new_creds["youtube_refresh_token"] = db_conn.credentials.get("youtube_refresh_token")
                    db_conn.account_name = youtube_details["account_name"]
                    db_conn.account_handle = youtube_details["account_handle"]
                    db_conn.account_avatar = youtube_details["account_avatar"]
                    db_conn.credentials = new_creds
                    from sqlalchemy.orm.attributes import flag_modified
                    flag_modified(db_conn, "credentials")
                else:
                    db_conn = models.SocialConnection(
                        user_id=db_user.id,
                        platform="youtube",
                        account_name=youtube_details["account_name"],
                        account_handle=youtube_details["account_handle"],
                        account_avatar=youtube_details["account_avatar"],
                        credentials=new_creds
                    )
                    db.add(db_conn)
                db.commit()
                logger.info(f"Linked YouTube channel '{youtube_details.get('account_name')}' for user {db_user.id} during Google Sign-In.")
        except Exception as yt_err:
            logger.warning(f"Could not automatically link YouTube channel during Google sign-in (non-fatal): {yt_err}")

        # Determine frontend origin for redirect fallback
        req_host = request.headers.get("x-forwarded-host") or request.headers.get("host") or (request.url.netloc if request.url else "")
        req_is_local = any(h in req_host.lower() for h in ("localhost", "127.0.0.1", "0.0.0.0")) if req_host else False
        frontend_url = "https://localhost:5173" if req_is_local else "https://harvest-ai-ebon.vercel.app"
        try:
            if settings.FRONTEND_ORIGIN and settings.FRONTEND_ORIGIN not in ("*", ""):
                frontend_url = settings.FRONTEND_ORIGIN.rstrip("/")
            elif request.headers.get("referer"):
                from urllib.parse import urlparse
                ref_parts = urlparse(request.headers.get("referer"))
                if ref_parts.netloc and "localhost" not in ref_parts.netloc:
                    frontend_url = f"{ref_parts.scheme or 'https'}://{ref_parts.netloc}".rstrip("/")
        except Exception:
            pass

        # Generate JWT token
        jwt_token = security.create_access_token(subject=db_user.id)
        user_dict = {
            "id": db_user.id,
            "email": db_user.email,
            "full_name": db_user.full_name,
            "avatar": avatar_url
        }

        token_json = _json.dumps(jwt_token)
        user_json = _json.dumps(user_dict)
        user_json_str = _json.dumps(_json.dumps(user_dict))
        frontend_url_json = _json.dumps(frontend_url)

        return f"""
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Harvest AI - Signing In</title>
            <style>
              body {{
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background: #0d0f12;
                color: #f3f4f6;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
              }}
              .card {{
                background: #16181d;
                border: 1px solid #282c37;
                border-radius: 12px;
                padding: 28px 36px;
                text-align: center;
                max-width: 360px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5);
              }}
              .spinner {{
                width: 32px;
                height: 32px;
                border: 3px solid rgba(59, 130, 246, 0.2);
                border-top-color: #3b82f6;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
                margin: 0 auto 16px;
              }}
              @keyframes spin {{ to {{ transform: rotate(360deg); }} }}
              h3 {{ margin: 0 0 6px; font-size: 17px; font-weight: 600; color: #ffffff; }}
              p {{ margin: 0; font-size: 13px; color: #9ca3af; }}
            </style>
          </head>
          <body>
            <div class="card">
              <div class="spinner"></div>
              <h3>Signing into Harvest AI…</h3>
              <p>Authentication successful. Taking you to your studio…</p>
            </div>
            <script>
              const payload = {{
                type: 'HARVEST_GOOGLE_LOGIN_SUCCESS',
                token: {token_json},
                user: {user_json}
              }};

              const targetFrontend = {frontend_url_json};
              let openerNotified = false;

              if (window.opener && !window.opener.closed) {{
                try {{
                  window.opener.postMessage(payload, '*');
                  openerNotified = true;
                }} catch (e) {{
                  console.error('postMessage error:', e);
                }}
              }}

              setTimeout(() => {{
                if (openerNotified && window.opener && !window.opener.closed) {{
                  window.close();
                }} else {{
                  window.location.href = targetFrontend + '/login?google_token=' + encodeURIComponent({token_json}) + '&google_user=' + encodeURIComponent({user_json_str});
                }}
              }}, 400);
            </script>
          </body>
        </html>
        """

    except Exception as e:
        logger.error(f"Google OAuth callback error: {e}", exc_info=True)
        raw_err = str(e)
        if "invalid_grant" in raw_err.lower():
            friendly_err = "Google authorization code expired or was already used. Please return to the login screen and click 'Continue with Google' again."
        else:
            friendly_err = f"Google sign-in error: {raw_err}"
        err_json = _json.dumps(friendly_err)
        return f"""
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Harvest AI - Sign In Error</title>
            <style>
              body {{
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background: #0d0f12;
                color: #f3f4f6;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
              }}
              .card {{
                background: #16181d;
                border: 1px solid rgba(239, 68, 68, 0.4);
                border-radius: 12px;
                padding: 28px 36px;
                text-align: center;
                max-width: 420px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5);
              }}
              h3 {{ margin: 0 0 10px; font-size: 18px; font-weight: 600; color: #ef4444; }}
              p {{ margin: 0 0 20px; font-size: 14px; color: #d1d5db; line-height: 1.5; }}
              button {{
                background: #2563eb;
                color: #ffffff;
                border: none;
                padding: 10px 20px;
                border-radius: 8px;
                font-weight: 500;
                cursor: pointer;
              }}
              button:hover {{ background: #1d4ed8; }}
            </style>
          </head>
          <body>
            <div class="card">
              <h3>Authentication Error</h3>
              <p>{friendly_err}</p>
              <button onclick="window.close()">Close Window</button>
            </div>
            <script>
              if (window.opener && !window.opener.closed) {{
                try {{
                  window.opener.postMessage({{
                    type: 'HARVEST_GOOGLE_LOGIN_FAILURE',
                    error: {err_json}
                  }}, '*');
                }} catch (e) {{}}
                setTimeout(() => window.close(), 3000);
              }}
            </script>
          </body>
        </html>
        """


@router.get("/auth/{platform}/login")
def platform_login(
    platform: str,
    user_id: int,
    request: Request,
    db: Session = Depends(get_db)
):
    # Verify user exists
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    # If credentials are not configured, raise an error explaining they must set them up
    from app.core.config import settings
    
    if platform == "youtube":
        if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
            raise HTTPException(
                status_code=400, 
                detail="Google/YouTube OAuth credentials are not configured in the backend (.env file). Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
            )
    elif platform in ("facebook", "instagram"):
        if not settings.META_APP_ID or not settings.META_APP_SECRET:
            raise HTTPException(
                status_code=400, 
                detail="Meta/Facebook App credentials are not configured in the backend (.env file). Please set META_APP_ID and META_APP_SECRET."
            )

    # If live keys are configured, generate OAuth authorize URL and redirect
    if platform == "youtube":
        redirect_uri = _get_platform_oauth_redirect_uri("youtube", request)
        auth_url = (
            "https://accounts.google.com/o/oauth2/v2/auth"
            "?response_type=code"
            f"&client_id={settings.GOOGLE_CLIENT_ID}"
            f"&redirect_uri={redirect_uri}"
            "&scope=https://www.googleapis.com/auth/youtube.upload%20https://www.googleapis.com/auth/youtube.readonly"
            f"&state={user_id}"
            "&access_type=offline&prompt=consent"
        )
        return RedirectResponse(url=auth_url)

    elif platform in ("facebook", "instagram"):
        redirect_uri = _get_platform_oauth_redirect_uri(platform, request)
        scope = "pages_show_list,pages_read_engagement,pages_manage_posts,publish_video,business_management"
        if platform == "instagram":
            scope += ",instagram_basic,instagram_content_publish"
            
        auth_url = (
            "https://www.facebook.com/v20.0/dialog/oauth"
            f"?client_id={settings.META_APP_ID}"
            f"&redirect_uri={redirect_uri}"
            f"&scope={scope}"
            f"&state={user_id}"
            "&auth_type=rerequest"
        )
        return RedirectResponse(url=auth_url)

    raise HTTPException(status_code=400, detail=f"Unsupported login platform: {platform}")

def _render_oauth_callback_html(
    status: str,
    platform: str,
    title: str,
    message: str,
    details: Optional[str] = None
) -> str:
    """Renders a clean, branded HTML response for popup OAuth callbacks with fallback controls."""
    plat_name = {
        "youtube": "YouTube",
        "facebook": "Facebook",
        "instagram": "Instagram"
    }.get(platform.lower(), platform.capitalize())
    
    is_success = (status == "success")
    icon_svg = (
        """<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>"""
        if is_success else
        """<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>"""
    )
    badge_bg = "rgba(16, 185, 129, 0.15)" if is_success else "rgba(239, 68, 68, 0.15)"
    badge_border = "rgba(16, 185, 129, 0.3)" if is_success else "rgba(239, 68, 68, 0.3)"
    btn_color = "#10b981" if is_success else "#3b82f6"
    btn_text = "Close Window" if is_success else "Close Window & Try Again"
    
    safe_details_str = str(details or "")
    payload_type = "HARVEST_AUTH_SUCCESS" if is_success else "HARVEST_AUTH_FAILURE"
    
    details_html = ""
    if details:
        escaped_details = _html.escape(safe_details_str)
        details_html = f"""
        <div class="details-box">
          <div class="details-title">Details:</div>
          <div class="details-content">{escaped_details}</div>
        </div>
        """
        
    tips_html = ""
    if not is_success and platform.lower() in ("facebook", "instagram"):
        tips_html = """
        <div class="tips-box">
          <div class="tips-title">Troubleshooting Checklist:</div>
          <ul class="tips-list">
            <li><strong>Facebook Page Required:</strong> Meta requires an active Facebook Page on your account to manage posts or connect Instagram.</li>
            <li><strong>Instagram Professional Account:</strong> Your Instagram account must be switched to a <em>Professional (Creator or Business)</em> account and linked to your Facebook Page in <em>Page Settings &gt; Linked Accounts</em>.</li>
            <li><strong>Meta App in Development Mode:</strong> If your Meta app is not Live, ensure your Facebook account is added to <em>App Roles &gt; Testers / Developers</em> in the Meta Developer Portal.</li>
          </ul>
        </div>
        """

    return f"""<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Harvest AI - {plat_name} Connection</title>
    <style>
      * {{ box-sizing: border-box; margin: 0; padding: 0; }}
      body {{
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        background: #090a0f;
        background-image: radial-gradient(circle at 50% 20%, rgba(30, 41, 59, 0.5) 0%, rgba(9, 10, 15, 1) 100%);
        color: #f3f4f6;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }}
      .card {{
        background: rgba(22, 24, 33, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        padding: 32px 28px;
        width: 100%;
        max-width: 440px;
        text-align: center;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(12px);
      }}
      .icon-badge {{
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: {badge_bg};
        border: 1px solid {badge_border};
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 20px;
      }}
      h2 {{
        font-size: 20px;
        font-weight: 700;
        margin-bottom: 8px;
        color: #ffffff;
        letter-spacing: -0.01em;
      }}
      p.sub {{
        font-size: 14px;
        color: #94a3b8;
        line-height: 1.5;
        margin-bottom: 20px;
      }}
      .details-box {{
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(239, 68, 68, 0.25);
        border-radius: 10px;
        padding: 12px 14px;
        text-align: left;
        margin-bottom: 18px;
      }}
      .details-title {{
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #ef4444;
        font-weight: 700;
        margin-bottom: 6px;
      }}
      .details-content {{
        font-size: 12px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        color: #fca5a5;
        word-break: break-word;
        line-height: 1.4;
      }}
      .tips-box {{
        background: rgba(30, 41, 59, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 10px;
        padding: 14px 16px;
        text-align: left;
        margin-bottom: 22px;
      }}
      .tips-title {{
        font-size: 12px;
        font-weight: 600;
        color: #cbd5e1;
        margin-bottom: 8px;
      }}
      .tips-list {{
        font-size: 12px;
        color: #94a3b8;
        padding-left: 18px;
        line-height: 1.5;
      }}
      .tips-list li {{ margin-bottom: 6px; }}
      .btn {{
        display: block;
        width: 100%;
        background: {btn_color};
        color: #ffffff;
        font-weight: 600;
        font-size: 14px;
        padding: 12px 16px;
        border-radius: 10px;
        border: none;
        cursor: pointer;
        transition: opacity 0.2s, transform 0.1s;
      }}
      .btn:hover {{ opacity: 0.9; }}
      .btn:active {{ transform: scale(0.98); }}
      .timer-note {{
        font-size: 12px;
        color: #64748b;
        margin-top: 12px;
      }}
    </style>
  </head>
  <body>
    <div class="card">
      <div class="icon-badge">
        {icon_svg}
      </div>
      <h2>{title}</h2>
      <p class="sub">{message}</p>
      {details_html}
      {tips_html}
      <button class="btn" onclick="closeWindow()">{btn_text}</button>
      {"<div class='timer-note' id='timerText'>Closing window in 3 seconds...</div>" if is_success else ""}
    </div>

    <script>
      const payload = {{
        type: {_json.dumps(payload_type)},
        platform: {_json.dumps(platform)},
        error: {_json.dumps(safe_details_str)}
      }};

      if (window.opener && !window.opener.closed) {{
        try {{
          window.opener.postMessage(payload, '*');
        }} catch (e) {{
          console.warn('OAuth postMessage error:', e);
        }}
      }}

      function closeWindow() {{
        try {{
          window.close();
        }} catch(e) {{}}
      }}

      {'''
      let count = 3;
      const timerEl = document.getElementById('timerText');
      const interval = setInterval(() => {
        count--;
        if (timerEl) timerEl.innerText = 'Closing window in ' + count + ' seconds...';
        if (count <= 0) {
          clearInterval(interval);
          closeWindow();
        }
      }, 1000);
      ''' if is_success else ''}
    </script>
  </body>
</html>"""


@router.get("/auth/{platform}/callback", response_class=HTMLResponse)
def platform_callback(
    platform: str,
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    error_code: Optional[int] = None,
    error_message: Optional[str] = None,
    error_description: Optional[str] = None,
    db: Session = Depends(get_db)
):
    if error or error_message or error_description:
        err_msg = error_message or error_description or error or "OAuth authorization was cancelled or denied."
        return _render_oauth_callback_html(
            status="error",
            platform=platform,
            title="Authorization Denied",
            message="The authorization request was cancelled or declined by the provider.",
            details=str(err_msg)
        )

    if not state:
        return _render_oauth_callback_html(
            status="error",
            platform=platform,
            title="Invalid Request",
            message="Missing state parameter in authorization callback.",
            details="The state parameter was not returned by the authentication server."
        )

    try:
        user_id = int(state)
    except (TypeError, ValueError):
        return _render_oauth_callback_html(
            status="error",
            platform=platform,
            title="Invalid State",
            message="Invalid user identifier passed in OAuth state.",
            details="State parameter could not be parsed as a user ID."
        )

    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        return _render_oauth_callback_html(
            status="error",
            platform=platform,
            title="User Not Found",
            message="No matching user account found for this authorization session."
        )

    if not code:
        return _render_oauth_callback_html(
            status="error",
            platform=platform,
            title="Missing Authorization Code",
            message="No authorization code was provided by the provider."
        )

    # Standard Live OAuth Token Exchange
    if code == "mock_code":
        return _render_oauth_callback_html(
            status="error",
            platform=platform,
            title="Mock Code Disabled",
            message="Mock authorization codes are disabled in live environments."
        )

    import requests
    from app.core.config import settings
    
    try:
        def save_connection(plat: str, conn_details: dict):
            db_conn = db.query(models.SocialConnection).filter(
                models.SocialConnection.user_id == user_id,
                models.SocialConnection.platform == plat
            ).first()

            new_credentials = conn_details["credentials"] or {}
            if db_conn:
                existing_credentials = db_conn.credentials or {}
                if plat == "youtube" and not new_credentials.get("youtube_refresh_token") and existing_credentials.get("youtube_refresh_token"):
                    new_credentials["youtube_refresh_token"] = existing_credentials["youtube_refresh_token"]
                
                db_conn.account_name = conn_details["account_name"]
                db_conn.account_handle = conn_details["account_handle"]
                db_conn.account_avatar = conn_details["account_avatar"]
                db_conn.credentials = new_credentials
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(db_conn, "credentials")
            else:
                db_conn = models.SocialConnection(
                    user_id=user_id,
                    platform=plat,
                    account_name=conn_details["account_name"],
                    account_handle=conn_details["account_handle"],
                    account_avatar=conn_details["account_avatar"],
                    credentials=new_credentials
                )
                db.add(db_conn)
            db.commit()

        if platform == "youtube":
            token_url = "https://oauth2.googleapis.com/token"
            redirect_uri = _get_platform_oauth_redirect_uri("youtube", request)
            data = {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri
            }
            try:
                res = requests.post(token_url, data=data, timeout=15)
                res.raise_for_status()
                tokens = res.json()
            except requests.RequestException as req_err:
                yt_err = ""
                if hasattr(req_err, "response") and req_err.response is not None:
                    try:
                        yt_err = req_err.response.json().get("error_description") or req_err.response.json().get("error") or ""
                    except Exception:
                        pass
                raise ValueError(f"Google/YouTube token exchange error: {yt_err or str(req_err)}")

            access_token = tokens.get("access_token")
            refresh_token = tokens.get("refresh_token")
            
            from app.services.social_publish_service import SocialPublishService
            details = SocialPublishService.verify_connection("youtube", {
                "youtube_access_token": access_token,
                "youtube_refresh_token": refresh_token
            })
            save_connection("youtube", details)
            
        elif platform in ("facebook", "instagram"):
            redirect_uri = _get_platform_oauth_redirect_uri(platform, request)
            token_url = "https://graph.facebook.com/v20.0/oauth/access_token"
            params = {
                "client_id": settings.META_APP_ID,
                "client_secret": settings.META_APP_SECRET,
                "redirect_uri": redirect_uri,
                "code": code
            }
            try:
                res = requests.get(token_url, params=params, timeout=15)
                res.raise_for_status()
                tokens = res.json()
            except requests.RequestException as req_err:
                meta_err = ""
                if hasattr(req_err, "response") and req_err.response is not None:
                    try:
                        err_payload = req_err.response.json().get("error", {})
                        meta_err = err_payload.get("message") or err_payload.get("error_user_msg") or ""
                    except Exception:
                        pass
                if not meta_err:
                    meta_err = str(req_err)
                if "code has expired" in meta_err.lower() or "36007" in meta_err or "code has been used" in meta_err.lower():
                    raise ValueError("The Meta authorization code has expired or was already used. Please click Connect in Harvest AI again.")
                if settings.META_APP_SECRET and settings.META_APP_SECRET in meta_err:
                    meta_err = meta_err.replace(settings.META_APP_SECRET, "[REDACTED]")
                raise ValueError(f"Meta token exchange error: {meta_err}")

            access_token = tokens.get("access_token")
            
            from app.services.social_publish_service import SocialPublishService
            
            # Query pages with fields access_token,instagram_business_account,name
            pages_url = "https://graph.facebook.com/v20.0/me/accounts"
            try:
                p_res = requests.get(
                    pages_url, 
                    params={
                        "fields": "access_token,instagram_business_account,name",
                        "access_token": access_token
                    }, 
                    timeout=15
                )
                p_res.raise_for_status()
                pages_data = p_res.json().get("data", [])
            except requests.RequestException as req_err:
                p_err = ""
                if hasattr(req_err, "response") and req_err.response is not None:
                    try:
                        p_err = req_err.response.json().get("error", {}).get("message") or ""
                    except Exception:
                        pass
                raise ValueError(f"Failed to fetch Facebook Pages: {p_err or str(req_err)}")

            # Fallback for New Pages Experience or when /me/accounts returns empty
            if not pages_data:
                candidate_ids = []
                if getattr(settings, "FACEBOOK_PAGE_ID", None) and settings.FACEBOOK_PAGE_ID.strip():
                    candidate_ids.append(settings.FACEBOOK_PAGE_ID.strip())
                for cid in ("61595390004729", "61595495543554"):
                    if cid not in candidate_ids:
                        candidate_ids.append(cid)

                for cid in candidate_ids:
                    try:
                        page_direct_url = f"https://graph.facebook.com/v20.0/{cid}"
                        c_res = requests.get(
                            page_direct_url,
                            params={
                                "fields": "access_token,name,instagram_business_account",
                                "access_token": access_token
                            },
                            timeout=10
                        )
                        if c_res.status_code == 200:
                            p_info = c_res.json()
                            if p_info.get("access_token") or p_info.get("id"):
                                # If page returned id without separate token, the user token can act for it
                                if not p_info.get("access_token"):
                                    p_info["access_token"] = access_token
                                pages_data.append(p_info)
                                logger.info(f"Direct fallback query succeeded for Page '{p_info.get('name')}' (ID: {cid}).")
                                break
                    except Exception as ex:
                        logger.warning(f"Direct fallback query failed for page ID {cid}: {ex}")

            if not pages_data:
                raise ValueError(
                    "No Facebook Pages found or selected for this authorization. "
                    "When connecting with Facebook, please click 'Choose what you allow' (or 'Edit Settings') "
                    "and ensure you check the box next to your Facebook Page (e.g. Navin N / Harvest Hi). "
                    "Also ensure your Facebook account is added to App Roles in developers.facebook.com."
                )
                
            facebook_details = None
            instagram_details = None
            
            # Resolve Facebook Details using the first page
            default_page = pages_data[0]
            fb_token = default_page.get("access_token")
            fb_id = default_page.get("id")
            if fb_token and fb_id:
                facebook_details = SocialPublishService.verify_connection("facebook", {
                    "facebook_access_token": fb_token,
                    "facebook_page_id": fb_id
                })
                
            # Resolve Instagram Details
            ig_biz_id = None
            target_page_token = None
            
            for p in pages_data:
                # Method 1: Check inline instagram_business_account field
                ig_acct = p.get("instagram_business_account")
                if ig_acct:
                    ig_biz_id = ig_acct["id"]
                    target_page_token = p.get("access_token")
                    break
                
                # Method 2: Fallback query specific /{page_id}/instagram_accounts endpoint
                page_id = p.get("id")
                page_token = p.get("access_token")
                if page_id and page_token:
                    logger.info(f"Page '{p.get('name')}' did not return inline IG account. Querying /{page_id}/instagram_accounts fallback...")
                    try:
                        ig_url = f"https://graph.facebook.com/v20.0/{page_id}/instagram_accounts"
                        ig_res = requests.get(
                            ig_url, 
                            params={
                                "fields": "id,username,name",
                                "access_token": page_token
                            }, 
                            timeout=10
                        )
                        if ig_res.status_code == 200:
                            ig_data = ig_res.json().get("data", [])
                            if ig_data:
                                ig_biz_id = ig_data[0]["id"]
                                target_page_token = page_token
                                logger.info(f"Successfully resolved Instagram Business Account ID '{ig_biz_id}' via page fallback.")
                                break
                    except Exception as ex:
                        logger.warning(f"Failed to query instagram_accounts endpoint for page {page_id}: {ex}")
                        
            if ig_biz_id and target_page_token:
                instagram_details = SocialPublishService.verify_connection("instagram", {
                    "instagram_access_token": target_page_token,
                    "instagram_business_id": ig_biz_id
                })
            
            if platform == "instagram" and not instagram_details:
                raise ValueError(
                    "Could not find an Instagram Professional account linked to your Facebook Page(s). "
                    "Please ensure your Instagram account is switched to Professional (Creator or Business) "
                    "and linked to your Facebook Page in Page Settings > Linked Accounts > Instagram."
                )
                
            # Save connections that we resolved
            if facebook_details:
                save_connection("facebook", facebook_details)
            if instagram_details:
                save_connection("instagram", instagram_details)

    except Exception as e:
        logger.error(f"Error during {platform} OAuth callback: {e}", exc_info=True)
        err_msg_clean = str(e)
        if getattr(settings, "META_APP_SECRET", None) and settings.META_APP_SECRET in err_msg_clean:
            err_msg_clean = err_msg_clean.replace(settings.META_APP_SECRET, "[REDACTED]")
        return _render_oauth_callback_html(
            status="error",
            platform=platform,
            title=f"Could Not Connect {platform.capitalize()}",
            message="We were unable to complete the account connection with the provider.",
            details=err_msg_clean
        )

    return _render_oauth_callback_html(
        status="success",
        platform=platform,
        title=f"{platform.capitalize()} Connected!",
        message=f"Your {platform.capitalize()} account was linked successfully to Harvest AI."
    )

