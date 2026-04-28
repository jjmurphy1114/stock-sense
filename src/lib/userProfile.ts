import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { updateProfile, type User } from "firebase/auth";

import { db } from "./firebase";

export type UserProfile = {
  displayName: string;
  slippiGamertag: string;
};

function assertFirestoreConfigured() {
  if (!db) {
    throw new Error("Firebase Firestore is not configured.");
  }

  return db;
}

function getUserProfileDoc(uid: string) {
  const firestore = assertFirestoreConfigured();
  return doc(firestore, "users", uid);
}

export function getDefaultUserProfile(user: User | null): UserProfile {
  return {
    displayName: user?.displayName?.trim() || "",
    slippiGamertag: "",
  };
}

export async function loadUserProfile(user: User): Promise<UserProfile> {
  const snapshot = await getDoc(getUserProfileDoc(user.uid));
  const data = snapshot.data() as
    | {
        displayName?: string | null;
        slippiGamertag?: string | null;
      }
    | undefined;

  return {
    displayName: data?.displayName?.trim() || user.displayName?.trim() || "",
    slippiGamertag: data?.slippiGamertag?.trim() || "",
  };
}

export async function saveUserProfile(user: User, profile: UserProfile) {
  const displayName = profile.displayName.trim();
  const slippiGamertag = profile.slippiGamertag.trim().toUpperCase();

  await setDoc(
    getUserProfileDoc(user.uid),
    {
      displayName,
      slippiGamertag,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  if (displayName !== (user.displayName?.trim() || "")) {
    await updateProfile(user, { displayName });
  }

  return {
    displayName,
    slippiGamertag,
  };
}
