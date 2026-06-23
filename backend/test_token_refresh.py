import sys
import os

# Add parent directory to path so app imports work
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), 'app')))
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.services.social_publish_service import SocialPublishService

def test_refresh_token_failure():
    print("\nTesting Token Refresh with invalid refresh token...")
    try:
        # This should fail since we are passing a dummy refresh token and Google OAuth will reject it
        SocialPublishService.refresh_youtube_token("dummy_refresh_token")
        assert False, "Should have failed to refresh token"
    except ValueError as e:
        print(f"[OK] Token refresh failed as expected: {e}")
        assert "Failed to refresh YouTube access token" in str(e)

if __name__ == "__main__":
    test_refresh_token_failure()
    print("\nALL TOKEN REFRESH TESTS PASSED!")
