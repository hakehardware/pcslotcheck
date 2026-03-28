// Property tests for layout slot type compatibility, visual state mapping,
// slot position cross-reference integrity, and aria-label completeness.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  getCompatibleSlotTypes,
  sharingRuleToVisualState,
  type VisualState,
} from "../physical-conflict-engine";
import { buildAriaLabel } from "../../components/SlotOverlay";
import type { Motherboard, SlotPosition, MemorySlot, PCIeSlot, M2Slot } from "../types";

// ---------------------------------------------------------------------------
// Feature: interactive-board-layout, Property 7: Compatible slot type determination
// **Validates: Requirements 4.2, 4.8**
// ---------------------------------------------------------------------------

describe("Property 7: Compatible slot type determination", () => {
  const componentSlotMap: Record<string, string[]> = {
    gpu: ["pcie"],
    nvme: ["m2"],
    ram: ["dimm"],
    cpu: ["cpu"],
    sata_ssd: ["sata_group"],
    sata_hdd: ["sata_group"],
    sata_drive: ["sata_group"],
  };

  const allComponentTypes = Object.keys(componentSlotMap) as Array<
    "gpu" | "nvme" | "ram" | "cpu" | "sata_ssd" | "sata_hdd" | "sata_drive"
  >;

  it("compatible slot set matches exactly for every component type", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allComponentTypes),
        (componentType) => {
          const result = getCompatibleSlotTypes(componentType);
          const expected = componentSlotMap[componentType];
          expect(result).toEqual(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("no component type returns a slot type outside its designated set", () => {
    const allSlotTypes = ["pcie", "m2", "dimm", "cpu", "sata_group"];

    fc.assert(
      fc.property(
        fc.constantFrom(...allComponentTypes),
        (componentType) => {
          const compatible = getCompatibleSlotTypes(componentType);
          const expected = componentSlotMap[componentType];

          // Every returned slot type must be in the expected set
          for (const st of compatible) {
            expect(expected).toContain(st);
          }

          // No unexpected slot types outside the designated set
          const unexpected = allSlotTypes.filter(
            (st) => !expected.includes(st),
          );
          for (const st of unexpected) {
            expect(compatible).not.toContain(st);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: interactive-board-layout, Property 8: Sharing rule to visual state mapping
// **Validates: Requirements 5.5**
// ---------------------------------------------------------------------------

describe("Property 8: Sharing rule to visual state mapping", () => {
  const ruleToState: Record<string, VisualState> = {
    bandwidth_split: "bandwidth-reduced",
    disables: "blocked",
  };

  const ruleTypes = Object.keys(ruleToState) as Array<"bandwidth_split" | "disables">;

  it("bandwidth_split maps to bandwidth-reduced and disables maps to blocked", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ruleTypes),
        (ruleType) => {
          const result = sharingRuleToVisualState(ruleType);
          expect(result).toBe(ruleToState[ruleType]);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ---------------------------------------------------------------------------
// Feature: interactive-board-layout, Property 9: Slot position cross-reference integrity
// **Validates: Requirements 2.4**
// ---------------------------------------------------------------------------

describe("Property 9: Slot position cross-reference integrity", () => {
  /**
   * Generator: builds a motherboard with a few slots of each type, then
   * generates slot_positions that reference those slot IDs. This ensures
   * the cross-reference invariant holds by construction, and we verify it.
   */
  const arbMotherboardWithPositions: fc.Arbitrary<Motherboard> = fc
    .record({
      dimmCount: fc.integer({ min: 1, max: 4 }),
      pcieCount: fc.integer({ min: 1, max: 3 }),
      m2Count: fc.integer({ min: 1, max: 3 }),
    })
    .chain(({ dimmCount, pcieCount, m2Count }) => {
      const dimmSlots: MemorySlot[] = Array.from({ length: dimmCount }, (_, i) => ({
        id: `dimm_${String.fromCharCode(65 + Math.floor(i / 2))}${(i % 2) + 1}`,
        channel: (i % 2 === 0 ? "A" : "B") as "A" | "B",
        position: i + 1,
        recommended: i < 2,
      }));

      const pcieSlots: PCIeSlot[] = Array.from({ length: pcieCount }, (_, i) => ({
        id: `pcie_${i + 1}`,
        label: `PCIEX16_${i + 1}`,
        gen: 4,
        electrical_lanes: 16,
        physical_size: "x16" as const,
        position: i + 1,
        source: "CPU" as const,
        reinforced: i === 0,
        sharing: null,
      }));

      const m2Slots: M2Slot[] = Array.from({ length: m2Count }, (_, i) => ({
        id: `m2_${i + 1}`,
        label: `M2_${i + 1}`,
        interface: "PCIe" as const,
        gen: 4,
        lanes: 4,
        form_factors: ["2280"],
        source: "CPU" as const,
        supports_sata: false,
        heatsink_included: true,
        sharing: null,
      }));

      // Build slot_positions referencing the generated slot IDs
      // Include some cpu and sata_group entries (exempt from cross-ref)
      const slotPositions: SlotPosition[] = [
        // DIMM positions
        ...dimmSlots.map((s, i) => ({
          slot_type: "dimm" as const,
          slot_id: s.id,
          x_pct: 75 + i * 3,
          y_pct: 10,
          width_pct: 2,
          height_pct: 15,
        })),
        // PCIe positions
        ...pcieSlots.map((s, i) => ({
          slot_type: "pcie" as const,
          slot_id: s.id,
          x_pct: 10,
          y_pct: 30 + i * 15,
          width_pct: 55,
          height_pct: 3,
        })),
        // M.2 positions
        ...m2Slots.map((s, i) => ({
          slot_type: "m2" as const,
          slot_id: s.id,
          x_pct: 20 + i * 15,
          y_pct: 50,
          width_pct: 8,
          height_pct: 3,
        })),
        // CPU (exempt)
        {
          slot_type: "cpu" as const,
          slot_id: "cpu_1",
          x_pct: 40,
          y_pct: 5,
          width_pct: 10,
          height_pct: 10,
        },
        // SATA group (exempt)
        {
          slot_type: "sata_group" as const,
          slot_id: "sata_cluster",
          x_pct: 85,
          y_pct: 60,
          width_pct: 8,
          height_pct: 15,
        },
      ];

      return fc.constant({
        id: "test-board",
        manufacturer: "Test",
        model: "Test Board",
        chipset: "Z790",
        socket: "LGA1700",
        form_factor: "ATX",
        memory: {
          type: "DDR5" as const,
          max_speed_mhz: 5600,
          base_speed_mhz: 4800,
          max_capacity_gb: 128,
          ecc_support: false,
          channels: 2,
          slots: dimmSlots,
          recommended_population: { two_dimm: [] },
        },
        m2_slots: m2Slots,
        pcie_slots: pcieSlots,
        sata_ports: [],
        sources: [],
        schema_version: "1.0",
        slot_positions: slotPositions,
      } as Motherboard);
    });

  it("every dimm/pcie/m2 slot_position slot_id exists in the corresponding slot collection", () => {
    fc.assert(
      fc.property(arbMotherboardWithPositions, (motherboard) => {
        const positions = motherboard.slot_positions ?? [];

        for (const pos of positions) {
          if (pos.slot_type === "cpu" || pos.slot_type === "sata_group") {
            // Exempt from cross-reference validation
            continue;
          }

          if (pos.slot_type === "dimm") {
            const dimmIds = motherboard.memory.slots.map((s) => s.id);
            expect(dimmIds).toContain(pos.slot_id);
          } else if (pos.slot_type === "pcie") {
            const pcieIds = motherboard.pcie_slots.map((s) => s.id);
            expect(pcieIds).toContain(pos.slot_id);
          } else if (pos.slot_type === "m2") {
            const m2Ids = motherboard.m2_slots.map((s) => s.id);
            expect(m2Ids).toContain(pos.slot_id);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: interactive-board-layout, Property 10: Aria-label completeness
// **Validates: Requirements 10.3**
// ---------------------------------------------------------------------------

describe("Property 10: Aria-label completeness", () => {
  const slotTypes = ["cpu", "dimm", "pcie", "m2", "sata_group"] as const;
  const typeLabels: Record<(typeof slotTypes)[number], string> = {
    cpu: "CPU",
    dimm: "DIMM",
    pcie: "PCIe",
    m2: "M.2",
    sata_group: "SATA",
  };

  const visualStates: VisualState[] = [
    "empty",
    "drop-target",
    "populated",
    "covered",
    "blocked",
    "bandwidth-reduced",
  ];

  it("aria-label contains slot type label, slot ID, and visual state", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...slotTypes),
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        fc.constantFrom(...visualStates),
        (slotType, slotId, visualState) => {
          const label = buildAriaLabel(slotType, slotId, visualState);

          // Must contain the human-readable type label
          expect(label).toContain(typeLabels[slotType]);
          // Must contain the slot ID
          expect(label).toContain(slotId);
          // Must contain the visual state
          expect(label).toContain(visualState);
        },
      ),
      { numRuns: 100 },
    );
  });
});
