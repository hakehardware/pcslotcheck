// Unit tests and property tests for the CPU component JSON Schema.
// Verifies the schema rejects missing required fields and accepts valid CPU objects.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import * as fs from "fs";
import * as path from "path";

// -- Schema loading -----------------------------------------------------------

const SCHEMA_DIR = path.resolve(__dirname, "..", "..", "..", "data", "schema");

function loadSchema(filename: string) {
  return JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, filename), "utf-8"));
}

const cpuSchema = loadSchema("component-cpu.schema.json");

function makeAjv() {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  return ajv;
}

// -- Helpers ------------------------------------------------------------------

const REQUIRED_FIELDS = [
  "id",
  "type",
  "manufacturer",
  "model",
  "socket",
  "microarchitecture",
  "pcie_config",
  "schema_version",
] as const;

function validCpuObject() {
  return {
    id: "test-cpu-1",
    type: "cpu",
    manufacturer: "TestMfg",
    model: "Test CPU 1000",
    socket: "AM5",
    microarchitecture: "Zen 5",
    pcie_config: {
      cpu_gen: 5,
      cpu_lanes: 28,
    },
    schema_version: "1.0",
  };
}

// -- Unit tests ---------------------------------------------------------------

describe("CPU schema unit tests", () => {
  const ajv = makeAjv();
  const validate = ajv.compile(cpuSchema);

  it("accepts a valid CPU object", () => {
    const obj = validCpuObject();
    const valid = validate(obj);
    expect(valid).toBe(true);
  });

  for (const field of REQUIRED_FIELDS) {
    it(`rejects when required field "${field}" is missing`, () => {
      const obj = validCpuObject() as Record<string, unknown>;
      delete obj[field];
      const valid = validate(obj);
      expect(valid).toBe(false);
    });
  }

  it("rejects when type is not 'cpu'", () => {
    const obj = { ...validCpuObject(), type: "gpu" };
    const valid = validate(obj);
    expect(valid).toBe(false);
  });

  it("rejects when pcie_config is missing cpu_gen", () => {
    const obj = { ...validCpuObject(), pcie_config: { cpu_lanes: 28 } };
    const valid = validate(obj);
    expect(valid).toBe(false);
  });

  it("rejects when pcie_config is missing cpu_lanes", () => {
    const obj = { ...validCpuObject(), pcie_config: { cpu_gen: 5 } };
    const valid = validate(obj);
    expect(valid).toBe(false);
  });

  it("rejects when pcie_config has additional properties", () => {
    const obj = {
      ...validCpuObject(),
      pcie_config: { cpu_gen: 5, cpu_lanes: 28, extra: true },
    };
    const valid = validate(obj);
    expect(valid).toBe(false);
  });

  it("rejects when additional top-level properties are present", () => {
    const obj = { ...validCpuObject(), extra_field: "not allowed" };
    const valid = validate(obj);
    expect(valid).toBe(false);
  });

  it("rejects when cpu_gen is not an integer", () => {
    const obj = {
      ...validCpuObject(),
      pcie_config: { cpu_gen: 4.5, cpu_lanes: 28 },
    };
    const valid = validate(obj);
    expect(valid).toBe(false);
  });

  it("rejects when cpu_gen is less than 1", () => {
    const obj = {
      ...validCpuObject(),
      pcie_config: { cpu_gen: 0, cpu_lanes: 28 },
    };
    const valid = validate(obj);
    expect(valid).toBe(false);
  });
});


// -- Arbitraries for property tests -------------------------------------------

const nonEmptyString = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0);

const versionString = fc.constantFrom("1.0", "1.1", "2.0");

const cpuArb = fc.record({
  id: nonEmptyString,
  type: fc.constant("cpu" as const),
  manufacturer: nonEmptyString,
  model: nonEmptyString,
  socket: nonEmptyString,
  microarchitecture: nonEmptyString,
  pcie_config: fc.record({
    cpu_gen: fc.integer({ min: 1, max: 6 }),
    cpu_lanes: fc.integer({ min: 1, max: 128 }),
  }),
  schema_version: versionString,
});

// -- Property 1: CPU schema accepts valid objects and rejects extra properties

describe("Property 1: CPU schema accepts valid objects and rejects extra properties", () => {
  /**
   * Validates: Requirements 1.8, 1.9
   */
  const ajv = makeAjv();
  const validate = ajv.compile(cpuSchema);

  it("accepts any valid CPU object", () => {
    fc.assert(
      fc.property(cpuArb, (obj) => {
        const valid = validate(obj);
        expect(valid).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("rejects any valid CPU object with extra properties appended", () => {
    const extraKeyArb = fc
      .string({ minLength: 1, maxLength: 20 })
      .filter(
        (s) =>
          s.trim().length > 0 &&
          ![
            "id",
            "type",
            "manufacturer",
            "model",
            "socket",
            "microarchitecture",
            "pcie_config",
            "schema_version",
          ].includes(s)
      );

    fc.assert(
      fc.property(cpuArb, extraKeyArb, fc.anything(), (obj, key, value) => {
        const mutated = { ...obj, [key]: value };
        const valid = validate(mutated);
        expect(valid).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});
