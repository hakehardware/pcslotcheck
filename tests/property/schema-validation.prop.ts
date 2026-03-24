import { describe, test, expect } from "vitest";
import * as fc from "fast-check";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import * as fs from "fs";
import * as path from "path";

// ── Schema loading ──────────────────────────────────────────────────────────

const SCHEMA_DIR = path.resolve(__dirname, "..", "..", "data", "schema");

function loadSchema(filename: string) {
  return JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, filename), "utf-8"));
}

const schemas = {
  motherboard: loadSchema("motherboard.schema.json"),
  nvme: loadSchema("component-nvme.schema.json"),
  gpu: loadSchema("component-gpu.schema.json"),
  ram: loadSchema("component-ram.schema.json"),
  sata: loadSchema("component-sata.schema.json"),
};

function makeAjv() {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  return ajv;
}

// ── Arbitraries for valid objects per schema ─────────────────────────────────

const nonEmptyString = fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0);
const versionString = fc.constantFrom("1.0", "1.1", "2.0");
const posInt = fc.integer({ min: 1, max: 100 });
const posNum = fc.double({ min: 0.1, max: 10000, noNaN: true, noDefaultInfinity: true });

// Motherboard arbitrary
const sharingRuleArb = fc.record({
  type: fc.constantFrom("disables" as const, "bandwidth_split" as const),
  condition: nonEmptyString,
});

const memorySlotArb = fc.record({
  id: nonEmptyString,
  channel: fc.constantFrom("A" as const, "B" as const),
  position: posInt,
  recommended: fc.boolean(),
});

const memoryConfigArb = fc.record({
  type: fc.constantFrom("DDR4" as const, "DDR5" as const),
  max_speed_mhz: posNum,
  base_speed_mhz: posNum,
  max_capacity_gb: posNum,
  ecc_support: fc.boolean(),
  channels: posInt,
  slots: fc.array(memorySlotArb, { minLength: 1, maxLength: 4 }),
  recommended_population: fc.record({
    two_dimm: fc.array(nonEmptyString, { minLength: 1, maxLength: 2 }),
  }),
});

const m2SlotArb = fc.record({
  id: nonEmptyString,
  label: nonEmptyString,
  interface: fc.constantFrom("PCIe" as const, "SATA" as const, "PCIe_or_SATA" as const),
  gen: posInt,
  lanes: posInt,
  form_factors: fc.array(nonEmptyString, { minLength: 1, maxLength: 3 }),
  source: fc.constantFrom("CPU" as const, "Chipset" as const),
  supports_sata: fc.boolean(),
  heatsink_included: fc.boolean(),
  sharing: fc.constantFrom(null),
});

const pcieSlotArb = fc.record({
  id: nonEmptyString,
  label: nonEmptyString,
  gen: posInt,
  electrical_lanes: posInt,
  physical_size: fc.constantFrom("x1" as const, "x4" as const, "x8" as const, "x16" as const),
  position: posInt,
  source: fc.constantFrom("CPU" as const, "Chipset" as const),
  reinforced: fc.boolean(),
  sharing: fc.constantFrom(null),
});

const sataPortArb = fc.record({
  id: nonEmptyString,
  version: nonEmptyString,
  source: fc.constantFrom("CPU" as const, "Chipset" as const),
  disabled_by: fc.constantFrom(null),
});

const sourceArb = fc.record({
  type: nonEmptyString,
  url: fc.webUrl(),
});

const motherboardArb = fc.record({
  id: nonEmptyString,
  manufacturer: nonEmptyString,
  model: nonEmptyString,
  chipset: nonEmptyString,
  socket: nonEmptyString,
  form_factor: fc.constantFrom("ATX" as const, "Micro-ATX" as const, "Mini-ITX" as const, "E-ATX" as const),
  memory: memoryConfigArb,
  m2_slots: fc.array(m2SlotArb, { minLength: 1, maxLength: 4 }),
  pcie_slots: fc.array(pcieSlotArb, { minLength: 1, maxLength: 4 }),
  sata_ports: fc.array(sataPortArb, { minLength: 1, maxLength: 6 }),
  sources: fc.array(sourceArb, { minLength: 1, maxLength: 3 }),
  schema_version: versionString,
});

// NVMe arbitrary
const nvmeArb = fc.record({
  id: nonEmptyString,
  type: fc.constant("nvme" as const),
  manufacturer: nonEmptyString,
  model: nonEmptyString,
  interface: fc.record({
    protocol: fc.constantFrom("NVMe" as const, "SATA" as const),
    pcie_gen: fc.oneof(posInt, fc.constant(null)),
    lanes: fc.oneof(posInt, fc.constant(null)),
  }),
  form_factor: nonEmptyString,
  capacity_gb: posNum,
  schema_version: versionString,
});

// Power connector arbitrary
const powerConnectorArb = fc.record({
  type: fc.constantFrom("6-pin" as const, "8-pin" as const, "12-pin" as const, "16-pin/12VHPWR" as const, "16-pin/12V-2x6" as const),
  count: fc.integer({ min: 1, max: 4 }),
});

// GPU arbitrary
const gpuArb = fc.record({
  id: nonEmptyString,
  type: fc.constant("gpu" as const),
  chip_manufacturer: nonEmptyString,
  manufacturer: nonEmptyString,
  model: nonEmptyString,
  interface: fc.record({
    pcie_gen: posInt,
    lanes: fc.constantFrom(1, 4, 8, 16),
  }),
  physical: fc.record({
    slot_width: posInt,
    length_mm: posNum,
    slots_occupied: fc.integer({ min: 1, max: 4 }),
  }),
  power: fc.record({
    tdp_w: posNum,
    recommended_psu_w: posNum,
    power_connectors: fc.array(powerConnectorArb, { minLength: 1, maxLength: 3 }),
  }),
  schema_version: versionString,
});

