import { useRef, useState } from "react";

import StageHitMap, { getStageLayout } from "./StageHitMap";
import TrendDashboard from "./TrendDashboard";
import type {
  AnalysisResponse,
  BatchAnalysisResponse,
} from "./replayAnalysisTypes";
import { formatCharacterName } from "./replayAnalysisTypes";

type AnalysisTab = "overview" | "graph";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(
  /\/$/,
  "",
);

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
  const singleFileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadSource, setUploadSource] = useState<"single" | "folder" | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [batchAnalysis, setBatchAnalysis] =
    useState<BatchAnalysisResponse | null>(null);
  const [selectedTag, setSelectedTag] = useState("");
  const [selectionLabel, setSelectionLabel] = useState<string>("");
  const [activeTab, setActiveTab] = useState<AnalysisTab>("overview");
  const stageDisplayName = getStageLayout(
    analysis?.metadata?.stage,
  ).displayName;
  const playerFeedbackGroups = analysis
    ? getPlayerFeedbackGroups(analysis)
    : [];

  const directoryPickerProps = {
    webkitdirectory: "",
    directory: "",
  } as React.InputHTMLAttributes<HTMLInputElement>;

  const clearPickerValues = () => {
    if (singleFileInputRef.current) {
      singleFileInputRef.current.value = "";
    }
    if (folderInputRef.current) {
      folderInputRef.current.value = "";
    }
  };

  const handleSingleReplayChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) {
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith(".slp")) {
      setError("Please select a valid .slp file");
      setSelectedFiles([]);
      setUploadSource(null);
      return;
    }

    setSelectedFiles([selectedFile]);
    setUploadSource("single");
    setSelectionLabel(selectedFile.name);
    setError(null);
  };

  const handleFolderReplayChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const validFiles = Array.from(event.target.files ?? []).filter((file) =>
      file.name.toLowerCase().endsWith(".slp"),
    );

    if (validFiles.length === 0) {
      setError("Please select a folder containing .slp files");
      setSelectedFiles([]);
      setUploadSource(null);
      return;
    }

    setSelectedFiles(validFiles);
    setUploadSource("folder");
    setSelectionLabel(
      `${validFiles.length} replay${validFiles.length === 1 ? "" : "s"} selected`,
    );
    setError(null);
  };

  const normalizeSingleAnalysis = (
    rawData: AnalysisResponse,
  ): AnalysisResponse => {
    return {
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
  };

  const normalizeBatchResponse = (
    rawData: BatchAnalysisResponse,
  ): BatchAnalysisResponse => {
    return {
      ...rawData,
      replays: (rawData.replays ?? []).map((replay) => ({
        ...normalizeSingleAnalysis(replay),
        filename: replay.filename,
      })),
      available_tags: rawData.available_tags ?? [],
      failed_files: rawData.failed_files ?? [],
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedFiles.length === 0 || !uploadSource) {
      setError("Please choose either a single replay or a replay folder");
      return;
    }

    setLoading(true);
    setError(null);
    setAnalysis(null);
    setBatchAnalysis(null);

    try {
      const formData = new FormData();
      const isBatchUpload =
        uploadSource === "folder" || selectedFiles.length > 1;
      if (isBatchUpload) {
        selectedFiles.forEach((file) => {
          formData.append("files", file);
        });
      } else {
        formData.append("file", selectedFiles[0]);
      }

      const response = await fetch(
        `${API_BASE_URL}${isBatchUpload ? "/analyze-batch" : "/analyze"}`,
        {
          method: "POST",
          body: formData,
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        const detail =
          typeof errorData.detail === "string"
            ? errorData.detail
            : errorData.detail?.message || "Failed to analyze replay";
        throw new Error(detail);
      }

      if (isBatchUpload) {
        const rawData: BatchAnalysisResponse = await response.json();
        const data = normalizeBatchResponse(rawData);
        setBatchAnalysis(data);
        setSelectedTag(data.available_tags[0] ?? "");
      } else {
        const rawData: AnalysisResponse = await response.json();
        const data = normalizeSingleAnalysis(rawData);
        setAnalysis(data);
        setActiveTab("overview");
      }

      setSelectedFiles([]);
      setUploadSource(null);
      setSelectionLabel("");
      clearPickerValues();
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
        <div className="mb-12">
          <div className="flex items-center justify-center gap-3 mb-2">
            <img src="/stocksense.png" alt="StockSense" className="h-20 w-20" />
            <h1 className="text-5xl font-bold text-white">StockSense</h1>
          </div>
          <p className="text-purple-200 text-lg text-center">
            A Melee Replay Analyzer and Coach
          </p>
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
                {(analysis || batchAnalysis) && (
                  <p className="text-sm text-purple-200">
                    Analysis loaded. Choose another replay or folder to replace
                    it.
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
                <div className="space-y-3">
                  {!analysis && !batchAnalysis && (
                    <label className="block text-sm font-medium text-purple-200">
                      Choose one upload path
                    </label>
                  )}

                  <input
                    ref={singleFileInputRef}
                    type="file"
                    accept=".slp"
                    onChange={handleSingleReplayChange}
                    disabled={loading}
                    className="hidden"
                  />
                  <input
                    ref={folderInputRef}
                    type="file"
                    accept=".slp"
                    multiple
                    onChange={handleFolderReplayChange}
                    disabled={loading}
                    className="hidden"
                    {...directoryPickerProps}
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => singleFileInputRef.current?.click()}
                      disabled={loading}
                      className={`rounded-xl border px-4 py-4 text-left transition ${
                        uploadSource === "single"
                          ? "border-purple-400 bg-purple-500/15 text-white"
                          : "border-purple-400/30 bg-slate-700/60 text-slate-100 hover:border-purple-400"
                      } disabled:opacity-50`}
                    >
                      <p className="text-sm font-semibold">Single Replay</p>
                      <p className="mt-1 text-xs text-slate-300">
                        Analyze one `.slp` file with the full per-game report.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => folderInputRef.current?.click()}
                      disabled={loading}
                      className={`rounded-xl border px-4 py-4 text-left transition ${
                        uploadSource === "folder"
                          ? "border-purple-400 bg-purple-500/15 text-white"
                          : "border-purple-400/30 bg-slate-700/60 text-slate-100 hover:border-purple-400"
                      } disabled:opacity-50`}
                    >
                      <p className="text-sm font-semibold">Replay Folder</p>
                      <p className="mt-1 text-xs text-slate-300">
                        Upload a folder of `.slp` files to track trends by
                        Slippi tag.
                      </p>
                    </button>
                  </div>

                  {selectionLabel && (
                    <p className="text-sm text-green-400">✓ {selectionLabel}</p>
                  )}
                  {uploadSource === "folder" && selectedFiles.length > 0 && (
                    <p className="text-xs text-slate-400">
                      Batch mode will match your player across replays using the
                      selected Slippi tag.
                    </p>
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
                  disabled={selectedFiles.length === 0 || loading}
                  className={`px-6 py-3 bg-linear-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-purple-500/50 transition disabled:opacity-50 disabled:cursor-not-allowed ${
                    analysis ? "lg:self-start" : "w-full"
                  }`}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin">⚙️</span>{" "}
                      {uploadSource === "folder"
                        ? "Analyzing folder..."
                        : "Analyzing..."}
                    </span>
                  ) : uploadSource === "folder" ? (
                    "Analyze Trends"
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
                                    {formatCharacterName(player.character)}
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
                                      ({formatCharacterName(player.character)})
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
                                      ({formatCharacterName(player.character)})
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

                {activeTab === "graph" && (
                  <StageHitMap
                    key={`${analysis.stats.total_frames}-${analysis.stats.hit_locations.length}-${analysis.metadata?.stage ?? "unknown"}`}
                    analysis={analysis}
                  />
                )}
              </div>
            )}

            {batchAnalysis && (
              <div className="bg-slate-800 rounded-xl shadow-2xl p-8 border border-green-500/20">
                {batchAnalysis.available_tags.length > 0 ? (
                  <TrendDashboard
                    batchAnalysis={batchAnalysis}
                    selectedTag={selectedTag}
                    onSelectTag={setSelectedTag}
                  />
                ) : (
                  <div className="rounded-2xl border border-slate-600 bg-slate-900/35 p-5 text-sm text-slate-300">
                    The uploaded replays were parsed, but no non-empty Slippi
                    tags were found to match a player across games.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
