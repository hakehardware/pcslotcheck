"use client";

import type { ViewMode } from "@/lib/view-mode";

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const OPTIONS: { label: string; mode: ViewMode }[] = [
  { label: "Table", mode: "table" },
  { label: "Compact", mode: "compact" },
  { label: "Full", mode: "full" },
];

export default function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="View mode"
      className="inline-flex rounded-lg border border-zinc-700 bg-zinc-900 overflow-hidden"
    >
      {OPTIONS.map(({ label, mode }) => {
        const isActive = value === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={isActive}
            className={[
              "px-3 py-1.5 text-sm font-medium outline-none transition-colors",
              "focus:ring-1 focus:ring-blue-500 focus:z-10",
              isActive
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200",
            ].join(" ")}
            onClick={() => onChange(mode)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onChange(mode);
              }
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
