// Physical conflict detection engine — pure functions, no DOM access.
// Provides AABB-based overlap and proximity detection for board layout.

import { parseNvmeFormFactor } from "./board-dimensions";
import type { Component, SlotPosition, NVMeComponent, GPUComponent } from "./types";

/** A percentage-based rectangle on the board (all values 0-100). */
export interface PctRect {
  x: number; // left edge, 0-100
  y: number; // top edge, 0-100
  w: number; // width, 0-100
  h: number; // height, 0-100
}

/** Color-coded display state for a slot overlay. */
export type VisualState =
  | "empty"
  | "drop-target"
  | "populated"
  | "covered"
  | "blocked"
  | "bandwidth-reduced";

/** Result of conflict detection for a single slot. */
export interface ConflictResult {
  slotId: string;
  visualState: VisualState;
  message: string;
}

/**
 * Standard AABB intersection test. Returns true when two rects share at
 * least one interior point. Commutative: rectsOverlap(a, b) === rectsOverlap(b, a).
 */
export function rectsOverlap(a: PctRect, b: PctRect): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

/**
 * Compute the gap distance in mm between two PctRects on a board.
 * Returns 0 when the rects overlap, otherwise the Euclidean distance
 * between the closest edges converted to mm.
 * Commutative: rectProximityMm(a, b, ...) === rectProximityMm(b, a, ...).
 */
export function rectProximityMm(
  a: PctRect,
  b: PctRect,
  boardWidthMm: number,
  boardHeightMm: number,
): number {
  // Gap on each axis in percentage coordinates (0 when overlapping on that axis)
  const gapXPct = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const gapYPct = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));

  // Convert percentage gaps to mm
  const gapXMm = (gapXPct / 100) * boardWidthMm;
  const gapYMm = (gapYPct / 100) * boardHeightMm;

  return Math.sqrt(gapXMm * gapXMm + gapYMm * gapYMm);
}

/** SATA proximity threshold in mm. */
const SATA_PROXIMITY_THRESHOLD_MM = 15;

/**
 * Returns the set of compatible slot types for a given component type.
 */
export function getCompatibleSlotTypes(
  componentType: Component["type"],
): string[] {
  switch (componentType) {
    case "gpu":
      return ["pcie"];
    case "nvme":
      return ["m2"];
    case "ram":
      return ["dimm"];
    case "cpu":
      return ["cpu"];
    case "sata_ssd":
    case "sata_hdd":
    case "sata_drive":
      return ["sata_group"];
    default:
      return [];
  }
}

/**
 * Maps a sharing rule type to its corresponding visual state.
 */
export function sharingRuleToVisualState(
  ruleType: "bandwidth_split" | "disables",
): VisualState {
  switch (ruleType) {
    case "bandwidth_split":
      return "bandwidth-reduced";
    case "disables":
      return "blocked";
  }
}

/**
 * Compute the physical footprint of a placed component as a PctRect.
 *
 * - GPU: width from physical.length_mm, height from slots_occupied * 20mm
 * - NVMe: dimensions from parsed form_factor string
 * - RAM/CPU/SATA/other: uses slot position dimensions directly
 */
export function computeComponentFootprint(
  component: Component,
  slotPosition: SlotPosition,
  boardWidthMm: number,
  boardHeightMm: number,
): PctRect {
  if (component.type === "gpu") {
    const gpu = component as GPUComponent;
    return {
      x: slotPosition.x_pct,
      y: slotPosition.y_pct,
      w: (gpu.physical.length_mm / boardWidthMm) * 100,
      h: (gpu.physical.slots_occupied * 20 / boardHeightMm) * 100,
    };
  }

  if (component.type === "nvme") {
    const nvme = component as NVMeComponent;
    const parsed = parseNvmeFormFactor(nvme.form_factor);
    if (parsed) {
      return {
        x: slotPosition.x_pct,
        y: slotPosition.y_pct,
        w: (parsed.lengthMm / boardWidthMm) * 100,
        h: (parsed.widthMm / boardHeightMm) * 100,
      };
    }
  }

  // RAM, CPU, SATA, or NVMe with unparseable form factor: use slot dimensions
  return {
    x: slotPosition.x_pct,
    y: slotPosition.y_pct,
    w: slotPosition.width_pct,
    h: slotPosition.height_pct,
  };
}

/**
 * Convert a SlotPosition to a PctRect for overlap/proximity checks.
 */
function slotPositionToRect(sp: SlotPosition): PctRect {
  return {
    x: sp.x_pct,
    y: sp.y_pct,
    w: sp.width_pct,
    h: sp.height_pct,
  };
}

/**
 * Run all conflict checks for the current board state.
 *
 * For each slot position:
 * - If assigned and no conflicts -> "populated"
 * - If unassigned and no conflicts -> "empty"
 * - GPU footprint overlapping M.2 slot -> "covered"
 * - GPU footprint overlapping another PCIe slot -> "blocked"
 * - GPU footprint within 15mm of sata_group -> "covered"
 *
 * Returns a ConflictResult for every slot position.
 */
export function computeAllConflicts(
  slotPositions: SlotPosition[],
  assignments: Record<string, string>,
  components: Record<string, Component>,
  boardWidthMm: number,
  boardHeightMm: number,
): ConflictResult[] {
  // Build footprints for all placed components
  const placedFootprints: {
    slotId: string;
    component: Component;
    footprint: PctRect;
    slotPosition: SlotPosition;
  }[] = [];

  for (const sp of slotPositions) {
    const componentId = assignments[sp.slot_id];
    if (!componentId) continue;
    const component = components[componentId];
    if (!component) continue;

    placedFootprints.push({
      slotId: sp.slot_id,
      component,
      footprint: computeComponentFootprint(component, sp, boardWidthMm, boardHeightMm),
      slotPosition: sp,
    });
  }

  // Evaluate each slot position
  const results: ConflictResult[] = [];

  for (const sp of slotPositions) {
    const slotRect = slotPositionToRect(sp);
    let visualState: VisualState = assignments[sp.slot_id] ? "populated" : "empty";
    let message = "";

    // Check all placed GPU footprints against this slot
    for (const placed of placedFootprints) {
      // Skip checking a slot against its own component
      if (placed.slotId === sp.slot_id) continue;

      if (placed.component.type === "gpu") {
        // GPU overlapping an M.2 slot -> "covered"
        if (sp.slot_type === "m2" && rectsOverlap(placed.footprint, slotRect)) {
          visualState = "covered";
          message = "Covered by GPU -- install M.2 before GPU";
          break;
        }

        // GPU overlapping another PCIe slot -> "blocked"
        if (sp.slot_type === "pcie" && rectsOverlap(placed.footprint, slotRect)) {
          visualState = "blocked";
          message = "Physically blocked by GPU above";
          break;
        }

        // GPU within 15mm of SATA group -> "covered"
        if (sp.slot_type === "sata_group") {
          const proximity = rectProximityMm(
            placed.footprint,
            slotRect,
            boardWidthMm,
            boardHeightMm,
          );
          if (proximity < SATA_PROXIMITY_THRESHOLD_MM) {
            visualState = "covered";
            message = "SATA cables may conflict with GPU";
            break;
          }
        }
      }
    }

    results.push({ slotId: sp.slot_id, visualState, message });
  }

  return results;
}
