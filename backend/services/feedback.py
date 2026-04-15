"""
Simple rule-based feedback engine for coaching.
Generates actionable feedback based on replay stats.
"""

from typing import Dict, Any, List


def _player_label(player: Dict[str, Any]) -> str:
    return player.get("player_name") or f"Player {int(player.get('player_index', 0)) + 1}"


def _metric(player: Dict[str, Any], key: str, fallback: float = 0.0) -> float:
    value = player.get(key, fallback)
    return float(value if value is not None else fallback)


def _opening_efficiency(player: Dict[str, Any]) -> float:
    openings_per_kill = player.get("openings_per_kill")
    if openings_per_kill in (None, 0):
        return float("inf")
    return float(openings_per_kill)


def _append_openings_per_kill_feedback(feedback: List[str], players: List[Dict[str, Any]]) -> None:
    valid_players = [player for player in players if player.get("openings_per_kill") is not None]
    if not valid_players:
        return

    for player in valid_players:
        openings_per_kill = _opening_efficiency(player)
        if openings_per_kill <= 3:
            feedback.append(
                f"⚡ {_player_label(player)} is converting well at {player['openings_per_kill']} openings per kill. That stock-ending efficiency is match-winning."
            )
        elif openings_per_kill >= 5:
            feedback.append(
                f"⚠️ {_player_label(player)} is needing {player['openings_per_kill']} openings per kill. Sharper confirms and edgeguards would change the set fast."
            )


def _append_execution_feedback(feedback: List[str], players: List[Dict[str, Any]]) -> None:
    for player in players:
        issues: List[str] = []

        if _metric(player, "l_cancel_rate") < 40 and int(player.get("l_cancel_attempts", 0) or 0) >= 4:
            issues.append(
                f"l-cancels are only at {player.get('l_cancel_rate', 0)}%"
            )
        if _metric(player, "tech_miss_rate") > 50 and int(player.get("tech_attempts", 0) or 0) >= 4:
            issues.append(
                f"tech defense is missing at {player.get('tech_miss_rate', 0)}%"
            )

        if issues:
            feedback.append(
                f"🧠 {_player_label(player)} has a direct execution swing here: {' and '.join(issues)}."
            )


def _matchup_key(player: Dict[str, Any], opponent: Dict[str, Any]) -> tuple[str, str]:
    return (
        str(player.get("character", "Unknown") or "Unknown").upper(),
        str(opponent.get("character", "Unknown") or "Unknown").upper(),
    )


def _metric_delta(player: Dict[str, Any], opponent: Dict[str, Any], key: str, fallback: float = 0.0) -> float:
    return _metric(player, key, fallback) - _metric(opponent, key, fallback)


def _is_kill_conversion_strong(player: Dict[str, Any], opponent: Dict[str, Any]) -> bool:
    player_opk = _opening_efficiency(player)
    opponent_opk = _opening_efficiency(opponent)
    return player_opk != float("inf") and (opponent_opk == float("inf") or player_opk + 1 <= opponent_opk)


def _met_conditions_text(items: List[str]) -> str:
    if not items:
        return "did not clearly hit the main matchup benchmarks"
    if len(items) == 1:
        return f"did hit the key benchmark of {items[0]}"
    return f"hit key matchup benchmarks in {', '.join(items[:-1])}, and {items[-1]}"


def _missed_condition_text(items: List[str]) -> str | None:
    return items[0] if items else None


