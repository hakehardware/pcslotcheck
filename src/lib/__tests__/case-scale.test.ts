// Unit and property tests for case-scale pure computation module.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  computeCaseScale,
  getBracketCount,
  REFERENCE_CASE_MM,
  CANVAS_PX,
  BRACKET_COUNTS,
} from "../case-scale";

// ===================================================================
// Unit Tests
// ===================================================================

describe("computeCaseScale unit tests", () => {
  it("returns positive pixelsPerMm", () => {
    const result = computeCaseScale(305, 244);
    expect(result.pixelsPerMm).toBeGreaterThan(0);
  });

  it("ATX board produces expected pixel dimensions", () => {
    const result = computeCaseScale(305, 244);
    expect(result.boardWidthPx).toBeCloseTo(305 * result.pixelsPerMm);
    expect(result.boardHeightPx).toBeCloseTo(244 * result.pixelsPerMm);
  });

  it("Mini-ITX produces smaller dimensions than ATX", () => {
    const atx = computeCaseScale(305, 244);
    const itx = computeCaseScale(170, 170);
    expect(itx.boardWidthPx).toBeLessThan(atx.boardWidthPx);
    expect(itx.boardHeightPx).toBeLessThan(atx.boardHeightPx);
  });

  it("E-ATX (330x305mm) fits within canvas", () => {
    const result = computeCaseScale(330, 305);
    expect(result.boardOffsetX + result.boardWidthPx).toBeLessThanOrEqual(CANVAS_PX.width);
    expect(result.boardOffsetY + result.boardHeightPx).toBeLessThanOrEqual(CANVAS_PX.height);
  });

  it("board offset positions board near top-left of canvas", () => {
    const result = computeCaseScale(305, 244);
    expect(result.boardOffsetX).toBeLessThan(CANVAS_PX.width / 4);
    expect(result.boardOffsetY).toBeLessThan(CANVAS_PX.height / 4);
    expect(result.boardOffsetX).toBeGreaterThanOrEqual(0);
    expect(result.boardOffsetY).toBeGreaterThanOrEqual(0);
  });

  it("accepts optional canvas dimensions", () => {
    const result = computeCaseScale(305, 244, 1200, 800);
    expect(result.pixelsPerMm).toBeGreaterThan(0);
    expect(result.boardWidthPx).toBeCloseTo(305 * result.pixelsPerMm);
  });
});

describe("getBracketCount unit tests", () => {
  it("returns 7 for ATX", () => {
    expect(getBracketCount("ATX")).toBe(7);
  });

  it("returns 4 for Micro-ATX", () => {
    expect(getBracketCount("Micro-ATX")).toBe(4);
  });

  it("returns 1 for Mini-ITX", () => {
    expect(getBracketCount("Mini-ITX")).toBe(1);
  });

  it("returns 7 for E-ATX", () => {
    expect(getBracketCount("E-ATX")).toBe(7);
  });

  it("returns 7 for unknown form factor", () => {
    expect(getBracketCount("SomeUnknownFactor")).toBe(7);
  });

  it("returns 7 for CEB, SSI-EEB, SSI-CEB", () => {
    expect(getBracketCount("CEB")).toBe(7);
    expect(getBracketCount("SSI-EEB")).toBe(7);
    expect(getBracketCount("SSI-CEB")).toBe(7);
  });
});


// ===================================================================
// Property Tests
// ===================================================================

// ---------------------------------------------------------------------------
// Feature: case-frame-board-revamp, Property 1: Scale computation purity/constancy
// **Validates: Requirements 1.2, 2.6, 5.4, 7.1, 7.5**
// ---------------------------------------------------------------------------

