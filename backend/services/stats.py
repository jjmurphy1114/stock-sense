"""
Stats extraction from loaded Slippi replays.
Computes basic statistics about player actions, game length, and per-player habits.
"""

from slippi import Game
from slippi.event import LCancel
from slippi import id as sid
from typing import Dict, Any, List


AERIAL_KEYWORDS = ("AERIAL", "NAIR", "FAIR", "BAIR", "UAIR", "DAIR")
LANDING_KEYWORDS = ("LAND", "LANDING")
ATTACK_KEYWORDS = (
    "ATTACK",
    "SMASH",
    "TILT",
    "JAB",
    "NAIR",
    "FAIR",
    "BAIR",
    "UAIR",
    "DAIR",
    "SPECIAL",
)
MOVEMENT_KEYWORDS = (
    "WALK",
    "RUN",
    "DASH",
    "JUMP",
    "FALL",
    "LAND",
    "ROLL",
    "SPOTDODGE",
    "AIRDODGE",
    "KNEE_BEND",
    "TURN",
)
KNOCKDOWN_KEYWORDS = (
    "DOWN",
    "DOWNBOUND",
    "DOWNWAIT",
    "DOWNDAMAGE",
    "DOWNSTAND",
)
TECH_SUCCESS_KEYWORDS = ("PASSIVE",)
TECH_MISS_KEYWORDS = (
    "DOWN_BOUND",
    "DOWN_WAIT",
    "DOWN_DAMAGE",
    "DOWN_STAND",
    "DOWN_ATTACK",
    "DOWN_FOWARD",
    "DOWN_BACK",
    "DOWN_SPOT",
    "REBOUND",
)


def _enum_name(value: Any) -> str:
    if value is None:
        return ""

    if isinstance(value, int):
        try:
            return sid.ActionState(value).name.upper()
        except Exception:
            return str(value).upper()

    if hasattr(value, "name"):
        return str(value.name).upper()
    return str(value).upper()


def _extract_state_name(player_state: Any) -> str:
    if player_state is None:
        return ""

    for source in (
        player_state,
        getattr(player_state, "post", None),
        getattr(player_state, "pre", None),
        getattr(player_state, "leader", None),
        getattr(getattr(player_state, "leader", None), "post", None),
        getattr(getattr(player_state, "leader", None), "pre", None),
    ):
        if source is None:
            continue
        action_state = getattr(source, "action_state", None)
        if action_state is None:
            action_state = getattr(source, "state", None)
        if action_state is not None:
            return _enum_name(action_state)

    return ""


def _buttons_from_obj(button_obj: Any) -> List[str]:
    if button_obj is None:
        return []

    if isinstance(button_obj, dict):
        pressed = []
        for key, value in button_obj.items():
            if value:
                pressed.append(str(key).upper())
        return pressed

    if hasattr(button_obj, "pressed") and callable(getattr(button_obj, "pressed")):
        try:
            return [str(button.name).upper() for button in button_obj.pressed()]
        except Exception:
            return []

    for nested_attr in ("logical", "physical"):
        if hasattr(button_obj, nested_attr):
            nested = getattr(button_obj, nested_attr)
            if nested is not None:
                return _buttons_from_obj(nested)

    pressed = []
    for attr in ("l", "r", "z", "L", "R", "Z"):
        if hasattr(button_obj, attr) and bool(getattr(button_obj, attr)):
            pressed.append(attr.upper())
    return pressed


def _pressed_lr_or_z(player_state: Any) -> bool:
    if player_state is None:
        return False

    current_mask = _lrz_mask(player_state)
    return current_mask != 0


def _just_pressed_lr_or_z(player_state: Any, prev_mask: int) -> bool:
    current_mask = _lrz_mask(player_state)
    return (current_mask & ~prev_mask) != 0


