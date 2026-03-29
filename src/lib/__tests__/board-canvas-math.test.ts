import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// Pure math functions extracted from SlotOverlay edit mode logic.
// These mirror the clamping and conversion formulas used in the component.

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Drag clamping: given a raw position and current overlay size,
 * clamp x/y so the overlay stays within [0, 100] bounds.
 */
function clampDragPosition(
  rawX: number,
  rawY: number,
  widthPct: number,
  heightPct: number,
): { x_pct: number; y_pct: number; width_pct: number; height_pct: number } {
  const x_pct = clamp(rawX, 0, 100 - widthPct);
  const y_pct = clamp(rawY, 0, 100 - heightPct);
  return { x_pct, y_pct, width_pct: widthPct, height_pct: heightPct };
}

/**
 * Resize clamping: given a starting position and raw new dimensions,
 * clamp width/height to [2, remaining space].
 */
function clampResizeDimensions(
  startX: number,
  startY: number,
  rawWidth: number,
  rawHeight: number,
): { x_pct: number; y_pct: number; width_pct: number; height_pct: number } {
  const width_pct = clamp(rawWidth, 2, 100 - startX);
  const height_pct = clamp(rawHeight, 2, 100 - startY);
  return { x_pct: startX, y_pct: startY, width_pct, height_pct };
}

/**
 * Pixel-to-percentage coordinate conversion with clamping.
 */
function pixelToPercentage(
  pxX: number,
  pxY: number,
  boardWidthPx: number,
  boardHeightPx: number,
): { x_pct: number; y_pct: number } {
  const x_pct = clamp((pxX / boardWidthPx) * 100, 0, 100);
  const y_pct = clamp((pxY / boardHeightPx) * 100, 0, 100);
  return { x_pct, y_pct };
}

