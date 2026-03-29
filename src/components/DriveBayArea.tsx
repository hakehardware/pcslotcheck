"use client";

import type { SATAPort, Component } from "@/lib/types";
import type { VisualState } from "@/lib/physical-conflict-engine";

interface DriveBayAreaProps {
  sataPorts: SATAPort[];
  assignments: Record<string, string>;
  loadedComponents: Record<string, Component>;
  visualStates: Record<string, VisualState>;
  conflictMessages: Record<string, string>;
  mode: "display" | "edit";
  onBayClick?: (portId: string) => void;
}

/** Visual state CSS class map for drive bay slots. */
const BAY_STATE_CLASSES: Record<string, string> = {
  empty: "border-dashed border-zinc-500",
  populated: "border-zinc-400 bg-zinc-600/40",
  blocked: "border-red-400 bg-red-400/20",
};

/**
 * A single drive bay slot. Renders the bay and supports click-to-assign
 * interaction when the bay is empty and not blocked.
 */
function DriveBaySlot({
  port,
  assignment,
  component,
  visualState,
  conflictMessage,
  onBayClick,
}: {
  port: SATAPort;
  assignment: string | undefined;
  component: Component | undefined;
  visualState: VisualState;
  conflictMessage: string | undefined;
  onBayClick?: (portId: string) => void;
}) {
  const stateClasses =
    BAY_STATE_CLASSES[visualState] ?? BAY_STATE_CLASSES.empty;

  const isClickable = !assignment && visualState !== "blocked" && visualState !== "populated";

  const handleActivate = () => {
    if (isClickable && onBayClick) {
      onBayClick(port.id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleActivate();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`drive-bay-${port.id}`}
      title={conflictMessage || undefined}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      className={`flex items-center gap-2 rounded border-2 px-2 py-1 text-xs transition-colors ${stateClasses} ${isClickable ? "cursor-pointer" : ""}`}
    >
      <span className="shrink-0 font-mono text-zinc-400">{port.id}</span>
      {assignment && component && (
        <span className="truncate text-zinc-200">{component.model}</span>
      )}
    </div>
  );
}

/**
 * Drive bay area rendered at the front (bottom) of the case canvas.
 * Contains one bay per SATA port on the motherboard.
 */
export default function DriveBayArea({
  sataPorts,
  assignments,
  loadedComponents,
  visualStates,
  conflictMessages,
  mode,
  onBayClick,
}: DriveBayAreaProps) {
  if (sataPorts.length === 0) {
    return (
      <div
        data-testid="drive-bay-area"
        className="flex h-full items-center justify-center rounded bg-zinc-900/60 px-4 text-xs text-zinc-500"
      >
        No SATA ports
      </div>
    );
  }

  return (
    <div
      data-testid="drive-bay-area"
      className="flex h-full flex-col items-stretch gap-1.5 overflow-y-auto rounded bg-zinc-900/60 p-2"
    >
      {sataPorts.map((port) => {
        const assignmentId = assignments[port.id];
        const component = assignmentId
          ? loadedComponents[assignmentId]
          : undefined;
        const vs = visualStates[port.id] ?? "empty";
        const msg = conflictMessages[port.id];

        return (
          <DriveBaySlot
            key={port.id}
            port={port}
            assignment={assignmentId}
            component={component}
            visualState={vs}
            conflictMessage={msg}
            onBayClick={onBayClick}
          />
        );
      })}
    </div>
  );
}
