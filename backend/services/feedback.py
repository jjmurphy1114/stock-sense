"""
Simple rule-based feedback engine for coaching.
Generates actionable feedback based on replay stats.
"""

from typing import Dict, Any, List


def generate_feedback(stats: Dict[str, Any]) -> List[str]:
    """
    Generate coaching feedback based on extracted stats.
    
    Args:
        stats: Dictionary from extract_stats()
        
    Returns:
        List of feedback strings
    """
    feedback = []
    
    if not stats:
        return ["Unable to analyze replay."]
    
    # Check for errors
    if "error" in stats:
        return [f"Error analyzing replay: {stats['error']}"]
    
    total_actions = stats.get("total_actions", 0)
    total_frames = stats.get("total_frames", 0)
    duration = stats.get("match_duration_seconds", 0)
    players_per_frame = stats.get("players_per_frame", 0)
    
    # Rule 1: Check action intensity
    if total_actions < 100:
        feedback.append("🔴 Low action count detected. You may not be interacting enough with your opponent.")
    elif total_actions < 300:
        feedback.append("🟡 Moderate action count. Consider being more proactive during gameplay.")
    else:
        feedback.append("🟢 Good action intensity! You're maintaining active gameplay.")
    
    # Rule 2: Check match duration
    if total_frames == 0:
        feedback.append("⚠️ Invalid replay: No frames detected.")
    elif duration < 30:
        feedback.append("⏱️ Quick match! Work on extending your neutral game.")
    elif duration > 300:
        feedback.append("🔄 Long match (5+ minutes). Focus on decision-making consistency.")
    else:
        feedback.append("✓ Match duration is typical for competitive play.")
    
    # Rule 3: Check player engagement
    if players_per_frame < 1.5:
        feedback.append("⚠️ One or more players had very few recorded actions. Check replay validity.")
    
    # Rule 4: Overall assessment
    efficiency = stats.get("total_actions", 0) / max(stats.get("match_duration_seconds", 1), 1)
    if efficiency > 5:
        feedback.append("💪 Excellent pace! You're keeping the game moving.")
    elif efficiency < 2 and total_frames > 0:
        feedback.append("📊 Consider increasing your action frequency for more control.")
    
    return feedback


def format_feedback_response(stats: Dict[str, Any], feedback_list: List[str]) -> Dict[str, Any]:
    """
    Format stats and feedback into a clean JSON response.
    
    Args:
        stats: Dictionary from extract_stats()
        feedback_list: List from generate_feedback()
        
    Returns:
        Formatted response dictionary
    """
    return {
        "stats": {
            "total_frames": stats.get("total_frames", 0),
            "total_actions": stats.get("total_actions", 0),
            "match_duration_seconds": stats.get("match_duration_seconds", 0),
            "players_per_frame": stats.get("players_per_frame", 0),
        },
        "feedback": feedback_list,
        "summary": "Replay analysis complete." if not any("error" in str(f).lower() for f in feedback_list) else "Analysis completed with warnings.",
    }
