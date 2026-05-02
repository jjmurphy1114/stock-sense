import { memo, useMemo, useState } from "react";

import { averageBy, averageDefinedNumbers, getTechSuccessRate, roundValue } from "../../lib/replayAnalysisUi";
import CharacterIcon from "../replays/CharacterIcon";
import ReplayAssignmentList from "../replays/ReplayAssignmentList";
import StatTile from "../replays/StatTile";
import { formatCharacterName, formatStageName } from "../replayAnalysisTypes";
import FilterMultiSelect from "./FilterMultiSelect";
import TrendLineChart, { type TrendMetricKey } from "./TrendLineChart";
import type {
  AnalysisMetadataPlayer,
  BatchAnalysisResponse,
  PerPlayerStats,
  ReplayAnalysisWithFile,
} from "../replayAnalysisTypes";

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
  opponentIdentity: string;
};

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
  selectedTag?: string,
) {
  if (replay.trackedPlayerAssignment) {
    return replay.metadata?.players.find(
      (player) =>
        player.player_index === replay.trackedPlayerAssignment?.playerIndex,
    );
  }

  if (!selectedTag) {
    return null;
  }

  const normalizedSelectedTag = normalizeTag(selectedTag);
  return replay.metadata?.players.find(
    (entry) => normalizeTag(entry.tag) === normalizedSelectedTag,
  );
}

