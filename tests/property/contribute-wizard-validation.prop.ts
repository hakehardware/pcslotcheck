import { describe, test, expect } from "vitest";
import * as fc from "fast-check";
import { getStepErrors } from "../../src/lib/wizard-step-config";
import type { StepDef } from "../../src/lib/wizard-step-config";
import type { ValidationError } from "../../src/lib/validation-engine-contribute";

const severityArb = fc.constantFrom<ValidationError["severity"]>("error", "warning");

const fieldNameArb = fc.stringMatching(/^[a-z][a-z0-9_]{0,14}$/).filter(
  (s) => s.length >= 2,
);

const validationErrorArb: fc.Arbitrary<ValidationError> = fc
  .record({
    field: fieldNameArb,
    suffix: fc.constantFrom("", "/0", "/nested", ".sub", "[0]"),
    message: fc.constant("test error"),
    severity: severityArb,
  })
  .map(({ field, suffix, message, severity }) => ({
    path: `${field}${suffix}`,
    message,
    severity,
  }));

// Feature: contribute-wizard-ui, Property 7: Step error filtering correctness

describe("Feature: contribute-wizard-ui, Property 7: Step error filtering correctness", () => {
  test("getStepErrors returns only errors whose path starts with a step field key", () => {
    const scenarioArb = fc
      .record({
        stepFields: fc.array(fieldNameArb, { minLength: 1, maxLength: 4 }),
        errors: fc.array(validationErrorArb, { minLength: 0, maxLength: 20 }),
      })
      .map(({ stepFields, errors }) => {
        const step: StepDef = { label: "Test Step", fields: stepFields };
        return { step, errors };
      });

    fc.assert(
      fc.property(scenarioArb, ({ step, errors }) => {
        const filtered = getStepErrors(errors, step);

        // Every returned error must match at least one step field
        for (const err of filtered) {
          const matches = step.fields.some(
            (field) =>
              err.path === `/${field}` ||
              err.path.startsWith(`/${field}/`) ||
              err.path === field ||
              err.path.startsWith(`${field}.`) ||
              err.path.startsWith(`${field}[`),
          );
          expect(matches).toBe(true);
        }

        // Every error in the original list that matches must be in filtered
        for (const err of errors) {
          const matches = step.fields.some(
            (field) =>
              err.path === `/${field}` ||
              err.path.startsWith(`/${field}/`) ||
              err.path === field ||
              err.path.startsWith(`${field}.`) ||
              err.path.startsWith(`${field}[`),
          );
          if (matches) {
            expect(filtered).toContain(err);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  test("review step (empty fields) returns all errors unfiltered", () => {
    const reviewStep: StepDef = {
      label: "Review & Download",
      fields: [],
      isReview: true,
    };

    fc.assert(
      fc.property(
        fc.array(validationErrorArb, { minLength: 0, maxLength: 20 }),
        (errors) => {
          const filtered = getStepErrors(errors, reviewStep);
          expect(filtered).toEqual(errors);
        },
      ),
      { numRuns: 100 },
    );
  });
});
