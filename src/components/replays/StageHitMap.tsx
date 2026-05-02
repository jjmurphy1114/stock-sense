import { useEffect, useState } from "react";

import { getStageLayout } from "../../lib/stageLayout";
import { formatCharacterName, type AnalysisResponse } from "../replayAnalysisTypes";

type HitMapFilter = "all" | number;

const HIT_SEQUENCE_INTERVAL_MS = 400;

const playerColors = ["#38bdf8", "#f472b6", "#fbbf24", "#34d399"];

function normalizeVector(dx: number, dy: number) {
  const magnitude = Math.hypot(dx, dy);
  if (magnitude === 0) {
    return null;
  }

  return {
    dx: dx / magnitude,
    dy: dy / magnitude,
  };
}

export default function StageHitMap({
  analysis,
}: {
  analysis: AnalysisResponse;
}) {
  const stageLayout = getStageLayout(analysis.metadata?.stage);
  const hitLocations = analysis.stats.hit_locations ?? [];
  const [activeFilter, setActiveFilter] = useState<HitMapFilter>("all");
  const [sequencePlaybackState, setSequencePlaybackState] = useState<
    "all" | "playing" | "paused"
  >("all");
  const [revealedHitCount, setRevealedHitCount] = useState(0);
  const visibleHitLocations = hitLocations.filter((location) =>
    activeFilter === "all" ? true : location.player_index === activeFilter,
  );
  const displayedHitLocations =
    sequencePlaybackState === "all"
      ? visibleHitLocations
      : visibleHitLocations.slice(0, revealedHitCount);
  const isSequenceAtEnd = revealedHitCount >= visibleHitLocations.length;

  useEffect(() => {
    if (sequencePlaybackState !== "playing" || isSequenceAtEnd) {
      return;
    }

    const timer = window.setTimeout(() => {
      setRevealedHitCount((current) =>
        Math.min(current + 1, visibleHitLocations.length),
      );
    }, HIT_SEQUENCE_INTERVAL_MS);

    return () => window.clearTimeout(timer);
  }, [
    isSequenceAtEnd,
    sequencePlaybackState,
    revealedHitCount,
    visibleHitLocations.length,
  ]);

  if (hitLocations.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-600 bg-slate-900/35 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-purple-300">
              Hit Map
            </p>
            <p className="mt-2 text-sm text-slate-300">
              No damage-position data was detected for this replay.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const viewBox = `${stageLayout.minX} ${-stageLayout.maxY} ${
    stageLayout.maxX - stageLayout.minX
  } ${stageLayout.maxY - stageLayout.minY}`;

  return (
    <div className="rounded-2xl border border-slate-600 bg-slate-900/35 p-5">
      <div className="flex flex-col gap-4 border-b border-slate-700 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-purple-300">
            Hit Map
          </p>
          <p className="mt-2 text-lg font-semibold text-white">
            Where each character got clipped on {stageLayout.displayName}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Each point marks a frame where percent increased.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setSequencePlaybackState("playing");
              setRevealedHitCount(0);
            }}
            className="rounded-full border border-purple-400/40 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-100 transition hover:bg-purple-500/20"
          >
            Replay hits
          </button>
          <button
            type="button"
            onClick={() => setSequencePlaybackState("paused")}
            disabled={sequencePlaybackState !== "playing"}
            className="rounded-full border border-slate-600 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Pause replay
          </button>
          <button
            type="button"
            onClick={() => setSequencePlaybackState("playing")}
            disabled={sequencePlaybackState !== "paused" || isSequenceAtEnd}
            className="rounded-full border border-slate-600 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Resume replay
          </button>
          <button
            type="button"
            onClick={() => {
              setSequencePlaybackState("all");
              setRevealedHitCount(visibleHitLocations.length);
            }}
            className="rounded-full border border-slate-600 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700/80"
          >
            Show all
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveFilter("all");
              setSequencePlaybackState("all");
              setRevealedHitCount(hitLocations.length);
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              activeFilter === "all"
                ? "border-purple-400 bg-purple-500/20 text-white"
                : "border-slate-600 bg-slate-800/80 text-slate-300 hover:bg-slate-700/80"
            }`}
          >
            All players
          </button>
          {analysis.stats.per_player.map((player, index) => {
            const hitCount = hitLocations.filter(
              (location) => location.player_index === player.player_index,
            ).length;

            return (
              <div
                key={player.player_index}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
                  activeFilter === player.player_index
                    ? "border-purple-400 bg-purple-500/20 text-white"
                    : "border-slate-600 bg-slate-800/80 text-slate-200 hover:bg-slate-700/80"
                }`}
                onClick={() => {
                  setActiveFilter(player.player_index);
                  setSequencePlaybackState("all");
                  setRevealedHitCount(hitCount);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setActiveFilter(player.player_index);
                    setSequencePlaybackState("all");
                    setRevealedHitCount(hitCount);
                  }
                }}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor: playerColors[index % playerColors.length],
                  }}
                />
                <span>
                  {player.player_name} ({formatCharacterName(player.character)}) •{" "}
                  {hitCount} hits
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-700 bg-linear-to-b from-slate-950 via-slate-900 to-slate-950">
        <svg
          viewBox={viewBox}
          className="aspect-[16/9] w-full"
          role="img"
          aria-label={`Hit locations on ${stageLayout.displayName}`}
        >
          <defs>
            <linearGradient id="stageGridFade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
            </linearGradient>
            <marker
              id="hitDirectionArrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#f8fafc" />
            </marker>
          </defs>

          <rect
            x={stageLayout.minX}
            y={-stageLayout.maxY}
            width={stageLayout.maxX - stageLayout.minX}
            height={stageLayout.maxY - stageLayout.minY}
            fill="url(#stageGridFade)"
          />

          {Array.from({ length: 7 }).map((_, index) => {
            const y = -stageLayout.maxY + index * 12;
            return (
              <line
                key={`h-${index}`}
                x1={stageLayout.minX}
                x2={stageLayout.maxX}
                y1={y}
                y2={y}
                stroke="#475569"
                strokeOpacity="0.25"
                strokeWidth="0.75"
              />
            );
          })}

          <line
            x1={0}
            x2={0}
            y1={-stageLayout.maxY}
            y2={-stageLayout.minY}
            stroke="#64748b"
            strokeOpacity="0.45"
            strokeWidth="1"
            strokeDasharray="4 4"
          />

          {stageLayout.ground.map((segment, index) => (
            <line
              key={`ground-${index}`}
              x1={segment.x1}
              y1={-segment.y1}
              x2={segment.x2}
              y2={-segment.y2}
              stroke="#e2e8f0"
              strokeWidth="2.75"
              strokeLinecap="round"
            />
          ))}

          {stageLayout.platforms.map((platform, index) => (
            <line
              key={`platform-${index}`}
              x1={platform.x1}
              y1={-platform.y1}
              x2={platform.x2}
              y2={-platform.y2}
              stroke="#cbd5f5"
              strokeOpacity="0.9"
              strokeWidth="2.1"
              strokeLinecap="round"
            />
          ))}

          {displayedHitLocations.map((location, index) => {
            const color =
              playerColors[location.player_index % playerColors.length];
            const normalizedLaunch =
              location.launch_dx !== null && location.launch_dy !== null
                ? normalizeVector(location.launch_dx, location.launch_dy)
                : null;
            const lineLength = location.is_stock_loss ? 11 : 7;
            const lineEndX = normalizedLaunch
              ? location.x + normalizedLaunch.dx * lineLength
              : location.x;
            const lineEndY = normalizedLaunch
              ? location.y + normalizedLaunch.dy * lineLength
              : location.y;

            return (
              <g key={`${location.frame_index}-${location.player_index}-${index}`}>
                {normalizedLaunch ? (
                  <line
                    x1={location.x}
                    y1={-location.y}
                    x2={lineEndX}
                    y2={-lineEndY}
                    stroke="#f8fafc"
                    strokeOpacity={location.is_stock_loss ? 0.95 : 0.65}
                    strokeWidth={location.is_stock_loss ? 1.8 : 1.2}
                    markerEnd="url(#hitDirectionArrow)"
                  />
                ) : null}
                <circle
                  cx={location.x}
                  cy={-location.y}
                  r={location.is_stock_loss ? 4.4 : 3.1}
                  fill={color}
                  fillOpacity={location.is_stock_loss ? 1 : 0.78}
                  stroke={location.is_stock_loss ? "#f8fafc" : "#0f172a"}
                  strokeWidth={location.is_stock_loss ? 1.3 : 0.9}
                />
                <title>
                  {`${location.player_name} (${formatCharacterName(
                    location.character,
                  )}) • ${location.damage_taken} dmg → ${
                    location.percent_after_hit
                  }% at frame ${location.frame_index}`}
                </title>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
