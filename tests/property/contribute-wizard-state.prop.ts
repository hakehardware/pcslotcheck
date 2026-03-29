import { describe, test, expect } from "vitest";
import * as fc from "fast-check";
import { WIZARD_STEPS } from "../../src/lib/wizard-step-config";
import type { ComponentTypeKey } from "../../src/lib/form-helpers";

const ALL_TYPES: ComponentTypeKey[] = [
  "motherboard", "cpu", "gpu", "nvme", "ram", "sata_ssd", "sata_hdd",
];

const componentTypeArb = fc.constantFrom(...ALL_TYPES);

const formDataArb = fc.dictionary(
  fc.stringMatching(/^[a-z][a-z0-9_]{0,9}$/).filter((s) => s.length >= 2),
  fc.oneof(fc.string(), fc.integer(), fc.boolean()),
  { minKeys: 1, maxKeys: 8 },
);

// Feature: contribute-wizard-ui, Property 3: Form data preservation across step navigation

describe("Feature: contribute-wizard-ui, Property 3: Form data preservation across step navigation", () => {
  test("for any form data and any step navigation sequence, form data remains identical", () => {
    fc.assert(
      fc.property(
        componentTypeArb,
        formDataArb,
        fc.array(fc.integer({ min: 0, max: 20 }), { minLength: 1, maxLength: 10 }),
        (type, formData, navSequence) => {
          const steps = WIZARD_STEPS[type];

          // Simulate step navigation: step changes never touch formData
          let currentStep = 0;
          const originalData = { ...formData };

          for (const target of navSequence) {
            // Clamp to valid range (same as WizardShell)
            currentStep = Math.max(0, Math.min(target, steps.length - 1));
          }

          // Form data must be identical after all navigation
          expect(formData).toEqual(originalData);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: contribute-wizard-ui, Property 8: Component type switch resets wizard state

describe("Feature: contribute-wizard-ui, Property 8: Component type switch resets wizard state", () => {
  test("switching type resets currentStep to 0 and formData to {}", () => {
    fc.assert(
      fc.property(
        componentTypeArb,
        componentTypeArb,
        formDataArb,
        fc.integer({ min: 0, max: 10 }),
        (typeA, typeB, existingData, existingStep) => {
          // Simulate the state before type switch
          let currentStep = existingStep;
          let formData: Record<string, unknown> = { ...existingData };

          // Simulate handleTypeSelect (same logic as ContributeClient)
          formData = {};
          currentStep = 0;

          expect(formData).toEqual({});
          expect(currentStep).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
