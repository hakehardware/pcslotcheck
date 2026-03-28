// Case-scale pure computation module.
// Computes the pixel scale factor and board position within a fixed-size
// case canvas, plus PCIe bracket counts per form factor.

/** Reference case interior dimensions in mm (fits E-ATX with overhang margin) */
export const REFERENCE_CASE_MM = { width: 380, height: 400 } as const;

/** Fixed canvas pixel dimensions */
export const CANVAS_PX = { width: 900, height: 660 } as const;

/** PCIe bracket counts per form factor family */
export const BRACKET_COUNTS: Record<string, number> = {
  "ATX": 7,
  "Micro-ATX": 4,
  "Mini-ITX": 1,
  "E-ATX": 7,
  "CEB": 7,
  "SSI-EEB": 7,
  "SSI-CEB": 7,
};

export interface CaseScaleResult {
  /** Pixels per millimeter */
  pixelsPerMm: number;
  /** Board region pixel dimensions */
  boardWidthPx: number;
  boardHeightPx: number;
  /** Board region offset within canvas (pixels from top-left) */
  boardOffsetX: number;
  boardOffsetY: number;
}

// Layout margins (px)
const TOP_MARGIN = 30;    // space for I/O Panel label
const BOTTOM_MARGIN = 30; // space for Front Panel label
const DRIVE_BAY_HEIGHT = 80; // drive bay area at bottom
const LEFT_MARGIN = 10;   // small margin from left label area

/**
 * Compute the scale factor and board position within the case canvas.
 *
 * The scale is derived by fitting the reference case interior (380x400mm,
 * large enough for E-ATX + overhang) into the canvas pixel area with
 * margins reserved for labels and drive bay.
 *
 * Pure function -- no DOM measurement.
 */
export function computeCaseScale(
  boardWidthMm: number,
  boardHeightMm: number,
  canvasWidthPx: number = CANVAS_PX.width,
  canvasHeightPx: number = CANVAS_PX.height,
): CaseScaleResult {
  // Usable area: subtract label margins and drive bay
  const usableWidth = canvasWidthPx;
  const usableHeight = canvasHeightPx - TOP_MARGIN - BOTTOM_MARGIN - DRIVE_BAY_HEIGHT;

  // Single scale factor from fitting reference case into usable area
  const pixelsPerMm = Math.min(
    usableWidth / REFERENCE_CASE_MM.width,
    usableHeight / REFERENCE_CASE_MM.height,
  );

  // Board pixel dimensions from physical mm
  const boardWidthPx = boardWidthMm * pixelsPerMm;
  const boardHeightPx = boardHeightMm * pixelsPerMm;

  // Fixed offset: board positioned near top-left of usable area
  const boardOffsetX = LEFT_MARGIN;
  const boardOffsetY = TOP_MARGIN;

  return {
    pixelsPerMm,
    boardWidthPx,
    boardHeightPx,
    boardOffsetX,
    boardOffsetY,
  };
}

/**
 * Get the number of PCIe bracket slots for a form factor.
 * Defaults to 7 if form factor is unknown.
 */
export function getBracketCount(formFactor: string): number {
  return BRACKET_COUNTS[formFactor] ?? 7;
}
