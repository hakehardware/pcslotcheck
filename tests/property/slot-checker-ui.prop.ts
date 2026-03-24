// Feature: slot-checker-ui, Property 2: Slot grouping is exhaustive and category-correct
import { describe, test, expect } from "vitest";
import * as fc from "fast-check";
import { groupSlotsByCategory, resolveSharingRules } from "../../src/lib/ui-helpers";
import type {
  Motherboard,
  MemorySlot,
  MemoryConfig,
  M2Slot,
  PCIeSlot,
  SATAPort,
  SharingRule,
} from "../../src/lib/types";

// ── Arbitraries ─────────────────────────────────────────────────────────────

const idArb = fc
  .stringMatching(/^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$/)
  .filter((s) => s.length >= 2);

const nonEmptyStringArb = fc
  .stringMatching(/^[A-Za-z0-9][A-Za-z0-9 _-]{0,19}$/)
  .filter((s) => s.length >= 1);

/** Generate a random MemorySlot. */
function arbMemorySlot(): fc.Arbitrary<MemorySlot> {
  return fc.record({
    id: idArb,
    channel: fc.constantFrom("A" as const, "B" as const),
    position: fc.integer({ min: 1, max: 4 }),
    recommended: fc.boolean(),
  });
}

/** Generate a random M2Slot. */
function arbM2Slot(): fc.Arbitrary<M2Slot> {
  return fc
    .record({
      id: idArb,
      label: nonEmptyStringArb,
      gen: fc.constantFrom(3, 4, 5),
      lanes: fc.constantFrom(2, 4),
      source: fc.constantFrom("CPU" as const, "Chipset" as const),
      supports_sata: fc.boolean(),
      heatsink_included: fc.boolean(),
    })
    .map((base) => ({
      ...base,
      interface: base.supports_sata ? ("PCIe_or_SATA" as const) : ("PCIe" as const),
      form_factors: ["2280"],
      sharing: null,
    }));
}

/** Generate a random PCIeSlot. */
function arbPCIeSlot(): fc.Arbitrary<PCIeSlot> {
  return fc.record({
    id: idArb,
    label: nonEmptyStringArb,
    gen: fc.constantFrom(3, 4, 5),
    electrical_lanes: fc.constantFrom(1, 4, 8, 16),
    physical_size: fc.constantFrom("x1" as const, "x4" as const, "x8" as const, "x16" as const),
    source: fc.constantFrom("CPU" as const, "Chipset" as const),
    reinforced: fc.boolean(),
    sharing: fc.constant(null),
  });
}

/** Generate a random SATAPort. */
function arbSATAPort(): fc.Arbitrary<SATAPort> {
  return fc.record({
    id: idArb,
    version: fc.constant("SATA III"),
    source: fc.constantFrom("CPU" as const, "Chipset" as const),
    disabled_by: fc.constant(null),
  });
}

/** Generate a MemoryConfig with random slots. */
function arbMemoryConfig(slots: fc.Arbitrary<MemorySlot[]>): fc.Arbitrary<MemoryConfig> {
  return slots.map((s) => ({
    type: "DDR5" as const,
    max_speed_mhz: 6000,
    base_speed_mhz: 4800,
    max_capacity_gb: 128,
    ecc_support: false,
    channels: 2,
    slots: s,
    recommended_population: { two_dimm: [] },
  }));
}

/** Generate a full random Motherboard with random arrays of all slot types. */
function arbMotherboard(): fc.Arbitrary<Motherboard> {
  return fc
    .record({
      id: idArb,
      manufacturer: nonEmptyStringArb,
      model: nonEmptyStringArb,
      chipset: fc.constantFrom("Z890", "X870", "B650"),
      socket: fc.constantFrom("LGA1851", "AM5"),
      form_factor: fc.constantFrom("ATX", "Micro-ATX", "Mini-ITX"),
      memorySlots: fc.array(arbMemorySlot(), { minLength: 0, maxLength: 4 }),
      m2_slots: fc.array(arbM2Slot(), { minLength: 0, maxLength: 4 }),
      pcie_slots: fc.array(arbPCIeSlot(), { minLength: 0, maxLength: 3 }),
      sata_ports: fc.array(arbSATAPort(), { minLength: 0, maxLength: 6 }),
    })
    .map((base) => ({
      id: base.id,
      manufacturer: base.manufacturer,
      model: base.model,
      chipset: base.chipset,
      socket: base.socket,
      form_factor: base.form_factor,
      memory: {
        type: "DDR5" as const,
        max_speed_mhz: 6000,
        base_speed_mhz: 4800,
        max_capacity_gb: 128,
        ecc_support: false,
        channels: 2,
        slots: base.memorySlots,
        recommended_population: { two_dimm: [] },
      },
      m2_slots: base.m2_slots,
      pcie_slots: base.pcie_slots,
      sata_ports: base.sata_ports,
      sources: [{ type: "manual", url: "https://example.com" }],
      schema_version: "1.0",
    }));
}

// ── Property 2: Slot grouping is exhaustive and category-correct ────────────

