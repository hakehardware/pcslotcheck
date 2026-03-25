// Unit tests and property tests for the CPU component JSON Schema.
// Verifies the schema rejects missing required fields and accepts valid CPU objects.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import * as fs from "fs";
import * as path from "path";
import {
  arbCPUComponent,
  arbCPUOverride,
  MICROARCHITECTURES,
} from "./generators";

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
  "architecture",
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
    architecture: "Zen 5",
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

  it("accepts when pcie_config is missing cpu_lanes (cpu_lanes is optional)", () => {
    const obj = { ...validCpuObject(), pcie_config: { cpu_gen: 5 } };
    const valid = validate(obj);
    expect(valid).toBe(true);
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

const optionalInt = (max: number) =>
  fc.option(fc.integer({ min: 1, max }), { nil: undefined });

const cpuArb = fc
  .record({
    id: nonEmptyString,
    type: fc.constant("cpu" as const),
    manufacturer: nonEmptyString,
    model: nonEmptyString,
    socket: nonEmptyString,
    microarchitecture: nonEmptyString,
    architecture: nonEmptyString,
    pcie_config_cpu_gen: fc.integer({ min: 1, max: 6 }),
    pcie_config_cpu_lanes: optionalInt(128),
    cores: optionalInt(256),
    threads: optionalInt(512),
    tdp_w: optionalInt(1000),
    schema_version: versionString,
  })
  .map((raw) => {
    const pcie_config: Record<string, number> = { cpu_gen: raw.pcie_config_cpu_gen };
    if (raw.pcie_config_cpu_lanes !== undefined) {
      pcie_config.cpu_lanes = raw.pcie_config_cpu_lanes;
    }
    const obj: Record<string, unknown> = {
      id: raw.id,
      type: raw.type,
      manufacturer: raw.manufacturer,
      model: raw.model,
      socket: raw.socket,
      microarchitecture: raw.microarchitecture,
      architecture: raw.architecture,
      pcie_config,
      schema_version: raw.schema_version,
    };
    if (raw.cores !== undefined) obj.cores = raw.cores;
    if (raw.threads !== undefined) obj.threads = raw.threads;
    if (raw.tdp_w !== undefined) obj.tdp_w = raw.tdp_w;
    return obj;
  });

// -- Valid top-level field names (used to filter extra-key generation) ---------

const VALID_FIELD_NAMES = [
  "id",
  "type",
  "manufacturer",
  "model",
  "socket",
  "microarchitecture",
  "architecture",
  "pcie_config",
  "schema_version",
  "cores",
  "threads",
  "tdp_w",
];

// -- Property 1: CPU schema accepts valid objects with required and optional fields

describe("Property 1: CPU schema accepts valid objects with required and optional fields", () => {
  /**
   * Validates: Requirements 1.1, 1.2, 1.4, 2.1, 2.3, 2.4, 6.4, 6.5
   */
  const ajv = makeAjv();
  const validate = ajv.compile(cpuSchema);

  it("accepts any valid CPU object with all required fields and any valid combination of optional fields", () => {
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
          s.trim().length > 0 && !VALID_FIELD_NAMES.includes(s)
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

// -- Property 2: CPU schema rejects objects missing required fields -----------

describe("Property 2: CPU schema rejects objects missing required fields", () => {
  /**
   * Validates: Requirements 1.3, 2.2
   */
  const ajv = makeAjv();
  const validate = ajv.compile(cpuSchema);

  const TOP_LEVEL_REQUIRED = [
    "id",
    "type",
    "manufacturer",
    "model",
    "socket",
    "microarchitecture",
    "architecture",
    "pcie_config",
    "schema_version",
  ] as const;

  it("rejects when any one required top-level field is removed", () => {
    const fieldArb = fc.constantFrom(...TOP_LEVEL_REQUIRED);

    fc.assert(
      fc.property(cpuArb, fieldArb, (obj, fieldToRemove) => {
        const mutated = { ...obj };
        delete (mutated as Record<string, unknown>)[fieldToRemove];
        const valid = validate(mutated);
        expect(valid).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it("rejects when cpu_gen is removed from pcie_config", () => {
    fc.assert(
      fc.property(cpuArb, (obj) => {
        const pcie = { ...(obj as Record<string, unknown>).pcie_config as Record<string, unknown> };
        delete pcie.cpu_gen;
        const mutated = { ...obj, pcie_config: pcie };
        const valid = validate(mutated);
        expect(valid).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it("does NOT reject when cpu_lanes is removed from pcie_config", () => {
    fc.assert(
      fc.property(cpuArb, (obj) => {
        const pcie = { ...(obj as Record<string, unknown>).pcie_config as Record<string, unknown> };
        delete pcie.cpu_lanes;
        const mutated = { ...obj, pcie_config: pcie };
        const valid = validate(mutated);
        expect(valid).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});


// -- Property 3: Generated CPU microarchitectures come from the codename pool

describe("Property 3: Generated CPU microarchitectures come from the codename pool", () => {
  /**
   * Validates: Requirements 3.1, 3.2, 3.3
   */

  const EXPECTED_CODENAMES = [
    "Raphael",
    "Phoenix",
    "Phoenix 2",
    "Granite Ridge",
    "Strix Point",
    "Alder Lake",
    "Raptor Lake",
    "Raptor Lake Refresh",
    "Arrow Lake",
  ];

  it("MICROARCHITECTURES contains exactly the nine expected codenames", () => {
    expect([...MICROARCHITECTURES]).toEqual(EXPECTED_CODENAMES);
    expect(MICROARCHITECTURES).toHaveLength(9);
  });

  it("any CPU from arbCPUComponent() has a microarchitecture in MICROARCHITECTURES", () => {
    fc.assert(
      fc.property(arbCPUComponent(), (cpu) => {
        expect((MICROARCHITECTURES as readonly string[]).includes(cpu.microarchitecture)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("any override from arbCPUOverride() has a microarchitecture in MICROARCHITECTURES", () => {
    fc.assert(
      fc.property(arbCPUOverride(), (override) => {
        expect((MICROARCHITECTURES as readonly string[]).includes(override.microarchitecture)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});
