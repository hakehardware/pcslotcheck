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
  gpu: loadSchema("component-gpu.schema.json"),
  nvme: loadSchema("component-nvme.schema.json"),
  motherboard: loadSchema("motherboard.schema.json"),
};

function makeAjv() {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  return ajv;
}

// ── Arbitraries ─────────────────────────────────────────────────────────────

const nonEmptyString = fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0);
const posInt = fc.integer({ min: 1, max: 100 });
const posNum = fc.double({ min: 0.1, max: 10000, noNaN: true, noDefaultInfinity: true });

const powerConnectorArb = fc.record({
  type: fc.constantFrom("6-pin" as const, "8-pin" as const, "12-pin" as const, "16-pin/12VHPWR" as const, "16-pin/12V-2x6" as const),
  count: fc.integer({ min: 1, max: 4 }),
});

/** Generates a valid GPU object that passes schema validation */
const validGpuArb = fc.record({
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
  schema_version: fc.constant("2.0"),
});

/** Generates a valid NVMe object that passes schema validation */
const validNvmeArb = fc.record({
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
  schema_version: fc.constant("1.1"),
});

/** Generates a valid motherboard PCIe slot */
const validPcieSlotArb = fc.record({
  id: nonEmptyString,
  label: nonEmptyString,
  gen: posInt,
  electrical_lanes: posInt,
  physical_size: fc.constantFrom("x1" as const, "x4" as const, "x8" as const, "x16" as const),
  position: fc.integer({ min: 1, max: 10 }),
  source: fc.constantFrom("CPU" as const, "Chipset" as const),
  reinforced: fc.boolean(),
  sharing: fc.constantFrom(null),
});

const memorySlotArb = fc.record({
  id: nonEmptyString,
  channel: fc.constantFrom("A" as const, "B" as const),
  position: posInt,
  recommended: fc.boolean(),
});

const validMotherboardArb = fc.record({
  id: nonEmptyString,
  manufacturer: nonEmptyString,
  model: nonEmptyString,
  chipset: nonEmptyString,
  socket: nonEmptyString,
  form_factor: fc.constantFrom("ATX" as const, "Micro-ATX" as const, "Mini-ITX" as const, "E-ATX" as const),
  memory: fc.record({
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
  }),
  m2_slots: fc.array(
    fc.record({
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
    }),
    { minLength: 1, maxLength: 2 }
  ),
  pcie_slots: fc.array(validPcieSlotArb, { minLength: 1, maxLength: 3 }),
  sata_ports: fc.array(
    fc.record({
      id: nonEmptyString,
      version: nonEmptyString,
      source: fc.constantFrom("CPU" as const, "Chipset" as const),
      disabled_by: fc.constantFrom(null),
    }),
    { minLength: 1, maxLength: 4 }
  ),
  sources: fc.array(
    fc.record({ type: nonEmptyString, url: fc.webUrl() }),
    { minLength: 1, maxLength: 2 }
  ),
  schema_version: fc.constant("2.0"),
});

// ── Property 1: GPU schema rejects objects missing new required fields ──────

