import { describe, test, expect } from "vitest";
import * as fc from "fast-check";
import { validateAssignments } from "../../src/lib/validation-engine";
import type {
  Motherboard,
  SATAPort,
  SATASSDComponent,
  SATAHDDComponent,
  NVMeComponent,
  GPUComponent,
  RAMComponent,
  CPUComponent,
  Component,
  MemoryConfig,
} from "../../src/lib/types";

// -- Generators --

const idArb = fc
  .stringMatching(/^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$/)
  .filter((s) => s.length >= 2);

const nonEmptyStringArb = fc
  .stringMatching(/^[A-Za-z0-9][A-Za-z0-9 _-]{0,19}$/)
  .filter((s) => s.length >= 1);

const capacityArb = fc.integer({ min: 120, max: 16000 });

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

/** Generate a random SATAPort. */
const sataPortArb: fc.Arbitrary<SATAPort> = fc.record({
  id: idArb,
  version: fc.constant("SATA III"),
  source: fc.constantFrom("CPU" as const, "Chipset" as const),
  disabled_by: fc.constant(null),
});

/** Build a minimal Motherboard with one SATA port. */
function motherboardWithSataPort(port: SATAPort): Motherboard {
  return {
    id: "test-board",
    manufacturer: "Test",
    model: "Test Board",
    chipset: "Z890",
    socket: "LGA1851",
    form_factor: "ATX",
    memory: {
      type: "DDR5",
      max_speed_mhz: 6400,
      base_speed_mhz: 4800,
      max_capacity_gb: 192,
      ecc_support: false,
      channels: 2,
      slots: [],
      recommended_population: { two_dimm: [] },
    },
    m2_slots: [],
    pcie_slots: [],
    sata_ports: [port],
    sources: [],
    schema_version: "1.0",
  };
}

/** Generate a random SATA SSD component. */
const sataSsdArb: fc.Arbitrary<SATASSDComponent> = fc.record({
  id: idArb,
  type: fc.constant("sata_ssd" as const),
  manufacturer: nonEmptyStringArb,
  model: nonEmptyStringArb,
  form_factor: fc.constant("2.5"),
  capacity_gb: capacityArb,
  interface: fc.constant("SATA III"),
  drive_type: fc.constant("ssd" as const),
  schema_version: fc.constant("1.0"),
});

/** Generate a random SATA HDD component. */
const sataHddArb: fc.Arbitrary<SATAHDDComponent> = fc.record({
  id: idArb,
  type: fc.constant("sata_hdd" as const),
  manufacturer: nonEmptyStringArb,
  model: nonEmptyStringArb,
  form_factor: fc.constant("3.5"),
  capacity_gb: capacityArb,
  interface: fc.constant("SATA III"),
  drive_type: fc.constant("hdd" as const),
  schema_version: fc.constant("1.0"),
});

/** Generate a non-SATA component (NVMe, GPU, RAM, or CPU). */
const nonSataComponentArb: fc.Arbitrary<Component> = fc.oneof(
  // NVMe
  fc.record({
    id: idArb,
    type: fc.constant("nvme" as const),
    manufacturer: nonEmptyStringArb,
    model: nonEmptyStringArb,
    interface: fc.constant({
      protocol: "NVMe" as const,
      pcie_gen: 4,
      lanes: 4,
    }),
    form_factor: fc.constant("2280"),
    capacity_gb: capacityArb,
    schema_version: fc.constant("1.0"),
  }) as fc.Arbitrary<Component>,
  // GPU
  fc.record({
    id: idArb,
    type: fc.constant("gpu" as const),
    chip_manufacturer: fc.constant("NVIDIA"),
    manufacturer: nonEmptyStringArb,
    model: nonEmptyStringArb,
    interface: fc.constant({ pcie_gen: 4, lanes: 16 }),
    physical: fc.constant({ slot_width: 2, length_mm: 300, slots_occupied: 2 }),
    power: fc.constant({
      tdp_w: 200,
      recommended_psu_w: 650,
      power_connectors: [{ type: "8-pin", count: 1 }] as { type: string; count: number }[],
    }),
    schema_version: fc.constant("1.0"),
  }) as fc.Arbitrary<Component>,
  // RAM
  fc.record({
    id: idArb,
    type: fc.constant("ram" as const),
    manufacturer: nonEmptyStringArb,
    model: nonEmptyStringArb,
    interface: fc.constant({ type: "DDR5" as const, speed_mhz: 6000, base_speed_mhz: 4800 }),
    capacity: fc.constant({ per_module_gb: 16, modules: 2, total_gb: 32 }),
    schema_version: fc.constant("1.0"),
  }) as fc.Arbitrary<Component>,
  // CPU
  fc.record({
    id: idArb,
    type: fc.constant("cpu" as const),
    manufacturer: nonEmptyStringArb,
    model: nonEmptyStringArb,
    socket: fc.constant("LGA1851"),
    microarchitecture: fc.constant("Raptor Lake"),
    architecture: fc.constant("x86_64"),
    pcie_config: fc.constant({ cpu_gen: 5, cpu_lanes: 20 }),
    schema_version: fc.constant("1.0"),
  }) as fc.Arbitrary<Component>
);


