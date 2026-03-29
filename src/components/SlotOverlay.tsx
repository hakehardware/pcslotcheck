"use client";

import { useRef, useCallback, useState } from "react";
import type { SlotPosition } from "@/lib/types";
import type { VisualState } from "@/lib/physical-conflict-engine";

interface SlotOverlayProps {
  position: SlotPosition;
  visualState: VisualState;
  conflictMessage?: string;
  slotLabel: string;
  onSlotClick?: (slotId: string, slotType: SlotPosition["slot_type"]) => void;
  mode?: "display" | "edit";
  onPositionChange?: (slotId: string, x_pct: number, y_pct: number) => void;
  onSizeChange?: (slotId: string, width_pct: number, height_pct: number) => void;
}

/** Visual state CSS class map -- maintains 3:1+ contrast against zinc-800 board bg. */
const VISUAL_STATE_CLASSES: Record<VisualState, string> = {
  empty: "border-dashed border-zinc-500",
  "drop-target": "", // kept for type safety; never rendered
  populated: "border-zinc-400 bg-zinc-600/40",
  covered: "border-yellow-400 bg-yellow-400/20",
  blocked: "border-red-400 bg-red-400/20",
  "bandwidth-reduced": "border-orange-400 bg-orange-400/20",
};

/** Slot-type-specific shape classes. */
export const SLOT_SHAPE_CLASSES: Record<SlotPosition["slot_type"], string> = {
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

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export default function SlotOverlay({
  position,
  visualState,
  conflictMessage,
  slotLabel,
  onSlotClick,
  mode = "display",
  onPositionChange,
  onSizeChange,
}: SlotOverlayProps) {
  const isEditMode = mode === "edit";
  const isClickable = mode === "display" && visualState === "empty";

  // Ref to the main overlay element for pointer capture
  const overlayRef = useRef<HTMLDivElement>(null);

  // Refs for tracking drag/resize state without re-renders during movement
  const dragStateRef = useRef<{
    active: boolean;
    type: "drag" | "resize";
    // Board container rect captured on pointer down
    boardRect: DOMRect;
    // Offset from pointer to element top-left (for drag)
    offsetX: number;
    offsetY: number;
    // Starting position/size in percentages (for resize)
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    // Pointer start position in pixels (for resize)
    pointerStartPx: number;
    pointerStartPy: number;
    // Pointer ID for capture management
    pointerId: number;
  } | null>(null);

  // Local position/size state used during active drag/resize for visual feedback
  const [localPos, setLocalPos] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  const handleActivate = () => {
    if (isClickable && onSlotClick) {
      onSlotClick(position.slot_id, position.slot_type);
    }
  };

  // Get the BoardView container element (parent with role="img")
  const getBoardContainer = useCallback((el: HTMLElement): HTMLElement | null => {
    let current = el.parentElement;
    while (current) {
      if (current.getAttribute("role") === "img") {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, interactionType: "drag" | "resize") => {
      if (!isEditMode) return;
      e.preventDefault();
      e.stopPropagation();

      const mainEl = overlayRef.current;
      if (!mainEl) return;

      const boardEl = getBoardContainer(mainEl);
      if (!boardEl) return;

      const boardRect = boardEl.getBoundingClientRect();

      // Capture pointer on the main overlay so move/up events route here
      mainEl.setPointerCapture(e.pointerId);

      if (interactionType === "drag") {
        // Calculate offset from pointer to element's current position
        const elLeft = (position.x_pct / 100) * boardRect.width;
        const elTop = (position.y_pct / 100) * boardRect.height;
        const pointerRelX = e.clientX - boardRect.left;
        const pointerRelY = e.clientY - boardRect.top;

        dragStateRef.current = {
          active: true,
          type: "drag",
          boardRect,
          offsetX: pointerRelX - elLeft,
          offsetY: pointerRelY - elTop,
          startX: position.x_pct,
          startY: position.y_pct,
          startW: position.width_pct,
          startH: position.height_pct,
          pointerStartPx: 0,
          pointerStartPy: 0,
          pointerId: e.pointerId,
        };

        setLocalPos({
          x: position.x_pct,
          y: position.y_pct,
          w: position.width_pct,
          h: position.height_pct,
        });
      } else {
        // Resize mode
        dragStateRef.current = {
          active: true,
          type: "resize",
          boardRect,
          offsetX: 0,
          offsetY: 0,
          startX: position.x_pct,
          startY: position.y_pct,
          startW: position.width_pct,
          startH: position.height_pct,
          pointerStartPx: e.clientX,
          pointerStartPy: e.clientY,
          pointerId: e.pointerId,
        };

        setLocalPos({
          x: position.x_pct,
          y: position.y_pct,
          w: position.width_pct,
          h: position.height_pct,
        });
      }
    },
    [isEditMode, position, getBoardContainer],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      if (!state || !state.active) return;
      e.preventDefault();

      const { boardRect } = state;

      if (state.type === "drag") {
        const pointerRelX = e.clientX - boardRect.left;
        const pointerRelY = e.clientY - boardRect.top;

        const newLeftPx = pointerRelX - state.offsetX;
        const newTopPx = pointerRelY - state.offsetY;

        let xPct = (newLeftPx / boardRect.width) * 100;
        let yPct = (newTopPx / boardRect.height) * 100;

        // Clamp so the overlay stays within bounds
        xPct = clamp(xPct, 0, 100 - state.startW);
        yPct = clamp(yPct, 0, 100 - state.startH);

        setLocalPos({ x: xPct, y: yPct, w: state.startW, h: state.startH });
      } else {
        // Resize
        const deltaXPx = e.clientX - state.pointerStartPx;
        const deltaYPx = e.clientY - state.pointerStartPy;

        const deltaWPct = (deltaXPx / boardRect.width) * 100;
        const deltaHPct = (deltaYPx / boardRect.height) * 100;

        // Minimum 2%, maximum: remaining space from start position
        const maxW = 100 - state.startX;
        const maxH = 100 - state.startY;
        const newW = clamp(state.startW + deltaWPct, 2, maxW);
        const newH = clamp(state.startH + deltaHPct, 2, maxH);

        setLocalPos({ x: state.startX, y: state.startY, w: newW, h: newH });
      }
    },
    [],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      if (!state || !state.active) return;
      e.preventDefault();

      const mainEl = overlayRef.current;
      if (mainEl) {
        mainEl.releasePointerCapture(state.pointerId);
      }

      if (state.type === "drag" && localPos && onPositionChange) {
        onPositionChange(position.slot_id, localPos.x, localPos.y);
      } else if (state.type === "resize" && localPos && onSizeChange) {
        onSizeChange(position.slot_id, localPos.w, localPos.h);
      }

      dragStateRef.current = null;
      setLocalPos(null);
    },
    [localPos, onPositionChange, onSizeChange, position.slot_id],
  );

  const ariaLabel = buildAriaLabel(
    position.slot_type,
    position.slot_id,
    visualState,
  );

  const stateClasses = VISUAL_STATE_CLASSES[visualState];
  const shapeClasses = SLOT_SHAPE_CLASSES[position.slot_type];

  // Use local position/size during active drag/resize, otherwise use props
  const displayX = localPos ? localPos.x : position.x_pct;
  const displayY = localPos ? localPos.y : position.y_pct;
  const displayW = localPos ? localPos.w : position.width_pct;
  const displayH = localPos ? localPos.h : position.height_pct;

  const editCursorClass = isEditMode ? "cursor-move" : "";
  const clickCursorClass = isClickable ? "cursor-pointer" : "";

  return (
    <div
      ref={overlayRef}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      title={conflictMessage || undefined}
      onClick={isEditMode ? undefined : handleActivate}
      onKeyDown={
        isEditMode
          ? undefined
          : (e) => {
              if (e.key === "Enter") {
                handleActivate();
              }
            }
      }
      onPointerDown={isEditMode ? (e) => handlePointerDown(e, "drag") : undefined}
      onPointerMove={isEditMode ? handlePointerMove : undefined}
      onPointerUp={isEditMode ? handlePointerUp : undefined}
      className={`absolute border-2 ${stateClasses} ${shapeClasses} flex items-center justify-center overflow-hidden transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 ${editCursorClass} ${clickCursorClass}`}
      style={{
        left: `${displayX}%`,
        top: `${displayY}%`,
        width: `${displayW}%`,
        height: `${displayH}%`,
        minWidth: "2rem",
        minHeight: "1.25rem",
        touchAction: isEditMode ? "none" : undefined,
      }}
    >
      <span className="pointer-events-none select-none text-[0.45rem] leading-tight text-zinc-300 sm:text-[0.55rem]">
        {slotLabel}
      </span>

      {/* Resize handle -- bottom-right corner, only in edit mode */}
      {isEditMode && (
        <div
          data-testid={`resize-handle-${position.slot_id}`}
          onPointerDown={(e) => {
            e.stopPropagation();
            handlePointerDown(e, "resize");
          }}
          className="absolute bottom-0 right-0 cursor-se-resize bg-zinc-400/60"
          style={{ width: 8, height: 8 }}
        />
      )}
    </div>
  );
}
