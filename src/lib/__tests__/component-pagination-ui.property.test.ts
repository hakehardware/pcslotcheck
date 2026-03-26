// @vitest-environment jsdom
// Property-based tests for component pagination UI behavior.
// Uses fast-check with minimum 100 iterations per property.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import * as fc from "fast-check";
import { createElement } from "react";
import type { ComponentSummary } from "../types";
import { COMPONENT_SPEC_COLUMNS, COMPONENT_TYPE_META } from "../component-type-meta";
import { arbComponentSummary, arbComponentSummaryOfType } from "./generators";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("../supabase-queries", () => ({
  fetchComponentPage: vi.fn(),
  fetchComponentFilterOptions: vi.fn(),
}));

import ComponentTable from "@/components/ComponentTable";
import {
  fetchComponentPage,
  fetchComponentFilterOptions,
} from "../supabase-queries";

const mockedFetchPage = fetchComponentPage as ReturnType<typeof vi.fn>;
const mockedFetchFilter = fetchComponentFilterOptions as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const COMPONENT_TYPES = Object.keys(COMPONENT_TYPE_META);
const PAGE_SIZE = 20;

/** Generate an array of ComponentSummary with unique IDs. */
function uniqueComponentArrayArb(
  minLength: number,
  maxLength: number
): fc.Arbitrary<ComponentSummary[]> {
  return fc
    .array(arbComponentSummary(), {
      minLength: maxLength,
      maxLength: maxLength * 3,
    })
    .map((arr) => {
      const seen = new Set<string>();
      const unique: ComponentSummary[] = [];
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

/** Render ComponentTable with mocked data and wait for loading to finish. */
async function renderWithData(
  rows: ComponentSummary[],
  totalCount: number,
  opts?: { typeFilter?: string }
) {
  mockedFetchPage.mockResolvedValue({ rows, totalCount });
  mockedFetchFilter.mockResolvedValue({
    manufacturers: [...new Set(rows.map((r) => r.manufacturer))].sort(),
  });

  const result = render(createElement(ComponentTable));

  // Wait for loading to finish (table or empty state appears)
  await waitFor(() => {
    const loading = result.container.querySelector('[role="status"]');
    // Loading should be gone
    expect(loading).toBeNull();
  });

  return result;
}

// =============================================================================
// Property 5: Filter or search change resets page to 1
// Feature: component-pagination, Property 5: Filter or search change resets page to 1
// **Validates: Requirements 2.3, 3.3, 4.3**
// =============================================================================

describe("Property 5: Filter or search change resets page to 1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("changing type filter resets fetchComponentPage call to page 1", async () => {
    const typesWithTables = ["gpu", "nvme", "ram", "sata_drive"] as const;

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...typesWithTables),
        async (typeKey) => {
          vi.clearAllMocks();

          // Initial render with enough data to have multiple pages
          const initialRows: ComponentSummary[] = Array.from({ length: 20 }, (_, i) => ({
            id: `comp-${i}`,
            type: "gpu",
            manufacturer: "ASUS",
            model: `Model ${i}`,
            specs: {},
          }));

          mockedFetchPage.mockResolvedValue({ rows: initialRows, totalCount: 60 });
          mockedFetchFilter.mockResolvedValue({ manufacturers: ["ASUS"] });

          const { container, unmount } = render(createElement(ComponentTable));

          // Wait for initial load
          await waitFor(() => {
            expect(container.querySelector('[role="status"]')).toBeNull();
          });

          // Navigate to page 2 by clicking Next
          mockedFetchPage.mockResolvedValue({ rows: initialRows, totalCount: 60 });
          const buttons = Array.from(container.querySelectorAll("button"));
          const nextBtn = buttons.find((b) => b.textContent?.includes("Next"));
          expect(nextBtn).toBeTruthy();
          fireEvent.click(nextBtn!);

          await waitFor(() => {
            expect(container.querySelector('[role="status"]')).toBeNull();
          });

          // Verify we're on page 2
          expect(container.textContent).toContain("Page 2 of");

          // Clear mock call history to track the next call
          mockedFetchPage.mockClear();
          mockedFetchPage.mockResolvedValue({ rows: [], totalCount: 0 });

          // Change type filter
          const typeSelect = container.querySelector(
            'select[aria-label="Filter by component type"]'
          ) as HTMLSelectElement;
          expect(typeSelect).toBeTruthy();
          fireEvent.change(typeSelect, { target: { value: typeKey } });

          await waitFor(() => {
            expect(mockedFetchPage).toHaveBeenCalled();
          });

          // The fetch should have been called with page: 1
          const lastCall = mockedFetchPage.mock.calls[mockedFetchPage.mock.calls.length - 1][0];
          expect(lastCall.page).toBe(1);

          unmount();
          cleanup();
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);

  it("changing manufacturer filter resets fetchComponentPage call to page 1", async () => {
    const manufacturers = ["ASUS", "MSI", "Gigabyte", "Corsair", "Samsung"] as const;

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...manufacturers),
        async (mfr) => {
          vi.clearAllMocks();

          const initialRows: ComponentSummary[] = Array.from({ length: 20 }, (_, i) => ({
            id: `comp-${i}`,
            type: "gpu",
            manufacturer: "ASUS",
            model: `Model ${i}`,
            specs: {},
          }));

          mockedFetchPage.mockResolvedValue({ rows: initialRows, totalCount: 60 });
          mockedFetchFilter.mockResolvedValue({ manufacturers: [...manufacturers] });

          const { container, unmount } = render(createElement(ComponentTable));

          await waitFor(() => {
            expect(container.querySelector('[role="status"]')).toBeNull();
          });

          // Navigate to page 2
          mockedFetchPage.mockResolvedValue({ rows: initialRows, totalCount: 60 });
          const buttons = Array.from(container.querySelectorAll("button"));
          const nextBtn = buttons.find((b) => b.textContent?.includes("Next"));
          expect(nextBtn).toBeTruthy();
          fireEvent.click(nextBtn!);

          await waitFor(() => {
            expect(container.querySelector('[role="status"]')).toBeNull();
          });

          expect(container.textContent).toContain("Page 2 of");

          mockedFetchPage.mockClear();
          mockedFetchPage.mockResolvedValue({ rows: [], totalCount: 0 });

          // Change manufacturer filter
          const mfrSelect = container.querySelector(
            'select[aria-label="Filter by manufacturer"]'
          ) as HTMLSelectElement;
          expect(mfrSelect).toBeTruthy();
          fireEvent.change(mfrSelect, { target: { value: mfr } });

          await waitFor(() => {
            expect(mockedFetchPage).toHaveBeenCalled();
          });

          const lastCall = mockedFetchPage.mock.calls[mockedFetchPage.mock.calls.length - 1][0];
          expect(lastCall.page).toBe(1);

          unmount();
          cleanup();
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);

  it("changing search input resets fetchComponentPage call to page 1", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-z]{1,5}$/),
        async (searchTerm) => {
          vi.clearAllMocks();

          const initialRows: ComponentSummary[] = Array.from({ length: 20 }, (_, i) => ({
            id: `comp-${i}`,
            type: "gpu",
            manufacturer: "ASUS",
            model: `Model ${i}`,
            specs: {},
          }));

          mockedFetchPage.mockResolvedValue({ rows: initialRows, totalCount: 60 });
          mockedFetchFilter.mockResolvedValue({ manufacturers: ["ASUS"] });

          const { container, unmount } = render(createElement(ComponentTable));

          await waitFor(() => {
            expect(container.querySelector('[role="status"]')).toBeNull();
          });

          // Navigate to page 2
          mockedFetchPage.mockResolvedValue({ rows: initialRows, totalCount: 60 });
          const buttons = Array.from(container.querySelectorAll("button"));
          const nextBtn = buttons.find((b) => b.textContent?.includes("Next"));
          expect(nextBtn).toBeTruthy();
          fireEvent.click(nextBtn!);

          await waitFor(() => {
            expect(container.querySelector('[role="status"]')).toBeNull();
          });

          expect(container.textContent).toContain("Page 2 of");

          mockedFetchPage.mockClear();
          mockedFetchPage.mockResolvedValue({ rows: [], totalCount: 0 });

          // Type in search input — the component debounces at 300ms
          const searchInput = container.querySelector(
            'input[aria-label="Search components"]'
          ) as HTMLInputElement;
          expect(searchInput).toBeTruthy();
          fireEvent.change(searchInput, { target: { value: searchTerm } });

          // Wait for debounce to fire and fetch to be called
          await waitFor(
            () => {
              expect(mockedFetchPage).toHaveBeenCalled();
            },
            { timeout: 2000 }
          );

          const lastCall = mockedFetchPage.mock.calls[mockedFetchPage.mock.calls.length - 1][0];
          expect(lastCall.page).toBe(1);

          unmount();
          cleanup();
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);
});


// =============================================================================
// Property 7: Pagination controls display correct count and page indicator
// Feature: component-pagination, Property 7: Pagination controls display correct count and page indicator
// **Validates: Requirements 6.1, 6.3**
// =============================================================================

describe("Property 7: Pagination controls display correct count and page indicator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("for any totalCount > 0 and valid page, displays correct 'Page X of Y' and totalCount", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 200 }),
        async (totalCount) => {
          vi.clearAllMocks();

          const totalPages = Math.ceil(totalCount / PAGE_SIZE);
          const rowCount = Math.min(PAGE_SIZE, totalCount);
          const rows: ComponentSummary[] = Array.from({ length: rowCount }, (_, i) => ({
            id: `comp-${i}-${Math.random().toString(36).slice(2, 8)}`,
            type: "gpu",
            manufacturer: "ASUS",
            model: `Model ${i}`,
            specs: {},
          }));

          mockedFetchPage.mockResolvedValue({ rows, totalCount });
          mockedFetchFilter.mockResolvedValue({ manufacturers: ["ASUS"] });

          const { container, unmount } = render(createElement(ComponentTable));

          await waitFor(() => {
            expect(container.querySelector('[role="status"]')).toBeNull();
          });

          const pageText = container.textContent ?? "";

          // Should display "Page 1 of {totalPages}"
          expect(pageText).toContain(`Page 1 of ${totalPages}`);

          // Should display totalCount with "component(s) found"
          expect(pageText).toContain(`${totalCount} component`);

          unmount();
          cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// =============================================================================
// Property 8: Type-specific spec columns shown when single type filtered
// Feature: component-pagination, Property 8: Type-specific spec columns shown when single type filtered
// **Validates: Requirements 3.4**
// =============================================================================

describe("Property 8: Type-specific spec columns shown when single type filtered", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("when a type is filtered, column headers match COMPONENT_SPEC_COLUMNS for that type", async () => {
    const typesWithColumns = Object.keys(COMPONENT_SPEC_COLUMNS).filter(
      (t) => COMPONENT_SPEC_COLUMNS[t].length > 0
    );

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...typesWithColumns),
        async (typeKey) => {
          vi.clearAllMocks();

          const expectedColumns = COMPONENT_SPEC_COLUMNS[typeKey];
          const rows: ComponentSummary[] = Array.from({ length: 3 }, (_, i) => ({
            id: `${typeKey}-comp-${i}`,
            type: typeKey,
            manufacturer: "TestMfr",
            model: `Model ${i}`,
            specs: Object.fromEntries(expectedColumns.map((c) => [c.key, "test"])),
          }));

          mockedFetchPage.mockResolvedValue({ rows, totalCount: 3 });
          mockedFetchFilter.mockResolvedValue({ manufacturers: ["TestMfr"] });

          const { container, unmount } = render(createElement(ComponentTable));

          await waitFor(() => {
            expect(container.querySelector('[role="status"]')).toBeNull();
          });

          // Apply type filter
          const typeSelect = container.querySelector(
            'select[aria-label="Filter by component type"]'
          ) as HTMLSelectElement;
          expect(typeSelect).toBeTruthy();

          mockedFetchPage.mockResolvedValue({ rows, totalCount: 3 });
          fireEvent.change(typeSelect, { target: { value: typeKey } });

          await waitFor(() => {
            expect(container.querySelector('[role="status"]')).toBeNull();
          });

          // Check column headers in the desktop table
          const table = container.querySelector("table");
          expect(table).toBeTruthy();

          const headers = Array.from(table!.querySelectorAll("th"));
          const headerLabels = headers.map((h) => h.textContent?.trim());

          // Each expected spec column label should appear in the headers
          for (const col of expectedColumns) {
            expect(headerLabels).toContain(col.label);
          }

          unmount();
          cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("when no type filter is active, no spec columns are rendered", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        async (rowCount) => {
          vi.clearAllMocks();

          const rows: ComponentSummary[] = Array.from({ length: rowCount }, (_, i) => ({
            id: `comp-${i}`,
            type: "gpu",
            manufacturer: "ASUS",
            model: `Model ${i}`,
            specs: {},
          }));

          mockedFetchPage.mockResolvedValue({ rows, totalCount: rowCount });
          mockedFetchFilter.mockResolvedValue({ manufacturers: ["ASUS"] });

          const { container, unmount } = render(createElement(ComponentTable));

          await waitFor(() => {
            expect(container.querySelector('[role="status"]')).toBeNull();
          });

          // With no type filter, the table should only have base columns (Type, Manufacturer, Model)
          const table = container.querySelector("table");
          expect(table).toBeTruthy();

          const headers = Array.from(table!.querySelectorAll("th"));
          const headerLabels = headers.map((h) => h.textContent?.trim());

          // Collect all spec column labels across all types
          const allSpecLabels = new Set<string>();
          for (const cols of Object.values(COMPONENT_SPEC_COLUMNS)) {
            for (const col of cols) {
              allSpecLabels.add(col.label);
            }
          }

          // None of the spec column labels should appear
          for (const label of allSpecLabels) {
            expect(headerLabels).not.toContain(label);
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
// Property 11: All rendered rows are keyboard-navigable
// Feature: component-pagination, Property 11: All rendered rows are keyboard-navigable
// **Validates: Requirements 11.2**
// =============================================================================

describe("Property 11: All rendered rows are keyboard-navigable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("each row has tabIndex=0 and triggers navigation on Enter/Space", async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueComponentArrayArb(1, 10),
        async (items) => {
          vi.clearAllMocks();
          mockPush.mockClear();

          mockedFetchPage.mockResolvedValue({ rows: items, totalCount: items.length });
          mockedFetchFilter.mockResolvedValue({
            manufacturers: [...new Set(items.map((r) => r.manufacturer))].sort(),
          });

          const { container, unmount } = render(createElement(ComponentTable));

          await waitFor(() => {
            expect(container.querySelector('[role="status"]')).toBeNull();
          });

          // Desktop table rows
          const table = container.querySelector("table");
          if (table) {
            const rows = Array.from(table.querySelectorAll("tbody tr")) as HTMLElement[];

            // Every row should have tabIndex=0
            for (const row of rows) {
              expect(row.tabIndex).toBe(0);
            }

            // Test Enter key on first row
            if (rows.length > 0) {
              mockPush.mockClear();
              fireEvent.keyDown(rows[0], { key: "Enter" });
              expect(mockPush).toHaveBeenCalledWith(`/components/${items[0].id}`);

              // Test Space key on first row
              mockPush.mockClear();
              fireEvent.keyDown(rows[0], { key: " " });
              expect(mockPush).toHaveBeenCalledWith(`/components/${items[0].id}`);
            }
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
// Property 12: Loading state uses status role
// Feature: component-pagination, Property 12: Loading state uses status role
// **Validates: Requirements 1.4, 11.5**
// =============================================================================

describe("Property 12: Loading state uses status role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("when loading, rendered output contains element with role='status'", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 50 }),
        async (totalCount) => {
          vi.clearAllMocks();

          // Make fetchComponentPage return a promise that never resolves
          // so the component stays in loading state
          let resolvePromise: (value: unknown) => void;
          const pendingPromise = new Promise((resolve) => {
            resolvePromise = resolve;
          });
          mockedFetchPage.mockReturnValue(pendingPromise);
          mockedFetchFilter.mockResolvedValue({ manufacturers: [] });

          const { container, unmount } = render(createElement(ComponentTable));

          // The component should be in loading state
          const statusElement = container.querySelector('[role="status"]');
          expect(statusElement).toBeTruthy();

          // Resolve the pending promise to avoid act() warnings
          resolvePromise!({ rows: [], totalCount: 0 });

          unmount();
          cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });
});
