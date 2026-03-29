import { describe, test, expect, vi } from "vitest";
import * as fc from "fast-check";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StepIndicator from "../../src/components/StepIndicator";
import StepNav from "../../src/components/StepNav";
import { WIZARD_STEPS } from "../../src/lib/wizard-step-config";
import type { StepDef } from "../../src/lib/wizard-step-config";
import type { ComponentTypeKey } from "../../src/lib/form-helpers";

const ALL_TYPES: ComponentTypeKey[] = [
  "motherboard", "cpu", "gpu", "nvme", "ram", "sata_ssd", "sata_hdd",
];

const componentTypeArb = fc.constantFrom(...ALL_TYPES);

// Feature: contribute-wizard-ui, Property 2: All steps are navigable without restriction

describe("Feature: contribute-wizard-ui, Property 2: All steps are navigable without restriction", () => {
  test("clicking any step index invokes the callback; no step is disabled", async () => {
    const user = userEvent.setup();

    await fc.assert(
      fc.asyncProperty(componentTypeArb, async (type) => {
        const steps = WIZARD_STEPS[type];
        const onStepClick = vi.fn();
        const errorCounts = steps.map(() => 0);

        const { unmount } = render(
          <StepIndicator
            steps={steps}
            currentStep={0}
            onStepClick={onStepClick}
            stepErrorCounts={errorCounts}
          />,
        );

        // Click every step button
        const buttons = screen.getAllByRole("button");
        for (let i = 0; i < buttons.length; i++) {
          await user.click(buttons[i]);
        }

        expect(onStepClick).toHaveBeenCalledTimes(steps.length);
        for (let i = 0; i < steps.length; i++) {
          expect(onStepClick).toHaveBeenCalledWith(i);
        }

        unmount();
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: contribute-wizard-ui, Property 4: Next and Back button visibility

describe("Feature: contribute-wizard-ui, Property 4: Next and Back button visibility", () => {
  test("Next hidden on last step, Back hidden on first step", () => {
    fc.assert(
      fc.property(componentTypeArb, (type) => {
        const steps = WIZARD_STEPS[type];

        for (let i = 0; i < steps.length; i++) {
          const { unmount } = render(
            <StepNav
              currentStep={i}
              totalSteps={steps.length}
              onNext={() => {}}
              onBack={() => {}}
              currentStepErrorCount={0}
            />,
          );

          const buttons = screen.getAllByRole("button");
          const buttonTexts = buttons.map((b) => b.textContent ?? "");

          if (i === 0) {
            // First step: no Back button
            expect(buttonTexts.some((t) => t.includes("Back"))).toBe(false);
          } else {
            expect(buttonTexts.some((t) => t.includes("Back"))).toBe(true);
          }

          if (i === steps.length - 1) {
            // Last step: no Next button
            expect(buttonTexts.some((t) => t.includes("Next"))).toBe(false);
          } else {
            expect(buttonTexts.some((t) => t.includes("Next"))).toBe(true);
          }

          unmount();
        }
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: contribute-wizard-ui, Property 5: Sequential navigation correctness

describe("Feature: contribute-wizard-ui, Property 5: Sequential navigation correctness", () => {
  test("Next goes to i+1, Back goes to i-1", async () => {
    const user = userEvent.setup();

    await fc.assert(
      fc.asyncProperty(
        componentTypeArb,
        async (type) => {
          const steps = WIZARD_STEPS[type];
          if (steps.length < 3) return; // Need at least 3 steps for a middle step

          const midIndex = 1; // Always use step 1 (has both Back and Next)

          const onNext = vi.fn();
          const onBack = vi.fn();

          const { unmount } = render(
            <StepNav
              currentStep={midIndex}
              totalSteps={steps.length}
              onNext={onNext}
              onBack={onBack}
              currentStepErrorCount={0}
            />,
          );

          const buttons = screen.getAllByRole("button");
          const backBtn = buttons.find((b) => b.textContent?.includes("Back"));
          const nextBtn = buttons.find((b) => b.textContent?.includes("Next"));

          if (backBtn) await user.click(backBtn);
          if (nextBtn) await user.click(nextBtn);

          expect(onBack).toHaveBeenCalledTimes(1);
          expect(onNext).toHaveBeenCalledTimes(1);

          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: contribute-wizard-ui, Property 6: Validation errors do not block navigation

describe("Feature: contribute-wizard-ui, Property 6: Validation errors do not block navigation", () => {
  test("Next always advances regardless of error count", async () => {
    const user = userEvent.setup();

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 50 }),
        async (errorCount) => {
          const onNext = vi.fn();

          const { unmount } = render(
            <StepNav
              currentStep={0}
              totalSteps={3}
              onNext={onNext}
              onBack={() => {}}
              currentStepErrorCount={errorCount}
            />,
          );

          const nextBtn = screen.getAllByRole("button").find((b) =>
            b.textContent?.includes("Next"),
          );
          expect(nextBtn).toBeDefined();
          expect((nextBtn as HTMLButtonElement).disabled).toBe(false);

          await user.click(nextBtn!);
          expect(onNext).toHaveBeenCalledTimes(1);

          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });
});