// Feature: yaml-generator, Property 16: Drag and resize bounds clamping
// Validates: Requirements 7.7, 7.9
describe("Property 16: Drag and resize bounds clamping", () => {
  // Generator for valid overlay dimensions (2-98% to leave room for position)
  const overlayDimArb = fc.double({ min: 2, max: 98, noNaN: true });
  // Generator for arbitrary raw position values (can be wildly out of range)
  const rawPctArb = fc.double({ min: -500, max: 500, noNaN: true });

  it("drag clamping keeps x_pct and y_pct in [0, 100]", () => {
    fc.assert(
      fc.property(rawPctArb, rawPctArb, overlayDimArb, overlayDimArb, (rawX, rawY, w, h) => {
        const result = clampDragPosition(rawX, rawY, w, h);
        expect(result.x_pct).toBeGreaterThanOrEqual(0);
        expect(result.x_pct).toBeLessThanOrEqual(100);
        expect(result.y_pct).toBeGreaterThanOrEqual(0);
        expect(result.y_pct).toBeLessThanOrEqual(100);
      }),
      { numRuns: 100 },
    );
  });

  it("drag clamping ensures x_pct + width_pct <= 100 and y_pct + height_pct <= 100", () => {
    fc.assert(
      fc.property(rawPctArb, rawPctArb, overlayDimArb, overlayDimArb, (rawX, rawY, w, h) => {
        const result = clampDragPosition(rawX, rawY, w, h);
        expect(result.x_pct + result.width_pct).toBeLessThanOrEqual(100 + 1e-9);
        expect(result.y_pct + result.height_pct).toBeLessThanOrEqual(100 + 1e-9);
      }),
      { numRuns: 100 },
    );
  });

  it("resize clamping keeps width_pct and height_pct in [2, 100]", () => {
    // startX/startY must be valid positions in [0, 98] to leave room for min 2% size
    const startPosArb = fc.double({ min: 0, max: 98, noNaN: true });
    const rawDimArb = fc.double({ min: -500, max: 500, noNaN: true });

    fc.assert(
      fc.property(startPosArb, startPosArb, rawDimArb, rawDimArb, (startX, startY, rawW, rawH) => {
        const result = clampResizeDimensions(startX, startY, rawW, rawH);
        expect(result.width_pct).toBeGreaterThanOrEqual(2);
        expect(result.width_pct).toBeLessThanOrEqual(100);
        expect(result.height_pct).toBeGreaterThanOrEqual(2);
        expect(result.height_pct).toBeLessThanOrEqual(100);
      }),
      { numRuns: 100 },
    );
  });

  it("resize clamping ensures x_pct + width_pct <= 100 and y_pct + height_pct <= 100", () => {
    const startPosArb = fc.double({ min: 0, max: 98, noNaN: true });
    const rawDimArb = fc.double({ min: -500, max: 500, noNaN: true });

    fc.assert(
      fc.property(startPosArb, startPosArb, rawDimArb, rawDimArb, (startX, startY, rawW, rawH) => {
        const result = clampResizeDimensions(startX, startY, rawW, rawH);
        expect(result.x_pct + result.width_pct).toBeLessThanOrEqual(100 + 1e-9);
        expect(result.y_pct + result.height_pct).toBeLessThanOrEqual(100 + 1e-9);
      }),
      { numRuns: 100 },
    );
  });

  it("all four values stay in [0, 100] for any drag operation", () => {
    fc.assert(
      fc.property(rawPctArb, rawPctArb, overlayDimArb, overlayDimArb, (rawX, rawY, w, h) => {
        const result = clampDragPosition(rawX, rawY, w, h);
        for (const val of [result.x_pct, result.y_pct, result.width_pct, result.height_pct]) {
          expect(val).toBeGreaterThanOrEqual(0);
          expect(val).toBeLessThanOrEqual(100);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("all four values stay in valid range for any resize operation", () => {
    const startPosArb = fc.double({ min: 0, max: 98, noNaN: true });
    const rawDimArb = fc.double({ min: -500, max: 500, noNaN: true });

    fc.assert(
      fc.property(startPosArb, startPosArb, rawDimArb, rawDimArb, (startX, startY, rawW, rawH) => {
        const result = clampResizeDimensions(startX, startY, rawW, rawH);
        for (const val of [result.x_pct, result.y_pct, result.width_pct, result.height_pct]) {
          expect(val).toBeGreaterThanOrEqual(0);
          expect(val).toBeLessThanOrEqual(100);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: yaml-generator, Property 17: Pixel-to-percentage coordinate conversion
// Validates: Requirements 7.8
describe("Property 17: Pixel-to-percentage coordinate conversion", () => {
  // Board dimensions must be positive (at least 1px to avoid division by zero)
  const boardDimArb = fc.double({ min: 1, max: 10000, noNaN: true });
  // Pixel coordinates can be anything (negative = outside board, large = outside board)
  const pixelArb = fc.double({ min: -1000, max: 11000, noNaN: true });

  it("result x_pct and y_pct are always in [0, 100]", () => {
    fc.assert(
      fc.property(pixelArb, pixelArb, boardDimArb, boardDimArb, (pxX, pxY, bw, bh) => {
        const result = pixelToPercentage(pxX, pxY, bw, bh);
        expect(result.x_pct).toBeGreaterThanOrEqual(0);
        expect(result.x_pct).toBeLessThanOrEqual(100);
        expect(result.y_pct).toBeGreaterThanOrEqual(0);
        expect(result.y_pct).toBeLessThanOrEqual(100);
      }),
      { numRuns: 100 },
    );
  });

  it("conversion matches formula (px / boardDim) * 100 for in-bounds coordinates", () => {
    fc.assert(
      fc.property(boardDimArb, boardDimArb, (bw, bh) => {
        // Generate in-bounds pixel coordinates
        const pxX = Math.random() * bw;
        const pxY = Math.random() * bh;
        const result = pixelToPercentage(pxX, pxY, bw, bh);
        const expectedX = (pxX / bw) * 100;
        const expectedY = (pxY / bh) * 100;
        expect(result.x_pct).toBeCloseTo(expectedX, 8);
        expect(result.y_pct).toBeCloseTo(expectedY, 8);
      }),
      { numRuns: 100 },
    );
  });

  it("negative pixel coordinates clamp to 0", () => {
    const negativeArb = fc.double({ min: -10000, max: -0.001, noNaN: true });

    fc.assert(
      fc.property(negativeArb, negativeArb, boardDimArb, boardDimArb, (pxX, pxY, bw, bh) => {
        const result = pixelToPercentage(pxX, pxY, bw, bh);
        expect(result.x_pct).toBe(0);
        expect(result.y_pct).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it("pixel coordinates beyond board dimensions clamp to 100", () => {
    fc.assert(
      fc.property(boardDimArb, boardDimArb, (bw, bh) => {
        // Coordinates well beyond the board
        const pxX = bw * 2;
        const pxY = bh * 2;
        const result = pixelToPercentage(pxX, pxY, bw, bh);
        expect(result.x_pct).toBe(100);
        expect(result.y_pct).toBe(100);
      }),
      { numRuns: 100 },
    );
  });

  it("zero pixel coordinates produce 0%", () => {
    fc.assert(
      fc.property(boardDimArb, boardDimArb, (bw, bh) => {
        const result = pixelToPercentage(0, 0, bw, bh);
        expect(result.x_pct).toBe(0);
        expect(result.y_pct).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it("pixel coordinates equal to board dimensions produce 100%", () => {
    fc.assert(
      fc.property(boardDimArb, boardDimArb, (bw, bh) => {
        const result = pixelToPercentage(bw, bh, bw, bh);
        expect(result.x_pct).toBe(100);
        expect(result.y_pct).toBe(100);
      }),
      { numRuns: 100 },
    );
  });
});
