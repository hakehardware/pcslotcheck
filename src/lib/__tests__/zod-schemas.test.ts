import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { RAMCapacitySchema } from "../zod-schemas";

// Property 1: RAM capacity schema validation
// Validates: Requirements 1.4, 1.5
describe("Property 1: RAM capacity schema validation", () => {
  const VALID_MODULE_COUNTS = new Set([1, 2, 4]);

  it("accepts iff modules in {1,2,4} and total_gb === per_module_gb * modules", () => {
    fc.assert(
      fc.property(
        fc.record({
          per_module_gb: fc.integer({ min: 1, max: 128 }),
          modules: fc.integer({ min: 0, max: 8 }),
          total_gb: fc.oneof(
            // Sometimes generate the correct total to test acceptance
            fc.integer({ min: 1, max: 128 }).map((pmg) => pmg), // placeholder, overridden below
            // Sometimes generate an arbitrary positive total to test rejection
            fc.integer({ min: 1, max: 1024 })
          ),
        }),
        // Override: half the time use the correct total, half the time use arbitrary
        // We do this by generating all three independently, then sometimes fixing total_gb
        (raw) => {
          // This approach generates all fields independently already, which is what we want.
          // The oneof above gives us a mix of matching and non-matching totals.
          const result = RAMCapacitySchema.safeParse(raw);

          const modulesValid = VALID_MODULE_COUNTS.has(raw.modules);
          const totalMatches = raw.total_gb === raw.per_module_gb * raw.modules;
          const shouldAccept = modulesValid && totalMatches;

          if (shouldAccept) {
            expect(result.success).toBe(true);
          } else {
            expect(result.success).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("accepts when total_gb exactly equals per_module_gb * modules for valid module counts", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 128 }),
        fc.constantFrom(1, 2, 4),
        (perModuleGb, modules) => {
          const obj = {
            per_module_gb: perModuleGb,
            modules,
            total_gb: perModuleGb * modules,
          };
          const result = RAMCapacitySchema.safeParse(obj);
          expect(result.success).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects when modules is not in {1,2,4}", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 128 }),
        fc.integer({ min: 0, max: 8 }).filter((m) => !VALID_MODULE_COUNTS.has(m)),
        (perModuleGb, modules) => {
          const obj = {
            per_module_gb: perModuleGb,
            modules,
            total_gb: perModuleGb * modules,
          };
          const result = RAMCapacitySchema.safeParse(obj);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects when total_gb does not equal per_module_gb * modules", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 128 }),
        fc.constantFrom(1, 2, 4),
        fc.integer({ min: 1, max: 1024 }),
        (perModuleGb, modules, totalGb) => {
          fc.pre(totalGb !== perModuleGb * modules);
          const obj = {
            per_module_gb: perModuleGb,
            modules,
            total_gb: totalGb,
          };
          const result = RAMCapacitySchema.safeParse(obj);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
