import json
import logging
from openai import OpenAI
from app.core.config import settings
from app.services.llm_client import safe_chat_completion, parse_json_robust

logger = logging.getLogger(__name__)

class HighlightDetectionService:
    def __init__(self):
        self.api_key = settings.QWEN_API_KEY
        if not self.api_key or self.api_key == "your_openrouter_api_key_here":
            logger.warning("QWEN_API_KEY is not properly configured. Highlight detection will fail.")
            
        # Initialize OpenAI client to point to OpenRouter
        self.client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=self.api_key,
        )
        
        # We will use qwen-2.5-72b-instruct as the Qwen3 model via OpenRouter
        self.model = "qwen/qwen-2.5-72b-instruct"

    def detect(self, transcript: list, content_analysis: dict) -> dict:
        """
        Analyzes a video transcript and content insights to generate Top 5 highlight clips.
        Transcript is expected to be a list of dicts: [{'start': float, 'end': float, 'text': str}]
        """
        if not self.api_key or self.api_key == "your_openrouter_api_key_here":
            raise ValueError("QWEN_API_KEY is not set. Please add it to your .env file.")

        # Convert transcript into a readable format for the LLM
        formatted_transcript = ""
        for idx, segment in enumerate(transcript):
            start = f"{segment.get('start', 0):.2f}s"
            end = f"{segment.get('end', 0):.2f}s"
            text = segment.get('text', '').strip()
            formatted_transcript += f"[{start} - {end}] {text}\n"

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
3. Each clip should ideally be between 15 and 60 seconds long.
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

        logger.info(f"Sending highlight detection prompt to {self.model} via OpenRouter...")
        
        try:
            response = safe_chat_completion(
                client=self.client,
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that strictly outputs raw JSON."},
                    {"role": "user", "content": prompt}
                ],
                is_openrouter=True,
                response_format={"type": "json_object"}
            )
            
            result_text = response.choices[0].message.content
            logger.info("Successfully received highlights from Qwen.")
            
            return parse_json_robust(result_text)
            
        except Exception as e:
            logger.error(f"Failed to detect highlights with Qwen: {e}")
            raise

highlight_detection_service = HighlightDetectionService()
