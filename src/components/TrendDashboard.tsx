import { memo, useMemo, useState } from "react";

import CharacterIcon from "./CharacterIcon";
import type {
  AnalysisMetadataPlayer,
  BatchAnalysisResponse,
  PerPlayerStats,
  ReplayAnalysisWithFile,
} from "./replayAnalysisTypes";
import { formatCharacterName, formatStageName } from "./replayAnalysisTypes";

type ReplayOverrideValue = "auto" | `${number}`;

type TrendMatch = {
  replayId: string;
  replayIndex: number;
  filename: string;
  character: string;
  stage: string;
  startedAt?: string;
  startedAtMs: number | null;
  didWin: boolean;
  stats: PerPlayerStats;
  trackedPlayer: AnalysisMetadataPlayer;
  trackedPlayerStocksLeft: number | null;
  opponent?: AnalysisMetadataPlayer;
  opponentStocksLeft: number | null;
  opponentCharacter: string;
  opponentTag: string;
};

type TrendMetricKey =
  | "l_cancel_rate"
  | "tech_miss_rate"
  | "neutral_win_rate"
  | "damage_per_opening"
  | "actions_per_minute"
  | "stocks_remaining";

const metricConfig: Array<{
  key: TrendMetricKey;
  label: string;
  description: string;
  color: string;
  suffix?: string;
  unitLabel?: string;
}> = [
  {
    key: "l_cancel_rate",
    label: "L-Cancel Success Rate",
    description: "Successful L-cancels as a share of all L-cancel attempts",
    color: "#a78bfa",
    suffix: "%",
    unitLabel: "percent",
  },
  {
    key: "tech_miss_rate",
    label: "Successful Tech Rate",
    description: "Successful techs as a share of all tech situations",
    color: "#f97316",
    suffix: "%",
    unitLabel: "percent",
  },
  {
    key: "neutral_win_rate",
    label: "Neutral Win Rate",
    description: "Openings you won out of all neutral openings in the game",
    color: "#34d399",
    suffix: "%",
    unitLabel: "percent",
  },
  {
    key: "damage_per_opening",
    label: "Damage Per Opening",
    description: "Average damage converted each time you won an opening",
    color: "#fbbf24",
    suffix: " dmg",
    unitLabel: "damage",
  },
  {
    key: "actions_per_minute",
    label: "Actions Per Minute",
    description: "Overall action volume normalized by match length",
    color: "#38bdf8",
    suffix: " APM",
    unitLabel: "APM",
  },
  {
    key: "stocks_remaining",
    label: "Stocks Remaining",
    description: "How many stocks you had left when the replay ended",
    color: "#f472b6",
    suffix: " stocks",
    unitLabel: "stocks",
  },
];

function normalizeTag(tag: string) {
  return tag.trim().toLowerCase();
}

function getReplayId(replay: ReplayAnalysisWithFile, index: number) {
  return `${index}-${replay.filename}-${replay.stats.total_frames}`;
}

