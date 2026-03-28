import type { Motherboard } from "./types";

/**
 * Standard form factor dimensions in mm.
 * Only includes standardized form factors with fixed dimensions.
 * E-ATX, CEB, and others have variable dimensions and require explicit values.
 */
export const FORM_FACTOR_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "ATX":       { width: 305, height: 244 },
  "Micro-ATX": { width: 244, height: 244 },
  "Mini-ITX":  { width: 170, height: 170 },
};

/**
 * Get board dimensions from a motherboard, using explicit dimensions first,
 * falling back to form factor lookup. Returns null when dimensions can't be determined.
 */
export function getBoardDimensions(
  motherboard: Motherboard,
): { widthMm: number; heightMm: number } | null {
  if (motherboard.length_mm != null && motherboard.width_mm != null) {
    return { widthMm: motherboard.length_mm, heightMm: motherboard.width_mm };
  }

  const standard = FORM_FACTOR_DIMENSIONS[motherboard.form_factor];
  if (standard) {
    return { widthMm: standard.width, heightMm: standard.height };
  }

  return null;
}

/**
 * Parse an NVMe form factor string into mm dimensions.
 * First 2 characters = width, remaining characters = length.
 * e.g. "2280" -> { widthMm: 22, lengthMm: 80 }
 *      "22110" -> { widthMm: 22, lengthMm: 110 }
 *      "2242" -> { widthMm: 22, lengthMm: 42 }
 */
export function parseNvmeFormFactor(
  formFactor: string,
): { widthMm: number; lengthMm: number } | null {
  if (formFactor.length < 4 || formFactor.length > 5) {
    return null;
  }

  const widthStr = formFactor.slice(0, 2);
  const lengthStr = formFactor.slice(2);

  const widthMm = parseInt(widthStr, 10);
  const lengthMm = parseInt(lengthStr, 10);

  if (isNaN(widthMm) || isNaN(lengthMm) || widthMm <= 0 || lengthMm <= 0) {
    return null;
  }

  return { widthMm, lengthMm };
}

/**
 * Convert a measurement in mm to a percentage of a board dimension.
 */
export function mmToPct(mm: number, boardDimensionMm: number): number {
  return (mm / boardDimensionMm) * 100;
}
