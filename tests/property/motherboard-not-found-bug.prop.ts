import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";
import type { MotherboardSummary } from "../../src/lib/types";

// -- Hoisted mock for the Supabase client --
// Supports two query chains:
//   1) from -> select -> eq -> single  (fetchMotherboardSummaryById)
//   2) from -> select(_, {count}) -> or -> order -> order -> range -> Promise  (fetchMotherboardPage)
const {
  mockSingle,
  mockEq,
  mockSelect,
  mockFrom,
  mockSupabase,
  mockOr,
  mockOrder,
  mockRange,
  pageQueryResult,
} = vi.hoisted(() => {
  // Shared result holder for the page query chain
  const pageQueryResult: {
    data: MotherboardSummary[] | null;
    count: number | null;
    error: null | { message: string };
  } = { data: [], count: 0, error: null };

  const mockSingle = vi.fn();

  // range() is the terminal call in the page query chain; it resolves the result
  const mockRange = vi.fn(() => Promise.resolve(pageQueryResult));

  // order() returns an object with order and range
  const mockOrder = vi.fn((): Record<string, unknown> => ({
    order: mockOrder,
    range: mockRange,
  }));

  // or() returns an object with order (for chaining .order().order().range())
  const mockOr = vi.fn(() => ({
    order: mockOrder,
  }));

  // eq() can lead to single() (Property 1 chain) or to or/order/range (filter chain)
  const mockEq = vi.fn((): Record<string, unknown> => ({
    single: mockSingle,
    or: mockOr,
    order: mockOrder,
    range: mockRange,
  }));

  // select() returns an object supporting both chains
  const mockSelect = vi.fn((): Record<string, unknown> => ({
    eq: mockEq,
    or: mockOr,
    order: mockOrder,
    range: mockRange,
  }));

  const mockFrom = vi.fn(() => ({ select: mockSelect }));
  const mockSupabase = { from: mockFrom };

  return {
    mockSingle,
    mockEq,
    mockSelect,
    mockFrom,
    mockSupabase,
    mockOr,
    mockOrder,
    mockRange,
    pageQueryResult,
  };
});

vi.mock("../../src/lib/supabase", () => ({
  supabase: mockSupabase,
}));

import {
  fetchMotherboardSummaryById,
  fetchMotherboardPage,
} from "../../src/lib/supabase-queries";

// -- Arbitrary: valid motherboard slug IDs --
const slugIdArb = fc
  .stringMatching(/^[a-z0-9][a-z0-9-]{2,38}[a-z0-9]$/)
  .filter((s) => s.length >= 4 && !s.includes("--"));

// -- Arbitrary: MotherboardSummary fields --
const manufacturerArb = fc.constantFrom(
  "ASUS",
  "MSI",
  "Gigabyte",
  "ASRock"
);

const modelArb = fc
  .stringMatching(/^[A-Z][A-Za-z0-9 -]{2,24}$/)
  .filter((s) => s.trim().length >= 3);

const chipsetArb = fc.constantFrom(
  "Z890",
  "Z790",
  "B650",
  "B760",
  "X870",
  "X870E",
  "B650E"
);

const socketArb = fc.constantFrom("LGA1851", "LGA1700", "AM5");

const formFactorArb = fc.constantFrom("ATX", "Micro-ATX", "Mini-ITX", "E-ATX");

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// Property 1: Bug Condition - Direct ID Lookup Resolves Valid Board
// Feature: motherboard-not-found-bug, Property 1
// Validates: Requirements 2.1, 2.2
//
// For any valid motherboard slug ID, fetchMotherboardSummaryById performs a
// direct WHERE id = boardId query and returns a MotherboardSummary with
// matching id and all required fields populated.
// =============================================================================