def _matchup_plan_feedback(player: Dict[str, Any], opponent: Dict[str, Any]) -> str | None:
    player_char, opponent_char = _matchup_key(player, opponent)
    label = _player_label(player)
    neutral = _metric(player, "neutral_win_rate")
    damage = _metric(player, "damage_per_opening")
    movement = _metric(player, "movement_ratio")
    opk = player.get("openings_per_kill", "N/A")
    tech_miss = _metric(player, "tech_miss_rate")

    matchup_templates: Dict[tuple[str, str], Dict[str, str]] = {
        ("FOX", "MARTH"): {
            "goal": "beat dash-dance control with movement pressure and close before edgeguards matter",
            "neutral_win": "winning enough first hits to stop Marth from setting the pace",
            "punish": "getting real damage each time Fox breaks in",
            "kill": "closing before Marth survives into another edgeguard cycle",
            "movement": "staying mobile enough to threaten overshoots and whiff punishes",
        },
        ("MARTH", "FOX"): {
            "goal": "control center, anti-air Fox's entries, and make offstage sequences decisive",
            "neutral_win": "owning more of the first-hit exchanges with spacing and dash dance",
            "punish": "turning starters into juggles or edgeguards instead of resets",
            "kill": "keeping Fox's openings-per-kill low with cleaner closes",
            "movement": "using grounded movement to keep Fox boxed out",
        },
        ("FOX", "FALCO"): {
            "goal": "take space through lasers and punish Falco harder than he punishes back",
            "neutral_win": "not letting laser tempo decide every neutral start",
            "punish": "out-damaging Falco once Fox gets in",
            "kill": "ending stocks before Falco snowballs another platform sequence",
            "movement": "using mobility to deny static laser setups",
        },
        ("FALCO", "FOX"): {
            "goal": "lock Fox down with laser pace and turn openings into long punish trees",
            "neutral_win": "forcing awkward shields, jumps, or corner positions",
            "punish": "making each laser-confirm opening hurt enough to matter",
            "kill": "cash out before Fox reclaims center and scrambles out",
            "movement": "moving just enough to keep laser pressure threatening, not reckless",
        },
        ("FOX", "SHEIK"): {
            "goal": "pressure without giving away grab and convert stray hits before Sheik stabilizes",
            "neutral_win": "getting in first more often than Sheik gets grab pace",
            "punish": "making non-grab starters count",
            "kill": "closing stocks before Sheik's edgeguard game reasserts itself",
            "movement": "using speed to crowd Sheik without overcommitting",
        },
        ("SHEIK", "FOX"): {
            "goal": "turn grabs and knockdowns into stock-ending control",
            "neutral_win": "slowing Fox into grounded scramble or grab states",
            "punish": "getting enough reward off grab and tilt starters",
            "kill": "keeping Fox from escaping too many edgeguard or tech-chase situations",
            "movement": "staying grounded and stable rather than trying to race Fox",
        },
        ("FOX", "JIGGLYPUFF"): {
            "goal": "chip safely, stay disciplined, and convert enough to close without overextending",
            "neutral_win": "earning enough openings without giving Puff huge reversals",
            "punish": "stacking safe reward instead of low-value touches",
            "kill": "actually finishing after winning neutral repeatedly",
            "movement": "using mobility to control air lanes without panic swinging",
        },
        ("JIGGLYPUFF", "FOX"): {
            "goal": "stretch the game, win the air-space battle, and make each read decisive",
            "neutral_win": "forcing Fox to overreach into Puff's drift traps",
            "punish": "making openings count enough that Puff can win on fewer touches",
            "kill": "turning reads or edgeguards into stocks before Fox escapes",
            "movement": "using drift and spacing rather than grounded scramble speed",
        },
        ("FOX", "PEACH"): {
            "goal": "crowd Peach early, keep her cornered, and end stocks before trades take over",
            "neutral_win": "denying float comfort by striking first often enough",
            "punish": "getting meaningful reward before Peach can crouch-cancel or trade back",
            "kill": "closing quickly instead of letting Peach live through repeated wins",
            "movement": "staying active enough to keep Peach from setting the tempo",
        },
        ("PEACH", "FOX"): {
            "goal": "survive the opening storm, drag Fox into grounded scraps, and squeeze value from every opening",
            "neutral_win": "weathering Fox's pace well enough to fight on Peach's terms",
            "punish": "getting better per-touch reward than Fox",
            "kill": "not needing too many openings once Peach finally gets control",
            "movement": "using measured movement rather than trying to race Fox",
        },
    }

    template = matchup_templates.get((player_char, opponent_char))
    if template is None:
        return None

    strengths: List[str] = []
    misses: List[str] = []

    if _metric_delta(player, opponent, "neutral_win_rate") >= 6:
        strengths.append(template["neutral_win"])
    else:
        misses.append(template["neutral_win"])

    if _metric_delta(player, opponent, "damage_per_opening") >= 6:
        strengths.append(template["punish"])
    else:
        misses.append(template["punish"])

    if _is_kill_conversion_strong(player, opponent):
        strengths.append(template["kill"])
    elif player.get("openings_per_kill") is not None:
        misses.append(template["kill"])

    if _metric_delta(player, opponent, "movement_ratio") >= 8:
        strengths.append(template["movement"])
    elif player_char in {"FOX", "FALCO", "CAPTAIN_FALCON", "JIGGLYPUFF"}:
        misses.append(template["movement"])

    outcome = _met_conditions_text(strengths)
    biggest_miss = _missed_condition_text(misses)

    sentence = (
        f"🎮 In {player.get('character')} vs {opponent.get('character')}, {label} wants to {template['goal']}. "
        f"This replay {outcome}."
    )

    if biggest_miss:
        sentence += f" The main matchup leak was {biggest_miss}."

    sentence += (
        f" Stat line: {neutral}% neutral wins, {damage} damage/opening, "
        f"{opk} openings/kill, and {movement}% movement."
    )

    if tech_miss > 50 and int(player.get("tech_attempts", 0) or 0) >= 4:
        sentence += " Tech misses also made the matchup harder to stabilize."

    return sentence


