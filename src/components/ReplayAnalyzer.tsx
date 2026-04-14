import { useState } from "react";

interface AnalysisResponse {
  stats: {
    total_frames: number;
    total_actions: number;
    match_duration_seconds: number;
    players_per_frame: number;
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
      defensive_escape_rate: number;
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

export default function ReplayAnalyzer() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [fileName, setFileName] = useState<string>("");

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

      const data: AnalysisResponse = await response.json();
      setAnalysis(data);
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

        <div
          className={`grid gap-8 ${analysis ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"}`}
        >
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
                  analysis ? "flex flex-col gap-3 lg:min-w-[28rem]" : "space-y-6"
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
                  💡 <strong>Tip:</strong> Upload your Slippi replay files
                  (.slp) to receive instant coaching feedback based on your
                  gameplay stats.
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
                            {analysis.metadata.stage}
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
                    <div className="bg-slate-700/50 rounded-lg p-3">
                      <p className="text-gray-400 text-xs">Intensity</p>
                      <p className="text-white font-bold text-lg">
                        {analysis.stats.players_per_frame}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Feedback */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-purple-300 uppercase">
                    Coaching Feedback
                  </h3>
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
                                <span>
                                  {player.player_name}{" "}
                                </span>
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
                              label="Aggression"
                              value={`${player.attack_ratio}% attack`}
                              detail={`${player.movement_ratio}% movement`}
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
                            <StatTile
                              label="Defensive Escape Rate"
                              value={`${player.defensive_escape_rate}%`}
                              detail={`${player.escaped_punishes}/${player.punishes_faced} escapes`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!analysis && !loading && (
              <div className="bg-slate-800 rounded-xl shadow-2xl p-8 border border-slate-700/50 text-center">
                <p className="text-gray-400">
                  Upload a replay to see analysis results here
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
