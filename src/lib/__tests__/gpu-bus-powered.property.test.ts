// Property-based tests for GPU bus-powered (zero power connectors) bug condition.
// Uses fast-check with vitest. Tests validate that bus-powered GPUs with
// power_connectors: [] are accepted by both schema validation and checkGpu.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import * as fs from "fs";
import * as path from "path";
import { checkGpu } from "../../../scripts/sanity-check";
import type { SanityViolation } from "../../../scripts/sanity-check";
import type { GPUComponent } from "../types";

// -- Schema loading -----------------------------------------------------------

const SCHEMA_DIR = path.resolve(__dirname, "..", "..", "..", "data", "schema");

function loadSchema(filename: string) {
  return JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, filename), "utf-8"));
}

const gpuSchema = loadSchema("component-gpu.schema.json");

function makeAjv() {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  return ajv;
}

// -- Bus-powered GPU generator ------------------------------------------------

const GPU_CHIP_MANUFACTURERS = ["NVIDIA", "AMD"] as const;
const GPU_MANUFACTURERS = ["ASUS", "MSI", "Gigabyte", "EVGA", "Zotac", "Sapphire"] as const;
const GPU_MODEL_PREFIXES = ["GTX 750 Ti", "GTX 1050 Ti", "GTX 1650", "RX 6400"] as const;

const kebabSegmentArb = fc
  .stringMatching(/^[a-z][a-z0-9]{1,8}$/)
  .filter((s) => s.length >= 2);

/**
 * Generates a GPUComponent that always has power_connectors: [] (bus-powered).
 * This is the bug condition: isBugCondition(gpuData) = power_connectors.length == 0
 */
function arbBusPoweredGPU(): fc.Arbitrary<GPUComponent> {
  return fc
    .record({
      chipManufacturer: fc.constantFrom(...GPU_CHIP_MANUFACTURERS),
      manufacturer: fc.constantFrom(...GPU_MANUFACTURERS),
      modelPrefix: fc.constantFrom(...GPU_MODEL_PREFIXES),
      pcieGen: fc.integer({ min: 3, max: 5 }),
      lanes: fc.constantFrom(8, 16),
      slotWidth: fc.constantFrom(2, 3),
      lengthMm: fc.integer({ min: 200, max: 400 }),
      slotsOccupied: fc.constantFrom(1, 2),
      tdpW: fc.integer({ min: 30, max: 75 }),
      recommendedPsuW: fc.constantFrom(300, 350, 400, 450),
      idSuffix: kebabSegmentArb,
    })
    .map(({
      chipManufacturer, manufacturer, modelPrefix, pcieGen, lanes,
      slotWidth, lengthMm, slotsOccupied, tdpW, recommendedPsuW, idSuffix,
    }) => ({
      id: `${manufacturer.toLowerCase()}-${modelPrefix.toLowerCase().replace(/\s+/g, "-")}-${idSuffix}`,
      type: "gpu" as const,
      chip_manufacturer: chipManufacturer,
      manufacturer,
      model: `${manufacturer} ${modelPrefix} ${idSuffix}`,
      interface: { pcie_gen: pcieGen, lanes },
      physical: { slot_width: slotWidth, length_mm: lengthMm, slots_occupied: slotsOccupied },
      power: {
        tdp_w: tdpW,
        recommended_psu_w: recommendedPsuW,
        power_connectors: [],
      },
      schema_version: "1.0",
    }));
}

// -- Property Tests -----------------------------------------------------------

