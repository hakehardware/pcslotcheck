// Unit and property tests for BoardView component -- sata_group filtering.

import { describe, it, expect, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import * as fc from "fast-check";
import BoardView from "../BoardView";
import type { Motherboard, SlotPosition } from "@/lib/types";

vi.mock("@dnd-kit/react", () => ({
  useDroppable: () => ({
    ref: () => {},
    isDropTarget: false,
  }),
}));

vi.mock("@/lib/physical-conflict-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/physical-conflict-engine")>();
  return {
    ...actual,
    computeComponentFootprint: () => ({ x: 0, y: 0, w: 10, h: 10 }),
  };
});

// ===================================================================
// Helpers
// ===================================================================

/** Minimal Motherboard object for BoardView props. */
function makeMotherboard(overrides?: Partial<Motherboard>): Motherboard {
  return {
    id: "test-board",
    manufacturer: "TestCo",
    model: "TestBoard",
    chipset: "Z790",
    socket: "LGA1700",
    form_factor: "ATX",
    memory: {
      type: "DDR5",
      max_speed_mhz: 5600,
      base_speed_mhz: 4800,
      max_capacity_gb: 128,
      ecc_support: false,
      channels: 2,
      slots: [],
      recommended_population: { two_dimm: [] },
    },
    m2_slots: [],
    pcie_slots: [],
    sata_ports: [],
    sources: [],
    schema_version: "1.0",
    ...overrides,
  };
}

// ===================================================================
// Generators
// ===================================================================

const SLOT_TYPES_NON_SATA = ["cpu", "dimm", "pcie", "m2"] as const;

/** Generate a single SlotPosition with a given slot_type and unique index. */
function arbSlotPosition(
  slotType: SlotPosition["slot_type"],
  index: number,
): fc.Arbitrary<SlotPosition> {
  return fc.record({
    slot_type: fc.constant(slotType),
    slot_id: fc.constant(`${slotType}_${index}`),
    x_pct: fc.double({ min: 0, max: 80, noNaN: true }),
    y_pct: fc.double({ min: 0, max: 80, noNaN: true }),
    width_pct: fc.double({ min: 1, max: 20, noNaN: true }),
    height_pct: fc.double({ min: 1, max: 20, noNaN: true }),
  });
}

/**
 * Generate an array of SlotPositions that includes at least one sata_group
 * entry mixed with other slot types.
 */
const arbSlotPositionsWithSataGroup: fc.Arbitrary<SlotPosition[]> = fc
  .tuple(
    // 1-4 non-sata slots
    fc.integer({ min: 1, max: 4 }).chain((count) =>
      fc.tuple(
        ...Array.from({ length: count }, (_, i) =>
          fc
            .constantFrom(...SLOT_TYPES_NON_SATA)
            .chain((type) => arbSlotPosition(type, i)),
        ),
      ),
    ),
    // 1-3 sata_group slots
    fc.integer({ min: 1, max: 3 }).chain((count) =>
      fc.tuple(
        ...Array.from({ length: count }, (_, i) =>
          arbSlotPosition("sata_group", i + 100),
        ),
      ),
    ),
  )
  .map(([nonSata, sata]) => [...nonSata, ...sata]);

// ===================================================================
// Unit Tests
// ===================================================================

