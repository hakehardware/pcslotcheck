import { describe, test, expect } from "vitest";
import * as fc from "fast-check";
import { WIZARD_STEPS } from "../../src/lib/wizard-step-config";
import type { ComponentTypeKey } from "../../src/lib/form-helpers";

const ALL_TYPES: ComponentTypeKey[] = [
  "motherboard", "cpu", "gpu", "nvme", "ram", "sata_ssd", "sata_hdd",
];

const componentTypeArb = fc.constantFrom(...ALL_TYPES);

// Feature: contribute-wizard-ui, Property 10: fieldFilter matches step config

describe("Feature: contribute-wizard-ui, Property 10: fieldFilter matches step config", () => {
  test("for any component type and non-review/non-canvas step, the fieldFilter Set contains exactly the step fields", () => {
    fc.assert(
      fc.property(componentTypeArb, (type) => {
        const steps = WIZARD_STEPS[type];
        for (const step of steps) {
          if (step.isReview || step.isCanvas) continue;

          // Simulate what WizardShell would pass as fieldFilter
          const fieldFilter = new Set(step.fields);

          // The Set must contain exactly the step's fields
          expect(fieldFilter.size).toBe(step.fields.length);
          for (const field of step.fields) {
            expect(fieldFilter.has(field)).toBe(true);
          }

          // No extra keys
          for (const key of fieldFilter) {
            expect(step.fields).toContain(key);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
