import { useState } from "react";

interface AnalysisResponse {
  stats: {
    total_frames: number;
    total_actions: number;
    match_duration_seconds: number;
    players_per_frame: number;
  };
  feedback: string[];
  summary: string;
  metadata?: {
    players: Array<{
      player_index: number;
      character: string;
      nametag: string;
      is_cpu: boolean;
    }>;
    num_players: number;
    stage?: string;
  };
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
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-slate-900 to-slate-800 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-2">Melee Coach</h1>
          <p className="text-purple-200 text-lg">AI-Powered Replay Analysis</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Upload Section */}
          <div className="bg-slate-800 rounded-xl shadow-2xl p-8 border border-purple-500/20">
            <h2 className="text-2xl font-bold text-white mb-6">
              Upload Replay
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* File Input */}
              <div className="relative">
                <label className="block text-sm font-medium text-purple-200 mb-3">
                  Select .slp file
                </label>
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
                className="w-full px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-purple-500/50 transition disabled:opacity-50 disabled:cursor-not-allowed"
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

            {/* Info Box */}
            <div className="mt-8 p-4 bg-slate-700/50 rounded-lg border border-purple-400/20">
              <p className="text-xs text-gray-300">
                💡 <strong>Tip:</strong> Upload your Slippi replay files (.slp)
                to receive instant coaching feedback based on your gameplay
                stats.
              </p>
            </div>
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
                    </div>
                    {analysis.metadata.players.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {analysis.metadata.players.map((player, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-3 p-2 bg-slate-700/50 rounded"
                          >
                            <span className="text-purple-400 font-semibold">
                              P{player.player_index + 1}
                            </span>
                            <span className="text-white">
                              {player.character}
                            </span>
                            {player.nametag && (
                              <span className="text-gray-400 text-xs">
                                ({player.nametag})
                              </span>
                            )}
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
