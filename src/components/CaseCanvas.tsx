"use client";

import type { Motherboard, SlotPosition, Component } from "@/lib/types";
import type { VisualState } from "@/lib/physical-conflict-engine";
import { computeCaseScale, CANVAS_PX } from "@/lib/case-scale";
import BoardView from "./BoardView";
import DriveBayArea from "./DriveBayArea";

interface CaseCanvasProps {
  mode: "display" | "edit";
  motherboard: Motherboard;
  boardWidthMm: number;
  boardHeightMm: number;
  slotPositions: SlotPosition[];
  assignments: Record<string, string>;
  loadedComponents: Record<string, Component>;
  visualStates: Record<string, VisualState>;
  conflictMessages: Record<string, string>;
  sataDriveAssignments: Record<string, string>;
  sataDriveComponents: Record<string, Component>;
  sataDriveVisualStates: Record<string, VisualState>;
  sataDriveConflictMessages: Record<string, string>;
  onSlotClick?: (slotId: string, slotType: SlotPosition["slot_type"]) => void;
  onBayClick?: (portId: string) => void;
  onPositionChange?: (slotId: string, x_pct: number, y_pct: number) => void;
  onSizeChange?: (slotId: string, width_pct: number, height_pct: number) => void;
}

/** Width reserved for the drive bay area on the right side of the canvas. */
const DRIVE_BAY_WIDTH_PX = 110;

/**
 * Fixed-pixel case interior frame that hosts the motherboard at physical
 * scale and a drive bay area at the front (right) edge.
 *
 * Orientation (case laid flat, facing user):
 *   Left  = rear (I/O panel)
 *   Right = front (drive bays, front panel connectors)
 *   Top   = top of case
 *   Bottom = bottom of case
 */
export default function CaseCanvas({
  mode,
  motherboard,
  boardWidthMm,
  boardHeightMm,
  slotPositions,
  assignments,
  loadedComponents,
  visualStates,
  conflictMessages,
  sataDriveAssignments,
  sataDriveComponents,
  sataDriveVisualStates,
  sataDriveConflictMessages,
  onSlotClick,
  onBayClick,
  onPositionChange,
  onSizeChange,
}: CaseCanvasProps) {
  const { pixelsPerMm, boardWidthPx, boardHeightPx, boardOffsetX, boardOffsetY } =
    computeCaseScale(boardWidthMm, boardHeightMm);

  return (
    <div
      data-testid="case-canvas"
      className="relative border border-zinc-600 bg-zinc-950"
      style={{ width: CANVAS_PX.width, height: CANVAS_PX.height }}
    >
      {/* Orientation label: I/O Panel (rear / left edge) */}
      <div className="absolute left-0 inset-y-0 flex w-[36px] items-center justify-center">
        <span
          className="text-[0.65rem] tracking-widest text-zinc-500 uppercase"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          I/O Panel
        </span>
      </div>

      {/* Orientation label: Front Panel (front / right edge) */}
      <div className="absolute right-0 inset-y-0 flex w-[36px] items-center justify-center">
        <span
          className="text-[0.65rem] tracking-widest text-zinc-500 uppercase"
          style={{ writingMode: "vertical-rl" }}
        >
          Front Panel
        </span>
      </div>

      {/* Board Region -- absolutely positioned at computed offset/size */}
      <div
        data-testid="board-region"
        className="absolute"
        style={{
          left: boardOffsetX,
          top: boardOffsetY,
          width: boardWidthPx,
          height: boardHeightPx,
        }}
      >
        <BoardView
          motherboard={motherboard}
          slotPositions={slotPositions}
          assignments={assignments}
          loadedComponents={loadedComponents}
          visualStates={visualStates}
          conflictMessages={conflictMessages}
          boardWidthMm={boardWidthMm}
          boardHeightMm={boardHeightMm}
          onSlotClick={onSlotClick}
          mode={mode}
          onPositionChange={onPositionChange}
          onSizeChange={onSizeChange}
        />
      </div>

      {/* Drive bay area at the front (right) of the case */}
      <div
        data-testid="drive-bay-region"
        className="absolute inset-y-0"
        style={{
          right: 36,
          width: DRIVE_BAY_WIDTH_PX,
          padding: "8px 0",
        }}
      >
        <DriveBayArea
          sataPorts={motherboard.sata_ports}
          assignments={sataDriveAssignments}
          loadedComponents={sataDriveComponents}
          visualStates={sataDriveVisualStates}
          conflictMessages={sataDriveConflictMessages}
          mode={mode}
          onBayClick={onBayClick}
        />
      </div>
    </div>
  );
}
