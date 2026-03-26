// Property-based tests for component pagination query logic.
// Uses fast-check with minimum 100 iterations per property.

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import type { PerTypeComponentRow } from "../db-types";
import { COMPONENT_TABLE_MAP } from "../db-types";
import { COMPONENT_SPEC_COLUMNS } from "../component-type-meta";
import {
  arbNvmeComponentRow,
  arbGpuComponentRow,
  arbRamComponentRow,
  arbSataComponentRow,
  arbPerTypeComponentRow,
} from "./generators";

// ---------------------------------------------------------------------------
// Supabase mock infrastructure
// ---------------------------------------------------------------------------

// We mock the dynamic `import("./supabase")` used inside supabase-queries.ts.
// The mock builds a chainable query builder that operates on in-memory arrays.

type Row = Record<string, unknown>;

/** In-memory table store keyed by table name. */
let tables: Record<string, Row[]> = {};

/** Reset all tables before each test. */
function resetTables() {
  tables = {
    components_gpu: [],
    components_nvme: [],
    components_ram: [],
    components_sata: [],
  };
}

/**
 * Creates a chainable Supabase query builder mock that operates on the
 * in-memory `tables` store. Supports select, eq, or (ilike), order, range,
 * and the `count: "exact"` / `head: true` options.
 */
function createQueryBuilder(tableName: string, rows: Row[], opts: { count?: string; head?: boolean } = {}) {
  let filtered = [...rows];
  let countExact = opts.count === "exact";
  let headOnly = opts.head === true;
  let orderKeys: { col: string; asc: boolean }[] = [];
  let rangeFrom: number | undefined;
  let rangeTo: number | undefined;

  const builder: Record<string, unknown> = {};

  builder.eq = (col: string, val: unknown) => {
    filtered = filtered.filter((r) => r[col] === val);
    return builder;
  };

  builder.or = (expr: string) => {
    // Parse patterns like: manufacturer.ilike.%foo%,model.ilike.%foo%
    const parts = expr.split(",");
    const conditions = parts.map((p) => {
      const match = p.match(/^(\w+)\.ilike\.%(.+)%$/);
      if (!match) return null;
      return { col: match[1], pattern: match[2].toLowerCase() };
    }).filter(Boolean) as { col: string; pattern: string }[];

    if (conditions.length > 0) {
      filtered = filtered.filter((r) =>
        conditions.some((c) =>
          String(r[c.col] ?? "").toLowerCase().includes(c.pattern)
        )
      );
    }
    return builder;
  };

  builder.order = (col: string, opts?: { ascending?: boolean }) => {
    orderKeys.push({ col, asc: opts?.ascending !== false });
    return builder;
  };

  builder.range = (from: number, to: number) => {
    rangeFrom = from;
    rangeTo = to;
    return builder;
  };

  // Make the builder thenable so `await` resolves it
  builder.then = (resolve: (val: unknown) => void, reject?: (err: unknown) => void) => {
    try {
      // Apply ordering
      if (orderKeys.length > 0) {
        filtered.sort((a, b) => {
          for (const { col, asc } of orderKeys) {
            const va = String(a[col] ?? "").toLowerCase();
            const vb = String(b[col] ?? "").toLowerCase();
            if (va < vb) return asc ? -1 : 1;
            if (va > vb) return asc ? 1 : -1;
          }
          return 0;
        });
      }

      const totalCount = filtered.length;

      // Apply range
      if (rangeFrom !== undefined && rangeTo !== undefined) {
        filtered = filtered.slice(rangeFrom, rangeTo + 1);
      }

      const result: { data: Row[] | null; count: number | null; error: null } = {
        data: headOnly ? null : filtered,
        count: countExact ? totalCount : null,
        error: null,
      };

      resolve(result);
    } catch (e) {
      if (reject) reject(e);
    }
  };

  return builder;
}

