import json
import os
import logging
from openai import OpenAI
from app.core.config import settings
from app.services.llm_client import safe_chat_completion, parse_json_robust

logger = logging.getLogger(__name__)

class HighlightDetectionService:
    def __init__(self):
        groq_key = (settings.GROQ_API_KEY or os.environ.get("GROQ_API_KEY", "")).strip()
        qwen_key = (settings.QWEN_API_KEY or os.environ.get("QWEN_API_KEY", "")).strip()

        if groq_key:
            from app.services.llm_client import get_groq_chat_model
            self.client = OpenAI(
                base_url="https://api.groq.com/openai/v1",
                api_key=groq_key,
            )
            self.model = get_groq_chat_model(self.client)
            logger.info(f"Initializing HighlightDetectionService with Groq Cloud ({self.model})...")
            self.provider = "groq"
        elif qwen_key and qwen_key != "your_openrouter_api_key_here":
            logger.info("Initializing HighlightDetectionService with OpenRouter...")
            self.client = OpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=qwen_key,
            )
            self.model = "qwen/qwen-2.5-72b-instruct"
            self.provider = "openrouter"
        else:
            logger.warning("Neither GROQ_API_KEY nor QWEN_API_KEY is configured. Highlight detection may fail.")
            self.client = None
            self.model = "llama-3.3-70b-versatile"
            self.provider = "none"

    def detect(self, transcript: list, content_analysis: dict, target_length: float = 30.0) -> dict:
        """
        Analyzes a video transcript and content insights to generate Top 5 highlight clips.
        Transcript is expected to be a list of dicts: [{'start': float, 'end': float, 'text': str}]
        """
        if not self.client:
            raise ValueError("Neither GROQ_API_KEY nor QWEN_API_KEY is configured. Please provide one in your .env.")

        # Group words into sentence / phrase chunks so prompt is token-efficient and compact
        grouped_lines = []
        cur_words = []
        cur_start = None
        cur_end = None
        for segment in transcript:
            text = segment.get('text', '').strip()
            if not text:
                continue
            st = segment.get('start', 0.0)
            en = segment.get('end', 0.0)
            if cur_start is None:
                cur_start = st
            cur_end = en
            cur_words.append(text)
            if len(cur_words) >= 20 or (text.endswith(('.', '!', '?')) and len(cur_words) >= 6):
                grouped_lines.append(f"[{cur_start:.2f}s - {cur_end:.2f}s] {' '.join(cur_words)}")
                cur_words = []
                cur_start = None
        if cur_words:
            grouped_lines.append(f"[{cur_start:.2f}s - {cur_end:.2f}s] {' '.join(cur_words)}")
        formatted_transcript = "\n".join(grouped_lines) if grouped_lines else "No transcript available."

        prompt = f"""
You are an expert short-form video editor and content strategist. 
I am providing you with the word-level transcript of a video and an AI-generated analysis of its content.

Your task is to identify the TOP 5 most viral, engaging clips (highlights) from this video.

Content Analysis:
Topic: {content_analysis.get('topic')}
Summary: {content_analysis.get('summary')}

Transcript:
{formatted_transcript}

CRITICAL RULES FOR CLIP SELECTION:
1. Do not remove or cut off critical content (sentences should be complete).
2. Prioritize scoring based on this formula:
   - 40% Importance (How crucial is this to the main topic?)
   - 30% Hook (How strong is the first 3 seconds of the clip at grabbing attention?)
   - 20% Retention (How well does the clip maintain interest throughout?)
   - 10% Emotion (Does it evoke laughter, surprise, curiosity, or empathy?)
3. Choose a strong moment, then return a range about {target_length:.0f} seconds long. The application will preserve the selected duration and center the range around your chosen moment; only use a shorter range when the source itself is shorter.
4. You MUST output EXACTLY 5 clips.

You MUST output exactly and ONLY valid JSON matching this schema, with no markdown formatting around it:
{{
  "clips": [
    {{
      "start_time": 0.0,
      "end_time": 35.0,
      "importance_score": 85,
      "viral_score": 92,
      "reason": "Strong hook with emotional payoff",
      "title": "Short catchy title"
    }}
  ]
}}
"""

        logger.info(f"Sending highlight detection prompt to {self.model} via {self.provider}...")
        
        try:
            response = safe_chat_completion(
                client=self.client,
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that strictly outputs raw JSON."},
                    {"role": "user", "content": prompt}
                ],
                is_openrouter=(self.provider == "openrouter"),
                response_format={"type": "json_object"},
                max_tokens=1500
            )
            
            result_text = response.choices[0].message.content
            logger.info(f"Successfully received highlights from {self.model}.")
            
            return parse_json_robust(result_text)
            
        except Exception as e:
            logger.error(f"Failed to detect highlights with {self.model}: {e}")
            raise

highlight_detection_service = HighlightDetectionService()