def _character_plan_feedback(player: Dict[str, Any], opponent: Dict[str, Any]) -> str:
    character = str(player.get("character", "Unknown") or "Unknown").upper()
    label = _player_label(player)
    movement_ratio = _metric(player, "movement_ratio")
    apm = _metric(player, "actions_per_minute")
    neutral = _metric(player, "neutral_win_rate")
    damage = _metric(player, "damage_per_opening")
    openings_per_kill = player.get("openings_per_kill")
    l_cancel_rate = _metric(player, "l_cancel_rate")
    opponent_damage = _metric(opponent, "damage_per_opening")
    opponent_neutral = _metric(opponent, "neutral_win_rate")

    if character in {"FOX", "FALCO"}:
        return (
            f"🦊 {label}'s {player.get('character')} game is healthiest when speed turns into punish. "
            f"Here the key reads are {apm} APM, {movement_ratio}% movement, and {damage} damage per opening."
        )

    if character == "CAPTAIN_FALCON":
        return (
            f"🏇 {label}'s Falcon wins by forcing burst openings and making them hurt. "
            f"The higher-level checks are movement pace at {movement_ratio}%, neutral at {neutral}%, and punish reward at {damage}."
        )

    if character in {"MARTH", "ROY"}:
        return (
            f"🗡️ {label}'s {player.get('character')} should win through spacing into stock closure. "
            f"Neutral is {neutral}% here, and the real closer is whether {player.get('openings_per_kill', 'N/A')} openings per kill stays low."
        )

    if character == "SHEIK":
        return (
            f"🪡 {label}'s Sheik wants clean neutral into reliable punish. "
            f"Watch neutral wins at {neutral}%, damage per opening at {damage}, and whether tech situations are being punished hard enough."
        )

    if character == "PEACH":
        return (
            f"🍑 {label}'s Peach succeeds by slowing the game down and winning big off fewer touches. "
            f"The high-level markers are {damage} damage per opening versus {opponent_damage} for the opponent, plus {player.get('openings_per_kill', 'N/A')} openings per kill."
        )

    if character == "JIGGLYPUFF":
        return (
            f"🎈 {label}'s Puff usually wins by staying slippery and making each opening count. "
            f"Neutral is {neutral}% here, punish reward is {damage}, and stock conversion sits at {player.get('openings_per_kill', 'N/A')} openings per kill."
        )

    if character in {"SAMUS", "LUIGI", "YOSHI"}:
        return (
            f"🛡️ {label}'s {player.get('character')} wants sturdy neutral and heavy reward once advantage starts. "
            f"Right now that shows up as {neutral}% neutral wins and {damage} damage per opening."
        )

    if character in {"PIKACHU", "PICHU"}:
        return (
            f"⚡ {label}'s {player.get('character')} is strongest when movement creates early hits that become edgeguard pressure. "
            f"The useful checks are {movement_ratio}% movement, {neutral}% neutral wins, and {player.get('openings_per_kill', 'N/A')} openings per kill."
        )

    if character in {"LINK", "YOUNG_LINK", "YLINK"}:
        return (
            f"🏹 {label}'s {player.get('character')} should turn space control into cleaner confirms. "
            f"If neutral is {neutral}% but openings per kill drift upward, the set is slipping after the first win."
        )

    if character == "ICE_CLIMBERS":
        return (
            f"🧊 {label}'s Ice Climbers game should feel brutally efficient once a grab or opening starts. "
            f"The headline numbers are {damage} damage per opening and {player.get('openings_per_kill', 'N/A')} openings per kill."
        )

    if damage >= opponent_damage + 8:
        return (
            f"📈 {label}'s character is getting real mileage from each touch at {damage} damage per opening. "
            f"That punish advantage is a core reason the game is working."
        )

    if neutral >= opponent_neutral + 6:
        return (
            f"🎯 {label}'s character gameplan is working most through neutral control right now at {neutral}% wins. "
            f"Turning that into cleaner stock conversion is the next ceiling."
        )

    return (
        f"📊 {label}'s higher-level character read is balanced: {neutral}% neutral wins, {damage} damage per opening, "
        f"{player.get('openings_per_kill', 'N/A')} openings per kill, and {l_cancel_rate}% l-cancels."
    )


