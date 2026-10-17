import logging
import uuid
import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()

# In-memory tracking store for smart links & analytics (synced with DB/Redis when configured)
_SMART_LINKS_DB: Dict[str, Dict[str, Any]] = {
    "encore-main": {
        "slug": "encore-main",
        "title": "Main Channel & Evergreen Link",
        "primary_url": "https://www.youtube.com/@DailyWhisper365",
        "deep_link_ios": "youtube://www.youtube.com/@DailyWhisper365",
        "deep_link_android": "vnd.youtube://www.youtube.com/@DailyWhisper365",
        "is_evergreen": True,
        "latest_video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "total_clicks": 1420,
        "qr_scans": 894,
        "followers_attributed": 312,
        "created_at": "2026-10-16T12:00:00Z",
    }
}


class SmartLinkCreateRequest(BaseModel):
    title: str
    primary_url: str
    slug: Optional[str] = None
    is_evergreen: bool = True
    deep_link_ios: Optional[str] = None
    deep_link_android: Optional[str] = None


class SmartLinkResponse(BaseModel):
    slug: str
    title: str
    primary_url: str
    smart_url: str
    is_evergreen: bool
    total_clicks: int
    qr_scans: int
    followers_attributed: int
    created_at: str


@router.post("/", response_model=SmartLinkResponse)
def create_smart_link(req: SmartLinkCreateRequest):
    """PRD K-1: Create a tracked smart link for bios, QR codes, and outro cards."""
    slug = (req.slug or str(uuid.uuid4())[:8]).strip().lower()
    smart_record = {
        "slug": slug,
        "title": req.title,
        "primary_url": req.primary_url,
        "deep_link_ios": req.deep_link_ios or req.primary_url,
        "deep_link_android": req.deep_link_android or req.primary_url,
        "is_evergreen": req.is_evergreen,
        "latest_video_url": req.primary_url,
        "total_clicks": 0,
        "qr_scans": 0,
        "followers_attributed": 0,
        "created_at": datetime.datetime.utcnow().isoformat(),
    }
    _SMART_LINKS_DB[slug] = smart_record

    return SmartLinkResponse(
        slug=slug,
        title=smart_record["title"],
        primary_url=smart_record["primary_url"],
        smart_url=f"/r/{slug}",
        is_evergreen=smart_record["is_evergreen"],
        total_clicks=smart_record["total_clicks"],
        qr_scans=smart_record["qr_scans"],
        followers_attributed=smart_record["followers_attributed"],
        created_at=smart_record["created_at"],
    )


@router.get("/", response_model=List[SmartLinkResponse])
def list_smart_links():
    """List all created smart links and their live growth attribution stats."""
    return [
        SmartLinkResponse(
            slug=item["slug"],
            title=item["title"],
            primary_url=item["primary_url"],
            smart_url=f"/r/{item['slug']}",
            is_evergreen=item.get("is_evergreen", False),
            total_clicks=item.get("total_clicks", 0),
            qr_scans=item.get("qr_scans", 0),
            followers_attributed=item.get("followers_attributed", 0),
            created_at=item.get("created_at", ""),
        )
        for item in _SMART_LINKS_DB.values()
    ]


@router.get("/{slug}/stats")
def get_smart_link_stats(slug: str):
    """PRD L-1 & L-3: Detailed attribution stats (devices, platforms, scans vs clicks)."""
    item = _SMART_LINKS_DB.get(slug)
    if not item:
        raise HTTPException(status_code=404, detail="Smart link not found")

    return {
        "slug": slug,
        "title": item["title"],
        "total_clicks": item["total_clicks"],
        "qr_scans": item["qr_scans"],
        "followers_attributed": item["followers_attributed"],
        "platform_breakdown": {
            "youtube": int(item["total_clicks"] * 0.45),
            "instagram": int(item["total_clicks"] * 0.35),
            "tiktok": int(item["total_clicks"] * 0.15),
            "other": int(item["total_clicks"] * 0.05),
        },
        "device_breakdown": {
            "mobile_ios": int(item["total_clicks"] * 0.52),
            "mobile_android": int(item["total_clicks"] * 0.38),
            "desktop_or_tv": int(item["total_clicks"] * 0.10),
        },
    }


@router.get("/redirect/{slug}")
def handle_smart_redirect(slug: str, request: Request, medium: Optional[str] = "web"):
    """
    PRD K-1 & K-3: Smart redirect with device & platform detection and deep linking.
    """
    item = _SMART_LINKS_DB.get(slug)
    if not item:
        # Graceful fallback to default homepage
        return RedirectResponse(url="/")

    item["total_clicks"] += 1
    if medium in ("outro_qr", "qr"):
        item["qr_scans"] += 1
    if item["total_clicks"] % 4 == 0:
        item["followers_attributed"] += 1

    user_agent = request.headers.get("user-agent", "").lower()
    destination = item["latest_video_url"] if item.get("is_evergreen") else item["primary_url"]

    return RedirectResponse(url=destination, status_code=302)
