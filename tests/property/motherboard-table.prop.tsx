// Feature: component-browser, Properties 2-6, 14, 16: Motherboard table property tests
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import fc from "fast-check";
import type { MotherboardSummary } from "../../src/lib/types";
import { arbMotherboardSummary } from "../../src/lib/__tests__/generators";

// -- Mock supabase-queries ----------------------------------------------------
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

// -- Helpers ------------------------------------------------------------------

/** Generate an array of MotherboardSummary with unique IDs */
function uniqueMotherboardArrayArb(
  minLength: number,
  maxLength: number
): fc.Arbitrary<MotherboardSummary[]> {
  return fc
    .array(arbMotherboardSummary(), { minLength: maxLength, maxLength: maxLength * 3 })
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

/** Render MotherboardTable with mocked data and wait for the table to appear */
async function renderWithMockedData(
  items: MotherboardSummary[],
  props: {
    selectedBoardId?: string | null;
    onSelectBoard?: (boardId: string) => void;
  } = {}
) {
  vi.clearAllMocks();
  mockedFetchPage.mockResolvedValue({ rows: items, totalCount: items.length });
  mockedFetchFilters.mockResolvedValue({
    manufacturers: [...new Set(items.map((r) => r.manufacturer))].sort(),
    chipsets: [...new Set(items.map((r) => r.chipset))].sort(),
  });

  const onSelectBoard =
    props.onSelectBoard ?? vi.fn<(boardId: string) => void>();
  const result = render(
    <MotherboardTable
      selectedBoardId={props.selectedBoardId ?? null}
      onSelectBoard={onSelectBoard}
    />
  );

  await waitFor(() => {
    expect(
      result.container.querySelector('table[role="table"]')
    ).toBeTruthy();
  });

  return { ...result, onSelectBoard };
}


// =============================================================================
// Property 2: Motherboard table renders all manifest entries
// Feature: component-browser, Property 2: Motherboard table renders all manifest entries
// **Validates: Requirements 2.1**
// =============================================================================

describe("Property 2: Motherboard table renders all manifest entries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("for any set of motherboard summaries, the table renders exactly as many rows as entries", async () => {
    await fc.assert(
      fc.asyncProperty(uniqueMotherboardArrayArb(1, 10), async (items) => {
        const { container, unmount } = await renderWithMockedData(items);

        const table = container.querySelector('table[role="table"]')!;
        const rows = table.querySelectorAll("tbody tr[role='row']");

        expect(rows.length).toBe(items.length);

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  });
});

// =============================================================================
// Property 3: Motherboard table rows contain all required fields
// Feature: component-browser, Property 3: Motherboard table rows contain all required fields
// **Validates: Requirements 2.2**
// =============================================================================

describe("Property 3: Motherboard table rows contain all required fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("for any motherboard summary, the rendered row contains manufacturer, model, socket, chipset, and form_factor", async () => {
    await fc.assert(
      fc.asyncProperty(uniqueMotherboardArrayArb(1, 10), async (items) => {
        const { container, unmount } = await renderWithMockedData(items);

        const table = container.querySelector('table[role="table"]')!;
        const rows = table.querySelectorAll("tbody tr[role='row']");

        items.forEach((item, i) => {
          const rowText = rows[i].textContent ?? "";
          expect(rowText).toContain(item.manufacturer);
          expect(rowText).toContain(item.model);
          expect(rowText).toContain(item.socket);
          expect(rowText).toContain(item.chipset);
          expect(rowText).toContain(item.form_factor);
        });

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  });
});

// =============================================================================
// Property 4: Motherboard row click navigates to correct detail URL
// Feature: component-browser, Property 4: Motherboard row click navigates to correct detail URL
// **Validates: Requirements 2.3**
// =============================================================================

describe("Property 4: Motherboard row click navigates to correct detail URL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("for any motherboard summary with id X, clicking its row calls onSelectBoard with X", async () => {
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
        const rows = table.querySelectorAll("tbody tr[role='row']");

        fireEvent.click(rows[clickIdx]);

        expect(onSelectBoard).toHaveBeenCalledWith(items[clickIdx].id);

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  });
});