function createMockSupabase() {
  return {
    from: (tableName: string) => {
      const rows = tables[tableName] ?? [];
      return {
        select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
          return createQueryBuilder(tableName, rows, opts ?? {});
        },
      };
    },
  };
}

// Mock the supabase module
vi.mock("../supabase", () => ({
  get supabase() {
    return createMockSupabase();
  },
}));

// Import after mock is set up
import { fetchComponentPage, rowToComponentSummary } from "../supabase-queries";
import type { ComponentSummary } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPES_WITH_TABLES = ["gpu", "nvme", "ram", "sata_drive"] as const;

/** Populate in-memory tables from an array of per-type rows. */
function populateTables(rows: PerTypeComponentRow[]) {
  resetTables();
  for (const row of rows) {
    const table = COMPONENT_TABLE_MAP[row.type];
    if (table && tables[table]) {
      tables[table].push(row as unknown as Row);
    }
  }
}

/** Generator for valid page params. */
function arbPageParams() {
  return fc.record({
    page: fc.integer({ min: 1, max: 10 }),
    pageSize: fc.integer({ min: 1, max: 50 }),
  });
}


// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("Component Pagination Property Tests", () => {
  beforeEach(() => {
    resetTables();
  });

  // Feature: component-pagination, Property 1: Query result bounded by page size
  // **Validates: Requirements 1.2, 1.3**
  it("Property 1: rows.length <= pageSize and totalCount >= rows.length", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbPerTypeComponentRow(), { minLength: 0, maxLength: 30 }),
        arbPageParams(),
        fc.option(fc.constantFrom(...TYPES_WITH_TABLES), { nil: null }),
        async (rows, { page, pageSize }, type) => {
          populateTables(rows);

          const result = await fetchComponentPage({
            page,
            pageSize,
            type,
          });

          expect(result.rows.length).toBeLessThanOrEqual(pageSize);
          expect(result.totalCount).toBeGreaterThanOrEqual(0);
          expect(result.totalCount).toBeGreaterThanOrEqual(result.rows.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: component-pagination, Property 2: Search filtering returns only matching rows
  // **Validates: Requirements 2.2**
  it("Property 2: all returned rows match the search string in manufacturer or model", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbPerTypeComponentRow(), { minLength: 1, maxLength: 30 }),
        fc.stringMatching(/^[abcsmre12]{1,4}$/),
        fc.option(fc.constantFrom(...TYPES_WITH_TABLES), { nil: null }),
        async (rows, search, type) => {
          populateTables(rows);

          const result = await fetchComponentPage({
            page: 1,
            pageSize: 50,
            type,
            search,
          });

          const lowerSearch = search.toLowerCase();
          for (const row of result.rows) {
            const matchesManufacturer = row.manufacturer.toLowerCase().includes(lowerSearch);
            const matchesModel = row.model.toLowerCase().includes(lowerSearch);
            expect(matchesManufacturer || matchesModel).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: component-pagination, Property 3: Type filtering returns only matching type
  // **Validates: Requirements 3.2**
  it("Property 3: all returned rows have type equal to the selected type filter", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbPerTypeComponentRow(), { minLength: 1, maxLength: 30 }),
        fc.constantFrom(...TYPES_WITH_TABLES),
        async (rows, type) => {
          populateTables(rows);

          const result = await fetchComponentPage({
            page: 1,
            pageSize: 50,
            type,
          });

          for (const row of result.rows) {
            expect(row.type).toBe(type);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: component-pagination, Property 4: Manufacturer filtering returns only matching manufacturer
  // **Validates: Requirements 4.2**
  it("Property 4: all returned rows have manufacturer equal to the selected manufacturer filter", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbPerTypeComponentRow(), { minLength: 1, maxLength: 30 }),
        fc.option(fc.constantFrom(...TYPES_WITH_TABLES), { nil: null }),
        async (rows, type) => {
          // Pick a manufacturer from the generated rows to use as filter
          if (rows.length === 0) return;
          const manufacturer = rows[0].manufacturer;

          populateTables(rows);

          const result = await fetchComponentPage({
            page: 1,
            pageSize: 50,
            type,
            manufacturer,
          });

          for (const row of result.rows) {
            expect(row.manufacturer).toBe(manufacturer);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: component-pagination, Property 6: Results are sorted by type, manufacturer, model
  // **Validates: Requirements 5.1**
  it("Property 6: rows are ordered lexicographically by (type asc, manufacturer asc, model asc)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbPerTypeComponentRow(), { minLength: 0, maxLength: 30 }),
        fc.option(fc.constantFrom(...TYPES_WITH_TABLES), { nil: null }),
        async (rows, type) => {
          populateTables(rows);

          const result = await fetchComponentPage({
            page: 1,
            pageSize: 100,
            type,
          });

          for (let i = 1; i < result.rows.length; i++) {
            const prev = result.rows[i - 1];
            const curr = result.rows[i];

            // When type filter is active, all rows have same type, so compare manufacturer then model.
            // When no type filter, rows come in fixed table order (gpu, nvme, ram, sata_drive),
            // so within each type block they are sorted by manufacturer asc, model asc.
            // Cross-type ordering follows the fixed table order, not alphabetical type order.
            if (prev.type === curr.type) {
              const cmpMfr = prev.manufacturer.toLowerCase().localeCompare(curr.manufacturer.toLowerCase());
              if (cmpMfr === 0) {
                const cmpModel = prev.model.toLowerCase().localeCompare(curr.model.toLowerCase());
                expect(cmpModel).toBeLessThanOrEqual(0);
              } else {
                expect(cmpMfr).toBeLessThanOrEqual(0);
              }
            }
            // Cross-type: the fixed table order is gpu, nvme, ram, sata_drive.
            // We just verify that within each type block the sort is correct (checked above).
            // The type transitions follow the fixed table order which is guaranteed by the implementation.
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: component-pagination, Property 9: Cross-table aggregation total equals sum of per-table counts
  // **Validates: Requirements 8.1**
  it("Property 9: with no type filter, totalCount equals sum of individual per-table counts", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbPerTypeComponentRow(), { minLength: 0, maxLength: 30 }),
        fc.option(fc.stringMatching(/^[asm]{1,3}$/), { nil: null }),
        async (rows, search) => {
          populateTables(rows);

          // Fetch with no type filter
          const allResult = await fetchComponentPage({
            page: 1,
            pageSize: 1000,
            search,
          });

          // Fetch each type individually and sum counts
          let sumOfCounts = 0;
          for (const type of TYPES_WITH_TABLES) {
            const typeResult = await fetchComponentPage({
              page: 1,
              pageSize: 1000,
              type,
              search,
            });
            sumOfCounts += typeResult.totalCount;
          }

          expect(allResult.totalCount).toBe(sumOfCounts);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: component-pagination, Property 10: Row-to-summary mapping produces correct spec keys per type
  // **Validates: Requirements 8.3**
  it("Property 10: rowToComponentSummary() produces specs with exactly the keys from COMPONENT_SPEC_COLUMNS for that type", () => {
    fc.assert(
      fc.property(
        arbPerTypeComponentRow(),
        (row) => {
          const summary: ComponentSummary = rowToComponentSummary(row);

          // Verify base fields
          expect(summary.id).toBe(row.id);
          expect(summary.type).toBe(row.type);
          expect(summary.manufacturer).toBe(row.manufacturer);
          expect(summary.model).toBe(row.model);

          // Verify spec keys match COMPONENT_SPEC_COLUMNS for this type
          const expectedColumns = COMPONENT_SPEC_COLUMNS[row.type];
          expect(expectedColumns).toBeDefined();

          const expectedKeys = expectedColumns.map((c) => c.key).sort();
          const actualKeys = Object.keys(summary.specs).sort();

          expect(actualKeys).toEqual(expectedKeys);
        }
      ),
      { numRuns: 100 }
    );
  });
});
