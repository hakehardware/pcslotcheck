// Unit and property tests for case-scale pure computation module.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  computeCaseScale,
  REFERENCE_CASE_MM,
  CANVAS_PX,
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