describe("GPU Bus-Powered Bug Condition Exploration", () => {
  // Property 1: Bug Condition - Bus-Powered GPUs Accepted
  // **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
  it("Property 1: bus-powered GPUs (power_connectors: []) produce zero connector-length violations from checkGpu", () => {
    fc.assert(
      fc.property(
        arbBusPoweredGPU(),
        (gpu) => {
          const violations: SanityViolation[] = [];
          checkGpu(violations, `gpu/${gpu.id}.yaml`, gpu as unknown as Record<string, unknown>);

          // Assert no violation on power.power_connectors with "at least one entry"
          const connectorLengthViolations = violations.filter(
            (v) =>
              v.field === "power.power_connectors" &&
              v.message.includes("at least one entry")
          );
          expect(connectorLengthViolations).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 1 (schema): Bus-Powered GPUs pass JSON Schema validation
  // **Validates: Requirements 1.1, 2.1**
  it("Property 1 (schema): bus-powered GPUs (power_connectors: []) pass JSON Schema validation", () => {
    const ajv = makeAjv();
    const validate = ajv.compile(gpuSchema);

    fc.assert(
      fc.property(
        arbBusPoweredGPU(),
        (gpu) => {
          const valid = validate(gpu);
          expect(valid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// -- Preservation Property Tests ----------------------------------------------
// These tests observe and lock in the behavior of checkGpu on UNFIXED code
// for GPUs with non-empty power_connectors. They MUST PASS before the fix.

import { arbGPUComponent } from "./generators";

/** Valid connector types recognized by the sanity-check script. */
const VALID_CONNECTOR_TYPES = [
  "6-pin",
  "8-pin",
  "12-pin",
  "16-pin/12VHPWR",
  "16-pin/12V-2x6",
] as const;

describe("GPU Bus-Powered Preservation Properties", () => {
  // Property 2: Preservation - Non-Empty Connector Behavior Unchanged
  // **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

  it("valid connectors produce zero connector-related violations", () => {
    // Use arbGPUComponent (always non-empty connectors) but override the
    // connector type to a known-valid value so we isolate connector validation.
    const arbValidGPU = arbGPUComponent().map((gpu) => ({
      ...gpu,
      power: {
        ...gpu.power,
        power_connectors: gpu.power.power_connectors.map((c) => ({
          ...c,
          type: VALID_CONNECTOR_TYPES[
            Math.abs(c.count) % VALID_CONNECTOR_TYPES.length
          ],
        })),
      },
    }));

    fc.assert(
      fc.property(arbValidGPU, (gpu) => {
        const violations: SanityViolation[] = [];
        checkGpu(
          violations,
          `gpu/${gpu.id}.yaml`,
          gpu as unknown as Record<string, unknown>
        );

        // No violations on any power.power_connectors field
        const connectorViolations = violations.filter((v) =>
          v.field.startsWith("power.power_connectors")
        );
        expect(connectorViolations).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });

  it("invalid connector type produces violation", () => {
    // Take a valid GPU and override one connector type to an invalid value
    const arbInvalidTypeGPU = arbGPUComponent().map((gpu) => ({
      ...gpu,
      power: {
        ...gpu.power,
        power_connectors: [{ type: "banana", count: 1 }],
      },
    }));

    fc.assert(
      fc.property(arbInvalidTypeGPU, (gpu) => {
        const violations: SanityViolation[] = [];
        checkGpu(
          violations,
          `gpu/${gpu.id}.yaml`,
          gpu as unknown as Record<string, unknown>
        );

        const typeViolations = violations.filter(
          (v) =>
            v.field.includes("power.power_connectors") &&
            v.message.includes("not a valid connector type")
        );
        expect(typeViolations.length).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 100 }
    );
  });

  it("invalid connector count produces violation", () => {
    // Take a valid GPU and override one connector count to 0
    const arbInvalidCountGPU = arbGPUComponent().map((gpu) => ({
      ...gpu,
      power: {
        ...gpu.power,
        power_connectors: [
          {
            type: VALID_CONNECTOR_TYPES[0], // use a valid type
            count: 0,
          },
        ],
      },
    }));

    fc.assert(
      fc.property(arbInvalidCountGPU, (gpu) => {
        const violations: SanityViolation[] = [];
        checkGpu(
          violations,
          `gpu/${gpu.id}.yaml`,
          gpu as unknown as Record<string, unknown>
        );

        const countViolations = violations.filter(
          (v) =>
            v.field.includes("power.power_connectors") &&
            v.message.includes("must be a positive integer")
        );
        expect(countViolations.length).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 100 }
    );
  });
});
