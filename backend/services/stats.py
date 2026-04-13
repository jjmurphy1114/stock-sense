"""
Stats extraction from loaded Slippi replays.
Computes basic statistics about player actions and game length.
"""

from slippi import Game
from typing import Dict, Any


def extract_stats(game: Game) -> Dict[str, Any]:
    """
    Extract basic stats from a loaded replay.
    
    Args:
        game: Loaded Game object from py-slippi
        
    Returns:
        Dictionary containing total_frames, total_actions, and other stats
    """
    stats = {
        "total_frames": 0,
        "total_actions": 0,
        "match_duration_seconds": 0.0,
        "players_per_frame": 0,
    }
    
    try:
        frames = game.frames
        if not frames:
            return stats
        
        total_frames = len(frames)
        stats["total_frames"] = total_frames
        
        # Count valid player states (actions) across all frames
        total_actions = 0
        
        for frame in frames:
            if frame is None:
                continue
            
            # Check players data if it exists
            if hasattr(frame, 'players') and frame.players:
                for player in frame.players:
                    if player is not None:
                        total_actions += 1
        
        stats["total_actions"] = total_actions
        
        # Calculate match duration (assuming 60 FPS standard for Melee)
        stats["match_duration_seconds"] = round(total_frames / 60, 2)
        
        # Calculate average players per frame
        if total_frames > 0:
            stats["players_per_frame"] = round(total_actions / total_frames, 2)
        
    except Exception as e:
        print(f"Error extracting stats: {e}")
        stats["error"] = str(e)
    
    return stats


def calculate_action_efficiency(stats: Dict[str, Any]) -> float:
    """
    Simple metric: actions per second.
    Higher value = more active gameplay.
    
    Args:
        stats: Dictionary from extract_stats()
        
    Returns:
        Actions per second (0 if no duration)
    """
    if stats.get("match_duration_seconds", 0) == 0:
        return 0.0
    
    actions_per_second = stats["total_actions"] / stats["match_duration_seconds"]
    return round(actions_per_second, 2)
