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
                        "nametag": player.nametag if hasattr(player, 'nametag') else "Unknown",
                        "is_cpu": player.is_cpu if hasattr(player, 'is_cpu') else False,
                    }
                    players_info.append(player_data)
            
            metadata["players"] = players_info
            metadata["num_players"] = len(players_info)
        
        # Extract stage information
        if start and hasattr(start, 'stage'):
            metadata["stage"] = start.stage.name if hasattr(start.stage, 'name') else str(start.stage)
        
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
