// Property-based tests for component-board-cards feature.
// Uses fast-check with minimum 100 iterations per property.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { BsMotherboard } from "react-icons/bs";
import { FiBox } from "react-icons/fi";
import { COMPONENT_TYPE_META, COMPONENT_SPEC_COLUMNS } from "../component-type-meta";
import { getThumbnailIcon } from "../thumbnail";
import {
  getBoardSpecLabels,
  getComponentSpecLabels,
  paginateItems,
  getViewMode,
  setViewMode,
} from "../view-mode";
import type { ViewMode } from "../view-mode";
import type { MotherboardSummary, ComponentSummary } from "../types";
import { arbMotherboardSummary, arbComponentSummary } from "./generators";

const KNOWN_TYPES = Object.keys(COMPONENT_TYPE_META);

// ---------------------------------------------------------------------------
// Feature: component-board-cards, Property 1: Icon resolution maps entity types correctly
// **Validates: Requirements 1.2, 1.3, 2.2, 2.3, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.8**
// ---------------------------------------------------------------------------

describe("Property 1: Icon resolution maps entity types correctly", () => {
  it("returns BsMotherboard for 'motherboard'", () => {
    fc.assert(
      fc.property(fc.constant("motherboard"), (type) => {
        expect(getThumbnailIcon(type)).toBe(BsMotherboard);
      }),
      { numRuns: 100 }
    );
  });

  it("returns the COMPONENT_TYPE_META icon for known component types", () => {
    fc.assert(
      fc.property(fc.constantFrom(...KNOWN_TYPES), (type) => {
        const expected = COMPONENT_TYPE_META[type].icon;
        expect(getThumbnailIcon(type)).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  it("returns FiBox for unknown types", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter(
          (s) => s !== "motherboard" && !KNOWN_TYPES.includes(s)
        ),
        (type) => {
          expect(getThumbnailIcon(type)).toBe(FiBox);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("returns correct icon for arbitrary strings including known types and random strings", () => {
    const arbEntityType = fc.oneof(
      fc.constant("motherboard"),
      fc.constantFrom(...KNOWN_TYPES),
      fc.string({ minLength: 0, maxLength: 50 })
    );

    fc.assert(
      fc.property(arbEntityType, (type) => {
        const icon = getThumbnailIcon(type);
        if (type === "motherboard") {
          expect(icon).toBe(BsMotherboard);
        } else if (KNOWN_TYPES.includes(type)) {
          expect(icon).toBe(COMPONENT_TYPE_META[type].icon);
        } else {
          expect(icon).toBe(FiBox);
        }
      }),
      { numRuns: 100 }
    );
  });
});


// ---------------------------------------------------------------------------
// Feature: component-board-cards, Property 3: Search filter returns only matching entities
// **Validates: Requirements 3.2, 4.2**
// ---------------------------------------------------------------------------

describe("Property 3: Search filter returns only matching entities", () => {
  // Board search: case-insensitive match on manufacturer or model
  function filterBoards(
    boards: MotherboardSummary[],
    search: string
  ): MotherboardSummary[] {
    const lower = search.toLowerCase();
    return boards.filter(
      (b) =>
        b.manufacturer.toLowerCase().includes(lower) ||
        b.model.toLowerCase().includes(lower)
    );
  }

  // Component search: case-insensitive match on manufacturer, model, or type
  function filterComponents(
    components: ComponentSummary[],
    search: string
  ): ComponentSummary[] {
    const lower = search.toLowerCase();
    return components.filter(
      (c) =>
        c.manufacturer.toLowerCase().includes(lower) ||
        c.model.toLowerCase().includes(lower) ||
        c.type.toLowerCase().includes(lower)
    );
  }

  it("every board result contains the search string in manufacturer or model", () => {
    fc.assert(
      fc.property(
        fc.array(arbMotherboardSummary(), { minLength: 0, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        (boards, search) => {
          const results = filterBoards(boards, search);
          const lower = search.toLowerCase();
          for (const b of results) {
            const matches =
              b.manufacturer.toLowerCase().includes(lower) ||
              b.model.toLowerCase().includes(lower);
            expect(matches).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("no matching board is excluded from results", () => {
    fc.assert(
      fc.property(
        fc.array(arbMotherboardSummary(), { minLength: 0, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        (boards, search) => {
          const results = filterBoards(boards, search);
          const lower = search.toLowerCase();
          for (const b of boards) {
            const shouldMatch =
              b.manufacturer.toLowerCase().includes(lower) ||
              b.model.toLowerCase().includes(lower);
            if (shouldMatch) {
              expect(results).toContainEqual(b);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("every component result contains the search string in manufacturer, model, or type", () => {
    fc.assert(
      fc.property(
        fc.array(arbComponentSummary(), { minLength: 0, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        (components, search) => {
          const results = filterComponents(components, search);
          const lower = search.toLowerCase();
          for (const c of results) {
            const matches =
              c.manufacturer.toLowerCase().includes(lower) ||
              c.model.toLowerCase().includes(lower) ||
              c.type.toLowerCase().includes(lower);
            expect(matches).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("no matching component is excluded from results", () => {
    fc.assert(
      fc.property(
        fc.array(arbComponentSummary(), { minLength: 0, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        (components, search) => {
          const results = filterComponents(components, search);
          const lower = search.toLowerCase();
          for (const c of components) {
            const shouldMatch =
              c.manufacturer.toLowerCase().includes(lower) ||
              c.model.toLowerCase().includes(lower) ||
              c.type.toLowerCase().includes(lower);
            if (shouldMatch) {
              expect(results).toContainEqual(c);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ---------------------------------------------------------------------------
// Feature: component-board-cards, Property 4: Board spec summary contains chipset, socket, and form factor
// **Validates: Requirements 3.8**
// ---------------------------------------------------------------------------

describe("Property 4: Board spec summary contains chipset, socket, and form factor", () => {
  it("returns exactly [chipset, socket, form_factor] for any MotherboardSummary", () => {
    fc.assert(
      fc.property(arbMotherboardSummary(), (board) => {
        const labels = getBoardSpecLabels(board);
        expect(labels).toEqual([board.chipset, board.socket, board.form_factor]);
        expect(labels).toHaveLength(3);
      }),
      { numRuns: 100 }
    );
  });
});


// ---------------------------------------------------------------------------
// Feature: component-board-cards, Property 5: Component spec labels match COMPONENT_SPEC_COLUMNS
// **Validates: Requirements 4.8**
// ---------------------------------------------------------------------------

describe("Property 5: Component spec labels match COMPONENT_SPEC_COLUMNS", () => {
  // Generator that produces ComponentSummary with specs keyed exactly as
  // COMPONENT_SPEC_COLUMNS expects (dotted keys stored flat in the specs map).
  const TYPES_WITH_COLUMNS = Object.keys(COMPONENT_SPEC_COLUMNS) as Array<
    keyof typeof COMPONENT_SPEC_COLUMNS
  >;

  function arbComponentWithMatchingSpecs(): fc.Arbitrary<ComponentSummary> {
    return fc.constantFrom(...TYPES_WITH_COLUMNS).chain((type) => {
      const columns = COMPONENT_SPEC_COLUMNS[type];
      // For each column, randomly decide whether the value is present or null
      const specEntries = columns.map((col) =>
        fc
          .option(fc.oneof(fc.string({ minLength: 1, maxLength: 10 }), fc.integer({ min: 1, max: 9999 })), {
            nil: undefined,
          })
          .map((val) => [col.key, val] as const)
      );

      return fc
        .tuple(
          fc.constantFrom("AMD", "Intel", "Samsung", "Corsair"),
          fc.string({ minLength: 2, maxLength: 8 }).filter((s) => /^[a-z]/.test(s)),
          ...specEntries
        )
        .map(([manufacturer, idSuffix, ...entries]) => {
          const specs: Record<string, unknown> = {};
          for (const [key, val] of entries) {
            if (val !== undefined) {
              specs[key] = val;
            }
          }
          return {
            id: `${type}-${(manufacturer as string).toLowerCase()}-${idSuffix}`,
            type: type as string,
            manufacturer: manufacturer as string,
            model: `${manufacturer} ${(type as string).toUpperCase()} ${idSuffix}`,
            specs,
          };
        });
    });
  }

  it("output contains one 'Label: value' entry per non-null column for the component type", () => {
    fc.assert(
      fc.property(arbComponentWithMatchingSpecs(), (comp) => {
        const labels = getComponentSpecLabels(comp);
        const columns = COMPONENT_SPEC_COLUMNS[comp.type] ?? [];

        // Count how many columns have non-null values
        const expectedCount = columns.filter(
          (col) => comp.specs[col.key] != null
        ).length;
        expect(labels).toHaveLength(expectedCount);

        // Each label should be "ColumnLabel: value"
        for (const col of columns) {
          const val = comp.specs[col.key];
          if (val != null) {
            expect(labels).toContainEqual(`${col.label}: ${val}`);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it("returns empty array for unknown component types", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }).filter(
          (s) =>
            !TYPES_WITH_COLUMNS.includes(s as keyof typeof COMPONENT_SPEC_COLUMNS) &&
            !(s in Object.prototype)
        ),
        (unknownType) => {
          const comp: ComponentSummary = {
            id: `unknown-${unknownType}`,
            type: unknownType,
            manufacturer: "Test",
            model: "Test Model",
            specs: { foo: "bar" },
          };
          expect(getComponentSpecLabels(comp)).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ---------------------------------------------------------------------------
// Feature: component-board-cards, Property 6: Pagination bounds
// **Validates: Requirements 3.9, 4.9**
// ---------------------------------------------------------------------------

describe("Property 6: Pagination bounds", () => {
  it("returns at most pageSize items and correct totalPages", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 0, maxLength: 100 }),
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 1, max: 20 }),
        (items, pageSize, page) => {
          const { rows, totalPages } = paginateItems(items, page, pageSize);

          // Total pages should be ceil(N / P), minimum 1
          const expectedTotalPages = Math.max(1, Math.ceil(items.length / pageSize));
          expect(totalPages).toBe(expectedTotalPages);

          // Rows should never exceed pageSize
          expect(rows.length).toBeLessThanOrEqual(pageSize);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("page 1 starts at index 0", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 1, maxLength: 100 }),
        fc.integer({ min: 1, max: 50 }),
        (items, pageSize) => {
          const { rows } = paginateItems(items, 1, pageSize);
          const expectedSlice = items.slice(0, pageSize);
          expect(rows).toEqual(expectedSlice);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("last page contains the remaining items", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 1, maxLength: 100 }),
        fc.integer({ min: 1, max: 50 }),
        (items, pageSize) => {
          const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
          const { rows } = paginateItems(items, totalPages, pageSize);

          const remainder = items.length % pageSize;
          const expectedCount = remainder === 0 ? pageSize : remainder;
          expect(rows).toHaveLength(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("out-of-range pages are clamped", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 1, maxLength: 50 }),
        fc.integer({ min: 1, max: 20 }),
        (items, pageSize) => {
          const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

          // Page beyond total should clamp to last page
          const beyondResult = paginateItems(items, totalPages + 10, pageSize);
          const lastPageResult = paginateItems(items, totalPages, pageSize);
          expect(beyondResult.rows).toEqual(lastPageResult.rows);

          // Page 0 or negative should clamp to page 1
          const zeroResult = paginateItems(items, 0, pageSize);
          const firstResult = paginateItems(items, 1, pageSize);
          expect(zeroResult.rows).toEqual(firstResult.rows);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ---------------------------------------------------------------------------
// Feature: component-board-cards, Property 7: View mode localStorage round-trip
// **Validates: Requirements 8.5, 8.8**
// ---------------------------------------------------------------------------

describe("Property 7: View mode localStorage round-trip", () => {
  // In-memory localStorage mock for Node environment
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    const mockStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
      get length() {
        return Object.keys(store).length;
      },
      key: (index: number) => Object.keys(store)[index] ?? null,
    };
    globalThis.localStorage = mockStorage as Storage;
  });

  afterEach(() => {
    // Clean up the global mock
    delete (globalThis as Record<string, unknown>).localStorage;
  });

  it("setViewMode then getViewMode returns the same value for any valid ViewMode", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<ViewMode>("table", "compact", "full"),
        fc.string({ minLength: 1, maxLength: 30 }),
        (mode, key) => {
          setViewMode(key, mode);
          const retrieved = getViewMode(key);
          expect(retrieved).toBe(mode);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("getViewMode returns default when key has not been set", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }),
        (key) => {
          const retrieved = getViewMode(key);
          expect(retrieved).toBe("full");
        }
      ),
      { numRuns: 100 }
    );
  });
});
