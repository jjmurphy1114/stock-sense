import { useRef, useState } from "react";
import type { User } from "firebase/auth";

import {
  getDefaultBatchTag,
  getPlayerFeedbackGroups,
  getTechSuccessRate,
} from "../lib/replayAnalysisUi";
import {
  buildReplayDocumentId,
  loadSavedReplayIds,
  saveBatchGameAnalyses,
  saveSingleGameAnalysis,
  type SaveGameResult,
} from "../lib/gameHistory";
import {
  buildTrackedPlayerAssignment,
  findAutoTrackedPlayer,
  getPlayerAssignmentDetail,
  getPlayerAssignmentLabel,
} from "../lib/replayAssignments";
import { getStageLayout } from "../lib/stageLayout";
import type { UserProfile } from "../lib/userProfile";
import CharacterIcon from "../components/replays/CharacterIcon";
import { exampleReplayAnalysis } from "../components/replays/exampleReplayAnalysis";
import StageHitMap from "../components/replays/StageHitMap";
import StatTile from "../components/replays/StatTile";
import TrendDashboard from "../components/trends/TrendDashboard";
import type {
  AnalysisResponse,
  AnalysisMetadataPlayer,
  BatchAnalysisResponse,
  ReplayAnalysisWithFile,
  TrackedPlayerAssignment,
} from "../components/replayAnalysisTypes";
import { formatCharacterName } from "../components/replayAnalysisTypes";

type AnalysisTab = "overview" | "graph";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(
  /\/$/,
  "",
);

type UploadResponse = {
  ok: boolean;
  status: number;
  data: unknown;
};

type AnalysisJobStartResponse = {
  job_id: string;
};

type DuplicateFileResult = {
  filename: string;
  replay_id: string;
};

type AnalysisJobResponse = {
  status: "queued" | "processing" | "completed" | "failed";
  phase: string;
  progress: number;
  result: unknown;
  error: string | null;
};

function postFormDataWithProgress(
  url: string,
  formData: FormData,
  onProgress: (percent: number) => void,
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return;
      }

      const percent = Math.min(
        100,
        Math.round((event.loaded / event.total) * 100),
      );
      onProgress(percent);
    };

    xhr.onerror = () => {
      reject(new Error("Network error while uploading replay"));
    };

    xhr.onload = () => {
      const responseText = xhr.responseText ?? "";
      let data: unknown = null;

      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch {
          data = null;
        }
      }

      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        data,
      });
    };

    xhr.send(formData);
  });
}

async function waitForAnalysisJob(
  jobId: string,
  onProgress: (percent: number) => void,
): Promise<unknown> {
  while (true) {
    const response = await fetch(`${API_BASE_URL}/analysis-jobs/${jobId}`);
    if (!response.ok) {
      throw new Error("Failed to fetch analysis progress");
    }

    const payload = (await response.json()) as AnalysisJobResponse;
    onProgress(Math.max(0, Math.min(100, payload.progress ?? 0)));

    if (payload.status === "completed") {
      return payload.result;
    }

    if (payload.status === "failed") {
      throw new Error(payload.error || "Analysis failed");
    }

    await new Promise((resolve) => globalThis.setTimeout(resolve, 500));
  }
}

function getCommonAssignablePlayerIndices(replays: PendingAssignmentReplay[]) {
  if (replays.length === 0) {
    return [];
  }

  const sharedIndices = new Set(
    replays[0]?.players.map((player) => player.player_index) ?? [],
  );

  replays.slice(1).forEach((replay) => {
    const replayIndices = new Set(
      replay.players.map((player) => player.player_index),
    );

    Array.from(sharedIndices).forEach((playerIndex) => {
      if (!replayIndices.has(playerIndex)) {
        sharedIndices.delete(playerIndex);
      }
    });
  });

  return Array.from(sharedIndices).sort((left, right) => left - right);
}

type ReplayAnalyzerProps = {
  currentUser: User | null;
  profile: UserProfile | null;
  onSavedGamesChanged?: () => Promise<void>;
};

