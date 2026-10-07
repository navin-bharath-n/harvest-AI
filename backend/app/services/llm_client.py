import json
import logging
import re
import time
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

def _repair_truncated_json(cleaned: str) -> Optional[Dict[str, Any]]:
    """Attempt to repair slightly malformed or token-truncated JSON strings."""
    # 1. Strip trailing commas before closing braces/brackets
    candidate = re.sub(r',\s*([\]}])', r'\1', cleaned)

    # 2. Track unclosed strings and unbalanced brackets
    in_string = False
    escape = False
    stack = []

    for ch in candidate:
        if escape:
            escape = False
            continue
        if ch == '\\':
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if not in_string:
            if ch in '{[':
                stack.append(ch)
            elif ch == '}' and stack and stack[-1] == '{':
                stack.pop()
            elif ch == ']' and stack and stack[-1] == '[':
                stack.pop()

    # If cut off inside an open string, close the quote
    if in_string:
        candidate += '"'

    # Remove any dangling trailing comma
    candidate = re.sub(r',\s*$', '', candidate.strip())

    # Close remaining open brackets and braces
    while stack:
        top = stack.pop()
        if top == '{':
            candidate += '}'
        elif top == '[':
            candidate += ']'

    try:
        data = json.loads(candidate)
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return None

def _extract_clips_fallback(text: str) -> Optional[Dict[str, Any]]:
    """Extract clip items from unstructured or partially broken JSON using regex."""
    clip_pattern = re.compile(r'\{[^{}]*?"start_time"[^{}]*?\}', re.DOTALL)
    found_clips = []

    for match in clip_pattern.finditer(text):
        raw = match.group(0)
        # Try direct load of this item
        cleaned_item = re.sub(r',\s*([\]}])', r'\1', raw)
        try:
            item = json.loads(cleaned_item)
            if "start_time" in item and "end_time" in item:
                found_clips.append(item)
                continue
        except Exception:
            pass

        # Regex fallback per clip
        st_match = re.search(r'"start_time"\s*:\s*([\d.]+)', raw)
        et_match = re.search(r'"end_time"\s*:\s*([\d.]+)', raw)
        title_match = re.search(r'"title"\s*:\s*"([^"]*)"', raw)
        reason_match = re.search(r'"reason"\s*:\s*"([^"]*)"', raw)
        imp_match = re.search(r'"importance_score"\s*:\s*(\d+)', raw)
        viral_match = re.search(r'"viral_score"\s*:\s*(\d+)', raw)
        if st_match and et_match:
            found_clips.append({
                "start_time": float(st_match.group(1)),
                "end_time": float(et_match.group(1)),
                "title": title_match.group(1) if title_match else "Highlight Clip",
                "reason": reason_match.group(1) if reason_match else "Viral moment",
                "importance_score": int(imp_match.group(1)) if imp_match else 85,
                "viral_score": int(viral_match.group(1)) if viral_match else 88,
            })

    if found_clips:
        return {"clips": found_clips}
    return None

def parse_json_robust(text: str) -> Dict[str, Any]:
    """
    Parses a JSON object robustly by handling markdown code fences,
    extracting content between '{' and '}', repairing truncated JSON,
    and salvaging valid clips as a fallback.
    """
    cleaned = (text or "").strip()
    
    # Strip markdown code blocks if present
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    
    # Extract only the JSON portion from text
    start_idx = cleaned.find("{")
    end_idx = cleaned.rfind("}")
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        cleaned = cleaned[start_idx:end_idx + 1]
    
    # 1. Direct standard parse
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # 2. Repair truncated JSON (unclosed strings, braces, brackets, trailing commas)
    repaired = _repair_truncated_json(cleaned)
    if repaired is not None:
        logger.info("Successfully recovered JSON using structural auto-repair.")
        return repaired

    # 3. Fallback: extract clips via regex if this is a highlight detection output
    clips_fallback = _extract_clips_fallback(text)
    if clips_fallback is not None:
        logger.info(f"Successfully salvaged {len(clips_fallback.get('clips', []))} clips via regex fallback.")
        return clips_fallback

    # 4. Fallback for content understanding (topic, summary, scores)
    topic_match = re.search(r'"topic"\s*:\s*"([^"]*)"', text)
    summary_match = re.search(r'"summary"\s*:\s*"([^"]*)"', text)
    if topic_match or summary_match:
        logger.info("Successfully salvaged content analysis via regex fallback.")
        return {
            "topic": topic_match.group(1) if topic_match else "General Discussion",
            "summary": summary_match.group(1) if summary_match else "Video content summary.",
            "importance_scores": []
        }

    # Final attempt: let json.loads raise original exception for clarity
    return json.loads(cleaned)

