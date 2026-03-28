"use client";

import type { Motherboard, SlotPosition, Component, GPUComponent } from "@/lib/types";
import type { VisualState } from "@/lib/physical-conflict-engine";
import { computeCaseScale, getBracketCount, CANVAS_PX } from "@/lib/case-scale";
import BoardView from "./BoardView";
import DriveBayArea from "./DriveBayArea";
import PCIeBracketSlots from "./PCIeBracketSlots";

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
}

/** Height reserved for the drive bay area at the bottom of the canvas. */
const DRIVE_BAY_HEIGHT_PX = 80;

/**
 * Fixed-pixel case interior frame that hosts the motherboard at physical
 * scale, PCIe bracket slots along the rear edge, and a drive bay area
 * at the front (bottom) edge.
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
}: CaseCanvasProps) {
  const { pixelsPerMm, boardWidthPx, boardHeightPx, boardOffsetX, boardOffsetY } =
    computeCaseScale(boardWidthMm, boardHeightMm);

  const bracketCount = getBracketCount(motherboard.form_factor);

  // Filter PCIe slot positions for bracket alignment reference
  const pcieSlotPositions = slotPositions.filter(
    (sp) => sp.slot_type === "pcie",
  );

  // Build GPU placements: only GPUs assigned to PCIe slots
  const gpuPlacements: Array<{ slotPosition: SlotPosition; component: GPUComponent }> = [];
  for (const sp of pcieSlotPositions) {
    const componentId = assignments[sp.slot_id];
    if (!componentId) continue;
    const component = loadedComponents[componentId];
    if (!component || component.type !== "gpu") continue;
    gpuPlacements.push({ slotPosition: sp, component: component as GPUComponent });
  }

  return (
    <div
      data-testid="case-canvas"
      className="relative border border-zinc-600 bg-zinc-950"
      style={{ width: CANVAS_PX.width, height: CANVAS_PX.height }}
    >
      {/* Orientation label: I/O Panel (rear / top edge) */}
      <div className="absolute inset-x-0 top-0 flex h-[28px] items-center justify-center">
        <span className="text-[0.65rem] tracking-widest text-zinc-500 uppercase">
          I/O Panel
        </span>
      </div>

      {/* Orientation label: Front Panel (front / bottom edge) */}
      <div className="absolute inset-x-0 bottom-0 flex h-[28px] items-center justify-center">
        <span className="text-[0.65rem] tracking-widest text-zinc-500 uppercase">
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
        />
      </div>

      {/* PCIe bracket slots along the rear (top) edge */}
      <PCIeBracketSlots
        bracketCount={bracketCount}
        boardOffsetY={boardOffsetY}
        pixelsPerMm={pixelsPerMm}
        pcieSlotPositions={pcieSlotPositions}
        boardHeightPx={boardHeightPx}
        gpuPlacements={gpuPlacements}
      />

      {/* Drive bay area at the front (bottom) of the case */}
      <div
        data-testid="drive-bay-region"
        className="absolute inset-x-0"
        style={{
          bottom: 28,
          height: DRIVE_BAY_HEIGHT_PX,
          padding: "0 8px",
        }}
      >
        <DriveBayArea
          sataPorts={motherboard.sata_ports}
          assignments={sataDriveAssignments}
          loadedComponents={sataDriveComponents}
          visualStates={sataDriveVisualStates}
          conflictMessages={sataDriveConflictMessages}
          mode={mode}
        />
      </div>
    </div>
  );
}