def _lrz_mask(player_state: Any) -> int:
    pre = _get_pre_state(player_state)
    if pre is None:
        return 0

    mask = 0
    buttons = getattr(pre, "buttons", None)
    if buttons is not None:
        logical = getattr(buttons, "logical", 0)
        physical = getattr(buttons, "physical", 0)
        logical_int = int(logical) if logical is not None else 0
        physical_int = int(physical) if physical is not None else 0

        for token in ("L", "R", "Z"):
            bit_value = 0
            if hasattr(buttons.__class__.Logical, token):
                bit_value |= int(getattr(buttons.__class__.Logical, token))
            if hasattr(buttons.__class__.Physical, token):
                bit_value |= int(getattr(buttons.__class__.Physical, token))
            if bit_value and ((logical_int & bit_value) or (physical_int & bit_value)):
                mask |= bit_value

    triggers = getattr(pre, "triggers", None)
    if triggers is not None:
        physical = getattr(triggers, "physical", None)
        if physical is not None:
            if float(getattr(physical, "l", 0.0) or 0.0) > 0.3:
                mask |= 1 << 0
            if float(getattr(physical, "r", 0.0) or 0.0) > 0.3:
                mask |= 1 << 1

    return mask


def _get_pre_state(player_state: Any) -> Any:
    if player_state is None:
        return None
    if hasattr(player_state, "pre"):
        return getattr(player_state, "pre", None)
    leader = getattr(player_state, "leader", None)
    if leader is not None and hasattr(leader, "pre"):
        return getattr(leader, "pre", None)
    return None


def _get_post_state(player_state: Any) -> Any:
    if player_state is None:
        return None
    if hasattr(player_state, "post"):
        return getattr(player_state, "post", None)
    leader = getattr(player_state, "leader", None)
    if leader is not None and hasattr(leader, "post"):
        return getattr(leader, "post", None)
    return None


def _is_aerial_state(state_name: str) -> bool:
    return any(keyword in state_name for keyword in AERIAL_KEYWORDS)


def _is_landing_state(state_name: str) -> bool:
    return any(keyword in state_name for keyword in LANDING_KEYWORDS)


def _is_knockdown_state(state_name: str) -> bool:
    if not state_name:
        return False
    return any(keyword in state_name for keyword in KNOCKDOWN_KEYWORDS)


def _is_attack_state(state_name: str) -> bool:
    return any(keyword in state_name for keyword in ATTACK_KEYWORDS)


def _is_movement_state(state_name: str) -> bool:
    return any(keyword in state_name for keyword in MOVEMENT_KEYWORDS)


def _is_ledge_grab_state(state_name: str) -> bool:
    return "CLIFF_CATCH" in state_name


def _is_air_dodge_state(state_name: str) -> bool:
    return "ESCAPE_AIR" in state_name


def _is_fall_special_landing_state(state_name: str) -> bool:
    return "LANDING_FALL_SPECIAL" in state_name


def _is_tech_success_state(state_name: str) -> bool:
    return any(keyword in state_name for keyword in TECH_SUCCESS_KEYWORDS)


def _is_tech_miss_state(state_name: str) -> bool:
    return any(keyword in state_name for keyword in TECH_MISS_KEYWORDS)


def _is_tech_opportunity_state(state_name: str) -> bool:
    return _is_tech_success_state(state_name) or _is_tech_miss_state(state_name)


def _is_tumble_state(state_name: str) -> bool:
    airborne_damage_states = (
        "DAMAGE_FALL",
        "DAMAGE_FLY",
        "DAMAGE_AIR",
    )
    return any(keyword in state_name for keyword in airborne_damage_states)


def _has_state_flag(post_state: Any, flag_name: str, fallback_bit: int) -> bool:
    if post_state is None:
        return False

    flags = getattr(post_state, "flags", None)
    if flags is None:
        return False

    flag_enum = getattr(flags.__class__, flag_name, None)
    if flag_enum is not None:
        try:
            return bool(flags & flag_enum)
        except Exception:
            pass

    try:
        return bool(int(flags) & fallback_bit)
    except Exception:
        return False


def _is_in_hitlag(post_state: Any) -> bool:
    return _has_state_flag(post_state, "HIT_LAG", 8192)


def _is_in_hitstun(post_state: Any) -> bool:
    if post_state is None:
        return False

    hit_stun = getattr(post_state, "hit_stun", None)
    if hit_stun is not None:
        try:
            if float(hit_stun) > 0:
                return True
        except (TypeError, ValueError):
            pass

    return _has_state_flag(post_state, "HIT_STUN", 33554432)


