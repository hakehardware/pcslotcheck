// Property test for CPU manifest extraction (extractSpecs).
// Validates: Requirements 3.2, 10.3

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { extractSpecs } from "../../../scripts/generate-manifest";

// -- Arbitraries --------------------------------------------------------------

const nonEmptyString = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0);

const cpuDataArb = fc.record({
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
  schema_version: fc.constantFrom("1.0", "1.1", "2.0"),
});

// -- Property 2: extractSpecs returns correct fields for CPU components -------

describe("Property 2: extractSpecs returns correct fields for CPU components", () => {
  /**
   * Validates: Requirements 3.2, 10.3
   *
   * For any valid CPU data object, extractSpecs returns an object with
   * exactly the keys socket, microarchitecture, and pcie_config.cpu_gen,
   * with values matching the input.
   */
  it("returns socket, microarchitecture, and pcie_config.cpu_gen matching input", () => {
    fc.assert(
      fc.property(cpuDataArb, (cpuData) => {
        const specs = extractSpecs(cpuData as Record<string, unknown>);

        // Must contain exactly these three keys
        const keys = Object.keys(specs).sort();
        expect(keys).toEqual(
          ["microarchitecture", "pcie_config.cpu_gen", "socket"].sort()
        );

        // Values must match the input
        expect(specs.socket).toBe(cpuData.socket);
        expect(specs.microarchitecture).toBe(cpuData.microarchitecture);
        expect(specs["pcie_config.cpu_gen"]).toBe(cpuData.pcie_config.cpu_gen);
      }),
      { numRuns: 100 }
    );
  });
});
