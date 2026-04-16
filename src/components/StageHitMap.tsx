import { useEffect, useState } from "react";

import {
  formatCharacterName,
  type AnalysisResponse,
} from "./replayAnalysisTypes";

type HitMapFilter = "all" | number;

type StageLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type StageLayout = {
  key: string;
  displayName: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  ground: StageLine[];
  platforms: StageLine[];
};

const HIT_SEQUENCE_INTERVAL_MS = 400;

const stageLayouts: Record<string, StageLayout> = {
  BATTLEFIELD: {
    key: "BATTLEFIELD",
    displayName: "Battlefield",
    minX: -95,
    maxX: 95,
    minY: -15,
    maxY: 75,
    ground: [{ x1: -68, y1: 0, x2: 68, y2: 0 }],
    platforms: [
      { x1: -52, y1: 25, x2: -18, y2: 25 },
      { x1: 18, y1: 25, x2: 52, y2: 25 },
      { x1: -16, y1: 48, x2: 16, y2: 48 },
    ],
  },
  FINAL_DESTINATION: {
    key: "FINAL_DESTINATION",
    displayName: "Final Destination",
    minX: -115,
    maxX: 115,
    minY: -15,
    maxY: 70,
    ground: [{ x1: -85, y1: 0, x2: 85, y2: 0 }],
    platforms: [],
  },
  DREAM_LAND_N64: {
    key: "DREAM_LAND_N64",
    displayName: "Dream Land",
    minX: -105,
    maxX: 105,
    minY: -15,
    maxY: 80,
    ground: [{ x1: -77, y1: 0, x2: 77, y2: 0 }],
    platforms: [
      { x1: -60, y1: 26, x2: -29, y2: 26 },
      { x1: 29, y1: 26, x2: 60, y2: 26 },
      { x1: -15, y1: 44, x2: 15, y2: 44 },
    ],
  },
  FOUNTAIN_OF_DREAMS: {
    key: "FOUNTAIN_OF_DREAMS",
    displayName: "Fountain of Dreams",
    minX: -96,
    maxX: 96,
    minY: -15,
    maxY: 78,
    ground: [{ x1: -64, y1: 0, x2: 64, y2: 0 }],
    platforms: [
      { x1: -49, y1: 24, x2: -18, y2: 24 },
      { x1: 18, y1: 24, x2: 49, y2: 24 },
    ],
  },
  POKEMON_STADIUM: {
    key: "POKEMON_STADIUM",
    displayName: "Pokemon Stadium",
    minX: -120,
    maxX: 120,
    minY: -15,
    maxY: 72,
    ground: [{ x1: -88, y1: 0, x2: 88, y2: 0 }],
    platforms: [
      { x1: -55, y1: 24, x2: -22, y2: 24 },
      { x1: 22, y1: 24, x2: 55, y2: 24 },
    ],
  },
  YOSHIS_STORY: {
    key: "YOSHIS_STORY",
    displayName: "Yoshi's Story",
    minX: -90,
    maxX: 90,
    minY: -15,
    maxY: 72,
    ground: [{ x1: -58, y1: 0, x2: 58, y2: 0 }],
    platforms: [
      { x1: -41, y1: 23, x2: -18, y2: 23 },
      { x1: 18, y1: 23, x2: 41, y2: 23 },
      { x1: -14, y1: 40, x2: 14, y2: 40 },
    ],
  },
};

const defaultStageLayout: StageLayout = {
  key: "DEFAULT",
  displayName: "Stage",
  minX: -110,
  maxX: 110,
  minY: -20,
  maxY: 80,
  ground: [{ x1: -80, y1: 0, x2: 80, y2: 0 }],
  platforms: [],
};

const playerColors = ["#38bdf8", "#f472b6", "#fbbf24", "#34d399"];

export function getStageLayout(stage?: string): StageLayout {
  if (!stage) {
    return defaultStageLayout;
  }

  return (
    stageLayouts[stage] ?? {
      ...defaultStageLayout,
      displayName: stage
        .toLowerCase()
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" "),
    }
  );
}

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
              stroke="#f8fafc"
              strokeWidth="3"
              strokeLinecap="round"
            />
          ))}

          {stageLayout.platforms.map((segment, index) => (
            <line
              key={`platform-${index}`}
              x1={segment.x1}
              y1={-segment.y1}
              x2={segment.x2}
              y2={-segment.y2}
              stroke="#c4b5fd"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          ))}

          {displayedHitLocations.map((location, index) => {
            const playerIndex = analysis.stats.per_player.findIndex(
              (player) => player.player_index === location.player_index,
            );
            const fill =
              location.is_stock_loss
                ? "#f97316"
                : playerColors[
                    (playerIndex >= 0 ? playerIndex : 0) % playerColors.length
                  ];
            const radius = Math.min(4.75, 2 + location.damage_taken / 6);
            const direction =
              location.launch_dx !== null && location.launch_dy !== null
                ? normalizeVector(location.launch_dx, location.launch_dy)
                : null;
            const arrowLength = radius + 10;
            const arrowEndX = direction
              ? location.x + direction.dx * arrowLength
              : location.x;
            const arrowEndY = direction
              ? -(location.y + direction.dy * arrowLength)
              : -location.y;

            return (
              <g key={`${location.player_index}-${location.frame_index}-${index}`}>
                {direction && (
                  <line
                    x1={location.x}
                    y1={-location.y}
                    x2={arrowEndX}
                    y2={arrowEndY}
                    stroke="#f8fafc"
                    strokeOpacity="0.75"
                    strokeWidth="0.95"
                    markerEnd="url(#hitDirectionArrow)"
                  />
                )}
                <circle
                  cx={location.x}
                  cy={-location.y}
                  r={radius + 2}
                  fill={fill}
                  opacity={location.is_stock_loss ? "0.3" : "0.12"}
                />
                <circle
                  cx={location.x}
                  cy={-location.y}
                  r={location.is_stock_loss ? radius + 1.4 : radius}
                  fill={fill}
                  opacity={location.is_stock_loss ? "0.95" : "0.72"}
                  stroke={location.is_stock_loss ? "#fde68a" : "#0f172a"}
                  strokeWidth={location.is_stock_loss ? "2.2" : "0.75"}
                >
                  <title>
                    {`${location.player_name} (${formatCharacterName(location.character)}) took ${location.damage_taken}% on frame ${location.frame_index} at (${location.x}, ${location.y})${direction ? ` and was launched toward (${arrowEndX.toFixed(1)}, ${(-arrowEndY).toFixed(1)})` : ""}`}
                  </title>
                </circle>
              </g>
            );
          })}
        </svg>
      </div>

      <p className="mt-3 text-xs text-slate-400">
        Showing {displayedHitLocations.length} of {visibleHitLocations.length}{" "}
        hit{visibleHitLocations.length === 1 ? "" : "s"}. Larger dots mean more
        damage from that hit. White-ringed dots mark hits that also coincided
        with a stock loss, and arrows estimate the launch direction from the
        next few frames of movement.
      </p>
    </div>
  );
}
