import AttributeBadge from "./AttributeBadge";
import type { Component } from "../lib/types";
import type { BadgeInfo } from "../lib/ui-types";

interface SlotCardProps {
  slotId: string;
  label: string;
  badges: BadgeInfo[];
  assignedComponent: Component | null;
  isDisabled: boolean;
  disabledBy?: string;
  bandwidthWarning: string | null;
  onAssign: () => void;
  onRemove: () => void;
}

export default function SlotCard({
  slotId,
  label,
  badges,
  assignedComponent,
  isDisabled,
  disabledBy,
  bandwidthWarning,
  onAssign,
  onRemove,
}: SlotCardProps) {
  return (
    <article
      aria-label={`Slot ${label}`}
      className="relative rounded-lg border border-zinc-700 bg-zinc-900 p-4"
    >
      {/* Disabled overlay */}
      {isDisabled && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-zinc-950/70"
          aria-live="polite"
        >
          <span className="text-sm text-zinc-400">
            Disabled by {disabledBy ?? "another slot"}
          </span>
        </div>
      )}

      {/* Slot label */}
      <h3 className="text-sm font-semibold text-zinc-100">{label}</h3>

      {/* Badges */}
      {badges.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" role="list" aria-label="Slot attributes">
          {badges.map((badge) => (
            <span key={badge.label} role="listitem">
              <AttributeBadge label={badge.label} colorClass={badge.colorClass} />
            </span>
          ))}
        </div>
      )}

      {/* Assignment area */}
      <div className="mt-3">
        {assignedComponent ? (
          <div className="flex items-center justify-between gap-2 rounded border border-zinc-700 bg-zinc-800 px-3 py-2">
            <span className="text-sm text-zinc-200">
              {assignedComponent.manufacturer} {assignedComponent.model}
            </span>
            <button
              type="button"
              onClick={onRemove}
              className="text-xs text-red-400 hover:text-red-300"
              aria-label={`Remove ${assignedComponent.model} from ${label}`}
            >
              Remove
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onAssign}
            disabled={isDisabled}
            className="w-full rounded border border-dashed border-zinc-600 px-3 py-2 text-sm text-zinc-400 hover:border-zinc-500 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`Assign component to ${label}`}
          >
            + Assign component...
          </button>
        )}
      </div>

      {/* Bandwidth warning */}
      {bandwidthWarning && (
        <div
          className="mt-2 rounded border border-blue-700/50 bg-blue-900/20 px-3 py-1.5 text-xs text-blue-300"
          role="status"
        >
          ℹ {bandwidthWarning}
        </div>
      )}
    </article>
  );
}
