// Feature: component-browser, Properties 7-10, 15, 17: Component table property tests
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import fc from "fast-check";
import type { ComponentSummary } from "../../src/lib/types";
import { arbComponentSummary } from "../../src/lib/__tests__/generators";
import { COMPONENT_TYPE_META } from "../../src/lib/component-type-meta";

// -- Mock next/navigation -----------------------------------------------------
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import ComponentTable from "../../src/components/ComponentTable";

// -- Helpers ------------------------------------------------------------------

/** Generate an array of ComponentSummary with unique IDs */
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

/** Get the human-readable type label for a component type key */
function getTypeLabel(type: string): string {
  return COMPONENT_TYPE_META[type]?.label ?? type;
}

/** Render ComponentTable and return the container + unmount */
function renderTable(items: ComponentSummary[]) {
  mockPush.mockClear();
  const result = render(<ComponentTable components={items} />);
  return result;
}

/** Get the desktop table element from the container */
function getDesktopTable(container: HTMLElement): HTMLTableElement | null {
  return container.querySelector("table");
}

/** Get all data rows from the desktop table */
function getDataRows(table: HTMLTableElement): HTMLTableRowElement[] {
  return Array.from(table.querySelectorAll("tbody tr[role='row']"));
}


// =============================================================================
// Property 7: Component table renders all manifest entries
// Feature: component-browser, Property 7: Component table renders all manifest entries
// **Validates: Requirements 3.1**
// =============================================================================

describe("Property 7: Component table renders all manifest entries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("for any set of component summaries, the table renders exactly as many rows as entries (no filters applied)", () => {
    fc.assert(
      fc.property(uniqueComponentArrayArb(1, 10), (items) => {
        const { container, unmount } = renderTable(items);

        const table = getDesktopTable(container);
        expect(table).toBeTruthy();

        const rows = getDataRows(table!);
        expect(rows.length).toBe(items.length);

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  });
});

// =============================================================================
// Property 8: Component table rows contain required fields
// Feature: component-browser, Property 8: Component table rows contain required fields
// **Validates: Requirements 3.2**
// =============================================================================

describe("Property 8: Component table rows contain required fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("for any component summary, the rendered row contains the type label, manufacturer, and model", () => {
    fc.assert(
      fc.property(uniqueComponentArrayArb(1, 10), (items) => {
        const { container, unmount } = renderTable(items);

        const table = getDesktopTable(container);
        expect(table).toBeTruthy();

        const rows = getDataRows(table!);

        // The table sorts by type ascending by default, so we need to
        // match against the sorted order
        const sorted = [...items].sort((a, b) =>
          a.type.toLowerCase().localeCompare(b.type.toLowerCase())
        );

        sorted.forEach((item, i) => {
          const rowText = rows[i].textContent ?? "";
          expect(rowText).toContain(getTypeLabel(item.type));
          expect(rowText).toContain(item.manufacturer);
          expect(rowText).toContain(item.model);
        });

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  });
});

// =============================================================================
// Property 9: Component row click navigates to correct detail URL
// Feature: component-browser, Property 9: Component row click navigates to correct detail URL
// **Validates: Requirements 3.3**
// =============================================================================

describe("Property 9: Component row click navigates to correct detail URL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("for any component summary with id X, clicking its row triggers navigation to /components/X", () => {
    const scenarioArb = uniqueComponentArrayArb(1, 10).chain((items) =>
      fc.tuple(
        fc.constant(items),
        fc.integer({ min: 0, max: items.length - 1 })
      )
    );

    fc.assert(
      fc.property(scenarioArb, ([items, clickIdx]) => {
        const { container, unmount } = renderTable(items);

        const table = getDesktopTable(container);
        expect(table).toBeTruthy();

        const rows = getDataRows(table!);

        // Items are sorted by type ascending by default
        const sorted = [...items].sort((a, b) =>
          a.type.toLowerCase().localeCompare(b.type.toLowerCase())
        );

        mockPush.mockClear();
        fireEvent.click(rows[clickIdx]);

        expect(mockPush).toHaveBeenCalledWith(
          `/components/${sorted[clickIdx].id}`
        );

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  });
});


// =============================================================================
// Property 10: Component table filtering correctness and count
// Feature: component-browser, Property 10: Component table filtering correctness and count
// **Validates: Requirements 3.4, 3.5, 3.6**
// =============================================================================

