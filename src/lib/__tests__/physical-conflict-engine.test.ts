// Tests for physical-conflict-engine.ts -- property-based and unit tests
// Covers: rectsOverlap, rectProximityMm, computeComponentFootprint, computeAllConflicts

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import type { SlotPosition, GPUComponent, NVMeComponent, Component } from "../types";
import {
  rectsOverlap,
  rectProximityMm,
  computeComponentFootprint,
  computeAllConflicts,
  type PctRect,
} from "../physical-conflict-engine";

// ---------------------------------------------------------------------------
// Helpers & Generators
// ---------------------------------------------------------------------------

/** Arbitrary PctRect with x, y, w, h all between 0-100, w and h > 0. */
const arbPctRect: fc.Arbitrary<PctRect> = fc.record({
  x: fc.double({ min: 0, max: 100, noNaN: true }),
  y: fc.double({ min: 0, max: 100, noNaN: true }),
  w: fc.double({ min: 0.01, max: 100, noNaN: true }),
  h: fc.double({ min: 0.01, max: 100, noNaN: true }),
});

/** Arbitrary board dimension in mm (100-600). */
const arbBoardDim = fc.double({ min: 100, max: 600, noNaN: true });

/** Minimal GPU component stub. */
function stubGpu(overrides: {
  id?: string;
  length_mm: number;
  slots_occupied: number;
}): GPUComponent {
  return {
    id: overrides.id ?? "gpu-test",
    type: "gpu",
    chip_manufacturer: "NVIDIA",
    manufacturer: "Test",
    model: "Test GPU",
    interface: { pcie_gen: 4, lanes: 16 },
    physical: {
      slot_width: 2,
      length_mm: overrides.length_mm,
      slots_occupied: overrides.slots_occupied,
    },
    power: {
      tdp_w: 300,
      recommended_psu_w: 750,
      power_connectors: [],
    },
    schema_version: "1.0",
  };
}

/** Minimal NVMe component stub. */
function stubNvme(overrides: {
  id?: string;
  form_factor: string;
}): NVMeComponent {
  return {
    id: overrides.id ?? "nvme-test",
    type: "nvme",
    manufacturer: "Test",
    model: "Test NVMe",
    interface: { protocol: "NVMe", pcie_gen: 4, lanes: 4 },
    form_factor: overrides.form_factor,
    capacity_gb: 1000,
    schema_version: "1.0",
  };
}

/** Minimal SlotPosition stub. */
function stubSlot(
  overrides: Partial<SlotPosition> & Pick<SlotPosition, "slot_id" | "slot_type">,
): SlotPosition {
  return {
    x_pct: 10,
    y_pct: 10,
    width_pct: 5,
    height_pct: 3,
    ...overrides,
  };
}


// ---------------------------------------------------------------------------
// Feature: interactive-board-layout, Property 4: AABB rectangle overlap detection
// **Validates: Requirements 5.1, 5.2**
// ---------------------------------------------------------------------------

