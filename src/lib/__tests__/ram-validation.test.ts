// Property-based tests for RAM stick-level validation rules (Properties 5-11).
//
// Each property test calls validateRAMStickAssignments directly to test
// the RAM validation logic in isolation from the rest of the validation engine.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { validateRAMStickAssignments } from "../validation-engine";
import { makeStickId } from "../stick-utils";
import { arbRAMComponent, arbMemoryConfig } from "./generators";
import type { RAMComponent, MemoryConfig, Component } from "../types";

// -- Helpers ------------------------------------------------------------------

/** Build a components record from one or more RAM kits. */
function buildComponents(
  ...kits: RAMComponent[]
): Record<string, Component> {
  const components: Record<string, Component> = {};
  for (const kit of kits) {
    components[kit.id] = kit;
  }
  return components;
}

/** Build stick assignments mapping slot IDs to stick IDs for a single kit. */
function assignSticks(
  kitId: string,
  slotIds: string[]
): Record<string, string> {
  const assignments: Record<string, string> = {};
  for (let i = 0; i < slotIds.length; i++) {
    assignments[slotIds[i]] = makeStickId(kitId, i + 1);
  }
  return assignments;
}

/** Check if any result matches a severity and a message substring. */
function hasResult(
  results: { severity: string; message: string }[],
  severity: string,
  messageFragment: string
): boolean {
  return results.some(
    (r) => r.severity === severity && r.message.includes(messageFragment)
  );
}

// -- Property 5: Dual-channel placement validation ---------------------------
// Validates: Requirements 3.1, 3.2, 3.3