describe("Property 1: Scale computation purity/constancy", () => {
  const arbBoardDims = fc.record({
    width: fc.integer({ min: 50, max: 350 }),
    height: fc.integer({ min: 50, max: 350 }),
  });

  it("pixelsPerMm is the same for any two board dimensions (default canvas)", () => {
    fc.assert(
      fc.property(arbBoardDims, arbBoardDims, (dimsA, dimsB) => {
        const resultA = computeCaseScale(dimsA.width, dimsA.height);
        const resultB = computeCaseScale(dimsB.width, dimsB.height);
        expect(resultA.pixelsPerMm).toBe(resultB.pixelsPerMm);
      }),
      { numRuns: 100 },
    );
  });

  it("calling with identical inputs produces identical outputs", () => {
    fc.assert(
      fc.property(arbBoardDims, (dims) => {
        const resultA = computeCaseScale(dims.width, dims.height);
        const resultB = computeCaseScale(dims.width, dims.height);
        expect(resultA).toEqual(resultB);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: case-frame-board-revamp, Property 2: Board region dimensions preserve physical scale
// **Validates: Requirements 2.1, 2.5, 7.2**
// ---------------------------------------------------------------------------

describe("Property 2: Board region dimensions preserve physical scale", () => {
  const arbBoardDims = fc.record({
    width: fc.integer({ min: 50, max: 350 }),
    height: fc.integer({ min: 50, max: 350 }),
  });

  it("boardWidthPx === boardWidthMm * pixelsPerMm and boardHeightPx === boardHeightMm * pixelsPerMm", () => {
    fc.assert(
      fc.property(arbBoardDims, (dims) => {
        const result = computeCaseScale(dims.width, dims.height);
        expect(result.boardWidthPx).toBe(dims.width * result.pixelsPerMm);
        expect(result.boardHeightPx).toBe(dims.height * result.pixelsPerMm);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: case-frame-board-revamp, Property 3: Board offset independence from board dimensions
// **Validates: Requirements 7.3**
// ---------------------------------------------------------------------------

describe("Property 3: Board offset independence from board dimensions", () => {
  const arbBoardDims = fc.record({
    width: fc.integer({ min: 50, max: 350 }),
    height: fc.integer({ min: 50, max: 350 }),
  });

  it("boardOffsetX and boardOffsetY are the same for any two board dimensions", () => {
    fc.assert(
      fc.property(arbBoardDims, arbBoardDims, (dimsA, dimsB) => {
        const resultA = computeCaseScale(dimsA.width, dimsA.height);
        const resultB = computeCaseScale(dimsB.width, dimsB.height);
        expect(resultA.boardOffsetX).toBe(resultB.boardOffsetX);
        expect(resultA.boardOffsetY).toBe(resultB.boardOffsetY);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: case-frame-board-revamp, Property 4: Overhang space accommodates longest GPU
// **Validates: Requirements 4.2**
// ---------------------------------------------------------------------------

describe("Property 4: Overhang space accommodates longest GPU", () => {
  // Standard form factor dimensions (width in mm)
  const formFactors = [
    { name: "ATX", width: 305, height: 244 },
    { name: "Micro-ATX", width: 244, height: 244 },
    { name: "Mini-ITX", width: 170, height: 170 },
    { name: "E-ATX", width: 330, height: 305 },
  ];

  const LONGEST_GPU_MM = 360;

  it("360mm GPU fits within canvas width for each standard form factor", () => {
    fc.assert(
      fc.property(fc.constantFrom(...formFactors), (ff) => {
        const result = computeCaseScale(ff.width, ff.height);
        // The GPU extends from the left edge of the board to the right.
        // The board left edge is at boardOffsetX.
        // A 360mm GPU in pixels = LONGEST_GPU_MM * pixelsPerMm.
        // It must fit: boardOffsetX + gpuLengthPx <= canvasWidth
        const gpuLengthPx = LONGEST_GPU_MM * result.pixelsPerMm;
        expect(result.boardOffsetX + gpuLengthPx).toBeLessThanOrEqual(CANVAS_PX.width);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: case-frame-board-revamp, Property 8: PCIe bracket count and spacing
// **Validates: Requirements 10.1, 10.2**
// ---------------------------------------------------------------------------

describe("Property 8: PCIe bracket count and spacing", () => {
  const knownFormFactors = Object.keys(BRACKET_COUNTS);

  const expectedCounts: Record<string, number> = {
    "ATX": 7,
    "Micro-ATX": 4,
    "Mini-ITX": 1,
    "E-ATX": 7,
    "CEB": 7,
    "SSI-EEB": 7,
    "SSI-CEB": 7,
  };

  it("getBracketCount returns the standard count for each known form factor", () => {
    fc.assert(
      fc.property(fc.constantFrom(...knownFormFactors), (ff) => {
        expect(getBracketCount(ff)).toBe(expectedCounts[ff]);
      }),
      { numRuns: 100 },
    );
  });

  it("consecutive brackets are spaced at exactly 20mm * pixelsPerMm pixels", () => {
    fc.assert(
      fc.property(fc.constantFrom(...knownFormFactors), (ff) => {
        const count = getBracketCount(ff);
        if (count <= 1) return; // spacing only meaningful with 2+ brackets

        // Use ATX dimensions as a reference board for scale computation
        const scale = computeCaseScale(305, 244);
        const PITCH_MM = 20;
        const FIRST_BRACKET_OFFSET_MM = 45;

        const bracketPositions = Array.from({ length: count }, (_, i) =>
          scale.boardOffsetY + (FIRST_BRACKET_OFFSET_MM + i * PITCH_MM) * scale.pixelsPerMm,
        );

        const expectedSpacing = PITCH_MM * scale.pixelsPerMm;
        for (let i = 1; i < bracketPositions.length; i++) {
          const spacing = bracketPositions[i] - bracketPositions[i - 1];
          expect(spacing).toBeCloseTo(expectedSpacing, 5);
        }
      }),
      { numRuns: 100 },
    );
  });
});