describe("Property 10: Component table filtering correctness and count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("for any combination of type and manufacturer filters, all displayed rows match every active filter, and count equals matching rows", () => {
    const scenarioArb = uniqueComponentArrayArb(1, 15).chain((items) => {
      const types = [...new Set(items.map((c) => c.type))];
      const manufacturers = [...new Set(items.map((c) => c.manufacturer))];
      return fc.tuple(
        fc.constant(items),
        fc.option(fc.constantFrom(...types), { nil: null }),
        fc.option(fc.constantFrom(...manufacturers), { nil: null })
      );
    });

    fc.assert(
      fc.property(scenarioArb, ([items, typeFilter, manufacturerFilter]) => {
        const { container, unmount } = renderTable(items);

        // Apply type filter if specified
        if (typeFilter) {
          const typeSelect = container.querySelector(
            'select[aria-label="Filter by component type"]'
          ) as HTMLSelectElement;
          expect(typeSelect).toBeTruthy();
          fireEvent.change(typeSelect, { target: { value: typeFilter } });
        }

        // Apply manufacturer filter if specified
        if (manufacturerFilter) {
          const mfrSelect = container.querySelector(
            'select[aria-label="Filter by manufacturer"]'
          ) as HTMLSelectElement;
          expect(mfrSelect).toBeTruthy();
          fireEvent.change(mfrSelect, {
            target: { value: manufacturerFilter },
          });
        }

        // Compute expected filtered results
        let expected = [...items];
        if (typeFilter) {
          expected = expected.filter((c) => c.type === typeFilter);
        }
        if (manufacturerFilter) {
          expected = expected.filter(
            (c) => c.manufacturer === manufacturerFilter
          );
        }

        if (expected.length > 0) {
          const table = getDesktopTable(container);
          expect(table).toBeTruthy();

          const rows = getDataRows(table!);
          expect(rows.length).toBe(expected.length);

          // Every displayed row matches all active filters
          for (const row of rows) {
            const rowText = row.textContent ?? "";
            if (typeFilter) {
              expect(rowText).toContain(getTypeLabel(typeFilter));
            }
            if (manufacturerFilter) {
              expect(rowText).toContain(manufacturerFilter);
            }
          }

          // Count text matches
          const pageText = container.textContent ?? "";
          expect(pageText).toContain(`${expected.length} component`);
        } else {
          // No matches: should show "No components match" message
          const pageText = container.textContent ?? "";
          expect(pageText).toContain("No components match");
        }

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  });
});

// =============================================================================
// Property 15: Component table rows are keyboard-navigable
// Feature: component-browser, Property 15: Component table rows are keyboard-navigable
// **Validates: Requirements 7.4**
// =============================================================================

describe("Property 15: Component table rows are keyboard-navigable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("each row has tabIndex=0 and responds to Enter and Space keys", () => {
    const scenarioArb = uniqueComponentArrayArb(1, 10).chain((items) =>
      fc.tuple(
        fc.constant(items),
        fc.integer({ min: 0, max: items.length - 1 })
      )
    );

    fc.assert(
      fc.property(scenarioArb, ([items, targetIdx]) => {
        const { container, unmount } = renderTable(items);

        const table = getDesktopTable(container);
        expect(table).toBeTruthy();

        const rows = getDataRows(table!) as HTMLElement[];

        // Items are sorted by type ascending by default
        const sorted = [...items].sort((a, b) =>
          a.type.toLowerCase().localeCompare(b.type.toLowerCase())
        );

        // Every row should have tabIndex=0
        for (const row of rows) {
          expect(row.tabIndex).toBe(0);
        }

        // Enter key triggers navigation with the correct ID
        mockPush.mockClear();
        fireEvent.keyDown(rows[targetIdx], { key: "Enter" });
        expect(mockPush).toHaveBeenCalledWith(
          `/components/${sorted[targetIdx].id}`
        );

        mockPush.mockClear();

        // Space key triggers navigation with the correct ID
        fireEvent.keyDown(rows[targetIdx], { key: " " });
        expect(mockPush).toHaveBeenCalledWith(
          `/components/${sorted[targetIdx].id}`
        );

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  });
});

// =============================================================================
// Property 17: Component table aria-sort reflects sort state
// Feature: component-browser, Property 17: Component table aria-sort reflects sort state
// **Validates: Requirements 7.7**
// =============================================================================

describe("Property 17: Component table aria-sort reflects sort state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("the sorted column header has aria-sort ascending or descending, no other header has aria-sort", () => {
    const sortableColumns = ["Type", "Manufacturer", "Model"] as const;

    const scenarioArb = fc.tuple(
      uniqueComponentArrayArb(1, 10),
      fc.constantFrom(...sortableColumns),
      fc.integer({ min: 1, max: 3 }) // number of clicks on the column header
    );

    fc.assert(
      fc.property(scenarioArb, ([items, columnLabel, clickCount]) => {
        const { container, unmount } = renderTable(items);

        const table = getDesktopTable(container);
        expect(table).toBeTruthy();

        // Find the sortable column header by text content
        const headers = Array.from(
          table!.querySelectorAll('th[role="columnheader"]')
        ) as HTMLElement[];

        const targetHeader = headers.find(
          (h) => h.textContent?.trim().startsWith(columnLabel)
        );
        expect(targetHeader).toBeTruthy();

        // Click the header the specified number of times
        for (let i = 0; i < clickCount; i++) {
          fireEvent.click(targetHeader!);
        }

        // Determine expected sort direction:
        // Default sort is "type" ascending.
        // If clicking the same column as current sort, it toggles.
        // If clicking a different column, it starts ascending.
        let expectedDir: string;
        if (columnLabel === "Type") {
          // Type is the default sort column (ascending).
          // Each click toggles: 1 click -> descending, 2 -> ascending, 3 -> descending
          expectedDir = clickCount % 2 === 1 ? "descending" : "ascending";
        } else {
          // Different column: first click sets ascending, then toggles
          expectedDir = clickCount % 2 === 1 ? "ascending" : "descending";
        }

        // The clicked column header should have the correct aria-sort
        expect(targetHeader!.getAttribute("aria-sort")).toBe(expectedDir);

        // No other sortable header should have aria-sort
        for (const header of headers) {
          if (header !== targetHeader) {
            expect(header.getAttribute("aria-sort")).toBeNull();
          }
        }

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  });
});
