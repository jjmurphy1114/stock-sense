import { useState } from "react";

interface AnalysisResponse {
  stats: {
    total_frames: number;
    total_actions: number;
    match_duration_seconds: number;
    hit_locations: Array<{
      frame_index: number;
      player_index: number;
      player_name: string;
      character: string;
      x: number;
      y: number;
      damage_taken: number;
      percent_after_hit: number;
      is_stock_loss: boolean;
    }>;
    per_player: Array<{
      player_index: number;
      player_name: string;
      character: string;
      l_cancel_attempts: number;
      l_cancel_successes: number;
      l_cancel_rate: number;
      tech_attempts: number;
      missed_techs: number;
      tech_miss_rate: number;
      tech_left_count: number;
      tech_right_count: number;
      tech_in_place_count: number;
      actions_per_minute: number;
      ledge_grabs: number;
      wavedashes: number;
      wavelands: number;
      attack_actions: number;
      movement_actions: number;
      openings_won: number;
      kills_secured: number;
      total_damage_inflicted: number;
      punishes_faced: number;
      escaped_punishes: number;
      openings_per_kill: number | null;
      damage_per_opening: number;
      neutral_win_rate: number;
      average_opening_length: number;
      attack_ratio: number;
      movement_ratio: number;
    }>;
  };
  feedback: string[];
  summary: string;
  metadata?: {
    players: Array<{
      player_index: number;
      character: string;
      tag: string;
      is_cpu: boolean;
      stocks_left: number | null;
      did_win: boolean;
    }>;
    num_players: number;
    stage?: string;
    winner_player_index?: number | null;
    winner_name?: string | null;
  };
}

type AnalysisTab = "overview" | "graph";
type HitMapFilter = "all" | number;

