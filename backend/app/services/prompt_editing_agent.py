import json
import logging
from app.core.config import settings
from typing import List, Dict

logger = logging.getLogger(__name__)

class PromptEditingAgent:
    def __init__(self):
        self.api_key = settings.QWEN_API_KEY
        self.client = None
        try:
            from openai import OpenAI
            if self.api_key and self.api_key != "your_openrouter_api_key_here":
                logger.info("Initializing PromptEditingAgent with OpenRouter...")
                self.client = OpenAI(
                    base_url="https://openrouter.ai/api/v1",
                    api_key=self.api_key,
                )
                self.model = "qwen/qwen-2.5-72b-instruct"
                self.is_openrouter = True
            else:
                logger.info("Initializing PromptEditingAgent with local Ollama...")
                self.client = OpenAI(
                    base_url="http://localhost:11434/v1",
                    api_key="ollama",
                )
                self.model = "qwen2.5"
                self.is_openrouter = False
        except ImportError:
            logger.warning("openai package not installed. Prompt editing LLM disabled.")
            self.model = "qwen2.5"
            self.is_openrouter = False

    def parse_prompt(self, prompt: str) -> dict:
        """
        Translates a natural language user prompt into a structured JSON editing instruction.
        """
        system_prompt = """
You are an expert video editing AI assistant. Your task is to take a user's natural language request for video editing and output a STRICT JSON object containing the specific editing parameters.

You MUST output exactly and ONLY valid JSON matching this schema:
{
  "cuts": "fast|slow|skip_intro|standard",
  "zooms": "frequent|subtle|none",
  "caption_style": "energetic|minimalist|standard",
  "music_style": "upbeat|lofi|none",
  "language": "en|ta|es|fr|hi|etc",
  "transition": "fade|zoom|none",
  "translate_language": "en|ta|es|fr|hi|none",
  "dub_voice": true|false,
  "caption_language": "translated|english|original|none",
  "dub_mix_mode": "replace|mix"
}

Instructions:
- Analyze the user's prompt carefully to determine the intent.
- If a parameter isn't mentioned in the prompt, use a reasonable default based on the rest of the prompt (or default to standard/none/en).
- language and translate_language should be the ISO language code (e.g., 'ta' for Tamil, 'en' for English).
- Only output the raw JSON object.
"""

        logger.info(f"Parsing user prompt: '{prompt}'")
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"}
            )
            
            result_text = response.choices[0].message.content
            logger.info("Successfully parsed prompt into editing instructions.")
            
            return json.loads(result_text)
            
        except Exception as e:
            logger.error(f"Failed to parse prompt with Qwen: {e}")
            # Fallback to safe defaults
            return {
                "cuts": "standard",
                "zooms": "none",
                "caption_style": "standard",
                "music_style": "none",
                "language": "en",
                "transition": "fade",
                "translate_language": "none",
                "dub_voice": False,
                "caption_language": "translated",
                "dub_mix_mode": "replace"
            }

    def translate_transcript(self, transcript: List[Dict], target_language_code: str) -> List[Dict]:
        """
        Translates the text of a transcript to the target language using Google Translate.
        """
        if not transcript or target_language_code.lower() == "none":
            return transcript

        from app.services.translation_service import translate_and_distribute_words
        try:
            return translate_and_distribute_words(transcript, target_language_code)
        except Exception as e:
            logger.error(f"Google translate_transcript failed: {e}")
            return transcript

prompt_editing_agent = PromptEditingAgent()
