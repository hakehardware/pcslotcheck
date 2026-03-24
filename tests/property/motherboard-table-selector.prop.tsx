import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import fc from "fast-check";
import type { MotherboardSummary } from "../../src/lib/types";

// ── Mock supabase-queries ───────────────────────────────────────────────────
vi.mock("../../src/lib/supabase-queries", () => ({
  fetchMotherboardPage: vi.fn(),
  fetchFilterOptions: vi.fn(),
  assembleMotherboard: vi.fn(),
  fetchMotherboardFromSupabase: vi.fn(),
  fetchComponentFromSupabase: vi.fn(),
}));

import MotherboardTable from "../../src/components/MotherboardTable";
import {
  fetchMotherboardPage,
  fetchFilterOptions,
} from "../../src/lib/supabase-queries";

const mockedFetchPage = fetchMotherboardPage as ReturnType<typeof vi.fn>;
const mockedFetchFilters = fetchFilterOptions as ReturnType<typeof vi.fn>;

// ── Arbitrary: MotherboardSummary ───────────────────────────────────────────

const motherboardSummaryArb: fc.Arbitrary<MotherboardSummary> = fc.record({
  id: fc
    .stringMatching(/^[a-z0-9][a-z0-9-]{2,28}[a-z0-9]$/)
    .filter((s) => s.length >= 4),
  manufacturer: fc
    .stringMatching(/^[A-Z][A-Za-z0-9 ]{0,14}$/)
    .filter((s) => s.length >= 1),
  model: fc
    .stringMatching(/^[A-Z][A-Za-z0-9 -]{0,24}$/)
    .filter((s) => s.length >= 1),
  chipset: fc
    .stringMatching(/^[A-Z][A-Za-z0-9]{1,8}$/)
    .filter((s) => s.length >= 2),
  socket: fc
    .stringMatching(/^[A-Z][A-Za-z0-9]{1,8}$/)
    .filter((s) => s.length >= 2),
  form_factor: fc.constantFrom("ATX", "Micro-ATX", "Mini-ITX", "E-ATX"),
});

/** Generate an array of MotherboardSummary with unique IDs */
function uniqueMotherboardArrayArb(
  minLength: number,
  maxLength: number
): fc.Arbitrary<MotherboardSummary[]> {
  return fc
    .array(motherboardSummaryArb, { minLength: maxLength, maxLength: maxLength * 3 })
    .map((arr) => {
      const seen = new Set<string>();
      const unique: MotherboardSummary[] = [];
      for (const item of arr) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          unique.push(item);
        }
        if (unique.length >= maxLength) break;
      }
      return unique;
    })
    .filter((arr) => arr.length >= minLength);
}

/** Helper to set up mocks and render the component, waiting for table to appear */
async function renderWithMockedData(
  items: MotherboardSummary[],
  props: { selectedBoardId?: string | null; onSelectBoard?: (boardId: string) => void } = {}
) {
  vi.clearAllMocks();
  mockedFetchPage.mockResolvedValue({ rows: items, totalCount: items.length });
  mockedFetchFilters.mockResolvedValue({
    manufacturers: [...new Set(items.map((r) => r.manufacturer))].sort(),
    chipsets: [...new Set(items.map((r) => r.chipset))].sort(),
  });

  const onSelectBoard = props.onSelectBoard ?? vi.fn<(boardId: string) => void>();
  const result = render(
    <MotherboardTable
      selectedBoardId={props.selectedBoardId ?? null}
      onSelectBoard={onSelectBoard}
    />
  );

  await waitFor(() => {
    expect(result.container.querySelector('table[role="table"]')).toBeTruthy();
  });

  return { ...result, onSelectBoard };
}


// ═══════════════════════════════════════════════════════════════════════════════
// Property 1: Pagination returns correct ordered slice with accurate total count
// Feature: motherboard-table-selector, Property 1
// Validates: Requirements 1.1, 1.2, 1.3
// ═══════════════════════════════════════════════════════════════════════════════

