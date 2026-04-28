import type { User } from "firebase/auth";

import { firebaseConfigError } from "../lib/firebase";

type AccountPanelProps = {
  currentUser: User | null;
  authReady: boolean;
  authError: string | null;
  saveMessage?: string | null;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
};

export default function AccountPanel({
  currentUser,
  authReady,
  authError,
  saveMessage,
  onSignIn,
  onSignOut,
}: AccountPanelProps) {
  return (
    <div className="mb-4 flex flex-col gap-2 rounded-xl border border-slate-600/60 bg-slate-900/30 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
          Account
        </p>
        {firebaseConfigError ? (
          <p className="mt-1 text-xs text-amber-200">{firebaseConfigError}</p>
        ) : currentUser ? (
          <div className="mt-1">
            <p className="text-sm font-semibold leading-tight text-white">
              {currentUser.displayName || currentUser.email}
            </p>
            <p className="text-[11px] text-slate-400">
              Signed in. Uploads save to Firestore.
            </p>
          </div>
        ) : (
          <div className="mt-1">
            <p className="text-sm font-semibold leading-tight text-white">
              Save your replay history
            </p>
            <p className="text-[11px] text-slate-400">
              Sign in with Google to keep your history.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col items-start gap-1.5 sm:items-end">
        {!firebaseConfigError && authReady && !currentUser && (
          <button
            type="button"
            onClick={() => {
              void onSignIn();
            }}
            className="rounded-md border border-cyan-400/50 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-500/20"
          >
            Sign In With Google
          </button>
        )}
        {!firebaseConfigError && currentUser && (
          <button
            type="button"
            onClick={() => {
              void onSignOut();
            }}
            className="rounded-md border border-slate-500/70 bg-slate-700/50 px-3 py-1.5 text-xs font-semibold text-white transition hover:border-slate-300 hover:bg-slate-700"
          >
            Sign Out
          </button>
        )}
        {authError && <p className="text-[11px] text-red-300">{authError}</p>}
        {saveMessage && (
          <p className="text-[11px] text-emerald-300">{saveMessage}</p>
        )}
      </div>
    </div>
  );
}
