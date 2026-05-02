import CharacterIcon from "./CharacterIcon";
import { formatCharacterName } from "../replayAnalysisTypes";

export type ReplayAssignmentPlayer = {
  playerIndex: number;
  label: string;
  character: string;
  detail?: string;
};

export type ReplayAssignmentItem = {
  id: string;
  title: string;
  subtitle: string;
  selectedValue: string;
  players: ReplayAssignmentPlayer[];
};

export default function ReplayAssignmentList({
  items,
  selectLabel,
  emptyOptionLabel,
  onChange,
}: {
  items: ReplayAssignmentItem[];
  selectLabel: string;
  emptyOptionLabel: string;
  onChange: (itemId: string, value: string) => void;
}) {
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-2xl border border-slate-700 bg-slate-950/40 p-4"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">{item.title}</p>
              <p className="mt-1 text-xs text-slate-400">{item.subtitle}</p>
            </div>

            <label className="flex w-full flex-col gap-2 text-sm text-slate-300 lg:w-80">
              {selectLabel}
              <select
                value={item.selectedValue}
                onChange={(event) => onChange(item.id, event.target.value)}
                className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-2.5 text-white outline-none transition focus:border-purple-400"
              >
                <option value="">{emptyOptionLabel}</option>
                {item.players.map((player) => (
                  <option
                    key={`${item.id}-${player.playerIndex}`}
                    value={player.playerIndex}
                  >
                    {player.label} • {formatCharacterName(player.character)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {item.players.map((player) => (
              <div
                key={`${item.id}-player-${player.playerIndex}`}
                className="rounded-xl border border-slate-700 bg-slate-900/50 p-3 text-sm text-slate-200"
              >
                <div className="flex items-center gap-3">
                  <CharacterIcon character={player.character} className="h-8 w-8" />
                  <div>
                    <p className="font-semibold text-white">{player.label}</p>
                    <p className="text-xs text-slate-400">
                      {formatCharacterName(player.character)}
                      {player.detail ? ` • ${player.detail}` : ""}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
