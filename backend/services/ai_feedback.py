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

_BATCH_SYSTEM_PROMPT = (
    "You are an expert Super Smash Bros. Melee coach. Given per-player stats from multiple replays, "
    "identify 4-6 recurring patterns and prioritize the highest-leverage improvements across the session. "
    "Reference specific numbers and note trends (e.g. consistently low l-cancel rate, improving neutral win rate). "
    "Avoid generic advice. Return only a JSON array of strings, no preamble or markdown."
)


def _build_ai_stats(
    stats: Dict[str, Any],
    user_tag: str | None,
    player_index: int | None = None,
) -> Dict[str, Any]:
    per_player = stats.get("per_player", [])
    if player_index is not None:
        match = next((p for p in per_player if p.get("player_index") == player_index), None)
        if match:
            per_player = [match]
    elif user_tag:
        normalized = user_tag.strip().upper()
        match = next(
            (p for p in per_player if p.get("player_name", "").strip().upper() == normalized),
            None,
        )
        if match:
            per_player = [match]

    return {
        "match_duration_seconds": stats.get("match_duration_seconds"),
        "per_player": per_player,
    }


async def generate_ai_feedback(
    stats: Dict[str, Any],
    user_tag: str | None = None,
    player_index: int | None = None,
) -> List[str]:
    client = anthropic.AsyncAnthropic()
    try:
        ai_stats = _build_ai_stats(stats, user_tag, player_index)
        message = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": json.dumps(ai_stats)}],
        )
        text = message.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        result = json.loads(text)
        if isinstance(result, list) and all(isinstance(item, str) for item in result):
            return result
        logger.error("AI feedback response was not a list of strings: %s", result)
        return []
    except Exception:
        logger.exception("Error generating AI feedback")
        return []


async def generate_ai_batch_feedback(
    all_stats: List[Dict[str, Any]],
    user_tag: str | None = None,
) -> List[str]:
    games = [_build_ai_stats(s, user_tag) for s in all_stats]
    games = [g for g in games if g["per_player"]]
    if not games:
        return []

    client = anthropic.AsyncAnthropic()
    try:
        message = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=_BATCH_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": json.dumps({"games": games})}],
        )
        text = message.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        result = json.loads(text)
        if isinstance(result, list) and all(isinstance(item, str) for item in result):
            return result
        logger.error("AI batch feedback response was not a list of strings: %s", result)
        return []
    except Exception:
        logger.exception("Error generating AI batch feedback")
        return []
