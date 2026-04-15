import type {
  BatchAnalysisResponse,
  PerPlayerStats,
} from "./replayAnalysisTypes";

type TrendMatch = {
  filename: string;
  character: string;
  stage?: string;
  didWin: boolean;
  stats: PerPlayerStats;
};

function normalizeTag(tag: string) {
  return tag.trim().toLowerCase();
}

function getTrendMatches(
  batchAnalysis: BatchAnalysisResponse,
  selectedTag: string,
): TrendMatch[] {
  const normalizedSelectedTag = normalizeTag(selectedTag);

  return batchAnalysis.replays.flatMap((replay) => {
    const player = replay.metadata?.players.find(
      (entry) => normalizeTag(entry.tag) === normalizedSelectedTag,
    );

    if (!player) {
      return [];
    }

    const stats = replay.stats.per_player.find(
      (entry) => entry.player_index === player.player_index,
    );

    if (!stats) {
      return [];
    }

    return [
      {
        filename: replay.filename,
        character: player.character,
        stage: replay.metadata?.stage,
        didWin: player.did_win,
        stats,
      },
    ];
  });
}

function averageBy<T>(items: T[], selector: (item: T) => number) {
  if (items.length === 0) {
    return 0;
  }

  return selector === undefined
    ? 0
    : items.reduce((total, item) => total + selector(item), 0) / items.length;
}

function roundValue(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function getCharacterCounts(matches: TrendMatch[]) {
  const counts = new Map<string, number>();

  matches.forEach((match) => {
    counts.set(match.character, (counts.get(match.character) ?? 0) + 1);
  });

  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1]);
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

export default function TrendDashboard({
  batchAnalysis,
  selectedTag,
  onSelectTag,
}: {
  batchAnalysis: BatchAnalysisResponse;
  selectedTag: string;
  onSelectTag: (tag: string) => void;
}) {
  const matches = getTrendMatches(batchAnalysis, selectedTag);
  const characterCounts = getCharacterCounts(matches);
  const winCount = matches.filter((match) => match.didWin).length;
  const lossCount = matches.length - winCount;
  const avgLCancel = roundValue(
    averageBy(matches, (match) => match.stats.l_cancel_rate),
  );
  const avgTechMiss = roundValue(
    averageBy(matches, (match) => match.stats.tech_miss_rate),
  );
  const avgNeutralWin = roundValue(
    averageBy(matches, (match) => match.stats.neutral_win_rate),
  );
  const avgDamagePerOpening = roundValue(
    averageBy(matches, (match) => match.stats.damage_per_opening),
  );
  const avgApm = roundValue(
    averageBy(matches, (match) => match.stats.actions_per_minute),
  );
  const avgOpeningsPerKill = roundValue(
    averageBy(
      matches.filter((match) => match.stats.openings_per_kill !== null),
      (match) => match.stats.openings_per_kill ?? 0,
    ),
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-600 bg-slate-900/35 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-purple-300">
              Trend Tracking
            </p>
            <p className="mt-2 text-lg font-semibold text-white">
              Review habits across a folder of replays by Slippi tag
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Uploads analyzed: {batchAnalysis.replays.length}
              {batchAnalysis.failed_files.length > 0
                ? ` • Failed: ${batchAnalysis.failed_files.length}`
                : ""}
            </p>
          </div>

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
        </div>
      </div>

      {matches.length === 0 ? (
        <div className="rounded-2xl border border-slate-600 bg-slate-900/35 p-5 text-sm text-slate-300">
          No replays in this batch matched the selected tag.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <TrendStat
              label="Replays matched"
              value={`${matches.length}`}
              detail={`${winCount} wins • ${lossCount} losses`}
            />
            <TrendStat
              label="Avg L-Cancel"
              value={`${avgLCancel}%`}
              detail="Average success rate across matched games"
            />
            <TrendStat
              label="Avg Tech Miss"
              value={`${avgTechMiss}%`}
              detail="Lower is better"
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
              label="Avg APM"
              value={`${avgApm}`}
              detail={`Openings/Kill ${avgOpeningsPerKill || "N/A"}`}
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
                  className="rounded-full border border-slate-600 bg-slate-800/80 px-4 py-2 text-sm text-slate-200"
                >
                  {character} • {count} replay{count === 1 ? "" : "s"}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-purple-300">
              Matched Replays
            </p>
            <div className="space-y-3">
              {matches.map((match) => (
                <div
                  key={`${match.filename}-${match.character}-${match.stage ?? "unknown"}`}
                  className="rounded-2xl border border-slate-600 bg-slate-900/35 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {match.filename}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {match.character}
                        {match.stage ? ` • ${match.stage}` : ""}
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

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div className="rounded-lg bg-slate-800/70 p-3">
                      <p className="text-slate-400">L-Cancel</p>
                      <p className="mt-1 font-semibold text-white">
                        {match.stats.l_cancel_rate}%
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-800/70 p-3">
                      <p className="text-slate-400">Tech Miss</p>
                      <p className="mt-1 font-semibold text-white">
                        {match.stats.tech_miss_rate}%
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
}