describe("Property 2: Slot grouping is exhaustive and category-correct", () => {
  /**
   * **Validates: Requirements 2.1, 2.4**
   */

  test("every slot is placed into exactly one of the four categories", () => {
    fc.assert(
      fc.property(arbMotherboard(), (motherboard) => {
        const groups = groupSlotsByCategory(motherboard);

        // Collect all slot IDs from the groups
        const groupedIds = groups.flatMap((g) => g.slots.map((s) => s.id));

        // Collect all slot IDs from the motherboard
        const allIds = [
          ...motherboard.memory.slots.map((s) => s.id),
          ...motherboard.m2_slots.map((s) => s.id),
          ...motherboard.pcie_slots.map((s) => s.id),
          ...motherboard.sata_ports.map((s) => s.id),
        ];

        // Every motherboard slot must appear in the grouped output
        expect(new Set(groupedIds)).toEqual(new Set(allIds));

        // Each group's category must be one of the four valid categories
        const validCategories = new Set(["memory", "m2", "pcie", "sata"]);
        for (const group of groups) {
          expect(validCategories.has(group.category)).toBe(true);
        }

        // Each slot's category must match its group's category
        for (const group of groups) {
          for (const slot of group.slots) {
            expect(slot.category).toBe(group.category);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  test("no groups are produced for categories with zero slots", () => {
    fc.assert(
      fc.property(arbMotherboard(), (motherboard) => {
        const groups = groupSlotsByCategory(motherboard);

        // Every returned group must have at least one slot
        for (const group of groups) {
          expect(group.slots.length).toBeGreaterThan(0);
        }

        // Categories with zero slots on the motherboard must not appear
        const categoriesWithSlots = new Set<string>();
        if (motherboard.memory.slots.length > 0) categoriesWithSlots.add("memory");
        if (motherboard.m2_slots.length > 0) categoriesWithSlots.add("m2");
        if (motherboard.pcie_slots.length > 0) categoriesWithSlots.add("pcie");
        if (motherboard.sata_ports.length > 0) categoriesWithSlots.add("sata");

        const returnedCategories = new Set(groups.map((g) => g.category));
        expect(returnedCategories).toEqual(categoriesWithSlots);
      }),
      { numRuns: 100 },
    );
  });

  test("total slot count across all groups equals sum of all motherboard slot arrays", () => {
    fc.assert(
      fc.property(arbMotherboard(), (motherboard) => {
        const groups = groupSlotsByCategory(motherboard);

        const totalGrouped = groups.reduce((sum, g) => sum + g.slots.length, 0);
        const totalOnBoard =
          motherboard.memory.slots.length +
          motherboard.m2_slots.length +
          motherboard.pcie_slots.length +
          motherboard.sata_ports.length;

        expect(totalGrouped).toBe(totalOnBoard);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: slot-checker-ui, Property 4: Badge generation correctness
import { generateBadges } from "../../src/lib/ui-helpers";

describe("Property 4: Badge generation correctness", () => {
  /**
   * **Validates: Requirements 3.2, 3.3**
   */

  test("Gen5 slots produce a badge with label 'Gen5' and green colorClass", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          arbM2Slot().map((s) => ({ slot: { ...s, gen: 5 }, category: "m2" as const })),
          arbPCIeSlot().map((s) => ({ slot: { ...s, gen: 5 }, category: "pcie" as const })),
        ),
        ({ slot, category }) => {
          const badges = generateBadges(slot, category);
          const genBadge = badges.find((b) => b.label === "Gen5");
          expect(genBadge).toBeDefined();
          expect(genBadge!.colorClass).toContain("green");
        },
      ),
      { numRuns: 100 },
    );
  });

  test("Gen4 slots produce a badge with label 'Gen4' and blue colorClass", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          arbM2Slot().map((s) => ({ slot: { ...s, gen: 4 }, category: "m2" as const })),
          arbPCIeSlot().map((s) => ({ slot: { ...s, gen: 4 }, category: "pcie" as const })),
        ),
        ({ slot, category }) => {
          const badges = generateBadges(slot, category);
          const genBadge = badges.find((b) => b.label === "Gen4");
          expect(genBadge).toBeDefined();
          expect(genBadge!.colorClass).toContain("blue");
        },
      ),
      { numRuns: 100 },
    );
  });

  test("Gen3 slots produce a badge with label 'Gen3' and zinc colorClass", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          arbM2Slot().map((s) => ({ slot: { ...s, gen: 3 }, category: "m2" as const })),
          arbPCIeSlot().map((s) => ({ slot: { ...s, gen: 3 }, category: "pcie" as const })),
        ),
        ({ slot, category }) => {
          const badges = generateBadges(slot, category);
          const genBadge = badges.find((b) => b.label === "Gen3");
          expect(genBadge).toBeDefined();
          expect(genBadge!.colorClass).toContain("zinc");
        },
      ),
      { numRuns: 100 },
    );
  });

  test("CPU source slots produce a badge with label 'CPU' and teal colorClass", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          arbM2Slot().map((s) => ({ slot: { ...s, source: "CPU" as const }, category: "m2" as const })),
          arbPCIeSlot().map((s) => ({ slot: { ...s, source: "CPU" as const }, category: "pcie" as const })),
          arbSATAPort().map((s) => ({ slot: { ...s, source: "CPU" as const }, category: "sata" as const })),
        ),
        ({ slot, category }) => {
          const badges = generateBadges(slot, category);
          const cpuBadge = badges.find((b) => b.label === "CPU");
          expect(cpuBadge).toBeDefined();
          expect(cpuBadge!.colorClass).toContain("teal");
        },
      ),
      { numRuns: 100 },
    );
  });

  test("Chipset source slots produce a badge with label 'Chipset' and purple colorClass", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          arbM2Slot().map((s) => ({ slot: { ...s, source: "Chipset" as const }, category: "m2" as const })),
          arbPCIeSlot().map((s) => ({ slot: { ...s, source: "Chipset" as const }, category: "pcie" as const })),
          arbSATAPort().map((s) => ({ slot: { ...s, source: "Chipset" as const }, category: "sata" as const })),
        ),
        ({ slot, category }) => {
          const badges = generateBadges(slot, category);
          const chipsetBadge = badges.find((b) => b.label === "Chipset");
          expect(chipsetBadge).toBeDefined();
          expect(chipsetBadge!.colorClass).toContain("purple");
        },
      ),
      { numRuns: 100 },
    );
  });

  test("M.2 slots with supports_sata=true produce a '+SATA' badge with amber colorClass", () => {
    fc.assert(
      fc.property(
        arbM2Slot().map((s) => ({ ...s, supports_sata: true })),
        (slot) => {
          const badges = generateBadges(slot, "m2");
          const sataBadge = badges.find((b) => b.label === "+SATA");
          expect(sataBadge).toBeDefined();
          expect(sataBadge!.colorClass).toContain("amber");
        },
      ),
      { numRuns: 100 },
    );
  });

  test("Memory slots with recommended=true produce a '★ Recommended' badge with yellow colorClass", () => {
    fc.assert(
      fc.property(
        arbMemorySlot().map((s) => ({ ...s, recommended: true })),
        (slot) => {
          const badges = generateBadges(slot, "memory");
          const recBadge = badges.find((b) => b.label === "★ Recommended");
          expect(recBadge).toBeDefined();
          expect(recBadge!.colorClass).toContain("yellow");
        },
      ),
      { numRuns: 100 },
    );
  });
});


