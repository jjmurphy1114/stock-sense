"""
Simple rule-based feedback engine for coaching.
Generates actionable feedback based on replay stats.
"""

from typing import Dict, Any, List


def _player_label(player: Dict[str, Any]) -> str:
    return player.get("player_name") or f"Player {int(player.get('player_index', 0)) + 1}"


def _append_high_level_player_feedback(feedback: List[str], stats: Dict[str, Any]) -> None:
    players = stats.get("per_player", [])
    if not players:
        return

    ranked_by_neutral = sorted(
        players,
        key=lambda player: float(player.get("neutral_win_rate", 0.0) or 0.0),
        reverse=True,
    )
    neutral_leader = ranked_by_neutral[0]
    if len(ranked_by_neutral) > 1:
        neutral_gap = float(neutral_leader.get("neutral_win_rate", 0.0) or 0.0) - float(
            ranked_by_neutral[1].get("neutral_win_rate", 0.0) or 0.0
        )
        if neutral_gap >= 8:
            feedback.append(
                f"🎯 {_player_label(neutral_leader)} controlled neutral more often. If that is you, keep trusting your first threatening position; if not, focus on cleaner first commits."
            )

    punish_leader = max(
        players,
        key=lambda player: float(player.get("damage_per_opening", 0.0) or 0.0),
    )
    if float(punish_leader.get("damage_per_opening", 0.0) or 0.0) >= 35:
        feedback.append(
            f"🔥 {_player_label(punish_leader)} got strong reward per opening. That usually means confirms and extensions are converting well."
        )

    punish_lagger = min(
        players,
        key=lambda player: float(player.get("damage_per_opening", 0.0) or 0.0),
    )
    if (
        len(players) > 1
        and float(punish_lagger.get("damage_per_opening", 0.0) or 0.0) <= 18
        and punish_lagger is not punish_leader
    ):
        feedback.append(
            f"🛠️ {_player_label(punish_lagger)} is finding openings but not cashing out enough damage. Look for stronger follow-ups after the first clean hit."
        )

    opener_lagger = min(
        players,
        key=lambda player: float(player.get("openings_per_kill", 99.0) or 99.0),
    )
    opener_struggler = max(
        players,
        key=lambda player: float(player.get("openings_per_kill", 99.0) or 99.0),
    )
    struggler_opk = opener_struggler.get("openings_per_kill")
    if isinstance(struggler_opk, (int, float)) and struggler_opk >= 6:
        feedback.append(
            f"⚡ {_player_label(opener_struggler)} needs too many openings to finish stocks. Sharpen kill confirms and edgeguard coverage."
        )
    leader_opk = opener_lagger.get("openings_per_kill")
    if isinstance(leader_opk, (int, float)) and leader_opk <= 3:
        feedback.append(
            f"✅ {_player_label(opener_lagger)} is closing stocks efficiently. The punish game is doing real work."
        )

    defense_leader = max(
        players,
        key=lambda player: float(player.get("defensive_escape_rate", 0.0) or 0.0),
    )
    if float(defense_leader.get("defensive_escape_rate", 0.0) or 0.0) >= 60:
        feedback.append(
            f"🧱 {_player_label(defense_leader)} is escaping disadvantage well. That survivability is creating extra neutral chances."
        )

    defense_struggler = min(
        players,
        key=lambda player: float(player.get("defensive_escape_rate", 100.0) or 100.0),
    )
    if float(defense_struggler.get("defensive_escape_rate", 100.0) or 100.0) <= 35:
        feedback.append(
            f"🚨 {_player_label(defense_struggler)} is getting stuck in disadvantage too long. Prioritize earlier combo exits, DI, and safer landings."
        )

    execution_struggles = [
        player for player in players
        if (
            float(player.get("l_cancel_rate", 100.0) or 100.0) < 35
            or (
                float(player.get("tech_miss_rate", 0.0) or 0.0) > 50
                and int(player.get("tech_attempts", 0) or 0) >= 4
            )
        )
    ]
    for player in execution_struggles[:2]:
        issues = []
        if float(player.get("l_cancel_rate", 100.0) or 100.0) < 35:
            issues.append("l-cancel timing")
        if (
            float(player.get("tech_miss_rate", 0.0) or 0.0) > 50
            and int(player.get("tech_attempts", 0) or 0) >= 4
        ):
            issues.append("tech defense")
        feedback.append(
            f"🧠 {_player_label(player)} can clean up execution in {', '.join(issues)}. Those are direct, high-value practice targets."
        )


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

    _append_high_level_player_feedback(feedback, stats)
    
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
            "per_player": stats.get("per_player", []),
        },
        "feedback": feedback_list,
        "summary": "Replay analysis complete." if not any("error" in str(f).lower() for f in feedback_list) else "Analysis completed with warnings.",
    }
