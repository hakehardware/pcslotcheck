// Case-scale pure computation module.
// Computes the pixel scale factor and board position within a fixed-size
// case canvas, plus PCIe bracket counts per form factor.
//
// Orientation: case laid flat facing the user.
//   Left  = rear (I/O panel, PCIe brackets)
//   Right = front (drive bays, front panel connectors)
//   Top   = top of case
//   Bottom = bottom of case
//
// The motherboard mounts against the rear (left) wall with the I/O shield
// on the left edge. PCIe slots face left toward the rear bracket openings.

/** Reference case interior dimensions in mm (fits E-ATX with overhang margin) */
export const REFERENCE_CASE_MM = { width: 400, height: 380 } as const;

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
const LEFT_MARGIN = 40;    // space for I/O Panel label + PCIe brackets
const RIGHT_MARGIN = 120;  // space for drive bay area + Front Panel label
const TOP_MARGIN = 10;
const BOTTOM_MARGIN = 10;

/**
 * Compute the scale factor and board position within the case canvas.
 *
 * The scale is derived by fitting the reference case interior (400x380mm,
 * large enough for E-ATX + overhang) into the canvas pixel area with
 * margins reserved for labels, brackets, and drive bay.
 *
 * Pure function -- no DOM measurement.
 */
export function computeCaseScale(
  boardWidthMm: number,
  boardHeightMm: number,
  canvasWidthPx: number = CANVAS_PX.width,
  canvasHeightPx: number = CANVAS_PX.height,
): CaseScaleResult {
  // Usable area: subtract margins for labels, brackets, and drive bay
  const usableWidth = canvasWidthPx - LEFT_MARGIN - RIGHT_MARGIN;
  const usableHeight = canvasHeightPx - TOP_MARGIN - BOTTOM_MARGIN;

  // Single scale factor from fitting reference case into usable area
  const pixelsPerMm = Math.min(
    usableWidth / REFERENCE_CASE_MM.width,
    usableHeight / REFERENCE_CASE_MM.height,
  );

  // Board pixel dimensions from physical mm
  const boardWidthPx = boardWidthMm * pixelsPerMm;
  const boardHeightPx = boardHeightMm * pixelsPerMm;

  // Fixed offset: board positioned near top-left of usable area
  // (against the rear wall, near the top of the case)
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
