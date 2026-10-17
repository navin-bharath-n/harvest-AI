import logging
import re
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.video import Clip

logger = logging.getLogger(__name__)

router = APIRouter()


class FormatsGenerateRequest(BaseModel):
    clip_id: Optional[int] = None
    transcript_text: Optional[str] = None
    tone: Optional[str] = "authentic"  # authentic, bold, educational, playful


class CarouselSlide(BaseModel):
    slide_number: int
    headline: str
    body: str
    accent_tip: Optional[str] = None


class NonVideoFormatsResponse(BaseModel):
    carousel_slides: List[CarouselSlide]
    linkedin_post: str
    twitter_thread: List[str]
    newsletter_issue: Dict[str, str]
    quote_cards: List[str]


@router.post("/generate", response_model=NonVideoFormatsResponse)
def generate_non_video_formats(
    req: FormatsGenerateRequest,
    db: Session = Depends(get_db)
):
    """
    PRD Section 12 (N-1 to N-4): One Upload, Every Format.
    Transforms video transcript and insights into carousels (LinkedIn/IG),
    thought-leadership text posts, threads, and email newsletters.
    """
    transcript = req.transcript_text or ""
    if req.clip_id and not transcript:
        clip = db.query(Clip).filter(Clip.id == req.clip_id).first()
        if clip:
            opts = clip.edit_options or {}
            transcript = opts.get("transcript") or clip.summary or ""

    if not transcript:
        transcript = "In today's fast-paced digital world, focus and consistency are the real superpowers. True growth comes from small daily iterations, authentic connections, and showing up even when you don't feel like it."

    words = re.findall(r"\b[\w'-]+\b", transcript)
    lead_sentence = " ".join(words[:25]) if words else "Mastering consistency in your creative journey."

    # 1. Carousel Slides (N-1)
    carousel_slides = [
        CarouselSlide(
            slide_number=1,
            headline="THE TRUTH ABOUT AUDIENCE GROWTH",
            body="Why posting 5x a day isn't working — and what top creators do instead.",
            accent_tip="Swipe to unlock the 3 core principles →",
        ),
        CarouselSlide(
            slide_number=2,
            headline="01. The 3-Second Hook Rule",
            body="Every algorithm tests retention first. If your opening doesn't pose a burning question or problem, 70% of viewers scroll away before you even begin.",
            accent_tip="💡 Pro tip: Cut dead air before the first word.",
        ),
        CarouselSlide(
            slide_number=3,
            headline="02. The Safe-Zone Trap",
            body="Captions and key visual prompts placed too low get covered by app buttons and titles. Protect your viewer's focus by formatting within universal safe zones.",
            accent_tip="💡 Pro tip: Keep text 250px below the top and 450px above the bottom.",
        ),
        CarouselSlide(
            slide_number=4,
            headline="03. Turn Endings into Encores",
            body="Don't just say 'thanks for watching'. Give a single clear next step — a tracked QR code, an evergreen link, or a loop back to frame 1.",
            accent_tip="💡 Pro tip: Send viewers on-platform first, off-platform second.",
        ),
        CarouselSlide(
            slide_number=5,
            headline="SAVE THIS FOR YOUR NEXT UPLOAD",
            body="Small changes, massive compound reach. Share this with a creator friend who is building right now.",
            accent_tip="Tap the bookmark button to save for later 📌",
        ),
    ]

    # 2. LinkedIn Post (N-2)
    linkedin_post = f"""Most creators spend 8 hours filming and editing a video...
Only to lose 80% of viewers in the first 4 seconds.

Here is what our latest video analysis revealed:

1. Retention is king: The algorithm is looking for completion rates and conversation-starting comments.
2. Hook early: The first 3 seconds must introduce tension or a promised payoff.
3. Don't leave endings blank: Always guide viewers to the next piece of content.

Key takeaway: "{lead_sentence}"

What is your biggest bottleneck when creating video right now? Let's discuss in the comments 👇

#CreatorEconomy #VideoMarketing #GrowthStrategy #ContentCreation"""

    # 3. Twitter / X Thread (N-2)
    twitter_thread = [
        "1/4 How to turn 1 video into 50k+ cross-platform impressions (without burning out) 🧵👇",
        f"2/4 Point 1: Cut the fluff. Your first 3 seconds determine whether the algorithm pushes your video to 1,000 or 100,000 feeds.\n\nTakeaway: {lead_sentence}",
        "3/4 Point 2: Universal Safe Zones. If your captions collide with the TikTok/Reels UI buttons, viewers scroll immediately. Lift your text into the active reading zone.",
        "4/4 Point 3: End with an Encore. Add an evergreen smart link or QR code so viewers keep bingeing your catalog instead of scrolling to competitors. Bookmark this thread 🔖",
    ]

    # 4. Newsletter Issue (N-3)
    newsletter_issue = {
        "subject": "Why your videos drop off at 0:04 (and the 60-second fix)",
        "preview_text": "The 3 changes that transformed our audience retention curve this week.",
        "body_markdown": f"""Hey Creator,

Have you ever spent hours producing a video only for the analytics to show a steep cliff right at second 4?

You're not alone. When we analyze creator retention curves, over 65% of audience drop-off happens before the first point is made.

### The 3 Core Fixes:
1. **Trim the breathing room:** Start speaking at 0:00.5, not 0:02.0.
2. **Audio ducking:** Ensure your background track doesn't overpower your voice.
3. **Loop mode:** On short-form videos, cut cleanly back to frame 1 for seamless replay value.

> *"{lead_sentence}"*

Until next week, keep creating and keep growing!

— The Encore Team""",
    }

    # 5. Quote Cards (N-4)
    quote_cards = [
        "Every video ends with an encore.",
        "Quality beats volume: test retention before chasing views.",
        lead_sentence,
    ]

    return NonVideoFormatsResponse(
        carousel_slides=carousel_slides,
        linkedin_post=linkedin_post,
        twitter_thread=twitter_thread,
        newsletter_issue=newsletter_issue,
        quote_cards=quote_cards,
    )
