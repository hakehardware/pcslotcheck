"use client";

import type { SlotPosition, GPUComponent } from "@/lib/types";

interface PCIeBracketSlotsProps {
  bracketCount: number;
  boardOffsetY: number;
  pixelsPerMm: number;
  pcieSlotPositions: SlotPosition[];
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
/** Visual width of each bracket line in pixels. */
const BRACKET_WIDTH_PX = 24;

/**
 * Renders fixed expansion bracket openings along the rear (top) edge
 * of the case frame. Each bracket is a thin horizontal reference line
 * at 20mm vertical pitch starting from 45mm below the board top.
 */
export default function PCIeBracketSlots({
  bracketCount,
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
            right: 0,
            top: yPx,
            width: BRACKET_WIDTH_PX,
            height: 2,
          }}
          aria-hidden="true"
        />
      ))}
    </>
  );
}
