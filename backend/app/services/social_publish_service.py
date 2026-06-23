import os
import time
import logging
import requests
from app.core.config import settings

logger = logging.getLogger(__name__)

class SocialPublishService:
    @staticmethod
    def refresh_youtube_token(refresh_token: str) -> str:
        """
        Refreshes the YouTube access token using the stored refresh token.
        Returns the new access token, or raises ValueError if refresh fails.
        """
        if not refresh_token:
            raise ValueError("No refresh token available.")
            
        url = "https://oauth2.googleapis.com/token"
        data = {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token"
        }
        try:
            response = requests.post(url, data=data, timeout=15)
            response.raise_for_status()
            tokens = response.json()
            return tokens.get("access_token")
        except requests.RequestException as e:
            err_detail = ""
            try:
                err_detail = f" - {response.json().get('error_description', response.json().get('error', ''))}"
            except:
                pass
            raise ValueError(f"Failed to refresh YouTube access token: {e}{err_detail}")

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

        if platform == "youtube":
            access_token = credentials.get("youtube_access_token")
            refresh_token = credentials.get("youtube_refresh_token")
            if not access_token:
                access_token = settings.YOUTUBE_ACCESS_TOKEN
            
            if not access_token:
                raise ValueError("No YouTube access token provided.")
            
            url = "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true"
            headers = {"Authorization": f"Bearer {access_token}"}
            try:
                response = requests.get(url, headers=headers, timeout=15)
                if response.status_code == 401 and refresh_token:
                    logger.info("Access token expired (401). Attempting to refresh token...")
                    try:
                        access_token = SocialPublishService.refresh_youtube_token(refresh_token)
                        headers = {"Authorization": f"Bearer {access_token}"}
                        response = requests.get(url, headers=headers, timeout=15)
                    except Exception as re:
                        logger.warning(f"YouTube token refresh failed during verification: {re}")

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
                    "credentials": {
                        "youtube_access_token": access_token,
                        "youtube_refresh_token": refresh_token
                    }
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
                
            if not access_token:
                raise ValueError("Instagram access token is required.")

            # Dynamically resolve instagram_business_id if missing
            if not instagram_business_id:
                logger.info("Instagram Business ID is missing. Attempting to resolve dynamically from connected pages...")
                try:
                    pages_url = "https://graph.facebook.com/v20.0/me/accounts"
                    pages_params = {
                        "fields": "name,access_token,instagram_business_account{id,name,username,profile_picture_url}",
                        "access_token": access_token
                    }
                    p_res = requests.get(pages_url, params=pages_params, timeout=15)
                    p_res.raise_for_status()
                    pages_data = p_res.json().get("data", [])
                    
                    if not pages_data:
                        raise ValueError(
                            "Meta API returned no Facebook Pages for this account. "
                            "Please make sure your Facebook account has a Page and that you selected it during the login flow."
                        )
                    
                    pages_with_no_ig = []
                    for p in pages_data:
                        page_name = p.get("name", "Unknown Page")
                        ig_acct = p.get("instagram_business_account")
                        if ig_acct:
                            instagram_business_id = ig_acct["id"]
                            logger.info(f"Dynamically resolved Instagram Business Account ID: {instagram_business_id}")
                            break
                        
                        # Fallback query /{page_id}/instagram_accounts
                        page_id = p.get("id")
                        page_token = p.get("access_token")
                        if page_id and page_token:
                            logger.info(f"Page '{page_name}' did not return inline IG account in verification. Querying /{page_id}/instagram_accounts fallback...")
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
                                        instagram_business_id = ig_data[0]["id"]
                                        logger.info(f"Successfully resolved Instagram Business Account ID '{instagram_business_id}' via page verification fallback.")
                                        break
                            except Exception as ex:
                                logger.warning(f"Failed to query instagram_accounts endpoint for page {page_id} in verification: {ex}")
                        
                        pages_with_no_ig.append(page_name)
                    else:
                        raise ValueError(
                            f"Your Facebook Pages ({', '.join(pages_with_no_ig)}) were found, but none of them "
                            "are linked to an Instagram Business account. Please link your Instagram Business "
                            "account to your Page under Facebook Page Settings."
                        )
                except requests.RequestException as re:
                    err_msg = str(re)
                    try:
                        err_msg = re.response.json().get("error", {}).get("message", err_msg)
                    except:
                        pass
                    raise ValueError(f"Failed to query Facebook Pages from Meta API: {err_msg}")
                
            url = f"https://graph.facebook.com/v20.0/{instagram_business_id}"
            params = {
                "fields": "name,username,profile_picture_url",
                "access_token": access_token
            }
            try:
                response = requests.get(url, params=params, timeout=15)
                if response.status_code == 400:
                    err_msg = response.json().get("error", {}).get("message", "Invalid Business Account ID or access token.")
                    logger.warning(f"Instagram profile details fetch failed: {err_msg}. Using generic fallbacks.")
                    name = "Instagram Business Account"
                    handle = "@connected"
                    avatar = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100"
                else:
                    response.raise_for_status()
                    data = response.json()
                    name = data.get("name", "Instagram Business Account")
                    username = data.get("username")
                    handle = f"@{username}" if username else "@connected"
                    avatar = data.get("profile_picture_url", "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100")
            except Exception as e:
                logger.warning(f"Failed to fetch Instagram profile details: {e}. Using generic fallbacks.")
                name = "Instagram Business Account"
                handle = "@connected"
                avatar = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100"
                
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
        refresh_token = config.get("youtube_refresh_token")
        
        if not access_token:
            raise ValueError("YouTube publishing failed: Access token is missing or expired. A valid connection is required for real uploads.")

        logger.info("Initiating real YouTube resumable upload...")
        updated_token = None
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
            
            if response.status_code == 401 and refresh_token:
                logger.info("YouTube access token expired during upload. Refreshing token...")
                try:
                    access_token = SocialPublishService.refresh_youtube_token(refresh_token)
                    updated_token = access_token
                    headers["Authorization"] = f"Bearer {access_token}"
                    response = requests.post(init_url, headers=headers, json=body, timeout=30)
                except Exception as re:
                    logger.warning(f"YouTube token refresh failed: {re}")

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
            
            result_payload = {
                "status": "success",
                "platform": "youtube",
                "mocked": False,
                "video_id": video_id,
                "video_url": f"https://youtube.com/shorts/{video_id}"
            }
            if updated_token:
                result_payload["updated_access_token"] = updated_token
            return result_payload
        except Exception as e:
            logger.error(f"YouTube publishing API failed: {e}", exc_info=True)
            raise

    @staticmethod
    def _publish_to_facebook(video_path: str, description: str, config: dict) -> dict:
        access_token = config.get("facebook_access_token") or settings.FACEBOOK_ACCESS_TOKEN
        page_id = config.get("facebook_page_id") or settings.FACEBOOK_PAGE_ID
 
        if not access_token or not page_id:
            raise ValueError("Facebook publishing failed: Page Access Token and Page ID are required. A valid connection is required for real uploads.")

        logger.info(f"Initiating Facebook Page Reels Upload (Page ID: {page_id})...")
        try:
            # Step 1: Initialize upload session
            init_url = f"https://graph.facebook.com/v20.0/{page_id}/video_reels"
            init_data = {
                "upload_phase": "start",
                "access_token": access_token
            }
            logger.info("Initializing Reels upload session...")
            response = requests.post(init_url, data=init_data, timeout=30)
            response.raise_for_status()
            res_data = response.json()
            video_id = res_data.get("video_id")
            upload_url = res_data.get("upload_url")
            
            if not video_id or not upload_url:
                raise ValueError(f"Facebook Page Reels API failed to return session details: {res_data}")

            # Step 2: Upload raw video data binary chunks
            file_size = os.path.getsize(video_path)
            logger.info(f"Uploading Reels video binary stream to Meta servers ({file_size} bytes)...")
            with open(video_path, "rb") as f:
                video_data = f.read()

            headers_put = {
                "Authorization": f"OAuth {access_token}",
                "offset": "0",
                "file_size": str(file_size),
                "Content-Type": "application/octet-stream"
            }
            # Note: Meta uses POST for uploading to the returned upload_url
            put_response = requests.post(upload_url, headers=headers_put, data=video_data, timeout=120)
            put_response.raise_for_status()
            logger.info("Reels video binary upload complete.")

            # Step 3: Publish the Reels container (Finish Phase)
            logger.info("Finishing Reels upload session and publishing...")
            finish_url = f"https://graph.facebook.com/v20.0/{page_id}/video_reels"
            finish_data = {
                "upload_phase": "finish",
                "video_id": video_id,
                "video_state": "PUBLISHED",
                "description": description,
                "access_token": access_token
            }
            finish_response = requests.post(finish_url, data=finish_data, timeout=30)
            finish_response.raise_for_status()
            logger.info("Facebook Reel successfully published!")

            return {
                "status": "success",
                "platform": "facebook",
                "mocked": False,
                "video_id": video_id,
                "video_url": f"https://facebook.com/watch/?v={video_id}"
            }
        except Exception as e:
            logger.error(f"Facebook publishing Graph API failed: {e}", exc_info=True)
            raise

    @staticmethod
    def _publish_to_instagram(video_path: str, caption: str, config: dict) -> dict:
        access_token = config.get("instagram_access_token") or settings.INSTAGRAM_ACCESS_TOKEN
        instagram_business_id = config.get("instagram_business_id") or settings.INSTAGRAM_BUSINESS_ID
        video_url = config.get("public_video_url") or settings.PUBLIC_VIDEO_URL

        # If video_url is a base URL, construct the full URL to the clip file
        if video_url and not video_url.lower().endswith(".mp4"):
            normalized_path = video_path.replace("\\", "/")
            if "uploads/" in normalized_path.lower():
                try:
                    idx = normalized_path.lower().index("uploads/")
                    relative_path = normalized_path[idx:]
                    video_url = f"{video_url.rstrip('/')}/{relative_path}"
                except ValueError:
                    pass

        # If no access tokens or page details, raise error
        if not access_token or not instagram_business_id:
            raise ValueError("Instagram publishing failed: Access Token and Business Account ID are required. Real API upload is required.")

        if not video_url:
            raise ValueError("Instagram publishing failed: A publicly accessible video URL (PUBLIC_VIDEO_URL) is required so Meta's API servers can fetch the video file. Localhost paths cannot be reached by Instagram's servers.")

        if "localhost" in video_url.lower() or "127.0.0.1" in video_url.lower():
            logger.warning(f"Instagram publishing warning: video URL ('{video_url}') appears to be a local address. Meta's API servers cannot download videos from localhost. Make sure you use a public tunnel (e.g., ngrok) or deployment domain.")

        logger.info(f"Initiating Instagram Reels container upload (ID: {instagram_business_id}, Video URL: {video_url})...")
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
            
            # Poll up to 40 times with 5s intervals (giving it up to 3 minutes and 20 seconds to process)
            for attempt in range(40):
                time.sleep(5.0)
                status_res = requests.get(url_status, params=params_status, timeout=15)
                status_res.raise_for_status()
                status_code = status_res.json().get("status_code")
                logger.info(f"Instagram container render state: {status_code}")
                if status_code == "FINISHED":
                    break
                elif status_code == "ERROR":
                    raise ValueError("Instagram Reels container processing failed on Meta's servers (likely due to unreachable localhost URL or encoding format issues).")
            else:
                raise TimeoutError("Instagram container processing timed out on Meta's servers.")

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
            
            # Step 4: Fetch permalink of published media
            logger.info(f"Instagram Reel published successfully! Media ID: {ig_media_id}. Fetching permalink...")
            url_permalink = f"https://graph.facebook.com/v20.0/{ig_media_id}"
            params_permalink = {
                "fields": "permalink",
                "access_token": access_token
            }
            video_share_url = "https://instagram.com/reels/"
            try:
                # Add a small delay for indexing
                time.sleep(2.0)
                permalink_res = requests.get(url_permalink, params=params_permalink, timeout=15)
                permalink_res.raise_for_status()
                video_share_url = permalink_res.json().get("permalink", video_share_url)
            except Exception as pe_err:
                logger.warning(f"Failed to fetch permalink for Instagram Reels media: {pe_err}")

            return {
                "status": "success",
                "platform": "instagram",
                "mocked": False,
                "media_id": ig_media_id,
                "video_url": video_share_url
            }
        except Exception as e:
            logger.error(f"Instagram publishing Graph API failed: {e}", exc_info=True)
            raise