def _is_airborne(post_state: Any, state_name: str) -> bool:
    if post_state is not None:
        airborne = getattr(post_state, "airborne", None)
        if airborne is not None:
            return bool(airborne)

    airborne_keywords = ("AIR", "JUMP", "FALL")
    return any(keyword in state_name for keyword in airborne_keywords)


def _ground_id(post_state: Any) -> Any:
    if post_state is None:
        return None
    return getattr(post_state, "ground", None)


def _facing_direction(player_state: Any) -> float | None:
    for source in (_get_post_state(player_state), _get_pre_state(player_state), player_state):
        if source is None:
            continue
        for attr in ("facing_direction", "direction", "facing"):
            value = getattr(source, attr, None)
            if value is None:
                continue
            try:
                return float(value)
            except (TypeError, ValueError):
                continue
    return None


def _get_percent(post_state: Any) -> float | None:
    if post_state is None:
        return None

    for attr in ("percent", "damage"):
        value = getattr(post_state, attr, None)
        if value is None:
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return None


def _get_stocks(post_state: Any) -> int | None:
    if post_state is None:
        return None

    for attr in ("stocks", "stock_count"):
        value = getattr(post_state, attr, None)
        if value is None:
            continue
        try:
            return int(value)
        except (TypeError, ValueError):
            continue
    return None


def _tech_direction_bucket(state_name: str, facing_direction: float | None) -> str | None:
    if not _is_tech_success_state(state_name):
        return None
    if "PASSIVE_STAND_F" in state_name:
        if facing_direction is None:
            return "right"
        return "right" if facing_direction >= 0 else "left"
    if "PASSIVE_STAND_B" in state_name:
        if facing_direction is None:
            return "left"
        return "left" if facing_direction >= 0 else "right"
    if "PASSIVE" in state_name:
        return "in_place"
    return None


def _build_player_map(game: Game) -> Dict[int, Dict[str, Any]]:
    player_map: Dict[int, Dict[str, Any]] = {}

    start = getattr(game, "start", None)
    start_players = getattr(start, "players", None)
    if not start_players:
        return player_map

    for slot_idx, player in _iter_player_container(start_players):
        if player is None:
            continue

        tag = getattr(player, "tag", "") or ""
        player_name = tag.strip() if isinstance(tag, str) else ""
        if not player_name:
            player_name = f"Player {slot_idx + 1}"

        character_obj = getattr(player, "character", None)
        character_name = (
            character_obj.name if hasattr(character_obj, "name") else str(character_obj)
        ) if character_obj is not None else "Unknown"

        player_map[slot_idx] = {
            "player_index": slot_idx,
            "player_name": player_name,
            "character": character_name,
        }

    return player_map