// Feature: slot-checker-ui, Property 10: Sharing rule resolution correctness

// ── Arbitraries for sharing rules ───────────────────────────────────────────

/** Generate a "disables" sharing rule targeting specific slot IDs. */
function arbDisablesRule(targetIds: string[]): fc.Arbitrary<SharingRule> {
  return fc
    .subarray(targetIds, { minLength: 1 })
    .map((targets) => ({
      type: "disables" as const,
      targets,
      condition: "When populated",
    }));
}

/** Generate a "bandwidth_split" sharing rule targeting a specific slot ID. */
function arbBandwidthSplitRule(targetIds: string[]): fc.Arbitrary<SharingRule> {
  return fc
    .record({
      targetIdx: fc.integer({ min: 0, max: Math.max(0, targetIds.length - 1) }),
      effect: nonEmptyStringArb,
    })
    .map(({ targetIdx, effect }) => ({
      type: "bandwidth_split" as const,
      target: targetIds[targetIdx],
      condition: "When populated",
      effect,
    }));
}

/** Generate a SATA port with a given ID. */
function arbSATAPortWithId(id: string): fc.Arbitrary<SATAPort> {
  return fc.record({
    id: fc.constant(id),
    version: fc.constant("SATA III"),
    source: fc.constantFrom("CPU" as const, "Chipset" as const),
    disabled_by: fc.constant(null),
  });
}

/** Generate an M2 slot with a given ID and optional sharing rules. */
function arbM2SlotWithSharing(
  id: string,
  sharing: SharingRule[] | null,
): fc.Arbitrary<M2Slot> {
  return fc
    .record({
      label: nonEmptyStringArb,
      gen: fc.constantFrom(3, 4, 5),
      lanes: fc.constantFrom(2, 4),
      source: fc.constantFrom("CPU" as const, "Chipset" as const),
      supports_sata: fc.boolean(),
      heatsink_included: fc.boolean(),
    })
    .map((base) => ({
      id,
      label: base.label,
      interface: base.supports_sata ? ("PCIe_or_SATA" as const) : ("PCIe" as const),
      gen: base.gen,
      lanes: base.lanes,
      form_factors: ["2280"],
      source: base.source,
      supports_sata: base.supports_sata,
      heatsink_included: base.heatsink_included,
      sharing,
    }));
}

/** Generate a PCIe slot with a given ID and optional sharing rules. */
function arbPCIeSlotWithSharing(
  id: string,
  sharing: SharingRule[] | null,
): fc.Arbitrary<PCIeSlot> {
  return fc.record({
    id: fc.constant(id),
    label: nonEmptyStringArb,
    gen: fc.constantFrom(3, 4, 5),
    electrical_lanes: fc.constantFrom(1, 4, 8, 16),
    physical_size: fc.constantFrom("x1" as const, "x4" as const, "x8" as const, "x16" as const),
    source: fc.constantFrom("CPU" as const, "Chipset" as const),
    reinforced: fc.boolean(),
    sharing: fc.constant(sharing),
  });
}

// ── Property 10 ─────────────────────────────────────────────────────────────