describe("Property 5: Dual-channel placement validation", () => {
  it("produces a warning when all sticks from a multi-stick kit are on the same channel", () => {
    fc.assert(
      fc.property(
        arbRAMComponent().filter((kit) => kit.capacity.modules >= 2),
        arbMemoryConfig().filter((cfg) => cfg.slots.length >= 2),
        fc.constantFrom("A" as const, "B" as const),
        (kit, config, channel) => {
          // Force DDR match so we isolate the dual-channel check
          const alignedKit = { ...kit, interface: { ...kit.interface, type: config.type } };
          // Ensure kit modules fit in available slots
          const sameChannelSlots = config.slots.filter((s) => s.channel === channel);
          if (sameChannelSlots.length < 2) return; // skip if not enough slots on one channel

          const slotsToUse = sameChannelSlots.slice(0, Math.min(alignedKit.capacity.modules, sameChannelSlots.length));
          if (slotsToUse.length < 2) return;

          // Override kit modules to match assigned count so we avoid incomplete-kit noise
          const adjustedKit: RAMComponent = {
            ...alignedKit,
            capacity: {
              ...alignedKit.capacity,
              modules: slotsToUse.length,
              total_gb: alignedKit.capacity.per_module_gb * slotsToUse.length,
            },
          };

          // Ensure capacity does not exceed max
          const safeConfig: MemoryConfig = {
            ...config,
            max_capacity_gb: Math.max(
              config.max_capacity_gb,
              adjustedKit.capacity.per_module_gb * config.slots.length + 1
            ),
          };

          const assignments = assignSticks(
            adjustedKit.id,
            slotsToUse.map((s) => s.id)
          );
          const components = buildComponents(adjustedKit);
          const results = validateRAMStickAssignments(safeConfig, assignments, components);

          expect(hasResult(results, "warning", "dual-channel")).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("produces no dual-channel warning when sticks span both channels", () => {
    fc.assert(
      fc.property(
        arbRAMComponent().filter((kit) => kit.capacity.modules >= 2),
        arbMemoryConfig().filter(
          (cfg) =>
            cfg.slots.filter((s) => s.channel === "A").length >= 1 &&
            cfg.slots.filter((s) => s.channel === "B").length >= 1
        ),
        (kit, config) => {
          const alignedKit = { ...kit, interface: { ...kit.interface, type: config.type } };
          const channelA = config.slots.filter((s) => s.channel === "A");
          const channelB = config.slots.filter((s) => s.channel === "B");

          // Pick one slot from each channel
          const slotsToUse = [channelA[0], channelB[0]];

          const adjustedKit: RAMComponent = {
            ...alignedKit,
            capacity: {
              ...alignedKit.capacity,
              modules: slotsToUse.length,
              total_gb: alignedKit.capacity.per_module_gb * slotsToUse.length,
            },
          };

          const safeConfig: MemoryConfig = {
            ...config,
            max_capacity_gb: Math.max(
              config.max_capacity_gb,
              adjustedKit.capacity.per_module_gb * config.slots.length + 1
            ),
          };

          const assignments = assignSticks(
            adjustedKit.id,
            slotsToUse.map((s) => s.id)
          );
          const components = buildComponents(adjustedKit);
          const results = validateRAMStickAssignments(safeConfig, assignments, components);

          expect(hasResult(results, "warning", "dual-channel")).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// -- Property 6: Recommended population order validation ----------------------
// Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5

describe("Property 6: Recommended population order validation", () => {
  it("produces a warning when populated slots mismatch the recommendation for 2 or 4 DIMMs", () => {
    fc.assert(
      fc.property(
        arbRAMComponent(),
        arbMemoryConfig().filter(
          (cfg) =>
            cfg.slots.length === 4 &&
            cfg.recommended_population.two_dimm.length === 2
        ),
        (kit, config) => {
          const alignedKit: RAMComponent = {
            ...kit,
            interface: { ...kit.interface, type: config.type },
            capacity: {
              ...kit.capacity,
              modules: 2,
              total_gb: kit.capacity.per_module_gb * 2,
            },
          };

          const safeConfig: MemoryConfig = {
            ...config,
            max_capacity_gb: Math.max(
              config.max_capacity_gb,
              alignedKit.capacity.per_module_gb * config.slots.length + 1
            ),
          };

          // Pick 2 slots that do NOT match the recommendation
          const recommended = new Set(safeConfig.recommended_population.two_dimm);
          const nonRecommended = safeConfig.slots
            .filter((s) => !recommended.has(s.id))
            .map((s) => s.id);

          if (nonRecommended.length < 1) return; // can't create mismatch

          // Use one recommended + one non-recommended to guarantee mismatch
          const recSlot = safeConfig.recommended_population.two_dimm[0];
          const wrongSlot = nonRecommended[0];
          const slotsToUse = [recSlot, wrongSlot];

          const assignments = assignSticks(alignedKit.id, slotsToUse);
          const components = buildComponents(alignedKit);
          const results = validateRAMStickAssignments(safeConfig, assignments, components);

          expect(hasResult(results, "warning", "recommended placement")).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("produces no warning when populated slots match the recommendation", () => {
    fc.assert(
      fc.property(
        arbRAMComponent(),
        arbMemoryConfig().filter(
          (cfg) =>
            cfg.slots.length === 4 &&
            cfg.recommended_population.two_dimm.length === 2
        ),
        (kit, config) => {
          const alignedKit: RAMComponent = {
            ...kit,
            interface: { ...kit.interface, type: config.type },
            capacity: {
              ...kit.capacity,
              modules: 2,
              total_gb: kit.capacity.per_module_gb * 2,
            },
          };

          const safeConfig: MemoryConfig = {
            ...config,
            max_capacity_gb: Math.max(
              config.max_capacity_gb,
              alignedKit.capacity.per_module_gb * config.slots.length + 1
            ),
          };

          // Use exactly the recommended slots
          const slotsToUse = safeConfig.recommended_population.two_dimm;
          const assignments = assignSticks(alignedKit.id, slotsToUse);
          const components = buildComponents(alignedKit);
          const results = validateRAMStickAssignments(safeConfig, assignments, components);

          expect(hasResult(results, "warning", "recommended placement")).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("produces an info message when no recommendation exists for the populated count", () => {
    fc.assert(
      fc.property(
        arbRAMComponent(),
        arbMemoryConfig().filter((cfg) => cfg.slots.length >= 3),
        (kit, config) => {
          const alignedKit: RAMComponent = {
            ...kit,
            interface: { ...kit.interface, type: config.type },
            capacity: {
              ...kit.capacity,
              modules: 1,
              total_gb: kit.capacity.per_module_gb,
            },
          };

          const safeConfig: MemoryConfig = {
            ...config,
            max_capacity_gb: Math.max(
              config.max_capacity_gb,
              alignedKit.capacity.per_module_gb * config.slots.length + 1
            ),
          };

          // Assign exactly 1 stick -- no recommendation for count=1
          const slotsToUse = [safeConfig.slots[0].id];
          const assignments = assignSticks(alignedKit.id, slotsToUse);
          const components = buildComponents(alignedKit);
          const results = validateRAMStickAssignments(safeConfig, assignments, components);

          expect(hasResult(results, "info", "No manufacturer recommendation")).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// -- Property 7: Incomplete kit detection -------------------------------------
// Validates: Requirements 5.1, 5.2

describe("Property 7: Incomplete kit detection", () => {
  it("produces an error when fewer sticks than kit modules are assigned", () => {
    fc.assert(
      fc.property(
        arbRAMComponent().filter((kit) => kit.capacity.modules >= 2),
        arbMemoryConfig().filter((cfg) => cfg.slots.length >= 2),
        (kit, config) => {
          const alignedKit: RAMComponent = {
            ...kit,
            interface: { ...kit.interface, type: config.type },
          };

          const safeConfig: MemoryConfig = {
            ...config,
            max_capacity_gb: Math.max(
              config.max_capacity_gb,
              alignedKit.capacity.per_module_gb * config.slots.length + 1
            ),
          };

          // Assign fewer sticks than modules (at least 1, less than modules)
          const assignCount = Math.min(
            alignedKit.capacity.modules - 1,
            safeConfig.slots.length
          );
          if (assignCount < 1) return;

          const slotsToUse = safeConfig.slots.slice(0, assignCount).map((s) => s.id);
          const assignments = assignSticks(alignedKit.id, slotsToUse);
          const components = buildComponents(alignedKit);
          const results = validateRAMStickAssignments(safeConfig, assignments, components);

          expect(hasResult(results, "error", "unassigned")).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("produces no incomplete-kit error when all sticks are assigned", () => {
    fc.assert(
      fc.property(
        arbRAMComponent(),
        arbMemoryConfig().filter((cfg) => cfg.slots.length >= 4),
        (kit, config) => {
          const modules = Math.min(kit.capacity.modules, config.slots.length);
          const alignedKit: RAMComponent = {
            ...kit,
            interface: { ...kit.interface, type: config.type },
            capacity: {
              ...kit.capacity,
              modules,
              total_gb: kit.capacity.per_module_gb * modules,
            },
          };

          const safeConfig: MemoryConfig = {
            ...config,
            max_capacity_gb: Math.max(
              config.max_capacity_gb,
              alignedKit.capacity.per_module_gb * config.slots.length + 1
            ),
          };

          // Assign exactly modules sticks
          const slotsToUse = safeConfig.slots.slice(0, alignedKit.capacity.modules).map((s) => s.id);
          const assignments = assignSticks(alignedKit.id, slotsToUse);
          const components = buildComponents(alignedKit);
          const results = validateRAMStickAssignments(safeConfig, assignments, components);

          expect(hasResult(results, "error", "unassigned")).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// -- Property 8: Mixed kit XMP/EXPO warning -----------------------------------
// Validates: Requirements 6.1, 6.2

describe("Property 8: Mixed kit XMP/EXPO warning", () => {
  it("produces a warning when sticks from 2+ distinct kits are assigned", () => {
    fc.assert(
      fc.property(
        arbRAMComponent(),
        arbRAMComponent(),
        arbMemoryConfig().filter((cfg) => cfg.slots.length >= 2),
        (kitA, kitB, config) => {
          // Ensure distinct kit IDs
          if (kitA.id === kitB.id) return;

          const alignedA: RAMComponent = {
            ...kitA,
            interface: { ...kitA.interface, type: config.type },
            capacity: { ...kitA.capacity, modules: 1, total_gb: kitA.capacity.per_module_gb },
          };
          const alignedB: RAMComponent = {
            ...kitB,
            interface: { ...kitB.interface, type: config.type },
            capacity: { ...kitB.capacity, modules: 1, total_gb: kitB.capacity.per_module_gb },
          };

          const safeConfig: MemoryConfig = {
            ...config,
            max_capacity_gb: Math.max(
              config.max_capacity_gb,
              (alignedA.capacity.per_module_gb + alignedB.capacity.per_module_gb) * 2 + 1
            ),
          };

          const assignments: Record<string, string> = {
            [safeConfig.slots[0].id]: makeStickId(alignedA.id, 1),
            [safeConfig.slots[1].id]: makeStickId(alignedB.id, 1),
          };
          const components = buildComponents(alignedA, alignedB);
          const results = validateRAMStickAssignments(safeConfig, assignments, components);

          expect(hasResult(results, "warning", "Multiple RAM kits")).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("produces no mixed-kit warning when all sticks belong to one kit", () => {
    fc.assert(
      fc.property(
        arbRAMComponent().filter((kit) => kit.capacity.modules >= 2),
        arbMemoryConfig().filter((cfg) => cfg.slots.length >= 2),
        (kit, config) => {
          const modules = Math.min(kit.capacity.modules, config.slots.length);
          const alignedKit: RAMComponent = {
            ...kit,
            interface: { ...kit.interface, type: config.type },
            capacity: {
              ...kit.capacity,
              modules,
              total_gb: kit.capacity.per_module_gb * modules,
            },
          };

          const safeConfig: MemoryConfig = {
            ...config,
            max_capacity_gb: Math.max(
              config.max_capacity_gb,
              alignedKit.capacity.per_module_gb * config.slots.length + 1
            ),
          };

          const slotsToUse = safeConfig.slots.slice(0, alignedKit.capacity.modules).map((s) => s.id);
          const assignments = assignSticks(alignedKit.id, slotsToUse);
          const components = buildComponents(alignedKit);
          const results = validateRAMStickAssignments(safeConfig, assignments, components);

          expect(hasResult(results, "warning", "Multiple RAM kits")).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// -- Property 9: Total capacity validation ------------------------------------
// Validates: Requirements 7.1, 7.2

describe("Property 9: Total capacity validation", () => {
  it("produces an error when total per-stick capacity exceeds max_capacity_gb", () => {
    fc.assert(
      fc.property(
        arbRAMComponent(),
        arbMemoryConfig().filter((cfg) => cfg.slots.length >= 2),
        (kit, config) => {
          const alignedKit: RAMComponent = {
            ...kit,
            interface: { ...kit.interface, type: config.type },
          };

          const modules = Math.min(alignedKit.capacity.modules, config.slots.length);
          if (modules < 1) return;

          const totalGb = alignedKit.capacity.per_module_gb * modules;

          // Force max_capacity_gb to be less than total
          const tightConfig: MemoryConfig = {
            ...config,
            max_capacity_gb: totalGb - 1,
          };

          if (tightConfig.max_capacity_gb < 1) return;

          const adjustedKit: RAMComponent = {
            ...alignedKit,
            capacity: {
              ...alignedKit.capacity,
              modules,
              total_gb: totalGb,
            },
          };

          const slotsToUse = tightConfig.slots.slice(0, modules).map((s) => s.id);
          const assignments = assignSticks(adjustedKit.id, slotsToUse);
          const components = buildComponents(adjustedKit);
          const results = validateRAMStickAssignments(tightConfig, assignments, components);

          expect(hasResult(results, "error", "exceeds")).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("produces no capacity error when total does not exceed max_capacity_gb", () => {
    fc.assert(
      fc.property(
        arbRAMComponent(),
        arbMemoryConfig().filter((cfg) => cfg.slots.length >= 1),
        (kit, config) => {
          const modules = Math.min(kit.capacity.modules, config.slots.length);
          if (modules < 1) return;

          const alignedKit: RAMComponent = {
            ...kit,
            interface: { ...kit.interface, type: config.type },
            capacity: {
              ...kit.capacity,
              modules,
              total_gb: kit.capacity.per_module_gb * modules,
            },
          };

          const totalGb = alignedKit.capacity.per_module_gb * modules;

          // Ensure max_capacity_gb is at least the total
          const safeConfig: MemoryConfig = {
            ...config,
            max_capacity_gb: Math.max(config.max_capacity_gb, totalGb),
          };

          const slotsToUse = safeConfig.slots.slice(0, modules).map((s) => s.id);
          const assignments = assignSticks(alignedKit.id, slotsToUse);
          const components = buildComponents(alignedKit);
          const results = validateRAMStickAssignments(safeConfig, assignments, components);

          expect(hasResult(results, "error", "exceeds")).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// -- Property 10: DDR generation compatibility --------------------------------
// Validates: Requirements 8.1

describe("Property 10: DDR generation compatibility", () => {
  it("produces an error when kit DDR type differs from board DDR type", () => {
    fc.assert(
      fc.property(
        arbRAMComponent(),
        arbMemoryConfig(),
        (kit, config) => {
          // Force a DDR mismatch
          const mismatchedType = config.type === "DDR5" ? "DDR4" : "DDR5";
          const mismatchedKit: RAMComponent = {
            ...kit,
            interface: { ...kit.interface, type: mismatchedType },
            capacity: {
              ...kit.capacity,
              modules: 1,
              total_gb: kit.capacity.per_module_gb,
            },
          };

          const safeConfig: MemoryConfig = {
            ...config,
            max_capacity_gb: Math.max(
              config.max_capacity_gb,
              mismatchedKit.capacity.per_module_gb * config.slots.length + 1
            ),
          };

          const slotsToUse = [safeConfig.slots[0].id];
          const assignments = assignSticks(mismatchedKit.id, slotsToUse);
          const components = buildComponents(mismatchedKit);
          const results = validateRAMStickAssignments(safeConfig, assignments, components);

          expect(
            hasResult(results, "error", "requires") ||
            hasResult(results, "error", mismatchedType)
          ).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("produces no DDR mismatch error when types match", () => {
    fc.assert(
      fc.property(
        arbRAMComponent(),
        arbMemoryConfig(),
        (kit, config) => {
          const alignedKit: RAMComponent = {
            ...kit,
            interface: { ...kit.interface, type: config.type },
            capacity: {
              ...kit.capacity,
              modules: 1,
              total_gb: kit.capacity.per_module_gb,
            },
          };

          const safeConfig: MemoryConfig = {
            ...config,
            max_capacity_gb: Math.max(
              config.max_capacity_gb,
              alignedKit.capacity.per_module_gb * config.slots.length + 1
            ),
          };

          const slotsToUse = [safeConfig.slots[0].id];
          const assignments = assignSticks(alignedKit.id, slotsToUse);
          const components = buildComponents(alignedKit);
          const results = validateRAMStickAssignments(safeConfig, assignments, components);

          // No result should mention DDR mismatch
          const hasDDRError = results.some(
            (r) =>
              r.severity === "error" &&
              r.message.includes("requires") &&
              (r.message.includes("DDR4") || r.message.includes("DDR5"))
          );
          expect(hasDDRError).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// -- Property 11: Stick count vs available slots ------------------------------
// Validates: Requirements 9.1

describe("Property 11: Stick count vs available slots", () => {
  it("produces an error when kit modules exceeds DIMM slot count", () => {
    fc.assert(
      fc.property(
        arbRAMComponent().filter((kit) => kit.capacity.modules === 4),
        arbMemoryConfig().filter((cfg) => cfg.slots.length === 2),
        (kit, config) => {
          // Kit has 4 modules but board only has 2 slots
          const alignedKit: RAMComponent = {
            ...kit,
            interface: { ...kit.interface, type: config.type },
          };

          const safeConfig: MemoryConfig = {
            ...config,
            max_capacity_gb: Math.max(
              config.max_capacity_gb,
              alignedKit.capacity.per_module_gb * 4 + 1
            ),
          };

          // Assign as many sticks as slots allow
          const slotsToUse = safeConfig.slots.map((s) => s.id);
          const assignments = assignSticks(alignedKit.id, slotsToUse);
          const components = buildComponents(alignedKit);
          const results = validateRAMStickAssignments(safeConfig, assignments, components);

          expect(hasResult(results, "error", "DIMM slots")).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("produces no stick-count error when modules <= slot count", () => {
    fc.assert(
      fc.property(
        arbRAMComponent(),
        arbMemoryConfig().filter((cfg) => cfg.slots.length >= 4),
        (kit, config) => {
          // Ensure modules <= slots
          const modules = Math.min(kit.capacity.modules, config.slots.length);
          const alignedKit: RAMComponent = {
            ...kit,
            interface: { ...kit.interface, type: config.type },
            capacity: {
              ...kit.capacity,
              modules,
              total_gb: kit.capacity.per_module_gb * modules,
            },
          };

          const safeConfig: MemoryConfig = {
            ...config,
            max_capacity_gb: Math.max(
              config.max_capacity_gb,
              alignedKit.capacity.per_module_gb * config.slots.length + 1
            ),
          };

          const slotsToUse = safeConfig.slots.slice(0, modules).map((s) => s.id);
          const assignments = assignSticks(alignedKit.id, slotsToUse);
          const components = buildComponents(alignedKit);
          const results = validateRAMStickAssignments(safeConfig, assignments, components);

          expect(hasResult(results, "error", "DIMM slots")).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
