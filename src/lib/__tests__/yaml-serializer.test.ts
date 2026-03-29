import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  serializeToYaml,
  parseYaml,
  PROPERTY_ORDER,
} from "../yaml-serializer";
import type { ComponentTypeKey } from "../form-helpers";

// ---------------------------------------------------------------------------
// Generators for valid form data objects per component type
// ---------------------------------------------------------------------------

const nonEmptyString = fc.string({ minLength: 1, maxLength: 30 }).filter((s) => /[a-zA-Z0-9]/.test(s));
const positiveInt = fc.integer({ min: 1, max: 9999 });
const positiveNumber = fc.double({ min: 0.1, max: 99999, noNaN: true, noDefaultInfinity: true });
const schemaVersionStr = fc.constantFrom("1.0", "1.1", "2.0");

function gpuDataArb() {
  const connectorType = fc.constantFrom("6-pin", "8-pin", "12-pin", "16-pin/12VHPWR", "16-pin/12V-2x6");
  const powerConnector = fc.record({
    type: connectorType,
    count: fc.integer({ min: 1, max: 4 }),
  });

  return fc.record({
    id: nonEmptyString,
    type: fc.constant("gpu"),
    chip_manufacturer: fc.constantFrom("NVIDIA", "AMD", "Intel"),
    manufacturer: nonEmptyString,
    model: nonEmptyString,
    interface: fc.record({
      pcie_gen: fc.integer({ min: 1, max: 5 }),
      lanes: fc.constantFrom(1, 4, 8, 16),
    }),
    physical: fc.record({
      slot_width: fc.integer({ min: 1, max: 16 }),
      length_mm: positiveNumber,
      slots_occupied: fc.integer({ min: 1, max: 4 }),
    }),
    power: fc.record({
      tdp_w: positiveNumber,
      recommended_psu_w: positiveNumber,
      power_connectors: fc.array(powerConnector, { minLength: 1, maxLength: 3 }),
    }),
    schema_version: schemaVersionStr,
  });
}

function cpuDataArb() {
  return fc.record({
    id: nonEmptyString,
    type: fc.constant("cpu"),
    manufacturer: nonEmptyString,
    model: nonEmptyString,
    socket: nonEmptyString,
    microarchitecture: nonEmptyString,
    architecture: nonEmptyString,
    pcie_config: fc.record({
      cpu_gen: fc.integer({ min: 1, max: 5 }),
    }),
    schema_version: schemaVersionStr,
  });
}

function nvmeDataArb() {
  return fc.record({
    id: nonEmptyString,
    type: fc.constant("nvme"),
    manufacturer: nonEmptyString,
    model: nonEmptyString,
    interface: fc.record({
      protocol: fc.constantFrom("NVMe", "SATA"),
      pcie_gen: fc.oneof(fc.integer({ min: 1, max: 5 }), fc.constant(null)),
      lanes: fc.oneof(fc.integer({ min: 1, max: 16 }), fc.constant(null)),
    }),
    form_factor: fc.constantFrom("M.2 2280", "M.2 2230", "M.2 2242"),
    capacity_gb: fc.constantFrom(256, 512, 1000, 2000, 4000),
    schema_version: schemaVersionStr,
  });
}

function ramDataArb() {
  return fc.record({
    id: nonEmptyString,
    type: fc.constant("ram"),
    manufacturer: nonEmptyString,
    model: nonEmptyString,
    interface: fc.record({
      type: fc.constantFrom("DDR4", "DDR5"),
      speed_mhz: positiveNumber,
      base_speed_mhz: positiveNumber,
    }),
    capacity: fc.record({
      per_module_gb: fc.constantFrom(8, 16, 32, 64),
      modules: fc.integer({ min: 1, max: 8 }),
      total_gb: positiveNumber,
    }),
    schema_version: schemaVersionStr,
  });
}

function sataSsdDataArb() {
  return fc.record({
    id: nonEmptyString,
    type: fc.constant("sata_ssd"),
    manufacturer: nonEmptyString,
    model: nonEmptyString,
    form_factor: fc.constantFrom("2.5\"", "mSATA"),
    capacity_gb: fc.constantFrom(120, 240, 480, 960, 1920),
    interface: fc.constant("SATA III"),
    drive_type: fc.constant("ssd"),
    schema_version: schemaVersionStr,
  });
}

function sataHddDataArb() {
  return fc.record({
    id: nonEmptyString,
    type: fc.constant("sata_hdd"),
    manufacturer: nonEmptyString,
    model: nonEmptyString,
    form_factor: fc.constantFrom("3.5\"", "2.5\""),
    capacity_gb: fc.constantFrom(500, 1000, 2000, 4000, 8000),
    interface: fc.constant("SATA III"),
    drive_type: fc.constant("hdd"),
    schema_version: schemaVersionStr,
  });
}

