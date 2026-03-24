import { describe, test, expect } from "vitest";
import * as fc from "fast-check";
import { validateAssignments } from "../../src/lib/validation-engine";
import type {
  Motherboard,
  M2Slot,
  NVMeComponent,
  Component,
  PCIeSlot,
  SATAPort,
  MemoryConfig,
} from "../../src/lib/types";

// ── Arbitraries ─────────────────────────────────────────────────────────────

const idArb = fc
  .stringMatching(/^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$/)
  .filter((s) => s.length >= 2);

const nonEmptyStringArb = fc
  .stringMatching(/^[A-Za-z0-9][A-Za-z0-9 _-]{0,19}$/)
  .filter((s) => s.length >= 1);

/** Minimal MemoryConfig to satisfy the Motherboard type. */
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

/** Generate a random M2Slot with configurable gen and supports_sata. */
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

/** Generate a random PCIeSlot. */
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

/** Generate a random SATAPort. */
const sataPortArb: fc.Arbitrary<SATAPort> = fc.record({
  id: idArb,
  version: fc.constant("SATA III"),
  source: fc.constantFrom("CPU" as const, "Chipset" as const),
  disabled_by: fc.constant(null),
});

/** Build a minimal Motherboard with one specific M2 slot. */
function minimalMotherboardArb(m2Slot: fc.Arbitrary<M2Slot>): fc.Arbitrary<Motherboard> {
  return fc
    .record({
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

/** Generate a random Motherboard with random slots for Property 9. */
const randomMotherboardArb: fc.Arbitrary<Motherboard> = fc.record({
  id: idArb,
  manufacturer: nonEmptyStringArb,
  model: nonEmptyStringArb,
  chipset: fc.constantFrom("Z890", "X870", "B650"),
  socket: fc.constantFrom("LGA1851", "AM5"),
  form_factor: fc.constantFrom("ATX", "Micro-ATX", "Mini-ITX"),
  memory: memoryConfigArb,
  m2_slots: fc.array(m2SlotArb(), { minLength: 0, maxLength: 4 }),
  pcie_slots: fc.array(pcieSlotArb, { minLength: 0, maxLength: 3 }),
  sata_ports: fc.array(sataPortArb, { minLength: 0, maxLength: 4 }),
  sources: fc.constant([{ type: "manual", url: "https://example.com" }]),
  schema_version: fc.constant("1.0"),
});

/** Generate a random NVMe component with specific interface config. */
function nvmeComponentArb(overrides: Partial<NVMeComponent["interface"]> = {}): fc.Arbitrary<NVMeComponent> {
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
    form_factor: fc.constantFrom("2280", "2242", "22110"),
    capacity_gb: fc.integer({ min: 256, max: 4000 }),
    schema_version: fc.constant("1.0"),
  });
}

/** Generate a random component map for Property 9. */
const randomComponentMapArb: fc.Arbitrary<Record<string, Component>> = fc
  .array(
    fc.oneof(
      nvmeComponentArb(),
      nvmeComponentArb({ protocol: "SATA", pcie_gen: null, lanes: null })
    ),
    { minLength: 0, maxLength: 5 }
  )
  .map((components) => {
    const map: Record<string, Component> = {};
    for (const c of components) {
      map[c.id] = c;
    }
    return map;
  });

// ── Property 8: Validation engine produces correct severity for slot-component incompatibilities ──

describe("Property 8: Validation engine produces correct severity for slot-component incompatibilities", () => {
  /**
   * Validates: Requirements 10.2, 10.3, 10.4
   */

  test("SATA M.2 drive in NVMe-only slot produces error", () => {
    // NVMe-only slot: supports_sata = false
    const slotArb = m2SlotArb({ supports_sata: false, interface: "PCIe" });
    const componentArb = nvmeComponentArb({ protocol: "SATA", pcie_gen: null, lanes: null });

    const scenarioArb = fc.tuple(
      minimalMotherboardArb(slotArb),
      componentArb
    );

    fc.assert(
      fc.property(scenarioArb, ([motherboard, component]) => {
        const slotId = motherboard.m2_slots[0].id;
        const assignments: Record<string, string> = { [slotId]: component.id };
        const components: Record<string, Component> = { [component.id]: component };

        const results = validateAssignments(motherboard, assignments, components);

        const errors = results.filter((r) => r.severity === "error");
        expect(errors.length).toBeGreaterThanOrEqual(1);
        expect(errors[0].slotId).toBe(slotId);
        expect(errors[0].componentId).toBe(component.id);
      }),
      { numRuns: 100 }
    );
  });

  test("Gen5 NVMe drive in Gen4 slot produces warning", () => {
    // Gen4 slot, Gen5 NVMe drive
    const slotArb = m2SlotArb({ gen: 4, supports_sata: true });
    const componentArb = nvmeComponentArb({ protocol: "NVMe", pcie_gen: 5, lanes: 4 });

    const scenarioArb = fc.tuple(
      minimalMotherboardArb(slotArb),
      componentArb
    );

    fc.assert(
      fc.property(scenarioArb, ([motherboard, component]) => {
        const slotId = motherboard.m2_slots[0].id;
        const assignments: Record<string, string> = { [slotId]: component.id };
        const components: Record<string, Component> = { [component.id]: component };

        const results = validateAssignments(motherboard, assignments, components);

        const warnings = results.filter((r) => r.severity === "warning");
        expect(warnings.length).toBeGreaterThanOrEqual(1);
        expect(warnings[0].slotId).toBe(slotId);
        expect(warnings[0].componentId).toBe(component.id);
      }),
      { numRuns: 100 }
    );
  });

  test("Gen4 NVMe drive in Gen5 slot produces info", () => {
    // Gen5 slot, Gen4 NVMe drive
    const slotArb = m2SlotArb({ gen: 5, supports_sata: true });
    const componentArb = nvmeComponentArb({ protocol: "NVMe", pcie_gen: 4, lanes: 4 });

    const scenarioArb = fc.tuple(
      minimalMotherboardArb(slotArb),
      componentArb
    );

    fc.assert(
      fc.property(scenarioArb, ([motherboard, component]) => {
        const slotId = motherboard.m2_slots[0].id;
        const assignments: Record<string, string> = { [slotId]: component.id };
        const components: Record<string, Component> = { [component.id]: component };

        const results = validateAssignments(motherboard, assignments, components);

        const infos = results.filter((r) => r.severity === "info");
        expect(infos.length).toBeGreaterThanOrEqual(1);
        expect(infos[0].slotId).toBe(slotId);
        expect(infos[0].componentId).toBe(component.id);
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 9: Empty assignments produce empty validation results ──────────

describe("Property 9: Empty assignments produce empty validation results", () => {
  /**
   * Validates: Requirements 10.5
   */

  test("empty assignments object always returns empty array", () => {
    const scenarioArb = fc.tuple(randomMotherboardArb, randomComponentMapArb);

    fc.assert(
      fc.property(scenarioArb, ([motherboard, components]) => {
        const results = validateAssignments(motherboard, {}, components);
        expect(results).toEqual([]);
      }),
      { numRuns: 100 }
    );
  });
});