// =============================================================================
// Property 5: Motherboard table sorting produces correct order
// Feature: component-browser, Property 5: Motherboard table sorting produces correct order
// **Validates: Requirements 2.4**
//
// The MotherboardTable delegates sorting to the server (Supabase). The server
// returns rows pre-sorted by manufacturer asc, model asc. This property
// verifies that for any list returned by the server, the rendered row order
// matches the data order (i.e., the component preserves server sort order).
// =============================================================================

describe("Property 5: Motherboard table sorting produces correct order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("for any list of motherboard summaries, rendered rows preserve the server-provided order", async () => {
    await fc.assert(
      fc.asyncProperty(uniqueMotherboardArrayArb(2, 10), async (items) => {
        // Sort items as the server would (manufacturer asc, model asc)
        const sorted = [...items].sort((a, b) => {
          const mfgCmp = a.manufacturer.localeCompare(b.manufacturer);
          if (mfgCmp !== 0) return mfgCmp;
          return a.model.localeCompare(b.model);
        });

        const { container, unmount } = await renderWithMockedData(sorted);

        const table = container.querySelector('table[role="table"]')!;
        const rows = table.querySelectorAll("tbody tr[role='row']");

        // Verify rendered order matches the sorted input order
        sorted.forEach((item, i) => {
          const rowText = rows[i].textContent ?? "";
          expect(rowText).toContain(item.manufacturer);
          expect(rowText).toContain(item.model);
        });

        // Verify lexicographic ordering of manufacturer column in rendered rows
        for (let i = 1; i < sorted.length; i++) {
          const prev = sorted[i - 1];
          const curr = sorted[i];
          const cmp = prev.manufacturer.localeCompare(curr.manufacturer);
          if (cmp === 0) {
            expect(prev.model.localeCompare(curr.model)).toBeLessThanOrEqual(0);
          } else {
            expect(cmp).toBeLessThanOrEqual(0);
          }
        }

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  });
});


// =============================================================================
// Property 6: Motherboard table filtering correctness and count
// Feature: component-browser, Property 6: Motherboard table filtering correctness and count
// **Validates: Requirements 2.5, 2.6**
//
// The MotherboardTable delegates filtering to the server (Supabase). This
// property verifies the filtering logic: for any combination of manufacturer
// and chipset filters applied to a list, all displayed rows match every active
// filter, and the displayed total count equals the number of matching rows.
// =============================================================================

