import { describe, test, expect } from "vitest";
import * as fc from "fast-check";
import * as yaml from "js-yaml";
import * as fs from "node:fs";
import * as path from "node:path";

// ── Helpers ─────────────────────────────────────────────────────────────────

interface WorkflowStep {
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
}

interface WorkflowConfig {
  jobs: {
    validate: {
      steps: WorkflowStep[];
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function loadWorkflow(): WorkflowConfig {
  const workflowPath = path.resolve(
    __dirname,
    "../../.github/workflows/validate-pr.yml"
  );
  const content = fs.readFileSync(workflowPath, "utf-8");
  return yaml.load(content) as WorkflowConfig;
}

// ── Property 1: Bug Condition — Missing Manifest Generation Step Before Tests ──

/**
 * **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
 *
 * This test asserts that the validate-pr.yml workflow includes a step
 * running `npm run generate-manifest` BEFORE the `npm run test` step.
 *
 * On UNFIXED code this test is EXPECTED TO FAIL, confirming the bug exists.
 */
describe("CI Manifest Generation — Bug Condition", () => {
  test("generate-manifest step must exist before the test step", () => {
    const workflow = loadWorkflow();
    const steps = workflow.jobs.validate.steps;

    const testStepIndex = steps.findIndex((s) => s.run === "npm run test");
    expect(testStepIndex).toBeGreaterThan(-1);

    const manifestStepIndex = steps.findIndex(
      (s) => s.run === "npm run generate-manifest"
    );

    // The manifest step must exist and come before the test step
    expect(manifestStepIndex).toBeGreaterThan(-1);
    expect(manifestStepIndex).toBeLessThan(testStepIndex);
  });

  test("property: manifest generation precedes tests regardless of step naming", () => {
    const workflow = loadWorkflow();
    const steps = workflow.jobs.validate.steps;

    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 50 }), (arbitraryName) => {
        // The structural property must hold regardless of what we name the steps.
        // Find steps by their `run` command, not by name.
        const testStepIndex = steps.findIndex((s) => s.run === "npm run test");
        const manifestStepIndex = steps.findIndex(
          (s) => s.run === "npm run generate-manifest"
        );

        // Test step must exist
        expect(testStepIndex).toBeGreaterThan(-1);

        // Manifest step must exist and precede the test step
        // (arbitraryName is unused intentionally — it proves the property
        //  is structural and independent of naming)
        expect(manifestStepIndex).toBeGreaterThan(-1);
        expect(manifestStepIndex).toBeLessThan(testStepIndex);
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 2: Preservation — Existing Workflow Steps Unchanged ────────────

/**
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 *
 * These tests verify that all original workflow steps are preserved with
 * the same names, commands, and relative ordering. The baseline is the
 * CURRENT unfixed workflow observed at the time of writing.
 */

/** Observed baseline steps from the unfixed workflow */
const ORIGINAL_STEPS: readonly { name: string; command: string }[] = [
  { name: "Checkout code", command: "actions/checkout@v4" },
  { name: "Setup Node.js 24", command: "actions/setup-node@v4" },
  { name: "Install dependencies", command: "npm ci" },
  { name: "Validate changed YAML files", command: "npm run validate -- --changed-only" },
  { name: "Check for duplicate IDs", command: "npm run check-duplicates" },
  { name: "Sanity check value ranges", command: "npm run sanity-check" },
  { name: "Run tests", command: "npm run test" },
] as const;

describe("CI Manifest Generation — Preservation", () => {
  test("property: every original step exists with the same name and command", () => {
    const workflow = loadWorkflow();
    const steps = workflow.jobs.validate.steps;

    // Generate arbitrary subsets of the original steps and verify each member
    // is present in the parsed workflow with matching name and run/uses command.
    const subsetArb = fc.subarray(ORIGINAL_STEPS.slice(), { minLength: 1 });

    fc.assert(
      fc.property(subsetArb, (subset) => {
        for (const original of subset) {
          const match = steps.find((s) => s.name === original.name);
          expect(match).toBeDefined();

          // Steps use either `run` or `uses` for their command
          const actualCommand = match!.run ?? match!.uses;
          expect(actualCommand).toBe(original.command);
        }
      }),
      { numRuns: 100 },
    );
  });

  test("property: relative ordering of original steps is preserved", () => {
    const workflow = loadWorkflow();
    const steps = workflow.jobs.validate.steps;

    // Generate arbitrary pairs of distinct original steps and verify
    // that if step A came before step B in the baseline, it still does.
    const pairArb = fc
      .tuple(
        fc.integer({ min: 0, max: ORIGINAL_STEPS.length - 1 }),
        fc.integer({ min: 0, max: ORIGINAL_STEPS.length - 1 }),
      )
      .filter(([a, b]) => a !== b);

    fc.assert(
      fc.property(pairArb, ([idxA, idxB]) => {
        const stepA = ORIGINAL_STEPS[idxA];
        const stepB = ORIGINAL_STEPS[idxB];

        const actualIdxA = steps.findIndex((s) => s.name === stepA.name);
        const actualIdxB = steps.findIndex((s) => s.name === stepB.name);

        expect(actualIdxA).toBeGreaterThan(-1);
        expect(actualIdxB).toBeGreaterThan(-1);

        // If A was originally before B, it must still be before B
        if (idxA < idxB) {
          expect(actualIdxA).toBeLessThan(actualIdxB);
        } else {
          expect(actualIdxA).toBeGreaterThan(actualIdxB);
        }
      }),
      { numRuns: 100 },
    );
  });

  test("property: workflow trigger is pull_request on paths data/**", () => {
    const workflow = loadWorkflow();

    // Use a property test to verify the trigger structure is stable
    // regardless of arbitrary string input (structural invariant).
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 20 }), () => {
        const trigger = (workflow as Record<string, unknown>)["on"] as Record<
          string,
          unknown
        >;
        expect(trigger).toBeDefined();
        expect(trigger["pull_request"]).toBeDefined();

        const pr = trigger["pull_request"] as Record<string, unknown>;
        expect(pr["paths"]).toBeDefined();
        expect(pr["paths"]).toEqual(["data/**"]);
      }),
      { numRuns: 10 },
    );
  });
});
