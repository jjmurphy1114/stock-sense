import ReplayAssignmentList from "./ReplayAssignmentList";

export default function ReplayOwnershipModal({
  isOpen,
  items,
  assignmentError,
  assignmentSaving,
  onClose,
  onChange,
  onSave,
}: {
  isOpen: boolean;
  items: Parameters<typeof ReplayAssignmentList>[0]["items"];
  assignmentError: string | null;
  assignmentSaving: boolean;
  onClose: () => void;
  onChange: (itemId: string, value: string) => void;
  onSave: () => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
      <div className="max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-slate-600 bg-slate-900 p-6 shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">
              Replay Ownership
            </p>
            <h3 className="mt-2 text-2xl font-bold text-white">
              Update saved replay assignments
            </h3>
            <p className="mt-2 text-sm text-slate-300">
              Pick the player you were for each replay. This works for both
              online tags and console player numbers.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
          >
            Close
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <ReplayAssignmentList
            items={items}
            selectLabel="I was this player"
            emptyOptionLabel="Select player"
            onChange={onChange}
          />
        </div>

        {assignmentError ? (
          <p className="mt-4 text-sm text-red-300">{assignmentError}</p>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={assignmentSaving}
            className="rounded-xl border border-purple-400/50 bg-purple-500/15 px-4 py-2.5 text-sm font-semibold text-purple-100 transition hover:border-purple-300 hover:bg-purple-500/25 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {assignmentSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