function getReplayTimestamp(startedAt?: string) {
  if (!startedAt) {
    return null;
  }

  const timestamp = Date.parse(startedAt);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function getReplayDateKey(startedAt?: string) {
  if (!startedAt) {
    return "";
  }

  return startedAt.split("T")[0] ?? "";
}

function getPlayerIdentityLabel(player: AnalysisMetadataPlayer) {
  const pieces = [
    player.connect_code,
    player.netplay_name,
    player.name_tag,
  ].filter(Boolean);

  if (pieces.length === 0) {
    return player.tag || `Player ${player.player_index + 1}`;
  }

  return pieces.join(" • ");
}

function getAutoTrackedPlayer(
  replay: ReplayAnalysisWithFile,
  selectedTag: string,
) {
  const normalizedSelectedTag = normalizeTag(selectedTag);
  return replay.metadata?.players.find(
    (entry) => normalizeTag(entry.tag) === normalizedSelectedTag,
  );
}

function getResolvedTrackedPlayer(
  replay: ReplayAnalysisWithFile,
  selectedTag: string,
  overrideValue: ReplayOverrideValue | undefined,
) {
  if (overrideValue && overrideValue !== "auto") {
    const overrideIndex = Number(overrideValue);
    return replay.metadata?.players.find(
      (player) => player.player_index === overrideIndex,
    );
  }

  return getAutoTrackedPlayer(replay, selectedTag);
}

function getTrendMatches(
  batchAnalysis: BatchAnalysisResponse,
  selectedTag: string,
  replayOverrides: Record<string, ReplayOverrideValue>,
  myCharacterFilter: string,
  opponentCharacterFilter: string,
  stageFilter: string,
  dateFrom: string,
  dateTo: string,
) {
  const matches: TrendMatch[] = [];

  batchAnalysis.replays.forEach((replay, replayIndex) => {
    const replayId = getReplayId(replay, replayIndex);
    const trackedPlayer = getResolvedTrackedPlayer(
      replay,
      selectedTag,
      replayOverrides[replayId],
    );

    if (!trackedPlayer) {
      return;
    }

    const stats = replay.stats.per_player.find(
      (entry) => entry.player_index === trackedPlayer.player_index,
    );

    if (!stats) {
      return;
    }

    const opponent =
      replay.metadata?.players.find(
        (player) =>
          player.player_index !== trackedPlayer.player_index && !player.is_cpu,
      ) ??
      replay.metadata?.players.find(
        (player) => player.player_index !== trackedPlayer.player_index,
      );

    const match: TrendMatch = {
      replayId,
      replayIndex,
      filename: replay.filename,
      character: trackedPlayer.character,
      stage: replay.metadata?.stage || "Unknown",
      startedAt: replay.metadata?.started_at,
      startedAtMs: getReplayTimestamp(replay.metadata?.started_at),
      didWin: trackedPlayer.did_win,
      stats,
      trackedPlayer,
      trackedPlayerStocksLeft: trackedPlayer.stocks_left,
      opponent,
      opponentStocksLeft: opponent?.stocks_left ?? null,
      opponentCharacter: opponent?.character ?? "Unknown",
      opponentTag: opponent?.tag ?? `Player ${trackedPlayer.player_index + 1}`,
    };

    if (myCharacterFilter !== "all" && match.character !== myCharacterFilter) {
      return;
    }

    if (
      opponentCharacterFilter !== "all" &&
      match.opponentCharacter !== opponentCharacterFilter
    ) {
      return;
    }

    if (stageFilter !== "all" && match.stage !== stageFilter) {
      return;
    }

    const replayDate = getReplayDateKey(match.startedAt);
    if (dateFrom && (!replayDate || replayDate < dateFrom)) {
      return;
    }

    if (dateTo && (!replayDate || replayDate > dateTo)) {
      return;
    }

    matches.push(match);
  });

  return matches.sort((left, right) => {
    if (left.startedAtMs !== null && right.startedAtMs !== null) {
      return left.startedAtMs - right.startedAtMs;
    }

    if (left.startedAtMs !== null) {
      return -1;
    }

    if (right.startedAtMs !== null) {
      return 1;
    }

    return left.replayIndex - right.replayIndex;
  });
}

function averageBy<T>(items: T[], selector: (item: T) => number) {
  if (items.length === 0) {
    return 0;
  }

  return (
    items.reduce((total, item) => total + selector(item), 0) / items.length
  );
}

function roundValue(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function formatMetricValue(value: number, suffix = "") {
  return `${roundValue(value)}${suffix}`;
}

function averageDefinedNumbers(values: Array<number | null | undefined>) {
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

function getUniqueStages(matches: TrendMatch[]) {
  return Array.from(new Set(matches.map((match) => match.stage))).sort((a, b) =>
    formatStageName(a).localeCompare(formatStageName(b)),
  );
}

function getTechSuccessRate(techAttempts: number, missedTechs: number) {
  if (!techAttempts) {
    return 0;
  }

  const successfulTechs = Math.max(0, techAttempts - missedTechs);
  return roundValue((successfulTechs / techAttempts) * 100);
}

function formatReplayTime(startedAt?: string) {
  if (!startedAt) {
    return null;
  }

  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getSessionIndices(matches: TrendMatch[]) {
  const sessionIndices: number[] = [];
  let currentSession = 0;

  matches.forEach((match, index) => {
    if (index === 0) {
      sessionIndices.push(currentSession);
      return;
    }

    const previousMatch = matches[index - 1];
    const hasTimestamps =
      previousMatch.startedAtMs !== null && match.startedAtMs !== null;
    const gapMs = hasTimestamps
      ? match.startedAtMs! - previousMatch.startedAtMs!
      : null;

    if (gapMs !== null && gapMs > 15 * 60 * 1000) {
      currentSession += 1;
    }

    sessionIndices.push(currentSession);
  });

  return sessionIndices;
}

function getCharacterCounts(matches: TrendMatch[]) {
  const counts = new Map<string, number>();

  matches.forEach((match) => {
    counts.set(match.character, (counts.get(match.character) ?? 0) + 1);
  });

  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1]);
}

function getUniqueCharacters(
  matches: TrendMatch[],
  selector: (match: TrendMatch) => string,
) {
  return Array.from(new Set(matches.map(selector))).sort();
}

function TrendStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-600/80 bg-slate-900/40 px-4 py-3 shadow-sm shadow-black/10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold leading-none text-white">
        {value}
      </p>
      {detail && <p className="mt-2 text-xs text-slate-400">{detail}</p>}
    </div>
  );
}