def extract_stats(game: Game) -> Dict[str, Any]:
    """
    Extract basic stats from a loaded replay.
    
    Args:
        game: Loaded Game object from py-slippi
        
    Returns:
        Dictionary containing total_frames, total_actions, and other stats
    """
    stats: Dict[str, Any] = {
        "total_frames": 0,
        "total_actions": 0,
        "match_duration_seconds": 0.0,
        "players_per_frame": 0,
        "per_player": [],
    }
    
    try:
        frames = getattr(game, "frames", None)
        frame_items = _iter_frame_container(frames)
        if not frame_items:
            return stats
        
        total_frames = len(frame_items)
        stats["total_frames"] = total_frames
        
        # Count valid player states (actions) across all frames.
        total_actions = 0

        player_map = _build_player_map(game)
        per_player_work: Dict[int, Dict[str, Any]] = {}

        for idx, info in player_map.items():
            per_player_work[idx] = {
                **info,
                "l_cancel_attempts": 0,
                "l_cancel_successes": 0,
                "tech_attempts": 0,
                "missed_techs": 0,
                "tech_left_count": 0,
                "tech_right_count": 0,
                "tech_in_place_count": 0,
                "ledge_grabs": 0,
                "wavedashes": 0,
                "wavelands": 0,
                "attack_actions": 0,
                "movement_actions": 0,
                "openings_won": 0,
                "kills_secured": 0,
                "total_damage_inflicted": 0.0,
                "punishes_faced": 0,
                "escaped_punishes": 0,
                "_action_state_changes": 0,
                "_opening_hits_landed": 0,
                "_prev_state": "",
                "_lr_buffer": 0,
                "_prev_airborne": None,
                "_prev_ground": None,
                "_prev_hitstun": False,
                "_prev_hitlag": False,
                "_prev_percent": None,
                "_prev_stocks": None,
                "_active_punish_by": None,
                "_punish_hit_count": 0,
                "_punish_frames_since_hit": 0,
                "_frames_since_grounded": 0,
                "_air_dodge_active": False,
                "_air_dodge_frames": 0,
                "_air_dodge_from_ground": False,
                "_tech_event_active": False,
                "_tech_event_resolved": False,
                "_tech_event_frames": 0,
            }
        
        for _, frame in frame_items:
            if frame is None:
                continue
            
            # Check ports/players data depending on py-slippi version.
            player_container = _get_frame_player_container(frame)
            frame_snapshots: Dict[int, Dict[str, Any]] = {}
            if player_container:
                for player_idx, player in _iter_player_container(player_container):
                    resolved_player = _resolve_player_state(player)
                    if resolved_player is not None:
                        total_actions += 1

                        if player_idx not in per_player_work:
                            per_player_work[player_idx] = {
                                "player_index": player_idx,
                                "player_name": f"Player {player_idx + 1}",
                                "character": "Unknown",
                                "l_cancel_attempts": 0,
                                "l_cancel_successes": 0,
                                "tech_attempts": 0,
                                "missed_techs": 0,
                                "tech_left_count": 0,
                                "tech_right_count": 0,
                                "tech_in_place_count": 0,
                                "ledge_grabs": 0,
                                "wavedashes": 0,
                                "wavelands": 0,
                                "attack_actions": 0,
                                "movement_actions": 0,
                                "openings_won": 0,
                                "kills_secured": 0,
                                "total_damage_inflicted": 0.0,
                                "punishes_faced": 0,
                                "escaped_punishes": 0,
                                "_action_state_changes": 0,
                                "_opening_hits_landed": 0,
                                "_prev_state": "",
                                "_lr_buffer": 0,
                                "_prev_airborne": None,
                                "_prev_ground": None,
                                "_prev_hitstun": False,
                                "_prev_hitlag": False,
                                "_prev_percent": None,
                                "_prev_stocks": None,
                                "_active_punish_by": None,
                                "_punish_hit_count": 0,
                                "_punish_frames_since_hit": 0,
                                "_frames_since_grounded": 0,
                                "_air_dodge_active": False,
                                "_air_dodge_frames": 0,
                                "_air_dodge_from_ground": False,
                                "_tech_event_active": False,
                                "_tech_event_resolved": False,
                                "_tech_event_frames": 0,
                            }

                        player_stats = per_player_work[player_idx]
                        state_name = _extract_state_name(resolved_player)
                        prev_state = player_stats["_prev_state"]
                        facing_direction = _facing_direction(resolved_player)

                        if prev_state and state_name != prev_state:
                            player_stats["_action_state_changes"] += 1

                        if _pressed_lr_or_z(resolved_player):
                            player_stats["_lr_buffer"] = 10
                        elif player_stats["_lr_buffer"] > 0:
                            player_stats["_lr_buffer"] -= 1

                        if _is_attack_state(state_name):
                            player_stats["attack_actions"] += 1
                        elif _is_movement_state(state_name):
                            player_stats["movement_actions"] += 1

                        post_state = _get_post_state(resolved_player)
                        percent_now = _get_percent(post_state)
                        stocks_now = _get_stocks(post_state)
                        hitstun_now = _is_in_hitstun(post_state)
                        hitlag_now = _is_in_hitlag(post_state)
                        airborne_now = _is_airborne(post_state, state_name)
                        ground_now = _ground_id(post_state)

                        if airborne_now:
                            player_stats["_frames_since_grounded"] += 1
                        else:
                            player_stats["_frames_since_grounded"] = 0

                        entered_ledge_grab_state = (
                            _is_ledge_grab_state(state_name)
                            and not _is_ledge_grab_state(prev_state)
                        )
                        if entered_ledge_grab_state:
                            player_stats["ledge_grabs"] += 1

                        entered_air_dodge_state = (
                            _is_air_dodge_state(state_name)
                            and not _is_air_dodge_state(prev_state)
                        )
                        if entered_air_dodge_state:
                            player_stats["_air_dodge_active"] = True
                            player_stats["_air_dodge_frames"] = 0
                            player_stats["_air_dodge_from_ground"] = (
                                player_stats["_frames_since_grounded"] <= 5
                            )

                        if player_stats["_air_dodge_active"]:
                            player_stats["_air_dodge_frames"] += 1

                        entered_fall_special_landing_state = (
                            _is_fall_special_landing_state(state_name)
                            and not _is_fall_special_landing_state(prev_state)
                        )
                        if (
                            entered_fall_special_landing_state
                            and player_stats["_air_dodge_active"]
                            and player_stats["_air_dodge_frames"] <= 8
                        ):
                            if player_stats["_air_dodge_from_ground"]:
                                player_stats["wavedashes"] += 1
                            else:
                                player_stats["wavelands"] += 1
                            player_stats["_air_dodge_active"] = False
                            player_stats["_air_dodge_frames"] = 0
                            player_stats["_air_dodge_from_ground"] = False
                        elif (
                            player_stats["_air_dodge_active"]
                            and player_stats["_air_dodge_frames"] > 12
                            and not _is_air_dodge_state(state_name)
                        ):
                            player_stats["_air_dodge_active"] = False
                            player_stats["_air_dodge_frames"] = 0
                            player_stats["_air_dodge_from_ground"] = False

                        # Prefer built-in Slippi l-cancel signal when available.
                        l_cancel_value = getattr(post_state, "l_cancel", None) if post_state is not None else None
                        if l_cancel_value is not None:
                            if l_cancel_value in (LCancel.SUCCESS, LCancel.FAILURE):
                                player_stats["l_cancel_attempts"] += 1
                                if l_cancel_value == LCancel.SUCCESS:
                                    player_stats["l_cancel_successes"] += 1
                        elif _is_aerial_state(prev_state) and _is_landing_state(state_name):
                            # Fallback for parsers that do not expose l_cancel.
                            player_stats["l_cancel_attempts"] += 1
                            if player_stats["_lr_buffer"] > 0:
                                player_stats["l_cancel_successes"] += 1

                        # Count each techable collision once. Outcome states are reliable, but
                        # many ground-tech chances are easier to spot from a hitstun->surface collision.
                        in_tech_outcome = _is_tech_opportunity_state(state_name)
                        was_in_tech_outcome = _is_tech_opportunity_state(prev_state)
                        recent_surface_collision = False

                        if player_stats["_prev_airborne"] is not None:
                            in_tumble_window = _is_tumble_state(prev_state) or _is_tumble_state(state_name)
                            recently_vulnerable_to_tech = (
                                player_stats["_prev_hitstun"]
                                or player_stats["_prev_hitlag"]
                                or hitstun_now
                                or hitlag_now
                            )
                            became_grounded = (
                                player_stats["_prev_ground"] is None and ground_now is not None
                            ) or (
                                player_stats["_prev_airborne"] and not airborne_now
                            )
                            recent_surface_collision = (
                                in_tumble_window and recently_vulnerable_to_tech and became_grounded
                            )

                        started_tech_event = False

                        if not player_stats["_tech_event_active"] and (
                            (in_tech_outcome and not was_in_tech_outcome) or recent_surface_collision
                        ):
                            player_stats["tech_attempts"] += 1
                            player_stats["_tech_event_active"] = True
                            player_stats["_tech_event_resolved"] = False
                            player_stats["_tech_event_frames"] = 0
                            started_tech_event = True

                        if player_stats["_tech_event_active"]:
                            player_stats["_tech_event_frames"] += 1

                        entered_tech_success_state = (
                            _is_tech_success_state(state_name)
                            and not _is_tech_success_state(prev_state)
                        )
                        if entered_tech_success_state:
                            tech_direction = _tech_direction_bucket(state_name, facing_direction)
                            if tech_direction == "left":
                                player_stats["tech_left_count"] += 1
                            elif tech_direction == "right":
                                player_stats["tech_right_count"] += 1
                            elif tech_direction == "in_place":
                                player_stats["tech_in_place_count"] += 1

                        if player_stats["_tech_event_active"] and not player_stats["_tech_event_resolved"]:
                            if _is_tech_success_state(state_name):
                                player_stats["_tech_event_resolved"] = True
                            if _is_tech_miss_state(state_name):
                                player_stats["missed_techs"] += 1
                                player_stats["_tech_event_resolved"] = True

                        if player_stats["_tech_event_active"]:
                            should_reset_tech_event = False
                            timed_out_unresolved_tech = False
                            if player_stats["_tech_event_resolved"] and not in_tech_outcome:
                                should_reset_tech_event = True
                            elif (
                                not player_stats["_tech_event_resolved"]
                                and player_stats["_tech_event_frames"] > 5
                                and not in_tech_outcome
                                and not recent_surface_collision
                                and not hitstun_now
                                and not hitlag_now
                                and not _is_knockdown_state(state_name)
                                and not started_tech_event
                            ):
                                should_reset_tech_event = True

                            if should_reset_tech_event:
                                if timed_out_unresolved_tech:
                                    player_stats["missed_techs"] += 1
                                player_stats["_tech_event_active"] = False
                                player_stats["_tech_event_resolved"] = False
                                player_stats["_tech_event_frames"] = 0

                        frame_snapshots[player_idx] = {
                            "state_name": state_name,
                            "airborne": airborne_now,
                            "ground": ground_now,
                            "hitstun": hitstun_now,
                            "hitlag": hitlag_now,
                            "percent": percent_now,
                            "stocks": stocks_now,
                        }

            # Approximate neutral wins and punish sequences for standard 1v1 replays.
            active_player_ids = sorted(frame_snapshots.keys())
            if len(active_player_ids) == 2:
                left_idx, right_idx = active_player_ids
                pairings = ((left_idx, right_idx), (right_idx, left_idx))

                for defender_idx, attacker_idx in pairings:
                    defender_stats = per_player_work.get(defender_idx)
                    attacker_stats = per_player_work.get(attacker_idx)
                    defender_snapshot = frame_snapshots.get(defender_idx)
                    if defender_stats is None or attacker_stats is None or defender_snapshot is None:
                        continue

                    prev_percent = defender_stats["_prev_percent"]
                    current_percent = defender_snapshot["percent"]
                    damage_taken = 0.0
                    if prev_percent is not None and current_percent is not None:
                        damage_taken = max(0.0, current_percent - prev_percent)

                    prev_stocks = defender_stats["_prev_stocks"]
                    current_stocks = defender_snapshot["stocks"]
                    lost_stock = False
                    if prev_stocks is not None and current_stocks is not None:
                        lost_stock = current_stocks < prev_stocks

                    newly_entered_hitstun = (
                        defender_snapshot["hitstun"] and not defender_stats["_prev_hitstun"]
                    )
                    took_new_opening_hit = damage_taken > 0 or newly_entered_hitstun

                    if defender_stats["_active_punish_by"] is None and took_new_opening_hit:
                        defender_stats["_active_punish_by"] = attacker_idx
                        defender_stats["_punish_hit_count"] = 1
                        defender_stats["_punish_frames_since_hit"] = 0
                        attacker_stats["openings_won"] += 1
                        defender_stats["punishes_faced"] += 1
                    elif defender_stats["_active_punish_by"] == attacker_idx:
                        if damage_taken > 0:
                            defender_stats["_punish_hit_count"] += 1
                            defender_stats["_punish_frames_since_hit"] = 0
                        elif defender_snapshot["hitstun"]:
                            defender_stats["_punish_frames_since_hit"] = 0
                        else:
                            defender_stats["_punish_frames_since_hit"] += 1

                    if defender_stats["_active_punish_by"] == attacker_idx and damage_taken > 0:
                        attacker_stats["total_damage_inflicted"] += damage_taken

                    if defender_stats["_active_punish_by"] == attacker_idx and lost_stock:
                        attacker_stats["kills_secured"] += 1
                        attacker_stats["_opening_hits_landed"] += defender_stats["_punish_hit_count"]
                        defender_stats["_active_punish_by"] = None
                        defender_stats["_punish_hit_count"] = 0
                        defender_stats["_punish_frames_since_hit"] = 0
                    elif (
                        defender_stats["_active_punish_by"] == attacker_idx
                        and not defender_snapshot["hitstun"]
                        and defender_stats["_punish_frames_since_hit"] > 45
                    ):
                        attacker_stats["_opening_hits_landed"] += defender_stats["_punish_hit_count"]
                        defender_stats["escaped_punishes"] += 1
                        defender_stats["_active_punish_by"] = None
                        defender_stats["_punish_hit_count"] = 0
                        defender_stats["_punish_frames_since_hit"] = 0

            for player_idx, snapshot in frame_snapshots.items():
                player_stats = per_player_work[player_idx]
                player_stats["_prev_airborne"] = snapshot["airborne"]
                player_stats["_prev_ground"] = snapshot["ground"]
                player_stats["_prev_hitstun"] = snapshot["hitstun"]
                player_stats["_prev_hitlag"] = snapshot["hitlag"]
                player_stats["_prev_percent"] = snapshot["percent"]
                player_stats["_prev_stocks"] = snapshot["stocks"]
                player_stats["_prev_state"] = snapshot["state_name"]
        
        stats["total_actions"] = total_actions
        
        # Calculate match duration (assuming 60 FPS standard for Melee)
        stats["match_duration_seconds"] = round(total_frames / 60, 2)
        
        # Calculate average players per frame
        if total_frames > 0:
            stats["players_per_frame"] = round(total_actions / total_frames, 2)

        for player_idx, player_stats in per_player_work.items():
            active_attacker_idx = player_stats.get("_active_punish_by")
            if active_attacker_idx is None:
                continue
            attacker_stats = per_player_work.get(active_attacker_idx)
            if attacker_stats is not None:
                attacker_stats["_opening_hits_landed"] += player_stats["_punish_hit_count"]
            player_stats["escaped_punishes"] += 1
            player_stats["_active_punish_by"] = None
            player_stats["_punish_hit_count"] = 0
            player_stats["_punish_frames_since_hit"] = 0

        total_openings = sum(
            int(player_stats.get("openings_won", 0) or 0)
            for player_stats in per_player_work.values()
        )

        per_player_results = []
        for player_idx in sorted(per_player_work.keys()):
            player_stats = per_player_work[player_idx]

            l_cancel_attempts = player_stats["l_cancel_attempts"]
            l_cancel_successes = player_stats["l_cancel_successes"]
            tech_attempts = player_stats["tech_attempts"]
            missed_techs = player_stats["missed_techs"]
            tech_left_count = player_stats["tech_left_count"]
            tech_right_count = player_stats["tech_right_count"]
            tech_in_place_count = player_stats["tech_in_place_count"]
            ledge_grabs = player_stats["ledge_grabs"]
            wavedashes = player_stats["wavedashes"]
            wavelands = player_stats["wavelands"]
            attack_actions = player_stats["attack_actions"]
            movement_actions = player_stats["movement_actions"]
            openings_won = player_stats["openings_won"]
            kills_secured = player_stats["kills_secured"]
            total_damage_inflicted = round(player_stats["total_damage_inflicted"], 1)
            punishes_faced = player_stats["punishes_faced"]
            escaped_punishes = player_stats["escaped_punishes"]
            opening_hits_landed = player_stats["_opening_hits_landed"]
            action_state_changes = player_stats["_action_state_changes"]

            l_cancel_rate = round((l_cancel_successes / l_cancel_attempts) * 100, 1) if l_cancel_attempts else 0.0
            tech_miss_rate = round((missed_techs / tech_attempts) * 100, 1) if tech_attempts else 0.0
            actions_per_minute = (
                round(action_state_changes / (stats["match_duration_seconds"] / 60), 1)
                if stats["match_duration_seconds"] > 0
                else 0.0
            )
            openings_per_kill = round((openings_won / kills_secured), 2) if kills_secured else None
            damage_per_opening = round((total_damage_inflicted / openings_won), 1) if openings_won else 0.0
            neutral_win_rate = round((openings_won / total_openings) * 100, 1) if total_openings else 0.0
            average_opening_length = round((opening_hits_landed / openings_won), 2) if openings_won else 0.0
            behavior_total = attack_actions + movement_actions
            attack_ratio = round((attack_actions / behavior_total) * 100, 1) if behavior_total else 0.0
            movement_ratio = round((movement_actions / behavior_total) * 100, 1) if behavior_total else 0.0

            per_player_results.append(
                {
                    "player_index": player_stats["player_index"],
                    "player_name": player_stats["player_name"],
                    "character": player_stats["character"],
                    "l_cancel_attempts": l_cancel_attempts,
                    "l_cancel_successes": l_cancel_successes,
                    "l_cancel_rate": l_cancel_rate,
                    "tech_attempts": tech_attempts,
                    "missed_techs": missed_techs,
                    "tech_miss_rate": tech_miss_rate,
                    "tech_left_count": tech_left_count,
                    "tech_right_count": tech_right_count,
                    "tech_in_place_count": tech_in_place_count,
                    "actions_per_minute": actions_per_minute,
                    "ledge_grabs": ledge_grabs,
                    "wavedashes": wavedashes,
                    "wavelands": wavelands,
                    "attack_actions": attack_actions,
                    "movement_actions": movement_actions,
                    "openings_won": openings_won,
                    "kills_secured": kills_secured,
                    "total_damage_inflicted": total_damage_inflicted,
                    "punishes_faced": punishes_faced,
                    "escaped_punishes": escaped_punishes,
                    "openings_per_kill": openings_per_kill,
                    "damage_per_opening": damage_per_opening,
                    "neutral_win_rate": neutral_win_rate,
                    "average_opening_length": average_opening_length,
                    "attack_ratio": attack_ratio,
                    "movement_ratio": movement_ratio,
                }
            )

        stats["per_player"] = per_player_results
        
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