type PendingAssignmentReplay = {
  replayId: string;
  filename: string;
  players: AnalysisMetadataPlayer[];
  suggestedAssignment: TrackedPlayerAssignment | null;
  analysis: ReplayAnalysisWithFile;
};

type PendingAssignmentState = {
  replays: PendingAssignmentReplay[];
  values: Record<string, string>;
  applyToAllValue: string;
  uploadSource: "single" | "folder";
  saving: boolean;
  error: string | null;
};

type TrackedAssignmentsLookup = {
  byReplayId?: Record<string, TrackedPlayerAssignment>;
  byFilename?: Record<string, TrackedPlayerAssignment>;
};

export default function ReplayAnalyzer({
  currentUser,
  profile,
  onSavedGamesChanged,
}: ReplayAnalyzerProps) {
  const singleFileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadSource, setUploadSource] = useState<"single" | "folder" | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [batchAnalysis, setBatchAnalysis] =
    useState<BatchAnalysisResponse | null>(null);
  const [selectedTag, setSelectedTag] = useState("");
  const [selectionLabel, setSelectionLabel] = useState<string>("");
  const [activeTab, setActiveTab] = useState<AnalysisTab>("overview");
  const [isDemoReplay, setIsDemoReplay] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [pendingAssignmentState, setPendingAssignmentState] =
    useState<PendingAssignmentState | null>(null);
  const stageDisplayName = getStageLayout(
    analysis?.metadata?.stage,
  ).displayName;
  const playerFeedbackGroups = analysis
    ? getPlayerFeedbackGroups(analysis)
    : [];
  const commonAssignablePlayerIndices = pendingAssignmentState
    ? getCommonAssignablePlayerIndices(pendingAssignmentState.replays)
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
    setIsDemoReplay(false);
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
    setIsDemoReplay(false);
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
      duplicate_files: rawData.duplicate_files ?? [],
    };
  };

  const loadDemoReplay = () => {
    setSelectedFiles([]);
    setUploadSource(null);
    setSelectionLabel("Example replay loaded");
    setLoading(false);
    setUploadProgress(null);
    setAnalysisProgress(null);
    setError(null);
    setBatchAnalysis(null);
    setAnalysis(normalizeSingleAnalysis(exampleReplayAnalysis));
    setActiveTab("overview");
    setIsDemoReplay(true);
    clearPickerValues();
  };

  const getSingleSaveMessage = (result: SaveGameResult) => {
    if (result.status === "duplicate") {
      return `${result.filename} is already in your saved games.`;
    }

    return `Saved ${result.filename} to your game history.`;
  };

  const getBatchSaveMessage = (results: SaveGameResult[]) => {
    const savedCount = results.filter(
      (result) => result.status === "saved",
    ).length;
    const duplicateCount = results.filter(
      (result) => result.status === "duplicate",
    ).length;
    const parts = [];

    if (savedCount > 0) {
      parts.push(
        `Saved ${savedCount} game record${savedCount === 1 ? "" : "s"}.`,
      );
    }
    if (duplicateCount > 0) {
      parts.push(
        `Skipped ${duplicateCount} duplicate replay${duplicateCount === 1 ? "" : "s"}.`,
      );
    }

    return parts.join(" ") || "No new game records were saved.";
  };

  const buildPendingAssignmentReplays = (
    replays: ReplayAnalysisWithFile[],
  ): PendingAssignmentReplay[] => {
    return replays.map((replay) => {
      const replayId = replay.replay_id ?? buildReplayDocumentId(replay);
      const players = (replay.metadata?.players ?? []).filter(
        (player) => !player.is_cpu,
      );
      const suggestedPlayer = findAutoTrackedPlayer(
        replay,
        profile?.slippiGamertag ?? "",
      );

      return {
        replayId,
        filename: replay.filename,
        players,
        analysis: replay,
        suggestedAssignment: suggestedPlayer
          ? buildTrackedPlayerAssignment(suggestedPlayer, "profile_slippi_tag")
          : null,
      };
    });
  };

  const buildTrackedAssignmentsLookup = (
    replays: PendingAssignmentReplay[],
    values: Record<string, string>,
  ): TrackedAssignmentsLookup => {
    const byReplayId = Object.fromEntries(
      replays.map((replay) => {
        const selectedPlayerIndex = Number(values[replay.replayId]);
        const selectedPlayer = replay.players.find(
          (player) => player.player_index === selectedPlayerIndex,
        );

        if (!selectedPlayer) {
          throw new Error(`Could not resolve player for ${replay.filename}.`);
        }

        return [
          replay.replayId,
          buildTrackedPlayerAssignment(
            selectedPlayer,
            replay.suggestedAssignment?.playerIndex === selectedPlayerIndex
              ? replay.suggestedAssignment.source
              : "manual",
          ),
        ];
      }),
    ) as Record<string, TrackedPlayerAssignment>;

    const byFilename = Object.fromEntries(
      replays.map((replay) => [replay.filename, byReplayId[replay.replayId]]),
    ) as Record<string, TrackedPlayerAssignment>;

    return {
      byReplayId,
      byFilename,
    };
  };

  const appendDuplicateAndWarningMessage = (
    baseMessage: string | null,
    duplicateFiles: DuplicateFileResult[],
    precheckWarnings: string[],
  ) => {
    const duplicateMessage =
      duplicateFiles.length > 0
        ? `Skipped ${duplicateFiles.length} duplicate replay${duplicateFiles.length === 1 ? "" : "s"} already in your saved games.`
        : null;
    const warningMessage =
      precheckWarnings.length > 0
        ? `Duplicate precheck could not verify ${precheckWarnings.length} item${precheckWarnings.length === 1 ? "" : "s"}, so analysis continued normally.`
        : null;

    return [baseMessage, duplicateMessage, warningMessage]
      .filter(Boolean)
      .join(" ");
  };

  const persistCompletedAnalysis = async (
    isBatchUpload: boolean,
    singleAnalysis: AnalysisResponse | null,
    batchData: BatchAnalysisResponse | null,
    uploadedFileNames: string[],
    trackedAssignments?: TrackedAssignmentsLookup,
    duplicateReplayIds?: string[],
  ) => {
    if (!currentUser) {
      setSaveMessage("Analysis ready. Sign in with Google to save uploads.");
      return;
    }

    const duplicateReplayIdSet = new Set(duplicateReplayIds ?? []);

    if (isBatchUpload && batchData) {
      const duplicateResults: SaveGameResult[] = [];
      const replaysToSave = batchData.replays.flatMap((replay) => {
        const replayId = buildReplayDocumentId(replay);
        if (duplicateReplayIdSet.has(replayId)) {
          duplicateResults.push({
            status: "duplicate",
            replayId,
            filename: replay.filename,
          });
          return [];
        }

        const autoTrackedPlayer = findAutoTrackedPlayer(
          replay,
          profile?.slippiGamertag ?? "",
        );
        const trackedPlayerAssignment =
          trackedAssignments?.byReplayId?.[replayId] ??
          trackedAssignments?.byFilename?.[replay.filename] ??
          (autoTrackedPlayer
            ? buildTrackedPlayerAssignment(
                autoTrackedPlayer,
                "profile_slippi_tag",
              )
            : null);

        if (!trackedPlayerAssignment) {
          throw new Error(
            `Missing tracked player assignment for ${replay.filename}.`,
          );
        }

        return [
          {
            ...replay,
            trackedPlayerAssignment,
          },
        ];
      });

      const saveResults = replaysToSave.length
        ? await saveBatchGameAnalyses(currentUser.uid, replaysToSave)
        : [];
      const results = [...saveResults, ...duplicateResults];
      await onSavedGamesChanged?.();
      setSaveMessage(getBatchSaveMessage(results));
      return;
    }

    if (singleAnalysis && uploadedFileNames[0]) {
      const replayId = buildReplayDocumentId(singleAnalysis);
      if (duplicateReplayIdSet.has(replayId)) {
        setSaveMessage(
          getSingleSaveMessage({
            status: "duplicate",
            replayId,
            filename: uploadedFileNames[0],
          }),
        );
        return;
      }
      const autoTrackedPlayer = findAutoTrackedPlayer(
        singleAnalysis,
        profile?.slippiGamertag ?? "",
      );
      const trackedPlayerAssignment =
        trackedAssignments?.byReplayId?.[replayId] ??
        trackedAssignments?.byFilename?.[uploadedFileNames[0]] ??
        (autoTrackedPlayer
          ? buildTrackedPlayerAssignment(
              autoTrackedPlayer,
              "profile_slippi_tag",
            )
          : null);

      if (!trackedPlayerAssignment) {
        throw new Error("Missing tracked player assignment.");
      }

      const result = await saveSingleGameAnalysis(
        currentUser.uid,
        uploadedFileNames[0],
        singleAnalysis,
        trackedPlayerAssignment,
      );
      await onSavedGamesChanged?.();
      setSaveMessage(getSingleSaveMessage(result));
    }
  };

  const startAnalysisUpload = async ({
    filesToAnalyze,
    uploadSource: nextUploadSource,
    precheckWarnings,
    savedReplayIds,
  }: {
    filesToAnalyze: File[];
    uploadSource: "single" | "folder";
    precheckWarnings: string[];
    savedReplayIds: string[];
  }) => {
    const isBatchUpload =
      nextUploadSource === "folder" || filesToAnalyze.length > 1;

    setLoading(true);
    setUploadProgress(0);
    setAnalysisProgress(null);
    setError(null);
    setAnalysis(null);
    setBatchAnalysis(null);
    setPendingAssignmentState(null);
    setIsDemoReplay(false);
    setSaveMessage(null);

    try {
      const uploadedFileNames = filesToAnalyze.map((file) => file.name);
      const formData = new FormData();
      if (isBatchUpload) {
        filesToAnalyze.forEach((file) => {
          formData.append("files", file);
        });
      } else {
        formData.append("file", filesToAnalyze[0]);
      }
      formData.append("saved_replay_ids", JSON.stringify(savedReplayIds));
      formData.append(
        "skip_duplicates",
        savedReplayIds.length > 0 && skipDuplicates ? "true" : "false",
      );

      const response = await postFormDataWithProgress(
        `${API_BASE_URL}${isBatchUpload ? "/analyze-batch-start" : "/analyze-start"}`,
        formData,
        setUploadProgress,
      );

      if (!response.ok) {
        const errorData = (response.data ?? {}) as {
          detail?: { message?: string } | string;
        };
        const detail =
          typeof errorData.detail === "string"
            ? errorData.detail
            : errorData.detail?.message || "Failed to analyze replay";
        throw new Error(detail);
      }

      setUploadProgress(100);
      setAnalysisProgress(0);
      const startData = response.data as AnalysisJobStartResponse;
      if (!startData?.job_id) {
        throw new Error("Missing analysis job id from server");
      }

      const result = await waitForAnalysisJob(
        startData.job_id,
        setAnalysisProgress,
      );

      if (isBatchUpload) {
        const rawData = result as BatchAnalysisResponse;
        const data = normalizeBatchResponse(rawData);
        const duplicateFiles = data.duplicate_files ?? [];

        if (data.replays.length === 0) {
          setSaveMessage(
            appendDuplicateAndWarningMessage(
              data.failed_files.length > 0
                ? "No new replays were analyzed."
                : "No new replays to analyze.",
              duplicateFiles,
              precheckWarnings,
            ),
          );
          setSelectedFiles([]);
          setUploadSource(null);
          setSelectionLabel("");
          clearPickerValues();
          return;
        }

        setBatchAnalysis(data);
        setSelectedTag(getDefaultBatchTag(data));
        if (!currentUser) {
          setSaveMessage(
            appendDuplicateAndWarningMessage(
              "Analysis ready. Sign in with Google to save uploads.",
              duplicateFiles,
              precheckWarnings,
            ),
          );
        } else {
          const pendingReplays = buildPendingAssignmentReplays(data.replays);
          const unresolvedReplays = pendingReplays.filter(
            (replay) => replay.suggestedAssignment == null,
          );

          if (pendingReplays.length > 0 && unresolvedReplays.length > 0) {
            setPendingAssignmentState({
              replays: pendingReplays,
              values: Object.fromEntries(
                pendingReplays.map((replay) => [
                  replay.replayId,
                  replay.suggestedAssignment
                    ? String(replay.suggestedAssignment.playerIndex)
                    : "",
                ]),
              ),
              applyToAllValue: "",
              uploadSource: nextUploadSource,
              saving: false,
              error: null,
            });
            setSaveMessage(
              appendDuplicateAndWarningMessage(
                `Analysis ready. Choose your player assignment for ${unresolvedReplays.length} replay${unresolvedReplays.length === 1 ? "" : "s"} before saving.`,
                duplicateFiles,
                precheckWarnings,
              ),
            );
          } else {
            const trackedAssignments = buildTrackedAssignmentsLookup(
              pendingReplays,
              Object.fromEntries(
                pendingReplays.map((replay) => [
                  replay.replayId,
                  String(replay.suggestedAssignment?.playerIndex ?? ""),
                ]),
              ),
            );
            await persistCompletedAnalysis(
              true,
              null,
              data,
              uploadedFileNames,
              trackedAssignments,
            );
            setSaveMessage((currentMessage) =>
              appendDuplicateAndWarningMessage(
                currentMessage,
                duplicateFiles,
                precheckWarnings,
              ),
            );
          }
        }
      } else {
        const singleResult = result as
          | AnalysisResponse
          | { duplicate_file?: DuplicateFileResult };

        if ("duplicate_file" in singleResult && singleResult.duplicate_file) {
          setSaveMessage(
            appendDuplicateAndWarningMessage(
              `${singleResult.duplicate_file.filename} is already in your saved games.`,
              [singleResult.duplicate_file],
              precheckWarnings,
            ),
          );
          setSelectedFiles([]);
          setUploadSource(null);
          setSelectionLabel("");
          clearPickerValues();
          return;
        }

        const rawData = singleResult as AnalysisResponse;
        const data = normalizeSingleAnalysis(rawData);
        setAnalysis(data);
        setActiveTab("overview");
        if (!currentUser) {
          setSaveMessage(
            appendDuplicateAndWarningMessage(
              "Analysis ready. Sign in with Google to save uploads.",
              [],
              precheckWarnings,
            ),
          );
        } else {
          const replayWithFile: ReplayAnalysisWithFile = {
            ...data,
            filename: uploadedFileNames[0],
          };
          const pendingReplays = buildPendingAssignmentReplays([replayWithFile]);
          const unresolvedReplay = pendingReplays.find(
            (replay) => replay.suggestedAssignment == null,
          );

          if (unresolvedReplay) {
            setPendingAssignmentState({
              replays: pendingReplays,
              values: {
                [unresolvedReplay.replayId]: "",
              },
              applyToAllValue: "",
              uploadSource: nextUploadSource,
              saving: false,
              error: null,
            });
            setSaveMessage(
              appendDuplicateAndWarningMessage(
                "Analysis ready. Choose your player assignment before saving.",
                [],
                precheckWarnings,
              ),
            );
          } else {
            const trackedAssignments = buildTrackedAssignmentsLookup(
              pendingReplays,
              {
                [pendingReplays[0].replayId]: String(
                  pendingReplays[0].suggestedAssignment?.playerIndex ?? "",
                ),
              },
            );
            await persistCompletedAnalysis(
              false,
              data,
              null,
              uploadedFileNames,
              trackedAssignments,
            );
            setSaveMessage((currentMessage) =>
              appendDuplicateAndWarningMessage(
                currentMessage,
                [],
                precheckWarnings,
              ),
            );
          }
        }
      }

      setSelectedFiles([]);
      setUploadSource(null);
      setSelectionLabel("");
      clearPickerValues();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "An error occurred",
      );
    } finally {
      setUploadProgress(null);
      setAnalysisProgress(null);
      setLoading(false);
    }
  };

  const handleSaveAssignedReplays = async () => {
    if (!pendingAssignmentState) {
      return;
    }

    const missingReplay = pendingAssignmentState.replays.find((replay) => {
      return !pendingAssignmentState.values[replay.replayId];
    });

    if (missingReplay) {
      setPendingAssignmentState((current) =>
        current
          ? {
              ...current,
              error: `Choose your player for ${missingReplay.filename} before saving.`,
            }
          : current,
      );
      return;
    }

    setPendingAssignmentState((current) =>
      current ? { ...current, saving: true, error: null } : current,
    );

    try {
      const pendingState = pendingAssignmentState;
      const trackedAssignments = buildTrackedAssignmentsLookup(
        pendingState.replays,
        pendingState.values,
      );
      setPendingAssignmentState(null);

      if (pendingState.uploadSource === "folder" || pendingState.replays.length > 1) {
        await persistCompletedAnalysis(
          true,
          null,
          {
            replays: pendingState.replays.map((replay) => replay.analysis),
            available_tags: batchAnalysis?.available_tags ?? [],
            failed_files: batchAnalysis?.failed_files ?? [],
            duplicate_files: batchAnalysis?.duplicate_files ?? [],
          },
          pendingState.replays.map((replay) => replay.filename),
          trackedAssignments,
        );
      } else {
        await persistCompletedAnalysis(
          false,
          pendingState.replays[0]?.analysis ?? null,
          null,
          pendingState.replays.map((replay) => replay.filename),
          trackedAssignments,
        );
      }
    } catch (saveError) {
      setPendingAssignmentState((current) =>
        current
          ? {
              ...current,
              saving: false,
              error:
                saveError instanceof Error
                  ? saveError.message
                  : "Failed to prepare replay assignments.",
            }
          : current,
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedFiles.length === 0 || !uploadSource) {
      setError("Please choose either a single replay or a replay folder");
      return;
    }

    try {
      const precheckWarnings: string[] = [];
      let savedReplayIds: string[] = [];

      if (currentUser) {
        try {
          savedReplayIds = Array.from(await loadSavedReplayIds(currentUser.uid));
        } catch (precheckError) {
          precheckWarnings.push(
            precheckError instanceof Error
              ? precheckError.message
              : "Saved replay lookup was unavailable.",
          );
        }
      }

      await startAnalysisUpload({
        filesToAnalyze: selectedFiles,
        uploadSource,
        precheckWarnings,
        savedReplayIds,
      });
      return;
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  return (
    <>
      <div className="mx-auto max-w-4xl">
        <div className={"grid gap-8 justify-center"}>
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
                {saveMessage && (
                  <p className="mt-2 text-sm text-emerald-300">{saveMessage}</p>
                )}
                {isDemoReplay && (
                  <p className="mt-2 inline-flex rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
                    Demo replay loaded
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

                  {!analysis && !batchAnalysis && (
                    <button
                      type="button"
                      onClick={loadDemoReplay}
                      disabled={loading}
                      className="rounded-xl border border-dashed border-slate-600/80 bg-slate-900/35 px-4 py-3 text-left transition hover:border-cyan-400/60 hover:bg-slate-900/55 disabled:opacity-50"
                    >
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                        Need a demo?
                      </p>
                      <p className="mt-2 text-sm font-semibold text-cyan-300">
                        Don&apos;t have a `.slp` but want to demo the site?
                        Click here!
                      </p>
                    </button>
                  )}

                  {selectionLabel && (
                    <p className="text-sm text-green-400">✓ {selectionLabel}</p>
                  )}
                  {uploadSource === "folder" && selectedFiles.length > 0 && (
                    <p className="text-xs text-slate-400">
                      Batch mode will match your player across replays using the
                      selected Slippi tag.
                    </p>
                  )}
                  <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-600/80 bg-slate-900/35 px-3 py-2.5">
                    <span className="min-w-0 pr-2">
                      <span className="block text-sm font-semibold text-white">
                        Skip Duplicates
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-5 text-slate-400">
                        {currentUser
                          ? "Skip replays already saved to your history before analysis starts."
                          : "Sign in to compare uploads against your saved history."}
                      </span>
                    </span>
                    <span className="relative shrink-0">
                      <input
                        type="checkbox"
                        checked={skipDuplicates}
                        onChange={(event) =>
                          setSkipDuplicates(event.target.checked)
                        }
                        disabled={loading || !currentUser}
                        className="peer sr-only"
                      />
                      <span className="block h-5 w-9 rounded-full bg-slate-700 transition peer-checked:bg-cyan-500/80 peer-disabled:opacity-50" />
                      <span className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-4" />
                    </span>
                  </label>
                </div>

                {error && (
                  <div className="bg-red-900/30 border border-red-600/50 rounded-lg p-4">
                    <p className="text-red-200 text-sm">⚠️ {error}</p>
                  </div>
                )}

                {loading && uploadProgress !== null && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-300">
                      <span>
                        {uploadProgress < 100
                          ? "Uploading replay(s)..."
                          : "Upload complete."}
                      </span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
                      <div
                        className="h-full rounded-full bg-linear-to-r from-purple-500 to-pink-500 transition-[width] duration-200"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {loading &&
                uploadProgress === 0 &&
                analysisProgress === null ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-300">
                      <span>Preparing upload...</span>
                      <span>Starting job</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
                      <div className="h-full w-1/3 animate-pulse rounded-full bg-linear-to-r from-cyan-400 to-purple-500" />
                    </div>
                  </div>
                ) : null}

                {loading && analysisProgress !== null && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-300">
                      <span>
                        {analysisProgress < 100
                          ? "Analyzing replay(s)..."
                          : "Analysis complete."}
                      </span>
                      <span>{analysisProgress}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
                      <div
                        className="h-full rounded-full bg-linear-to-r from-cyan-400 to-emerald-400 transition-[width] duration-200"
                        style={{ width: `${analysisProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {(selectedFiles.length > 0 ||
                  (!analysis && !batchAnalysis)) && (
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
                )}
              </form>
            </div>

            {!analysis && (
              <div className="mt-8 p-4 bg-slate-700/50 rounded-lg border border-purple-400/20">
                <p className="text-xs text-gray-300">
                  Upload your Slippi replay files (.slp) to receive instant
                  coaching feedback based on your gameplay stats.
                </p>
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            {analysis && (
              <div className="bg-slate-800 rounded-xl shadow-2xl p-8 border border-green-500/20 space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-2xl font-bold text-white">
                    Analysis Results
                  </h2>
                  {isDemoReplay && (
                    <div className="inline-flex w-fit rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-100">
                      Example data for product demos
                    </div>
                  )}
                </div>

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

      {pendingAssignmentState ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-slate-600 bg-slate-900 p-6 shadow-2xl shadow-black/50">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">
                  Save Replays
                </p>
                <h3 className="mt-2 text-2xl font-bold text-white">
                  Choose which player was you
                </h3>
                <p className="mt-2 text-sm text-slate-300">
                  Online replays auto-use your saved Slippi tag when possible.
                  Anything unresolved, including console replays, can be set
                  here before saving.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPendingAssignmentState(null)}
                className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-4">
              {pendingAssignmentState.replays.length > 1 &&
              commonAssignablePlayerIndices.length > 0 ? (
                <div className="rounded-2xl border border-purple-500/30 bg-purple-500/10 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Apply one player to the whole batch
                      </p>
                      <p className="mt-1 text-sm text-slate-300">
                        Choose a player number once to fill every replay in this
                        upload. You can still adjust individual games below.
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <label className="flex min-w-52 flex-col gap-2 text-sm text-slate-300">
                        Batch player
                        <select
                          value={pendingAssignmentState.applyToAllValue}
                          onChange={(event) =>
                            setPendingAssignmentState((current) =>
                              current
                                ? {
                                    ...current,
                                    applyToAllValue: event.target.value,
                                  }
                                : current,
                            )
                          }
                          className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-2.5 text-white outline-none transition focus:border-purple-400"
                        >
                          <option value="">Select player</option>
                          {commonAssignablePlayerIndices.map((playerIndex) => (
                            <option
                              key={`apply-all-${playerIndex}`}
                              value={playerIndex}
                            >
                              Player {playerIndex + 1}
                            </option>
                          ))}
                        </select>
                      </label>

                      <button
                        type="button"
                        onClick={() =>
                          setPendingAssignmentState((current) => {
                            if (!current?.applyToAllValue) {
                              return current;
                            }

                            return {
                              ...current,
                              error: null,
                              values: Object.fromEntries(
                                current.replays.map((replay) => [
                                  replay.replayId,
                                  current.applyToAllValue,
                                ]),
                              ),
                            };
                          })
                        }
                        disabled={!pendingAssignmentState.applyToAllValue}
                        className="rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-4 py-2.5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Apply To All
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {pendingAssignmentState.replays.map((replay) => (
                <div
                  key={replay.replayId}
                  className="rounded-2xl border border-slate-700 bg-slate-950/40 p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {replay.filename}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {replay.suggestedAssignment
                          ? `Auto-selected ${replay.suggestedAssignment.playerLabel} from your profile tag.`
                          : "No automatic match found."}
                      </p>
                    </div>

                    <label className="flex w-full flex-col gap-2 text-sm text-slate-300 lg:w-80">
                      I was this player
                      <select
                        value={
                          pendingAssignmentState.values[replay.replayId] ?? ""
                        }
                        onChange={(event) =>
                          setPendingAssignmentState((current) =>
                            current
                              ? {
                                  ...current,
                                  error: null,
                                  values: {
                                    ...current.values,
                                    [replay.replayId]: event.target.value,
                                  },
                                }
                              : current,
                          )
                        }
                        className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-2.5 text-white outline-none transition focus:border-purple-400"
                      >
                        <option value="">Select player</option>
                        {replay.players.map((player) => (
                          <option
                            key={`${replay.replayId}-${player.player_index}`}
                            value={player.player_index}
                          >
                            {getPlayerAssignmentLabel(player)} •{" "}
                            {formatCharacterName(player.character)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {replay.players.map((player) => (
                      <div
                        key={`${replay.replayId}-card-${player.player_index}`}
                        className="rounded-xl border border-slate-700 bg-slate-900/50 p-3 text-sm text-slate-200"
                      >
                        <div className="flex items-center gap-3">
                          <CharacterIcon
                            character={player.character}
                            className="h-8 w-8"
                          />
                          <div>
                            <p className="font-semibold text-white">
                              {getPlayerAssignmentLabel(player)}
                            </p>
                            <p className="text-xs text-slate-400">
                              {formatCharacterName(player.character)}
                              {getPlayerAssignmentDetail(player)
                                ? ` • ${getPlayerAssignmentDetail(player)}`
                                : ""}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {pendingAssignmentState.error ? (
              <p className="mt-4 text-sm text-red-300">
                {pendingAssignmentState.error}
              </p>
            ) : null}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingAssignmentState(null)}
                className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleSaveAssignedReplays();
                }}
                disabled={pendingAssignmentState.saving}
                className="rounded-xl border border-purple-400/50 bg-purple-500/15 px-4 py-2.5 text-sm font-semibold text-purple-100 transition hover:border-purple-300 hover:bg-purple-500/25 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingAssignmentState.saving ? "Saving..." : "Save Replays"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
