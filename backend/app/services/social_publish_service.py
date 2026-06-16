import os
import time
import logging
import requests
from app.core.config import settings

logger = logging.getLogger(__name__)

class SocialPublishService:
    @staticmethod
    def verify_connection(platform: str, credentials: dict) -> dict:
        """
        Verifies credentials with the respective platform API and retrieves profile details.
        Returns a dict with: { "account_name": ..., "account_handle": ..., "account_avatar": ..., "credentials": ... }
        Raises ValueError if verification fails.
        """
        if not credentials:
            credentials = {}
        elif not isinstance(credentials, dict):
            credentials = dict(credentials)

        is_sandbox = credentials.get("is_sandbox", False)
        if is_sandbox:
            mock_accounts = {
                "youtube": {
                    "account_name": "Harvest AI Studio (Sandbox)",
                    "account_handle": "@HarvestAI_Shorts",
                    "account_avatar": "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=60",
                    "credentials": {"is_sandbox": True}
                },
                "facebook": {
                    "account_name": "Viral Content Hub (Sandbox)",
                    "account_handle": "@viral_content_fb",
                    "account_avatar": "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=100&auto=format&fit=crop&q=60",
                    "credentials": {"is_sandbox": True}
                },
                "instagram": {
                    "account_name": "ai_clip_generator (Sandbox)",
                    "account_handle": "@ai_clip_generator",
                    "account_avatar": "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=60",
                    "credentials": {"is_sandbox": True}
                }
            }
            if platform not in mock_accounts:
                raise ValueError(f"Unsupported platform: {platform}")
            return mock_accounts[platform]

        if platform == "youtube":
            access_token = credentials.get("youtube_access_token")
            if not access_token:
                access_token = settings.YOUTUBE_ACCESS_TOKEN
            
            if not access_token:
                raise ValueError("No YouTube access token provided.")
            
            url = "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true"
            headers = {"Authorization": f"Bearer {access_token}"}
            try:
                response = requests.get(url, headers=headers, timeout=15)
                if response.status_code == 401:
                    raise ValueError("Invalid or expired YouTube access token.")
                response.raise_for_status()
                data = response.json()
                items = data.get("items", [])
                if not items:
                    raise ValueError("No YouTube channel found for these credentials.")
                
                snippet = items[0]["snippet"]
                name = snippet.get("title", "YouTube Channel")
                handle = snippet.get("customUrl", "@youtube_channel")
                
                avatar = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100"
                thumbnails = snippet.get("thumbnails", {})
                for size in ["high", "medium", "default"]:
                    if size in thumbnails and thumbnails[size].get("url"):
                        avatar = thumbnails[size]["url"]
                        break
                        
                return {
                    "account_name": name,
                    "account_handle": handle,
                    "account_avatar": avatar,
                    "credentials": {"youtube_access_token": access_token}
                }
            except requests.RequestException as e:
                err_detail = ""
                try:
                    err_detail = f" - {response.json().get('error', {}).get('message', '')}"
                except:
                    pass
                raise ValueError(f"Google API error: {e}{err_detail}")

        elif platform == "facebook":
            access_token = credentials.get("facebook_access_token")
            page_id = credentials.get("facebook_page_id")
            
            if not access_token:
                access_token = settings.FACEBOOK_ACCESS_TOKEN
            if not page_id:
                page_id = settings.FACEBOOK_PAGE_ID
                
            if not access_token or not page_id:
                raise ValueError("Facebook access token and Page ID are required.")
                
            url = f"https://graph.facebook.com/v20.0/{page_id}"
            params = {
                "fields": "name,username,picture",
                "access_token": access_token
            }
            try:
                response = requests.get(url, params=params, timeout=15)
                if response.status_code == 400:
                    err_msg = response.json().get("error", {}).get("message", "Invalid Page ID or access token.")
                    raise ValueError(f"Facebook Graph API error: {err_msg}")
                response.raise_for_status()
                data = response.json()
                
                name = data.get("name", "Facebook Page")
                username = data.get("username")
                handle = f"@{username}" if username else "Facebook Page"
                
                avatar = "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=100"
                picture_data = {}
                if isinstance(data.get("picture"), dict):
                    picture_data = data["picture"].get("data", {})
                if picture_data.get("url"):
                    avatar = picture_data["url"]
                    
                return {
                    "account_name": name,
                    "account_handle": handle,
                    "account_avatar": avatar,
                    "credentials": {
                        "facebook_access_token": access_token,
                        "facebook_page_id": page_id
                    }
                }
            except requests.RequestException as e:
                raise ValueError(f"Meta API error: {e}")

        elif platform == "instagram":
            access_token = credentials.get("instagram_access_token")
            instagram_business_id = credentials.get("instagram_business_id")
            public_video_url = credentials.get("public_video_url")
            
            if not access_token:
                access_token = settings.INSTAGRAM_ACCESS_TOKEN
            if not instagram_business_id:
                instagram_business_id = settings.INSTAGRAM_BUSINESS_ID
            if not public_video_url:
                public_video_url = settings.PUBLIC_VIDEO_URL
                
            if not access_token or not instagram_business_id:
                raise ValueError("Instagram access token and Business Account ID are required.")
                
            url = f"https://graph.facebook.com/v20.0/{instagram_business_id}"
            params = {
                "fields": "name,username,profile_picture_url",
                "access_token": access_token
            }
            try:
                response = requests.get(url, params=params, timeout=15)
                if response.status_code == 400:
                    err_msg = response.json().get("error", {}).get("message", "Invalid Business Account ID or access token.")
                    raise ValueError(f"Instagram Graph API error: {err_msg}")
                response.raise_for_status()
                data = response.json()
                
                name = data.get("name", "Instagram Business Account")
                username = data.get("username")
                handle = f"@{username}" if username else "Instagram Account"
                avatar = data.get("profile_picture_url", "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100")
                
                return {
                    "account_name": name,
                    "account_handle": handle,
                    "account_avatar": avatar,
                    "credentials": {
                        "instagram_access_token": access_token,
                        "instagram_business_id": instagram_business_id,
                        "public_video_url": public_video_url
                    }
                }
            except requests.RequestException as e:
                raise ValueError(f"Meta API error: {e}")
        else:
            raise ValueError(f"Unsupported platform for verification: {platform}")

    @staticmethod
    def publish_clip(video_path: str, platform: str, config: dict) -> dict:
        """
        Main entry point for publishing a video clip to a social media platform.
        Dispatches to the appropriate helper based on the platform.
        """
        title = config.get("title", "AI Shorts Highlight")
        description = config.get("description", "Check out this highlight clip generated by Harvest AI!")
        privacy = config.get("privacy", "public")

        logger.info(f"SocialPublishService: Request to publish to {platform} (File: {video_path})")

        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found at path: {video_path}")

        if platform == "youtube":
            return SocialPublishService._publish_to_youtube(video_path, title, description, privacy, config)
        elif platform == "facebook":
            return SocialPublishService._publish_to_facebook(video_path, description, config)
        elif platform == "instagram":
            return SocialPublishService._publish_to_instagram(video_path, description, config)
        else:
            raise ValueError(f"Unsupported publishing platform: {platform}")

    @staticmethod
    def _publish_to_youtube(video_path: str, title: str, description: str, privacy: str, config: dict) -> dict:
        access_token = config.get("youtube_access_token") or settings.YOUTUBE_ACCESS_TOKEN
        is_sandbox = config.get("is_sandbox", False)
        
        # Fallback to high-fidelity mock if credentials are not present or sandbox mode is active
        if is_sandbox or not access_token:
            logger.info("YouTube OAuth token not provided or sandbox mode enabled. Executing mock simulation...")
            SocialPublishService._simulate_upload_timeline("youtube", video_path, title, description)
            return {
                "status": "success",
                "platform": "youtube",
                "mocked": True,
                "video_url": "https://youtube.com/shorts/mock_shorts_id"
            }

        logger.info("Initiating real YouTube resumable upload...")
        try:
            # Step 1: Initial POST request to register metadata and receive upload URI
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json; charset=UTF-8"
            }
            body = {
                "snippet": {
                    "title": title[:100],  # YouTube titles max 100 chars
                    "description": description,
                    "categoryId": "22"  # People & Blogs category
                },
                "status": {
                    "privacyStatus": privacy.lower(),
                    "selfDeclaredMadeForKids": False
                }
            }
            init_url = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status"
            response = requests.post(init_url, headers=headers, json=body, timeout=30)
            response.raise_for_status()
            
            upload_url = response.headers.get("Location")
            if not upload_url:
                raise ValueError("YouTube API failed to return resumable Location header.")

            # Step 2: Upload raw video data binary chunks
            logger.info("Uploading video binary stream to YouTube endpoint...")
            file_size = os.path.getsize(video_path)
            with open(video_path, "rb") as f:
                video_data = f.read()

            headers_put = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "video/mp4",
                "Content-Length": str(file_size)
            }
            put_response = requests.put(upload_url, headers=headers_put, data=video_data, timeout=120)
            put_response.raise_for_status()
            
            res_data = put_response.json()
            video_id = res_data.get("id")
            logger.info(f"YouTube upload complete! Video ID: {video_id}")
            
            return {
                "status": "success",
                "platform": "youtube",
                "mocked": False,
                "video_id": video_id,
                "video_url": f"https://youtube.com/shorts/{video_id}"
            }
        except Exception as e:
            logger.error(f"YouTube publishing API failed: {e}", exc_info=True)
            raise

    @staticmethod
    def _publish_to_facebook(video_path: str, description: str, config: dict) -> dict:
        access_token = config.get("facebook_access_token") or settings.FACEBOOK_ACCESS_TOKEN
        page_id = config.get("facebook_page_id") or settings.FACEBOOK_PAGE_ID
        is_sandbox = config.get("is_sandbox", False)

        if is_sandbox or not access_token or not page_id:
            logger.info("Facebook Page token or ID not provided or sandbox mode enabled. Executing mock simulation...")
            SocialPublishService._simulate_upload_timeline("facebook", video_path, None, description)
            return {
                "status": "success",
                "platform": "facebook",
                "mocked": True,
                "video_url": "https://facebook.com/reel/mock_reel_id"
            }

        logger.info(f"Initiating Facebook Graph API Page video upload (Page ID: {page_id})...")
        try:
            # Facebook supports multi-part POST uploads directly to /page_id/videos
            url = f"https://graph.facebook.com/v20.0/{page_id}/videos"
            with open(video_path, "rb") as f:
                files = {"source": f}
                data = {
                    "description": description,
                    "access_token": access_token
                }
                response = requests.post(url, files=files, data=data, timeout=120)
                response.raise_for_status()

            res_data = response.json()
            fb_video_id = res_data.get("id")
            logger.info(f"Facebook upload complete! Video ID: {fb_video_id}")

            return {
                "status": "success",
                "platform": "facebook",
                "mocked": False,
                "video_id": fb_video_id,
                "video_url": f"https://facebook.com/watch/?v={fb_video_id}"
            }
        except Exception as e:
            logger.error(f"Facebook publishing Graph API failed: {e}", exc_info=True)
            raise

    @staticmethod
    def _publish_to_instagram(video_path: str, caption: str, config: dict) -> dict:
        access_token = config.get("instagram_access_token") or settings.INSTAGRAM_ACCESS_TOKEN
        instagram_business_id = config.get("instagram_business_id") or settings.INSTAGRAM_BUSINESS_ID
        video_url = config.get("public_video_url") or settings.PUBLIC_VIDEO_URL
        is_sandbox = config.get("is_sandbox", False)

        # If no access tokens or page details, fall back to mock
        if is_sandbox or not access_token or not instagram_business_id:
            logger.info("Instagram token or business account ID not provided or sandbox mode enabled. Executing mock simulation...")
            SocialPublishService._simulate_upload_timeline("instagram", video_path, None, caption)
            return {
                "status": "success",
                "platform": "instagram",
                "mocked": True,
                "video_url": "https://instagram.com/reel/mock_reel_id"
            }

        # Instagram Reels requires a publicly accessible CDN/HTTP link so Meta servers can index/download it.
        # If the user didn't specify a public_video_url (e.g. they are on localhost), we explain and simulate.
        if not video_url:
            logger.warning("Instagram Reels API requires a publicly accessible video URL. Local file path cannot be reached by Meta servers. Simulating fallback...")
            SocialPublishService._simulate_upload_timeline("instagram", video_path, None, caption)
            return {
                "status": "success",
                "platform": "instagram",
                "mocked": True,
                "note": "Local video URL not accessible by Meta servers. Mocked successfully.",
                "video_url": "https://instagram.com/reel/mock_reel_id"
            }

        logger.info(f"Initiating Instagram Reels container upload (ID: {instagram_business_id})...")
        try:
            # Step 1: Create media container
            url_container = f"https://graph.facebook.com/v20.0/{instagram_business_id}/media"
            params_container = {
                "media_type": "REELS",
                "video_url": video_url,
                "caption": caption,
                "access_token": access_token
            }
            response = requests.post(url_container, params=params_container, timeout=30)
            response.raise_for_status()
            container_id = response.json().get("id")

            # Step 2: Poll container status until fully processed (usually completed in seconds to minutes)
            logger.info("Polling Instagram Reels container render status...")
            url_status = f"https://graph.facebook.com/v20.0/{container_id}"
            params_status = {
                "fields": "status_code",
                "access_token": access_token
            }
            
            for attempt in range(15):
                time.sleep(3.0)
                status_res = requests.get(url_status, params=params_status, timeout=15)
                status_res.raise_for_status()
                status_code = status_res.json().get("status_code")
                logger.info(f"Instagram container render state: {status_code}")
                if status_code == "FINISHED":
                    break
                elif status_code == "ERROR":
                    raise ValueError("Instagram Reels container processing failed.")
            else:
                raise TimeoutError("Instagram container processing timed out.")

            # Step 3: Publish container
            logger.info("Publishing Instagram Reels media container...")
            url_publish = f"https://graph.facebook.com/v20.0/{instagram_business_id}/media_publish"
            params_publish = {
                "creation_id": container_id,
                "access_token": access_token
            }
            publish_res = requests.post(url_publish, params=params_publish, timeout=30)
            publish_res.raise_for_status()
            ig_media_id = publish_res.json().get("id")
            
            logger.info(f"Instagram Reel published successfully! Media ID: {ig_media_id}")
            return {
                "status": "success",
                "platform": "instagram",
                "mocked": False,
                "media_id": ig_media_id,
                "video_url": "https://instagram.com/reels/"  # Default profile reel view link
            }
        except Exception as e:
            logger.error(f"Instagram publishing Graph API failed: {e}", exc_info=True)
            raise

    @staticmethod
    def _simulate_upload_timeline(platform: str, video_path: str, title: str, description: str):
        """
        Realistic upload timing simulation for testing and local sandbox environments.
        """
        logger.info(f"[{platform.upper()} MOCK] Initializing connection handshake...")
        time.sleep(1.0)
        
        logger.info(f"[{platform.upper()} MOCK] Transmitting binary chunks of '{video_path}'...")
        time.sleep(1.5)
        
        if title:
            logger.info(f"[{platform.upper()} MOCK] Syncing metadata: Title='{title}' | Description='{description}'...")
        else:
            logger.info(f"[{platform.upper()} MOCK] Syncing metadata: Description='{description}'...")
        time.sleep(1.0)
        
        logger.info(f"[{platform.upper()} MOCK] Successfully published!")
