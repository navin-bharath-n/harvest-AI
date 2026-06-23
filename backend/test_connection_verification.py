import sys
import os
from fastapi.testclient import TestClient

# Add parent directory to path so app imports work
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), 'app')))
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.main import app
from app.services.social_publish_service import SocialPublishService

client = TestClient(app)

def test_invalid_token_verification():
    print("\nTesting Invalid Token Verification (Expect ValueError)...")
    
    # 1. YouTube invalid token
    try:
        SocialPublishService.verify_connection("youtube", {"youtube_access_token": "invalid_token_123"})
        assert False, "Should have failed verification"
    except ValueError as e:
        print(f"[OK] YouTube verification failed as expected: {e}")
        assert "Google API error" in str(e) or "Invalid or expired" in str(e)

    # 2. Facebook invalid credentials
    try:
        SocialPublishService.verify_connection("facebook", {"facebook_access_token": "invalid", "facebook_page_id": "123"})
        assert False, "Should have failed verification"
    except ValueError as e:
        print(f"[OK] Facebook verification failed as expected: {e}")
        assert "Meta API error" in str(e) or "Facebook Graph API error" in str(e)

if __name__ == "__main__":
    try:
        test_invalid_token_verification()
        print("\nALL TESTS PASSED SUCCESSFULLY!")
    except AssertionError as ae:
        print("\n[FAIL] TEST FAILED:", ae)
        sys.exit(1)
    except Exception as e:
        print("\n[FAIL] UNEXPECTED ERROR:", e)
        sys.exit(1)
