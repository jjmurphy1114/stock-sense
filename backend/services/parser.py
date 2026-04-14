"""
Slippi replay file parser using py-slippi library.
Handles loading and extracting basic data from .slp files.
"""

from slippi import Game
from typing import Optional, Dict, Any


class ReplayParseError(Exception):
    """Raised when a replay file cannot be parsed as a valid Slippi game."""


def load_replay(file_path: str) -> Game:
    """
    Load a Slippi replay file and return a Game object.
    
    Args:
        file_path: Path to the .slp replay file
        
    Returns:
        Game object if successful

    Raises:
        ReplayParseError: If parsing fails
    """
    try:
        game = Game(file_path)
        return game
    except Exception as e:
        raise ReplayParseError(str(e)) from e


def extract_metadata(game: Game) -> Dict[str, Any]:
    """
    Extract basic metadata from a loaded replay.
    
    Args:
        game: Loaded Game object from py-slippi
        
    Returns:
        Dictionary containing player info, characters, and basic game info
    """
    metadata = {}
    
    try:
        # Extract start state which contains player and character information
        start = game.start
        
        if start and hasattr(start, 'players'):
            players_info = []
            for player_idx, player in enumerate(start.players):
                if player:
                    player_data = {
                        "player_index": player_idx,
                        "character": player.character.name if hasattr(player.character, 'name') else str(player.character),
                        "tag": player.tag if hasattr(player, 'tag') else "Unknown",
                        "is_cpu": player.is_cpu if hasattr(player, 'is_cpu') else False,
                        "stocks_left": None,
                        "did_win": False,
                    }
                    players_info.append(player_data)
            
            metadata["players"] = players_info
            metadata["num_players"] = len(players_info)
        
        # Extract stage information
        if start and hasattr(start, 'stage'):
            metadata["stage"] = start.stage.name if hasattr(start.stage, 'name') else str(start.stage)

        final_standings = _extract_final_standings(game)
        if final_standings:
            winner_idx = final_standings.get("winner_player_index")
            metadata["winner_player_index"] = winner_idx
            metadata["winner_name"] = final_standings.get("winner_name")

            stocks_by_player = final_standings.get("stocks_by_player", {})
            for player_data in metadata.get("players", []):
                player_idx = player_data.get("player_index")
                player_data["stocks_left"] = stocks_by_player.get(player_idx)
                player_data["did_win"] = player_idx == winner_idx
        
    except Exception as e:
        print(f"Error extracting metadata: {e}")
        metadata["error"] = str(e)
    
    return metadata


def get_frame_count(game: Game) -> int:
    """
    Get total number of frames in the replay.
    
    Args:
        game: Loaded Game object from py-slippi
        
    Returns:
        Total frame count
    """
    try:
        frames = game.frames
        if frames:
            return len(frames)
        return 0
    except Exception as e:
        print(f"Error getting frame count: {e}")
        return 0


def _extract_final_standings(game: Game) -> Dict[str, Any]:
    frames = getattr(game, "frames", None)
    if frames is None:
        return {}

    final_frame = None
    if isinstance(frames, dict):
        frame_values = list(frames.values())
    else:
        frame_values = list(frames)

    for frame in reversed(frame_values):
        if frame is not None:
            final_frame = frame
            break

    if final_frame is None:
        return {}

    player_container = getattr(final_frame, "ports", None) or getattr(final_frame, "players", None)
    if not player_container:
        return {}

    stocks_by_player: Dict[int, int] = {}
    percents_by_player: Dict[int, float] = {}
    winner_idx = None
    winner_name = None

    iterable = player_container.items() if isinstance(player_container, dict) else enumerate(player_container)
    for raw_idx, player in iterable:
        player_idx = raw_idx.value if hasattr(raw_idx, "value") else int(raw_idx)
        resolved_player = getattr(player, "leader", None) or player
        post = getattr(resolved_player, "post", None)
        if post is None:
            continue

        stocks = getattr(post, "stocks", None)
        percent = getattr(post, "percent", None)
        if stocks is None:
            continue

        try:
            stocks_int = int(stocks)
        except (TypeError, ValueError):
            continue

        stocks_by_player[player_idx] = stocks_int

        try:
            percents_by_player[player_idx] = float(percent) if percent is not None else 9999.0
        except (TypeError, ValueError):
            percents_by_player[player_idx] = 9999.0

    if not stocks_by_player:
        return {}

    sorted_players = sorted(
        stocks_by_player.keys(),
        key=lambda idx: (-stocks_by_player[idx], percents_by_player.get(idx, 9999.0), idx),
    )
    if sorted_players:
        top_idx = sorted_players[0]
        tied_top = [
            idx for idx in sorted_players
            if stocks_by_player[idx] == stocks_by_player[top_idx]
            and percents_by_player.get(idx, 9999.0) == percents_by_player.get(top_idx, 9999.0)
        ]
        if len(tied_top) == 1:
            winner_idx = top_idx

    start = getattr(game, "start", None)
    start_players = getattr(start, "players", None) if start is not None else None
    if winner_idx is not None and start_players and winner_idx < len(start_players):
        winner_player = start_players[winner_idx]
        if winner_player is not None:
            tag = getattr(winner_player, "tag", "") or ""
            winner_name = tag.strip() if isinstance(tag, str) and tag.strip() else f"Player {winner_idx + 1}"

    return {
        "winner_player_index": winner_idx,
        "winner_name": winner_name,
        "stocks_by_player": stocks_by_player,
    }
