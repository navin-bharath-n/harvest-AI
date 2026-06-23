from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app import models, schemas

router = APIRouter()

@router.get("/{user_id}/connections", response_model=List[schemas.SocialConnection])
def read_user_connections(
    user_id: int,
    db: Session = Depends(get_db)
):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

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
    db: Session = Depends(get_db)
):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

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
    db: Session = Depends(get_db)
):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    db_conn = db.query(models.SocialConnection).filter(
        models.SocialConnection.user_id == user_id,
        models.SocialConnection.platform == platform
    ).first()

    if not db_conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    db.delete(db_conn)
    db.commit()
    return {"message": f"Successfully disconnected platform {platform}"}

@router.get("/auth/{platform}/login")
def platform_login(
    platform: str,
    user_id: int,
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
        auth_url = (
            "https://accounts.google.com/o/oauth2/v2/auth"
            "?response_type=code"
            f"&client_id={settings.GOOGLE_CLIENT_ID}"
            f"&redirect_uri={settings.GOOGLE_REDIRECT_URI}"
            "&scope=https://www.googleapis.com/auth/youtube.upload%20https://www.googleapis.com/auth/youtube.readonly"
            f"&state={user_id}"
            "&access_type=offline&prompt=consent"
        )
        return RedirectResponse(url=auth_url)

    elif platform in ("facebook", "instagram"):
        redirect_uri = settings.META_REDIRECT_URI if platform == "facebook" else settings.INSTAGRAM_REDIRECT_URI
        scope = "pages_show_list,pages_read_engagement,pages_manage_posts,publish_video"
        if platform == "instagram":
            scope += ",instagram_basic,instagram_content_publish"
            
        auth_url = (
            "https://www.facebook.com/v20.0/dialog/oauth"
            f"?client_id={settings.META_APP_ID}"
            f"&redirect_uri={redirect_uri}"
            f"&scope={scope}"
            f"&state={user_id}"
        )
        return RedirectResponse(url=auth_url)

    raise HTTPException(status_code=400, detail=f"Unsupported login platform: {platform}")

@router.get("/auth/{platform}/callback", response_class=HTMLResponse)
def platform_callback(
    platform: str,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    error_code: Optional[int] = None,
    error_message: Optional[str] = None,
    error_description: Optional[str] = None,
    db: Session = Depends(get_db)
):
    if error or error_message or error_description:
        err_msg = error_message or error_description or error or "Unknown OAuth error"
        return f"""
        <html>
          <body>
            <script>
              window.opener.postMessage({{
                type: 'HARVEST_AUTH_FAILURE',
                error: '{err_msg}'
              }}, '*');
              window.close();
            </script>
          </body>
        </html>
        """

    if not state:
        raise HTTPException(status_code=400, detail="Missing state parameter")

    user_id = int(state)
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    # Standard Live OAuth Token Exchange
    if code == "mock_code":
        raise HTTPException(status_code=400, detail="Mock authentication code is disabled. Real connection is required.")

    import requests
    from app.core.config import settings
    
    try:
        if platform == "youtube":
            token_url = "https://oauth2.googleapis.com/token"
            data = {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": settings.GOOGLE_REDIRECT_URI
            }
            res = requests.post(token_url, data=data, timeout=15)
            res.raise_for_status()
            tokens = res.json()
            access_token = tokens.get("access_token")
            refresh_token = tokens.get("refresh_token")
            
            from app.services.social_publish_service import SocialPublishService
            details = SocialPublishService.verify_connection("youtube", {
                "youtube_access_token": access_token,
                "youtube_refresh_token": refresh_token
            })
            
        elif platform in ("facebook", "instagram"):
            redirect_uri = settings.META_REDIRECT_URI if platform == "facebook" else settings.INSTAGRAM_REDIRECT_URI
            token_url = "https://graph.facebook.com/v20.0/oauth/access_token"
            params = {
                "client_id": settings.META_APP_ID,
                "client_secret": settings.META_APP_SECRET,
                "redirect_uri": redirect_uri,
                "code": code
            }
            res = requests.get(token_url, params=params, timeout=15)
            res.raise_for_status()
            tokens = res.json()
            access_token = tokens.get("access_token")
            
            from app.services.social_publish_service import SocialPublishService
            if platform == "facebook":
                pages_url = "https://graph.facebook.com/v20.0/me/accounts"
                p_res = requests.get(pages_url, params={"access_token": access_token}, timeout=15)
                p_res.raise_for_status()
                pages_data = p_res.json().get("data", [])
                if not pages_data:
                    raise ValueError("No Facebook Pages linked to this Meta account.")
                page_token = pages_data[0]["access_token"]
                page_id = pages_data[0]["id"]
                
                details = SocialPublishService.verify_connection("facebook", {
                    "facebook_access_token": page_token,
                    "facebook_page_id": page_id
                })
            else:
                # For Instagram, we must find the Page linked to Instagram and use its Page Access Token
                pages_url = "https://graph.facebook.com/v20.0/me/accounts"
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
                
                target_page_token = None
                ig_biz_id = None
                
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
                        
                if not ig_biz_id or not target_page_token:
                    raise ValueError(
                        "Could not find any Facebook Page linked to an Instagram Business account. "
                        "Please ensure your Instagram account is linked to your Facebook Page in Page settings."
                    )
                    
                details = SocialPublishService.verify_connection("instagram", {
                    "instagram_access_token": target_page_token,
                    "instagram_business_id": ig_biz_id
                })

        # Save Live Connection to DB
        db_conn = db.query(models.SocialConnection).filter(
            models.SocialConnection.user_id == user_id,
            models.SocialConnection.platform == platform
        ).first()

        new_credentials = details["credentials"] or {}
        if db_conn:
            # Preserve refresh token if the new exchange didn't return one
            existing_credentials = db_conn.credentials or {}
            if platform == "youtube" and not new_credentials.get("youtube_refresh_token") and existing_credentials.get("youtube_refresh_token"):
                new_credentials["youtube_refresh_token"] = existing_credentials["youtube_refresh_token"]
            
            db_conn.account_name = details["account_name"]
            db_conn.account_handle = details["account_handle"]
            db_conn.account_avatar = details["account_avatar"]
            db_conn.credentials = new_credentials
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(db_conn, "credentials")
        else:
            db_conn = models.SocialConnection(
                user_id=user_id,
                platform=platform,
                account_name=details["account_name"],
                account_handle=details["account_handle"],
                account_avatar=details["account_avatar"],
                credentials=new_credentials
            )
            db.add(db_conn)
        db.commit()

    except Exception as e:
        error_msg = str(e).replace("'", "\\'")
        return f"""
        <html>
          <body>
            <script>
              window.opener.postMessage({{
                type: 'HARVEST_AUTH_FAILURE',
                error: '{error_msg}'
              }}, '*');
              window.close();
            </script>
          </body>
        </html>
        """

    return f"""
    <html>
      <body>
        <script>
          window.opener.postMessage({{
            type: 'HARVEST_AUTH_SUCCESS',
            platform: '{platform}'
          }}, '*');
          window.close();
        </script>
      </body>
    </html>
    """