def _normalize_slot_index(slot: Any, fallback: int) -> int:
    if isinstance(slot, int):
        return slot
    if hasattr(slot, "value"):
        value = getattr(slot, "value")
        if isinstance(value, int):
            return value
    try:
        return int(slot)
    except (TypeError, ValueError):
        return fallback


def _iter_player_container(players: Any) -> List[Any]:
    if players is None:
        return []

    if isinstance(players, dict):
        output = []
        for fallback_idx, (slot, player_state) in enumerate(players.items()):
            output.append((_normalize_slot_index(slot, fallback_idx), player_state))
        return output

    output = []
    for idx, player_state in enumerate(players):
        output.append((idx, player_state))
    return output


def _get_frame_player_container(frame: Any) -> Any:
    if frame is None:
        return None

    ports = getattr(frame, "ports", None)
    if ports:
        return ports

    players = getattr(frame, "players", None)
    if players:
        return players

    return None


def _resolve_player_state(player: Any) -> Any:
    if player is None:
        return None

    leader = getattr(player, "leader", None)
    if leader is not None:
        return leader

    if hasattr(player, "pre") or hasattr(player, "post") or hasattr(player, "state"):
        return player

    return None


def _iter_frame_container(frames: Any) -> List[Any]:
    if frames is None:
        return []

    if isinstance(frames, dict):
        output = []
        for fallback_idx, (frame_index, frame) in enumerate(frames.items()):
            output.append((_normalize_slot_index(frame_index, fallback_idx), frame))
        return output

    if isinstance(frames, list):
        return list(enumerate(frames))

    output = []
    try:
        for idx, frame in enumerate(frames):
            output.append((idx, frame))
    except TypeError:
        return []
    return output