function TrendLineChart({
  matches,
  sessionIndices,
  metricKey,
  label,
  description,
  color,
  suffix = "",
}: {
  matches: TrendMatch[];
  sessionIndices: number[];
  metricKey: TrendMetricKey;
  label: string;
  description: string;
  color: string;
  suffix?: string;
}) {
  if (matches.length === 0) {
    return null;
  }

  const width = 320;
  const height = 160;
  const paddingX = 24;
  const paddingY = 20;
  const values = matches.map((match) =>
    metricKey === "tech_miss_rate"
      ? getTechSuccessRate(match.stats.tech_attempts, match.stats.missed_techs)
      : metricKey === "stocks_remaining"
        ? (match.trackedPlayerStocksLeft ?? 0)
        : match.stats[metricKey],
  );
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue || 1;
  const yAxisTicks = [maxValue, minValue + valueRange / 2, minValue];
  const dividerXs = sessionIndices
    .map((_, index) => ({ index }))
    .filter(
      ({ index }) =>
        index > 0 && sessionIndices[index - 1] !== sessionIndices[index],
    )
    .map(({ index }) =>
      matches.length === 1
        ? width / 2
        : paddingX + (index / (matches.length - 1)) * (width - paddingX * 2),
    );

  const points = values
    .map((value, index) => {
      const x =
        matches.length === 1
          ? width / 2
          : paddingX + (index / (matches.length - 1)) * (width - paddingX * 2);
      const y =
        height -
        paddingY -
        ((value - minValue) / valueRange) * (height - paddingY * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="rounded-2xl border border-slate-600 bg-slate-900/35 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{label}</p>
          <p className="mt-1 text-xs text-slate-400">{description}</p>
        </div>
        <div className="text-right text-xs text-slate-400">
          <p>High {formatMetricValue(maxValue, suffix)}</p>
          <p>Low {formatMetricValue(minValue, suffix)}</p>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full">
        {dividerXs.map((x, index) => (
          <line
            key={`${label}-session-${index}`}
            x1={x}
            y1={paddingY}
            x2={x}
            y2={height - paddingY}
            stroke="#64748b"
            strokeDasharray="4 4"
            strokeWidth="1"
            opacity="0.8"
          />
        ))}
        <line
          x1={paddingX}
          y1={height - paddingY}
          x2={width - paddingX}
          y2={height - paddingY}
          stroke="#475569"
          strokeWidth="1"
        />
        <line
          x1={paddingX}
          y1={paddingY}
          x2={paddingX}
          y2={height - paddingY}
          stroke="#475569"
          strokeWidth="1"
        />
        {yAxisTicks.map((tickValue) => {
          const y =
            height -
            paddingY -
            ((tickValue - minValue) / valueRange) * (height - paddingY * 2);

          return (
            <g key={`${label}-tick-${tickValue}`}>
              <line
                x1={paddingX - 4}
                y1={y}
                x2={paddingX}
                y2={y}
                stroke="#64748b"
                strokeWidth="1"
              />
              <text
                x={paddingX - 8}
                y={y + 3}
                fill="#94a3b8"
                fontSize="9"
                textAnchor="end"
              >
                {formatMetricValue(tickValue, suffix)}
              </text>
            </g>
          );
        })}
        <text
          x={width / 2}
          y={height - 4}
          fill="#94a3b8"
          fontSize="10"
          textAnchor="middle"
        >
          Games in chronological order
        </text>
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />
        {values.map((value, index) => {
          const x =
            matches.length === 1
              ? width / 2
              : paddingX +
                (index / (matches.length - 1)) * (width - paddingX * 2);
          const y =
            height -
            paddingY -
            ((value - minValue) / valueRange) * (height - paddingY * 2);

          return (
            <g key={`${label}-${matches[index].replayId}`}>
              <circle cx={x} cy={y} r="4" fill={color} />
              <title>
                {`${matches[index].filename}: ${formatMetricValue(
                  value,
                  suffix,
                )}${
                  matches[index].startedAt
                    ? ` • ${formatReplayTime(matches[index].startedAt)}`
                    : ""
                }`}
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const TrendDashboard = memo(function TrendDashboard({
  batchAnalysis,
  selectedTag,
  onSelectTag,
  heading = "Trend Tracking",
  summaryLabel = "Uploads analyzed",
  subtitle = "Review habits across a folder of replays by Slippi tag",
  defaultMatchedReplaysOpen = true,
}: {
  batchAnalysis: BatchAnalysisResponse;
  selectedTag: string;
  onSelectTag: (tag: string) => void;
  heading?: string;
  summaryLabel?: string;
  subtitle?: string;
  defaultMatchedReplaysOpen?: boolean;
}) {
  const [replayOverrides, setReplayOverrides] = useState<
    Record<string, ReplayOverrideValue>
  >({});
  const [isAssignmentOpen, setIsAssignmentOpen] = useState(false);
  const [isMatchedReplaysOpen, setIsMatchedReplaysOpen] = useState(
    defaultMatchedReplaysOpen,
  );
  const [myCharacterFilter, setMyCharacterFilter] = useState("all");
  const [opponentCharacterFilter, setOpponentCharacterFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const allResolvedMatches = useMemo(
    () =>
      getTrendMatches(
        batchAnalysis,
        selectedTag,
        replayOverrides,
        "all",
        "all",
        "all",
        "",
        "",
      ),
    [batchAnalysis, selectedTag, replayOverrides],
  );
  const matches = useMemo(
    () =>
      getTrendMatches(
        batchAnalysis,
        selectedTag,
        replayOverrides,
        myCharacterFilter,
        opponentCharacterFilter,
        stageFilter,
        dateFrom,
        dateTo,
      ),
    [
      batchAnalysis,
      selectedTag,
      replayOverrides,
      myCharacterFilter,
      opponentCharacterFilter,
      stageFilter,
      dateFrom,
      dateTo,
    ],
  );
  const characterCounts = useMemo(() => getCharacterCounts(matches), [matches]);
  const sessionIndices = useMemo(() => getSessionIndices(matches), [matches]);
  const sessionCount =
    sessionIndices.length > 0
      ? sessionIndices[sessionIndices.length - 1] + 1
      : 0;
  const sessionByReplayId = useMemo(
    () =>
      new Map(
        matches.map((match, index) => [
          match.replayId,
          sessionIndices[index] ?? 0,
        ]),
      ),
    [matches, sessionIndices],
  );
  const availableMyCharacters = useMemo(
    () => getUniqueCharacters(allResolvedMatches, (match) => match.character),
    [allResolvedMatches],
  );
  const availableOpponentCharacters = useMemo(
    () =>
      getUniqueCharacters(
        allResolvedMatches,
        (match) => match.opponentCharacter,
      ),
    [allResolvedMatches],
  );
  const availableStages = useMemo(
    () => getUniqueStages(allResolvedMatches),
    [allResolvedMatches],
  );
  const overrideCount = Object.values(replayOverrides).filter(
    (value) => value !== "auto",
  ).length;
  const winCount = matches.filter((match) => match.didWin).length;
  const lossCount = matches.length - winCount;
  const avgLCancel = useMemo(
    () => roundValue(averageBy(matches, (match) => match.stats.l_cancel_rate)),
    [matches],
  );
  const avgTechSuccess = useMemo(
    () =>
      roundValue(
        averageBy(matches, (match) =>
          getTechSuccessRate(match.stats.tech_attempts, match.stats.missed_techs),
        ),
      ),
    [matches],
  );
  const avgNeutralWin = useMemo(
    () =>
      roundValue(averageBy(matches, (match) => match.stats.neutral_win_rate)),
    [matches],
  );
  const totalTechToward = useMemo(
    () =>
      matches.reduce((total, match) => total + match.stats.tech_towards_count, 0),
    [matches],
  );
  const totalTechAway = useMemo(
    () =>
      matches.reduce((total, match) => total + match.stats.tech_away_count, 0),
    [matches],
  );
  const totalTechInPlace = useMemo(
    () =>
      matches.reduce(
        (total, match) => total + match.stats.tech_in_place_count,
        0,
      ),
    [matches],
  );
  const avgDamagePerOpening = useMemo(
    () =>
      roundValue(
        averageBy(matches, (match) => match.stats.damage_per_opening),
      ),
    [matches],
  );
  const avgApm = useMemo(
    () =>
      roundValue(averageBy(matches, (match) => match.stats.actions_per_minute)),
    [matches],
  );
  const avgStocksRemainingValue = useMemo(
    () => averageDefinedNumbers(matches.map((match) => match.trackedPlayerStocksLeft)),
    [matches],
  );
  const avgStocksRemaining =
    avgStocksRemainingValue === null
      ? null
      : roundValue(avgStocksRemainingValue);
  const avgOpeningsPerKill = useMemo(() => {
    if (!matches.some((match) => match.stats.openings_per_kill !== null)) {
      return null;
    }

    return roundValue(
      averageBy(
        matches.filter((match) => match.stats.openings_per_kill !== null),
        (match) => match.stats.openings_per_kill ?? 0,
      ),
    );
  }, [matches]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-600 bg-slate-900/35 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-purple-300">
              {heading}
            </p>
            <p className="mt-2 text-lg font-semibold text-white">
              {subtitle}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {summaryLabel}: {batchAnalysis.replays.length}
              {batchAnalysis.failed_files.length > 0
                ? ` • Failed: ${batchAnalysis.failed_files.length}`
                : ""}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <label className="flex flex-col gap-2 text-sm text-slate-300">
              Player tag
              <select
                value={selectedTag}
                onChange={(event) => onSelectTag(event.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white outline-none transition focus:border-purple-400"
              >
                {batchAnalysis.available_tags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-300">
              My character
              <select
                value={myCharacterFilter}
                onChange={(event) => setMyCharacterFilter(event.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white outline-none transition focus:border-purple-400"
              >
                <option value="all">All characters</option>
                {availableMyCharacters.map((character) => (
                  <option key={character} value={character}>
                    {formatCharacterName(character)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-300">
              Opponent
              <select
                value={opponentCharacterFilter}
                onChange={(event) =>
                  setOpponentCharacterFilter(event.target.value)
                }
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white outline-none transition focus:border-purple-400"
              >
                <option value="all">All opponents</option>
                {availableOpponentCharacters.map((character) => (
                  <option key={character} value={character}>
                    {formatCharacterName(character)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-300">
              Stage
              <select
                value={stageFilter}
                onChange={(event) => setStageFilter(event.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white outline-none transition focus:border-purple-400"
              >
                <option value="all">All stages</option>
                {availableStages.map((stage) => (
                  <option key={stage} value={stage}>
                    {formatStageName(stage)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-300">
              Date from
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white outline-none transition focus:border-purple-400"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-300">
              Date to
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white outline-none transition focus:border-purple-400"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-600 bg-slate-900/35 p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-purple-300">
              Player Assignment
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Override any replay where the selected tag did not identify the
              right port.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {overrideCount} manual override
              {overrideCount === 1 ? "" : "s"} active
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setReplayOverrides({})}
              className="rounded-full border border-slate-600 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700/80"
            >
              Reset overrides
            </button>
            <button
              type="button"
              onClick={() => setIsAssignmentOpen((current) => !current)}
              className="rounded-full border border-purple-400/40 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-100 transition hover:bg-purple-500/20"
            >
              {isAssignmentOpen ? "Hide assignment" : "Show assignment"}
            </button>
          </div>
        </div>

        {isAssignmentOpen && (
          <div className="space-y-3">
            {batchAnalysis.replays.map((replay, replayIndex) => {
              const replayId = getReplayId(replay, replayIndex);
              const autoTrackedPlayer = getAutoTrackedPlayer(
                replay,
                selectedTag,
              );
              const resolvedPlayer = getResolvedTrackedPlayer(
                replay,
                selectedTag,
                replayOverrides[replayId],
              );

              return (
                <div
                  key={replayId}
                  className="rounded-xl border border-slate-700 bg-slate-950/40 p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {replay.filename}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Auto-detected:{" "}
                        {autoTrackedPlayer
                          ? `${formatCharacterName(autoTrackedPlayer.character)} • ${getPlayerIdentityLabel(autoTrackedPlayer)}`
                          : "No tag match"}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Using:{" "}
                        {resolvedPlayer
                          ? `${formatCharacterName(resolvedPlayer.character)} • ${getPlayerIdentityLabel(resolvedPlayer)}`
                          : "Unassigned"}
                      </p>
                    </div>

                    <label className="flex w-full flex-col gap-2 text-sm text-slate-300 lg:w-80">
                      Track this player
                      <select
                        value={replayOverrides[replayId] ?? "auto"}
                        onChange={(event) =>
                          setReplayOverrides((current) => ({
                            ...current,
                            [replayId]: event.target
                              .value as ReplayOverrideValue,
                          }))
                        }
                        className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white outline-none transition focus:border-purple-400"
                      >
                        <option value="auto">Auto</option>
                        {(replay.metadata?.players ?? []).map((player) => (
                          <option
                            key={`${replayId}-${player.player_index}`}
                            value={`${player.player_index}`}
                          >
                            P{player.player_index + 1}:{" "}
                            {formatCharacterName(player.character)} •{" "}
                            {getPlayerIdentityLabel(player)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {matches.length === 0 ? (
        <div className="rounded-2xl border border-slate-600 bg-slate-900/35 p-5 text-sm text-slate-300">
          No replays matched the current tag and filters. Try a manual override,
          or widen the character and matchup filters.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <TrendStat
              label="Replays matched"
              value={`${matches.length}`}
              detail={`${winCount} wins • ${lossCount} losses • ${sessionCount} sessions`}
            />
            <TrendStat
              label="Avg L-Cancel"
              value={`${avgLCancel}%`}
              detail="Average success rate across filtered games"
            />
            <TrendStat
              label="Avg Successful Tech"
              value={`${avgTechSuccess}%`}
            />
            <TrendStat
              label="Tech Split (Toward/Away/IP)"
              value={`${totalTechToward} • ${totalTechAway} • ${totalTechInPlace}`}
              detail="Successful techs toward, away, and in-place"
            />
            <TrendStat
              label="Avg Neutral Win"
              value={`${avgNeutralWin}%`}
              detail="Average neutral win rate"
            />
            <TrendStat
              label="Avg Damage/Open"
              value={`${avgDamagePerOpening}`}
              detail="Damage converted from each opening"
            />
            <TrendStat
              label="Avg Stocks Left"
              value={`${avgStocksRemaining ?? "N/A"}`}
            />
            <TrendStat label="Avg APM" value={`${avgApm}`} />
            <TrendStat
              label="Avg Openings/Kill"
              value={`${avgOpeningsPerKill ?? "N/A"}`}
            />
          </div>

          <div className="rounded-2xl border border-slate-600 bg-slate-900/35 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-purple-300">
              Character Usage
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {characterCounts.map(([character, count]) => (
                <div
                  key={character}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-600 bg-slate-800/80 px-4 py-2 text-sm text-slate-200"
                >
                  <CharacterIcon character={character} className="h-6 w-6" />
                  {formatCharacterName(character)} • {count} replay
                  {count === 1 ? "" : "s"}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-purple-300">
              Trend Charts
            </p>
            <div className="my-4">
              <p className="text-xs text-slate-400">
                Dashed dividers mark breaks of more than 15 minutes between
                consecutive games.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {metricConfig.map((metric) => (
                <TrendLineChart
                  key={metric.key}
                  matches={matches}
                  sessionIndices={sessionIndices}
                  metricKey={metric.key}
                  label={metric.label}
                  description={metric.description}
                  color={metric.color}
                  suffix={metric.suffix}
                />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-purple-300">
                Matched Replays
              </p>
              <button
                type="button"
                onClick={() => setIsMatchedReplaysOpen((current) => !current)}
                className="rounded-full border border-slate-600 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700/80"
              >
                {isMatchedReplaysOpen ? "Hide replays" : "Show replays"}
              </button>
            </div>
            {isMatchedReplaysOpen ? (
              <div className="space-y-3">
                {matches.map((match) => (
                  <div
                    key={match.replayId}
                    className="rounded-2xl border border-slate-600 bg-slate-900/35 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {match.filename}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                          <span className="inline-flex items-center gap-2">
                            {formatCharacterName(match.character)} vs{" "}
                            {formatCharacterName(match.opponentCharacter)}
                          </span>
                          {formatStageName(match.stage)
                            ? ` • ${formatStageName(match.stage)}`
                            : ""}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {`Session ${(sessionByReplayId.get(match.replayId) ?? 0) + 1} • `}
                          Tracking {getPlayerIdentityLabel(match.trackedPlayer)}
                          {match.opponentTag
                            ? ` • Opponent ${match.opponentTag}`
                            : ""}
                          {formatReplayTime(match.startedAt)
                            ? ` • ${formatReplayTime(match.startedAt)}`
                            : ""}
                        </p>
                      </div>
                      <span
                        className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-medium ${
                          match.didWin
                            ? "bg-green-500/15 text-green-300"
                            : "bg-slate-700 text-slate-300"
                        }`}
                      >
                        {match.didWin ? "Win" : "Loss"}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <div className="inline-flex items-center gap-2 rounded-full border border-slate-600 bg-slate-800/80 px-3 py-2 text-sm text-slate-100">
                        <CharacterIcon
                          character={match.character}
                          className="h-7 w-7"
                        />
                        <span>{getPlayerIdentityLabel(match.trackedPlayer)}</span>
                        <span className="text-slate-400">•</span>
                        <span>
                          {match.trackedPlayerStocksLeft ?? "N/A"} stocks
                        </span>
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-slate-600 bg-slate-800/80 px-3 py-2 text-sm text-slate-100">
                        <CharacterIcon
                          character={match.opponentCharacter}
                          className="h-7 w-7"
                        />
                        <span>
                          {match.opponent
                            ? getPlayerIdentityLabel(match.opponent)
                            : match.opponentTag}
                        </span>
                        <span className="text-slate-400">•</span>
                        <span>{match.opponentStocksLeft ?? "N/A"} stocks</span>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 xl:grid-cols-5">
                      <div className="rounded-lg bg-slate-800/70 p-3">
                        <p className="text-slate-400">L-Cancel</p>
                        <p className="mt-1 font-semibold text-white">
                          {match.stats.l_cancel_rate}%
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-800/70 p-3">
                        <p className="text-slate-400">Successful Tech</p>
                        <p className="mt-1 font-semibold text-white">
                          {getTechSuccessRate(
                            match.stats.tech_attempts,
                            match.stats.missed_techs,
                          )}
                          %
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-800/70 p-3">
                        <p className="text-slate-400">Tech Direction</p>
                        <p className="mt-1 font-semibold text-white">
                          T {match.stats.tech_towards_count} • A{" "}
                          {match.stats.tech_away_count} • IP{" "}
                          {match.stats.tech_in_place_count}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-800/70 p-3">
                        <p className="text-slate-400">Neutral Win</p>
                        <p className="mt-1 font-semibold text-white">
                          {match.stats.neutral_win_rate}%
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-800/70 p-3">
                        <p className="text-slate-400">Damage/Open</p>
                        <p className="mt-1 font-semibold text-white">
                          {match.stats.damage_per_opening}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-600 bg-slate-900/35 p-4 text-sm text-slate-300">
                Replay-by-replay breakdown hidden to keep the page fast. Open it
                when you want the full list.
              </div>
            )}
          </div>
        </>
      )}

      {batchAnalysis.failed_files.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-200">
            Files Skipped
          </p>
          <div className="mt-3 space-y-2 text-sm text-amber-50">
            {batchAnalysis.failed_files.map((failure) => (
              <p key={`${failure.filename}-${failure.error}`}>
                {failure.filename}: {failure.error}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default TrendDashboard;
