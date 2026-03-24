import { describe, test, expect } from "vitest";
import * as fc from "fast-check";
import { validateAssignments } from "../../src/lib/validation-engine";
import type {
  Motherboard,
  M2Slot,
  NVMeComponent,
  SATAComponent,
  RAMComponent,
  Component,
  PCIeSlot,
  SATAPort,
  MemoryConfig,
  MemorySlot,
  SharingRule,
  SharingTrigger,
} from "../../src/lib/types";

// -- Arbitraries --------------------------------------------------------------

const idArb = fc
  .stringMatching(/^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$/)
  .filter((s) => s.length >= 2);

const nonEmptyStringArb = fc
  .stringMatching(/^[A-Za-z0-9][A-Za-z0-9 _-]{0,19}$/)
  .filter((s) => s.length >= 1);

const formFactorArb = fc.constantFrom("2230", "2242", "2260", "2280", "22110");

const memoryConfigArb: fc.Arbitrary<MemoryConfig> = fc.constant({
  type: "DDR5",
  max_speed_mhz: 6000,
  base_speed_mhz: 4800,
  max_capacity_gb: 128,
  ecc_support: false,
  channels: 2,
  slots: [],
  recommended_population: { two_dimm: [] },
});

function m2SlotArb(overrides: Partial<M2Slot> = {}): fc.Arbitrary<M2Slot> {
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
      ...overrides,
    }));
}

const pcieSlotArb: fc.Arbitrary<PCIeSlot> = fc.record({
  id: idArb,
  label: nonEmptyStringArb,
  gen: fc.constantFrom(3, 4, 5),
  electrical_lanes: fc.constantFrom(1, 4, 8, 16),
  physical_size: fc.constantFrom("x1" as const, "x4" as const, "x8" as const, "x16" as const),
  position: fc.integer({ min: 1, max: 10 }),
  source: fc.constantFrom("CPU" as const, "Chipset" as const),
  reinforced: fc.boolean(),
  sharing: fc.constant(null),
});

const sataPortArb: fc.Arbitrary<SATAPort> = fc.record({
  id: idArb,
  version: fc.constant("SATA III"),
  source: fc.constantFrom("CPU" as const, "Chipset" as const),
  disabled_by: fc.constant(null),
});

function minimalMotherboardArb(m2Slot: fc.Arbitrary<M2Slot>): fc.Arbitrary<Motherboard> {
  return fc.record({
    id: idArb,
    manufacturer: nonEmptyStringArb,
    model: nonEmptyStringArb,
    chipset: fc.constantFrom("Z890", "X870", "B650"),
    socket: fc.constantFrom("LGA1851", "AM5"),
    form_factor: fc.constantFrom("ATX", "Micro-ATX"),
    memory: memoryConfigArb,
    m2_slots: fc.tuple(m2Slot).map(([s]) => [s]),
    pcie_slots: fc.array(pcieSlotArb, { minLength: 0, maxLength: 2 }),
    sata_ports: fc.array(sataPortArb, { minLength: 0, maxLength: 2 }),
    sources: fc.constant([{ type: "manual", url: "https://example.com" }]),
    schema_version: fc.constant("1.0"),
  });
}

function nvmeComponentArb(
  overrides: Partial<NVMeComponent["interface"]> = {}
): fc.Arbitrary<NVMeComponent> {
  return fc.record({
    id: idArb,
    type: fc.constant("nvme" as const),
    manufacturer: nonEmptyStringArb,
    model: nonEmptyStringArb,
    interface: fc.constant({
      protocol: "NVMe" as const,
      pcie_gen: 4,
      lanes: 4,
      ...overrides,
    }),
    form_factor: formFactorArb,
    capacity_gb: fc.integer({ min: 256, max: 4000 }),
    schema_version: fc.constant("1.0"),
  });
}

const sataComponentArb: fc.Arbitrary<SATAComponent> = fc.record({
  id: idArb,
  type: fc.constant("sata_drive" as const),
  manufacturer: nonEmptyStringArb,
  model: nonEmptyStringArb,
  form_factor: fc.constantFrom("2.5", "3.5"),
  capacity_gb: fc.integer({ min: 120, max: 8000 }),
  interface: fc.constant("SATA III"),
  schema_version: fc.constant("1.0"),
});

function sataPortWithDisabledByArb(
  disabledBy: string | null
): fc.Arbitrary<SATAPort> {
  return fc.record({
    id: idArb,
    version: fc.constant("SATA III"),
    source: fc.constantFrom("CPU" as const, "Chipset" as const),
    disabled_by: fc.constant(disabledBy),
  });
}

function motherboardWithSataArb(
  sataPort: fc.Arbitrary<SATAPort>,
  m2Slots: fc.Arbitrary<M2Slot[]> = fc.constant([])
): fc.Arbitrary<Motherboard> {
  return fc.record({
    id: idArb,
    manufacturer: nonEmptyStringArb,
    model: nonEmptyStringArb,
    chipset: fc.constantFrom("Z890", "X870", "B650"),
    socket: fc.constantFrom("LGA1851", "AM5"),
    form_factor: fc.constantFrom("ATX", "Micro-ATX"),
    memory: memoryConfigArb,
    m2_slots: m2Slots,
    pcie_slots: fc.array(pcieSlotArb, { minLength: 0, maxLength: 1 }),
    sata_ports: fc.tuple(sataPort).map(([p]) => [p]),
    sources: fc.constant([{ type: "manual", url: "https://example.com" }]),
    schema_version: fc.constant("1.0"),
  });
}

// -- Feature: validation-engine-gaps, Property 8: M.2 form factor mismatch produces error --

