"use client";

import { useCallback } from "react";
import type { Motherboard, SlotPosition, Component } from "@/lib/types";
import type { VisualState } from "@/lib/physical-conflict-engine";
import SlotOverlay from "./SlotOverlay";
import ComponentOverlay from "./ComponentOverlay";

interface BoardViewProps {
  motherboard: Motherboard;
  slotPositions: SlotPosition[];
  assignments: Record<string, string>;
  loadedComponents: Record<string, Component>;
  visualStates: Record<string, VisualState>;
  conflictMessages: Record<string, string>;
  boardWidthMm: number;
  boardHeightMm: number;
  onSlotClick?: (slotId: string, slotType: SlotPosition["slot_type"]) => void;
  mode?: "display" | "edit";
  onPositionChange?: (slotId: string, x_pct: number, y_pct: number) => void;
  onSizeChange?: (slotId: string, width_pct: number, height_pct: number) => void;
}

export default function BoardView({
  motherboard,
  slotPositions,
  assignments,
  loadedComponents,
  visualStates,
  conflictMessages,
  boardWidthMm,
  boardHeightMm,
  onSlotClick,
  mode = "display",
  onPositionChange,
  onSizeChange,
}: BoardViewProps) {
  const handleRemove = useCallback((_slotId: string) => {
    // Removal handled by BoardLayout via state lifting.
  }, []);

  // Filter out sata_group entries -- SATA drives are rendered in the DriveBayArea instead
  const filteredSlotPositions = slotPositions.filter(
    (sp) => sp.slot_type !== "sata_group",
  );

  return (
    <div
      className="relative h-full w-full overflow-visible rounded border border-zinc-600 bg-zinc-800"
      role="img"
      aria-label={`${motherboard.manufacturer} ${motherboard.model} board layout`}
    >
      {/* Rear I/O panel indicator -- thin vertical bar on the left edge */}
      <div className="absolute top-0 left-0 flex h-full w-[3%] items-center justify-center rounded-l bg-zinc-700">
        <span className="text-[0.5rem] font-semibold tracking-wide text-zinc-400 [writing-mode:vertical-lr]">
          I/O
        </span>
      </div>

      {/* Slot overlays */}
      {filteredSlotPositions.map((sp) => (
        <SlotOverlay
          key={sp.slot_id}
          position={sp}
          visualState={visualStates[sp.slot_id] ?? "empty"}
          conflictMessage={conflictMessages[sp.slot_id]}
          slotLabel={sp.slot_id}
          onSlotClick={onSlotClick}
          mode={mode}
          onPositionChange={onPositionChange}
          onSizeChange={onSizeChange}
        />
      ))}

      {/* Component overlays for placed components */}
      {filteredSlotPositions.map((sp) => {
        const componentId = assignments[sp.slot_id];
        if (!componentId) return null;
        const component = loadedComponents[componentId];
        if (!component) return null;

        return (
          <ComponentOverlay
            key={`component-${sp.slot_id}`}
            componentId={componentId}
            component={component}
            slotPosition={sp}
            boardWidthMm={boardWidthMm}
            boardHeightMm={boardHeightMm}
            onRemove={handleRemove}
          />
        );
      })}
    </div>
  );
}