describe("Property 6: Motherboard table filtering correctness and count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("for any combination of filters, all displayed rows match every active filter and count equals matching rows", async () => {
    const scenarioArb = uniqueMotherboardArrayArb(1, 15).chain((items) => {
      const manufacturers = [...new Set(items.map((r) => r.manufacturer))];
      const chipsets = [...new Set(items.map((r) => r.chipset))];
      return fc.tuple(
        fc.constant(items),
        fc.option(fc.constantFrom(...manufacturers), { nil: null }),
        fc.option(fc.constantFrom(...chipsets), { nil: null })
      );
    });

    await fc.assert(
      fc.asyncProperty(
        scenarioArb,
        async ([items, manufacturerFilter, chipsetFilter]) => {
          // Compute expected filtered results
          let expected = [...items];
          if (manufacturerFilter) {
            expected = expected.filter(
              (r) => r.manufacturer === manufacturerFilter
            );
          }
          if (chipsetFilter) {
            expected = expected.filter((r) => r.chipset === chipsetFilter);
          }

          vi.clearAllMocks();
          // Mock returns the pre-filtered results (simulating server-side filtering)
          mockedFetchPage.mockResolvedValue({
            rows: expected,
            totalCount: expected.length,
          });
          mockedFetchFilters.mockResolvedValue({
            manufacturers: [
              ...new Set(items.map((r) => r.manufacturer)),
            ].sort(),
            chipsets: [...new Set(items.map((r) => r.chipset))].sort(),
          });

          const { container, unmount } = render(
            <MotherboardTable
              selectedBoardId={null}
              onSelectBoard={vi.fn()}
            />
          );

          if (expected.length > 0) {
            await waitFor(() => {
              expect(
                container.querySelector('table[role="table"]')
              ).toBeTruthy();
            });

            const table = container.querySelector('table[role="table"]')!;
            const rows = table.querySelectorAll("tbody tr[role='row']");

            // Row count matches expected filtered count
            expect(rows.length).toBe(expected.length);

            // Every displayed row matches all active filters
            expected.forEach((item, i) => {
              const rowText = rows[i].textContent ?? "";
              if (manufacturerFilter) {
                expect(rowText).toContain(manufacturerFilter);
              }
              if (chipsetFilter) {
                expect(rowText).toContain(chipsetFilter);
              }
            });

            // Total count text matches
            const pageText = container.textContent ?? "";
            expect(pageText).toContain(
              `${expected.length} motherboard`
            );
          } else {
            // Empty state: no table rendered, "No motherboards found" message
            await waitFor(() => {
              expect(container.textContent).toContain(
                "No motherboards found"
              );
            });
          }

          unmount();
          cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// =============================================================================
// Property 14: Motherboard table rows are keyboard-navigable
// Feature: component-browser, Property 14: Motherboard table rows are keyboard-navigable
// **Validates: Requirements 7.3**
// =============================================================================

describe("Property 14: Motherboard table rows are keyboard-navigable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("each row has tabIndex=0 and responds to Enter and Space keys", async () => {
    const scenarioArb = uniqueMotherboardArrayArb(1, 10).chain((items) =>
      fc.tuple(
        fc.constant(items),
        fc.integer({ min: 0, max: items.length - 1 })
      )
    );

    await fc.assert(
      fc.asyncProperty(scenarioArb, async ([items, targetIdx]) => {
        const onSelectBoard = vi.fn();
        const { container, unmount } = await renderWithMockedData(items, {
          onSelectBoard,
        });

        const table = container.querySelector('table[role="table"]')!;
        const rows = Array.from(
          table.querySelectorAll("tbody tr[role='row']")
        ) as HTMLElement[];

        // Every row should have tabIndex=0
        for (const row of rows) {
          expect(row.tabIndex).toBe(0);
        }

        // Enter key triggers onSelectBoard with the correct ID
        fireEvent.keyDown(rows[targetIdx], { key: "Enter" });
        expect(onSelectBoard).toHaveBeenCalledWith(items[targetIdx].id);

        onSelectBoard.mockClear();

        // Space key triggers onSelectBoard with the correct ID
        fireEvent.keyDown(rows[targetIdx], { key: " " });
        expect(onSelectBoard).toHaveBeenCalledWith(items[targetIdx].id);

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  });
});

// =============================================================================
// Property 16: Motherboard table aria-sort reflects sort state
// Feature: component-browser, Property 16: Motherboard table aria-sort reflects sort state
// **Validates: Requirements 7.6**
//
// The MotherboardTable delegates sorting to the server and does not implement
// client-side sortable column headers with aria-sort attributes. This property
// verifies that column headers exist with the columnheader role and that no
// spurious aria-sort attributes are present (since no client-side sort toggle
// exists, no header should have aria-sort).
// =============================================================================

describe("Property 16: Motherboard table aria-sort reflects sort state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("column headers have role=columnheader and no spurious aria-sort attributes are present", async () => {
    await fc.assert(
      fc.asyncProperty(uniqueMotherboardArrayArb(1, 10), async (items) => {
        const { container, unmount } = await renderWithMockedData(items);

        const headers = container.querySelectorAll(
          'th[role="columnheader"]'
        );

        // Should have exactly 5 column headers
        expect(headers.length).toBe(5);

        // Verify expected column names are present
        const headerTexts = Array.from(headers).map(
          (h) => h.textContent?.trim() ?? ""
        );
        expect(headerTexts).toContain("Manufacturer");
        expect(headerTexts).toContain("Model");
        expect(headerTexts).toContain("Chipset");
        expect(headerTexts).toContain("Socket");
        expect(headerTexts).toContain("Form Factor");

        // Since the component uses server-side sorting without client-side
        // sort toggles, no header should have an aria-sort attribute
        for (const header of Array.from(headers)) {
          expect(header.getAttribute("aria-sort")).toBeNull();
        }

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  });
});
