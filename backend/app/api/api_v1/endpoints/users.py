from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app import models, schemas
from passlib.context import CryptContext
from urllib.parse import urlencode
import requests
from app.core.config import settings

router = APIRouter()
# bcrypt silently truncates at 72 bytes — we do it explicitly to avoid errors
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

def _safe_hash(password: str) -> str:
    """Truncate to 72 bytes before hashing (bcrypt hard limit)."""
    return pwd_context.hash(password.encode("utf-8")[:72].decode("utf-8", errors="ignore"))

@router.post("/", response_model=schemas.User)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = _safe_hash(user.password)
    db_user = models.User(
        email=user.email,
        full_name=user.full_name,
        hashed_password=hashed_password,
        is_active=user.is_active
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@router.get("/", response_model=List[schemas.User])
def read_users(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    users = db.query(models.User).offset(skip).limit(limit).all()
    return users

@router.get("/{user_id}/connections", response_model=List[schemas.SocialConnection])
def read_user_connections(user_id: int, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        # Return empty list if user doesn't exist yet (will get created on connect)
        return []
    return db_user.social_connections

@router.post("/{user_id}/connections", response_model=schemas.SocialConnection)
def create_or_update_user_connection(
    user_id: int,
    connection_in: schemas.SocialConnectionCreate,
    db: Session = Depends(get_db)
):
    from app.services.social_publish_service import SocialPublishService
    
    # Verify the connection credentials before saving
    try:
        verified_info = SocialPublishService.verify_connection(
            connection_in.platform, connection_in.credentials
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        db_user = models.User(
            id=user_id,
            email=f"user{user_id}@harvest.ai",
            full_name="Harvest User",
            hashed_password="placeholder_hash"
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)

    conn = db.query(models.SocialConnection).filter(
        models.SocialConnection.user_id == user_id,
        models.SocialConnection.platform == connection_in.platform
    ).first()

    if conn:
        conn.account_name = verified_info["account_name"]
        conn.account_handle = verified_info["account_handle"]
        conn.account_avatar = verified_info["account_avatar"]
        conn.credentials = verified_info["credentials"]
    else:
        conn = models.SocialConnection(
            user_id=user_id,
            platform=connection_in.platform,
            account_name=verified_info["account_name"],
            account_handle=verified_info["account_handle"],
            account_avatar=verified_info["account_avatar"],
            credentials=verified_info["credentials"]
        )
        db.add(conn)

    db.commit()
    db.refresh(conn)
    return conn

@router.delete("/{user_id}/connections/{platform}")
def delete_user_connection(user_id: int, platform: str, db: Session = Depends(get_db)):
    conn = db.query(models.SocialConnection).filter(
        models.SocialConnection.user_id == user_id,
        models.SocialConnection.platform == platform
    ).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Social connection not found")
    db.delete(conn)
    db.commit()
    return {"message": f"Successfully disconnected {platform}"}

# -------------------------------------------------------------
# OAuth Helper Functions and Routes
# -------------------------------------------------------------

def _render_config_error_page(platform: str, missing_keys: list) -> HTMLResponse:
    keys_str = ", ".join([f"<code>{k}</code>" for k in missing_keys])
    html = f"""
    <html>
        <head>
            <title>OAuth Configuration Required</title>
            <style>
                body {{
                    background-color: #0d0d12;
                    color: #ffffff;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    margin: 0;
                }}
                .card {{
                    background: #13131c;
                    border: 1px solid rgba(239, 68, 68, 0.2);
                    border-radius: 16px;
                    padding: 30px;
                    max-width: 460px;
                    width: 100%;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                    text-align: center;
                }}
                h2 {{ color: #f87171; margin-top: 0; }}
                p {{ color: #94a3b8; font-size: 0.9rem; line-height: 1.5; }}
                code {{ background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; font-family: monospace; color: #f472b6; }}
            </style>
        </head>
        <body>
            <div class="card">
                <h2>OAuth Configuration Required</h2>
                <p>To enable real-time authentication for <strong>{platform.capitalize()}</strong>, please define the following environment variables in your backend <code>.env</code> file:</p>
                <p>{keys_str}</p>
                <p>Once added, restart the backend server and click Connect again.</p>
            </div>
        </body>
    </html>
    """
    return HTMLResponse(content=html, status_code=400)

def _render_auth_success_page(platform: str) -> HTMLResponse:
    html = f"""
    <html>
        <head>
            <title>Authentication Successful</title>
            <style>
                body {{
                    background-color: #0d0d12;
                    color: #ffffff;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    margin: 0;
                    text-align: center;
                }}
                .card {{
                    background: #13131c;
                    border: 1px solid rgba(16, 185, 129, 0.2);
                    border-radius: 16px;
                    padding: 30px;
                    max-width: 400px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                }}
                h2 {{ color: #10b981; margin-top: 0; }}
                p {{ color: #94a3b8; font-size: 0.9rem; }}
            </style>
        </head>
        <body>
            <div class="card">
                <div style="font-size: 3rem; margin-bottom: 15px;">✨</div>
                <h2>Connection Successful!</h2>
                <p>Your {platform.capitalize()} account was connected successfully in real-time.</p>
                <p style="font-size: 0.75rem; color: #64748b;">Closing window...</p>
            </div>
            <script>
                if (window.opener) {{
                    window.opener.postMessage({{
                        type: 'HARVEST_AUTH_SUCCESS',
                        platform: '{platform}'
                    }}, '*');
                }}
                setTimeout(() => window.close(), 1200);
            </script>
        </body>
    </html>
    """
    return HTMLResponse(content=html)

def _save_connection(db: Session, user_id: int, platform: str, name: str, handle: str, avatar: str, credentials: dict):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        db_user = models.User(
            id=user_id,
            email=f"user{user_id}@harvest.ai",
            full_name="Harvest User",
            hashed_password="placeholder_hash"
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)

    conn = db.query(models.SocialConnection).filter(
        models.SocialConnection.user_id == user_id,
        models.SocialConnection.platform == platform
    ).first()

    if conn:
        conn.account_name = name
        conn.account_handle = handle
        conn.account_avatar = avatar
        conn.credentials = credentials
    else:
        conn = models.SocialConnection(
            user_id=user_id,
            platform=platform,
            account_name=name,
            account_handle=handle,
            account_avatar=avatar,
            credentials=credentials
        )
        db.add(conn)
    db.commit()

@router.get("/auth/youtube/login")
def youtube_login(user_id: int = 1):
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET or "your_google_client_id_here" in settings.GOOGLE_CLIENT_ID:
        return _render_config_error_page("youtube", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"])
    
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
        "access_type": "offline",
        "prompt": "consent",
        "state": str(user_id)
    }
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    return RedirectResponse(auth_url)

@router.get("/auth/youtube/callback", response_class=HTMLResponse)
def youtube_callback(code: str = None, error: str = None, state: str = "1", db: Session = Depends(get_db)):
    if error:
        return HTMLResponse(content=f"<h3>Authentication failed: {error}</h3>", status_code=400)
    if not code:
        return HTMLResponse(content="<h3>Missing authorization code.</h3>", status_code=400)
    
    user_id = int(state)
    
    token_url = "https://oauth2.googleapis.com/token"
    data = {
        "code": code,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code"
    }
    try:
        res = requests.post(token_url, data=data, timeout=15)
        res.raise_for_status()
        token_data = res.json()
        access_token = token_data.get("access_token")
    except Exception as e:
        return HTMLResponse(content=f"<h3>Failed to exchange code: {e}</h3>", status_code=400)
        
    channel_url = "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true"
    headers = {"Authorization": f"Bearer {access_token}"}
    try:
        c_res = requests.get(channel_url, headers=headers, timeout=15)
        c_res.raise_for_status()
        c_data = c_res.json()
        items = c_data.get("items", [])
        if not items:
            return HTMLResponse(content="<h3>No YouTube channel associated with this account.</h3>", status_code=400)
        
        snippet = items[0]["snippet"]
        account_name = snippet.get("title", "YouTube Channel")
        account_handle = snippet.get("customUrl", "@youtube_channel")
        
        account_avatar = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100"
        thumbnails = snippet.get("thumbnails", {})
        for size in ["high", "medium", "default"]:
            if size in thumbnails and thumbnails[size].get("url"):
                account_avatar = thumbnails[size]["url"]
                break
    except Exception as e:
        return HTMLResponse(content=f"<h3>Failed to retrieve channel details: {e}</h3>", status_code=400)
        
    credentials = {"youtube_access_token": access_token}
    if token_data.get("refresh_token"):
        credentials["youtube_refresh_token"] = token_data["refresh_token"]
        
    _save_connection(db, user_id, "youtube", account_name, account_handle, account_avatar, credentials)
    return _render_auth_success_page("youtube")

@router.get("/auth/facebook/login")
def facebook_login(user_id: int = 1):
    if not settings.META_APP_ID or not settings.META_APP_SECRET or "your_meta_app_id_here" in settings.META_APP_ID:
        return _render_config_error_page("facebook", ["META_APP_ID", "META_APP_SECRET"])
    
    params = {
        "client_id": settings.META_APP_ID,
        "redirect_uri": settings.META_REDIRECT_URI,
        "scope": "email,pages_show_list,pages_read_engagement,pages_manage_posts,publish_video",
        "response_type": "code",
        "state": str(user_id)
    }
    auth_url = f"https://www.facebook.com/v20.0/dialog/oauth?{urlencode(params)}"
    return RedirectResponse(auth_url)

@router.get("/auth/facebook/callback", response_class=HTMLResponse)
def facebook_callback(code: str = None, error: str = None, state: str = "1", db: Session = Depends(get_db)):
    if error:
        return HTMLResponse(content=f"<h3>Authentication failed: {error}</h3>", status_code=400)
    if not code:
        return HTMLResponse(content="<h3>Missing authorization code.</h3>", status_code=400)
        
    user_id = int(state)
    
    token_url = "https://graph.facebook.com/v20.0/oauth/access_token"
    params = {
        "client_id": settings.META_APP_ID,
        "redirect_uri": settings.META_REDIRECT_URI,
        "client_secret": settings.META_APP_SECRET,
        "code": code
    }
    try:
        res = requests.get(token_url, params=params, timeout=15)
        res.raise_for_status()
        token_data = res.json()
        user_access_token = token_data.get("access_token")
    except Exception as e:
        return HTMLResponse(content=f"<h3>Failed to exchange code: {e}</h3>", status_code=400)
        
    pages_url = "https://graph.facebook.com/v20.0/me/accounts"
    pages_params = {
        "fields": "name,username,picture,access_token",
        "access_token": user_access_token
    }
    try:
        p_res = requests.get(pages_url, params=pages_params, timeout=15)
        p_res.raise_for_status()
        pages_data = p_res.json().get("data", [])
        if not pages_data:
            return HTMLResponse(content="<h3>No Facebook Pages linked to this Meta account. Facebook Reels requires a Page to publish.</h3>", status_code=400)
        
        page = pages_data[0]
        page_id = page["id"]
        page_name = page["name"]
        page_access_token = page["access_token"]
        page_username = page.get("username", f"page_{page_id}")
        page_handle = f"@{page_username}"
        
        page_avatar = "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=100"
        pic_url = page.get("picture", {}).get("data", {}).get("url")
        if pic_url:
            page_avatar = pic_url
    except Exception as e:
        return HTMLResponse(content=f"<h3>Failed to query Facebook Pages: {e}</h3>", status_code=400)
        
    credentials = {
        "facebook_access_token": page_access_token,
        "facebook_page_id": page_id
    }
    _save_connection(db, user_id, "facebook", page_name, page_handle, page_avatar, credentials)
    return _render_auth_success_page("facebook")

@router.get("/auth/instagram/login")
def instagram_login(user_id: int = 1):
    if not settings.META_APP_ID or not settings.META_APP_SECRET or "your_meta_app_id_here" in settings.META_APP_ID:
        return _render_config_error_page("instagram", ["META_APP_ID", "META_APP_SECRET"])
    
    params = {
        "client_id": settings.META_APP_ID,
        "redirect_uri": settings.INSTAGRAM_REDIRECT_URI,
        "scope": "email,pages_show_list,pages_read_engagement,instagram_basic,instagram_content_publish",
        "response_type": "code",
        "state": str(user_id)
    }
    auth_url = f"https://www.facebook.com/v20.0/dialog/oauth?{urlencode(params)}"
    return RedirectResponse(auth_url)

@router.get("/auth/instagram/callback", response_class=HTMLResponse)
def instagram_callback(code: str = None, error: str = None, state: str = "1", db: Session = Depends(get_db)):
    if error:
        return HTMLResponse(content=f"<h3>Authentication failed: {error}</h3>", status_code=400)
    if not code:
        return HTMLResponse(content="<h3>Missing authorization code.</h3>", status_code=400)
        
    user_id = int(state)
    
    token_url = "https://graph.facebook.com/v20.0/oauth/access_token"
    params = {
        "client_id": settings.META_APP_ID,
        "redirect_uri": settings.INSTAGRAM_REDIRECT_URI,
        "client_secret": settings.META_APP_SECRET,
        "code": code
    }
    try:
        res = requests.get(token_url, params=params, timeout=15)
        res.raise_for_status()
        token_data = res.json()
        user_access_token = token_data.get("access_token")
    except Exception as e:
        return HTMLResponse(content=f"<h3>Failed to exchange code: {e}</h3>", status_code=400)
        
    pages_url = "https://graph.facebook.com/v20.0/me/accounts"
    pages_params = {
        "fields": "instagram_business_account{id,name,username,profile_picture_url}",
        "access_token": user_access_token
    }
    try:
        p_res = requests.get(pages_url, params=pages_params, timeout=15)
        p_res.raise_for_status()
        pages_data = p_res.json().get("data", [])
        
        instagram_business_id = None
        ig_name = None
        ig_username = None
        ig_avatar = None
        
        for p in pages_data:
            ig_acct = p.get("instagram_business_account")
            if ig_acct:
                instagram_business_id = ig_acct["id"]
                ig_name = ig_acct.get("name", "Instagram Business")
                ig_username = ig_acct.get("username", "instagram_account")
                ig_avatar = ig_acct.get("profile_picture_url")
                break
                
        if not instagram_business_id:
            return HTMLResponse(content="<h3>No Instagram Business Account linked to your Facebook Pages. Verify your Meta accounts are properly linked.</h3>", status_code=400)
            
        ig_handle = f"@{ig_username}"
        if not ig_avatar:
            ig_avatar = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100"
    except Exception as e:
        return HTMLResponse(content=f"<h3>Failed to query Instagram Business Accounts: {e}</h3>", status_code=400)
        
    credentials = {
        "instagram_access_token": user_access_token,
        "instagram_business_id": instagram_business_id,
        "public_video_url": settings.PUBLIC_VIDEO_URL
    }
    _save_connection(db, user_id, "instagram", ig_name, ig_handle, ig_avatar, credentials)
    return _render_auth_success_page("instagram")