// -- Property 9: Both SATA subtypes are valid in SATA port assignments --
// Feature: sata-schema-split, Property 9: Both SATA subtypes are valid in SATA port assignments
// Validates: Requirements 7.1, 7.2

describe("Feature: sata-schema-split, Property 9: Both SATA subtypes are valid in SATA port assignments", () => {
  test("sata_ssd components produce no type-incompatibility error in SATA port assignments", () => {
    fc.assert(
      fc.property(sataPortArb, sataSsdArb, (port, component) => {
        const motherboard = motherboardWithSataPort(port);
        const assignments: Record<string, string> = { [port.id]: component.id };
        const components: Record<string, Component> = { [component.id]: component };

        const results = validateAssignments(motherboard, assignments, components);

        const typeErrors = results.filter(
          (r) => r.severity === "error" && r.message.includes("incompatible component type")
        );
        expect(typeErrors).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });

  test("sata_hdd components produce no type-incompatibility error in SATA port assignments", () => {
    fc.assert(
      fc.property(sataPortArb, sataHddArb, (port, component) => {
        const motherboard = motherboardWithSataPort(port);
        const assignments: Record<string, string> = { [port.id]: component.id };
        const components: Record<string, Component> = { [component.id]: component };

        const results = validateAssignments(motherboard, assignments, components);

        const typeErrors = results.filter(
          (r) => r.severity === "error" && r.message.includes("incompatible component type")
        );
        expect(typeErrors).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });
});

// -- Property 10: Non-SATA components are rejected in SATA port assignments --
// Feature: sata-schema-split, Property 10: Non-SATA components are rejected in SATA port assignments
// Validates: Requirements 7.3

describe("Feature: sata-schema-split, Property 10: Non-SATA components are rejected in SATA port assignments", () => {
  test("non-SATA components produce a type-incompatibility error in SATA port assignments", () => {
    fc.assert(
      fc.property(sataPortArb, nonSataComponentArb, (port, component) => {
        const motherboard = motherboardWithSataPort(port);
        const assignments: Record<string, string> = { [port.id]: component.id };
        const components: Record<string, Component> = { [component.id]: component };

        const results = validateAssignments(motherboard, assignments, components);

        const typeErrors = results.filter(
          (r) => r.severity === "error" && r.message.includes("incompatible component type")
        );
        expect(typeErrors.length).toBeGreaterThanOrEqual(1);
        expect(typeErrors[0].slotId).toBe(port.id);
        expect(typeErrors[0].componentId).toBe(component.id);
      }),
      { numRuns: 100 }
    );
  });
});

// -- Property 11: Legacy sata_drive type is accepted in SATA port assignments --
// Feature: sata-schema-split, Property 11: Legacy sata_drive type is accepted in SATA port assignments
// Validates: Requirements 9.1

describe("Feature: sata-schema-split, Property 11: Legacy sata_drive type is accepted in SATA port assignments", () => {
  test("components with legacy sata_drive type produce no type-incompatibility error", () => {
    // Since "sata_drive" is no longer in the Component union, we cast to Component
    const legacySataDriveArb = fc.record({
      id: idArb,
      type: fc.constant("sata_drive"),
      manufacturer: nonEmptyStringArb,
      model: nonEmptyStringArb,
      form_factor: fc.constantFrom("2.5", "3.5"),
      capacity_gb: capacityArb,
      interface: fc.constant("SATA III"),
      schema_version: fc.constant("1.0"),
    }) as unknown as fc.Arbitrary<Component>;

    fc.assert(
      fc.property(sataPortArb, legacySataDriveArb, (port, component) => {
        const motherboard = motherboardWithSataPort(port);
        const assignments: Record<string, string> = { [port.id]: component.id };
        const components: Record<string, Component> = { [component.id]: component };

        const results = validateAssignments(motherboard, assignments, components);

        const typeErrors = results.filter(
          (r) => r.severity === "error" && r.message.includes("incompatible component type")
        );
        expect(typeErrors).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });
});
