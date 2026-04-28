import { useEffect, useState } from "react";
import {
  BrowserRouter,
  NavLink,
  Route,
  Routes,
} from "react-router-dom";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";

import ProfileMenu from "./components/ProfileMenu";
import ReplayAnalyzer from "./components/ReplayAnalyzer";
import SavedGamesPage from "./components/SavedGamesPage";
import { auth, firebaseConfigError, googleProvider } from "./lib/firebase";
import {
  getDefaultUserProfile,
  loadUserProfile,
  saveUserProfile,
  type UserProfile,
} from "./lib/userProfile";
import "./App.css";

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 20h14" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" />
      <path d="M6 4h12v4H6z" />
      <path d="M6 11h12v9H6z" />
      <path d="M10 15h4" />
    </svg>
  );
}

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!auth);
  const [authError, setAuthError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savedGamesRefreshToken, setSavedGamesRefreshToken] = useState(0);

  useEffect(() => {
    if (!auth) {
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
      setAuthError(null);
      setProfile(user ? getDefaultUserProfile(user) : null);
      setProfileError(null);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    let active = true;

    loadUserProfile(currentUser)
      .then((nextProfile) => {
        if (active) {
          setProfile(nextProfile);
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        setProfile(getDefaultUserProfile(currentUser));
        setProfileError(
          error instanceof Error ? error.message : "Failed to load profile.",
        );
      });

    return () => {
      active = false;
    };
  }, [currentUser]);

  const handleSignIn = async () => {
    if (!auth) {
      setAuthError(firebaseConfigError ?? "Firebase Auth is not configured.");
      return;
    }

    try {
      setAuthError(null);
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Failed to sign in.",
      );
    }
  };

  const handleSignOut = async () => {
    if (!auth) {
      return;
    }

    try {
      await signOut(auth);
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Failed to sign out.",
      );
    }
  };

  const handleSaveProfile = async (nextProfile: UserProfile) => {
    if (!currentUser) {
      return;
    }

    try {
      setProfileSaving(true);
      setProfileError(null);
      const savedProfile = await saveUserProfile(currentUser, nextProfile);
      setProfile(savedProfile);
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : "Failed to save profile.",
      );
      throw error;
    } finally {
      setProfileSaving(false);
    }
  };

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-linear-to-br from-purple-900 via-slate-900 to-slate-800 p-6">
        <div className="mx-auto max-w-6xl">
          <header className="mb-10">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 rounded-2xl border border-slate-600 bg-slate-900/40 p-2 shadow-lg shadow-black/10">
                <NavLink
                  to="/"
                  end
                  className={({ isActive }) =>
                    `inline-flex h-11 w-11 items-center justify-center rounded-xl border transition ${
                      isActive
                        ? "border-purple-300 bg-purple-500/20 text-white"
                        : "border-slate-600 bg-slate-900/40 text-slate-300 hover:border-purple-300 hover:text-white"
                    }`
                  }
                  title="Upload replays"
                  aria-label="Upload replays"
                >
                  <UploadIcon />
                </NavLink>
                <NavLink
                  to="/saved-games"
                  className={({ isActive }) =>
                    `inline-flex h-11 w-11 items-center justify-center rounded-xl border transition ${
                      isActive
                        ? "border-cyan-300 bg-cyan-500/20 text-white"
                        : "border-slate-600 bg-slate-900/40 text-slate-300 hover:border-cyan-300 hover:text-white"
                    }`
                  }
                  title="Saved games"
                  aria-label="Saved games"
                >
                  <ArchiveIcon />
                </NavLink>
              </div>

              <ProfileMenu
                authError={authError}
                authReady={authReady}
                currentUser={currentUser}
                profile={profile}
                profileError={profileError}
                profileSaving={profileSaving}
                onSaveProfile={handleSaveProfile}
                onSignIn={handleSignIn}
                onSignOut={handleSignOut}
              />
            </div>

            <div className="flex justify-center">
              <div className="flex flex-col items-center text-center">
                <div className="flex items-center gap-3">
                  <img
                    src="/stocksense.png"
                    alt="StockSense"
                    className="h-14 w-14"
                  />
                  <div>
                    <h1 className="text-4xl font-bold text-white">StockSense</h1>
                    <p className="mt-1 text-sm text-purple-200">
                      A Melee Replay Analyzer and Coach
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <Routes>
            <Route
              path="/"
              element={
                <ReplayAnalyzer
                  currentUser={currentUser}
                  onSavedGamesChanged={async () => {
                    setSavedGamesRefreshToken((value) => value + 1);
                  }}
                />
              }
            />
            <Route
              path="/saved-games"
              element={
                <SavedGamesPage
                  currentUser={currentUser}
                  refreshToken={savedGamesRefreshToken}
                />
              }
            />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
