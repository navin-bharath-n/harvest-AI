import json
import logging
from openai import OpenAI

logger = logging.getLogger(__name__)

class ContentUnderstandingService:
    def __init__(self):
        from app.core.config import settings
        self.api_key = settings.QWEN_API_KEY
        
        if self.api_key and self.api_key != "your_openrouter_api_key_here":
            logger.info("Initializing ContentUnderstandingService with OpenRouter...")
            self.client = OpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=self.api_key,
            )
            self.model = "qwen/qwen-2.5-72b-instruct"
            self.is_openrouter = True
        else:
            logger.info("Initializing ContentUnderstandingService with local Ollama...")
            self.client = OpenAI(
                base_url="http://localhost:11434/v1",
                api_key="ollama",
            )
            self.model = "qwen2.5"
            self.is_openrouter = False

    def analyze(self, transcript: list, metadata: dict) -> dict:
        """
        Analyzes a video transcript and returns structured AI insights.
        Transcript is expected to be a list of dicts: [{'start': float, 'end': float, 'text': str}]
        """
        # Convert transcript into a readable format for the LLM
        formatted_transcript = ""
        for idx, segment in enumerate(transcript):
            start = f"{segment.get('start', 0):.2f}s"
            end = f"{segment.get('end', 0):.2f}s"
            text = segment.get('text', '').strip()
            formatted_transcript += f"[{start} - {end}] {text}\n"

        prompt = f"""
You are an expert AI content analyzer. I am providing you with the metadata and word-level transcript of a video. 
Your task is to analyze the content and return a STRICT JSON object containing insights.

Video Metadata:
Duration: {metadata.get('duration')}s
Resolution: {metadata.get('resolution')}

Transcript:
{formatted_transcript}

You MUST output exactly and ONLY valid JSON matching this schema, with no markdown formatting around it:
{{
  "topic": "The main topic or subject of the video (1-3 words)",
  "summary": "A concise 2-3 sentence summary of the entire video",
  "key_points": [
    "Key point 1",
    "Key point 2"
  ],
  "importance_scores": [
    {{
      "start": 0.0,
      "end": 5.5,
      "score": 8,
      "reason": "Why this specific section is important"
    }}
  ]
}}

Rules for importance_scores:
- Identify 2 to 5 important contiguous sections of the video.
- For each section, provide the exact 'start' and 'end' timestamp in seconds based on the transcript provided.
- Score is out of 10.
- Only output JSON.
"""

        provider_name = "OpenRouter" if self.is_openrouter else "local Ollama"
        logger.info(f"Sending prompt to {self.model} via {provider_name}...")
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that strictly outputs raw JSON."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"}
            )
            
            result_text = response.choices[0].message.content
            logger.info("Successfully received analysis from Qwen.")
            
            return json.loads(result_text)
            
        except Exception as e:
            logger.error(f"Failed to analyze content with Qwen: {e}")
            raise

content_understanding_service = ContentUnderstandingService()
