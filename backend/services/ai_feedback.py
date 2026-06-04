import json
import logging
from typing import Any, Dict, List

import anthropic

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = (
    "You are an expert Super Smash Bros. Melee coach. Given structured per-player stats from a Slippi replay, "
    "generate 4-6 concise, specific coaching notes. Prioritize the highest-leverage improvements. "
    "Reference specific numbers. Avoid generic advice. "
    "Return only a JSON array of strings, no preamble or markdown."
)


async def generate_ai_feedback(stats: Dict[str, Any]) -> List[str]:
    client = anthropic.AsyncAnthropic()
    try:
        message = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": json.dumps(stats)}],
        )
        text = message.content[0].text
        result = json.loads(text)
        if isinstance(result, list) and all(isinstance(item, str) for item in result):
            return result
        logger.error("AI feedback response was not a list of strings: %s", result)
        return []
    except Exception as exc:
        logger.error("Error generating AI feedback: %s", exc)
        return []
