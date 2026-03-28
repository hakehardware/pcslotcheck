"use client";

import type { SlotPosition, GPUComponent } from "@/lib/types";

interface PCIeBracketSlotsProps {
  bracketCount: number;
  boardOffsetX: number;
  boardOffsetY: number;
  pixelsPerMm: number;
  pcieSlotPositions: SlotPosition[];
  boardWidthPx: number;
  boardHeightPx: number;
  gpuPlacements: Array<{
    slotPosition: SlotPosition;
    component: GPUComponent;
  }>;
}

/** First bracket offset from board top edge in mm (ATX standard). */
const FIRST_BRACKET_OFFSET_MM = 45;
/** Vertical pitch between consecutive brackets in mm. */
const BRACKET_PITCH_MM = 20;
/** Visual height of each bracket line in pixels. */
const BRACKET_HEIGHT_PX = 2;
/** How far the bracket extends to the left of the board edge. */
const BRACKET_EXTEND_PX = 24;

/**
 * Renders fixed expansion bracket openings along the rear (left) edge
 * of the case frame. Each bracket is a thin vertical-position reference
 * line at 20mm pitch starting from 45mm below the board top.
 *
 * Brackets are horizontal lines extending to the left of the board,
 * representing the rear panel bracket cutouts where PCIe cards exit.
 */
export default function PCIeBracketSlots({
  bracketCount,
  boardOffsetX,
  boardOffsetY,
  pixelsPerMm,
}: PCIeBracketSlotsProps) {
  const brackets = Array.from({ length: bracketCount }, (_, i) => {
    const yPx =
      boardOffsetY +
      (FIRST_BRACKET_OFFSET_MM + i * BRACKET_PITCH_MM) * pixelsPerMm;
    return { index: i, yPx };
  });

  return (
    <>
      {brackets.map(({ index, yPx }) => (
        <div
          key={index}
          data-testid={`pcie-bracket-${index + 1}`}
          className="absolute bg-zinc-500/60"
          style={{
            left: Math.max(0, boardOffsetX - BRACKET_EXTEND_PX),
            top: yPx,
            width: BRACKET_EXTEND_PX,
            height: BRACKET_HEIGHT_PX,
          }}
          aria-hidden="true"
        />
      ))}
    </>
  );
}
