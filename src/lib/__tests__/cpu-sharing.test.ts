import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { encode, decode } from "../sharing";

// -- Generators ---------------------------------------------------------------

/** Kebab-case ID generator mimicking real component/board IDs. */
const arbKebabId = fc
  .stringMatching(/^[a-z][a-z0-9-]{2,30}[a-z0-9]$/)
  .filter((s) => !s.includes("--"));

/** Generates a Record<string, string> of slot-to-component assignments. */
function arbAssignments(): fc.Arbitrary<Record<string, string>> {
  const slotIds = [
    "m2_1", "m2_2", "m2_3", "m2_4",
    "pcie_1", "pcie_2", "pcie_3",
    "sata_1", "sata_2",
    "dimm_a1", "dimm_a2", "dimm_b1", "dimm_b2",
  ];

  return fc
    .subarray(slotIds, { minLength: 0, maxLength: slotIds.length })
    .chain((slots) =>
      fc
        .array(arbKebabId, { minLength: slots.length, maxLength: slots.length })
        .map((compIds) => {
          const assignments: Record<string, string> = {};
          for (let i = 0; i < slots.length; i++) {
            assignments[slots[i]] = compIds[i];
          }
          return assignments;
        })
    );
}

// -- Property 7 ---------------------------------------------------------------
// Feature: cpu-component-support, Property 7: Sharing round-trip with CPU assignment
// Validates: Requirements 9.1, 9.2, 9.3

describe("Property 7: Sharing round-trip with CPU assignment", () => {
  it("for any motherboard ID, optional CPU ID, and assignments, encode then decode produces equivalent state", () => {
    fc.assert(
      fc.property(
        arbKebabId,
        fc.option(arbKebabId, { nil: undefined }),
        arbAssignments(),
        (motherboardId, cpuId, assignments) => {
          const encoded = encode(motherboardId, assignments, cpuId);

          // Encoded string must be non-empty and URL-safe
          expect(encoded.length).toBeGreaterThan(0);
          expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);

          const decoded = decode(encoded);
          expect(decoded).not.toBeNull();
          expect(decoded!.motherboardId).toBe(motherboardId);
          expect(decoded!.assignments).toEqual(assignments);

          if (cpuId !== undefined) {
            expect(decoded!.cpuId).toBe(cpuId);
          } else {
            expect(decoded!.cpuId).toBeUndefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