def parse_json_list_robust(text: str) -> List[Any]:
    """
    Parses a JSON array/list robustly by handling markdown code fences
    and extracting content between the first '[' and last ']'.
    """
    cleaned = (text or "").strip()
    
    # Strip markdown code blocks if present
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    
    start_idx = cleaned.find("[")
    end_idx = cleaned.rfind("]")
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        cleaned = cleaned[start_idx:end_idx + 1]
    
    # 1. Standard json.loads
    try:
        data = json.loads(cleaned)
        if isinstance(data, list):
            return data
    except Exception:
        pass

    # 2. Try unescaping quotes if returned with escaped quotes [\"...\"]
    if r'\"' in cleaned:
        try:
            unescaped = cleaned.replace(r'\"', '"')
            data = json.loads(unescaped)
            if isinstance(data, list):
                return data
        except Exception:
            pass

    strings = re.findall(r'"((?:[^"\\]|\\.)*)"', cleaned)
    if strings:
        return strings

    escaped_strings = re.findall(r'\\"((?:[^"\\]|\\.)*)\\"', cleaned)
    if escaped_strings:
        return escaped_strings

    return []

_CACHED_GROQ_MODEL = None

def get_groq_chat_model(client=None) -> str:
    """
    Identifies the best available chat model on the Groq endpoint.
    Uses 'qwen/qwen3.8-27b' initially. If it fails or hits rate limits
    during execution, safe_chat_completion falls back to
    'llama-3.3-70b-versatile' and 'llama-3.1-8b-instant'.
    """
    global _CACHED_GROQ_MODEL
    if _CACHED_GROQ_MODEL:
        return _CACHED_GROQ_MODEL

    candidates = [
        "qwen/qwen3.8-27b",
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
    ]

    if client:
        try:
            available_models = [m.id for m in client.models.list().data]
            for cand in candidates:
                if cand in available_models:
                    _CACHED_GROQ_MODEL = cand
                    logger.info(f"Resolved Groq chat model: {cand}")
                    return cand
            for m_id in available_models:
                if "whisper" not in m_id and "guard" not in m_id:
                    _CACHED_GROQ_MODEL = m_id
                    logger.info(f"Selected fallback Groq model: {m_id}")
                    return m_id
        except Exception as e:
            logger.warning(f"Could not list Groq models: {e}. Defaulting to qwen/qwen3.8-27b.")

    _CACHED_GROQ_MODEL = "qwen/qwen3.8-27b"
    return _CACHED_GROQ_MODEL