describe("Feature: validation-engine-gaps, Property 8: M.2 form factor mismatch produces error", () => {
  /**
   * Validates: Requirements 6.1, 6.2, 6.3
   *
   * For any NVMe component assigned to an M.2 slot where the component's
   * form_factor is NOT in the slot's form_factors array, the validation
   * engine should produce an error-severity result.
   */

  test("NVMe component with mismatched form factor produces error", () => {
    // Generate a slot that supports a specific set of form factors,
    // then generate a component whose form_factor is NOT in that set.
    const scenarioArb = fc
      .record({
        slotFormFactors: fc
          .subarray(["2230", "2242", "2260", "2280", "22110"], { minLength: 1, maxLength: 4 })
          .filter((arr) => arr.length < 5),
        componentFormFactor: formFactorArb,
      })
      .filter(({ slotFormFactors, componentFormFactor }) => {
        return !slotFormFactors.includes(componentFormFactor);
      })
      .chain(({ slotFormFactors, componentFormFactor }) => {
        const slotArb = m2SlotArb({ form_factors: slotFormFactors });
        const compArb = nvmeComponentArb().map((c) => ({
          ...c,
          form_factor: componentFormFactor,
        }));
        return fc.tuple(minimalMotherboardArb(slotArb), compArb);
      });

    fc.assert(
      fc.property(scenarioArb, ([motherboard, component]) => {
        const slotId = motherboard.m2_slots[0].id;
        const assignments: Record<string, string> = { [slotId]: component.id };
        const components: Record<string, Component> = { [component.id]: component };

        const results = validateAssignments(motherboard, assignments, components);

        const errors = results.filter(
          (r) => r.severity === "error" && r.slotId === slotId && r.componentId === component.id
        );
        expect(errors.length).toBeGreaterThanOrEqual(1);
        // The error message should mention the component's form factor
        expect(errors.some((e) => e.message.includes(component.form_factor))).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  test("NVMe component with matching form factor produces no form factor error", () => {
    // Generate a slot and component where the form factor matches.
    // Use Gen4 slot + Gen4 NVMe + NVMe protocol + supports_sata to avoid
    // other validation errors interfering.
    const scenarioArb = formFactorArb.chain((ff) => {
      const slotArb = m2SlotArb({
        form_factors: [ff],
        gen: 4,
        supports_sata: true,
      });
      const compArb = nvmeComponentArb({ protocol: "NVMe", pcie_gen: 4, lanes: 4 }).map((c) => ({
        ...c,
        form_factor: ff,
      }));
      return fc.tuple(minimalMotherboardArb(slotArb), compArb);
    });

    fc.assert(
      fc.property(scenarioArb, ([motherboard, component]) => {
        const slotId = motherboard.m2_slots[0].id;
        const assignments: Record<string, string> = { [slotId]: component.id };
        const components: Record<string, Component> = { [component.id]: component };

        const results = validateAssignments(motherboard, assignments, components);

        // No error should mention "form factor" or "does not physically fit"
        const formFactorErrors = results.filter(
          (r) =>
            r.severity === "error" &&
            r.slotId === slotId &&
            r.message.includes("does not physically fit")
        );
        expect(formFactorErrors.length).toBe(0);
      }),
      { numRuns: 100 }
    );
  });
});


// -- Feature: validation-engine-gaps, Property 9: Valid SATA assignment produces no type or disable errors --

describe("Feature: validation-engine-gaps, Property 9: Valid SATA assignment produces no type or disable errors", () => {
  /**
   * Validates: Requirements 7.1
   *
   * For any SATA component assigned to a SATA port whose disabled_by is null
   * or references an M.2 slot that is NOT populated in the assignment map,
   * the validation engine should produce no error-severity results for that assignment.
   */

  test("SATA drive in non-disabled port produces no errors", () => {
    // Port with disabled_by = null
    const scenarioArb = fc.tuple(
      motherboardWithSataArb(sataPortWithDisabledByArb(null)),
      sataComponentArb
    );

    fc.assert(
      fc.property(scenarioArb, ([motherboard, component]) => {
        const portId = motherboard.sata_ports[0].id;
        const assignments: Record<string, string> = { [portId]: component.id };
        const components: Record<string, Component> = { [component.id]: component };

        const results = validateAssignments(motherboard, assignments, components);

        const errors = results.filter(
          (r) => r.severity === "error" && r.slotId === portId
        );
        expect(errors).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });

  test("SATA drive in port with unpopulated disabled_by M.2 slot produces no errors", () => {
    // Port references an M.2 slot that exists but is NOT assigned
    const m2SlotId = "m2-ref-slot";
    const m2Arb = m2SlotArb({ id: m2SlotId });

    const scenarioArb = fc.tuple(
      motherboardWithSataArb(
        sataPortWithDisabledByArb(m2SlotId),
        fc.tuple(m2Arb).map(([s]) => [s])
      ),
      sataComponentArb
    );

    fc.assert(
      fc.property(scenarioArb, ([motherboard, component]) => {
        const portId = motherboard.sata_ports[0].id;
        // Only assign the SATA component, NOT the M.2 slot
        const assignments: Record<string, string> = { [portId]: component.id };
        const components: Record<string, Component> = { [component.id]: component };

        const results = validateAssignments(motherboard, assignments, components);

        const errors = results.filter(
          (r) => r.severity === "error" && r.slotId === portId
        );
        expect(errors).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });
});

// -- Feature: validation-engine-gaps, Property 10: Non-SATA component in SATA port produces error --

describe("Feature: validation-engine-gaps, Property 10: Non-SATA component in SATA port produces error", () => {
  /**
   * Validates: Requirements 7.3
   *
   * For any component that is not of type "sata_drive" assigned to a SATA port,
   * the validation engine should produce an error-severity result stating the
   * component type is incompatible.
   */

  test("NVMe component in SATA port produces error", () => {
    const scenarioArb = fc.tuple(
      motherboardWithSataArb(sataPortWithDisabledByArb(null)),
      nvmeComponentArb()
    );

    fc.assert(
      fc.property(scenarioArb, ([motherboard, component]) => {
        const portId = motherboard.sata_ports[0].id;
        const assignments: Record<string, string> = { [portId]: component.id };
        const components: Record<string, Component> = { [component.id]: component };

        const results = validateAssignments(motherboard, assignments, components);

        const errors = results.filter(
          (r) => r.severity === "error" && r.slotId === portId && r.componentId === component.id
        );
        expect(errors.length).toBeGreaterThanOrEqual(1);
        expect(errors.some((e) => e.message.includes("incompatible"))).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});


// -- RAM Arbitraries ----------------------------------------------------------

const ddrTypeArb = fc.constantFrom("DDR4" as const, "DDR5" as const);

const memorySlotArb: fc.Arbitrary<MemorySlot> = fc.record({
  id: idArb,
  channel: fc.constantFrom("A" as const, "B" as const),
  position: fc.integer({ min: 0, max: 3 }),
  recommended: fc.boolean(),
});

function ramComponentArb(overrides: Partial<RAMComponent> = {}): fc.Arbitrary<RAMComponent> {
  return fc
    .record({
      id: idArb,
      type: fc.constant("ram" as const),
      manufacturer: nonEmptyStringArb,
      model: nonEmptyStringArb,
      interface: fc.record({
        type: ddrTypeArb,
        speed_mhz: fc.integer({ min: 2133, max: 8000 }),
        base_speed_mhz: fc.integer({ min: 2133, max: 4800 }),
      }),
      capacity: fc.record({
        per_module_gb: fc.constantFrom(8, 16, 32, 48),
        modules: fc.constantFrom(1, 2),
        total_gb: fc.constantFrom(8, 16, 32, 48, 64, 96, 128),
      }),
      schema_version: fc.constant("1.0"),
    })
    .map((base) => ({ ...base, ...overrides }));
}

function memoryConfigWithSlotsArb(
  slotOverrides: Partial<MemorySlot>[] = [],
  configOverrides: Partial<MemoryConfig> = {}
): fc.Arbitrary<MemoryConfig> {
  const slotsArb =
    slotOverrides.length > 0
      ? fc.constant(
          slotOverrides.map((o, i) => ({
            id: o.id ?? `dimm_${i}`,
            channel: o.channel ?? ("A" as const),
            position: o.position ?? i,
            recommended: o.recommended ?? false,
          }))
        )
      : fc.array(memorySlotArb, { minLength: 2, maxLength: 4 });

  return fc
    .record({
      type: ddrTypeArb,
      max_speed_mhz: fc.integer({ min: 3200, max: 8000 }),
      base_speed_mhz: fc.integer({ min: 2133, max: 4800 }),
      max_capacity_gb: fc.constantFrom(64, 128, 192, 256),
      ecc_support: fc.boolean(),
      channels: fc.constantFrom(2, 4),
      slots: slotsArb,
      recommended_population: fc.constant({
        two_dimm: [] as string[],
      }),
    })
    .map((base) => ({
      ...base,
      ...configOverrides,
      recommended_population: configOverrides.recommended_population ?? base.recommended_population,
    }));
}

function motherboardWithMemoryArb(
  memConfig: fc.Arbitrary<MemoryConfig>
): fc.Arbitrary<Motherboard> {
  return fc.record({
    id: idArb,
    manufacturer: nonEmptyStringArb,
    model: nonEmptyStringArb,
    chipset: fc.constantFrom("Z890", "X870", "B650"),
    socket: fc.constantFrom("LGA1851", "AM5"),
    form_factor: fc.constantFrom("ATX", "Micro-ATX"),
    memory: memConfig,
    m2_slots: fc.constant([]),
    pcie_slots: fc.constant([]),
    sata_ports: fc.constant([]),
    sources: fc.constant([{ type: "manual", url: "https://example.com" }]),
    schema_version: fc.constant("1.0"),
  });
}

// -- Feature: validation-engine-gaps, Property 11: DDR type mismatch produces error --

describe("Feature: validation-engine-gaps, Property 11: DDR type mismatch produces error", () => {
  /**
   * Validates: Requirements 8.1, 8.2
   *
   * For any RAM component whose DDR type does not match the motherboard's
   * memory.type, the validation engine should produce an error-severity result.
   */

  test("RAM with mismatched DDR type produces error", () => {
    // Generate a board with DDR5 and a RAM component with DDR4 (or vice versa)
    const scenarioArb = ddrTypeArb.chain((boardDdr) => {
      const ramDdr = boardDdr === "DDR4" ? "DDR5" : "DDR4";
      const slotId = "dimm_a1";
      const memConfigArb = memoryConfigWithSlotsArb(
        [{ id: slotId, channel: "A", position: 0, recommended: true }],
        { type: boardDdr }
      );
      const mbArb = motherboardWithMemoryArb(memConfigArb);
      const compArb = ramComponentArb().map((c) => ({
        ...c,
        interface: { ...c.interface, type: ramDdr as "DDR4" | "DDR5" },
      }));
      return fc.tuple(mbArb, compArb, fc.constant(slotId));
    });

    fc.assert(
      fc.property(scenarioArb, ([motherboard, component, slotId]) => {
        const assignments: Record<string, string> = { [slotId]: component.id };
        const components: Record<string, Component> = { [component.id]: component };

        const results = validateAssignments(motherboard, assignments, components);

        const errors = results.filter(
          (r) => r.severity === "error" && r.slotId === slotId && r.componentId === component.id
        );
        expect(errors.length).toBeGreaterThanOrEqual(1);
        expect(
          errors.some(
            (e) => e.message.includes(component.interface.type) && e.message.includes(motherboard.memory.type)
          )
        ).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});

// -- Feature: validation-engine-gaps, Property 12: RAM speed exceeding board max produces info --

describe("Feature: validation-engine-gaps, Property 12: RAM speed exceeding board max produces info", () => {
  /**
   * Validates: Requirements 8.3
   *
   * For any RAM component whose speed_mhz is strictly greater than the
   * motherboard's memory.max_speed_mhz, the validation engine should
   * produce an info-severity result.
   */

  test("RAM with speed exceeding board max produces info", () => {
    const slotId = "dimm_a1";
    const scenarioArb = fc
      .record({
        boardMaxSpeed: fc.integer({ min: 3200, max: 6000 }),
        speedDelta: fc.integer({ min: 1, max: 2000 }),
      })
      .chain(({ boardMaxSpeed, speedDelta }) => {
        const ramSpeed = boardMaxSpeed + speedDelta;
        const memConfigArb = memoryConfigWithSlotsArb(
          [{ id: slotId, channel: "A", position: 0, recommended: true }],
          { max_speed_mhz: boardMaxSpeed }
        );
        const mbArb = motherboardWithMemoryArb(memConfigArb);
        // Match DDR type to avoid DDR mismatch errors interfering
        const compArb = mbArb.chain((mb) =>
          ramComponentArb().map((c) => ({
            ...c,
            interface: { ...c.interface, type: mb.memory.type, speed_mhz: ramSpeed },
          }))
        );
        return fc.tuple(mbArb, compArb);
      });

    fc.assert(
      fc.property(scenarioArb, ([motherboard, component]) => {
        const assignments: Record<string, string> = { [slotId]: component.id };
        const components: Record<string, Component> = { [component.id]: component };

        const results = validateAssignments(motherboard, assignments, components);

        const infos = results.filter(
          (r) => r.severity === "info" && r.slotId === slotId && r.componentId === component.id
        );
        expect(infos.length).toBeGreaterThanOrEqual(1);
        expect(
          infos.some(
            (e) =>
              e.message.includes(String(component.interface.speed_mhz)) &&
              e.message.includes(String(motherboard.memory.max_speed_mhz))
          )
        ).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});

// -- Feature: validation-engine-gaps, Property 13: Non-recommended DIMM placement produces warning --

describe("Feature: validation-engine-gaps, Property 13: Non-recommended DIMM placement produces warning", () => {
  /**
   * Validates: Requirements 8.4
   *
   * For any motherboard with a recommended_population.two_dimm pattern and
   * exactly two RAM modules assigned to memory slots, if the set of populated
   * slot IDs does not match the two_dimm set, the validation engine should
   * produce a warning-severity result.
   */

  test("Two RAM modules in non-recommended slots produces warning", () => {
    // Create 4 memory slots, set two_dimm to slots 0 and 2,
    // then populate slots 1 and 3 (non-recommended)
    const recommendedSlots = ["dimm_a1", "dimm_b1"];
    const nonRecommendedSlots = ["dimm_a2", "dimm_b2"];
    const allSlots = [
      { id: "dimm_a1", channel: "A" as const, position: 0, recommended: true },
      { id: "dimm_a2", channel: "A" as const, position: 1, recommended: false },
      { id: "dimm_b1", channel: "B" as const, position: 2, recommended: true },
      { id: "dimm_b2", channel: "B" as const, position: 3, recommended: false },
    ];

    const memConfigArb = memoryConfigWithSlotsArb(allSlots, {
      recommended_population: { two_dimm: recommendedSlots },
    });
    const mbArb = motherboardWithMemoryArb(memConfigArb);

    const scenarioArb = mbArb.chain((mb) => {
      const comp1Arb = ramComponentArb().map((c) => ({
        ...c,
        interface: { ...c.interface, type: mb.memory.type },
        capacity: { per_module_gb: 16, modules: 1, total_gb: 16 },
      }));
      const comp2Arb = ramComponentArb().map((c) => ({
        ...c,
        interface: { ...c.interface, type: mb.memory.type },
        capacity: { per_module_gb: 16, modules: 1, total_gb: 16 },
      }));
      return fc.tuple(fc.constant(mb), comp1Arb, comp2Arb);
    });

    fc.assert(
      fc.property(scenarioArb, ([motherboard, comp1, comp2]) => {
        // Assign to non-recommended slots
        const assignments: Record<string, string> = {
          [nonRecommendedSlots[0]]: comp1.id,
          [nonRecommendedSlots[1]]: comp2.id,
        };
        const components: Record<string, Component> = {
          [comp1.id]: comp1,
          [comp2.id]: comp2,
        };

        const results = validateAssignments(motherboard, assignments, components);

        const warnings = results.filter((r) => r.severity === "warning");
        expect(warnings.length).toBeGreaterThanOrEqual(1);
        expect(warnings.some((w) => w.message.includes("recommended"))).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});

// -- Feature: validation-engine-gaps, Property 14: Total RAM capacity exceeding board max produces error --

describe("Feature: validation-engine-gaps, Property 14: Total RAM capacity exceeding board max produces error", () => {
  /**
   * Validates: Requirements 8.5
   *
   * For any set of RAM component assignments where the sum of all assigned
   * modules' total_gb exceeds the motherboard's memory.max_capacity_gb,
   * the validation engine should produce an error-severity result.
   */

  test("Total RAM capacity exceeding board max produces error", () => {
    const slotId1 = "dimm_a1";
    const slotId2 = "dimm_b1";
    const allSlots = [
      { id: slotId1, channel: "A" as const, position: 0, recommended: true },
      { id: slotId2, channel: "B" as const, position: 1, recommended: true },
    ];

    const scenarioArb = fc
      .record({
        maxCapacity: fc.constantFrom(32, 64, 128),
      })
      .chain(({ maxCapacity }) => {
        // Each module has total_gb that when summed exceeds maxCapacity
        const perModuleGb = maxCapacity; // Two of these will exceed max
        const memConfigArb = memoryConfigWithSlotsArb(allSlots, {
          max_capacity_gb: maxCapacity,
          recommended_population: { two_dimm: [slotId1, slotId2] },
        });
        const mbArb = motherboardWithMemoryArb(memConfigArb);

        return mbArb.chain((mb) => {
          const comp1Arb = ramComponentArb().map((c) => ({
            ...c,
            interface: { ...c.interface, type: mb.memory.type },
            capacity: { per_module_gb: perModuleGb, modules: 1, total_gb: perModuleGb },
          }));
          const comp2Arb = ramComponentArb().map((c) => ({
            ...c,
            interface: { ...c.interface, type: mb.memory.type },
            capacity: { per_module_gb: perModuleGb, modules: 1, total_gb: perModuleGb },
          }));
          return fc.tuple(fc.constant(mb), comp1Arb, comp2Arb);
        });
      });

    fc.assert(
      fc.property(scenarioArb, ([motherboard, comp1, comp2]) => {
        const assignments: Record<string, string> = {
          [slotId1]: comp1.id,
          [slotId2]: comp2.id,
        };
        const components: Record<string, Component> = {
          [comp1.id]: comp1,
          [comp2.id]: comp2,
        };

        const results = validateAssignments(motherboard, assignments, components);

        const capacityErrors = results.filter(
          (r) => r.severity === "error" && r.message.includes("exceeds")
        );
        expect(capacityErrors.length).toBeGreaterThanOrEqual(1);
        expect(
          capacityErrors.some((e) =>
            e.message.includes(String(motherboard.memory.max_capacity_gb))
          )
        ).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});


// -- Sharing Rule Arbitraries -------------------------------------------------

const triggerLogicArb = fc.constantFrom("and" as const, "or" as const, "any_populated" as const);

function sharingTriggerArb(slotIds: string[]): fc.Arbitrary<SharingTrigger> {
  return triggerLogicArb.map((logic) => ({
    slot_ids: slotIds,
    logic,
  }));
}

function disableSharingRuleArb(
  triggerSlotIds: string[],
  targets: string[],
  logic: SharingTrigger["logic"] = "any_populated"
): fc.Arbitrary<SharingRule> {
  return fc.constant({
    type: "disables" as const,
    targets,
    trigger: { slot_ids: triggerSlotIds, logic },
  });
}

function bandwidthSplitRuleArb(
  triggerSlotIds: string[],
  target: string,
  logic: SharingTrigger["logic"] = "any_populated"
): fc.Arbitrary<SharingRule> {
  return fc.integer({ min: 1, max: 8 }).map((lanes) => ({
    type: "bandwidth_split" as const,
    target,
    trigger: { slot_ids: triggerSlotIds, logic },
    degraded_lanes: lanes,
  }));
}

/** Build a motherboard with sharing rules on an M.2 slot. */
function motherboardWithSharingArb(overrides: {
  m2Slots?: M2Slot[];
  pcieSlots?: PCIeSlot[];
  sataPorts?: SATAPort[];
}): fc.Arbitrary<Motherboard> {
  return fc.record({
    id: idArb,
    manufacturer: nonEmptyStringArb,
    model: nonEmptyStringArb,
    chipset: fc.constantFrom("Z890", "X870", "B650"),
    socket: fc.constantFrom("LGA1851", "AM5"),
    form_factor: fc.constantFrom("ATX", "Micro-ATX"),
    memory: memoryConfigArb,
    m2_slots: fc.constant(overrides.m2Slots ?? []),
    pcie_slots: fc.constant(overrides.pcieSlots ?? []),
    sata_ports: fc.constant(overrides.sataPorts ?? []),
    sources: fc.constant([{ type: "manual", url: "https://example.com" }]),
    schema_version: fc.constant("1.0"),
  });
}

// -- Feature: validation-engine-gaps, Property 1: Legacy sharing rules do not crash the engine --

describe("Feature: validation-engine-gaps, Property 1: Legacy sharing rules do not crash the engine", () => {
  /**
   * Validates: Requirements 1.5
   *
   * For any motherboard with sharing rules that lack a trigger field
   * (legacy free-text condition only), and any valid assignment map,
   * the validation engine should return a result array without throwing.
   */

  test("Sharing rules without trigger field do not crash", () => {
    const legacyRule: SharingRule = {
      type: "disables",
      targets: ["sata_1"],
      condition: "M.2_1 is populated",
      effect: "SATA port 1 is disabled",
      // No trigger field -- legacy
    };

    const sourceSlotId = "m2-src";
    const m2Slot: M2Slot = {
      id: sourceSlotId,
      label: "M.2_1",
      interface: "PCIe",
      gen: 4,
      lanes: 4,
      form_factors: ["2280"],
      source: "CPU",
      supports_sata: false,
      heatsink_included: true,
      sharing: [legacyRule],
    };

    const scenarioArb = fc.tuple(
      motherboardWithSharingArb({ m2Slots: [m2Slot] }),
      nvmeComponentArb({ protocol: "NVMe", pcie_gen: 4, lanes: 4 }).map((c) => ({
        ...c,
        form_factor: "2280" as string,
      }))
    );

    fc.assert(
      fc.property(scenarioArb, ([motherboard, component]) => {
        const assignments: Record<string, string> = { [sourceSlotId]: component.id };
        const components: Record<string, Component> = { [component.id]: component };

        // Should not throw
        const results = validateAssignments(motherboard, assignments, components);
        expect(Array.isArray(results)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});

// -- Feature: validation-engine-gaps, Property 2: AND trigger logic requires all slots populated --

describe("Feature: validation-engine-gaps, Property 2: AND trigger logic requires all slots populated", () => {
  /**
   * Validates: Requirements 1.6, 3.3
   *
   * For any sharing rule with trigger.logic === "and" and any assignment map,
   * the rule should produce results only when every slot ID in trigger.slot_ids
   * is present as a key in the assignment map.
   */

  test("AND trigger fires only when all trigger slots are populated", () => {
    const sourceSlotId = "m2-and-src";
    const triggerSlot2 = "m2-and-trigger2";
    const targetSlotId = "sata-and-target";

    const m2Source: M2Slot = {
      id: sourceSlotId,
      label: "M.2_1",
      interface: "PCIe",
      gen: 4,
      lanes: 4,
      form_factors: ["2280"],
      source: "CPU",
      supports_sata: false,
      heatsink_included: true,
      sharing: [{
        type: "disables",
        targets: [targetSlotId],
        trigger: { slot_ids: [sourceSlotId, triggerSlot2], logic: "and" },
      }],
    };

    const m2Trigger2: M2Slot = {
      id: triggerSlot2,
      label: "M.2_2",
      interface: "PCIe",
      gen: 4,
      lanes: 4,
      form_factors: ["2280"],
      source: "CPU",
      supports_sata: false,
      heatsink_included: true,
      sharing: null,
    };

    const targetPort: SATAPort = {
      id: targetSlotId,
      version: "3.0",
      source: "Chipset",
      disabled_by: null,
    };

    const scenarioArb = fc.tuple(
      motherboardWithSharingArb({
        m2Slots: [m2Source, m2Trigger2],
        sataPorts: [targetPort],
      }),
      nvmeComponentArb({ protocol: "NVMe", pcie_gen: 4, lanes: 4 }).map((c) => ({
        ...c,
        form_factor: "2280" as string,
      })),
      nvmeComponentArb({ protocol: "NVMe", pcie_gen: 4, lanes: 4 }).map((c) => ({
        ...c,
        form_factor: "2280" as string,
      })),
      fc.boolean() // whether to populate the second trigger slot
    );

    fc.assert(
      fc.property(scenarioArb, ([motherboard, comp1, comp2, populateBoth]) => {
        const assignments: Record<string, string> = {
          [sourceSlotId]: comp1.id,
        };
        const comps: Record<string, Component> = {
          [comp1.id]: comp1,
        };

        if (populateBoth) {
          assignments[triggerSlot2] = comp2.id;
          comps[comp2.id] = comp2;
        }

        const results = validateAssignments(motherboard, assignments, comps);
        const sharingResults = results.filter(
          (r) => r.slotId === targetSlotId && r.message.includes(sourceSlotId)
        );

        if (populateBoth) {
          // AND: both populated -> rule fires
          expect(sharingResults.length).toBeGreaterThanOrEqual(1);
        } else {
          // AND: only one populated -> rule does NOT fire
          expect(sharingResults.length).toBe(0);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// -- Feature: validation-engine-gaps, Property 3: OR trigger logic requires at least one slot populated --

describe("Feature: validation-engine-gaps, Property 3: OR trigger logic requires at least one slot populated", () => {
  /**
   * Validates: Requirements 1.7
   *
   * For any sharing rule with trigger.logic === "or" or "any_populated"
   * and any assignment map, the rule should produce results when at least
   * one slot ID in trigger.slot_ids is present in the assignment map.
   */

  test("OR trigger fires when at least one trigger slot is populated", () => {
    const sourceSlotId = "m2-or-src";
    const triggerSlot2 = "m2-or-trigger2";
    const targetSlotId = "sata-or-target";

    const orLogicArb = fc.constantFrom("or" as const, "any_populated" as const);

    const scenarioArb = orLogicArb.chain((logic) => {
      const m2Source: M2Slot = {
        id: sourceSlotId,
        label: "M.2_1",
        interface: "PCIe",
        gen: 4,
        lanes: 4,
        form_factors: ["2280"],
        source: "CPU",
        supports_sata: false,
        heatsink_included: true,
        sharing: [{
          type: "disables",
          targets: [targetSlotId],
          trigger: { slot_ids: [sourceSlotId, triggerSlot2], logic },
        }],
      };

      const m2Trigger2: M2Slot = {
        id: triggerSlot2,
        label: "M.2_2",
        interface: "PCIe",
        gen: 4,
        lanes: 4,
        form_factors: ["2280"],
        source: "CPU",
        supports_sata: false,
        heatsink_included: true,
        sharing: null,
      };

      const targetPort: SATAPort = {
        id: targetSlotId,
        version: "3.0",
        source: "Chipset",
        disabled_by: null,
      };

      const mbArb = motherboardWithSharingArb({
        m2Slots: [m2Source, m2Trigger2],
        sataPorts: [targetPort],
      });

      const compArb = nvmeComponentArb({ protocol: "NVMe", pcie_gen: 4, lanes: 4 }).map((c) => ({
        ...c,
        form_factor: "2280" as string,
      }));

      // 0 = none populated, 1 = first only, 2 = second only, 3 = both
      return fc.tuple(mbArb, compArb, compArb, fc.constantFrom(0, 1, 2, 3));
    });

    fc.assert(
      fc.property(scenarioArb, ([motherboard, comp1, comp2, populateMode]) => {
        const assignments: Record<string, string> = {};
        const comps: Record<string, Component> = {};

        if (populateMode === 1 || populateMode === 3) {
          assignments[sourceSlotId] = comp1.id;
          comps[comp1.id] = comp1;
        }
        if (populateMode === 2 || populateMode === 3) {
          assignments[triggerSlot2] = comp2.id;
          comps[comp2.id] = comp2;
        }

        const results = validateAssignments(motherboard, assignments, comps);
        const sharingResults = results.filter(
          (r) => r.slotId === targetSlotId && r.message.includes(sourceSlotId)
        );

        if (populateMode === 0) {
          // No trigger slots populated -> rule does NOT fire
          expect(sharingResults.length).toBe(0);
        } else {
          // At least one populated -> rule fires
          expect(sharingResults.length).toBeGreaterThanOrEqual(1);
        }
      }),
      { numRuns: 100 }
    );
  });
});


// -- Feature: validation-engine-gaps, Property 4: Disable rule with populated target produces error --

describe("Feature: validation-engine-gaps, Property 4: Disable rule with populated target produces error", () => {
  /**
   * Validates: Requirements 2.1, 2.3, 4.1, 7.2
   *
   * For any sharing rule of type "disables" where the trigger condition is met
   * and a target slot/port also has a component assigned, the validation engine
   * should produce at least one error-severity result referencing that target.
   */

  test("Disable rule with populated target produces error", () => {
    const sourceSlotId = "m2-dis-src";
    const targetSlotId = "sata-dis-target";

    const m2Source: M2Slot = {
      id: sourceSlotId,
      label: "M.2_1",
      interface: "PCIe",
      gen: 4,
      lanes: 4,
      form_factors: ["2280"],
      source: "CPU",
      supports_sata: false,
      heatsink_included: true,
      sharing: [{
        type: "disables",
        targets: [targetSlotId],
        trigger: { slot_ids: [sourceSlotId], logic: "any_populated" },
      }],
    };

    const targetPort: SATAPort = {
      id: targetSlotId,
      version: "3.0",
      source: "Chipset",
      disabled_by: null,
    };

    const scenarioArb = fc.tuple(
      motherboardWithSharingArb({
        m2Slots: [m2Source],
        sataPorts: [targetPort],
      }),
      nvmeComponentArb({ protocol: "NVMe", pcie_gen: 4, lanes: 4 }).map((c) => ({
        ...c,
        form_factor: "2280" as string,
      })),
      sataComponentArb
    );

    fc.assert(
      fc.property(scenarioArb, ([motherboard, nvmeComp, sataComp]) => {
        // Both source and target are populated
        const assignments: Record<string, string> = {
          [sourceSlotId]: nvmeComp.id,
          [targetSlotId]: sataComp.id,
        };
        const comps: Record<string, Component> = {
          [nvmeComp.id]: nvmeComp,
          [sataComp.id]: sataComp,
        };

        const results = validateAssignments(motherboard, assignments, comps);
        const errors = results.filter(
          (r) => r.severity === "error" && r.slotId === targetSlotId && r.message.includes(sourceSlotId)
        );
        expect(errors.length).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 100 }
    );
  });
});

// -- Feature: validation-engine-gaps, Property 5: Disable rule with empty target produces warning --

describe("Feature: validation-engine-gaps, Property 5: Disable rule with empty target produces warning", () => {
  /**
   * Validates: Requirements 2.2, 4.2
   *
   * For any sharing rule of type "disables" where the trigger condition is met
   * and a target slot/port does NOT have a component assigned, the validation
   * engine should produce at least one warning-severity result.
   */

  test("Disable rule with empty target produces warning", () => {
    const sourceSlotId = "m2-dis-warn-src";
    const targetSlotId = "sata-dis-warn-target";

    const m2Source: M2Slot = {
      id: sourceSlotId,
      label: "M.2_1",
      interface: "PCIe",
      gen: 4,
      lanes: 4,
      form_factors: ["2280"],
      source: "CPU",
      supports_sata: false,
      heatsink_included: true,
      sharing: [{
        type: "disables",
        targets: [targetSlotId],
        trigger: { slot_ids: [sourceSlotId], logic: "any_populated" },
      }],
    };

    const targetPort: SATAPort = {
      id: targetSlotId,
      version: "3.0",
      source: "Chipset",
      disabled_by: null,
    };

    const scenarioArb = fc.tuple(
      motherboardWithSharingArb({
        m2Slots: [m2Source],
        sataPorts: [targetPort],
      }),
      nvmeComponentArb({ protocol: "NVMe", pcie_gen: 4, lanes: 4 }).map((c) => ({
        ...c,
        form_factor: "2280" as string,
      }))
    );

    fc.assert(
      fc.property(scenarioArb, ([motherboard, nvmeComp]) => {
        // Only source is populated, target is empty
        const assignments: Record<string, string> = {
          [sourceSlotId]: nvmeComp.id,
        };
        const comps: Record<string, Component> = {
          [nvmeComp.id]: nvmeComp,
        };

        const results = validateAssignments(motherboard, assignments, comps);
        const warnings = results.filter(
          (r) => r.severity === "warning" && r.slotId === targetSlotId && r.message.includes(sourceSlotId)
        );
        expect(warnings.length).toBeGreaterThanOrEqual(1);
        expect(warnings.some((w) => w.message.includes("unavailable"))).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});

// -- Feature: validation-engine-gaps, Property 6: Bandwidth split produces warning with degraded lanes --

describe("Feature: validation-engine-gaps, Property 6: Bandwidth split produces warning with degraded lanes", () => {
  /**
   * Validates: Requirements 3.1, 5.2
   *
   * For any sharing rule of type "bandwidth_split" where the trigger condition
   * is met, the validation engine should produce a warning-severity result
   * whose message includes the degraded_lanes value.
   */

  test("Bandwidth split produces warning mentioning degraded lanes", () => {
    const sourceSlotId = "m2-bw-src";
    const targetSlotId = "pcie-bw-target";

    const scenarioArb = fc.integer({ min: 1, max: 8 }).chain((degradedLanes) => {
      const m2Source: M2Slot = {
        id: sourceSlotId,
        label: "M.2_1",
        interface: "PCIe",
        gen: 4,
        lanes: 4,
        form_factors: ["2280"],
        source: "CPU",
        supports_sata: false,
        heatsink_included: true,
        sharing: [{
          type: "bandwidth_split",
          target: targetSlotId,
          trigger: { slot_ids: [sourceSlotId], logic: "any_populated" },
          degraded_lanes: degradedLanes,
        }],
      };

      const targetPcie: PCIeSlot = {
        id: targetSlotId,
        label: "PCI_E1",
        gen: 4,
        electrical_lanes: 16,
        physical_size: "x16",
        position: 1,
        source: "Chipset",
        reinforced: false,
        sharing: null,
      };

      const mbArb = motherboardWithSharingArb({
        m2Slots: [m2Source],
        pcieSlots: [targetPcie],
      });

      const compArb = nvmeComponentArb({ protocol: "NVMe", pcie_gen: 4, lanes: 4 }).map((c) => ({
        ...c,
        form_factor: "2280" as string,
      }));

      return fc.tuple(mbArb, compArb, fc.constant(degradedLanes));
    });

    fc.assert(
      fc.property(scenarioArb, ([motherboard, nvmeComp, degradedLanes]) => {
        const assignments: Record<string, string> = {
          [sourceSlotId]: nvmeComp.id,
        };
        const comps: Record<string, Component> = {
          [nvmeComp.id]: nvmeComp,
        };

        const results = validateAssignments(motherboard, assignments, comps);
        const warnings = results.filter(
          (r) => r.severity === "warning" && r.slotId === targetSlotId && r.message.includes(sourceSlotId)
        );
        expect(warnings.length).toBeGreaterThanOrEqual(1);
        expect(warnings.some((w) => w.message.includes(String(degradedLanes)))).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});

// -- Feature: validation-engine-gaps, Property 7: Device filter prevents rule activation on non-matching components --

describe("Feature: validation-engine-gaps, Property 7: Device filter prevents rule activation on non-matching components", () => {
  /**
   * Validates: Requirements 3.2
   *
   * For any sharing rule with a device_filter and any component that does NOT
   * match the filter criteria, the validation engine should not produce any
   * results from that rule, even if the trigger condition is met.
   */

  test("Device filter blocks rule when component does not match", () => {
    const sourceSlotId = "m2-filter-src";
    const targetSlotId = "sata-filter-target";

    // Rule requires protocol: SATA, but we install an NVMe component
    const m2Source: M2Slot = {
      id: sourceSlotId,
      label: "M.2_1",
      interface: "PCIe_or_SATA",
      gen: 4,
      lanes: 4,
      form_factors: ["2280"],
      source: "Chipset",
      supports_sata: true,
      heatsink_included: true,
      sharing: [{
        type: "disables",
        targets: [targetSlotId],
        trigger: { slot_ids: [sourceSlotId], logic: "any_populated" },
        device_filter: { protocol: "SATA" },
      }],
    };

    const targetPort: SATAPort = {
      id: targetSlotId,
      version: "3.0",
      source: "Chipset",
      disabled_by: null,
    };

    const scenarioArb = fc.tuple(
      motherboardWithSharingArb({
        m2Slots: [m2Source],
        sataPorts: [targetPort],
      }),
      // NVMe protocol component -- does NOT match the SATA filter
      nvmeComponentArb({ protocol: "NVMe", pcie_gen: 4, lanes: 4 }).map((c) => ({
        ...c,
        form_factor: "2280" as string,
      }))
    );

    fc.assert(
      fc.property(scenarioArb, ([motherboard, nvmeComp]) => {
        const assignments: Record<string, string> = {
          [sourceSlotId]: nvmeComp.id,
        };
        const comps: Record<string, Component> = {
          [nvmeComp.id]: nvmeComp,
        };

        const results = validateAssignments(motherboard, assignments, comps);
        // No sharing results should reference the target since filter blocks it
        const sharingResults = results.filter(
          (r) => r.slotId === targetSlotId && r.message.includes(sourceSlotId)
        );
        expect(sharingResults.length).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  test("Device filter allows rule when component matches", () => {
    const sourceSlotId = "m2-filter-match-src";
    const targetSlotId = "sata-filter-match-target";

    // Rule requires protocol: SATA, and we install a SATA NVMe component
    const m2Source: M2Slot = {
      id: sourceSlotId,
      label: "M.2_1",
      interface: "PCIe_or_SATA",
      gen: 4,
      lanes: 4,
      form_factors: ["2280"],
      source: "Chipset",
      supports_sata: true,
      heatsink_included: true,
      sharing: [{
        type: "disables",
        targets: [targetSlotId],
        trigger: { slot_ids: [sourceSlotId], logic: "any_populated" },
        device_filter: { protocol: "SATA" },
      }],
    };

    const targetPort: SATAPort = {
      id: targetSlotId,
      version: "3.0",
      source: "Chipset",
      disabled_by: null,
    };

    const scenarioArb = fc.tuple(
      motherboardWithSharingArb({
        m2Slots: [m2Source],
        sataPorts: [targetPort],
      }),
      // SATA protocol component -- matches the filter
      nvmeComponentArb({ protocol: "SATA", pcie_gen: null, lanes: null }).map((c) => ({
        ...c,
        form_factor: "2280" as string,
      }))
    );

    fc.assert(
      fc.property(scenarioArb, ([motherboard, sataM2Comp]) => {
        const assignments: Record<string, string> = {
          [sourceSlotId]: sataM2Comp.id,
        };
        const comps: Record<string, Component> = {
          [sataM2Comp.id]: sataM2Comp,
        };

        const results = validateAssignments(motherboard, assignments, comps);
        // Sharing results should fire since filter matches
        const sharingResults = results.filter(
          (r) => r.slotId === targetSlotId && r.message.includes(sourceSlotId)
        );
        expect(sharingResults.length).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 100 }
    );
  });
});


// -- Feature: validation-engine-gaps, Property 16: Sharing-related results reference source and affected slot IDs --

describe("Feature: validation-engine-gaps, Property 16: Sharing-related results reference source and affected slot IDs", () => {
  /**
   * Validates: Requirements 9.5
   *
   * For any sharing rule that fires (trigger condition met), every resulting
   * ValidationResult message should contain both the source slot ID (the slot
   * whose rule triggered) and the affected target slot ID.
   */

  test("Sharing results contain both source and target slot IDs in message", () => {
    const sourceSlotId = "m2-msg-src";
    const targetSlotId1 = "sata-msg-t1";
    const targetSlotId2 = "sata-msg-t2";

    const ruleTypeArb = fc.constantFrom("disables" as const, "bandwidth_split" as const);

    const scenarioArb = ruleTypeArb.chain((ruleType) => {
      const targets = ruleType === "disables" ? [targetSlotId1, targetSlotId2] : [targetSlotId1];
      const rule: SharingRule = {
        type: ruleType,
        targets,
        trigger: { slot_ids: [sourceSlotId], logic: "any_populated" },
        ...(ruleType === "bandwidth_split" ? { degraded_lanes: 2 } : {}),
      };

      const m2Source: M2Slot = {
        id: sourceSlotId,
        label: "M.2_1",
        interface: "PCIe",
        gen: 4,
        lanes: 4,
        form_factors: ["2280"],
        source: "CPU",
        supports_sata: false,
        heatsink_included: true,
        sharing: [rule],
      };

      const port1: SATAPort = {
        id: targetSlotId1,
        version: "3.0",
        source: "Chipset",
        disabled_by: null,
      };

      const port2: SATAPort = {
        id: targetSlotId2,
        version: "3.0",
        source: "Chipset",
        disabled_by: null,
      };

      const mbArb = motherboardWithSharingArb({
        m2Slots: [m2Source],
        sataPorts: [port1, port2],
      });

      const compArb = nvmeComponentArb({ protocol: "NVMe", pcie_gen: 4, lanes: 4 }).map((c) => ({
        ...c,
        form_factor: "2280" as string,
      }));

      return fc.tuple(mbArb, compArb, fc.constant(targets));
    });

    fc.assert(
      fc.property(scenarioArb, ([motherboard, nvmeComp, targets]) => {
        const assignments: Record<string, string> = {
          [sourceSlotId]: nvmeComp.id,
        };
        const comps: Record<string, Component> = {
          [nvmeComp.id]: nvmeComp,
        };

        const results = validateAssignments(motherboard, assignments, comps);

        // Filter to sharing-related results (those referencing target slots)
        const sharingResults = results.filter(
          (r) => targets.includes(r.slotId) && r.message.includes(sourceSlotId)
        );

        expect(sharingResults.length).toBeGreaterThanOrEqual(1);

        // Every sharing result must contain both source and target slot IDs
        for (const result of sharingResults) {
          expect(result.message).toContain(sourceSlotId);
          expect(result.message).toContain(result.slotId);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// -- Feature: validation-engine-gaps, Property 15: Empty assignments produce empty results --

describe("Feature: validation-engine-gaps, Property 15: Empty assignments produce empty results", () => {
  /**
   * Validates: Requirements 9.4
   *
   * For any motherboard and any component map, if the assignment map is empty,
   * the validation engine should return an empty array.
   */

  test("Empty assignments always produce empty results", () => {
    // Generate arbitrary motherboards with various slot configurations
    const motherboardArb = fc.record({
      id: idArb,
      manufacturer: nonEmptyStringArb,
      model: nonEmptyStringArb,
      chipset: fc.constantFrom("Z890", "X870", "B650"),
      socket: fc.constantFrom("LGA1851", "AM5"),
      form_factor: fc.constantFrom("ATX", "Micro-ATX"),
      memory: memoryConfigWithSlotsArb(
        [
          { id: "dimm_a1", channel: "A", position: 0, recommended: false },
          { id: "dimm_a2", channel: "A", position: 1, recommended: true },
        ],
        { recommended_population: { two_dimm: ["dimm_a1", "dimm_a2"] } }
      ),
      m2_slots: fc.array(m2SlotArb(), { minLength: 0, maxLength: 3 }),
      pcie_slots: fc.array(pcieSlotArb, { minLength: 0, maxLength: 2 }),
      sata_ports: fc.array(sataPortArb, { minLength: 0, maxLength: 4 }),
      sources: fc.constant([{ type: "manual", url: "https://example.com" }] as { type: string; url: string }[]),
      schema_version: fc.constant("2.0" as string),
    });

    // Generate an arbitrary component map (non-empty, to prove it is ignored)
    const componentMapArb = fc
      .array(
        fc.oneof(
          nvmeComponentArb(),
          sataComponentArb,
          ramComponentArb()
        ),
        { minLength: 0, maxLength: 5 }
      )
      .map((comps) => {
        const map: Record<string, Component> = {};
        for (const c of comps) {
          map[c.id] = c;
        }
        return map;
      });

    fc.assert(
      fc.property(motherboardArb, componentMapArb, (motherboard, components) => {
        const emptyAssignments: Record<string, string> = {};
        const results = validateAssignments(motherboard, emptyAssignments, components);
        expect(results).toEqual([]);
      }),
      { numRuns: 100 }
    );
  });
});
