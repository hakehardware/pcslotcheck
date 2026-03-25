import { describe, it, expect } from "vitest";
import {
  makeStickId,
  parseStickId,
  isStickId,
  getStickIds,
  getKitAssignments,
  getAssignedKitIds,
} from "../stick-utils";

describe("makeStickId", () => {
  it("creates a stick ID from a component ID and index", () => {
    expect(makeStickId("corsair-vengeance-ddr5-6000-32gb", 1)).toBe(
      "corsair-vengeance-ddr5-6000-32gb__stick_1"
    );
  });

  it("handles different indices", () => {
    expect(makeStickId("kit-a", 2)).toBe("kit-a__stick_2");
    expect(makeStickId("kit-a", 4)).toBe("kit-a__stick_4");
  });

  it("handles component IDs with many hyphens", () => {
    expect(makeStickId("a-b-c-d-e", 3)).toBe("a-b-c-d-e__stick_3");
  });
});

describe("parseStickId", () => {
  it("parses a valid stick ID", () => {
    expect(parseStickId("corsair-vengeance-ddr5-6000-32gb__stick_1")).toEqual({
      componentId: "corsair-vengeance-ddr5-6000-32gb",
      stickIndex: 1,
    });
  });

  it("parses stick IDs with higher indices", () => {
    expect(parseStickId("kit-a__stick_4")).toEqual({
      componentId: "kit-a",
      stickIndex: 4,
    });
  });

  it("returns null for a plain component ID (no separator)", () => {
    expect(parseStickId("corsair-vengeance-ddr5-6000-32gb")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseStickId("")).toBeNull();
  });

  it("returns null when stick index is 0 (must be >= 1)", () => {
    expect(parseStickId("kit-a__stick_0")).toBeNull();
  });

  it("returns null when stick index is negative", () => {
    expect(parseStickId("kit-a__stick_-1")).toBeNull();
  });

  it("returns null when stick index is non-numeric", () => {
    expect(parseStickId("kit-a__stick_abc")).toBeNull();
  });

  it("returns null when stick index is a float", () => {
    expect(parseStickId("kit-a__stick_1.5")).toBeNull();
  });

  it("returns null when only the separator is present with no component ID", () => {
    expect(parseStickId("__stick_1")).toBeNull();
  });

  it("returns null when nothing follows the separator", () => {
    expect(parseStickId("kit-a__stick_")).toBeNull();
  });

  it("uses lastIndexOf so embedded separators in the component ID still parse", () => {
    // A component ID that itself contains __stick_ (unlikely but tests lastIndexOf)
    expect(parseStickId("weird__stick_id__stick_2")).toEqual({
      componentId: "weird__stick_id",
      stickIndex: 2,
    });
  });
});

describe("isStickId", () => {
  it("returns true for a valid stick ID", () => {
    expect(isStickId("kit-a__stick_1")).toBe(true);
  });

  it("returns false for a plain component ID", () => {
    expect(isStickId("corsair-vengeance-ddr5-6000-32gb")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isStickId("")).toBe(false);
  });

  it("returns false when stick index is 0", () => {
    expect(isStickId("kit-a__stick_0")).toBe(false);
  });

  it("returns false when stick index is non-numeric", () => {
    expect(isStickId("kit-a__stick_abc")).toBe(false);
  });

  it("returns false when no component ID precedes the separator", () => {
    expect(isStickId("__stick_1")).toBe(false);
  });
});

describe("getStickIds", () => {
  it("returns correct stick IDs for a 2-module kit", () => {
    expect(getStickIds("kit-a", 2)).toEqual([
      "kit-a__stick_1",
      "kit-a__stick_2",
    ]);
  });

  it("returns a single stick ID for a 1-module kit", () => {
    expect(getStickIds("kit-a", 1)).toEqual(["kit-a__stick_1"]);
  });

  it("returns four stick IDs for a 4-module kit", () => {
    expect(getStickIds("kit-a", 4)).toEqual([
      "kit-a__stick_1",
      "kit-a__stick_2",
      "kit-a__stick_3",
      "kit-a__stick_4",
    ]);
  });

  it("returns an empty array when module count is 0", () => {
    expect(getStickIds("kit-a", 0)).toEqual([]);
  });
});