function motherboardDataArb() {
  // Simplified motherboard generator with required fields
  return fc.record({
    id: nonEmptyString,
    manufacturer: nonEmptyString,
    model: nonEmptyString,
    chipset: nonEmptyString,
    socket: nonEmptyString,
    form_factor: fc.constantFrom("ATX", "Micro-ATX", "Mini-ITX", "E-ATX"),
    memory: fc.record({
      type: fc.constantFrom("DDR4", "DDR5"),
      max_speed_mhz: positiveNumber,
      base_speed_mhz: positiveNumber,
      max_capacity_gb: positiveNumber,
      ecc_support: fc.boolean(),
      channels: fc.integer({ min: 1, max: 4 }),
      slots: fc.array(
        fc.record({
          id: nonEmptyString,
          channel: fc.constantFrom("A", "B"),
          position: fc.integer({ min: 1, max: 4 }),
          recommended: fc.boolean(),
        }),
        { minLength: 1, maxLength: 4 },
      ),
      recommended_population: fc.record({
        two_dimm: fc.array(nonEmptyString, { minLength: 0, maxLength: 4 }),
        four_dimm: fc.array(nonEmptyString, { minLength: 0, maxLength: 4 }),
      }),
    }),
    m2_slots: fc.array(
      fc.record({
        id: nonEmptyString,
        label: nonEmptyString,
        interface: fc.constantFrom("PCIe", "SATA", "PCIe_or_SATA"),
        gen: fc.integer({ min: 3, max: 5 }),
        lanes: fc.integer({ min: 1, max: 4 }),
        form_factors: fc.array(fc.constantFrom("2230", "2242", "2260", "2280", "22110"), { minLength: 1, maxLength: 3 }),
        source: fc.constantFrom("CPU", "Chipset"),
        supports_sata: fc.boolean(),
        heatsink_included: fc.boolean(),
        sharing: fc.constant(null),
      }),
      { minLength: 1, maxLength: 3 },
    ),
    pcie_slots: fc.array(
      fc.record({
        id: nonEmptyString,
        label: nonEmptyString,
        gen: fc.integer({ min: 3, max: 5 }),
        electrical_lanes: fc.constantFrom(1, 4, 8, 16),
        physical_size: fc.constantFrom("x1", "x4", "x8", "x16"),
        position: positiveInt,
        source: fc.constantFrom("CPU", "Chipset"),
        reinforced: fc.boolean(),
        sharing: fc.constant(null),
      }),
      { minLength: 1, maxLength: 4 },
    ),
    sata_ports: fc.array(
      fc.record({
        id: nonEmptyString,
        version: fc.constant("3.0"),
        source: fc.constantFrom("CPU", "Chipset"),
        disabled_by: fc.oneof(nonEmptyString, fc.constant(null)),
      }),
      { minLength: 1, maxLength: 6 },
    ),
    sources: fc.array(
      fc.record({
        type: fc.constantFrom("manual", "spec_sheet", "review"),
        url: nonEmptyString,
      }),
      { minLength: 1, maxLength: 3 },
    ),
    schema_version: schemaVersionStr,
  });
}

// Map component types to their generators
const componentGenerators: Record<ComponentTypeKey, fc.Arbitrary<Record<string, unknown>>> = {
  gpu: gpuDataArb(),
  cpu: cpuDataArb(),
  nvme: nvmeDataArb(),
  ram: ramDataArb(),
  sata_ssd: sataSsdDataArb(),
  sata_hdd: sataHddDataArb(),
  motherboard: motherboardDataArb(),
};

const allComponentTypes: ComponentTypeKey[] = [
  "motherboard",
  "cpu",
  "gpu",
  "nvme",
  "ram",
  "sata_ssd",
  "sata_hdd",
];

// ---------------------------------------------------------------------------
// Helper: extract top-level YAML keys in order from a YAML string
// ---------------------------------------------------------------------------
function extractTopLevelKeys(yamlString: string): string[] {
  const keys: string[] = [];
  for (const line of yamlString.split("\n")) {
    // Top-level keys start at column 0 with no leading whitespace
    const match = line.match(/^([a-z_][a-z0-9_]*):/);
    if (match) {
      keys.push(match[1]);
    }
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Feature: yaml-generator, Property 1: YAML serialization round-trip
// Validates: Requirements 6.6, 8.1, 8.2, 8.3, 8.4, 8.5, 12.3
// ---------------------------------------------------------------------------
describe("Property 1: YAML serialization round-trip", () => {
  for (const componentType of allComponentTypes) {
    it(`round-trips for ${componentType}`, () => {
      fc.assert(
        fc.property(componentGenerators[componentType], (data) => {
          const yaml = serializeToYaml(data, componentType);
          const parsed = parseYaml(yaml);
          expect(parsed).toEqual(data);
        }),
        { numRuns: 100 },
      );
    });
  }
});

// ---------------------------------------------------------------------------
// Feature: yaml-generator, Property 19: YAML field ordering matches schema
// Validates: Requirements 6.5
// ---------------------------------------------------------------------------
describe("Property 19: YAML field ordering matches schema", () => {
  for (const componentType of allComponentTypes) {
    it(`field order matches PROPERTY_ORDER for ${componentType}`, () => {
      fc.assert(
        fc.property(componentGenerators[componentType], (data) => {
          const yaml = serializeToYaml(data, componentType);
          const outputKeys = extractTopLevelKeys(yaml);
          const expectedOrder = PROPERTY_ORDER[componentType];

          // Filter expected order to only keys present in the data
          const expectedKeysInOrder = expectedOrder.filter((k) => k in data);

          // The output keys should appear in the same relative order as PROPERTY_ORDER
          // Filter output keys to only those in the expected order list
          const outputKeysInOrder = outputKeys.filter((k) => expectedOrder.includes(k));

          expect(outputKeysInOrder).toEqual(expectedKeysInOrder);
        }),
        { numRuns: 100 },
      );
    });
  }
});