function getResolvedTrackedPlayer(
  replay: ReplayAnalysisWithFile,
  selectedTag: string | undefined,
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
  selectedTag: string | undefined,
  replayOverrides: Record<string, ReplayOverrideValue>,
  myCharacterFilter: string[],
  opponentCharacterFilter: string[],
  stageFilter: string[],
  opponentIdentityFilter: string[],
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
      opponentTag:
        opponent?.tag ?? `Player ${(opponent?.player_index ?? 0) + 1}`,
      opponentIdentity: opponent
        ? getPlayerIdentityLabel(opponent)
        : "Unknown opponent",
    };

    if (
      myCharacterFilter.length > 0 &&
      !myCharacterFilter.includes(match.character)
    ) {
      return;
    }

    if (
      opponentCharacterFilter.length > 0 &&
      !opponentCharacterFilter.includes(match.opponentCharacter)
    ) {
      return;
    }

    if (stageFilter.length > 0 && !stageFilter.includes(match.stage)) {
      return;
    }

    if (
      opponentIdentityFilter.length > 0 &&
      !opponentIdentityFilter.includes(match.opponentIdentity)
    ) {
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

function getUniqueStages(matches: TrendMatch[]) {
  return Array.from(new Set(matches.map((match) => match.stage))).sort((a, b) =>
    formatStageName(a).localeCompare(formatStageName(b)),
  );
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

function getUniqueOpponentIdentities(matches: TrendMatch[]) {
  return Array.from(new Set(matches.map((match) => match.opponentIdentity))).sort(
    (left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
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

const TrendDashboard = memo(function TrendDashboard({
  batchAnalysis,
  selectedTag,
  onSelectTag,
  heading = "Trend Tracking",
  summaryLabel = "Uploads analyzed",
  subtitle = "Review habits across a folder of replays by Slippi tag",
  defaultMatchedReplaysOpen = true,
  showAssignmentSection = true,
}: {
  batchAnalysis: BatchAnalysisResponse;
  selectedTag?: string;
  onSelectTag?: (tag: string) => void;
  heading?: string;
  summaryLabel?: string;
  subtitle?: string;
  defaultMatchedReplaysOpen?: boolean;
  showAssignmentSection?: boolean;
}) {
  const [replayOverrides, setReplayOverrides] = useState<
    Record<string, ReplayOverrideValue>
  >({});
  const [isAssignmentOpen, setIsAssignmentOpen] = useState(false);
  const [isMatchedReplaysOpen, setIsMatchedReplaysOpen] = useState(
    defaultMatchedReplaysOpen,
  );
  const [myCharacterFilter, setMyCharacterFilter] = useState<string[]>([]);
  const [opponentCharacterFilter, setOpponentCharacterFilter] = useState<string[]>(
    [],
  );
  const [opponentIdentityFilter, setOpponentIdentityFilter] = useState<string[]>(
    [],
  );
  const [stageFilter, setStageFilter] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const allResolvedMatches = useMemo(
    () =>
      getTrendMatches(
        batchAnalysis,
        selectedTag,
        replayOverrides,
        [],
        [],
        [],
        [],
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
        opponentIdentityFilter,
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
      opponentIdentityFilter,
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
  const availableOpponentIdentities = useMemo(
    () => getUniqueOpponentIdentities(allResolvedMatches),
    [allResolvedMatches],
  );
  const myCharacterOptions = useMemo(
    () =>
      availableMyCharacters.map((character) => ({
        value: character,
        label: formatCharacterName(character),
      })),
    [availableMyCharacters],
  );
  const opponentCharacterOptions = useMemo(
    () =>
      availableOpponentCharacters.map((character) => ({
        value: character,
        label: formatCharacterName(character),
      })),
    [availableOpponentCharacters],
  );
  const stageOptions = useMemo(
    () =>
      availableStages.map((stage) => ({
        value: stage,
        label: formatStageName(stage),
      })),
    [availableStages],
  );
  const opponentIdentityOptions = useMemo(
    () =>
      availableOpponentIdentities.map((identity) => ({
        value: identity,
        label: identity,
      })),
    [availableOpponentIdentities],
  );
  const overrideCount = Object.values(replayOverrides).filter(
    (value) => value !== "auto",
  ).length;
  const assignmentItems = useMemo(
    () =>
      batchAnalysis.replays.map((replay, replayIndex) => {
        const replayId = getReplayId(replay, replayIndex);
        const autoTrackedPlayer = getAutoTrackedPlayer(replay, selectedTag);
        const resolvedPlayer = getResolvedTrackedPlayer(
          replay,
          selectedTag,
          replayOverrides[replayId],
        );

        return {
          id: replayId,
          title: replay.filename,
          subtitle: resolvedPlayer
            ? `Using ${formatCharacterName(resolvedPlayer.character)} • ${getPlayerIdentityLabel(resolvedPlayer)}`
            : autoTrackedPlayer
              ? `Auto-detected ${formatCharacterName(autoTrackedPlayer.character)} • ${getPlayerIdentityLabel(autoTrackedPlayer)}`
              : "Unassigned",
          selectedValue:
            replayOverrides[replayId] === "auto"
              ? ""
              : replayOverrides[replayId] ?? "",
          players: (replay.metadata?.players ?? []).map((player) => ({
            playerIndex: player.player_index,
            label: `P${player.player_index + 1}: ${getPlayerIdentityLabel(player)}`,
            character: player.character,
          })),
        };
      }),
    [batchAnalysis.replays, replayOverrides, selectedTag],
  );
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

          <div className="grid w-full grid-cols-2 gap-3 xl:grid-cols-3">
            {selectedTag && onSelectTag ? (
              <label className="flex h-full flex-col gap-2 text-sm text-slate-300">
                Player tag
                <select
                  value={selectedTag}
                  onChange={(event) => onSelectTag(event.target.value)}
                  className="min-h-11 flex-1 rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-white outline-none transition focus:border-purple-400"
                >
                  {batchAnalysis.available_tags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <FilterMultiSelect
              label="My character"
              allLabel="All characters"
              selectedValues={myCharacterFilter}
              options={myCharacterOptions}
              onChange={setMyCharacterFilter}
            />

            <FilterMultiSelect
              label="Opponent character"
              allLabel="All opponents"
              selectedValues={opponentCharacterFilter}
              options={opponentCharacterOptions}
              onChange={setOpponentCharacterFilter}
            />

            <FilterMultiSelect
              label="Opponent tag/name"
              allLabel="All opponent tags/names"
              selectedValues={opponentIdentityFilter}
              options={opponentIdentityOptions}
              onChange={setOpponentIdentityFilter}
            />

            <FilterMultiSelect
              label="Stage"
              allLabel="All stages"
              selectedValues={stageFilter}
              options={stageOptions}
              onChange={setStageFilter}
            />

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

      {showAssignmentSection ? (
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

          {isAssignmentOpen ? (
            <ReplayAssignmentList
              items={assignmentItems}
              selectLabel="Track this player"
              emptyOptionLabel="Auto"
              onChange={(itemId, value) =>
                setReplayOverrides((current) => ({
                  ...current,
                  [itemId]: value === "" ? "auto" : (value as ReplayOverrideValue),
                }))
              }
            />
          ) : null}
        </div>
      ) : null}

      {matches.length === 0 ? (
        <div className="rounded-2xl border border-slate-600 bg-slate-900/35 p-5 text-sm text-slate-300">
          No replays matched the current tag and filters. Try a manual override,
          or widen the character and matchup filters.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <StatTile
              label="Replays matched"
              value={`${matches.length}`}
              detail={`${winCount} wins • ${lossCount} losses • ${sessionCount} sessions`}
            />
            <StatTile
              label="Avg L-Cancel"
              value={`${avgLCancel}%`}
              detail="Average success rate across filtered games"
            />
            <StatTile
              label="Avg Successful Tech"
              value={`${avgTechSuccess}%`}
            />
            <StatTile
              label="Tech Split (Toward/Away/IP)"
              value={`${totalTechToward} • ${totalTechAway} • ${totalTechInPlace}`}
              detail="Successful techs toward, away, and in-place"
            />
            <StatTile
              label="Avg Neutral Win"
              value={`${avgNeutralWin}%`}
              detail="Average neutral win rate"
            />
            <StatTile
              label="Avg Damage/Open"
              value={`${avgDamagePerOpening}`}
              detail="Damage converted from each opening"
            />
            <StatTile
              label="Avg Stocks Left"
              value={`${avgStocksRemaining ?? "N/A"}`}
            />
            <StatTile label="Avg APM" value={`${avgApm}`} />
            <StatTile
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
            ) : null}
          </div>
        </>
      )}
    </div>
  );
});

export default TrendDashboard;
