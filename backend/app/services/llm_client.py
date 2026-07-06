import json
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

def parse_json_robust(text: str) -> Dict[str, Any]:
    """
    Parses a JSON object robustly by handling markdown code fences
    and extracting content between the first '{' and last '}'.
    """
    cleaned = text.strip()
    
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
    if start_idx != -1 and end_idx != -1:
        cleaned = cleaned[start_idx:end_idx + 1]
    
    return json.loads(cleaned)

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
        logger.warning(f"Initial chat completion failed: {e}.")
        
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
