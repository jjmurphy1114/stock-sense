import { useEffect, useMemo, useRef, useState } from "react";

export type MultiSelectOption = {
  value: string;
  label: string;
};

function getMultiSelectSummary(
  selectedValues: string[],
  options: MultiSelectOption[],
  emptyLabel: string,
) {
  if (selectedValues.length === 0) {
    return emptyLabel;
  }

  const selectedLabels = options
    .filter((option) => selectedValues.includes(option.value))
    .map((option) => option.label);

  if (selectedLabels.length <= 2) {
    return selectedLabels.join(", ");
  }

  return `${selectedLabels.length} selected`;
}

type FilterMultiSelectProps = {
  label: string;
  allLabel: string;
  selectedValues: string[];
  options: MultiSelectOption[];
  onChange: (values: string[]) => void;
};

export default function FilterMultiSelect({
  label,
  allLabel,
  selectedValues,
  options,
  onChange,
}: FilterMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
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

  const summary = useMemo(
    () => getMultiSelectSummary(selectedValues, options, allLabel),
    [selectedValues, options, allLabel],
  );
  const selectedValueSet = useMemo(
    () => new Set(selectedValues),
    [selectedValues],
  );
  const optionRows = useMemo(
    () =>
      options.map((option) => {
        const isSelected = selectedValueSet.has(option.value);

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              if (isSelected) {
                onChange(
                  selectedValues.filter((value) => value !== option.value),
                );
                return;
              }

              onChange([...selectedValues, option.value]);
            }}
            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
              isSelected
                ? "bg-purple-500/15 text-purple-100"
                : "text-slate-200 hover:bg-slate-800"
            }`}
          >
            <span className="min-w-0 truncate">{option.label}</span>
            <span
              className={`ml-3 inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs ${
                isSelected
                  ? "border-purple-300 bg-purple-400/20 text-purple-100"
                  : "border-slate-500 text-slate-500"
              }`}
            >
              {isSelected ? "✓" : ""}
            </span>
          </button>
        );
      }),
    [onChange, options, selectedValueSet, selectedValues],
  );

  return (
    <div className="relative h-full" ref={containerRef}>
      <div className="flex h-full flex-col gap-2 text-sm text-slate-300">
        <span>{label}</span>
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="flex min-h-11 w-full flex-1 items-center justify-between gap-3 rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-left text-white outline-none transition hover:border-purple-400 focus:border-purple-400"
        >
          <span className="min-w-0 truncate">{summary}</span>
          <span className="rounded-full border border-slate-500/70 bg-slate-700/70 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
            {selectedValues.length === 0 ? "All" : selectedValues.length}
          </span>
        </button>
      </div>

      {isOpen ? (
        <div className="absolute left-0 top-[calc(100%+0.65rem)] z-20 w-full min-w-[15rem] rounded-2xl border border-slate-600 bg-slate-900/95 p-3 shadow-xl shadow-black/30">
          <div className="mb-2 border-b border-slate-700/80 pb-2">
            <button
              type="button"
              onClick={() => onChange([])}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                selectedValues.length === 0
                  ? "bg-cyan-500/15 text-cyan-100"
                  : "text-slate-200 hover:bg-slate-800"
              }`}
            >
              <span>{allLabel}</span>
              {selectedValues.length === 0 ? (
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
                  Active
                </span>
              ) : null}
            </button>
          </div>

          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {optionRows}
          </div>
        </div>
      ) : null}
    </div>
  );
}
