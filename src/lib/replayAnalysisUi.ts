import type {
  AnalysisResponse,
  BatchAnalysisResponse,
  PerPlayerStats,
} from "../components/replayAnalysisTypes";

export function getTechSuccessRate(
  techAttempts: number,
  missedTechs: number,
): number {
  if (!techAttempts) {
    return 0;
  }

  const successfulTechs = Math.max(0, techAttempts - missedTechs);
  return Number(((successfulTechs / techAttempts) * 100).toFixed(1));
}

export function getPlayerFeedbackGroups(analysis: AnalysisResponse) {
  const perPlayer = analysis.stats.per_player;

  return perPlayer.map((player) => {
    const playerNumberLabel = `Player ${player.player_index + 1}`;
    const exactName = player.player_name.trim();

    const items = analysis.feedback.filter((entry) => {
      return (
        entry.includes(exactName) ||
        entry.includes(playerNumberLabel) ||
        entry.includes(`${player.character} vs`) ||
        entry.includes(`In ${player.character} vs`)
      );
    });

    return {
      ...player,
      feedback: items,
    };
  });
}

export function getDefaultBatchTag(data: BatchAnalysisResponse): string {
  const replayCounts = new Map<string, number>();

  data.replays.forEach((replay) => {
    const uniqueReplayTags = new Set<string>();

    (replay.metadata?.players ?? []).forEach((player) => {
      const rawTag = (player.tag ?? "").trim();
      if (!rawTag || player.is_cpu) {
        return;
      }

      uniqueReplayTags.add(rawTag);
    });

    uniqueReplayTags.forEach((tag) => {
      replayCounts.set(tag, (replayCounts.get(tag) ?? 0) + 1);
    });
  });

  if (replayCounts.size === 0) {
    return data.available_tags[0] ?? "";
  }

  const rankedTags = Array.from(replayCounts.entries()).sort(
    ([leftTag, leftCount], [rightTag, rightCount]) => {
      if (leftCount !== rightCount) {
        return rightCount - leftCount;
      }

      return leftTag.localeCompare(rightTag, undefined, {
        sensitivity: "base",
      });
    },
  );

  return rankedTags[0]?.[0] ?? data.available_tags[0] ?? "";
}

export function averageBy<T>(items: T[], selector: (item: T) => number) {
  if (items.length === 0) {
    return 0;
  }

  return items.reduce((total, item) => total + selector(item), 0) / items.length;
}

export function roundValue(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

export function averageDefinedNumbers(values: Array<number | null | undefined>) {
  const definedValues = values.filter(
    (value): value is number => typeof value === "number",
  );

  if (definedValues.length === 0) {
    return null;
  }

  return (
    definedValues.reduce((total, value) => total + value, 0) /
    definedValues.length
  );
}

export type PlayerFeedbackGroup = PerPlayerStats & {
  feedback: string[];
};