def safe_chat_completion(
    client, 
    model: str, 
    messages: List[Dict[str, str]], 
    is_openrouter: bool, 
    response_format: Optional[Dict[str, str]] = None, 
    **kwargs
) -> Any:
    """
    Sends a chat completion request to the LLM client, handling fallback models,
    exponential backoff for rate limits, and retrying without JSON mode constraints if needed.
    """
    extra_body = None
    
    if is_openrouter:
        fallback_models = [
            "qwen/qwen-2.5-72b-instruct",
            "google/gemini-2.5-flash",
            "meta-llama/llama-3.3-70b-instruct"
        ]
        
        if model in fallback_models:
            fallback_models.remove(model)
        fallback_models.insert(0, model)
        
        extra_body = {
            "models": fallback_models,
            "provider": {
                "ignore": ["Novita"]
            }
        }
        
        if response_format and response_format.get("type") == "json_object":
            extra_body["provider"]["require_parameters"] = True

    # Adjust max_tokens:
    # Qwen on Groq enforces 1,000 OTPM limit, so keep max_tokens <= 600 if using Qwen.
    # LLaMA models on Groq support full token lengths (1,500) so JSON highlight responses
    # are never truncated.
    if not is_openrouter:
        if "max_tokens" not in kwargs:
            kwargs["max_tokens"] = 600 if "qwen" in model.lower() else 1500
        elif kwargs["max_tokens"] > 800 and "qwen" in model.lower():
            kwargs["max_tokens"] = 600

    try:
        if response_format:
            return client.chat.completions.create(
                model=model,
                messages=messages,
                response_format=response_format,
                extra_body=extra_body,
                **kwargs
            )
        else:
            return client.chat.completions.create(
                model=model,
                messages=messages,
                extra_body=extra_body,
                **kwargs
            )
            
    except Exception as e:
        logger.warning(f"Initial chat completion failed for model '{model}': {e}.")

        # Check for 404, 413, 429 rate limit or invalid model on Groq
        err_msg = str(e).lower()
        if not is_openrouter and any(k in err_msg for k in ["model_not_found", "does not exist", "404", "413", "429", "rate_limit", "too large"]):
            is_rate_limited = "429" in err_msg or "rate_limit" in err_msg
            if is_rate_limited:
                logger.info("Rate limit hit on Groq. Waiting 3s before fallback model...")
                time.sleep(3.0)

            groq_fallbacks = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "qwen/qwen3.8-27b"]
            for fb_model in groq_fallbacks:
                if fb_model != model:
                    logger.info(f"Retrying with alternative Groq model '{fb_model}'...")
                    try:
                        fb_kwargs = dict(kwargs)
                        if "qwen" in fb_model.lower():
                            fb_kwargs["max_tokens"] = min(fb_kwargs.get("max_tokens", 600), 600)
                        else:
                            fb_kwargs["max_tokens"] = max(fb_kwargs.get("max_tokens", 1500), 1200)

                        if response_format:
                            return client.chat.completions.create(
                                model=fb_model,
                                messages=messages,
                                response_format=response_format,
                                **fb_kwargs
                            )
                        else:
                            return client.chat.completions.create(
                                model=fb_model,
                                messages=messages,
                                **fb_kwargs
                            )
                    except Exception as fb_err:
                        logger.warning(f"Alternative Groq model '{fb_model}' failed: {fb_err}")
                        continue
        
        # If JSON mode failed, try retrying without response_format and parse robustly in caller
        if response_format and response_format.get("type") == "json_object":
            logger.info("Retrying without JSON mode constraint...")
            
            fallback_messages = list(messages)
            if fallback_messages:
                system_found = False
                for idx, msg in enumerate(fallback_messages):
                    if msg.get("role") == "system":
                        fallback_messages[idx] = {
                            "role": "system",
                            "content": msg["content"] + "\n\nIMPORTANT: You must return ONLY a raw, valid JSON object matching the requested schema. Do not enclose the output in markdown code blocks like ```json."
                        }
                        system_found = True
                        break
                if not system_found:
                    fallback_messages.insert(0, {
                        "role": "system",
                        "content": "You are a helpful assistant. You must return ONLY a raw, valid JSON object. Do not wrap the JSON output in markdown code blocks."
                    })
            
            if extra_body and "provider" in extra_body:
                extra_body["provider"].pop("require_parameters", None)
                
            return client.chat.completions.create(
                model=model,
                messages=fallback_messages,
                extra_body=extra_body,
                **kwargs
            )
        else:
            raise e
