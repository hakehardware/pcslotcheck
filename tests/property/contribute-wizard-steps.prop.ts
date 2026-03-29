import { describe, test, expect } from "vitest";
import * as fc from "fast-check";
import { WIZARD_STEPS } from "../../src/lib/wizard-step-config";
import type { ComponentTypeKey } from "../../src/lib/form-helpers";

const ALL_TYPES: ComponentTypeKey[] = [
  "motherboard", "cpu", "gpu", "nvme", "ram", "sata_ssd", "sata_hdd",
];

const NON_MOTHERBOARD_TYPES: ComponentTypeKey[] = ALL_TYPES.filter(
  (t) => t !== "motherboard",
);

const componentTypeArb = fc.constantFrom(...ALL_TYPES);
const nonMotherboardTypeArb = fc.constantFrom(...NON_MOTHERBOARD_TYPES);

// Feature: contribute-wizard-ui, Property 1: Non-motherboard step count limit

describe("Feature: contribute-wizard-ui, Property 1: Non-motherboard step count limit", () => {
  test("for any non-motherboard ComponentTypeKey, WIZARD_STEPS has at most 3 steps", () => {
    fc.assert(
      fc.property(nonMotherboardTypeArb, (type) => {
        const steps = WIZARD_STEPS[type];
        expect(steps.length).toBeLessThanOrEqual(3);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: contribute-wizard-ui, Property 9: Step config structural validity

describe("Feature: contribute-wizard-ui, Property 9: Step config structural validity", () => {
  test("(a) non-empty array for every component type", () => {
    fc.assert(
      fc.property(componentTypeArb, (type) => {
        const steps = WIZARD_STEPS[type];
        expect(steps.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  test("(b) each step has a non-empty label", () => {
    fc.assert(
      fc.property(componentTypeArb, (type) => {
        for (const step of WIZARD_STEPS[type]) {
          expect(step.label.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  test("(c) last step is isReview with empty fields", () => {
    fc.assert(
      fc.property(componentTypeArb, (type) => {
        const steps = WIZARD_STEPS[type];
        const last = steps[steps.length - 1];
        expect(last.isReview).toBe(true);
        expect(last.fields).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  test("(d) non-review, non-canvas steps have at least one field", () => {
    fc.assert(
      fc.property(componentTypeArb, (type) => {
        for (const step of WIZARD_STEPS[type]) {
          if (!step.isReview && !step.isCanvas) {
            expect(step.fields.length).toBeGreaterThan(0);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
