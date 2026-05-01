import type {
  AnalysisMetadataPlayer,
  AnalysisResponse,
  ReplayAnalysisWithFile,
  TrackedPlayerAssignment,
} from "../components/replayAnalysisTypes";

type ReplayLike = Pick<AnalysisResponse, "metadata"> | ReplayAnalysisWithFile;

export function normalizeSlippiTag(tag: string) {
  return tag.trim().toUpperCase();
}

export function getAssignablePlayers(replay: ReplayLike) {
  return (replay.metadata?.players ?? []).filter((player) => !player.is_cpu);
}

export function getPlayerAssignmentLabel(player: AnalysisMetadataPlayer) {
  const tag = player.tag?.trim();
  if (tag) {
    return tag;
  }

  return `Player ${player.player_index + 1}`;
}

export function getPlayerAssignmentDetail(player: AnalysisMetadataPlayer) {
  const extras = [
    player.connect_code?.trim(),
    player.netplay_name?.trim(),
    player.name_tag?.trim(),
  ].filter(Boolean);

  return extras.join(" • ");
}

export function buildTrackedPlayerAssignment(
  player: AnalysisMetadataPlayer,
  source: TrackedPlayerAssignment["source"],
): TrackedPlayerAssignment {
  const trimmedTag = player.tag?.trim() || null;

  return {
    playerIndex: player.player_index,
    playerTag: trimmedTag,
    playerLabel: getPlayerAssignmentLabel(player),
    assignmentType: trimmedTag ? "slippi_tag" : "player_number",
    source,
  };
}

export function findAutoTrackedPlayer(
  replay: ReplayLike,
  slippiGamertag: string,
) {
  const normalizedTag = normalizeSlippiTag(slippiGamertag);
  if (!normalizedTag) {
    return null;
  }

  const matches = getAssignablePlayers(replay).filter((player) => {
    return normalizeSlippiTag(player.tag ?? "") === normalizedTag;
  });

  return matches.length === 1 ? matches[0] : null;
}

export function getTrackedPlayerFromAssignment(
  replay: ReplayLike,
  assignment: TrackedPlayerAssignment | null | undefined,
) {
  if (assignment == null) {
    return null;
  }

  return (
    replay.metadata?.players.find(
      (player) => player.player_index === assignment.playerIndex,
    ) ?? null
  );
}
