// Property-based tests for computeCpuImpact() pure function.
// **Feature: cpu-impact-summary**

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { computeCpuImpact, resolveEffectiveSlotValues } from "../cpu-utils";
import {
  arbCPUComponent,
  arbMotherboardWithSlots,
  arbMotherboardWithMixedSources,
} from "./generators";

// -- Property 1: Socket match equals socket string equality -------------------
// **Feature: cpu-impact-summary, Property 1: Socket match equals socket string equality**

describe("Property 1: Socket match equals socket string equality", () => {
  it("socketMatch is true iff cpu.socket === motherboard.socket, and both socket strings are present", () => {
    /**
     * **Validates: Requirements 2.1, 2.2, 6.2**
     *
     * For any CPU component and any motherboard, computeCpuImpact returns
     * socketMatch === true if and only if cpuComponent.socket === motherboard.socket,
     * and the result contains both socket strings.
     */
    fc.assert(
      fc.property(
        arbCPUComponent(),
        arbMotherboardWithSlots(),
        (cpu, board) => {
          const result = computeCpuImpact(board, cpu);

          // socketMatch equals strict string equality
          expect(result.socketMatch).toBe(cpu.socket === board.socket);

          // Both socket strings are present in the result
          expect(result.cpuSocket).toBe(cpu.socket);
          expect(result.motherboardSocket).toBe(board.socket);
          expect(result.cpuSocket.length).toBeGreaterThan(0);
          expect(result.motherboardSocket.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// -- Property 2: Slot impact values match resolveEffectiveSlotValues output ----
// **Feature: cpu-impact-summary, Property 2: Slot impact values match resolveEffectiveSlotValues output**

describe("Property 2: Slot impact values match resolveEffectiveSlotValues output", () => {
  it("each SlotImpact effectiveGen/effectiveLanes equals resolveEffectiveSlotValues() and flags are derived correctly", () => {
    /**
     * **Validates: Requirements 3.1, 3.2, 3.3, 3.5, 6.1**
     *
     * For any motherboard with mixed CPU/Chipset M.2 and PCIe slots (some with
     * cpu_overrides) and any CPU component, each SlotImpact in the result has
     * effectiveGen/effectiveLanes equal to resolveEffectiveSlotValues() output,
     * and hasGenDowngrade/hasLaneReduction flags are correctly derived.
     */
    fc.assert(
      fc.property(
        arbCPUComponent(),
        arbMotherboardWithSlots(),
        (cpu, board) => {
          const result = computeCpuImpact(board, cpu);

          // Build a lookup of expected values for CPU-sourced slots
          const expectedM2 = board.m2_slots
            .filter((s) => s.source === "CPU")
            .map((slot) => {
              const eff = resolveEffectiveSlotValues(
                slot.gen,
                slot.lanes,
                slot.cpu_overrides,
                cpu.microarchitecture
              );
              return {
                slotId: slot.id,
                baseGen: slot.gen,
                effectiveGen: eff.gen,
                baseLanes: slot.lanes,
                effectiveLanes: eff.lanes,
              };
            });

          const expectedPcie = board.pcie_slots
            .filter((s) => s.source === "CPU")
            .map((slot) => {
              const eff = resolveEffectiveSlotValues(
                slot.gen,
                slot.electrical_lanes,
                slot.cpu_overrides,
                cpu.microarchitecture
              );
              return {
                slotId: slot.id,
                baseGen: slot.gen,
                effectiveGen: eff.gen,
                baseLanes: slot.electrical_lanes,
                effectiveLanes: eff.lanes,
              };
            });

          const allExpected = [...expectedM2, ...expectedPcie];

          // Every impact entry should match expected values
          for (const impact of result.slotImpacts) {
            const expected = allExpected.find((e) => e.slotId === impact.slotId);
            expect(expected).toBeDefined();

            expect(impact.effectiveGen).toBe(expected!.effectiveGen);
            expect(impact.effectiveLanes).toBe(expected!.effectiveLanes);
            expect(impact.baseGen).toBe(expected!.baseGen);
            expect(impact.baseLanes).toBe(expected!.baseLanes);

            // Flag derivation
            expect(impact.hasGenDowngrade).toBe(impact.effectiveGen < impact.baseGen);
            expect(impact.hasLaneReduction).toBe(impact.effectiveLanes < impact.baseLanes);
          }

          // Count should match
          expect(result.slotImpacts.length).toBe(allExpected.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// -- Property 3: Only CPU-sourced slots appear in impact results --------------
// **Feature: cpu-impact-summary, Property 3: Only CPU-sourced slots appear in impact results**

describe("Property 3: Only CPU-sourced slots appear in impact results", () => {
  it("every SlotImpact entry has source === 'CPU' and no chipset slots appear", () => {
    /**
     * **Validates: Requirements 3.4**
     *
     * For any motherboard with both CPU and Chipset sourced slots and any CPU
     * component, every SlotImpact entry in the result has source === "CPU".
     * No chipset-sourced slot ever appears in slotImpacts.
     */
    fc.assert(
      fc.property(
        arbCPUComponent(),
        arbMotherboardWithMixedSources(),
        (cpu, board) => {
          const result = computeCpuImpact(board, cpu);

          // Every impact entry must be CPU-sourced
          for (const impact of result.slotImpacts) {
            expect(impact.source).toBe("CPU");
          }

          // Collect chipset slot IDs from the board
          const chipsetSlotIds = new Set([
            ...board.m2_slots.filter((s) => s.source === "Chipset").map((s) => s.id),
            ...board.pcie_slots.filter((s) => s.source === "Chipset").map((s) => s.id),
          ]);

          // No chipset slot ID should appear in results
          for (const impact of result.slotImpacts) {
            expect(chipsetSlotIds.has(impact.slotId)).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


// -- Property 4: Overall status derivation ------------------------------------
// **Feature: cpu-impact-summary, Property 4: Overall status derivation**

describe("Property 4: Overall status derivation", () => {
  it("overallStatus is 'error' when socket mismatch, 'warning' when downgrades exist, 'compatible' otherwise", () => {
    /**
     * **Validates: Requirements 4.1, 4.2, 4.3**
     *
     * For any CPU component and any motherboard:
     * - overallStatus is "error" when socketMatch is false
     * - overallStatus is "warning" when socketMatch is true and at least one
     *   SlotImpact has hasGenDowngrade or hasLaneReduction
     * - overallStatus is "compatible" when socketMatch is true and no downgrades
     */
    fc.assert(
      fc.property(
        arbCPUComponent(),
        arbMotherboardWithSlots(),
        (cpu, board) => {
          const result = computeCpuImpact(board, cpu);

          const hasAnyDowngrade = result.slotImpacts.some(
            (s) => s.hasGenDowngrade || s.hasLaneReduction
          );

          if (!result.socketMatch) {
            expect(result.overallStatus).toBe("error");
          } else if (hasAnyDowngrade) {
            expect(result.overallStatus).toBe("warning");
          } else {
            expect(result.overallStatus).toBe("compatible");
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
