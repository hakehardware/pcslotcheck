// Property tests for CPU manifest extraction (extractSpecs).

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { extractSpecs } from "../../../scripts/generate-manifest";
import { arbCPUComponent } from "./generators";

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
  architecture: nonEmptyString,
  pcie_config: fc.record({
    cpu_gen: fc.integer({ min: 1, max: 6 }),
    cpu_lanes: fc.integer({ min: 1, max: 128 }),
  }),
  schema_version: fc.constantFrom("1.0", "1.1", "2.0"),
});

// -- Property 2: extractSpecs returns correct fields for CPU components -------

describe("Property 2: extractSpecs returns correct fields for CPU components", () => {
  /**
   * Validates: Requirements 5.1
   *
   * For any valid CPU data object, extractSpecs returns an object with
   * exactly the keys socket, microarchitecture, architecture, and pcie_config.cpu_gen,
   * with values matching the input.
   */
  it("returns socket, microarchitecture, architecture, and pcie_config.cpu_gen matching input", () => {
    fc.assert(
      fc.property(cpuDataArb, (cpuData) => {
        const specs = extractSpecs(cpuData as Record<string, unknown>);

        const keys = Object.keys(specs).sort();
        expect(keys).toEqual(
          ["architecture", "microarchitecture", "pcie_config.cpu_gen", "socket"].sort()
        );

        expect(specs.socket).toBe(cpuData.socket);
        expect(specs.microarchitecture).toBe(cpuData.microarchitecture);
        expect(specs.architecture).toBe(cpuData.architecture);
        expect(specs["pcie_config.cpu_gen"]).toBe(cpuData.pcie_config.cpu_gen);
      }),
      { numRuns: 100 }
    );
  });
});

// -- Property 4: extractSpecs includes architecture for CPU components --------

describe("Property 4: extractSpecs includes architecture for CPU components", () => {
  /**
   * Validates: Requirements 5.1, 5.3
   *
   * For any CPU component with an architecture field, extractSpecs returns it
   * alongside socket, microarchitecture, and pcie_config.cpu_gen.
   * When architecture is absent, the returned value is undefined.
   */
  it("returns architecture alongside socket, microarchitecture, and pcie_config.cpu_gen", () => {
    fc.assert(
      fc.property(arbCPUComponent(), (cpu) => {
        const data: Record<string, unknown> = {
          type: cpu.type,
          socket: cpu.socket,
          microarchitecture: cpu.microarchitecture,
          architecture: cpu.architecture,
          pcie_config: cpu.pcie_config,
        };

        const specs = extractSpecs(data);

        expect(specs.socket).toBe(cpu.socket);
        expect(specs.microarchitecture).toBe(cpu.microarchitecture);
        expect(specs.architecture).toBe(cpu.architecture);
        expect(specs["pcie_config.cpu_gen"]).toBe(cpu.pcie_config.cpu_gen);
      }),
      { numRuns: 100 }
    );
  });

  it("returns undefined architecture when the field is absent from input", () => {
    fc.assert(
      fc.property(arbCPUComponent(), (cpu) => {
        const data: Record<string, unknown> = {
          type: cpu.type,
          socket: cpu.socket,
          microarchitecture: cpu.microarchitecture,
          // architecture intentionally omitted
          pcie_config: cpu.pcie_config,
        };

        const specs = extractSpecs(data);

        expect(specs.architecture).toBeUndefined();
        // Other fields still present
        expect(specs.socket).toBe(cpu.socket);
        expect(specs.microarchitecture).toBe(cpu.microarchitecture);
        expect(specs["pcie_config.cpu_gen"]).toBe(cpu.pcie_config.cpu_gen);
      }),
      { numRuns: 100 }
    );
  });
});
