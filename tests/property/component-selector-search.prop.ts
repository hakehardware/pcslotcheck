// Feature: component-picker-search — Property tests for search utility and socket filtering
import { describe, test, expect } from "vitest";
import * as fc from "fast-check";
import { filterCompatibleCPUs } from "../../src/lib/component-search";
import {
  searchComponents,
  SPEC_DISPLAY_KEYS,
} from "../../src/lib/component-search";
import type { DataManifest } from "../../src/lib/types";

// ── Shared Arbitraries ──────────────────────────────────────────────────────

type ManifestComponent = DataManifest["components"][number];

const componentTypes = ["cpu", "nvme", "gpu", "ram", "sata_drive"] as const;

const socketValues = ["AM5", "LGA1851", "LGA1700", "AM4", "LGA1200"];

/** Safe alphanumeric string that won't produce accidental whitespace tokens. */
const safeStringArb = fc
  .stringMatching(/^[A-Za-z0-9][A-Za-z0-9 -]{0,14}[A-Za-z0-9]$/)
  .filter((s) => s.trim().length >= 2);

/** Generate a random specs object appropriate for a given component type. */
function arbSpecsForType(
  type: string
): fc.Arbitrary<Record<string, unknown>> {
  const displayKeys = SPEC_DISPLAY_KEYS[type] ?? [];
  if (displayKeys.length === 0) {
    return fc.constant({});
  }
  // Build a record with each display key having a plausible value
  const entries: fc.Arbitrary<[string, unknown]>[] = displayKeys.map(({ key }) =>
    fc.oneof(
      safeStringArb.map((v) => [key, v] as [string, unknown]),
      fc.integer({ min: 1, max: 9999 }).map((v) => [key, v] as [string, unknown]),
      fc.constant([key, null] as [string, unknown])
    )
  );
  return fc.tuple(...entries).map((pairs) => Object.fromEntries(pairs));
}

/** Generate a random manifest component of a specific type. */
function arbComponentOfType(
  type: string
): fc.Arbitrary<ManifestComponent> {
  return fc
    .record({
      id: fc.stringMatching(/^[a-z0-9]{4,12}$/).filter((s) => s.length >= 4),
      manufacturer: safeStringArb,
      model: safeStringArb,
      specs: arbSpecsForType(type),
    })
    .map((base) => ({ ...base, type }));
}

/** Generate a random manifest component of any type. */
function arbComponent(): fc.Arbitrary<ManifestComponent> {
  return fc.constantFrom(...componentTypes).chain((type) => arbComponentOfType(type));
}

/** Generate a random manifest component list with mixed types. */
function arbComponentList(
  opts: { minLength?: number; maxLength?: number } = {}
): fc.Arbitrary<ManifestComponent[]> {
  return fc.array(arbComponent(), {
    minLength: opts.minLength ?? 0,
    maxLength: opts.maxLength ?? 30,
  });
}

/**
 * Build the searchable string for a component, mirroring the logic in
 * `searchComponents`. This is our independent oracle for verification.
 */
function buildSearchableString(component: ManifestComponent): string {
  const parts: string[] = [component.manufacturer, component.model];
  const displayKeys = SPEC_DISPLAY_KEYS[component.type];
  if (displayKeys) {
    for (const { key } of displayKeys) {
      const value = component.specs[key];
      if (value != null) {
        parts.push(String(value));
      }
    }
  }
  return parts.join(" ").toLowerCase();
}


// ── Property 1: Socket filtering returns only matching CPUs ─────────────────