describe("getKitAssignments", () => {
  it("extracts assignments for a specific kit from mixed assignments", () => {
    const assignments: Record<string, string> = {
      dimm_a1: "kit-a__stick_1",
      dimm_a2: "kit-b__stick_1",
      dimm_b1: "kit-a__stick_2",
      dimm_b2: "kit-b__stick_2",
    };

    expect(getKitAssignments(assignments, "kit-a")).toEqual({
      dimm_a1: "kit-a__stick_1",
      dimm_b1: "kit-a__stick_2",
    });
  });

  it("returns an empty object when no assignments match the kit", () => {
    const assignments: Record<string, string> = {
      dimm_a1: "kit-b__stick_1",
      dimm_b1: "kit-b__stick_2",
    };

    expect(getKitAssignments(assignments, "kit-a")).toEqual({});
  });

  it("returns an empty object for empty assignments", () => {
    expect(getKitAssignments({}, "kit-a")).toEqual({});
  });

  it("ignores plain component IDs (non-stick values)", () => {
    const assignments: Record<string, string> = {
      dimm_a1: "kit-a",
      dimm_b1: "kit-a__stick_1",
    };

    expect(getKitAssignments(assignments, "kit-a")).toEqual({
      dimm_b1: "kit-a__stick_1",
    });
  });
});

describe("getAssignedKitIds", () => {
  it("returns unique kit IDs from assignments with multiple kits", () => {
    const assignments: Record<string, string> = {
      dimm_a1: "kit-a__stick_1",
      dimm_a2: "kit-b__stick_1",
      dimm_b1: "kit-a__stick_2",
      dimm_b2: "kit-b__stick_2",
    };

    const result = getAssignedKitIds(assignments);
    expect(result).toHaveLength(2);
    expect(result).toContain("kit-a");
    expect(result).toContain("kit-b");
  });

  it("returns a single kit ID when all sticks belong to one kit", () => {
    const assignments: Record<string, string> = {
      dimm_a1: "kit-a__stick_1",
      dimm_b1: "kit-a__stick_2",
    };

    expect(getAssignedKitIds(assignments)).toEqual(["kit-a"]);
  });

  it("skips plain component IDs (non-stick values)", () => {
    const assignments: Record<string, string> = {
      dimm_a1: "some-plain-component",
      dimm_b1: "another-plain-component",
    };

    expect(getAssignedKitIds(assignments)).toEqual([]);
  });

  it("returns an empty array for empty assignments", () => {
    expect(getAssignedKitIds({})).toEqual([]);
  });
});


// -- Property-based tests -----------------------------------------------------

import * as fc from "fast-check";
import { arbRAMComponent, arbMultiKitAssignments } from "./generators";

// Property 4: Kit removal cleans all stick assignments
// Validates: Requirements 2.6
describe("Property 4: Kit removal cleans all stick assignments", () => {
  const DIMM_SLOTS = ["dimm_a1", "dimm_a2", "dimm_b1", "dimm_b2"];

  it("removing a kit leaves zero stick references for it and preserves all other entries", () => {
    fc.assert(
      fc.property(
        // Generate 2-3 kits with distinct IDs
        fc.integer({ min: 2, max: 3 }).chain((kitCount) =>
          fc
            .tuple(
              ...Array.from({ length: kitCount }, () => arbRAMComponent())
            )
            .filter((kits) => {
              // Ensure all kit IDs are unique
              const ids = new Set(kits.map((k) => k.id));
              return ids.size === kits.length;
            })
            .chain((kits) => {
              const kitIds = kits.map((k) => k.id);
              const moduleCounts = kits.map((k) => k.capacity.modules);
              return fc.tuple(
                fc.constant(kits),
                arbMultiKitAssignments(kitIds, moduleCounts, DIMM_SLOTS),
                // Pick one kit index to remove
                fc.integer({ min: 0, max: kits.length - 1 })
              );
            })
        ),
        ([kits, assignments, removeIndex]) => {
          const kitToRemove = kits[removeIndex].id;

          // Perform removal: filter out all entries whose stick ID belongs to the target kit
          const afterRemoval: Record<string, string> = {};
          for (const [slotId, stickId] of Object.entries(assignments)) {
            const parsed = parseStickId(stickId);
            if (parsed === null || parsed.componentId !== kitToRemove) {
              afterRemoval[slotId] = stickId;
            }
          }

          // Assert: no remaining entries reference the removed kit
          const removedKitEntries = getKitAssignments(afterRemoval, kitToRemove);
          expect(Object.keys(removedKitEntries)).toHaveLength(0);

          // Assert: all entries for other kits are preserved exactly
          for (const kit of kits) {
            if (kit.id === kitToRemove) continue;
            const originalEntries = getKitAssignments(assignments, kit.id);
            const remainingEntries = getKitAssignments(afterRemoval, kit.id);
            expect(remainingEntries).toEqual(originalEntries);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