// RAM arbitrary
const ramArb = fc.record({
  id: nonEmptyString,
  type: fc.constant("ram" as const),
  manufacturer: nonEmptyString,
  model: nonEmptyString,
  interface: fc.record({
    type: fc.constantFrom("DDR4" as const, "DDR5" as const),
    speed_mhz: posNum,
    base_speed_mhz: posNum,
  }),
  capacity: fc.record({
    per_module_gb: posNum,
    modules: posInt,
    total_gb: posNum,
  }),
  schema_version: versionString,
});

// SATA arbitrary
const sataArb = fc.record({
  id: nonEmptyString,
  type: fc.constant("sata_drive" as const),
  manufacturer: nonEmptyString,
  model: nonEmptyString,
  form_factor: nonEmptyString,
  capacity_gb: posNum,
  interface: nonEmptyString,
  schema_version: versionString,
});

// Map of schema type to its arbitrary and required fields
const schemaEntries = [
  {
    name: "motherboard",
    schema: schemas.motherboard,
    arb: motherboardArb,
    requiredFields: ["id", "manufacturer", "model", "chipset", "socket", "form_factor", "memory", "m2_slots", "pcie_slots", "sata_ports", "sources", "schema_version"],
  },
  {
    name: "nvme",
    schema: schemas.nvme,
    arb: nvmeArb,
    requiredFields: ["id", "type", "manufacturer", "model", "interface", "form_factor", "capacity_gb", "schema_version"],
  },
  {
    name: "gpu",
    schema: schemas.gpu,
    arb: gpuArb,
    requiredFields: ["id", "type", "chip_manufacturer", "manufacturer", "model", "interface", "physical", "power", "schema_version"],
  },
  {
    name: "ram",
    schema: schemas.ram,
    arb: ramArb,
    requiredFields: ["id", "type", "manufacturer", "model", "interface", "capacity", "schema_version"],
  },
  {
    name: "sata",
    schema: schemas.sata,
    arb: sataArb,
    requiredFields: ["id", "type", "manufacturer", "model", "form_factor", "capacity_gb", "interface", "schema_version"],
  },
] as const;


// ── Property 1: Schema validation accepts valid YAML and rejects YAML with missing required fields ──

describe("Property 1: Schema validation accepts valid YAML and rejects YAML with missing required fields", () => {
  /**
   * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
   */
  for (const entry of schemaEntries) {
    test(`valid ${entry.name} objects pass schema validation`, () => {
      const ajv = makeAjv();
      const validate = ajv.compile(entry.schema);

      fc.assert(
        fc.property(entry.arb, (obj) => {
          const valid = validate(obj);
          expect(valid).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    test(`${entry.name} objects with a missing required field fail schema validation`, () => {
      const ajv = makeAjv();
      const validate = ajv.compile(entry.schema);
      const fieldIndexArb = fc.integer({ min: 0, max: entry.requiredFields.length - 1 });

      fc.assert(
        fc.property(entry.arb, fieldIndexArb, (obj, fieldIndex) => {
          const fieldToRemove = entry.requiredFields[fieldIndex];
          const mutated = { ...obj } as Record<string, unknown>;
          delete mutated[fieldToRemove];

          const valid = validate(mutated);
          expect(valid).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  }
});

// ── Property 2: YAML file ID must match filename stem ───────────────────────

describe("Property 2: YAML file ID must match filename stem", () => {
  /**
   * Validates: Requirements 3.6
   *
   * The validate.ts script checks that record.id === path.basename(filePath, ".yaml").
   * We replicate that logic here as a pure function and test it with random pairs.
   */
  function idMatchesFilename(id: string, filename: string): boolean {
    const stem = filename.endsWith(".yaml") ? filename.slice(0, -5) : filename;
    return id === stem;
  }

  // Filename-safe string: lowercase alphanumeric + hyphens
  const filenameStem = fc
    .stringMatching(/^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$/)
    .filter((s) => s.length >= 2);

  test("matching id and filename stem are accepted", () => {
    fc.assert(
      fc.property(filenameStem, (stem) => {
        const filename = `${stem}.yaml`;
        expect(idMatchesFilename(stem, filename)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  test("mismatched id and filename stem are rejected", () => {
    fc.assert(
      fc.property(filenameStem, filenameStem, (id, stem) => {
        fc.pre(id !== stem); // only test when they differ
        const filename = `${stem}.yaml`;
        expect(idMatchesFilename(id, filename)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 5: Validation error reporting includes file path and error details ──

describe("Property 5: Validation error reporting includes file path and error details", () => {
  /**
   * Validates: Requirements 5.3, 5.6
   *
   * For any invalid YAML object (missing a required field), ajv validation errors
   * contain meaningful instancePath and message fields.
   */
  for (const entry of schemaEntries) {
    test(`${entry.name} validation errors include instancePath and message`, () => {
      const ajv = makeAjv();
      const validate = ajv.compile(entry.schema);
      const fieldIndexArb = fc.integer({ min: 0, max: entry.requiredFields.length - 1 });

      fc.assert(
        fc.property(entry.arb, fieldIndexArb, (obj, fieldIndex) => {
          const fieldToRemove = entry.requiredFields[fieldIndex];
          const mutated = { ...obj } as Record<string, unknown>;
          delete mutated[fieldToRemove];

          const valid = validate(mutated);
          expect(valid).toBe(false);
          expect(validate.errors).toBeDefined();
          expect(validate.errors!.length).toBeGreaterThan(0);

          // Every error must have a message string
          for (const err of validate.errors!) {
            expect(typeof err.instancePath).toBe("string");
            expect(typeof err.message).toBe("string");
            expect(err.message!.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 100 }
      );
    });
  }
});