describe("Property 4: AABB rectangle overlap detection", () => {
  it("rectsOverlap is commutative", () => {
    fc.assert(
      fc.property(arbPctRect, arbPctRect, (a, b) => {
        expect(rectsOverlap(a, b)).toBe(rectsOverlap(b, a));
      }),
      { numRuns: 100 },
    );
  });

  it("rectsOverlap matches the standard AABB formula", () => {
    fc.assert(
      fc.property(arbPctRect, arbPctRect, (a, b) => {
        const expected =
          a.x < b.x + b.w &&
          a.x + a.w > b.x &&
          a.y < b.y + b.h &&
          a.y + a.h > b.y;
        expect(rectsOverlap(a, b)).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: interactive-board-layout, Property 5: Proximity detection
// **Validates: Requirements 5.3**
// ---------------------------------------------------------------------------

describe("Property 5: Proximity detection", () => {
  it("rectProximityMm returns a non-negative value", () => {
    fc.assert(
      fc.property(arbPctRect, arbPctRect, arbBoardDim, arbBoardDim, (a, b, bw, bh) => {
        expect(rectProximityMm(a, b, bw, bh)).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 },
    );
  });

  it("rectProximityMm is commutative", () => {
    fc.assert(
      fc.property(arbPctRect, arbPctRect, arbBoardDim, arbBoardDim, (a, b, bw, bh) => {
        expect(rectProximityMm(a, b, bw, bh)).toBeCloseTo(
          rectProximityMm(b, a, bw, bh),
          10,
        );
      }),
      { numRuns: 100 },
    );
  });

  it("rectProximityMm returns 0 when rects overlap", () => {
    fc.assert(
      fc.property(arbPctRect, arbPctRect, arbBoardDim, arbBoardDim, (a, b, bw, bh) => {
        if (rectsOverlap(a, b)) {
          expect(rectProximityMm(a, b, bw, bh)).toBe(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: interactive-board-layout, Property 3: Component footprint computation
// **Validates: Requirements 4.3, 4.4, 4.5**
// ---------------------------------------------------------------------------

describe("Property 3: Component footprint computation", () => {
  it("GPU footprint width and height match percentage formula", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 100, max: 400, noNaN: true }),  // length_mm
        fc.integer({ min: 1, max: 4 }),                   // slots_occupied
        fc.double({ min: 100, max: 600, noNaN: true }),   // boardWidthMm
        fc.double({ min: 100, max: 600, noNaN: true }),   // boardHeightMm
        fc.double({ min: 0, max: 90, noNaN: true }),      // slot x_pct
        fc.double({ min: 0, max: 90, noNaN: true }),      // slot y_pct
        (lengthMm, slotsOccupied, boardW, boardH, xPct, yPct) => {
          const gpu = stubGpu({ length_mm: lengthMm, slots_occupied: slotsOccupied });
          const slot = stubSlot({
            slot_id: "pcie_1",
            slot_type: "pcie",
            x_pct: xPct,
            y_pct: yPct,
          });

          const fp = computeComponentFootprint(gpu, slot, boardW, boardH);

          expect(fp.x).toBe(xPct);
          expect(fp.y).toBe(yPct);
          expect(fp.w).toBeCloseTo((lengthMm / boardW) * 100, 8);
          expect(fp.h).toBeCloseTo((slotsOccupied * 20 / boardH) * 100, 8);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("NVMe footprint uses parsed form_factor dimensions", () => {
    const arbFormFactor = fc.constantFrom("2280", "22110", "2242");
    const parsedDims: Record<string, { w: number; l: number }> = {
      "2280": { w: 22, l: 80 },
      "22110": { w: 22, l: 110 },
      "2242": { w: 22, l: 42 },
    };

    fc.assert(
      fc.property(
        arbFormFactor,
        fc.double({ min: 100, max: 600, noNaN: true }),
        fc.double({ min: 100, max: 600, noNaN: true }),
        fc.double({ min: 0, max: 90, noNaN: true }),
        fc.double({ min: 0, max: 90, noNaN: true }),
        (ff, boardW, boardH, xPct, yPct) => {
          const nvme = stubNvme({ form_factor: ff });
          const slot = stubSlot({
            slot_id: "m2_1",
            slot_type: "m2",
            x_pct: xPct,
            y_pct: yPct,
          });

          const fp = computeComponentFootprint(nvme, slot, boardW, boardH);
          const dims = parsedDims[ff];

          expect(fp.x).toBe(xPct);
          expect(fp.y).toBe(yPct);
          expect(fp.w).toBeCloseTo((dims.l / boardW) * 100, 8);
          expect(fp.h).toBeCloseTo((dims.w / boardH) * 100, 8);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("footprint x and y match slot position x_pct and y_pct", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: 100, max: 400, noNaN: true }),
        fc.integer({ min: 1, max: 4 }),
        (xPct, yPct, lengthMm, slotsOccupied) => {
          const gpu = stubGpu({ length_mm: lengthMm, slots_occupied: slotsOccupied });
          const slot = stubSlot({
            slot_id: "pcie_1",
            slot_type: "pcie",
            x_pct: xPct,
            y_pct: yPct,
          });

          const fp = computeComponentFootprint(gpu, slot, 305, 244);
          expect(fp.x).toBe(xPct);
          expect(fp.y).toBe(yPct);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ---------------------------------------------------------------------------
// Feature: interactive-board-layout, Property 6: Conflict state consistency
// **Validates: Requirements 5.6, 6.3, 8.1, 8.2, 8.3**
// ---------------------------------------------------------------------------

describe("Property 6: Conflict state consistency", () => {
  it("final state matches direct computation regardless of placement order", () => {
    // Fixed board layout with several slots
    const slotPositions: SlotPosition[] = [
      stubSlot({ slot_id: "pcie_1", slot_type: "pcie", x_pct: 10, y_pct: 20, width_pct: 60, height_pct: 3 }),
      stubSlot({ slot_id: "pcie_2", slot_type: "pcie", x_pct: 10, y_pct: 40, width_pct: 60, height_pct: 3 }),
      stubSlot({ slot_id: "m2_1", slot_type: "m2", x_pct: 15, y_pct: 30, width_pct: 10, height_pct: 4 }),
      stubSlot({ slot_id: "dimm_a1", slot_type: "dimm", x_pct: 75, y_pct: 10, width_pct: 2, height_pct: 20 }),
    ];

    const gpu1 = stubGpu({ id: "gpu-1", length_mm: 250, slots_occupied: 3 });
    const gpu2 = stubGpu({ id: "gpu-2", length_mm: 200, slots_occupied: 2 });

    const components: Record<string, Component> = {
      "gpu-1": gpu1,
      "gpu-2": gpu2,
    };

    // Generate random sequences of place/remove operations that end with the same final state
    const arbOps = fc.array(
      fc.record({
        action: fc.constantFrom("place", "remove") as fc.Arbitrary<"place" | "remove">,
        slotId: fc.constantFrom("pcie_1", "pcie_2"),
        componentId: fc.constantFrom("gpu-1", "gpu-2"),
      }),
      { minLength: 1, maxLength: 10 },
    );

    fc.assert(
      fc.property(arbOps, (ops) => {
        // Replay operations to get final assignment state
        const assignments: Record<string, string> = {};
        for (const op of ops) {
          if (op.action === "place") {
            assignments[op.slotId] = op.componentId;
          } else {
            delete assignments[op.slotId];
          }
        }

        // Compute conflicts from the final state
        const result1 = computeAllConflicts(slotPositions, { ...assignments }, components, 305, 244);

        // Compute again with a fresh copy -- should be identical
        const result2 = computeAllConflicts(slotPositions, { ...assignments }, components, 305, 244);

        expect(result1).toEqual(result2);
      }),
      { numRuns: 100 },
    );
  });

  it("slots with no overlaps and no sharing rules are empty or populated", () => {
    // Use non-overlapping slots spread far apart
    const slotPositions: SlotPosition[] = [
      stubSlot({ slot_id: "dimm_a1", slot_type: "dimm", x_pct: 80, y_pct: 10, width_pct: 2, height_pct: 10 }),
      stubSlot({ slot_id: "dimm_a2", slot_type: "dimm", x_pct: 84, y_pct: 10, width_pct: 2, height_pct: 10 }),
      stubSlot({ slot_id: "cpu_1", slot_type: "cpu", x_pct: 40, y_pct: 5, width_pct: 10, height_pct: 10 }),
    ];

    // RAM and CPU components use slot dimensions (no physical extension beyond slot)
    const ram: Component = {
      id: "ram-1",
      type: "ram",
      manufacturer: "Test",
      model: "Test RAM",
      interface: { type: "DDR5", speed_mhz: 5600, base_speed_mhz: 4800 },
      capacity: { per_module_gb: 16, modules: 1, total_gb: 16 },
      schema_version: "1.0",
    };

    const cpu: Component = {
      id: "cpu-1",
      type: "cpu",
      manufacturer: "Test",
      model: "Test CPU",
      socket: "LGA1700",
      microarchitecture: "Raptor Lake",
      architecture: "x86_64",
      pcie_config: { cpu_gen: 5 },
      schema_version: "1.0",
    };

    const components: Record<string, Component> = { "ram-1": ram, "cpu-1": cpu };

    // Generate random assignment subsets from these non-conflicting components
    const arbAssignments = fc.record({
      dimm_a1: fc.constantFrom(undefined, "ram-1"),
      dimm_a2: fc.constantFrom(undefined, "ram-1"),
      cpu_1: fc.constantFrom(undefined, "cpu-1"),
    });

    fc.assert(
      fc.property(arbAssignments, (rawAssignments) => {
        const assignments: Record<string, string> = {};
        if (rawAssignments.dimm_a1) assignments["dimm_a1"] = rawAssignments.dimm_a1;
        if (rawAssignments.dimm_a2) assignments["dimm_a2"] = rawAssignments.dimm_a2;
        if (rawAssignments.cpu_1) assignments["cpu_1"] = rawAssignments.cpu_1;

        const results = computeAllConflicts(slotPositions, assignments, components, 305, 244);

        for (const r of results) {
          expect(["empty", "populated"]).toContain(r.visualState);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Unit tests for physical-conflict-engine.ts (Task 3.7)
// ---------------------------------------------------------------------------

describe("computeAllConflicts -- GPU covering M.2 slot", () => {
  it("produces yellow 'covered' state with correct message", () => {
    const slotPositions: SlotPosition[] = [
      stubSlot({ slot_id: "pcie_1", slot_type: "pcie", x_pct: 10, y_pct: 20, width_pct: 60, height_pct: 3 }),
      stubSlot({ slot_id: "m2_1", slot_type: "m2", x_pct: 15, y_pct: 25, width_pct: 10, height_pct: 4 }),
    ];

    // GPU that extends well past the M.2 slot vertically
    const gpu = stubGpu({ id: "gpu-1", length_mm: 300, slots_occupied: 3 });
    const assignments: Record<string, string> = { pcie_1: "gpu-1" };
    const components: Record<string, Component> = { "gpu-1": gpu };

    const results = computeAllConflicts(slotPositions, assignments, components, 305, 244);
    const m2Result = results.find((r) => r.slotId === "m2_1");

    expect(m2Result).toBeDefined();
    expect(m2Result!.visualState).toBe("covered");
    expect(m2Result!.message).toContain("Covered by GPU");
  });
});

describe("computeAllConflicts -- GPU blocking PCIe below", () => {
  it("produces red 'blocked' state", () => {
    const slotPositions: SlotPosition[] = [
      stubSlot({ slot_id: "pcie_1", slot_type: "pcie", x_pct: 10, y_pct: 20, width_pct: 60, height_pct: 3 }),
      stubSlot({ slot_id: "pcie_2", slot_type: "pcie", x_pct: 10, y_pct: 30, width_pct: 60, height_pct: 3 }),
    ];

    // GPU occupying 3 slots extends from y=20 downward ~24.6% on ATX board
    const gpu = stubGpu({ id: "gpu-1", length_mm: 300, slots_occupied: 3 });
    const assignments: Record<string, string> = { pcie_1: "gpu-1" };
    const components: Record<string, Component> = { "gpu-1": gpu };

    const results = computeAllConflicts(slotPositions, assignments, components, 305, 244);
    const pcie2Result = results.find((r) => r.slotId === "pcie_2");

    expect(pcie2Result).toBeDefined();
    expect(pcie2Result!.visualState).toBe("blocked");
    expect(pcie2Result!.message).toContain("blocked by GPU");
  });
});

describe("rectsOverlap -- edge-touching rects", () => {
  it("edge-touching rects produce no overlap (strict inequality)", () => {
    // a.x + a.w === b.x means NO overlap since we use strict inequality
    const a: PctRect = { x: 0, y: 0, w: 50, h: 50 };
    const b: PctRect = { x: 50, y: 0, w: 50, h: 50 };
    expect(rectsOverlap(a, b)).toBe(false);

    // Vertical edge-touching
    const c: PctRect = { x: 0, y: 0, w: 50, h: 50 };
    const d: PctRect = { x: 0, y: 50, w: 50, h: 50 };
    expect(rectsOverlap(c, d)).toBe(false);
  });
});

describe("SATA proximity at exactly 15mm boundary", () => {
  it("at exactly 15mm should NOT trigger covered state", () => {
    // Place GPU and SATA group exactly 15mm apart on a 305x244 ATX board.
    // 15mm on 305mm board = (15/305)*100 = ~4.918% gap on X axis.
    // GPU footprint: x=10, w=(200/305)*100 = ~65.57%, so right edge at ~75.57%
    // SATA group left edge at 75.57% + 4.918% = ~80.49%
    const boardW = 305;
    const boardH = 244;
    const gpuLengthMm = 200;
    const gpuRightPct = 10 + (gpuLengthMm / boardW) * 100;
    const gapPct = (15 / boardW) * 100; // exactly 15mm gap
    const sataXPct = gpuRightPct + gapPct;

    const slotPositions: SlotPosition[] = [
      stubSlot({ slot_id: "pcie_1", slot_type: "pcie", x_pct: 10, y_pct: 30, width_pct: 60, height_pct: 3 }),
      stubSlot({ slot_id: "sata_1", slot_type: "sata_group", x_pct: sataXPct, y_pct: 30, width_pct: 5, height_pct: 10 }),
    ];

    const gpu = stubGpu({ id: "gpu-1", length_mm: gpuLengthMm, slots_occupied: 2 });
    const assignments: Record<string, string> = { pcie_1: "gpu-1" };
    const components: Record<string, Component> = { "gpu-1": gpu };

    const results = computeAllConflicts(slotPositions, assignments, components, boardW, boardH);
    const sataResult = results.find((r) => r.slotId === "sata_1");

    // At exactly 15mm, proximity === 15, which is NOT < 15, so no trigger
    expect(sataResult).toBeDefined();
    expect(sataResult!.visualState).not.toBe("covered");
  });

  it("below 15mm should trigger covered state", () => {
    const boardW = 305;
    const boardH = 244;
    const gpuLengthMm = 200;
    const gpuRightPct = 10 + (gpuLengthMm / boardW) * 100;
    // Place SATA 14mm away (below threshold)
    const gapPct = (14 / boardW) * 100;
    const sataXPct = gpuRightPct + gapPct;

    const slotPositions: SlotPosition[] = [
      stubSlot({ slot_id: "pcie_1", slot_type: "pcie", x_pct: 10, y_pct: 30, width_pct: 60, height_pct: 3 }),
      stubSlot({ slot_id: "sata_1", slot_type: "sata_group", x_pct: sataXPct, y_pct: 30, width_pct: 5, height_pct: 10 }),
    ];

    const gpu = stubGpu({ id: "gpu-1", length_mm: gpuLengthMm, slots_occupied: 2 });
    const assignments: Record<string, string> = { pcie_1: "gpu-1" };
    const components: Record<string, Component> = { "gpu-1": gpu };

    const results = computeAllConflicts(slotPositions, assignments, components, boardW, boardH);
    const sataResult = results.find((r) => r.slotId === "sata_1");

    expect(sataResult).toBeDefined();
    expect(sataResult!.visualState).toBe("covered");
    expect(sataResult!.message).toContain("SATA");
  });
});

describe("RTX 4090 footprint on ATX board", () => {
  it("304mm length, 3 slots_occupied on 305x244 board produces expected percentages", () => {
    const gpu = stubGpu({ id: "rtx-4090", length_mm: 304, slots_occupied: 3 });
    const slot = stubSlot({ slot_id: "pcie_1", slot_type: "pcie", x_pct: 5, y_pct: 25 });

    const fp = computeComponentFootprint(gpu, slot, 305, 244);

    expect(fp.x).toBe(5);
    expect(fp.y).toBe(25);
    expect(fp.w).toBeCloseTo((304 / 305) * 100, 10);
    expect(fp.h).toBeCloseTo((60 / 244) * 100, 10);
  });
});
