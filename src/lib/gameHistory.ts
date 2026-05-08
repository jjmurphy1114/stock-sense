import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
} from "firebase/firestore";

import { db } from "./firebase";
import type {
  AnalysisResponse,
  PersistedAnalysisResponse,
  ReplayAnalysisWithFile,
  SavedGameRecord,
  TrackedPlayerAssignment,
} from "../components/replayAnalysisTypes";

export class DuplicateReplayError extends Error {
  replayId: string;
  filename: string;

  constructor(filename: string, replayId: string) {
    super(`${filename} has already been saved to your game history.`);
    this.name = "DuplicateReplayError";
    this.filename = filename;
    this.replayId = replayId;
  }
}

function assertFirestoreConfigured() {
  if (!db) {
    throw new Error("Firebase Firestore is not configured.");
  }

  return db;
}

export function trimAnalysisForStorage(
  analysis: AnalysisResponse,
): PersistedAnalysisResponse {
  const {
    filename: _filename,
    trackedPlayerAssignment: _trackedPlayerAssignment,
    ...persistableAnalysis
  } = analysis as AnalysisResponse & {
    filename?: string;
    trackedPlayerAssignment?: TrackedPlayerAssignment | null;
  };
  const statsWithoutHitLocations = Object.fromEntries(
    Object.entries(analysis.stats).filter(([key]) => key !== "hit_locations"),
  ) as Omit<AnalysisResponse["stats"], "hit_locations">;

  return {
    ...(JSON.parse(
      JSON.stringify({
        ...persistableAnalysis,
        stats: {
          ...statsWithoutHitLocations,
          per_player: analysis.stats?.per_player ?? [],
        },
      }),
    ) as PersistedAnalysisResponse),
  };
}

function buildReplayFingerprint(analysis: AnalysisResponse): string {
  const players = (analysis.metadata?.players ?? []).map((player) => ({
    playerIndex: player.player_index,
    character: player.character,
    tag: player.tag ?? "",
    connectCode: player.connect_code ?? "",
    netplayName: player.netplay_name ?? "",
    nameTag: player.name_tag ?? "",
    stocksLeft: player.stocks_left ?? null,
    didWin: player.did_win,
  }));

  return JSON.stringify({
    startedAt: analysis.metadata?.started_at ?? "",
    stage: analysis.metadata?.stage ?? "",
    numPlayers: analysis.metadata?.num_players ?? 0,
    winnerName: analysis.metadata?.winner_name ?? "",
    winnerPlayerIndex: analysis.metadata?.winner_player_index ?? null,
    totalFrames: analysis.stats.total_frames,
    matchDurationSeconds: analysis.stats.match_duration_seconds,
    players,
  });
}

function hashFingerprint(input: string): string {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildReplayDocumentId(analysis: AnalysisResponse): string {
  return `replay_${hashFingerprint(buildReplayFingerprint(analysis))}`;
}

export type SaveGameResult =
  | {
      status: "saved";
      replayId: string;
      filename: string;
    }
  | {
      status: "duplicate";
      replayId: string;
      filename: string;
    };

export type ReplayIdentityResult = {
  filename: string;
  replayId: string;
};

async function saveGameRecord(
  uid: string,
  filename: string,
  uploadMode: "single" | "folder",
  analysis: AnalysisResponse,
  trackedPlayerAssignment: TrackedPlayerAssignment,
): Promise<SaveGameResult> {
  const firestore = assertFirestoreConfigured();
  const trimmedAnalysis = trimAnalysisForStorage(analysis);
  const playerTags = (analysis.metadata?.players ?? [])
    .map((player) => player.tag?.trim())
    .filter((tag): tag is string => Boolean(tag));
  const replayId = buildReplayDocumentId(analysis);
  const gameDoc = doc(collection(firestore, "users", uid, "games"), replayId);
  const existingRecord = await getDoc(gameDoc);

  if (existingRecord.exists()) {
    return {
      status: "duplicate",
      replayId,
      filename,
    };
  }

  await setDoc(gameDoc, {
    filename,
    uploadMode,
    createdAt: serverTimestamp(),
    summary: analysis.summary,
    stage: analysis.metadata?.stage ?? null,
    startedAt: analysis.metadata?.started_at ?? null,
    playerTags,
    trackedPlayerAssignment,
    analysis: trimmedAnalysis,
  });

  return {
    status: "saved",
    replayId,
    filename,
  };
}

export async function saveSingleGameAnalysis(
  uid: string,
  filename: string,
  analysis: AnalysisResponse,
  trackedPlayerAssignment: TrackedPlayerAssignment,
) {
  return saveGameRecord(
    uid,
    filename,
    "single",
    analysis,
    trackedPlayerAssignment,
  );
}

export async function saveBatchGameAnalyses(
  uid: string,
  replays: ReplayAnalysisWithFile[],
) {
  return Promise.all(
    replays.map((replay) => {
      if (!replay.trackedPlayerAssignment) {
        throw new Error(`Missing tracked player assignment for ${replay.filename}`);
      }

      return saveGameRecord(
        uid,
        replay.filename,
        "folder",
        replay,
        replay.trackedPlayerAssignment,
      );
    }),
  );
}

export async function updateSavedGameAssignments(
  uid: string,
  updates: Array<{
    replayId: string;
    trackedPlayerAssignment: TrackedPlayerAssignment;
  }>,
) {
  if (updates.length === 0) {
    return;
  }

  const firestore = assertFirestoreConfigured();
  const batch = writeBatch(firestore);

  updates.forEach(({ replayId, trackedPlayerAssignment }) => {
    const gameDoc = doc(collection(firestore, "users", uid, "games"), replayId);
    batch.set(
      gameDoc,
      {
        trackedPlayerAssignment,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });

  await batch.commit();
}

export async function deleteSavedGame(uid: string, replayId: string) {
  const firestore = assertFirestoreConfigured();
  const gameDoc = doc(collection(firestore, "users", uid, "games"), replayId);
  await deleteDoc(gameDoc);
}

function serializeCreatedAt(value: Timestamp | null | undefined) {
  if (!value) {
    return null;
  }

  return value.toDate().toISOString();
}

export async function loadSavedGames(uid: string): Promise<SavedGameRecord[]> {
  const firestore = assertFirestoreConfigured();
  const snapshot = await getDocs(
    query(
      collection(firestore, "users", uid, "games"),
      orderBy("createdAt", "desc"),
    ),
  );

  return snapshot.docs.map((doc) => {
    const data = doc.data() as {
      filename?: string;
      uploadMode?: "single" | "folder";
      createdAt?: Timestamp | null;
      summary?: string;
      stage?: string | null;
      startedAt?: string | null;
      playerTags?: string[];
      trackedPlayerAssignment?: TrackedPlayerAssignment | null;
      analysis: PersistedAnalysisResponse;
    };

    return {
      id: doc.id,
      filename: data.filename ?? "unknown.slp",
      uploadMode: data.uploadMode ?? "single",
      createdAt: serializeCreatedAt(data.createdAt),
      summary: data.summary ?? "",
      stage: data.stage ?? null,
      startedAt: data.startedAt ?? null,
      playerTags: data.playerTags ?? [],
      trackedPlayerAssignment: data.trackedPlayerAssignment ?? null,
      analysis: data.analysis,
    };
  });
}

export async function loadSavedReplayIds(uid: string): Promise<Set<string>> {
  const firestore = assertFirestoreConfigured();
  const snapshot = await getDocs(collection(firestore, "users", uid, "games"));

  return new Set(snapshot.docs.map((doc) => doc.id));
}