function StatTile({
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

const characterIconSlugByName: Record<string, string> = {
  BOWSER: "bowser",
  CAPTAIN_FALCON: "captain-falcon",
  DONKEY_KONG: "donkey-kong",
  DR_MARIO: "dr-mario",
  FALCO: "falco",
  FOX: "fox",
  GAME_AND_WATCH: "mr-game-and-watch",
  GANONDORF: "ganondorf",
  ICE_CLIMBERS: "ice-climbers",
  JIGGLYPUFF: "jigglypuff",
  KIRBY: "kirby",
  LINK: "link",
  LUIGI: "luigi",
  MARIO: "mario",
  MARTH: "marth",
  MEWTWO: "mewtwo",
  NANA: "ice-climbers",
  NESS: "ness",
  PEACH: "peach",
  PICHU: "pichu",
  PIKACHU: "pikachu",
  POPO: "ice-climbers",
  ROY: "roy",
  SAMUS: "samus",
  SHEIK: "sheik",
  YLINK: "young-link",
  YOSHI: "yoshi",
  YOUNG_LINK: "young-link",
  ZELDA: "zelda",
};

function getCharacterIconSrc(character: string): string | null {
  const slug = characterIconSlugByName[character];
  return slug ? `/stock-icons/${slug}.png` : null;
}

function CharacterIcon({
  character,
  className = "h-8 w-8",
}: {
  character: string;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);
  const iconSrc = getCharacterIconSrc(character);

  if (!iconSrc || hasError) {
    return (
      <div
        className={`flex items-center justify-center rounded-full border border-slate-600 bg-slate-900/70 text-[10px] font-semibold uppercase tracking-wide text-slate-300 ${className}`}
        aria-hidden="true"
      >
        {character.slice(0, 2)}
      </div>
    );
  }

  return (
    <img
      src={iconSrc}
      alt={`${character} stock icon`}
      className={`rounded-full border border-slate-600/80 bg-slate-900/70 object-contain p-1 ${className}`}
      onError={() => setHasError(true)}
    />
  );
}

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

function getStageLayout(stage?: string): StageLayout {
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

function StageHitMap({ analysis }: { analysis: AnalysisResponse }) {
  const stageLayout = getStageLayout(analysis.metadata?.stage);
  const hitLocations = analysis.stats.hit_locations ?? [];
  const [activeFilter, setActiveFilter] = useState<HitMapFilter>("all");
  const visibleHitLocations = hitLocations.filter((location) =>
    activeFilter === "all" ? true : location.player_index === activeFilter,
  );

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
            onClick={() => setActiveFilter("all")}
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
                onClick={() => setActiveFilter(player.player_index)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setActiveFilter(player.player_index);
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
                  {player.player_name} ({player.character}) • {hitCount} hits
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

          {visibleHitLocations.map((location, index) => {
            const playerIndex = analysis.stats.per_player.findIndex(
              (player) => player.player_index === location.player_index,
            );
            const fill =
              playerColors[
                (playerIndex >= 0 ? playerIndex : 0) % playerColors.length
              ];
            const radius = Math.min(6.5, 3 + location.damage_taken / 4);

            return (
              <g
                key={`${location.player_index}-${location.frame_index}-${index}`}
              >
                <circle
                  cx={location.x}
                  cy={-location.y}
                  r={radius + 2}
                  fill={fill}
                  opacity="0.12"
                />
                <circle
                  cx={location.x}
                  cy={-location.y}
                  r={radius}
                  fill={fill}
                  opacity={location.is_stock_loss ? "0.95" : "0.72"}
                  stroke={location.is_stock_loss ? "#ffffff" : "#0f172a"}
                  strokeWidth={location.is_stock_loss ? "1.5" : "0.75"}
                >
                  <title>
                    {`${location.player_name} (${location.character}) took ${location.damage_taken}% on frame ${location.frame_index} at (${location.x}, ${location.y})`}
                  </title>
                </circle>
              </g>
            );
          })}
        </svg>
      </div>

      <p className="mt-3 text-xs text-slate-400">
        Showing {visibleHitLocations.length} hit
        {visibleHitLocations.length === 1 ? "" : "s"}. Larger dots mean more
        damage from that hit. White-ringed dots mark hits that also coincided
        with a stock loss.
      </p>
    </div>
  );
}

function getPlayerFeedbackGroups(analysis: AnalysisResponse) {
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

export default function ReplayAnalyzer() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [activeTab, setActiveTab] = useState<AnalysisTab>("overview");
  const stageDisplayName = getStageLayout(
    analysis?.metadata?.stage,
  ).displayName;
  const playerFeedbackGroups = analysis
    ? getPlayerFeedbackGroups(analysis)
    : [];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.toLowerCase().endsWith(".slp")) {
        setError("Please select a valid .slp file");
        setFile(null);
        return;
      }
      setFile(selectedFile);
      setFileName(selectedFile.name);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      setError("Please select a .slp file");
      return;
    }

    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to analyze replay");
      }

      const rawData: AnalysisResponse = await response.json();
      const data: AnalysisResponse = {
        ...rawData,
        stats: {
          ...rawData.stats,
          hit_locations: rawData.stats?.hit_locations ?? [],
          per_player: rawData.stats?.per_player ?? [],
        },
        feedback: rawData.feedback ?? [],
        metadata: rawData.metadata
          ? {
              ...rawData.metadata,
              players: rawData.metadata.players ?? [],
            }
          : undefined,
      };
      setAnalysis(data);
      setActiveTab("overview");
      setFile(null);
      setFileName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-purple-900 via-slate-900 to-slate-800 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-2">StockSense</h1>
          <p className="text-purple-200 text-lg">AI-Powered Replay Analysis</p>
        </div>

        <div className={"grid gap-8 justify-center"}>
          {/* Upload Section */}
          <div
            className={`bg-slate-800 rounded-xl shadow-2xl border border-purple-500/20 ${
              analysis ? "p-5" : "p-8"
            }`}
          >
            <div
              className={`${
                analysis
                  ? "flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
                  : ""
              }`}
            >
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  Upload Replay
                </h2>
                {analysis && (
                  <p className="text-sm text-purple-200">
                    Game loaded. Upload another `.slp` file to replace this
                    analysis.
                  </p>
                )}
              </div>

              <form
                onSubmit={handleSubmit}
                className={`${
                  analysis
                    ? "flex flex-col gap-3 lg:min-w-[28rem]"
                    : "space-y-6"
                }`}
              >
                {/* File Input */}
                <div className="relative">
                  {!analysis && (
                    <label className="block text-sm font-medium text-purple-200 mb-3">
                      Select .slp file
                    </label>
                  )}
                  <input
                    type="file"
                    accept=".slp"
                    onChange={handleFileChange}
                    disabled={loading}
                    className="w-full px-4 py-3 bg-slate-700 border-2 border-dashed border-purple-400/50 rounded-lg text-white placeholder-gray-400 cursor-pointer hover:border-purple-400 transition disabled:opacity-50"
                  />
                  {fileName && (
                    <p className="text-sm text-green-400 mt-2">✓ {fileName}</p>
                  )}
                </div>

                {/* Error Message */}
                {error && (
                  <div className="bg-red-900/30 border border-red-600/50 rounded-lg p-4">
                    <p className="text-red-200 text-sm">⚠️ {error}</p>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={!file || loading}
                  className={`px-6 py-3 bg-linear-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-purple-500/50 transition disabled:opacity-50 disabled:cursor-not-allowed ${
                    analysis ? "lg:self-start" : "w-full"
                  }`}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin">⚙️</span> Analyzing...
                    </span>
                  ) : (
                    "Analyze Replay"
                  )}
                </button>
              </form>
            </div>

            {/* Info Box */}
            {!analysis && (
              <div className="mt-8 p-4 bg-slate-700/50 rounded-lg border border-purple-400/20">
                <p className="text-xs text-gray-300">
                  Upload your Slippi replay files (.slp) to receive instant
                  coaching feedback based on your gameplay stats.
                </p>
              </div>
            )}
          </div>

          {/* Analysis Results */}
          <div className="lg:col-span-1">
            {analysis && (
              <div className="bg-slate-800 rounded-xl shadow-2xl p-8 border border-green-500/20 space-y-6">
                <h2 className="text-2xl font-bold text-white">
                  Analysis Results
                </h2>

                <div className="inline-flex rounded-xl border border-slate-600 bg-slate-900/50 p-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab("overview")}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                      activeTab === "overview"
                        ? "bg-purple-500 text-white shadow-lg shadow-purple-500/20"
                        : "text-slate-300 hover:bg-slate-700/70"
                    }`}
                  >
                    Overview
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("graph")}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                      activeTab === "graph"
                        ? "bg-purple-500 text-white shadow-lg shadow-purple-500/20"
                        : "text-slate-300 hover:bg-slate-700/70"
                    }`}
                  >
                    Hit Graph
                  </button>
                </div>

                {activeTab === "overview" && (
                  <>
                    {/* Metadata */}
                    {analysis.metadata && (
                      <div className="space-y-3 pb-4 border-b border-slate-700">
                        <h3 className="text-sm font-semibold text-purple-300 uppercase">
                          Game Info
                        </h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-gray-400">Players</p>
                            <p className="text-white font-semibold">
                              {analysis.metadata.num_players}
                            </p>
                          </div>
                          {analysis.metadata.stage && (
                            <div>
                              <p className="text-gray-400">Stage</p>
                              <p className="text-white font-semibold">
                                {stageDisplayName}
                              </p>
                            </div>
                          )}
                          {analysis.metadata.winner_name && (
                            <div>
                              <p className="text-gray-400">Winner</p>
                              <p className="text-white font-semibold">
                                {analysis.metadata.winner_name}
                              </p>
                            </div>
                          )}
                        </div>
                        {analysis.metadata.players.length > 0 && (
                          <div className="mt-4 space-y-2">
                            {analysis.metadata.players.map((player, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between gap-3 p-2 bg-slate-700/50 rounded"
                              >
                                <div className="flex items-center gap-3">
                                  <span className="text-purple-400 font-semibold">
                                    P{player.player_index + 1}
                                  </span>
                                  <CharacterIcon
                                    character={player.character}
                                    className="h-8 w-8"
                                  />
                                  <span className="text-white">
                                    {player.character}
                                  </span>
                                  {player.tag && (
                                    <span className="text-gray-400 text-xs">
                                      ({player.tag})
                                    </span>
                                  )}
                                  {player.did_win && (
                                    <span className="text-green-400 text-xs font-semibold">
                                      Winner
                                    </span>
                                  )}
                                </div>
                                <span className="text-gray-300 text-xs">
                                  Stocks left: {player.stocks_left ?? "N/A"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Stats */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-purple-300 uppercase">
                        Game Stats
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-700/50 rounded-lg p-3">
                          <p className="text-gray-400 text-xs">Duration</p>
                          <p className="text-white font-bold text-lg">
                            {analysis.stats.match_duration_seconds}s
                          </p>
                        </div>
                        <div className="bg-slate-700/50 rounded-lg p-3">
                          <p className="text-gray-400 text-xs">Total Frames</p>
                          <p className="text-white font-bold text-lg">
                            {analysis.stats.total_frames}
                          </p>
                        </div>
                        <div className="bg-slate-700/50 rounded-lg p-3">
                          <p className="text-gray-400 text-xs">Actions</p>
                          <p className="text-white font-bold text-lg">
                            {analysis.stats.total_actions}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Feedback */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-purple-300 uppercase">
                        Coaching Feedback
                      </h3>
                      {playerFeedbackGroups.length > 0 ? (
                        <div className="grid gap-4 lg:grid-cols-2">
                          {playerFeedbackGroups.map((player) => (
                            <div
                              key={player.player_index}
                              className="rounded-2xl border border-slate-600 bg-slate-900/35 p-4"
                            >
                              <div className="mb-3 flex items-center gap-3 border-b border-slate-700 pb-3">
                                <CharacterIcon
                                  character={player.character}
                                  className="h-9 w-9"
                                />
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-purple-300">
                                    Player {player.player_index + 1}
                                  </p>
                                  <p className="text-sm font-semibold text-white">
                                    {player.player_name}{" "}
                                    <span className="text-slate-400">
                                      ({player.character})
                                    </span>
                                  </p>
                                </div>
                              </div>

                              <div className="space-y-2">
                                {player.feedback.length > 0 ? (
                                  player.feedback.map((item, idx) => (
                                    <div
                                      key={`${player.player_index}-${idx}`}
                                      className="rounded-lg border-l-4 border-purple-500 bg-slate-700/50 p-3"
                                    >
                                      <p className="text-sm text-white">
                                        {item}
                                      </p>
                                    </div>
                                  ))
                                ) : (
                                  <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
                                    <p className="text-sm text-slate-300">
                                      No player-specific coaching notes were
                                      generated for this replay.
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {analysis.feedback.map((item, idx) => (
                            <div
                              key={idx}
                              className="bg-slate-700/50 rounded-lg p-3 border-l-4 border-purple-500"
                            >
                              <p className="text-white text-sm">{item}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Per-Player Advanced Stats */}
                    {analysis.stats.per_player.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-purple-300 uppercase">
                          Per-Player Habits
                        </h3>
                        <div className="space-y-3">
                          {analysis.stats.per_player.map((player) => (
                            <div
                              key={player.player_index}
                              className="overflow-hidden rounded-2xl border border-slate-600 bg-linear-to-br from-slate-800 via-slate-800 to-slate-900/90 shadow-lg shadow-black/15"
                            >
                              <div className="flex flex-col gap-3 border-b border-slate-700/80 bg-slate-900/35 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-purple-300">
                                    Player {player.player_index + 1}
                                  </p>
                                  <p className="mt-1 flex items-center gap-3 text-lg font-semibold text-white">
                                    <CharacterIcon
                                      character={player.character}
                                      className="h-9 w-9"
                                    />
                                    <span>{player.player_name} </span>
                                    <span className="text-slate-400">
                                      ({player.character})
                                    </span>
                                  </p>
                                </div>
                                <div className="inline-flex w-fit rounded-full border border-purple-400/25 bg-purple-500/10 px-3 py-1 text-xs font-medium text-purple-200">
                                  Neutral {player.neutral_win_rate}% • Dmg/Open{" "}
                                  {player.damage_per_opening}
                                </div>
                              </div>

                              <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
                                <StatTile
                                  label="L-Cancel"
                                  value={`${player.l_cancel_rate}%`}
                                  detail={`${player.l_cancel_successes}/${player.l_cancel_attempts} successes`}
                                />
                                <StatTile
                                  label="Tech Miss Rate"
                                  value={`${player.tech_miss_rate}%`}
                                  detail={`${player.missed_techs}/${player.tech_attempts} missed`}
                                />
                                <StatTile
                                  label="Tech Direction"
                                  value={`L ${player.tech_left_count} • R ${player.tech_right_count} • N ${player.tech_in_place_count}`}
                                />
                                <StatTile
                                  label="APM"
                                  value={`${player.actions_per_minute}`}
                                  detail="Action-state changes per minute"
                                />
                                <StatTile
                                  label="Aggression"
                                  value={`${player.attack_ratio}% attack`}
                                  detail={`${player.movement_ratio}% movement`}
                                />
                                <StatTile
                                  label="Ledge Grabs"
                                  value={`${player.ledge_grabs}`}
                                  detail="Times the ledge was caught"
                                />
                                <StatTile
                                  label="Wavedashes"
                                  value={`${player.wavedashes}`}
                                  detail="Grounded air-dodge landings"
                                />
                                <StatTile
                                  label="Wavelands"
                                  value={`${player.wavelands}`}
                                  detail="Platform or aerial air-dodge landings"
                                />
                                <StatTile
                                  label="Openings per Kill"
                                  value={`${player.openings_per_kill ?? "N/A"}`}
                                  detail={`${player.kills_secured} kills secured`}
                                />
                                <StatTile
                                  label="Damage per Opening"
                                  value={`${player.damage_per_opening}`}
                                  detail={`${player.total_damage_inflicted} total damage`}
                                />
                                <StatTile
                                  label="Neutral Win Rate"
                                  value={`${player.neutral_win_rate}%`}
                                  detail={`${player.openings_won} openings won`}
                                />
                                <StatTile
                                  label="Avg Opening Length"
                                  value={`${player.average_opening_length} hits`}
                                  detail="Average hits per punish"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {activeTab === "graph" && <StageHitMap analysis={analysis} />}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