describe("Feature: component-picker-search, Property 1: Socket filtering returns only matching CPUs", () => {
  /**
   * **Validates: Requirements 1.2**
   */

  test("all returned components have type 'cpu' and matching socket", () => {
    fc.assert(
      fc.property(
        arbComponentList({ minLength: 0, maxLength: 50 }),
        fc.constantFrom(...socketValues),
        (components, socket) => {
          // Ensure some components are CPUs with the target socket, some with other sockets,
          // and some are non-CPU types — the generator already produces mixed types.
          // Also inject a CPU with the target socket to make the test more interesting.
          const cpuWithSocket: ManifestComponent = {
            id: "injected-cpu",
            type: "cpu",
            manufacturer: "TestMfg",
            model: "TestModel",
            specs: { socket },
          };
          const allComponents = [...components, cpuWithSocket];

          const result = filterCompatibleCPUs(allComponents, socket);

          // Every result must be a CPU with the matching socket
          for (const c of result) {
            expect(c.type).toBe("cpu");
            expect(c.specs.socket).toBe(socket);
          }

          // The result must include every CPU with the matching socket from the input
          const expectedIds = allComponents
            .filter((c) => c.type === "cpu" && c.specs.socket === socket)
            .map((c) => c.id);
          const resultIds = result.map((c) => c.id);
          expect(resultIds).toEqual(expectedIds);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("non-cpu components are never included in the result", () => {
    fc.assert(
      fc.property(
        arbComponentList({ minLength: 1, maxLength: 30 }),
        fc.constantFrom(...socketValues),
        (components, socket) => {
          const result = filterCompatibleCPUs(components, socket);
          for (const c of result) {
            expect(c.type).toBe("cpu");
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ── Property 2: Search matches case-insensitively with partial-word support ─

describe("Feature: component-picker-search, Property 2: Search matches case-insensitively with partial-word support", () => {
  /**
   * **Validates: Requirements 3.1, 3.2, 3.3, 8.3**
   */

  test("a substring of a searchable field always produces a match for that component", () => {
    fc.assert(
      fc.property(
        arbComponent().chain((component) => {
          const searchable = buildSearchableString(component);
          // Pick a random substring of the searchable string (at least 1 char)
          if (searchable.length < 1) {
            return fc.constant({ component, query: "" });
          }
          return fc
            .record({
              start: fc.integer({ min: 0, max: searchable.length - 1 }),
              len: fc.integer({ min: 1, max: Math.min(10, searchable.length) }),
            })
            .map(({ start, len }) => {
              const end = Math.min(start + len, searchable.length);
              const substr = searchable.slice(start, end).trim();
              return { component, query: substr };
            })
            .filter(({ query }) => query.length > 0 && !query.includes(" "));
        }),
        ({ component, query }) => {
          const result = searchComponents([component], query);
          expect(result.items.length).toBeGreaterThanOrEqual(1);
          expect(result.items.some((c) => c.id === component.id)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("case variation of a query produces the same match results", () => {
    fc.assert(
      fc.property(
        arbComponentList({ minLength: 1, maxLength: 20 }),
        safeStringArb.filter((s) => s.trim().length > 0),
        (components, baseQuery) => {
          const lower = searchComponents(components, baseQuery.toLowerCase());
          const upper = searchComponents(components, baseQuery.toUpperCase());
          const mixed = searchComponents(
            components,
            baseQuery
              .split("")
              .map((ch, i) => (i % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase()))
              .join("")
          );

          // All case variations should produce the same set of matched IDs
          const lowerIds = lower.items.map((c) => c.id);
          const upperIds = upper.items.map((c) => c.id);
          const mixedIds = mixed.items.map((c) => c.id);

          expect(upperIds).toEqual(lowerIds);
          expect(mixedIds).toEqual(lowerIds);
          expect(upper.totalMatches).toBe(lower.totalMatches);
          expect(mixed.totalMatches).toBe(lower.totalMatches);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ── Property 3: Multi-token conjunction -- all tokens must match ────────────

describe("Feature: component-picker-search, Property 3: Multi-token conjunction -- all tokens must match", () => {
  /**
   * **Validates: Requirements 3.4**
   */

  test("a component is excluded when any token does not match its searchable string", () => {
    // Strategy: take a component, build a query with one valid token from its fields
    // and one guaranteed-non-matching token. The component must not appear in results.
    const nonMatchingToken = "zzzzqqqq"; // guaranteed not to appear in any generated field

    fc.assert(
      fc.property(
        arbComponent().chain((component) => {
          const searchable = buildSearchableString(component);
          // Extract a valid single token (a word from the searchable string)
          const words = searchable.split(/\s+/).filter((w) => w.length > 0);
          if (words.length === 0) {
            return fc.constant({ component, query: nonMatchingToken });
          }
          return fc.constantFrom(...words).map((validToken) => ({
            component,
            query: `${validToken} ${nonMatchingToken}`,
          }));
        }),
        ({ component, query }) => {
          const result = searchComponents([component], query);
          // The non-matching token ensures the component should be excluded
          expect(result.items.some((c) => c.id === component.id)).toBe(false);
          expect(result.totalMatches).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("a component is included when all tokens match its searchable string", () => {
    fc.assert(
      fc.property(
        arbComponent().chain((component) => {
          const searchable = buildSearchableString(component);
          const words = searchable.split(/\s+/).filter((w) => w.length > 0);
          if (words.length < 2) {
            return fc.constant({ component, query: words.join(" ") });
          }
          // Pick 2 random words from the searchable string
          return fc
            .subarray(words, { minLength: 1, maxLength: Math.min(3, words.length) })
            .map((tokens) => ({
              component,
              query: tokens.join(" "),
            }));
        }),
        ({ component, query }) => {
          if (query.trim().length === 0) return; // skip empty
          const result = searchComponents([component], query);
          expect(result.items.some((c) => c.id === component.id)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ── Property 4: Result cap invariant ────────────────────────────────────────

describe("Feature: component-picker-search, Property 4: Result cap invariant", () => {
  /**
   * **Validates: Requirements 4.1**
   */

  test("items.length is always <= 5 regardless of input size or query", () => {
    fc.assert(
      fc.property(
        fc.array(arbComponent(), { minLength: 0, maxLength: 200 }),
        fc.oneof(
          fc.constant(""),
          fc.constant("   "),
          safeStringArb,
          fc.constant("a")
        ),
        (components, query) => {
          const result = searchComponents(components, query);
          expect(result.items.length).toBeLessThanOrEqual(5);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("items.length is min(matchCount, 5) for non-empty queries", () => {
    fc.assert(
      fc.property(
        fc.array(arbComponent(), { minLength: 0, maxLength: 200 }),
        safeStringArb.filter((s) => s.trim().length > 0),
        (components, query) => {
          const result = searchComponents(components, query);
          const expectedLen = Math.min(result.totalMatches, 5);
          expect(result.items.length).toBe(expectedLen);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ── Property 5: Total match count accuracy ──────────────────────────────────

describe("Feature: component-picker-search, Property 5: Total match count accuracy", () => {
  /**
   * **Validates: Requirements 4.2**
   */

  test("totalMatches equals the independent count of matching components", () => {
    fc.assert(
      fc.property(
        fc.array(arbComponent(), { minLength: 0, maxLength: 50 }),
        fc.oneof(fc.constant(""), safeStringArb),
        (components, query) => {
          const result = searchComponents(components, query);

          // Independent oracle: count matches ourselves
          const tokens = query
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean);

          let expectedCount: number;
          if (tokens.length === 0) {
            // Empty query matches everything
            expectedCount = components.length;
          } else {
            expectedCount = components.filter((c) => {
              const searchable = buildSearchableString(c);
              return tokens.every((token) => searchable.includes(token));
            }).length;
          }

          expect(result.totalMatches).toBe(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("when totalMatches > 5, items.length is exactly 5", () => {
    fc.assert(
      fc.property(
        fc.array(arbComponent(), { minLength: 0, maxLength: 200 }),
        fc.oneof(fc.constant(""), safeStringArb),
        (components, query) => {
          const result = searchComponents(components, query);
          if (result.totalMatches > 5) {
            expect(result.items.length).toBe(5);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test("when totalMatches <= 5, items.length equals totalMatches", () => {
    fc.assert(
      fc.property(
        fc.array(arbComponent(), { minLength: 0, maxLength: 50 }),
        fc.oneof(fc.constant(""), safeStringArb),
        (components, query) => {
          const result = searchComponents(components, query);
          if (result.totalMatches <= 5) {
            expect(result.items.length).toBe(result.totalMatches);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