def _append_character_specific_feedback(feedback: List[str], players: List[Dict[str, Any]]) -> None:
    if len(players) != 2:
        return

    player_a, player_b = players
    matchup_a = _matchup_plan_feedback(player_a, player_b)
    matchup_b = _matchup_plan_feedback(player_b, player_a)

    if matchup_a:
        feedback.append(matchup_a)
    else:
        feedback.append(_character_plan_feedback(player_a, player_b))

    if matchup_b:
        feedback.append(matchup_b)
    else:
        feedback.append(_character_plan_feedback(player_b, player_a))


def _append_match_flow_feedback(feedback: List[str], stats: Dict[str, Any]) -> None:
    players = stats.get("per_player", [])
    if not players:
        return

    if len(players) != 2:
        for player in players:
            feedback.append(
                f"🎯 {_player_label(player)} should build winning positions around {player.get('damage_per_opening', 0)} damage per opening and {player.get('neutral_win_rate', 0)}% neutral wins."
            )
        return

    player_a, player_b = players

    def _style_summary(player: Dict[str, Any], opponent: Dict[str, Any]) -> str:
        strengths: List[str] = []

        neutral_gap = _metric(player, "neutral_win_rate") - _metric(opponent, "neutral_win_rate")
        punish_gap = _metric(player, "damage_per_opening") - _metric(opponent, "damage_per_opening")
        kill_gap = _opening_efficiency(opponent) - _opening_efficiency(player)
        movement_gap = _metric(player, "movement_ratio") - _metric(opponent, "movement_ratio")

        if neutral_gap >= 6:
            strengths.append("winning more first interactions")
        if punish_gap >= 8:
            strengths.append("getting stronger reward once neutral is won")
        if kill_gap >= 1:
            strengths.append("closing stocks in fewer openings")
        if movement_gap >= 8:
            strengths.append("using movement to create cleaner approaches")
        elif movement_gap <= -8:
            strengths.append("pressuring with a more direct attack-heavy pace")

        if not strengths:
            strengths.append("staying competitive in each phase without one huge edge")

        return f"🎯 {_player_label(player)}'s successful match looks like {', '.join(strengths[:2])}."

    def _focus_summary(player: Dict[str, Any], opponent: Dict[str, Any]) -> str:
        label = _player_label(player)
        improvements: List[str] = []

        if _metric(player, "neutral_win_rate") + 6 <= _metric(opponent, "neutral_win_rate"):
            improvements.append("earn more first hits instead of playing from behind")
        if _metric(player, "damage_per_opening") + 8 <= _metric(opponent, "damage_per_opening"):
            improvements.append("convert openings into bigger punishes")

        player_opk = _opening_efficiency(player)
        opponent_opk = _opening_efficiency(opponent)
        if player_opk != float("inf") and player_opk >= opponent_opk + 1:
            improvements.append("finish stocks sooner once advantage starts")
        elif player.get("kills_secured", 0) == 0 and _metric(player, "openings_won") > 0:
            improvements.append("turn won neutral exchanges into actual stock threats")

        if _metric(player, "l_cancel_rate") < 40 and int(player.get("l_cancel_attempts", 0) or 0) >= 4:
            improvements.append("clean up aerial execution with better l-cancel timing")
        if _metric(player, "tech_miss_rate") > 50 and int(player.get("tech_attempts", 0) or 0) >= 4:
            improvements.append("stabilize defense by hitting more techs")

        if not improvements:
            improvements.append("keep reinforcing the parts of the game that already worked")

        return f"🛠️ {label}'s next step is to {improvements[0]}."

    feedback.append(_style_summary(player_a, player_b))
    feedback.append(_focus_summary(player_a, player_b))
    feedback.append(_style_summary(player_b, player_a))
    feedback.append(_focus_summary(player_b, player_a))


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
    
    if total_frames == 0:
        return ["⚠️ Invalid replay: No frames detected."]

    if players_per_frame < 1.5:
        feedback.append("⚠️ One or more players had very few recorded actions. Check replay validity.")

    if duration < 30 and total_actions > 0:
        feedback.append("⏱️ Short game sample. Treat these notes as directionally useful, but verify patterns over multiple replays.")
    elif duration > 300:
        feedback.append("🔄 Long set pace. Endurance and decision quality over time mattered here.")

    _append_match_flow_feedback(feedback, stats)
    _append_openings_per_kill_feedback(feedback, stats.get("per_player", []))
    _append_execution_feedback(feedback, stats.get("per_player", []))
    _append_character_specific_feedback(feedback, stats.get("per_player", []))
    
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