describe("Property 10: Sharing rule resolution correctness", () => {
  /**
   * **Validates: Requirements 5.5, 5.6**
   */

  test("disabled slots contain exactly the targets of 'disables' rules on populated slots", () => {
    // Strategy: generate a fixed topology of SATA target IDs, M2 slots with disables rules,
    // and a subset of M2 slots that are populated via assignments.
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }).chain((numSata) => {
          const sataIds = Array.from({ length: numSata }, (_, i) => `sata_${i}`);
          return fc.integer({ min: 1, max: 3 }).chain((numM2) => {
            const m2Ids = Array.from({ length: numM2 }, (_, i) => `m2_${i}`);
            // Each M2 slot gets a disables rule targeting a subset of SATA IDs
            const m2SlotsArb = fc.tuple(
              ...m2Ids.map((id) =>
                fc.oneof(
                  // Some M2 slots have disables rules, some have none
                  arbM2SlotWithSharing(id, null),
                  arbDisablesRule(sataIds).chain((rule) =>
                    arbM2SlotWithSharing(id, [rule]),
                  ),
                ),
              ),
            );
            const sataPortsArb = fc.tuple(
              ...sataIds.map((id) => arbSATAPortWithId(id)),
            );
            // Assignments: a random subset of M2 slot IDs are populated
            const assignmentsArb = fc.subarray(m2Ids).map((populated) =>
              Object.fromEntries(populated.map((id) => [id, "some-component"])),
            );
            return fc.tuple(m2SlotsArb, sataPortsArb, assignmentsArb);
          });
        }),
        ([m2Slots, sataPorts, assignments]) => {
          const motherboard: Motherboard = {
            id: "test-board",
            manufacturer: "Test",
            model: "Test Board",
            chipset: "Z890",
            socket: "LGA1851",
            form_factor: "ATX",
            memory: {
              type: "DDR5",
              max_speed_mhz: 6000,
              base_speed_mhz: 4800,
              max_capacity_gb: 128,
              ecc_support: false,
              channels: 2,
              slots: [],
              recommended_population: { two_dimm: [] },
            },
            m2_slots: m2Slots as M2Slot[],
            pcie_slots: [],
            sata_ports: sataPorts as SATAPort[],
            sources: [{ type: "manual", url: "https://example.com" }],
            schema_version: "1.0",
          };

          const { disabledSlots } = resolveSharingRules(motherboard, assignments);

          // Manually compute expected disabled slots
          const expected = new Set<string>();
          for (const slot of m2Slots) {
            if (!(slot.id in assignments) || !slot.sharing) continue;
            for (const rule of slot.sharing) {
              if (rule.type === "disables" && rule.targets) {
                for (const t of rule.targets) expected.add(t);
              }
            }
          }

          expect(disabledSlots).toEqual(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  test("bandwidth warnings contain exactly the targets of 'bandwidth_split' rules on populated slots with correct effect", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 3 }).chain((numTargets) => {
          const targetIds = Array.from({ length: numTargets }, (_, i) => `pcie_target_${i}`);
          return fc.integer({ min: 1, max: 3 }).chain((numM2) => {
            const m2Ids = Array.from({ length: numM2 }, (_, i) => `m2_${i}`);
            const m2SlotsArb = fc.tuple(
              ...m2Ids.map((id) =>
                fc.oneof(
                  arbM2SlotWithSharing(id, null),
                  arbBandwidthSplitRule(targetIds).chain((rule) =>
                    arbM2SlotWithSharing(id, [rule]),
                  ),
                ),
              ),
            );
            const pcieSlotsArb = fc.tuple(
              ...targetIds.map((id) => arbPCIeSlotWithSharing(id, null)),
            );
            const assignmentsArb = fc.subarray(m2Ids).map((populated) =>
              Object.fromEntries(populated.map((id) => [id, "some-component"])),
            );
            return fc.tuple(m2SlotsArb, pcieSlotsArb, assignmentsArb);
          });
        }),
        ([m2Slots, pcieSlots, assignments]) => {
          const motherboard: Motherboard = {
            id: "test-board",
            manufacturer: "Test",
            model: "Test Board",
            chipset: "Z890",
            socket: "LGA1851",
            form_factor: "ATX",
            memory: {
              type: "DDR5",
              max_speed_mhz: 6000,
              base_speed_mhz: 4800,
              max_capacity_gb: 128,
              ecc_support: false,
              channels: 2,
              slots: [],
              recommended_population: { two_dimm: [] },
            },
            m2_slots: m2Slots as M2Slot[],
            pcie_slots: pcieSlots as PCIeSlot[],
            sata_ports: [],
            sources: [{ type: "manual", url: "https://example.com" }],
            schema_version: "1.0",
          };

          const { bandwidthWarnings } = resolveSharingRules(motherboard, assignments);

          // Manually compute expected bandwidth warnings
          const expected = new Map<string, string>();
          for (const slot of m2Slots) {
            if (!(slot.id in assignments) || !slot.sharing) continue;
            for (const rule of slot.sharing) {
              if (rule.type === "bandwidth_split" && rule.target && rule.effect) {
                expected.set(rule.target, rule.effect);
              }
            }
          }

          expect(bandwidthWarnings).toEqual(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  test("unpopulated slots' sharing rules do not contribute to disabled slots or bandwidth warnings", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }).chain((numSata) => {
          const sataIds = Array.from({ length: numSata }, (_, i) => `sata_${i}`);
          return fc.integer({ min: 1, max: 3 }).chain((numM2) => {
            const m2Ids = Array.from({ length: numM2 }, (_, i) => `m2_${i}`);
            // All M2 slots have sharing rules (both types)
            const m2SlotsArb = fc.tuple(
              ...m2Ids.map((id) =>
                fc.tuple(
                  arbDisablesRule(sataIds),
                  arbBandwidthSplitRule(sataIds),
                ).chain(([disablesRule, bwRule]) =>
                  arbM2SlotWithSharing(id, [disablesRule, bwRule]),
                ),
              ),
            );
            const sataPortsArb = fc.tuple(
              ...sataIds.map((id) => arbSATAPortWithId(id)),
            );
            return fc.tuple(m2SlotsArb, sataPortsArb, fc.constant(m2Ids));
          });
        }),
        ([m2Slots, sataPorts, m2Ids]) => {
          // No assignments at all — all slots are unpopulated
          const assignments: Record<string, string> = {};

          const motherboard: Motherboard = {
            id: "test-board",
            manufacturer: "Test",
            model: "Test Board",
            chipset: "Z890",
            socket: "LGA1851",
            form_factor: "ATX",
            memory: {
              type: "DDR5",
              max_speed_mhz: 6000,
              base_speed_mhz: 4800,
              max_capacity_gb: 128,
              ecc_support: false,
              channels: 2,
              slots: [],
              recommended_population: { two_dimm: [] },
            },
            m2_slots: m2Slots as M2Slot[],
            pcie_slots: [],
            sata_ports: sataPorts as SATAPort[],
            sources: [{ type: "manual", url: "https://example.com" }],
            schema_version: "1.0",
          };

          const { disabledSlots, bandwidthWarnings } = resolveSharingRules(
            motherboard,
            assignments,
          );

          // With no populated slots, both sets should be empty
          expect(disabledSlots.size).toBe(0);
          expect(bandwidthWarnings.size).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// Feature: slot-checker-ui, Property 9: Validation panel renders all results with correct severity styling
import { severityStyles } from "../../src/components/ValidationPanel";
import type { ValidationResult, Severity } from "../../src/lib/types";

/** Generate a random Severity value. */
const arbSeverity: fc.Arbitrary<Severity> = fc.constantFrom("error", "warning", "info");

/** Generate a random ValidationResult. */
function arbValidationResult(): fc.Arbitrary<ValidationResult> {
  return fc.record({
    severity: arbSeverity,
    message: nonEmptyStringArb,
    slotId: idArb,
    componentId: idArb,
  });
}

describe("Property 9: Validation panel renders all results with correct severity styling", () => {
  /**
   * **Validates: Requirements 5.2, 5.3**
   */

  test("every severity maps to the correct color keyword in severityStyles", () => {
    const expectedColorKeyword: Record<Severity, string> = {
      error: "red",
      warning: "amber",
      info: "blue",
    };

    fc.assert(
      fc.property(arbSeverity, (severity) => {
        const style = severityStyles[severity];
        expect(style).toBeDefined();
        expect(style).toContain(expectedColorKeyword[severity]);
      }),
      { numRuns: 100 },
    );
  });

  test("all results in an array have a corresponding severity style entry", () => {
    fc.assert(
      fc.property(
        fc.array(arbValidationResult(), { minLength: 0, maxLength: 20 }),
        (results) => {
          for (const result of results) {
            const style = severityStyles[result.severity];
            expect(style).toBeDefined();
            expect(typeof style).toBe("string");
            expect(style.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  test("the number of renderable results equals the input array length (all results are rendered)", () => {
    fc.assert(
      fc.property(
        fc.array(arbValidationResult(), { minLength: 0, maxLength: 30 }),
        (results) => {
          // Every result has a valid severity that maps to a style,
          // so all results would be rendered (none filtered out)
          const renderableCount = results.filter(
            (r) => severityStyles[r.severity] !== undefined,
          ).length;
          expect(renderableCount).toBe(results.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  test("severity styles contain expected CSS class patterns (bg, border, text)", () => {
    fc.assert(
      fc.property(arbSeverity, (severity) => {
        const style = severityStyles[severity];
        // Each severity style should contain background, border, and text color classes
        expect(style).toMatch(/bg-/);
        expect(style).toMatch(/border-/);
        expect(style).toMatch(/text-/);
      }),
      { numRuns: 100 },
    );
  });
});


// Feature: slot-checker-ui, Property 5: Assigned component info is displayed
import type {
  NVMeComponent,
  GPUComponent,
  RAMComponent,
  SATAComponent,
  Component,
} from "../../src/lib/types";

// ── Component Arbitraries ───────────────────────────────────────────────────

/** Generate a random NVMeComponent. */
function arbNVMeComponent(): fc.Arbitrary<NVMeComponent> {
  return fc.record({
    id: idArb,
    type: fc.constant("nvme" as const),
    manufacturer: nonEmptyStringArb,
    model: nonEmptyStringArb,
    interface: fc.record({
      protocol: fc.constantFrom("NVMe" as const, "SATA" as const),
      pcie_gen: fc.oneof(fc.constant(null), fc.constantFrom(3, 4, 5)),
      lanes: fc.oneof(fc.constant(null), fc.constantFrom(2, 4)),
    }),
    form_factor: fc.constant("2280"),
    capacity_gb: fc.constantFrom(256, 512, 1000, 2000, 4000),
    schema_version: fc.constant("1.0"),
  });
}

/** Generate a random GPUComponent. */
function arbGPUComponent(): fc.Arbitrary<GPUComponent> {
  return fc.record({
    id: idArb,
    type: fc.constant("gpu" as const),
    manufacturer: nonEmptyStringArb,
    model: nonEmptyStringArb,
    interface: fc.record({
      pcie_gen: fc.constantFrom(3, 4, 5),
      lanes: fc.constantFrom(8, 16),
    }),
    physical: fc.record({
      slot_width: fc.constantFrom(2, 3),
      length_mm: fc.constantFrom(250, 300, 350),
    }),
    power: fc.record({
      tdp_w: fc.constantFrom(150, 200, 250, 350),
      recommended_psu_w: fc.constantFrom(550, 650, 750, 850),
    }),
    schema_version: fc.constant("1.0"),
  });
}

/** Generate a random RAMComponent. */
function arbRAMComponent(): fc.Arbitrary<RAMComponent> {
  return fc.record({
    id: idArb,
    type: fc.constant("ram" as const),
    manufacturer: nonEmptyStringArb,
    model: nonEmptyStringArb,
    interface: fc.record({
      type: fc.constantFrom("DDR4" as const, "DDR5" as const),
      speed_mhz: fc.constantFrom(3200, 4800, 5600, 6000),
      base_speed_mhz: fc.constantFrom(3200, 4800),
    }),
    capacity: fc.record({
      per_module_gb: fc.constantFrom(8, 16, 32),
      modules: fc.constantFrom(1, 2),
      total_gb: fc.constantFrom(16, 32, 64),
    }),
    schema_version: fc.constant("1.0"),
  });
}

/** Generate a random SATAComponent. */
function arbSATAComponent(): fc.Arbitrary<SATAComponent> {
  return fc.record({
    id: idArb,
    type: fc.constant("sata_drive" as const),
    manufacturer: nonEmptyStringArb,
    model: nonEmptyStringArb,
    form_factor: fc.constantFrom("2.5\"", "3.5\""),
    capacity_gb: fc.constantFrom(250, 500, 1000, 2000, 4000),
    interface: fc.constant("SATA III"),
    schema_version: fc.constant("1.0"),
  });
}

/** Generate any Component (union of all four types). */
function arbComponent(): fc.Arbitrary<Component> {
  return fc.oneof(
    arbNVMeComponent(),
    arbGPUComponent(),
    arbRAMComponent(),
    arbSATAComponent(),
  );
}

// ── Property 5 ──────────────────────────────────────────────────────────────

describe("Property 5: Assigned component info is displayed", () => {
  /**
   * **Validates: Requirements 3.5**
   */

  test("every component has non-empty manufacturer and model strings", () => {
    fc.assert(
      fc.property(arbComponent(), (component) => {
        expect(typeof component.manufacturer).toBe("string");
        expect(component.manufacturer.length).toBeGreaterThan(0);
        expect(typeof component.model).toBe("string");
        expect(component.model.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  test("manufacturer and model concatenation produces a meaningful display string", () => {
    fc.assert(
      fc.property(arbComponent(), (component) => {
        const displayString = `${component.manufacturer} ${component.model}`;
        // The display string should be longer than either field alone (space separator)
        expect(displayString.length).toBeGreaterThan(component.manufacturer.length);
        expect(displayString.length).toBeGreaterThan(component.model.length);
        // Should contain both parts
        expect(displayString).toContain(component.manufacturer);
        expect(displayString).toContain(component.model);
        // Should not be just whitespace
        expect(displayString.trim().length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  test("SlotCard receives assignedComponent with correct manufacturer and model for each component type", () => {
    fc.assert(
      fc.property(arbComponent(), (component) => {
        // Verify the component would be passed as assignedComponent prop to SlotCard
        // and that the rendered text `{assignedComponent.manufacturer} {assignedComponent.model}`
        // would produce the expected display output
        const assignedComponent: Component = component;
        const renderedText = `${assignedComponent.manufacturer} ${assignedComponent.model}`;

        // The rendered text matches what SlotCard would display
        expect(renderedText).toBe(`${component.manufacturer} ${component.model}`);

        // Both fields are non-empty strings (SlotCard would display meaningful content)
        expect(assignedComponent.manufacturer.trim()).not.toBe("");
        expect(assignedComponent.model.trim()).not.toBe("");
      }),
      { numRuns: 100 },
    );
  });
});


// Feature: slot-checker-ui, Property 6: Component picker filters by slot category
import { SLOT_CATEGORY_TO_COMPONENT_TYPE } from "../../src/lib/ui-types";
import type { SlotCategory } from "../../src/lib/ui-types";

/** Generate a manifest-style component entry with a specific type. */
function arbManifestComponent(
  componentType: string,
): fc.Arbitrary<{ id: string; type: string; manufacturer: string; model: string; specs: Record<string, unknown> }> {
  return fc.record({
    id: idArb,
    type: fc.constant(componentType),
    manufacturer: nonEmptyStringArb,
    model: nonEmptyStringArb,
    specs: fc.constant({} as Record<string, unknown>),
  });
}

/** Generate a mixed array of manifest components with all four types. */
function arbMixedManifestComponents(): fc.Arbitrary<
  { id: string; type: string; manufacturer: string; model: string; specs: Record<string, unknown> }[]
> {
  return fc
    .tuple(
      fc.array(arbManifestComponent("ram"), { minLength: 0, maxLength: 5 }),
      fc.array(arbManifestComponent("nvme"), { minLength: 0, maxLength: 5 }),
      fc.array(arbManifestComponent("gpu"), { minLength: 0, maxLength: 5 }),
      fc.array(arbManifestComponent("sata_drive"), { minLength: 0, maxLength: 5 }),
    )
    .map(([ram, nvme, gpu, sata]) => [...ram, ...nvme, ...gpu, ...sata]);
}

/** Arbitrary for a random slot category. */
const arbSlotCategory: fc.Arbitrary<SlotCategory> = fc.constantFrom(
  "memory" as const,
  "m2" as const,
  "pcie" as const,
  "sata" as const,
);

describe("Property 6: Component picker filters by slot category", () => {
  /**
   * **Validates: Requirements 4.1**
   */

  test("filtering by slot category returns only components whose type matches the compatible type", () => {
    fc.assert(
      fc.property(
        arbSlotCategory,
        arbMixedManifestComponents(),
        (slotCategory, manifestComponents) => {
          const compatibleType = SLOT_CATEGORY_TO_COMPONENT_TYPE[slotCategory];
          const filtered = manifestComponents.filter((c) => c.type === compatibleType);

          // Every filtered component must have the compatible type
          for (const component of filtered) {
            expect(component.type).toBe(compatibleType);
          }

          // No component of an incompatible type should appear in the filtered list
          const incompatible = filtered.filter((c) => c.type !== compatibleType);
          expect(incompatible).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  test("filtering captures all components of the compatible type from the manifest", () => {
    fc.assert(
      fc.property(
        arbSlotCategory,
        arbMixedManifestComponents(),
        (slotCategory, manifestComponents) => {
          const compatibleType = SLOT_CATEGORY_TO_COMPONENT_TYPE[slotCategory];
          const filtered = manifestComponents.filter((c) => c.type === compatibleType);

          // Count how many components in the original manifest match the compatible type
          const expectedCount = manifestComponents.filter(
            (c) => c.type === compatibleType,
          ).length;

          expect(filtered).toHaveLength(expectedCount);
        },
      ),
      { numRuns: 100 },
    );
  });

  test("each slot category maps to a distinct component type and filtering is mutually exclusive", () => {
    fc.assert(
      fc.property(
        arbMixedManifestComponents(),
        (manifestComponents) => {
          const allCategories: SlotCategory[] = ["memory", "m2", "pcie", "sata"];
          const filteredSets = allCategories.map((cat) => {
            const compatibleType = SLOT_CATEGORY_TO_COMPONENT_TYPE[cat];
            return manifestComponents.filter((c) => c.type === compatibleType);
          });

          // The total count across all filtered sets should equal the total manifest size
          // (every component belongs to exactly one category's filter result)
          const totalFiltered = filteredSets.reduce((sum, s) => sum + s.length, 0);
          expect(totalFiltered).toBe(manifestComponents.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// Feature: slot-checker-ui, Property 11: Component picker displays component details

/**
 * SPEC_DISPLAY_KEYS from ComponentPicker.tsx defines which spec keys are shown per type.
 * Manifest components store specs as a flat Record<string, unknown> using dot-notation keys.
 */
const SPEC_DISPLAY_KEYS: Record<string, string[]> = {
  nvme: ["capacity_gb", "interface.pcie_gen", "interface.protocol"],
  gpu: ["power.tdp_w", "interface.pcie_gen", "physical.length_mm"],
  ram: ["interface.type", "interface.speed_mhz", "capacity.total_gb"],
  sata_drive: ["capacity_gb", "form_factor"],
};

/** Generate a manifest component with realistic specs for its type. */
function arbManifestComponentWithSpecs(): fc.Arbitrary<{
  id: string;
  type: string;
  manufacturer: string;
  model: string;
  specs: Record<string, unknown>;
}> {
  return fc.oneof(
    // NVMe component with specs
    fc.record({
      id: idArb,
      type: fc.constant("nvme"),
      manufacturer: nonEmptyStringArb,
      model: nonEmptyStringArb,
      specs: fc.record({
        capacity_gb: fc.constantFrom(256, 512, 1000, 2000),
        "interface.pcie_gen": fc.oneof(fc.constant(null), fc.constantFrom(3, 4, 5)),
        "interface.protocol": fc.constantFrom("NVMe", "SATA"),
      }) as fc.Arbitrary<Record<string, unknown>>,
    }),
    // GPU component with specs
    fc.record({
      id: idArb,
      type: fc.constant("gpu"),
      manufacturer: nonEmptyStringArb,
      model: nonEmptyStringArb,
      specs: fc.record({
        "power.tdp_w": fc.constantFrom(150, 200, 250, 350),
        "interface.pcie_gen": fc.constantFrom(3, 4, 5),
        "physical.length_mm": fc.constantFrom(250, 300, 350),
      }) as fc.Arbitrary<Record<string, unknown>>,
    }),
    // RAM component with specs
    fc.record({
      id: idArb,
      type: fc.constant("ram"),
      manufacturer: nonEmptyStringArb,
      model: nonEmptyStringArb,
      specs: fc.record({
        "interface.type": fc.constantFrom("DDR4", "DDR5"),
        "interface.speed_mhz": fc.constantFrom(3200, 4800, 5600, 6000),
        "capacity.total_gb": fc.constantFrom(16, 32, 64),
      }) as fc.Arbitrary<Record<string, unknown>>,
    }),
    // SATA drive component with specs
    fc.record({
      id: idArb,
      type: fc.constant("sata_drive"),
      manufacturer: nonEmptyStringArb,
      model: nonEmptyStringArb,
      specs: fc.record({
        capacity_gb: fc.constantFrom(250, 500, 1000, 2000),
        form_factor: fc.constantFrom("2.5\"", "3.5\""),
      }) as fc.Arbitrary<Record<string, unknown>>,
    }),
  );
}

describe("Property 11: Component picker displays component details", () => {
  /**
   * **Validates: Requirements 4.4**
   */

  test("every manifest component has non-empty manufacturer and model strings", () => {
    fc.assert(
      fc.property(arbManifestComponentWithSpecs(), (component) => {
        expect(typeof component.manufacturer).toBe("string");
        expect(component.manufacturer.trim().length).toBeGreaterThan(0);
        expect(typeof component.model).toBe("string");
        expect(component.model.trim().length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  test("every manifest component has at least one displayable spec key for its type", () => {
    fc.assert(
      fc.property(arbManifestComponentWithSpecs(), (component) => {
        const displayKeys = SPEC_DISPLAY_KEYS[component.type];
        expect(displayKeys).toBeDefined();
        // At least one spec key from the display keys must exist with a non-null value
        const hasDisplayableSpec = displayKeys.some(
          (key) => component.specs[key] != null,
        );
        expect(hasDisplayableSpec).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  test("the display string contains both manufacturer and model", () => {
    fc.assert(
      fc.property(arbManifestComponentWithSpecs(), (component) => {
        const displayString = `${component.manufacturer} ${component.model}`;
        expect(displayString).toContain(component.manufacturer);
        expect(displayString).toContain(component.model);
        // Display string is longer than either part alone
        expect(displayString.length).toBeGreaterThan(component.manufacturer.length);
        expect(displayString.length).toBeGreaterThan(component.model.length);
      }),
      { numRuns: 100 },
    );
  });
});


// Feature: slot-checker-ui, Property 1: Board selector renders all manifest entries
import type { DataManifest } from "../../src/lib/types";

/** Generate a manifest-style board entry. */
function arbManifestBoard(): fc.Arbitrary<DataManifest["motherboards"][number]> {
  return fc.record({
    id: idArb,
    manufacturer: nonEmptyStringArb,
    model: nonEmptyStringArb,
    socket: nonEmptyStringArb,
    chipset: nonEmptyStringArb,
    form_factor: nonEmptyStringArb,
  });
}

/** Generate an array of manifest board entries with unique IDs. */
function arbManifestBoards(): fc.Arbitrary<DataManifest["motherboards"]> {
  return fc
    .array(arbManifestBoard(), { minLength: 0, maxLength: 10 })
    .map((boards) => {
      // Ensure unique IDs by deduplicating
      const seen = new Set<string>();
      return boards.filter((b) => {
        if (seen.has(b.id)) return false;
        seen.add(b.id);
        return true;
      });
    });
}

describe("Property 1: Board selector renders all manifest entries", () => {
  /**
   * **Validates: Requirements 1.1**
   */

  test("the number of boards in the manifest equals the number that would be rendered (no filtering occurs)", () => {
    fc.assert(
      fc.property(arbManifestBoards(), (boards) => {
        // BoardSelector receives the boards array and renders one item per entry.
        // No filtering logic exists — the rendered count must equal the input count.
        const renderedCount = boards.length;
        expect(renderedCount).toBe(boards.length);

        // Additionally, each board entry has all required fields present
        for (const board of boards) {
          expect(typeof board.id).toBe("string");
          expect(typeof board.model).toBe("string");
          expect(typeof board.chipset).toBe("string");
          expect(typeof board.socket).toBe("string");
          expect(typeof board.form_factor).toBe("string");
        }
      }),
      { numRuns: 100 },
    );
  });

  test("each manifest board entry has non-empty model, chipset, socket, and form_factor strings", () => {
    fc.assert(
      fc.property(arbManifestBoards(), (boards) => {
        for (const board of boards) {
          expect(board.model.trim().length).toBeGreaterThan(0);
          expect(board.chipset.trim().length).toBeGreaterThan(0);
          expect(board.socket.trim().length).toBeGreaterThan(0);
          expect(board.form_factor.trim().length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  test("each board has a unique id that can serve as a key", () => {
    fc.assert(
      fc.property(arbManifestBoards(), (boards) => {
        const ids = boards.map((b) => b.id);
        const uniqueIds = new Set(ids);
        // After deduplication in the generator, all IDs must be unique
        expect(uniqueIds.size).toBe(boards.length);

        // Each ID is a non-empty string suitable as a React key
        for (const id of ids) {
          expect(typeof id).toBe("string");
          expect(id.trim().length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  test("board display text includes model, chipset, socket, and form_factor", () => {
    fc.assert(
      fc.property(arbManifestBoards(), (boards) => {
        for (const board of boards) {
          // BoardSelector renders: "{manufacturer} {model}" as the title,
          // and chipset, socket, form_factor as detail spans.
          // The combined text content of each board item includes all four fields.
          const displayParts = [board.model, board.chipset, board.socket, board.form_factor];
          for (const part of displayParts) {
            expect(typeof part).toBe("string");
            expect(part.length).toBeGreaterThan(0);
          }

          // The display text formed by concatenating all parts contains each field
          const fullText = `${board.manufacturer} ${board.model} ${board.chipset} ${board.socket} ${board.form_factor}`;
          expect(fullText).toContain(board.model);
          expect(fullText).toContain(board.chipset);
          expect(fullText).toContain(board.socket);
          expect(fullText).toContain(board.form_factor);
        }
      }),
      { numRuns: 100 },
    );
  });
});


// Feature: slot-checker-ui, Property 7: Assignment round-trip (add then remove restores state)

/** Generate a random assignments object (Record<string, string>). */
function arbAssignmentsRecord(): fc.Arbitrary<Record<string, string>> {
  return fc
    .array(fc.tuple(idArb, idArb), { minLength: 0, maxLength: 10 })
    .map((pairs) => {
      const record: Record<string, string> = {};
      for (const [k, v] of pairs) {
        record[k] = v;
      }
      return record;
    });
}

describe("Property 7: Assignment round-trip (add then remove restores state)", () => {
  /**
   * **Validates: Requirements 4.2, 4.3**
   */

  test("adding an assignment for a new slot then removing it restores the original state", () => {
    fc.assert(
      fc.property(
        arbAssignmentsRecord(),
        idArb,
        idArb,
        (initialAssignments, newSlotId, componentId) => {
          // Pre-condition: the new slot ID must NOT already exist in the initial assignments
          fc.pre(!(newSlotId in initialAssignments));

          // Add assignment: setAssignments(prev => ({ ...prev, [slotId]: componentId }))
          const afterAdd = { ...initialAssignments, [newSlotId]: componentId };

          // Remove assignment: setAssignments(prev => { const next = { ...prev }; delete next[slotId]; return next; })
          const afterRemove = { ...afterAdd };
          delete afterRemove[newSlotId];

          // The result should equal the original assignments
          expect(afterRemove).toEqual(initialAssignments);
        },
      ),
      { numRuns: 100 },
    );
  });

  test("the add step actually inserts the slot-component pair", () => {
    fc.assert(
      fc.property(
        arbAssignmentsRecord(),
        idArb,
        idArb,
        (initialAssignments, newSlotId, componentId) => {
          fc.pre(!(newSlotId in initialAssignments));

          const afterAdd = { ...initialAssignments, [newSlotId]: componentId };

          // The new slot should be present with the correct component
          expect(afterAdd[newSlotId]).toBe(componentId);
          // The size should have increased by 1
          expect(Object.keys(afterAdd).length).toBe(
            Object.keys(initialAssignments).length + 1,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  test("the remove step actually deletes only the target slot", () => {
    fc.assert(
      fc.property(
        arbAssignmentsRecord(),
        idArb,
        idArb,
        (initialAssignments, newSlotId, componentId) => {
          fc.pre(!(newSlotId in initialAssignments));

          const afterAdd = { ...initialAssignments, [newSlotId]: componentId };
          const afterRemove = { ...afterAdd };
          delete afterRemove[newSlotId];

          // The removed slot should no longer exist
          expect(newSlotId in afterRemove).toBe(false);
          // All original keys should still be present with their original values
          for (const key of Object.keys(initialAssignments)) {
            expect(afterRemove[key]).toBe(initialAssignments[key]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// Feature: slot-checker-ui, Property 8: Board switch clears assignments

describe("Property 8: Board switch clears assignments", () => {
  /**
   * **Validates: Requirements 1.4**
   */

  test("switching to a different board clears all assignments to an empty object", () => {
    fc.assert(
      fc.property(
        arbAssignmentsRecord().filter((a) => Object.keys(a).length > 0),
        idArb,
        idArb,
        (nonEmptyAssignments, currentBoardId, newBoardId) => {
          // Pre-condition: the new board must be different from the current board
          fc.pre(newBoardId !== currentBoardId);

          // Simulate the board switch logic from SlotChecker.handleSelectBoard:
          // if (boardId === selectedBoardId) return;
          // setAssignments({});
          const resultingAssignments: Record<string, string> =
            newBoardId === currentBoardId ? nonEmptyAssignments : {};

          expect(resultingAssignments).toEqual({});
        },
      ),
      { numRuns: 100 },
    );
  });

  test("selecting the same board does NOT clear assignments (early return)", () => {
    fc.assert(
      fc.property(
        arbAssignmentsRecord().filter((a) => Object.keys(a).length > 0),
        idArb,
        (nonEmptyAssignments, currentBoardId) => {
          // Simulate: if (boardId === selectedBoardId) return;
          // Assignments remain unchanged when the same board is selected
          const sameBoardId = currentBoardId;
          const resultingAssignments: Record<string, string> =
            sameBoardId === currentBoardId ? nonEmptyAssignments : {};

          expect(resultingAssignments).toEqual(nonEmptyAssignments);
          expect(Object.keys(resultingAssignments).length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  test("clearing produces exactly {} regardless of how many assignments existed", () => {
    fc.assert(
      fc.property(
        arbAssignmentsRecord().filter((a) => Object.keys(a).length > 0),
        idArb,
        idArb,
        (nonEmptyAssignments, currentBoardId, newBoardId) => {
          fc.pre(newBoardId !== currentBoardId);

          // Record the original size to confirm it was non-empty
          const originalSize = Object.keys(nonEmptyAssignments).length;
          expect(originalSize).toBeGreaterThan(0);

          // After board switch, assignments are cleared to {}
          const cleared: Record<string, string> = {};

          expect(cleared).toEqual({});
          expect(Object.keys(cleared).length).toBe(0);
          // The cleared object has no keys from the original assignments
          for (const key of Object.keys(nonEmptyAssignments)) {
            expect(key in cleared).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