describe("Property 1: Bug Condition - Direct ID Lookup Resolves Valid Board", () => {
  it("fetchMotherboardSummaryById returns a MotherboardSummary with matching id and all required fields for any valid slug ID", async () => {
    await fc.assert(
      fc.asyncProperty(
        slugIdArb,
        manufacturerArb,
        modelArb,
        chipsetArb,
        socketArb,
        formFactorArb,
        async (id, manufacturer, model, chipset, socket, form_factor) => {
          const mockRow: MotherboardSummary = {
            id,
            manufacturer,
            model,
            chipset,
            socket,
            form_factor,
          };

          mockSingle.mockResolvedValue({ data: mockRow, error: null });

          const result = await fetchMotherboardSummaryById(id);

          // The function queries the motherboards table
          expect(mockFrom).toHaveBeenCalledWith("motherboards");

          // It selects only the summary fields
          expect(mockSelect).toHaveBeenCalledWith(
            "id, manufacturer, model, chipset, socket, form_factor"
          );

          // It uses direct .eq("id", id) lookup -- NOT ilike search
          expect(mockEq).toHaveBeenCalledWith("id", id);

          // Result is not null
          expect(result).not.toBeNull();

          // The returned id matches the queried id exactly
          expect(result!.id).toBe(id);

          // All required fields are present and non-empty strings
          expect(typeof result!.manufacturer).toBe("string");
          expect(result!.manufacturer.length).toBeGreaterThan(0);

          expect(typeof result!.model).toBe("string");
          expect(result!.model.length).toBeGreaterThan(0);

          expect(typeof result!.chipset).toBe("string");
          expect(result!.chipset.length).toBeGreaterThan(0);

          expect(typeof result!.socket).toBe("string");
          expect(result!.socket.length).toBeGreaterThan(0);

          expect(typeof result!.form_factor).toBe("string");
          expect(result!.form_factor.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// =============================================================================
// Property 2: Preservation - Search Functionality Unchanged
// Feature: motherboard-not-found-bug, Property 2
// Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
//
// For any human-readable search term, fetchMotherboardPage continues to
// construct ilike queries against manufacturer, model, chipset, socket columns
// and returns results in the expected { rows, totalCount } format.
// The function was NOT modified by the bugfix and should behave identically.
// =============================================================================

// -- Arbitrary: human-readable search strings that users would type --
const searchTermArb = fc.oneof(
  // Manufacturer names
  fc.constantFrom("ASUS", "MSI", "Gigabyte", "ASRock"),
  // Chipset names
  fc.constantFrom("Z890", "Z790", "B650", "B760", "X870", "X870E", "B650E"),
  // Socket types
  fc.constantFrom("LGA1851", "LGA1700", "AM5"),
  // Model substrings users might type
  fc.constantFrom(
    "ROG",
    "STRIX",
    "TUF",
    "PRIME",
    "MAG",
    "MPG",
    "MEG",
    "AORUS",
    "TOMAHAWK",
    "MORTAR",
    "CARBON",
    "STEEL LEGEND",
    "TAICHI",
    "EAGLE"
  ),
  // Short alphanumeric substrings (partial model names)
  fc
    .stringMatching(/^[A-Za-z0-9][A-Za-z0-9 ]{0,14}[A-Za-z0-9]$/)
    .filter((s) => s.trim().length >= 2)
);

describe("Property 2: Preservation - Search Functionality Unchanged", () => {
  it("fetchMotherboardPage constructs ilike queries and returns { rows, totalCount } for any human-readable search term", async () => {
    await fc.assert(
      fc.asyncProperty(
        searchTermArb,
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 5, max: 50 }),
        manufacturerArb,
        modelArb,
        chipsetArb,
        socketArb,
        formFactorArb,
        async (
          search,
          page,
          pageSize,
          mfr,
          mdl,
          chip,
          sock,
          ff
        ) => {
          // Simulate Supabase returning one matching row for the search
          const matchingRow: MotherboardSummary = {
            id: "test-board-id",
            manufacturer: mfr,
            model: mdl,
            chipset: chip,
            socket: sock,
            form_factor: ff,
          };

          pageQueryResult.data = [matchingRow];
          pageQueryResult.count = 1;
          pageQueryResult.error = null;

          const result = await fetchMotherboardPage({
            page,
            pageSize,
            search,
          });

          // The function queries the motherboards table
          expect(mockFrom).toHaveBeenCalledWith("motherboards");

          // It selects summary fields with exact count
          expect(mockSelect).toHaveBeenCalledWith(
            "id, manufacturer, model, chipset, socket, form_factor",
            { count: "exact" }
          );

          // It constructs an ilike OR filter across all four searchable columns
          const expectedPattern = `%${search}%`;
          expect(mockOr).toHaveBeenCalledWith(
            `manufacturer.ilike.${expectedPattern},model.ilike.${expectedPattern},chipset.ilike.${expectedPattern},socket.ilike.${expectedPattern}`
          );

          // It applies ordering by manufacturer then model
          expect(mockOrder).toHaveBeenCalledWith("manufacturer", {
            ascending: true,
          });
          expect(mockOrder).toHaveBeenCalledWith("model", {
            ascending: true,
          });

          // It applies pagination via range
          const from = (page - 1) * pageSize;
          const to = from + pageSize - 1;
          expect(mockRange).toHaveBeenCalledWith(from, to);

          // Result has the expected shape
          expect(result).toHaveProperty("rows");
          expect(result).toHaveProperty("totalCount");
          expect(Array.isArray(result.rows)).toBe(true);
          expect(typeof result.totalCount).toBe("number");

          // The returned data matches what Supabase returned
          expect(result.rows).toEqual([matchingRow]);
          expect(result.totalCount).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});
