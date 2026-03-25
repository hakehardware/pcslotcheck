// Property-based tests for CPU override resolution and validation utilities.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { resolveEffectiveSlotValues } from "../cpu-utils";
import { arbCPUOverride, MICROARCHITECTURES } from "./generators";
import type { CPUOverride } from "../types";

// -- Property 5: Override resolution correctness ------------------------------
// Validates: Requirements 6.2, 6.3, 6.4

describe("Property 5: Override resolution correctness", () => {
  const baseGen = fc.integer({ min: 1, max: 6 });
  const baseLanes = fc.integer({ min: 1, max: 16 });
  const microArch = fc.constantFrom(...MICROARCHITECTURES);
  const overridesArray = fc.array(arbCPUOverride(), { minLength: 0, maxLength: 5 });

  it("returns override values when a matching entry exists", () => {
    /**
     * Validates: Requirements 6.2
     *
     * For any base gen/lanes and a cpu_overrides array that contains at least
     * one entry matching the given microarchitecture, resolveEffectiveSlotValues
     * returns the override's gen (if specified, otherwise base gen) and the
     * override's lanes (if specified, otherwise base lanes).
     */
    fc.assert(
      fc.property(
        baseGen,
        baseLanes,
        arbCPUOverride(),
        microArch,
        (bGen, bLanes, override, arch) => {
          // Force the override to match the chosen microarchitecture
          const matchingOverride: CPUOverride = { ...override, microarchitecture: arch };
          const overrides = [matchingOverride];

          const result = resolveEffectiveSlotValues(bGen, bLanes, overrides, arch);

          const expectedGen = matchingOverride.gen ?? bGen;
          const expectedLanes = matchingOverride.lanes ?? bLanes;

          expect(result.gen).toBe(expectedGen);
          expect(result.lanes).toBe(expectedLanes);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("returns base values when no matching override exists", () => {
    /**
     * Validates: Requirements 6.3
     *
     * For any base gen/lanes and a cpu_overrides array where no entry matches
     * the given microarchitecture, resolveEffectiveSlotValues returns the
     * base gen and lanes unchanged.
     */
    fc.assert(
      fc.property(
        baseGen,
        baseLanes,
        overridesArray,
        (bGen, bLanes, overrides) => {
          // Use a microarchitecture that cannot appear in the generated overrides
          const nonMatchingArch = "NonExistent Arch 9999";
          const result = resolveEffectiveSlotValues(bGen, bLanes, overrides, nonMatchingArch);

          expect(result.gen).toBe(bGen);
          expect(result.lanes).toBe(bLanes);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("returns base values when microarchitecture is null", () => {
    /**
     * Validates: Requirements 6.4
     *
     * For any base gen/lanes and any cpu_overrides array,
     * resolveEffectiveSlotValues returns base values when
     * microarchitecture is null.
     */
    fc.assert(
      fc.property(
        baseGen,
        baseLanes,
        overridesArray,
        (bGen, bLanes, overrides) => {
          const result = resolveEffectiveSlotValues(bGen, bLanes, overrides, null);

          expect(result.gen).toBe(bGen);
          expect(result.lanes).toBe(bLanes);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("first matching override wins when multiple entries match", () => {
    /**
     * Validates: Requirements 6.2
     *
     * When multiple cpu_overrides entries share the same microarchitecture,
     * the first match is used.
     */
    fc.assert(
      fc.property(
        baseGen,
        baseLanes,
        arbCPUOverride(),
        arbCPUOverride(),
        microArch,
        (bGen, bLanes, first, second, arch) => {
          const o1: CPUOverride = { ...first, microarchitecture: arch };
          const o2: CPUOverride = { ...second, microarchitecture: arch };
          const overrides = [o1, o2];

          const result = resolveEffectiveSlotValues(bGen, bLanes, overrides, arch);

          expect(result.gen).toBe(o1.gen ?? bGen);
          expect(result.lanes).toBe(o1.lanes ?? bLanes);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("returns base values when overrides array is empty, undefined, or null", () => {
    /**
     * Validates: Requirements 6.3, 6.4
     *
     * Edge cases: empty array, undefined, and null overrides all yield base values.
     */
    fc.assert(
      fc.property(
        baseGen,
        baseLanes,
        microArch,
        fc.constantFrom([] as CPUOverride[], undefined, null),
        (bGen, bLanes, arch, overrides) => {
          const result = resolveEffectiveSlotValues(bGen, bLanes, overrides, arch);

          expect(result.gen).toBe(bGen);
          expect(result.lanes).toBe(bLanes);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// -- Property 3: Socket compatibility validation -----------------------------
// Validates: Requirements 4.1, 4.2

import { validateCpuSocketCompat } from "../validation-engine";
import { arbCPUComponent, arbMinimalMotherboard } from "./generators";
import type { CPUComponent, Motherboard } from "../types";

describe("Property 3: Socket compatibility validation", () => {
  it("produces an error iff CPU socket differs from motherboard socket", () => {
    /**
     * Validates: Requirements 4.1, 4.2
     *
     * For any CPU and motherboard, validateCpuSocketCompat produces exactly
     * one error when sockets differ, and zero errors when sockets match.
     */
    fc.assert(
      fc.property(
        arbCPUComponent(),
        arbMinimalMotherboard(),
        (cpu: CPUComponent, board: Motherboard) => {
          const results = validateCpuSocketCompat(board, cpu);

          if (cpu.socket !== board.socket) {
            // Requirement 4.1: socket mismatch produces an error
            expect(results).toHaveLength(1);
            expect(results[0].severity).toBe("error");
            expect(results[0].slotId).toBe("cpu");
            expect(results[0].componentId).toBe(cpu.id);
            expect(results[0].message).toContain(cpu.socket);
            expect(results[0].message).toContain(board.socket);
          } else {
            // Requirement 4.2: matching sockets produce no error
            expect(results).toHaveLength(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("error message follows the expected pattern", () => {
    /**
     * Validates: Requirements 4.1
     *
     * When sockets differ, the error message matches the pattern:
     * "{cpu model} requires socket {cpu socket} but this motherboard uses {board socket}"
     */
    fc.assert(
      fc.property(
        arbCPUComponent(),
        arbMinimalMotherboard(),
        (cpu: CPUComponent, board: Motherboard) => {
          // Force a mismatch by giving the CPU a different socket
          const mismatchedCpu: CPUComponent = {
            ...cpu,
            socket: cpu.socket === "AM5" ? "LGA 1700" : "AM5",
          };
          const mismatchedBoard: Motherboard = {
            ...board,
            socket: mismatchedCpu.socket === "AM5" ? "LGA 1700" : "AM5",
          };

          const results = validateCpuSocketCompat(mismatchedBoard, mismatchedCpu);

          expect(results).toHaveLength(1);
          expect(results[0].message).toBe(
            `${mismatchedCpu.model} requires socket ${mismatchedCpu.socket} but this motherboard uses ${mismatchedBoard.socket}`
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

// -- Property 4: CPU-direct slot PCIe generation downgrade --------------------
// Validates: Requirements 5.1, 5.2, 5.3

import { validateCpuDirectSlotGen } from "../validation-engine";
import { arbM2Slot, arbPCIeSlot } from "./generators";
import type { M2Slot, PCIeSlot } from "../types";

describe("Property 4: CPU-direct slot PCIe generation downgrade", () => {
  it("produces a warning iff a CPU-direct M.2 slot effective gen > cpu_gen", () => {
    /**
     * Validates: Requirements 5.1, 5.3
     *
     * For any CPU and CPU-direct M.2 slot, validateCpuDirectSlotGen produces
     * a downgrade warning when the slot's effective gen exceeds the CPU's
     * cpu_gen, and no warning otherwise.
     */
    fc.assert(
      fc.property(
        arbCPUComponent(),
        arbM2Slot(),
        (cpu: CPUComponent, slot: M2Slot) => {
          // Force CPU-direct source
          const cpuSlot: M2Slot = { ...slot, source: "CPU" };
          const board: Motherboard = {
            id: "test-board",
            manufacturer: "TestVendor",
            model: "Test Board",
            chipset: "X870E",
            socket: cpu.socket,
            form_factor: "ATX",
            memory: {
              type: "DDR5",
              max_speed_mhz: 6400,
              base_speed_mhz: 4800,
              max_capacity_gb: 128,
              ecc_support: false,
              channels: 2,
              slots: [],
              recommended_population: { two_dimm: [] },
            },
            m2_slots: [cpuSlot],
            pcie_slots: [],
            sata_ports: [],
            sources: [],
            schema_version: "1.0",
          };

          const results = validateCpuDirectSlotGen(board, cpu);
          const effective = resolveEffectiveSlotValues(
            cpuSlot.gen,
            cpuSlot.lanes,
            cpuSlot.cpu_overrides,
            cpu.microarchitecture
          );

          if (effective.gen > cpu.pcie_config.cpu_gen) {
            expect(results).toHaveLength(1);
            expect(results[0].severity).toBe("warning");
            expect(results[0].slotId).toBe(cpuSlot.id);
            expect(results[0].componentId).toBe(cpu.id);
            expect(results[0].message).toContain(cpuSlot.label);
            expect(results[0].message).toContain(cpu.model);
          } else {
            expect(results).toHaveLength(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("produces a warning iff a CPU-direct PCIe slot effective gen > cpu_gen", () => {
    /**
     * Validates: Requirements 5.2, 5.3
     *
     * For any CPU and CPU-direct PCIe slot, validateCpuDirectSlotGen produces
     * a downgrade warning when the slot's effective gen exceeds the CPU's
     * cpu_gen, and no warning otherwise.
     */
    fc.assert(
      fc.property(
        arbCPUComponent(),
        arbPCIeSlot(),
        (cpu: CPUComponent, slot: PCIeSlot) => {
          // Force CPU-direct source
          const cpuSlot: PCIeSlot = { ...slot, source: "CPU" };
          const board: Motherboard = {
            id: "test-board",
            manufacturer: "TestVendor",
            model: "Test Board",
            chipset: "X870E",
            socket: cpu.socket,
            form_factor: "ATX",
            memory: {
              type: "DDR5",
              max_speed_mhz: 6400,
              base_speed_mhz: 4800,
              max_capacity_gb: 128,
              ecc_support: false,
              channels: 2,
              slots: [],
              recommended_population: { two_dimm: [] },
            },
            m2_slots: [],
            pcie_slots: [cpuSlot],
            sata_ports: [],
            sources: [],
            schema_version: "1.0",
          };

          const results = validateCpuDirectSlotGen(board, cpu);
          const effective = resolveEffectiveSlotValues(
            cpuSlot.gen,
            cpuSlot.electrical_lanes,
            cpuSlot.cpu_overrides,
            cpu.microarchitecture
          );

          if (effective.gen > cpu.pcie_config.cpu_gen) {
            expect(results).toHaveLength(1);
            expect(results[0].severity).toBe("warning");
            expect(results[0].slotId).toBe(cpuSlot.id);
            expect(results[0].componentId).toBe(cpu.id);
          } else {
            expect(results).toHaveLength(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("chipset-sourced slots never produce CPU generation downgrade warnings", () => {
    /**
     * Validates: Requirements 5.1, 5.2
     *
     * For any CPU and any chipset-sourced M.2 or PCIe slot (regardless of gen
     * values), validateCpuDirectSlotGen never produces a warning.
     */
    fc.assert(
      fc.property(
        arbCPUComponent(),
        arbM2Slot(),
        arbPCIeSlot(),
        (cpu: CPUComponent, m2Slot: M2Slot, pcieSlot: PCIeSlot) => {
          // Force chipset source on both slots
          const chipsetM2: M2Slot = { ...m2Slot, source: "Chipset" };
          const chipsetPcie: PCIeSlot = { ...pcieSlot, source: "Chipset" };
          const board: Motherboard = {
            id: "test-board",
            manufacturer: "TestVendor",
            model: "Test Board",
            chipset: "X870E",
            socket: cpu.socket,
            form_factor: "ATX",
            memory: {
              type: "DDR5",
              max_speed_mhz: 6400,
              base_speed_mhz: 4800,
              max_capacity_gb: 128,
              ecc_support: false,
              channels: 2,
              slots: [],
              recommended_population: { two_dimm: [] },
            },
            m2_slots: [chipsetM2],
            pcie_slots: [chipsetPcie],
            sata_ports: [],
            sources: [],
            schema_version: "1.0",
          };

          const results = validateCpuDirectSlotGen(board, cpu);
          expect(results).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("warning message follows the expected pattern", () => {
    /**
     * Validates: Requirements 5.1
     *
     * When a CPU-direct slot gen exceeds cpu_gen, the warning message matches:
     * "Slot {label} is advertised as Gen{gen} but {model} only supports
     * Gen{cpu_gen} on CPU-direct lanes -- slot operates at Gen{cpu_gen}"
     */
    fc.assert(
      fc.property(
        arbCPUComponent(),
        arbM2Slot(),
        (cpu: CPUComponent, slot: M2Slot) => {
          // Force a downgrade scenario: CPU-direct, slot gen > cpu_gen
          const forcedSlot: M2Slot = {
            ...slot,
            source: "CPU",
            gen: cpu.pcie_config.cpu_gen + 1,
            cpu_overrides: undefined,
          };
          const board: Motherboard = {
            id: "test-board",
            manufacturer: "TestVendor",
            model: "Test Board",
            chipset: "X870E",
            socket: cpu.socket,
            form_factor: "ATX",
            memory: {
              type: "DDR5",
              max_speed_mhz: 6400,
              base_speed_mhz: 4800,
              max_capacity_gb: 128,
              ecc_support: false,
              channels: 2,
              slots: [],
              recommended_population: { two_dimm: [] },
            },
            m2_slots: [forcedSlot],
            pcie_slots: [],
            sata_ports: [],
            sources: [],
            schema_version: "1.0",
          };

          const results = validateCpuDirectSlotGen(board, cpu);
          expect(results).toHaveLength(1);
          expect(results[0].message).toBe(
            `Slot ${forcedSlot.label} is advertised as Gen${forcedSlot.gen} but ${cpu.model} only supports Gen${cpu.pcie_config.cpu_gen} on CPU-direct lanes -- slot operates at Gen${cpu.pcie_config.cpu_gen}`
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

// -- Property 8: NVMe gen vs effective slot gen validation --------------------
// Validates: Requirements 11.1, 11.2

import { validateCpuNvmeGenMismatch } from "../validation-engine";
import { arbNVMeComponent } from "./generators";
import type { NVMeComponent } from "../types";

describe("Property 8: NVMe gen vs effective slot gen validation", () => {
  it("produces a warning iff NVMe pcie_gen > effective slot gen", () => {
    /**
     * Validates: Requirements 11.1, 11.2
     *
     * For any CPU, NVMe, and M.2 slot, validateCpuNvmeGenMismatch produces
     * a warning when the NVMe pcie_gen exceeds the effective slot gen after
     * override resolution, and no warning otherwise.
     */
    fc.assert(
      fc.property(
        arbCPUComponent(),
        arbNVMeComponent(),
        arbM2Slot(),
        (cpu: CPUComponent, nvme: NVMeComponent, slot: M2Slot) => {
          const results = validateCpuNvmeGenMismatch(slot, nvme, cpu);
          const effective = resolveEffectiveSlotValues(
            slot.gen,
            slot.lanes,
            slot.cpu_overrides,
            cpu.microarchitecture
          );

          if (
            nvme.interface.pcie_gen !== null &&
            nvme.interface.pcie_gen > effective.gen
          ) {
            expect(results).toHaveLength(1);
            expect(results[0].severity).toBe("warning");
            expect(results[0].slotId).toBe(slot.id);
            expect(results[0].componentId).toBe(nvme.id);
            expect(results[0].message).toContain(nvme.model);
            expect(results[0].message).toContain(cpu.model);
          } else {
            expect(results).toHaveLength(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("warning message follows the expected pattern", () => {
    /**
     * Validates: Requirements 11.1
     *
     * When NVMe gen exceeds effective slot gen, the message matches:
     * "{nvme model} is Gen{nvme gen} but slot {slot label} operates at
     * Gen{effective gen} with {cpu model} -- reduced bandwidth"
     */
    fc.assert(
      fc.property(
        arbCPUComponent(),
        arbNVMeComponent(),
        arbM2Slot(),
        (cpu: CPUComponent, nvme: NVMeComponent, slot: M2Slot) => {
          // Force a mismatch: NVMe gen higher than slot gen, no overrides
          const forcedSlot: M2Slot = {
            ...slot,
            gen: 3,
            cpu_overrides: undefined,
          };
          const forcedNvme: NVMeComponent = {
            ...nvme,
            interface: { ...nvme.interface, pcie_gen: 5 },
          };

          const results = validateCpuNvmeGenMismatch(forcedSlot, forcedNvme, cpu);

          expect(results).toHaveLength(1);
          expect(results[0].message).toBe(
            `${forcedNvme.model} is Gen${forcedNvme.interface.pcie_gen} but slot ${forcedSlot.label} operates at Gen${forcedSlot.gen} with ${cpu.model} -- reduced bandwidth`
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it("produces no warning when NVMe pcie_gen equals effective slot gen", () => {
    fc.assert(
      fc.property(
        arbCPUComponent(),
        arbNVMeComponent(),
        arbM2Slot(),
        (cpu: CPUComponent, nvme: NVMeComponent, slot: M2Slot) => {
          // Force equal gens
          const forcedSlot: M2Slot = { ...slot, gen: 4, cpu_overrides: undefined };
          const forcedNvme: NVMeComponent = {
            ...nvme,
            interface: { ...nvme.interface, pcie_gen: 4 },
          };

          const results = validateCpuNvmeGenMismatch(forcedSlot, forcedNvme, cpu);
          expect(results).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// -- Property 6: Validation engine override resolution uses microarchitecture codename
// Validates: Requirements 8.1, 8.2

import { arbCPUComponent as arbCPUComponentGen, MICROARCHITECTURES as MICRO_ARCHS } from "./generators";

describe("Property 6: Validation engine override resolution uses microarchitecture codename", () => {
  const baseGen = fc.integer({ min: 1, max: 6 });
  const baseLanes = fc.integer({ min: 1, max: 16 });

  it("applies override when override microarchitecture equals CPU codename", () => {
    /**
     * Validates: Requirements 8.1
     *
     * For any CPU with a codename microarchitecture and an override whose
     * microarchitecture equals the CPU's codename, resolveEffectiveSlotValues
     * returns the override's gen/lanes (falling back to base when unspecified).
     */
    fc.assert(
      fc.property(
        baseGen,
        baseLanes,
        arbCPUComponentGen(),
        arbCPUOverride(),
        (bGen, bLanes, cpu, override) => {
          // Force the override to match the CPU's codename microarchitecture
          const matchingOverride: CPUOverride = {
            ...override,
            microarchitecture: cpu.microarchitecture,
          };
          const overrides = [matchingOverride];

          const result = resolveEffectiveSlotValues(
            bGen,
            bLanes,
            overrides,
            cpu.microarchitecture
          );

          const expectedGen = matchingOverride.gen ?? bGen;
          const expectedLanes = matchingOverride.lanes ?? bLanes;

          expect(result.gen).toBe(expectedGen);
          expect(result.lanes).toBe(expectedLanes);

          // Verify the CPU's microarchitecture is a real codename
          expect(MICRO_ARCHS).toContain(cpu.microarchitecture);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("returns base values when no override matches the CPU codename", () => {
    /**
     * Validates: Requirements 8.2
     *
     * For any CPU with a codename microarchitecture and overrides that do NOT
     * contain the CPU's codename, resolveEffectiveSlotValues returns base values.
     */
    fc.assert(
      fc.property(
        baseGen,
        baseLanes,
        arbCPUComponentGen(),
        fc.array(arbCPUOverride(), { minLength: 1, maxLength: 5 }),
        (bGen, bLanes, cpu, overrides) => {
          // Filter out any overrides that happen to match the CPU's codename
          const nonMatchingOverrides = overrides
            .map((o) => ({
              ...o,
              microarchitecture:
                o.microarchitecture === cpu.microarchitecture
                  ? "NonExistent Arch 9999"
                  : o.microarchitecture,
            }));

          const result = resolveEffectiveSlotValues(
            bGen,
            bLanes,
            nonMatchingOverrides,
            cpu.microarchitecture
          );

          expect(result.gen).toBe(bGen);
          expect(result.lanes).toBe(bLanes);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// -- Unit tests: resolveEffectiveSlotValues with specific codenames -----------

describe("resolveEffectiveSlotValues codename-specific unit tests", () => {
  it("Granite Ridge CPU matches an override for Granite Ridge", () => {
    const overrides: CPUOverride[] = [
      { microarchitecture: "Granite Ridge", gen: 5, lanes: 4 },
    ];
    const result = resolveEffectiveSlotValues(4, 2, overrides, "Granite Ridge");
    expect(result.gen).toBe(5);
    expect(result.lanes).toBe(4);
  });

  it("Raptor Lake Refresh CPU does NOT match an override for Raptor Lake", () => {
    const overrides: CPUOverride[] = [
      { microarchitecture: "Raptor Lake", gen: 4, lanes: 4 },
    ];
    const result = resolveEffectiveSlotValues(3, 2, overrides, "Raptor Lake Refresh");
    expect(result.gen).toBe(3);
    expect(result.lanes).toBe(2);
  });

  it("Phoenix 2 CPU matches an override for Phoenix 2", () => {
    const overrides: CPUOverride[] = [
      { microarchitecture: "Phoenix 2", gen: 4, lanes: 2 },
    ];
    const result = resolveEffectiveSlotValues(3, 4, overrides, "Phoenix 2");
    expect(result.gen).toBe(4);
    expect(result.lanes).toBe(2);
  });

  it("Phoenix 2 CPU does NOT match an override for Phoenix", () => {
    const overrides: CPUOverride[] = [
      { microarchitecture: "Phoenix", gen: 5, lanes: 4 },
    ];
    const result = resolveEffectiveSlotValues(3, 2, overrides, "Phoenix 2");
    expect(result.gen).toBe(3);
    expect(result.lanes).toBe(2);
  });
});
