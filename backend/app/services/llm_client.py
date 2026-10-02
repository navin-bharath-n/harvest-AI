import json
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

def parse_json_robust(text: str) -> Dict[str, Any]:
    """
    Parses a JSON object robustly by handling markdown code fences
    and extracting content between the first '{' and last '}'.
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
    
    try:
        data = json.loads(cleaned)
        if isinstance(data, list):
            return data
    except Exception:
        pass

    import re
    strings = re.findall(r'"((?:[^"\\]|\\.)*)"', cleaned)
    if strings:
        return strings

    return []

_CACHED_GROQ_MODEL = None

def get_groq_chat_model(client=None) -> str:
    """
    Dynamically identifies the best available chat model on the Groq endpoint.
    Falls back gracefully through prioritized candidates.
    """
    global _CACHED_GROQ_MODEL
    if _CACHED_GROQ_MODEL:
        return _CACHED_GROQ_MODEL

    candidates = [
        "qwen/qwen3.8-27b",
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "openai/gpt-oss-20b",
        "openai/gpt-oss-120b",
        "mixtral-8x7b-32768",
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
            logger.warning(f"Could not list Groq models: {e}. Defaulting to openai/gpt-oss-120b.")

    _CACHED_GROQ_MODEL = "openai/gpt-oss-120b"
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
    excluding unstable providers (like Novita), and retrying without JSON mode constraints if they fail.
    """
    extra_body = None
    
    if is_openrouter:
        # Define fallback models in priority order
        fallback_models = [
            "qwen/qwen-2.5-72b-instruct",
            "google/gemini-2.5-flash",
            "meta-llama/llama-3.3-70b-instruct"
        ]
        
        # Ensure the requested model is at the front of the list
        if model in fallback_models:
            fallback_models.remove(model)
        fallback_models.insert(0, model)
        
        extra_body = {
            "models": fallback_models,
            "provider": {
                "ignore": ["Novita"]  # Ignore Novita as they return 400 Bad Request for JSON mode and completion endpoints
            }
        }
        
        if response_format and response_format.get("type") == "json_object":
            extra_body["provider"]["require_parameters"] = True

    # On Groq, on-demand tier enforces OTPM limits (1000 for Qwen).
    # Keep max_tokens bounded so Groq does not reject requests upfront with 429.
    if not is_openrouter:
        if "max_tokens" not in kwargs:
            kwargs["max_tokens"] = 500
        elif kwargs["max_tokens"] > 800 and "qwen" in model.lower():
            kwargs["max_tokens"] = 500

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

        # Check if error is 404 / 413 / 429 / rate limit / model not found on non-openrouter client (e.g. Groq)
        err_msg = str(e).lower()
        if not is_openrouter and any(k in err_msg for k in ["model_not_found", "does not exist", "404", "413", "429", "rate_limit", "too large"]):
            groq_fallbacks = ["qwen/qwen3.8-27b", "openai/gpt-oss-20b", "openai/gpt-oss-120b"]
            for fb_model in groq_fallbacks:
                if fb_model != model:
                    logger.info(f"Retrying with alternative model '{fb_model}'...")
                    try:
                        if response_format:
                            return client.chat.completions.create(
                                model=fb_model,
                                messages=messages,
                                response_format=response_format,
                                **kwargs
                            )
                        else:
                            return client.chat.completions.create(
                                model=fb_model,
                                messages=messages,
                                **kwargs
                            )
                    except Exception as fb_err:
                        logger.warning(f"Alternative model '{fb_model}' failed: {fb_err}")
                        continue
        
        # If JSON mode failed, try retrying without response_format and parse robustly in caller
        if response_format and response_format.get("type") == "json_object":
            logger.info("Retrying without JSON mode constraint...")
            
            # Append manual JSON instruction to the system or user message
            fallback_messages = list(messages)
            if fallback_messages:
                # If there's a system message, modify it. Otherwise, add a system message.
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
            
            # Disable require_parameters since we're not using json_object response_format anymore
            if extra_body and "provider" in extra_body:
                extra_body["provider"].pop("require_parameters", None)
                
            return client.chat.completions.create(
                model=model,
                messages=fallback_messages,
                extra_body=extra_body,
                **kwargs
            )
        else:
            # Raise the exception if it was a non-JSON call failure
            raise e