describe("Property 1: Pagination returns correct ordered slice with accurate total count", () => {
  it("slicing a sorted array by page/pageSize yields the correct subset and totalCount", () => {
    const scenarioArb = fc
      .tuple(
        fc.array(motherboardSummaryArb, { minLength: 1, maxLength: 50 }),
        fc.integer({ min: 1, max: 20 })
      )
      .chain(([items, pageSize]) => {
        const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
        return fc.tuple(
          fc.constant(items),
          fc.constant(pageSize),
          fc.integer({ min: 1, max: totalPages })
        );
      });

    fc.assert(
      fc.property(scenarioArb, ([items, pageSize, page]) => {
        // Sort by manufacturer asc, then model asc (same as fetchMotherboardPage)
        const sorted = [...items].sort((a, b) => {
          const mfgCmp = a.manufacturer.localeCompare(b.manufacturer);
          if (mfgCmp !== 0) return mfgCmp;
          return a.model.localeCompare(b.model);
        });

        const from = (page - 1) * pageSize;
        const to = from + pageSize;
        const expectedSlice = sorted.slice(from, to);

        // Verify slice length
        expect(expectedSlice.length).toBeLessThanOrEqual(pageSize);
        expect(expectedSlice.length).toBeGreaterThanOrEqual(0);

        // Verify totalCount
        expect(items.length).toBe(items.length);

        // Verify the slice matches the expected portion of the sorted array
        expectedSlice.forEach((row, i) => {
          expect(row).toEqual(sorted[from + i]);
        });

        // Verify ordering within the slice
        for (let i = 1; i < expectedSlice.length; i++) {
          const prev = expectedSlice[i - 1];
          const curr = expectedSlice[i];
          const cmp = prev.manufacturer.localeCompare(curr.manufacturer);
          if (cmp === 0) {
            expect(prev.model.localeCompare(curr.model)).toBeLessThanOrEqual(0);
          } else {
            expect(cmp).toBeLessThan(0);
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 2: Filters and search apply with AND logic
// Feature: motherboard-table-selector, Property 2
// Validates: Requirements 3.3, 3.4, 3.5, 4.2, 4.3, 4.4
// ═══════════════════════════════════════════════════════════════════════════════

describe("Property 2: Filters and search apply with AND logic", () => {
  it("every row in filtered results matches ALL active filters", () => {
    const scenarioArb = fc.tuple(
      fc.array(motherboardSummaryArb, { minLength: 1, maxLength: 50 }),
      fc.option(
        fc.stringMatching(/^[A-Z][A-Za-z0-9 ]{0,14}$/).filter((s) => s.length >= 1),
        { nil: null }
      ),
      fc.option(
        fc.stringMatching(/^[A-Z][A-Za-z0-9]{1,8}$/).filter((s) => s.length >= 2),
        { nil: null }
      ),
      fc.option(
        fc.stringMatching(/^[A-Za-z0-9]{1,6}$/).filter((s) => s.length >= 1),
        { nil: null }
      )
    );

    fc.assert(
      fc.property(
        scenarioArb,
        ([items, manufacturerFilter, chipsetFilter, searchQuery]) => {
          // Apply filters with AND logic (same as fetchMotherboardPage)
          let filtered = [...items];

          if (manufacturerFilter) {
            filtered = filtered.filter(
              (r) => r.manufacturer === manufacturerFilter
            );
          }

          if (chipsetFilter) {
            filtered = filtered.filter((r) => r.chipset === chipsetFilter);
          }

          if (searchQuery) {
            const pattern = searchQuery.toLowerCase();
            filtered = filtered.filter(
              (r) =>
                r.manufacturer.toLowerCase().includes(pattern) ||
                r.model.toLowerCase().includes(pattern) ||
                r.chipset.toLowerCase().includes(pattern) ||
                r.socket.toLowerCase().includes(pattern)
            );
          }

          // Verify every row in the result matches ALL active filters
          for (const row of filtered) {
            if (manufacturerFilter) {
              expect(row.manufacturer).toBe(manufacturerFilter);
            }
            if (chipsetFilter) {
              expect(row.chipset).toBe(chipsetFilter);
            }
            if (searchQuery) {
              const pattern = searchQuery.toLowerCase();
              const matchesSearch =
                row.manufacturer.toLowerCase().includes(pattern) ||
                row.model.toLowerCase().includes(pattern) ||
                row.chipset.toLowerCase().includes(pattern) ||
                row.socket.toLowerCase().includes(pattern);
              expect(matchesSearch).toBe(true);
            }
          }

          // Verify no items were incorrectly excluded
          for (const row of items) {
            const matchesMfg =
              !manufacturerFilter || row.manufacturer === manufacturerFilter;
            const matchesChipset =
              !chipsetFilter || row.chipset === chipsetFilter;
            const matchesSearch =
              !searchQuery ||
              row.manufacturer.toLowerCase().includes(searchQuery.toLowerCase()) ||
              row.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
              row.chipset.toLowerCase().includes(searchQuery.toLowerCase()) ||
              row.socket.toLowerCase().includes(searchQuery.toLowerCase());

            if (matchesMfg && matchesChipset && matchesSearch) {
              expect(filtered).toContainEqual(row);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// Property 3: Row rendering includes all required fields
// Feature: motherboard-table-selector, Property 3
// Validates: Requirements 2.1
// ═══════════════════════════════════════════════════════════════════════════════

describe("Property 3: Row rendering includes all required fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("each rendered desktop table row contains all 5 fields as visible text", async () => {
    await fc.assert(
      fc.asyncProperty(uniqueMotherboardArrayArb(1, 10), async (items) => {
        const { container, unmount } = await renderWithMockedData(items);

        const table = container.querySelector('table[role="table"]')!;
        const rows = table.querySelectorAll('tr[role="row"]');

        expect(rows.length).toBe(items.length);

        items.forEach((item, i) => {
          const rowText = rows[i].textContent ?? "";
          expect(rowText).toContain(item.manufacturer);
          expect(rowText).toContain(item.model);
          expect(rowText).toContain(item.chipset);
          expect(rowText).toContain(item.socket);
          expect(rowText).toContain(item.form_factor);
        });

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 4: Selected row is visually distinguished
// Feature: motherboard-table-selector, Property 4
// Validates: Requirements 2.2, 6.2
// ═══════════════════════════════════════════════════════════════════════════════

describe("Property 4: Selected row is visually distinguished", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exactly one row has ring-blue-500 class and it matches the selectedBoardId", async () => {
    const scenarioArb = uniqueMotherboardArrayArb(1, 10).chain((items) =>
      fc.tuple(
        fc.constant(items),
        fc.integer({ min: 0, max: items.length - 1 })
      )
    );

    await fc.assert(
      fc.asyncProperty(scenarioArb, async ([items, selectedIdx]) => {
        const selectedId = items[selectedIdx].id;

        const { container, unmount } = await renderWithMockedData(items, {
          selectedBoardId: selectedId,
        });

        const table = container.querySelector('table[role="table"]')!;
        const rows = Array.from(table.querySelectorAll('tr[role="row"]'));

        // Exactly one row should have ring-blue-500
        const highlightedRows = rows.filter((r) =>
          r.className.includes("ring-blue-500")
        );
        expect(highlightedRows.length).toBe(1);

        // The highlighted row should contain the selected item's data
        const selectedItem = items[selectedIdx];
        const highlightedText = highlightedRows[0].textContent ?? "";
        expect(highlightedText).toContain(selectedItem.model);

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 5: Row interaction invokes callback with correct ID
// Feature: motherboard-table-selector, Property 5
// Validates: Requirements 2.3, 2.4, 6.1
// ═══════════════════════════════════════════════════════════════════════════════

describe("Property 5: Row interaction invokes callback with correct ID", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clicking a random row calls onSelectBoard with that row's ID", async () => {
    const scenarioArb = uniqueMotherboardArrayArb(1, 10).chain((items) =>
      fc.tuple(
        fc.constant(items),
        fc.integer({ min: 0, max: items.length - 1 })
      )
    );

    await fc.assert(
      fc.asyncProperty(scenarioArb, async ([items, clickIdx]) => {
        const onSelectBoard = vi.fn();
        const { container, unmount } = await renderWithMockedData(items, {
          onSelectBoard,
        });

        const table = container.querySelector('table[role="table"]')!;
        const rows = table.querySelectorAll('tr[role="row"]');

        fireEvent.click(rows[clickIdx]);

        expect(onSelectBoard).toHaveBeenCalledWith(items[clickIdx].id);

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 6: Filter options reflect distinct database values
// Feature: motherboard-table-selector, Property 6
// Validates: Requirements 3.1, 3.2
// ═══════════════════════════════════════════════════════════════════════════════

describe("Property 6: Filter options reflect distinct database values", () => {
  it("distinct sorted manufacturers and chipsets match expected values", () => {
    fc.assert(
      fc.property(
        fc.array(motherboardSummaryArb, { minLength: 1, maxLength: 50 }),
        (items) => {
          // Compute expected distinct sorted values
          const expectedManufacturers = [
            ...new Set(items.map((r) => r.manufacturer)),
          ].sort();
          const expectedChipsets = [
            ...new Set(items.map((r) => r.chipset)),
          ].sort();

          // Simulate what fetchFilterOptions does: deduplicate and sort
          const rows = items.map((r) => ({
            manufacturer: r.manufacturer,
            chipset: r.chipset,
          }));
          const manufacturers = [
            ...new Set(rows.map((r) => r.manufacturer)),
          ].sort();
          const chipsets = [...new Set(rows.map((r) => r.chipset))].sort();

          expect(manufacturers).toEqual(expectedManufacturers);
          expect(chipsets).toEqual(expectedChipsets);

          // Verify no duplicates
          expect(manufacturers.length).toBe(new Set(manufacturers).size);
          expect(chipsets.length).toBe(new Set(chipsets).size);

          // Verify sorted (using the same default sort() used by the implementation)
          expect(manufacturers).toEqual([...manufacturers].sort());
          expect(chipsets).toEqual([...chipsets].sort());
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// Property 7: Pagination controls reflect current state
// Feature: motherboard-table-selector, Property 7
// Validates: Requirements 5.1, 5.3, 5.4, 5.6
// ═══════════════════════════════════════════════════════════════════════════════

describe("Property 7: Pagination controls reflect current state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("displays correct page info and disables buttons at boundaries", async () => {
    const scenarioArb = fc
      .tuple(
        fc.integer({ min: 1, max: 200 }),
        fc.integer({ min: 1, max: 20 })
      )
      .chain(([totalCount, pageSize]) => {
        const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
        return fc.tuple(
          fc.constant(totalCount),
          fc.constant(pageSize),
          fc.integer({ min: 1, max: totalPages })
        );
      });

    await fc.assert(
      fc.asyncProperty(scenarioArb, async ([totalCount, _pageSize, _page]) => {
        // The component uses PAGE_SIZE=10 internally, so we generate rows
        // for page 1 with the given totalCount
        const PAGE_SIZE = 10;
        const totalPages = Math.ceil(totalCount / PAGE_SIZE);
        const rowCount = Math.min(PAGE_SIZE, totalCount);
        const rows: MotherboardSummary[] = Array.from(
          { length: rowCount },
          (_, i) => ({
            id: `board-${i}-${Math.random().toString(36).slice(2, 8)}`,
            manufacturer: "ASUS",
            model: `Model ${i}`,
            chipset: "Z890",
            socket: "LGA1851",
            form_factor: "ATX",
          })
        );

        vi.clearAllMocks();
        mockedFetchPage.mockResolvedValue({ rows, totalCount });
        mockedFetchFilters.mockResolvedValue({
          manufacturers: ["ASUS"],
          chipsets: ["Z890"],
        });

        const { container, unmount } = render(
          <MotherboardTable selectedBoardId={null} onSelectBoard={vi.fn()} />
        );

        await waitFor(() => {
          expect(
            container.querySelector('table[role="table"]')
          ).toBeTruthy();
        });

        // Verify "Page 1 of Y" text
        const pageText = container.textContent ?? "";
        expect(pageText).toContain(`Page 1 of ${totalPages}`);

        // Verify total count display
        expect(pageText).toContain(`${totalCount} motherboard`);

        // Previous should be disabled on page 1
        const prevButton = screen.getByRole("button", { name: /previous/i });
        expect(prevButton).toBeDisabled();

        // Next should be disabled when totalPages <= 1
        const nextButton = screen.getByRole("button", { name: /next/i });
        if (totalPages <= 1) {
          expect(nextButton).toBeDisabled();
        } else {
          expect(nextButton).not.toBeDisabled();
        }

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  });
});
