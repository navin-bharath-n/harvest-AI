import sys
import os
from fastapi.testclient import TestClient

# Add parent directory to path so app imports work
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), 'app')))
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.main import app
from app.services.social_publish_service import SocialPublishService

client = TestClient(app)

def test_sandbox_verification():
    print("Testing Sandbox Verification...")
    
    # 1. YouTube Sandbox
    res_yt = SocialPublishService.verify_connection("youtube", {"is_sandbox": True})
    assert res_yt["account_name"] == "Harvest AI Studio (Sandbox)"
    assert res_yt["account_handle"] == "@HarvestAI_Shorts"
    assert res_yt["credentials"] == {"is_sandbox": True}
    print("[OK] YouTube Sandbox Connection verified.")

    # 2. Facebook Sandbox
    res_fb = SocialPublishService.verify_connection("facebook", {"is_sandbox": True})
    assert res_fb["account_name"] == "Viral Content Hub (Sandbox)"
    assert res_fb["credentials"] == {"is_sandbox": True}
    print("[OK] Facebook Sandbox Connection verified.")

    # 3. Instagram Sandbox
    res_ig = SocialPublishService.verify_connection("instagram", {"is_sandbox": True})
    assert res_ig["account_name"] == "ai_clip_generator (Sandbox)"
    assert res_ig["credentials"] == {"is_sandbox": True}
    print("[OK] Instagram Sandbox Connection verified.")

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

def test_connections_endpoint():
    print("\nTesting Users Connections API Endpoint...")
    
    # POST YouTube Sandbox connection
    response = client.post(
        "/api/v1/users/1/connections",
        json={"platform": "youtube", "credentials": {"is_sandbox": True}}
    )
    print("Endpoint response code:", response.status_code)
    assert response.status_code == 200
    data = response.json()
    assert data["platform"] == "youtube"
    assert data["account_name"] == "Harvest AI Studio (Sandbox)"
    assert data["credentials"] == {"is_sandbox": True}
    print("[OK] POST /connections Sandbox Connection created successfully.")

    # POST Invalid Connection -> Expect 400
    response = client.post(
        "/api/v1/users/1/connections",
        json={"platform": "facebook", "credentials": {"facebook_access_token": "invalid_token", "facebook_page_id": "99999"}}
    )
    print("Endpoint invalid response code:", response.status_code)
    assert response.status_code == 400
    err_detail = response.json()["detail"]
    print(f"[OK] POST /connections invalid credentials failed as expected: {err_detail}")

if __name__ == "__main__":
    try:
        test_sandbox_verification()
        test_invalid_token_verification()
        test_connections_endpoint()
        print("\nALL TESTS PASSED SUCCESSFULLY!")
    except AssertionError as ae:
        print("\n[FAIL] TEST FAILED:", ae)
        sys.exit(1)
    except Exception as e:
        print("\n[FAIL] UNEXPECTED ERROR:", e)
        sys.exit(1)
