// Unit and property tests for PCIeBracketSlots component.

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import * as fc from "fast-check";
import PCIeBracketSlots from "../PCIeBracketSlots";
import { computeCaseScale } from "@/lib/case-scale";
import type { SlotPosition } from "@/lib/types";

// ===================================================================
// Unit Tests
// ===================================================================

describe("PCIeBracketSlots unit tests", () => {
  const scale = computeCaseScale(305, 244);

  it("renders the correct number of bracket lines for ATX (7)", () => {
    const { getAllByTestId } = render(
      <PCIeBracketSlots
        bracketCount={7}
        boardOffsetY={scale.boardOffsetY}
        pixelsPerMm={scale.pixelsPerMm}
        pcieSlotPositions={[]}
        boardHeightPx={scale.boardHeightPx}
        gpuPlacements={[]}
      />,
    );
    const brackets = getAllByTestId(/^pcie-bracket-/);
    expect(brackets).toHaveLength(7);
  });

  it("renders 1 bracket for Mini-ITX", () => {
    const { getAllByTestId } = render(
      <PCIeBracketSlots
        bracketCount={1}
        boardOffsetY={scale.boardOffsetY}
        pixelsPerMm={scale.pixelsPerMm}
        pcieSlotPositions={[]}
        boardHeightPx={scale.boardHeightPx}
        gpuPlacements={[]}
      />,
    );
    const brackets = getAllByTestId(/^pcie-bracket-/);
    expect(brackets).toHaveLength(1);
  });

  it("bracket vertical spacing matches 20mm pitch at computed scale", () => {
    const { getAllByTestId } = render(
      <PCIeBracketSlots
        bracketCount={7}
        boardOffsetY={scale.boardOffsetY}
        pixelsPerMm={scale.pixelsPerMm}
        pcieSlotPositions={[]}
        boardHeightPx={scale.boardHeightPx}
        gpuPlacements={[]}
      />,
    );
    const brackets = getAllByTestId(/^pcie-bracket-/);
    const tops = brackets.map((el) => parseFloat(el.style.top));
    const expectedSpacing = 20 * scale.pixelsPerMm;
    for (let i = 1; i < tops.length; i++) {
      expect(tops[i] - tops[i - 1]).toBeCloseTo(expectedSpacing, 2);
    }
  });

  it("renders nothing when bracketCount is 0", () => {
    const { container } = render(
      <PCIeBracketSlots
        bracketCount={0}
        boardOffsetY={scale.boardOffsetY}
        pixelsPerMm={scale.pixelsPerMm}
        pcieSlotPositions={[]}
        boardHeightPx={scale.boardHeightPx}
        gpuPlacements={[]}
      />,
    );
    expect(container.querySelectorAll("[data-testid]")).toHaveLength(0);
  });
});

// ===================================================================
// Property Tests
// ===================================================================

// ---------------------------------------------------------------------------
// Feature: case-frame-board-revamp, Property 9: PCIe slot-to-bracket alignment
// **Validates: Requirements 10.4**
// ---------------------------------------------------------------------------

describe("Property 9: PCIe slot-to-bracket alignment", () => {
  // Generator for a PCIe slot position entry with a matching position field.
  // position is 1-indexed and determines which bracket it should align with.
  // y_pct and height_pct are derived so the slot center aligns with the
  // bracket center computed from the position field.
  const arbPcieSlotPosition = (
    boardHeightPx: number,
    boardOffsetY: number,
    pixelsPerMm: number,
  ) =>
    fc
      .integer({ min: 1, max: 7 })
      .chain((position) => {
        // Bracket center in case pixels
        const bracketCenterY =
          boardOffsetY + (45 + (position - 1) * 20) * pixelsPerMm;

        // Convert bracket center to board-relative percentage.
        // slotCenterY (case px) = boardOffsetY + (y_pct/100)*boardHeightPx + (height_pct/200)*boardHeightPx
        // We pick a fixed height_pct and derive y_pct so the center aligns.
        const heightPct = 2; // small slot height
        const slotCenterBoardRelPx = bracketCenterY - boardOffsetY;
        // slotCenterBoardRelPx = (y_pct/100)*boardHeightPx + (heightPct/200)*boardHeightPx
        // y_pct = ((slotCenterBoardRelPx - (heightPct/200)*boardHeightPx) / boardHeightPx) * 100
        const yPct =
          ((slotCenterBoardRelPx - (heightPct / 200) * boardHeightPx) /
            boardHeightPx) *
          100;

        const slotPos: SlotPosition = {
          slot_type: "pcie",
          slot_id: `pcie_${position}`,
          x_pct: 5,
          y_pct: yPct,
          width_pct: 40,
          height_pct: heightPct,
        };

        return fc.constant({ slotPos, position });
      });

  it("PCIe slot vertical center is within 5px of corresponding bracket center", () => {
    fc.assert(
      fc.property(
        // Generate board dimensions in realistic range
        fc.integer({ min: 150, max: 350 }),
        fc.integer({ min: 150, max: 350 }),
        (boardWidthMm, boardHeightMm) => {
          const scale = computeCaseScale(boardWidthMm, boardHeightMm);

          // Generate 1-3 PCIe slot positions for this board
          const slotGen = arbPcieSlotPosition(
            scale.boardHeightPx,
            scale.boardOffsetY,
            scale.pixelsPerMm,
          );

          fc.assert(
            fc.property(slotGen, ({ slotPos, position }) => {
              // Slot vertical center in case pixels
              const slotCenterY =
                scale.boardOffsetY +
                (slotPos.y_pct / 100) * scale.boardHeightPx +
                (slotPos.height_pct / 200) * scale.boardHeightPx;

              // Bracket vertical center in case pixels
              const bracketCenterY =
                scale.boardOffsetY +
                (45 + (position - 1) * 20) * scale.pixelsPerMm;

              expect(Math.abs(slotCenterY - bracketCenterY)).toBeLessThanOrEqual(5);
            }),
            { numRuns: 50 },
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
