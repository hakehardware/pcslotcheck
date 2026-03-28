"use client";

import { useDroppable } from "@dnd-kit/react";
import type { SATAPort, Component } from "@/lib/types";
import type { VisualState } from "@/lib/physical-conflict-engine";

interface DriveBayAreaProps {
  sataPorts: SATAPort[];
  assignments: Record<string, string>;
  loadedComponents: Record<string, Component>;
  visualStates: Record<string, VisualState>;
  conflictMessages: Record<string, string>;
  mode: "display" | "edit";
}

/** Visual state CSS class map for drive bay slots. */
const BAY_STATE_CLASSES: Record<string, string> = {
  empty: "border-dashed border-zinc-500",
  "drop-target": "border-green-400 bg-green-400/20",
  populated: "border-zinc-400 bg-zinc-600/40",
  blocked: "border-red-400 bg-red-400/20",
};

/**
 * A single drive bay slot. In display mode it registers as a droppable
 * target via @dnd-kit/react. In edit mode it renders but is not interactive.
 */
function DriveBaySlot({
  port,
  assignment,
  component,
  visualState,
  conflictMessage,
  mode,
}: {
  port: SATAPort;
  assignment: string | undefined;
  component: Component | undefined;
  visualState: VisualState;
  conflictMessage: string | undefined;
  mode: "display" | "edit";
}) {
  const { ref, isDropTarget: isOver } = useDroppable({ id: port.id });

  const effectiveState: VisualState =
    mode === "display" && isOver ? "drop-target" : visualState;

  const stateClasses =
    BAY_STATE_CLASSES[effectiveState] ?? BAY_STATE_CLASSES.empty;

  // Determine display text: model name if populated, port id otherwise
  const displayText =
    assignment && component ? component.model : port.id;

  return (
    <div
      ref={mode === "display" ? ref : undefined}
      data-testid={`drive-bay-${port.id}`}
      title={conflictMessage || undefined}
      className={`flex items-center gap-2 rounded border-2 px-2 py-1 text-xs transition-colors ${stateClasses}`}
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
      className="flex h-full flex-wrap items-start gap-1.5 rounded bg-zinc-900/60 p-2"
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
            mode={mode}
          />
        );
      })}
    </div>
  );
}