describe("BoardView unit tests", () => {
  it("filters out sata_group slots from rendering", () => {
    const slots: SlotPosition[] = [
      { slot_type: "pcie", slot_id: "pcie_1", x_pct: 10, y_pct: 30, width_pct: 5, height_pct: 3 },
      { slot_type: "sata_group", slot_id: "sata_group_1", x_pct: 70, y_pct: 80, width_pct: 20, height_pct: 15 },
      { slot_type: "m2", slot_id: "m2_1", x_pct: 40, y_pct: 60, width_pct: 10, height_pct: 2 },
    ];

    const { container } = render(
      <BoardView
        motherboard={makeMotherboard()}
        slotPositions={slots}
        assignments={{}}
        loadedComponents={{}}
        visualStates={{}}
        conflictMessages={{}}
        boardWidthMm={305}
        boardHeightMm={244}
      />,
    );

    // SlotOverlay renders with role="button" and aria-label containing the slot type
    const buttons = container.querySelectorAll("[role='button']");
    const labels = Array.from(buttons).map((b) => b.getAttribute("aria-label") ?? "");

    // pcie_1 and m2_1 should be rendered
    expect(labels.some((l) => l.includes("pcie_1"))).toBe(true);
    expect(labels.some((l) => l.includes("m2_1"))).toBe(true);

    // sata_group_1 should NOT be rendered
    expect(labels.some((l) => l.includes("sata_group_1"))).toBe(false);
  });

  it("preserves I/O panel indicator", () => {
    const { getByText } = render(
      <BoardView
        motherboard={makeMotherboard()}
        slotPositions={[]}
        assignments={{}}
        loadedComponents={{}}
        visualStates={{}}
        conflictMessages={{}}
        boardWidthMm={305}
        boardHeightMm={244}
      />,
    );

    expect(getByText("I/O")).toBeTruthy();
  });

  it("renders with h-full w-full and no aspectRatio style", () => {
    const { container } = render(
      <BoardView
        motherboard={makeMotherboard()}
        slotPositions={[]}
        assignments={{}}
        loadedComponents={{}}
        visualStates={{}}
        conflictMessages={{}}
        boardWidthMm={305}
        boardHeightMm={244}
      />,
    );

    const boardDiv = container.querySelector("[role='img']") as HTMLElement;
    expect(boardDiv).not.toBeNull();
    expect(boardDiv.className).toContain("h-full");
    expect(boardDiv.className).toContain("w-full");
    expect(boardDiv.style.aspectRatio).toBe("");
  });

  it("renders non-sata slot types correctly", () => {
    const slots: SlotPosition[] = [
      { slot_type: "cpu", slot_id: "cpu_1", x_pct: 20, y_pct: 10, width_pct: 8, height_pct: 8 },
      { slot_type: "dimm", slot_id: "dimm_1", x_pct: 60, y_pct: 10, width_pct: 2, height_pct: 15 },
    ];

    const { container } = render(
      <BoardView
        motherboard={makeMotherboard()}
        slotPositions={slots}
        assignments={{}}
        loadedComponents={{}}
        visualStates={{}}
        conflictMessages={{}}
        boardWidthMm={305}
        boardHeightMm={244}
      />,
    );

    const buttons = container.querySelectorAll("[role='button']");
    expect(buttons).toHaveLength(2);
  });
});

// ===================================================================
// Property Tests
// ===================================================================

// ---------------------------------------------------------------------------
// Feature: case-frame-board-revamp, Property 7: sata_group filtered from board rendering
// **Validates: Requirements 9.8**
// ---------------------------------------------------------------------------

describe("Property 7: sata_group filtered from board rendering", () => {
  it("no sata_group entries appear as SlotOverlays, all other types are rendered", () => {
    fc.assert(
      fc.property(arbSlotPositionsWithSataGroup, (slots) => {
        cleanup();
        const { container } = render(
          <BoardView
            motherboard={makeMotherboard()}
            slotPositions={slots}
            assignments={{}}
            loadedComponents={{}}
            visualStates={{}}
            conflictMessages={{}}
            boardWidthMm={305}
            boardHeightMm={244}
          />,
        );

        // SlotOverlay renders with role="button" and aria-label containing the slot_id
        const buttons = container.querySelectorAll("[role='button']");
        const renderedLabels = Array.from(buttons).map(
          (b) => b.getAttribute("aria-label") ?? "",
        );

        const sataSlots = slots.filter((s) => s.slot_type === "sata_group");
        const nonSataSlots = slots.filter((s) => s.slot_type !== "sata_group");

        // No sata_group slot_id should appear in any rendered aria-label
        for (const sataSlot of sataSlots) {
          expect(
            renderedLabels.some((label) => label.includes(sataSlot.slot_id)),
          ).toBe(false);
        }

        // All non-sata slot_ids should appear in rendered aria-labels
        for (const slot of nonSataSlots) {
          expect(
            renderedLabels.some((label) => label.includes(slot.slot_id)),
          ).toBe(true);
        }

        // Total rendered SlotOverlays should equal non-sata count
        expect(buttons).toHaveLength(nonSataSlots.length);
      }),
      { numRuns: 100 },
    );
  });
});
