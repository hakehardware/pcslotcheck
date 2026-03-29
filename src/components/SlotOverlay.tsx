"use client";

import type { SlotPosition } from "@/lib/types";
import type { VisualState } from "@/lib/physical-conflict-engine";

interface SlotOverlayProps {
  position: SlotPosition;
  visualState: VisualState;
  conflictMessage?: string;
  slotLabel: string;
  onSlotClick?: (slotId: string, slotType: SlotPosition["slot_type"]) => void;
  mode?: "display" | "edit";
}

/** Visual state CSS class map — maintains 3:1+ contrast against zinc-800 board bg. */
const VISUAL_STATE_CLASSES: Record<VisualState, string> = {
  empty: "border-dashed border-zinc-500",
  "drop-target": "", // kept for type safety; never rendered
  populated: "border-zinc-400 bg-zinc-600/40",
  covered: "border-yellow-400 bg-yellow-400/20",
  blocked: "border-red-400 bg-red-400/20",
  "bandwidth-reduced": "border-orange-400 bg-orange-400/20",
};

/** Slot-type-specific shape classes. */
const SLOT_SHAPE_CLASSES: Record<SlotPosition["slot_type"], string> = {
  cpu: "rounded-sm",
  dimm: "rounded-none",
  pcie: "rounded-none",
  m2: "rounded-none",
  sata_group: "rounded-md",
};

/**
 * Build a human-readable aria-label for a slot overlay.
 * Exported for property-based testing (Property 10).
 */
export function buildAriaLabel(
  slotType: SlotPosition["slot_type"],
  slotId: string,
  visualState: VisualState,
): string {
  const typeLabels: Record<SlotPosition["slot_type"], string> = {
    cpu: "CPU",
    dimm: "DIMM",
    pcie: "PCIe",
    m2: "M.2",
    sata_group: "SATA",
  };
  const typeLabel = typeLabels[slotType] ?? slotType;
  return `${typeLabel} slot ${slotId}, ${visualState}`;
}

export default function SlotOverlay({
  position,
  visualState,
  conflictMessage,
  slotLabel,
  onSlotClick,
  mode = "display",
}: SlotOverlayProps) {
  const isClickable = mode === "display" && visualState === "empty";

  const handleActivate = () => {
    if (isClickable && onSlotClick) {
      onSlotClick(position.slot_id, position.slot_type);
    }
  };

  const ariaLabel = buildAriaLabel(
    position.slot_type,
    position.slot_id,
    visualState,
  );

  const stateClasses = VISUAL_STATE_CLASSES[visualState];
  const shapeClasses = SLOT_SHAPE_CLASSES[position.slot_type];

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      title={conflictMessage || undefined}
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          handleActivate();
        }
      }}
      className={`absolute border-2 ${stateClasses} ${shapeClasses} flex items-center justify-center overflow-hidden transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 ${isClickable ? "cursor-pointer" : ""}`}
      style={{
        left: `${position.x_pct}%`,
        top: `${position.y_pct}%`,
        width: `${position.width_pct}%`,
        height: `${position.height_pct}%`,
        minWidth: "2rem",
        minHeight: "1.25rem",
      }}
    >
      <span className="pointer-events-none select-none text-[0.45rem] leading-tight text-zinc-300 sm:text-[0.55rem]">
        {slotLabel}
      </span>
    </div>
  );
}
