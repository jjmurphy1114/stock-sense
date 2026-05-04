import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";

import { loadSavedGames, updateSavedGameAssignments } from "../lib/gameHistory";
import {
  getPlayerFeedbackGroups,
  getTechSuccessRate,
} from "../lib/replayAnalysisUi";
import {
  buildTrackedPlayerAssignment,
  getAssignablePlayers,
  getPlayerAssignmentDetail,
  getPlayerAssignmentLabel,
} from "../lib/replayAssignments";
import CharacterIcon from "../components/replays/CharacterIcon";
import ReplayOwnershipModal from "../components/replays/ReplayOwnershipModal";
import StatTile from "../components/replays/StatTile";
import TrendDashboard from "../components/trends/TrendDashboard";
import type {
  AnalysisResponse,
  BatchAnalysisResponse,
  PerPlayerStats,
  PersistedAnalysisResponse,
  SavedGameRecord,
} from "../components/replayAnalysisTypes";
import {
  formatCharacterName,
  formatStageName,
} from "../components/replayAnalysisTypes";

type SavedGamesPageProps = {
  currentUser: User | null;
  refreshToken: number;
};

function expandPersistedAnalysis(
  savedAnalysis: PersistedAnalysisResponse,
): AnalysisResponse {
  return {
    ...savedAnalysis,
    stats: {
      ...savedAnalysis.stats,
      hit_locations: [],
    },
  };
}

function SavedPerPlayerCard({ player }: { player: PerPlayerStats }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-600 bg-linear-to-br from-slate-800 via-slate-800 to-slate-900/90 shadow-lg shadow-black/15">
      <div className="flex flex-col gap-3 border-b border-slate-700/80 bg-slate-900/35 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-purple-300">
            Player {player.player_index + 1}
          </p>
          <p className="mt-1 flex items-center gap-3 text-lg font-semibold text-white">
            <CharacterIcon character={player.character} className="h-9 w-9" />
            <span>{player.player_name}</span>
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
          label="Successful Tech Rate"
          value={`${getTechSuccessRate(player.tech_attempts, player.missed_techs)}%`}
          detail={`${Math.max(0, player.tech_attempts - player.missed_techs)}/${player.tech_attempts} successful`}
        />
        <StatTile
          label="Tech Direction"
          value={`Toward ${player.tech_towards_count} • Away ${player.tech_away_count} • In Place ${player.tech_in_place_count}`}
          detail="Successful techs relative to opponent position"
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
  );
}