describe("Feature: granular-component-specs, Property 1: GPU schema rejects objects missing new required fields", () => {
  /**
   * Validates: Requirements 1.3, 2.1, 2.2
   *
   * For any valid GPU data object, removing either the chip_manufacturer field
   * or the physical.slots_occupied field should cause ajv schema validation to fail.
   */
  const ajv = makeAjv();
  const validate = ajv.compile(schemas.gpu);

  test("valid GPU objects pass schema validation", () => {
    fc.assert(
      fc.property(validGpuArb, (gpu) => {
        expect(validate(gpu)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  test("removing chip_manufacturer causes validation failure", () => {
    fc.assert(
      fc.property(validGpuArb, (gpu) => {
        const mutated = { ...gpu } as Record<string, unknown>;
        delete mutated.chip_manufacturer;
        expect(validate(mutated)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  test("removing physical.slots_occupied causes validation failure", () => {
    fc.assert(
      fc.property(validGpuArb, (gpu) => {
        const mutated = {
          ...gpu,
          physical: { slot_width: gpu.physical.slot_width, length_mm: gpu.physical.length_mm },
        };
        expect(validate(mutated)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  test("removing power.power_connectors causes validation failure", () => {
    fc.assert(
      fc.property(validGpuArb, (gpu) => {
        const mutated = {
          ...gpu,
          power: { tdp_w: gpu.power.tdp_w, recommended_psu_w: gpu.power.recommended_psu_w },
        };
        expect(validate(mutated)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 2: GPU slots_occupied constrained to 1–4 ──────────────────────

describe("Feature: granular-component-specs, Property 2: GPU slots_occupied constrained to 1–4", () => {
  /**
   * Validates: Requirements 2.3
   *
   * For any integer value, the GPU schema should accept it as physical.slots_occupied
   * if and only if it is in the set {1, 2, 3, 4}.
   */
  const ajv = makeAjv();
  const validate = ajv.compile(schemas.gpu);

  test("slots_occupied values 1-4 are accepted", () => {
    fc.assert(
      fc.property(
        validGpuArb,
        fc.integer({ min: 1, max: 4 }),
        (gpu, slotsVal) => {
          const obj = { ...gpu, physical: { ...gpu.physical, slots_occupied: slotsVal } };
          expect(validate(obj)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("slots_occupied values outside 1-4 are rejected", () => {
    const outOfRange = fc.oneof(
      fc.integer({ min: -100, max: 0 }),
      fc.integer({ min: 5, max: 200 })
    );
    fc.assert(
      fc.property(validGpuArb, outOfRange, (gpu, slotsVal) => {
        const obj = { ...gpu, physical: { ...gpu.physical, slots_occupied: slotsVal } };
        expect(validate(obj)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 3: GPU interface.lanes constrained to valid PCIe widths ────────

describe("Feature: granular-component-specs, Property 3: GPU interface.lanes constrained to valid PCIe widths", () => {
  /**
   * Validates: Requirements 3.2
   *
   * For any integer value, the GPU schema should accept it as interface.lanes
   * if and only if it is in the set {1, 4, 8, 16}.
   */
  const ajv = makeAjv();
  const validate = ajv.compile(schemas.gpu);
  const validLanes = new Set([1, 4, 8, 16]);

  test("valid lane values {1, 4, 8, 16} are accepted", () => {
    fc.assert(
      fc.property(
        validGpuArb,
        fc.constantFrom(1, 4, 8, 16),
        (gpu, lanesVal) => {
          const obj = { ...gpu, interface: { ...gpu.interface, lanes: lanesVal } };
          expect(validate(obj)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("invalid lane values are rejected", () => {
    const invalidLanes = fc.integer({ min: 0, max: 32 }).filter((v) => !validLanes.has(v));
    fc.assert(
      fc.property(validGpuArb, invalidLanes, (gpu, lanesVal) => {
        const obj = { ...gpu, interface: { ...gpu.interface, lanes: lanesVal } };
        expect(validate(obj)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 8: NVMe schema accepts optional capacity_variant_note ──────────

describe("Feature: granular-component-specs, Property 8: NVMe schema accepts optional capacity_variant_note", () => {
  /**
   * Validates: Requirements 5.2
   *
   * For any valid NVMe data object, adding a string capacity_variant_note field
   * should still pass schema validation, and omitting it should also pass.
   */
  const ajv = makeAjv();
  const validate = ajv.compile(schemas.nvme);

  test("NVMe objects without capacity_variant_note pass validation", () => {
    fc.assert(
      fc.property(validNvmeArb, (nvme) => {
        expect(validate(nvme)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  test("NVMe objects with a string capacity_variant_note pass validation", () => {
    fc.assert(
      fc.property(validNvmeArb, nonEmptyString, (nvme, note) => {
        const obj = { ...nvme, capacity_variant_note: note };
        expect(validate(obj)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  test("NVMe objects with non-string capacity_variant_note fail validation", () => {
    fc.assert(
      fc.property(
        validNvmeArb,
        fc.oneof(fc.integer(), fc.boolean(), fc.constant(null)),
        (nvme, badNote) => {
          const obj = { ...nvme, capacity_variant_note: badNote };
          expect(validate(obj)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 10: Motherboard schema requires PCIe slot position ─────────────

describe("Feature: granular-component-specs, Property 10: Motherboard schema requires PCIe slot position", () => {
  /**
   * Validates: Requirements 9.1, 9.2
   *
   * For any valid motherboard data object, removing the position field from any
   * PCIe slot entry should cause ajv schema validation to fail.
   */
  const ajv = makeAjv();
  const validate = ajv.compile(schemas.motherboard);

  test("valid motherboard objects with position on PCIe slots pass validation", () => {
    fc.assert(
      fc.property(validMotherboardArb, (mb) => {
        expect(validate(mb)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  test("removing position from any PCIe slot causes validation failure", () => {
    fc.assert(
      fc.property(validMotherboardArb, (mb) => {
        // Remove position from the first PCIe slot
        const mutatedSlots = mb.pcie_slots.map((slot, i) => {
          if (i === 0) {
            const { position, ...rest } = slot;
            return rest;
          }
          return slot;
        });
        const mutated = { ...mb, pcie_slots: mutatedSlots };
        expect(validate(mutated)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});

// ── Sanity check imports ────────────────────────────────────────────────────

import {
  checkGpu,
  checkMotherboard,
  checkSchemaVersion,
  VALID_GPU_LANES,
  NVIDIA_BOARD_PARTNERS,
  EXPECTED_SCHEMA_VERSIONS,
  VALID_POWER_CONNECTOR_TYPES,
  type SanityViolation,
} from "../../scripts/sanity-check";

// ── Property 11: Sanity check catches invalid GPU field values ──────────────

describe("Feature: granular-component-specs, Property 11: Sanity check catches invalid GPU field values", () => {
  /**
   * Validates: Requirements 8.1, 8.2, 8.3
   *
   * For any GPU data object where physical.slots_occupied is outside 1–4,
   * or interface.lanes is not in {1, 4, 8, 16}, or chip_manufacturer is an
   * empty string, the sanity check script should report a violation.
   */

  test("slots_occupied outside 1–4 produces a violation", () => {
    const outOfRange = fc.oneof(
      fc.integer({ min: -100, max: 0 }),
      fc.integer({ min: 5, max: 200 })
    );
    fc.assert(
      fc.property(outOfRange, (slotsVal) => {
        const violations: SanityViolation[] = [];
        const data: Record<string, unknown> = {
          chip_manufacturer: "NVIDIA",
          manufacturer: "NVIDIA",
          interface: { pcie_gen: 4, lanes: 16 },
          physical: { slot_width: 2, length_mm: 300, slots_occupied: slotsVal },
          power: {
            tdp_w: 200,
            recommended_psu_w: 600,
            power_connectors: [{ type: "8-pin", count: 2 }],
          },
          schema_version: "2.0",
        };
        checkGpu(violations, "test.yaml", data);
        const slotViolations = violations.filter((v) =>
          v.field === "physical.slots_occupied"
        );
        expect(slotViolations.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  test("slots_occupied 1–4 produces no slots_occupied violation", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), (slotsVal) => {
        const violations: SanityViolation[] = [];
        const data: Record<string, unknown> = {
          chip_manufacturer: "NVIDIA",
          manufacturer: "NVIDIA",
          interface: { pcie_gen: 4, lanes: 16 },
          physical: { slot_width: 2, length_mm: 300, slots_occupied: slotsVal },
          power: {
            tdp_w: 200,
            recommended_psu_w: 600,
            power_connectors: [{ type: "8-pin", count: 2 }],
          },
          schema_version: "2.0",
        };
        checkGpu(violations, "test.yaml", data);
        const slotViolations = violations.filter((v) =>
          v.field === "physical.slots_occupied"
        );
        expect(slotViolations.length).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  test("interface.lanes not in {1, 4, 8, 16} produces a violation", () => {
    const invalidLanes = fc
      .integer({ min: 0, max: 32 })
      .filter((v) => !VALID_GPU_LANES.has(v));
    fc.assert(
      fc.property(invalidLanes, (lanesVal) => {
        const violations: SanityViolation[] = [];
        const data: Record<string, unknown> = {
          chip_manufacturer: "NVIDIA",
          manufacturer: "NVIDIA",
          interface: { pcie_gen: 4, lanes: lanesVal },
          physical: { slot_width: 2, length_mm: 300, slots_occupied: 2 },
          power: {
            tdp_w: 200,
            recommended_psu_w: 600,
            power_connectors: [{ type: "8-pin", count: 2 }],
          },
          schema_version: "2.0",
        };
        checkGpu(violations, "test.yaml", data);
        const laneViolations = violations.filter((v) =>
          v.field === "interface.lanes"
        );
        expect(laneViolations.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  test("interface.lanes in {1, 4, 8, 16} produces no lanes violation", () => {
    fc.assert(
      fc.property(fc.constantFrom(1, 4, 8, 16), (lanesVal) => {
        const violations: SanityViolation[] = [];
        const data: Record<string, unknown> = {
          chip_manufacturer: "NVIDIA",
          manufacturer: "NVIDIA",
          interface: { pcie_gen: 4, lanes: lanesVal },
          physical: { slot_width: 2, length_mm: 300, slots_occupied: 2 },
          power: {
            tdp_w: 200,
            recommended_psu_w: 600,
            power_connectors: [{ type: "8-pin", count: 2 }],
          },
          schema_version: "2.0",
        };
        checkGpu(violations, "test.yaml", data);
        const laneViolations = violations.filter((v) =>
          v.field === "interface.lanes"
        );
        expect(laneViolations.length).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  test("empty chip_manufacturer produces a violation", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("", "  ", "\t"),
        (emptyMfr) => {
          const violations: SanityViolation[] = [];
          const data: Record<string, unknown> = {
            chip_manufacturer: emptyMfr,
            manufacturer: "ASUS",
            interface: { pcie_gen: 4, lanes: 16 },
            physical: { slot_width: 2, length_mm: 300, slots_occupied: 2 },
            power: {
              tdp_w: 200,
              recommended_psu_w: 600,
              power_connectors: [{ type: "8-pin", count: 2 }],
            },
            schema_version: "2.0",
          };
          checkGpu(violations, "test.yaml", data);
          const mfrViolations = violations.filter((v) =>
            v.field === "chip_manufacturer"
          );
          expect(mfrViolations.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("non-empty chip_manufacturer produces no chip_manufacturer violation", () => {
    fc.assert(
      fc.property(nonEmptyString, (mfr) => {
        const violations: SanityViolation[] = [];
        const data: Record<string, unknown> = {
          chip_manufacturer: mfr,
          manufacturer: "ASUS",
          interface: { pcie_gen: 4, lanes: 16 },
          physical: { slot_width: 2, length_mm: 300, slots_occupied: 2 },
          power: {
            tdp_w: 200,
            recommended_psu_w: 600,
            power_connectors: [{ type: "8-pin", count: 2 }],
          },
          schema_version: "2.0",
        };
        checkGpu(violations, "test.yaml", data);
        const mfrViolations = violations.filter((v) =>
          v.field === "chip_manufacturer"
        );
        expect(mfrViolations.length).toBe(0);
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 12: Sanity check validates NVIDIA board partner list ───────────

describe("Feature: granular-component-specs, Property 12: Sanity check validates NVIDIA board partner list", () => {
  /**
   * Validates: Requirements 8.4
   *
   * For any GPU data object where chip_manufacturer is "NVIDIA" and manufacturer
   * is not in the known NVIDIA board partner list, the sanity check should report
   * a violation.
   */

  test("unknown manufacturer with NVIDIA chip produces a violation", () => {
    const unknownMfr = nonEmptyString.filter(
      (s) => !NVIDIA_BOARD_PARTNERS.has(s)
    );
    fc.assert(
      fc.property(unknownMfr, (mfr) => {
        const violations: SanityViolation[] = [];
        const data: Record<string, unknown> = {
          chip_manufacturer: "NVIDIA",
          manufacturer: mfr,
          interface: { pcie_gen: 4, lanes: 16 },
          physical: { slot_width: 2, length_mm: 300, slots_occupied: 2 },
          power: {
            tdp_w: 200,
            recommended_psu_w: 600,
            power_connectors: [{ type: "8-pin", count: 2 }],
          },
          schema_version: "2.0",
        };
        checkGpu(violations, "test.yaml", data);
        const partnerViolations = violations.filter((v) =>
          v.field === "manufacturer"
        );
        expect(partnerViolations.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  test("known NVIDIA board partner produces no manufacturer violation", () => {
    const knownPartner = fc.constantFrom(...NVIDIA_BOARD_PARTNERS);
    fc.assert(
      fc.property(knownPartner, (mfr) => {
        const violations: SanityViolation[] = [];
        const data: Record<string, unknown> = {
          chip_manufacturer: "NVIDIA",
          manufacturer: mfr,
          interface: { pcie_gen: 4, lanes: 16 },
          physical: { slot_width: 2, length_mm: 300, slots_occupied: 2 },
          power: {
            tdp_w: 200,
            recommended_psu_w: 600,
            power_connectors: [{ type: "8-pin", count: 2 }],
          },
          schema_version: "2.0",
        };
        checkGpu(violations, "test.yaml", data);
        const partnerViolations = violations.filter((v) =>
          v.field === "manufacturer"
        );
        expect(partnerViolations.length).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  test("non-NVIDIA chip_manufacturer skips board partner check", () => {
    const nonNvidia = nonEmptyString.filter((s) => s !== "NVIDIA");
    fc.assert(
      fc.property(nonNvidia, nonEmptyString, (chip, mfr) => {
        const violations: SanityViolation[] = [];
        const data: Record<string, unknown> = {
          chip_manufacturer: chip,
          manufacturer: mfr,
          interface: { pcie_gen: 4, lanes: 16 },
          physical: { slot_width: 2, length_mm: 300, slots_occupied: 2 },
          power: {
            tdp_w: 200,
            recommended_psu_w: 600,
            power_connectors: [{ type: "8-pin", count: 2 }],
          },
          schema_version: "2.0",
        };
        checkGpu(violations, "test.yaml", data);
        const partnerViolations = violations.filter((v) =>
          v.field === "manufacturer"
        );
        expect(partnerViolations.length).toBe(0);
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 13: Sanity check validates schema version match ────────────────

describe("Feature: granular-component-specs, Property 13: Sanity check validates schema version match", () => {
  /**
   * Validates: Requirements 7.3
   *
   * For any YAML data file, if its schema_version does not match the expected
   * version for its component type, the sanity check should report a violation.
   */

  const dataTypes = Object.keys(EXPECTED_SCHEMA_VERSIONS) as Array<
    keyof typeof EXPECTED_SCHEMA_VERSIONS
  >;

  test("mismatched schema_version produces a violation", () => {
    const dataTypeArb = fc.constantFrom(...dataTypes);
    const wrongVersion = fc.string({ minLength: 1, maxLength: 5 });
    fc.assert(
      fc.property(dataTypeArb, wrongVersion, (dataType, version) => {
        const expected = EXPECTED_SCHEMA_VERSIONS[dataType];
        fc.pre(version !== expected);
        const violations: SanityViolation[] = [];
        const data: Record<string, unknown> = { schema_version: version };
        checkSchemaVersion(violations, "test.yaml", data, dataType);
        expect(violations.length).toBeGreaterThan(0);
        expect(violations[0].field).toBe("schema_version");
      }),
      { numRuns: 100 }
    );
  });

  test("correct schema_version produces no violation", () => {
    const dataTypeArb = fc.constantFrom(...dataTypes);
    fc.assert(
      fc.property(dataTypeArb, (dataType) => {
        const violations: SanityViolation[] = [];
        const data: Record<string, unknown> = {
          schema_version: EXPECTED_SCHEMA_VERSIONS[dataType],
        };
        checkSchemaVersion(violations, "test.yaml", data, dataType);
        expect(violations.length).toBe(0);
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 14: Sanity check validates PCIe slot position uniqueness and contiguity ──

describe("Feature: granular-component-specs, Property 14: Sanity check validates PCIe slot position uniqueness and contiguity", () => {
  /**
   * Validates: Requirements 9.7
   *
   * For any motherboard data object, if the PCIe slot position values are not
   * unique positive integers forming a contiguous sequence starting at 1,
   * the sanity check should report a violation.
   */

  /** Generate a valid contiguous position sequence starting at 1. */
  const validPositionsArb = fc.integer({ min: 1, max: 5 }).map((count) =>
    Array.from({ length: count }, (_, i) => i + 1)
  );

  const makeMotherboardData = (positions: number[]): Record<string, unknown> => ({
    pcie_slots: positions.map((pos, i) => ({
      id: `pcie_${i + 1}`,
      label: `PCIEX16_${i + 1}`,
      gen: 4,
      electrical_lanes: 16,
      physical_size: "x16",
      position: pos,
      source: "CPU",
      reinforced: true,
      sharing: null,
    })),
    m2_slots: [],
  });

  test("valid contiguous positions starting at 1 produce no position violations", () => {
    fc.assert(
      fc.property(validPositionsArb, (positions) => {
        const violations: SanityViolation[] = [];
        // Shuffle to prove order doesn't matter
        const shuffled = [...positions].sort(() => Math.random() - 0.5);
        checkMotherboard(violations, "test.yaml", makeMotherboardData(shuffled));
        const posViolations = violations.filter((v) =>
          v.field === "pcie_slots.position"
        );
        expect(posViolations.length).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  test("duplicate positions produce a violation", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        (pos1, pos2) => {
          // Create positions with at least one duplicate
          const positions = [pos1, pos1, pos2];
          const violations: SanityViolation[] = [];
          checkMotherboard(violations, "test.yaml", makeMotherboardData(positions));
          const posViolations = violations.filter((v) =>
            v.field === "pcie_slots.position"
          );
          expect(posViolations.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("positions not starting at 1 produce a violation", () => {
    const startAbove1 = fc.integer({ min: 2, max: 10 }).map((start) =>
      Array.from({ length: 2 }, (_, i) => start + i)
    );
    fc.assert(
      fc.property(startAbove1, (positions) => {
        const violations: SanityViolation[] = [];
        checkMotherboard(violations, "test.yaml", makeMotherboardData(positions));
        const posViolations = violations.filter((v) =>
          v.field === "pcie_slots.position"
        );
        expect(posViolations.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  test("positions with gaps produce a violation", () => {
    // e.g., [1, 3] has a gap (missing 2)
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }),
        (count) => {
          const positions = Array.from({ length: count }, (_, i) => i + 1);
          // Remove a middle element to create a gap
          const removeIdx = Math.floor(positions.length / 2);
          if (removeIdx > 0 && removeIdx < positions.length - 1) {
            positions.splice(removeIdx, 1);
            // Now positions has a gap
            const violations: SanityViolation[] = [];
            checkMotherboard(violations, "test.yaml", makeMotherboardData(positions));
            const posViolations = violations.filter((v) =>
              v.field === "pcie_slots.position"
            );
            expect(posViolations.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Validation engine imports ───────────────────────────────────────────────

import { validatePCIeAssignment } from "../../src/lib/validation-engine";
import { validateAssignments } from "../../src/lib/validation-engine";
import type {
  GPUComponent,
  PCIeSlot,
  NVMeComponent,
  Component,
  Motherboard,
} from "../../src/lib/types";

// ── Validation engine arbitraries ───────────────────────────────────────────

const physicalSizes = ["x1", "x4", "x8", "x16"] as const;
const physicalSizeLanes: Record<string, number> = { x1: 1, x4: 4, x8: 8, x16: 16 };
const validLaneValues = [1, 4, 8, 16] as const;

/** Generate a GPU component with configurable interface and physical fields. */
function gpuArb(overrides: {
  lanes?: fc.Arbitrary<number>;
  pcie_gen?: fc.Arbitrary<number>;
  slots_occupied?: fc.Arbitrary<number>;
} = {}): fc.Arbitrary<GPUComponent> {
  return fc.record({
    id: fc.string({ minLength: 2, maxLength: 10 }).filter((s) => s.trim().length > 0),
    type: fc.constant("gpu" as const),
    chip_manufacturer: fc.constant("NVIDIA"),
    manufacturer: fc.constant("ASUS"),
    model: fc.constant("Test GPU"),
    interface: fc.record({
      pcie_gen: overrides.pcie_gen ?? fc.integer({ min: 1, max: 6 }),
      lanes: overrides.lanes ?? fc.constantFrom(...validLaneValues),
    }),
    physical: fc.record({
      slot_width: fc.constant(2),
      length_mm: fc.constant(300),
      slots_occupied: overrides.slots_occupied ?? fc.integer({ min: 1, max: 4 }),
    }),
    power: fc.constant({
      tdp_w: 200,
      recommended_psu_w: 600,
      power_connectors: [{ type: "8-pin" as const, count: 2 }],
    }),
    schema_version: fc.constant("2.0"),
  });
}

/** Generate a PCIe slot with configurable fields. */
function pcieSlotTestArb(overrides: {
  electrical_lanes?: fc.Arbitrary<number>;
  physical_size?: fc.Arbitrary<"x1" | "x4" | "x8" | "x16">;
  gen?: fc.Arbitrary<number>;
  position?: fc.Arbitrary<number>;
} = {}): fc.Arbitrary<PCIeSlot> {
  return fc.record({
    id: fc.constant("pcie_1"),
    label: fc.constant("PCIEX16_1"),
    gen: overrides.gen ?? fc.integer({ min: 1, max: 6 }),
    electrical_lanes: overrides.electrical_lanes ?? fc.constantFrom(1, 4, 8, 16),
    physical_size: overrides.physical_size ?? fc.constantFrom(...physicalSizes),
    position: overrides.position ?? fc.integer({ min: 1, max: 10 }),
    source: fc.constantFrom("CPU" as const, "Chipset" as const),
    reinforced: fc.boolean(),
    sharing: fc.constant(null),
  });
}

// ── Property 4: Lane width exceeding electrical lanes produces error ────────

describe("Feature: granular-component-specs, Property 4: Lane width exceeding electrical lanes produces error", () => {
  /**
   * Validates: Requirements 4.1
   *
   * For any GPU component and PCIe slot where the GPU's interface.lanes exceeds
   * the slot's electrical_lanes, the validation engine should produce at least one
   * result with severity "error" referencing a lane width mismatch.
   */

  test("GPU lanes > slot electrical_lanes produces error", () => {
    // Generate pairs where GPU lanes strictly exceed slot electrical lanes
    const scenarioArb = fc.tuple(
      fc.constantFrom(4, 8, 16),   // GPU lanes
      fc.constantFrom(1, 4, 8, 16) // slot electrical lanes
    ).filter(([gpuLanes, slotLanes]) => gpuLanes > slotLanes)
    .chain(([gpuLanes, slotLanes]) =>
      fc.tuple(
        gpuArb({ lanes: fc.constant(gpuLanes) }),
        // physical_size must be >= GPU lanes to avoid physical fit error conflating
        pcieSlotTestArb({
          electrical_lanes: fc.constant(slotLanes),
          physical_size: fc.constant("x16"),
        })
      )
    );

    fc.assert(
      fc.property(scenarioArb, ([gpu, slot]) => {
        const results = validatePCIeAssignment(slot, gpu, slot.id, gpu.id, [slot], {});
        const laneErrors = results.filter(
          (r) => r.severity === "error" && r.message.toLowerCase().includes("lane width mismatch")
        );
        expect(laneErrors.length).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 100 }
    );
  });

  test("GPU lanes <= slot electrical_lanes produces no lane width error", () => {
    const scenarioArb = fc.tuple(
      fc.constantFrom(1, 4, 8, 16),
      fc.constantFrom(1, 4, 8, 16)
    ).filter(([gpuLanes, slotLanes]) => gpuLanes <= slotLanes)
    .chain(([gpuLanes, slotLanes]) =>
      fc.tuple(
        gpuArb({ lanes: fc.constant(gpuLanes) }),
        pcieSlotTestArb({
          electrical_lanes: fc.constant(slotLanes),
          physical_size: fc.constant("x16"),
        })
      )
    );

    fc.assert(
      fc.property(scenarioArb, ([gpu, slot]) => {
        const results = validatePCIeAssignment(slot, gpu, slot.id, gpu.id, [slot], {});
        const laneErrors = results.filter(
          (r) => r.severity === "error" && r.message.toLowerCase().includes("lane width mismatch")
        );
        expect(laneErrors.length).toBe(0);
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 5: Physical slot size too small produces error ─────────────────

describe("Feature: granular-component-specs, Property 5: Physical slot size too small produces error", () => {
  /**
   * Validates: Requirements 4.5
   *
   * For any GPU component and PCIe slot where the slot's physical_size lane count
   * is less than the GPU's interface.lanes, the validation engine should produce at
   * least one result with severity "error" indicating the GPU cannot physically fit.
   */

  test("slot physical size < GPU lanes produces physical fit error", () => {
    const scenarioArb = fc.tuple(
      fc.constantFrom(...physicalSizes),
      fc.constantFrom(...validLaneValues)
    ).filter(([size, gpuLanes]) => physicalSizeLanes[size] < gpuLanes)
    .chain(([size, gpuLanes]) =>
      fc.tuple(
        gpuArb({ lanes: fc.constant(gpuLanes) }),
        pcieSlotTestArb({
          physical_size: fc.constant(size),
          electrical_lanes: fc.constant(16), // high electrical to isolate physical check
        })
      )
    );

    fc.assert(
      fc.property(scenarioArb, ([gpu, slot]) => {
        const results = validatePCIeAssignment(slot, gpu, slot.id, gpu.id, [slot], {});
        const fitErrors = results.filter(
          (r) => r.severity === "error" && r.message.toLowerCase().includes("cannot physically fit")
        );
        expect(fitErrors.length).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 100 }
    );
  });

  test("slot physical size >= GPU lanes produces no physical fit error", () => {
    const scenarioArb = fc.tuple(
      fc.constantFrom(...physicalSizes),
      fc.constantFrom(...validLaneValues)
    ).filter(([size, gpuLanes]) => physicalSizeLanes[size] >= gpuLanes)
    .chain(([size, gpuLanes]) =>
      fc.tuple(
        gpuArb({ lanes: fc.constant(gpuLanes) }),
        pcieSlotTestArb({ physical_size: fc.constant(size) })
      )
    );

    fc.assert(
      fc.property(scenarioArb, ([gpu, slot]) => {
        const results = validatePCIeAssignment(slot, gpu, slot.id, gpu.id, [slot], {});
        const fitErrors = results.filter(
          (r) => r.severity === "error" && r.message.toLowerCase().includes("cannot physically fit")
        );
        expect(fitErrors.length).toBe(0);
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 6: PCIe generation mismatch severity is correct ────────────────

describe("Feature: granular-component-specs, Property 6: PCIe generation mismatch severity is correct", () => {
  /**
   * Validates: Requirements 4.2, 4.3
   *
   * If GPU pcie_gen > slot gen → warning (downgrade)
   * If GPU pcie_gen < slot gen → info (underuse)
   * If GPU pcie_gen === slot gen → no gen-related result
   */

  test("GPU gen > slot gen produces warning", () => {
    const scenarioArb = fc.tuple(
      fc.integer({ min: 2, max: 6 }),
      fc.integer({ min: 1, max: 5 })
    ).filter(([gpuGen, slotGen]) => gpuGen > slotGen)
    .chain(([gpuGen, slotGen]) =>
      fc.tuple(
        gpuArb({ pcie_gen: fc.constant(gpuGen), lanes: fc.constant(1) }),
        pcieSlotTestArb({
          gen: fc.constant(slotGen),
          physical_size: fc.constant("x16"),
          electrical_lanes: fc.constant(16),
        })
      )
    );

    fc.assert(
      fc.property(scenarioArb, ([gpu, slot]) => {
        const results = validatePCIeAssignment(slot, gpu, slot.id, gpu.id, [slot], {});
        const warnings = results.filter(
          (r) => r.severity === "warning" && r.message.toLowerCase().includes("downgrade")
        );
        expect(warnings.length).toBe(1);
      }),
      { numRuns: 100 }
    );
  });

  test("GPU gen < slot gen produces info", () => {
    const scenarioArb = fc.tuple(
      fc.integer({ min: 1, max: 5 }),
      fc.integer({ min: 2, max: 6 })
    ).filter(([gpuGen, slotGen]) => gpuGen < slotGen)
    .chain(([gpuGen, slotGen]) =>
      fc.tuple(
        gpuArb({ pcie_gen: fc.constant(gpuGen), lanes: fc.constant(1) }),
        pcieSlotTestArb({
          gen: fc.constant(slotGen),
          physical_size: fc.constant("x16"),
          electrical_lanes: fc.constant(16),
        })
      )
    );

    fc.assert(
      fc.property(scenarioArb, ([gpu, slot]) => {
        const results = validatePCIeAssignment(slot, gpu, slot.id, gpu.id, [slot], {});
        const infos = results.filter(
          (r) => r.severity === "info" && r.message.toLowerCase().includes("higher gen")
        );
        expect(infos.length).toBe(1);
      }),
      { numRuns: 100 }
    );
  });

  test("GPU gen === slot gen produces no gen-related result", () => {
    const genArb = fc.integer({ min: 1, max: 6 });
    const scenarioArb = genArb.chain((gen) =>
      fc.tuple(
        gpuArb({ pcie_gen: fc.constant(gen), lanes: fc.constant(1) }),
        pcieSlotTestArb({
          gen: fc.constant(gen),
          physical_size: fc.constant("x16"),
          electrical_lanes: fc.constant(16),
        })
      )
    );

    fc.assert(
      fc.property(scenarioArb, ([gpu, slot]) => {
        const results = validatePCIeAssignment(slot, gpu, slot.id, gpu.id, [slot], {});
        const genResults = results.filter(
          (r) =>
            r.message.toLowerCase().includes("downgrade") ||
            r.message.toLowerCase().includes("higher gen")
        );
        expect(genResults.length).toBe(0);
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 7: Position-based GPU blocking detection ───────────────────────

describe("Feature: granular-component-specs, Property 7: Position-based GPU blocking detection", () => {
  /**
   * Validates: Requirements 4.4
   *
   * If a GPU's slots_occupied causes it to overlap with positions of other
   * populated PCIe slots, produce a warning for each blocked populated slot.
   * If no populated slots are blocked, no blocking warning.
   */

  test("GPU blocking populated adjacent slot produces warning", () => {
    // GPU in position 1 with slots_occupied=2 blocks position 2
    // Position 2 slot is populated → warning
    const scenarioArb = fc.tuple(
      gpuArb({ lanes: fc.constant(1), slots_occupied: fc.constant(2) }),
      fc.constant("other-gpu-id")
    );

    fc.assert(
      fc.property(scenarioArb, ([gpu]) => {
        const slot1: PCIeSlot = {
          id: "pcie_1", label: "PCIEX16_1", gen: 4, electrical_lanes: 16,
          physical_size: "x16", position: 1, source: "CPU", reinforced: true, sharing: null,
        };
        const slot2: PCIeSlot = {
          id: "pcie_2", label: "PCIEX16_2", gen: 4, electrical_lanes: 16,
          physical_size: "x16", position: 2, source: "CPU", reinforced: true, sharing: null,
        };
        const allSlots = [slot1, slot2];
        const assignments: Record<string, string> = {
          pcie_1: gpu.id,
          pcie_2: "other-component",
        };

        const results = validatePCIeAssignment(slot1, gpu, "pcie_1", gpu.id, allSlots, assignments);
        const blockWarnings = results.filter(
          (r) => r.severity === "warning" && r.message.toLowerCase().includes("block")
        );
        expect(blockWarnings.length).toBe(1);
      }),
      { numRuns: 100 }
    );
  });

  test("GPU blocking unpopulated adjacent slot produces no warning", () => {
    const scenarioArb = gpuArb({ lanes: fc.constant(1), slots_occupied: fc.constant(2) });

    fc.assert(
      fc.property(scenarioArb, (gpu) => {
        const slot1: PCIeSlot = {
          id: "pcie_1", label: "PCIEX16_1", gen: 4, electrical_lanes: 16,
          physical_size: "x16", position: 1, source: "CPU", reinforced: true, sharing: null,
        };
        const slot2: PCIeSlot = {
          id: "pcie_2", label: "PCIEX16_2", gen: 4, electrical_lanes: 16,
          physical_size: "x16", position: 2, source: "CPU", reinforced: true, sharing: null,
        };
        const allSlots = [slot1, slot2];
        // Only pcie_1 is assigned, pcie_2 is empty
        const assignments: Record<string, string> = { pcie_1: gpu.id };

        const results = validatePCIeAssignment(slot1, gpu, "pcie_1", gpu.id, allSlots, assignments);
        const blockWarnings = results.filter(
          (r) => r.severity === "warning" && r.message.toLowerCase().includes("block")
        );
        expect(blockWarnings.length).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  test("GPU with slots_occupied=1 never produces blocking warning", () => {
    const scenarioArb = gpuArb({ lanes: fc.constant(1), slots_occupied: fc.constant(1) });

    fc.assert(
      fc.property(scenarioArb, (gpu) => {
        const slot1: PCIeSlot = {
          id: "pcie_1", label: "PCIEX16_1", gen: 4, electrical_lanes: 16,
          physical_size: "x16", position: 1, source: "CPU", reinforced: true, sharing: null,
        };
        const slot2: PCIeSlot = {
          id: "pcie_2", label: "PCIEX16_2", gen: 4, electrical_lanes: 16,
          physical_size: "x16", position: 2, source: "CPU", reinforced: true, sharing: null,
        };
        const allSlots = [slot1, slot2];
        const assignments: Record<string, string> = {
          pcie_1: gpu.id,
          pcie_2: "other-component",
        };

        const results = validatePCIeAssignment(slot1, gpu, "pcie_1", gpu.id, allSlots, assignments);
        const blockWarnings = results.filter(
          (r) => r.severity === "warning" && r.message.toLowerCase().includes("block")
        );
        expect(blockWarnings.length).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  test("GPU with slots_occupied=3 blocking 2 populated slots produces 2 warnings", () => {
    const scenarioArb = gpuArb({ lanes: fc.constant(1), slots_occupied: fc.constant(3) });

    fc.assert(
      fc.property(scenarioArb, (gpu) => {
        const slot1: PCIeSlot = {
          id: "pcie_1", label: "PCIEX16_1", gen: 4, electrical_lanes: 16,
          physical_size: "x16", position: 1, source: "CPU", reinforced: true, sharing: null,
        };
        const slot2: PCIeSlot = {
          id: "pcie_2", label: "PCIEX1_1", gen: 4, electrical_lanes: 1,
          physical_size: "x1", position: 2, source: "Chipset", reinforced: false, sharing: null,
        };
        const slot3: PCIeSlot = {
          id: "pcie_3", label: "PCIEX16_2", gen: 4, electrical_lanes: 16,
          physical_size: "x16", position: 3, source: "CPU", reinforced: true, sharing: null,
        };
        const allSlots = [slot1, slot2, slot3];
        const assignments: Record<string, string> = {
          pcie_1: gpu.id,
          pcie_2: "comp-a",
          pcie_3: "comp-b",
        };

        const results = validatePCIeAssignment(slot1, gpu, "pcie_1", gpu.id, allSlots, assignments);
        const blockWarnings = results.filter(
          (r) => r.severity === "warning" && r.message.toLowerCase().includes("block")
        );
        expect(blockWarnings.length).toBe(2);
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 9: Capacity variant note included in validation messages ───────

describe("Feature: granular-component-specs, Property 9: Capacity variant note included in validation messages", () => {
  /**
   * Validates: Requirements 5.3
   *
   * For any NVMe component that has a non-empty capacity_variant_note, every
   * validation result message produced for that component should contain the note text.
   */

  test("NVMe with capacity_variant_note has note in all validation messages", () => {
    const noteArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);

    fc.assert(
      fc.property(noteArb, (note) => {
        // Create an NVMe with a SATA protocol in an NVMe-only slot to trigger a validation result
        const nvme: NVMeComponent = {
          id: "test-nvme",
          type: "nvme",
          manufacturer: "Samsung",
          model: "Test NVMe",
          interface: { protocol: "SATA", pcie_gen: null, lanes: null },
          form_factor: "2280",
          capacity_gb: 1000,
          capacity_variant_note: note,
          schema_version: "1.1",
        };

        const motherboard: Motherboard = {
          id: "test-mb",
          manufacturer: "ASUS",
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
          m2_slots: [
            {
              id: "m2_1",
              label: "M2_1",
              interface: "PCIe",
              gen: 4,
              lanes: 4,
              form_factors: ["2280"],
              source: "CPU",
              supports_sata: false,
              heatsink_included: true,
              sharing: null,
            },
          ],
          pcie_slots: [],
          sata_ports: [],
          sources: [{ type: "manual", url: "https://example.com" }],
          schema_version: "2.0",
        };

        const assignments: Record<string, string> = { m2_1: "test-nvme" };
        const components: Record<string, Component> = { "test-nvme": nvme };

        const results = validateAssignments(motherboard, assignments, components);
        // Should have at least one result (SATA in NVMe-only slot)
        expect(results.length).toBeGreaterThan(0);
        // Every result message should contain the note
        for (const result of results) {
          expect(result.message).toContain(note);
        }
      }),
      { numRuns: 100 }
    );
  });

  test("NVMe without capacity_variant_note has no note appended", () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const nvme: NVMeComponent = {
          id: "test-nvme",
          type: "nvme",
          manufacturer: "Samsung",
          model: "Test NVMe",
          interface: { protocol: "SATA", pcie_gen: null, lanes: null },
          form_factor: "2280",
          capacity_gb: 1000,
          schema_version: "1.1",
        };

        const motherboard: Motherboard = {
          id: "test-mb",
          manufacturer: "ASUS",
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
          m2_slots: [
            {
              id: "m2_1",
              label: "M2_1",
              interface: "PCIe",
              gen: 4,
              lanes: 4,
              form_factors: ["2280"],
              source: "CPU",
              supports_sata: false,
              heatsink_included: true,
              sharing: null,
            },
          ],
          pcie_slots: [],
          sata_ports: [],
          sources: [{ type: "manual", url: "https://example.com" }],
          schema_version: "2.0",
        };

        const assignments: Record<string, string> = { m2_1: "test-nvme" };
        const components: Record<string, Component> = { "test-nvme": nvme };

        const results = validateAssignments(motherboard, assignments, components);
        expect(results.length).toBeGreaterThan(0);
        // No "[Note:" should appear
        for (const result of results) {
          expect(result.message).not.toContain("[Note:");
        }
      }),
      { numRuns: 100 }
    );
  });
});
