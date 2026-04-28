import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";

import { firebaseConfigError } from "../lib/firebase";
import type { UserProfile } from "../lib/userProfile";

type ProfileMenuProps = {
  currentUser: User | null;
  authReady: boolean;
  authError: string | null;
  profile: UserProfile | null;
  profileSaving: boolean;
  profileError: string | null;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onSaveProfile: (profile: UserProfile) => Promise<void>;
};

function getInitials(label: string) {
  const parts = label
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "?";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export default function ProfileMenu({
  currentUser,
  authReady,
  authError,
  profile,
  profileSaving,
  profileError,
  onSignIn,
  onSignOut,
  onSaveProfile,
}: ProfileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [slippiGamertag, setSlippiGamertag] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const profileLabel = useMemo(() => {
    if (!currentUser) {
      return "Profile";
    }

    return (
      profile?.displayName ||
      currentUser.displayName ||
      currentUser.email ||
      "Profile"
    );
  }, [currentUser, profile]);

  if (firebaseConfigError) {
    return (
      <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-left text-xs text-amber-100">
        {firebaseConfigError}
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="flex max-w-xs flex-col items-end gap-2">
        {authReady ? (
          <button
            type="button"
            onClick={() => {
              void onSignIn();
            }}
            className="inline-flex h-11 items-center rounded-xl border border-cyan-400/50 bg-cyan-500/10 px-4 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-500/20"
          >
            Sign In With Google
          </button>
        ) : (
          <div className="rounded-xl border border-slate-600 bg-slate-900/40 px-4 py-2 text-xs text-slate-300">
            Checking account...
          </div>
        )}
        {authError ? (
          <p className="max-w-xs text-right text-[11px] text-red-300">
            {authError}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => {
          if (!isOpen) {
            setDisplayName(profile?.displayName ?? currentUser.displayName ?? "");
            setSlippiGamertag(profile?.slippiGamertag ?? "");
          }

          setIsOpen((open) => !open);
        }}
        className="inline-flex min-h-11 items-center gap-3 rounded-xl border border-slate-600 bg-slate-900/40 px-3 py-2 text-left text-white shadow-lg shadow-black/10 transition hover:border-purple-300"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-purple-500/20 text-sm font-semibold text-purple-100">
          {getInitials(profileLabel)}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-40 truncate text-sm font-semibold leading-tight">
            {profileLabel}
          </span>
          <span className="block text-[11px] text-slate-400">Profile</span>
        </span>
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-[calc(100%+0.75rem)] z-30 w-[min(22rem,calc(100vw-3rem))] rounded-2xl border border-slate-600 bg-slate-900/95 p-4 text-left shadow-2xl shadow-black/40 backdrop-blur">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
              Player Profile
            </p>
            <p className="mt-1 text-sm text-slate-300">{currentUser.email}</p>
          </div>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void onSaveProfile({ displayName, slippiGamertag }).then(() => {
                setIsOpen(false);
              });
            }}
          >
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-300">
                Display Name
              </span>
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="How your profile should appear"
                className="w-full rounded-xl border border-slate-600 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-purple-300"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-300">
                Slippi Gamertag
              </span>
              <input
                type="text"
                value={slippiGamertag}
                onChange={(event) =>
                  setSlippiGamertag(event.target.value.toUpperCase())
                }
                placeholder="TAG#123"
                className="w-full rounded-xl border border-slate-600 bg-slate-950/70 px-3 py-2.5 text-sm uppercase text-white outline-none transition placeholder:text-slate-500 focus:border-purple-300"
              />
            </label>

            {profileError ? (
              <p className="text-xs text-red-300">{profileError}</p>
            ) : null}
            {authError ? <p className="text-xs text-red-300">{authError}</p> : null}

            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  void onSignOut();
                }}
                className="rounded-lg border border-slate-500/70 bg-slate-700/50 px-3 py-2 text-xs font-semibold text-white transition hover:border-slate-300 hover:bg-slate-700"
              >
                Sign Out
              </button>
              <button
                type="submit"
                disabled={profileSaving}
                className="rounded-lg border border-purple-400/50 bg-purple-500/15 px-3 py-2 text-xs font-semibold text-purple-100 transition hover:border-purple-300 hover:bg-purple-500/25 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {profileSaving ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