export default function SavedGamesPage({
  currentUser,
  refreshToken,
}: SavedGamesPageProps) {
  const [savedGames, setSavedGames] = useState<SavedGameRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"trends" | "history">("trends");
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isAssignmentEditorOpen, setIsAssignmentEditorOpen] = useState(false);
  const [assignmentValues, setAssignmentValues] = useState<
    Record<string, string>
  >({});
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    let active = true;
    const timeoutId = globalThis.setTimeout(() => {
      setHistoryLoading(true);
      setHistoryError(null);

      loadSavedGames(currentUser.uid)
        .then((games) => {
          if (!active) {
            return;
          }

          setSavedGames(games);
          setSelectedGameId((currentId) => currentId ?? games[0]?.id ?? null);
        })
        .catch((error: unknown) => {
          if (!active) {
            return;
          }

          setHistoryError(
            error instanceof Error
              ? error.message
              : "Failed to load saved games.",
          );
        })
        .finally(() => {
          if (active) {
            setHistoryLoading(false);
          }
        });
    }, 0);

    return () => {
      active = false;
      globalThis.clearTimeout(timeoutId);
    };
  }, [currentUser, refreshToken]);

  const savedGamesBatchAnalysis = useMemo<BatchAnalysisResponse>(() => {
    const availableTags = Array.from(
      new Set(
        savedGames.flatMap((game) =>
          (game.analysis.metadata?.players ?? [])
            .filter((player) => !player.is_cpu)
            .map((player) => player.tag?.trim())
            .filter((tag): tag is string => Boolean(tag)),
        ),
      ),
    ).sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: "base" }),
    );

    return {
      replays: savedGames.map((game) => ({
        filename: game.filename,
        trackedPlayerAssignment: game.trackedPlayerAssignment,
        ...expandPersistedAnalysis(game.analysis),
      })),
      available_tags: availableTags,
      failed_files: [],
    };
  }, [savedGames]);

  const selectedGame =
    savedGames.find((game) => game.id === selectedGameId) ??
    savedGames[0] ??
    null;
  const selectedAnalysis = selectedGame
    ? expandPersistedAnalysis(selectedGame.analysis)
    : null;
  const playerFeedbackGroups = selectedAnalysis
    ? getPlayerFeedbackGroups(selectedAnalysis)
    : [];
  const assignedGameCount = savedGames.filter(
    (game) => game.trackedPlayerAssignment != null,
  ).length;
  const assignmentItems = useMemo(
    () =>
      savedGames.map((game) => ({
        id: game.id,
        title: game.filename,
        subtitle: `Current assignment: ${
          game.trackedPlayerAssignment?.playerLabel ?? "Not set"
        }`,
        selectedValue: assignmentValues[game.id] ?? "",
        players: getAssignablePlayers(game.analysis).map((player) => ({
          playerIndex: player.player_index,
          label: getPlayerAssignmentLabel(player),
          character: player.character,
          detail: getPlayerAssignmentDetail(player),
        })),
      })),
    [assignmentValues, savedGames],
  );

  const openAssignmentEditor = () => {
    setAssignmentValues(
      Object.fromEntries(
        savedGames.map((game) => [
          game.id,
          game.trackedPlayerAssignment
            ? String(game.trackedPlayerAssignment.playerIndex)
            : "",
        ]),
      ),
    );
    setAssignmentError(null);
    setAssignmentMessage(null);
    setIsAssignmentEditorOpen(true);
  };

  const handleSaveAssignmentChanges = async () => {
    if (!currentUser) {
      return;
    }

    const missingGame = savedGames.find((game) => !assignmentValues[game.id]);
    if (missingGame) {
      setAssignmentError(`Choose your player for ${missingGame.filename}.`);
      return;
    }

    setAssignmentSaving(true);
    setAssignmentError(null);

    try {
      const updates = savedGames.map((game) => {
        const selectedPlayerIndex = Number(assignmentValues[game.id]);
        const player = getAssignablePlayers(game.analysis).find(
          (entry) => entry.player_index === selectedPlayerIndex,
        );

        if (!player) {
          throw new Error(
            `Could not resolve the selected player for ${game.filename}.`,
          );
        }

        return {
          replayId: game.id,
          trackedPlayerAssignment: buildTrackedPlayerAssignment(
            player,
            game.trackedPlayerAssignment?.playerIndex === selectedPlayerIndex
              ? game.trackedPlayerAssignment.source
              : "manual",
          ),
        };
      });

      await updateSavedGameAssignments(currentUser.uid, updates);

      setSavedGames((currentGames) =>
        currentGames.map((game) => {
          const update = updates.find((entry) => entry.replayId === game.id);
          return update
            ? {
                ...game,
                trackedPlayerAssignment: update.trackedPlayerAssignment,
              }
            : game;
        }),
      );
      setAssignmentMessage("Saved replay assignments.");
      setIsAssignmentEditorOpen(false);
    } catch (error) {
      setAssignmentError(
        error instanceof Error ? error.message : "Failed to save assignments.",
      );
    } finally {
      setAssignmentSaving(false);
    }
  };

  return (
    <div className="grid gap-8">
      <h2 className="text-2xl font-bold text-white">Saved Games</h2>

      {!currentUser ? (
        <div className="rounded-xl border border-slate-600 bg-slate-800 p-6 text-sm text-slate-300 shadow-2xl">
          Sign in from the top-right profile menu to browse your saved replay
          history.
        </div>
      ) : historyLoading ? (
        <div className="rounded-xl border border-slate-600 bg-slate-800 p-6 text-sm text-slate-300 shadow-2xl">
          Loading saved games...
        </div>
      ) : historyError ? (
        <div className="rounded-xl border border-red-600/40 bg-red-900/20 p-6 text-sm text-red-200 shadow-2xl">
          {historyError}
        </div>
      ) : savedGames.length === 0 ? (
        <div className="rounded-xl border border-slate-600 bg-slate-800 p-6 text-sm text-slate-300 shadow-2xl">
          No saved games yet. Analyze a replay on the upload screen and it will
          appear here.
        </div>
      ) : (
        <div className="grid gap-4 lg:gap-8">
          <div className="rounded-2xl border border-slate-600 bg-slate-900/35 p-2 shadow-2xl">
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setActiveTab("trends")}
                className={`rounded-xl px-4 py-3 text-left transition ${
                  activeTab === "trends"
                    ? "border border-cyan-400/40 bg-cyan-500/10 text-white shadow-lg shadow-cyan-950/30"
                    : "border border-transparent bg-slate-900/30 text-slate-300 hover:border-slate-500/70 hover:bg-slate-800/70"
                }`}
                aria-pressed={activeTab === "trends"}
              >
                <p className="text-sm font-semibold">Trend Dashboard</p>
                <p className="mt-1 text-xs text-slate-400">
                  Aggregate filters, matched replays, and ownership coverage
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab("history");
                  setIsHistoryOpen(true);
                }}
                className={`rounded-xl px-4 py-3 text-left transition ${
                  activeTab === "history"
                    ? "border border-cyan-400/40 bg-cyan-500/10 text-white shadow-lg shadow-cyan-950/30"
                    : "border border-transparent bg-slate-900/30 text-slate-300 hover:border-slate-500/70 hover:bg-slate-800/70"
                }`}
                aria-pressed={activeTab === "history"}
              >
                <p className="text-sm font-semibold">Game History</p>
                <p className="mt-1 text-xs text-slate-400">
                  Browse saved replays and inspect each full analysis
                </p>
              </button>
            </div>
          </div>

          {activeTab === "trends" ? (
            <div className="grid gap-4 lg:gap-8">
              {assignedGameCount > 0 ? (
                <TrendDashboard
                  batchAnalysis={savedGamesBatchAnalysis}
                  heading="Saved Game Trends"
                  subtitle="Review your saved replay history using the player assignment stored with each game"
                  summaryLabel="Saved replays"
                  showAssignmentSection={false}
                />
              ) : (
                <div className="rounded-2xl border border-slate-600 bg-slate-900/35 p-5 text-sm text-slate-300">
                  Assign yourself to at least one saved replay to unlock
                  aggregate trend filtering across online and console games.
                </div>
              )}

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-600 bg-slate-900/35 p-4">
                <div>
                  <p className="text-sm font-semibold text-white">
                    Replay ownership
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    {assignedGameCount} of {savedGames.length} saved replay
                    {savedGames.length === 1 ? "" : "s"} have a stored player
                    assignment.
                  </p>
                  {assignmentMessage ? (
                    <p className="mt-2 text-sm text-emerald-300">
                      {assignmentMessage}
                    </p>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={openAssignmentEditor}
                  className="rounded-xl border border-purple-400/40 bg-purple-500/10 px-4 py-2.5 text-sm font-semibold text-purple-100 transition hover:bg-purple-500/20"
                >
                  Change Assignments
                </button>
              </div>
            </div>
          ) : null}

          {activeTab === "history" ? (
            <div className="grid gap-4 lg:gap-8">
              <div className="lg:hidden">
                <button
                  type="button"
                  onClick={() => setIsHistoryOpen((open) => !open)}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-left shadow-2xl transition hover:border-cyan-400/60"
                  aria-expanded={isHistoryOpen}
                  aria-controls="saved-games-history"
                >
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">
                      Game History
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {savedGames.length} saved
                      {selectedGame
                        ? ` • Viewing ${selectedGame.filename}`
                        : ""}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-white">
                    {isHistoryOpen ? "Hide" : "Show"}
                  </span>
                </button>
              </div>

              <div className="grid gap-8 lg:grid-cols-[22rem_minmax(0,1fr)]">
                <div
                  id="saved-games-history"
                  className={`${isHistoryOpen ? "block" : "hidden"} rounded-xl border border-slate-600 bg-slate-800 p-4 shadow-2xl lg:block lg:max-h-[70vh] lg:overflow-hidden`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">
                      History
                    </h3>
                    <span className="text-xs text-slate-400">
                      {savedGames.length} saved
                    </span>
                  </div>

                  <div className="grid gap-3 lg:max-h-[calc(70vh-3.5rem)] lg:overflow-y-auto lg:pr-1">
                    {savedGames.map((game) => (
                      <button
                        key={game.id}
                        type="button"
                        onClick={() => {
                          setSelectedGameId(game.id);
                          setIsHistoryOpen(false);
                        }}
                        className={`rounded-2xl border p-4 text-left transition ${
                          selectedGame?.id === game.id
                            ? "border-cyan-400/70 bg-cyan-500/10"
                            : "border-slate-600 bg-slate-900/35 hover:border-cyan-400/60 hover:bg-slate-900/55"
                        }`}
                      >
                        <p className="text-sm font-semibold text-white">
                          {game.filename}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {game.createdAt
                            ? new Date(game.createdAt).toLocaleString()
                            : "Saved just now"}
                        </p>
                        <p className="mt-2 text-xs text-cyan-300">
                          {game.trackedPlayerAssignment
                            ? `You: ${game.trackedPlayerAssignment.playerLabel}`
                            : "Player assignment needed"}
                        </p>
                        <p className="mt-3 text-sm text-slate-300">
                          {game.summary}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-green-500/20 bg-slate-800 p-8 shadow-2xl">
                  {selectedGame && selectedAnalysis ? (
                    <div className="space-y-6">
                      <div className="flex flex-col gap-2">
                        <h2 className="text-2xl font-bold text-white">
                          {selectedGame.filename}
                        </h2>
                        <p className="text-sm text-slate-300">
                          Full saved analysis. Hit graph data is intentionally
                          not stored.
                        </p>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-lg bg-slate-700/50 p-4">
                          <p className="text-xs text-slate-400">Stage</p>
                          <p className="mt-2 text-white font-semibold">
                            {selectedGame.stage
                              ? formatStageName(selectedGame.stage)
                              : "Unknown"}
                          </p>
                        </div>
                        <div className="rounded-lg bg-slate-700/50 p-4">
                          <p className="text-xs text-slate-400">Uploaded</p>
                          <p className="mt-2 text-white font-semibold">
                            {selectedGame.createdAt
                              ? new Date(
                                  selectedGame.createdAt,
                                ).toLocaleString()
                              : "Just now"}
                          </p>
                        </div>
                      </div>

                      {selectedAnalysis.metadata ? (
                        <div className="space-y-3 border-b border-slate-700 pb-4">
                          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-purple-300">
                            Game Info
                          </h3>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-gray-400">Players</p>
                              <p className="font-semibold text-white">
                                {selectedAnalysis.metadata.num_players}
                              </p>
                            </div>
                            {selectedAnalysis.metadata.stage ? (
                              <div>
                                <p className="text-gray-400">Stage</p>
                                <p className="font-semibold text-white">
                                  {formatStageName(
                                    selectedAnalysis.metadata.stage,
                                  )}
                                </p>
                              </div>
                            ) : null}
                            {selectedAnalysis.metadata.winner_name ? (
                              <div>
                                <p className="text-gray-400">Winner</p>
                                <p className="font-semibold text-white">
                                  {selectedAnalysis.metadata.winner_name}
                                </p>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-purple-300">
                          Game Stats
                        </h3>
                        <div className="grid gap-4 sm:grid-cols-3">
                          <div className="rounded-lg bg-slate-700/50 p-3">
                            <p className="text-xs text-gray-400">Duration</p>
                            <p className="text-lg font-bold text-white">
                              {selectedAnalysis.stats.match_duration_seconds}s
                            </p>
                          </div>
                          <div className="rounded-lg bg-slate-700/50 p-3">
                            <p className="text-xs text-gray-400">
                              Total Frames
                            </p>
                            <p className="text-lg font-bold text-white">
                              {selectedAnalysis.stats.total_frames}
                            </p>
                          </div>
                          <div className="rounded-lg bg-slate-700/50 p-3">
                            <p className="text-xs text-gray-400">Actions</p>
                            <p className="text-lg font-bold text-white">
                              {selectedAnalysis.stats.total_actions}
                            </p>
                          </div>
                        </div>
                      </div>

                      {selectedAnalysis.metadata?.players?.length ? (
                        <div className="space-y-3">
                          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-purple-300">
                            Players
                          </h3>
                          <div className="grid gap-3">
                            {selectedAnalysis.metadata.players.map((player) => (
                              <div
                                key={player.player_index}
                                className="flex items-center gap-3 rounded-xl bg-slate-700/50 p-4 text-sm text-slate-200"
                              >
                                <CharacterIcon
                                  character={player.character}
                                  className="h-8 w-8"
                                />
                                <span className="font-semibold text-white">
                                  P{player.player_index + 1}
                                </span>
                                <span>
                                  {player.tag ||
                                    `Player ${player.player_index + 1}`}
                                </span>
                                <span className="text-slate-400">
                                  {formatCharacterName(player.character)}
                                </span>
                                {selectedGame.trackedPlayerAssignment
                                  ?.playerIndex === player.player_index ? (
                                  <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2 py-0.5 text-xs font-semibold text-cyan-200">
                                    You
                                  </span>
                                ) : null}
                                {player.did_win ? (
                                  <span className="text-xs font-semibold text-green-400">
                                    Winner
                                  </span>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-purple-300">
                          Feedback
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
                                        ({formatCharacterName(player.character)}
                                        )
                                      </span>
                                    </p>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  {player.feedback.length > 0 ? (
                                    player.feedback.map((item, index) => (
                                      <div
                                        key={`${player.player_index}-${index}`}
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
                          <div className="grid gap-3">
                            {selectedAnalysis.feedback.map((item, index) => (
                              <div
                                key={`${selectedGame.id}-${index}`}
                                className="rounded-lg border-l-4 border-purple-500 bg-slate-700/50 p-3"
                              >
                                <p className="text-sm text-white">{item}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {selectedAnalysis.stats.per_player.length > 0 ? (
                        <div className="space-y-3">
                          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-purple-300">
                            Per-Player Habits
                          </h3>
                          <div className="space-y-3">
                            {selectedAnalysis.stats.per_player.map((player) => (
                              <SavedPerPlayerCard
                                key={player.player_index}
                                player={player}
                              />
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      <ReplayOwnershipModal
        isOpen={isAssignmentEditorOpen}
        items={assignmentItems}
        assignmentError={assignmentError}
        assignmentSaving={assignmentSaving}
        onClose={() => setIsAssignmentEditorOpen(false)}
        onChange={(itemId, value) => {
          setAssignmentError(null);
          setAssignmentValues((current) => ({
            ...current,
            [itemId]: value,
          }));
        }}
        onSave={() => {
          void handleSaveAssignmentChanges();
        }}
      />
    </div>
  );
}
