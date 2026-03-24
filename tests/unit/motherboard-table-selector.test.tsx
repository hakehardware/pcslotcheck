import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { MotherboardSummary } from "../../src/lib/types";

// --- 5.1: Mock supabase-queries ---
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

// --- Sample data ---
const sampleRows: MotherboardSummary[] = [
  { id: "asus-z890", manufacturer: "ASUS", model: "ROG STRIX Z890-F", chipset: "Z890", socket: "LGA1851", form_factor: "ATX" },
  { id: "msi-x870", manufacturer: "MSI", model: "MAG X870 TOMAHAWK", chipset: "X870", socket: "AM5", form_factor: "ATX" },
];

const defaultPageResult = { rows: sampleRows, totalCount: 2 };
const defaultFilterOptions = { manufacturers: ["ASUS", "MSI"], chipsets: ["X870", "Z890"] };

const noop = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockedFetchPage.mockResolvedValue(defaultPageResult);
  mockedFetchFilters.mockResolvedValue(defaultFilterOptions);
});

afterEach(() => {
  vi.useRealTimers();
});


// ═══════════════════════════════════════════════════════════════════════════════
// 5.2 — Loading and error state tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("Loading and error states", () => {
  it("shows a loading indicator with role='status' while fetch is pending", async () => {
    // Never resolve so we stay in loading state
    mockedFetchPage.mockReturnValue(new Promise(() => {}));

    render(<MotherboardTable selectedBoardId={null} onSelectBoard={noop} />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/loading motherboards/i)).toBeInTheDocument();
  });

  it("shows an error message and retry button on fetch failure", async () => {
    mockedFetchPage.mockRejectedValue(new Error("Network error"));

    render(<MotherboardTable selectedBoardId={null} onSelectBoard={noop} />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText(/network error/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("clicking retry re-triggers the fetch", async () => {
    mockedFetchPage.mockRejectedValueOnce(new Error("Network error"));

    render(<MotherboardTable selectedBoardId={null} onSelectBoard={noop} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    });

    // Now make the next call succeed
    mockedFetchPage.mockResolvedValue(defaultPageResult);

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByText("ASUS")).toBeInTheDocument();
    });

    // Initial useEffect call + retry handler call
    expect(mockedFetchPage).toHaveBeenCalledTimes(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5.3 — ARIA and accessibility tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("ARIA and accessibility", () => {
  it("desktop rendering includes role='table', role='row', role='columnheader'", async () => {
    render(<MotherboardTable selectedBoardId={null} onSelectBoard={noop} />);

    await waitFor(() => {
      expect(screen.getByRole("table")).toBeInTheDocument();
    });

    expect(screen.getAllByRole("columnheader").length).toBeGreaterThanOrEqual(5);
    // Header row + 2 data rows
    expect(screen.getAllByRole("row").length).toBeGreaterThanOrEqual(2);
  });

  it("search input has an accessible label", async () => {
    render(<MotherboardTable selectedBoardId={null} onSelectBoard={noop} />);

    const searchInput = screen.getByLabelText(/search motherboards/i);
    expect(searchInput).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5.4 — Filter interaction tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("Filter interactions", () => {
  it("selecting a manufacturer filter resets page to 1 and re-fetches", async () => {
    render(<MotherboardTable selectedBoardId={null} onSelectBoard={noop} />);

    await waitFor(() => {
      expect(screen.getByRole("table")).toBeInTheDocument();
    });

    const manufacturerSelect = screen.getByDisplayValue("All Manufacturers");
    fireEvent.change(manufacturerSelect, { target: { value: "ASUS" } });

    await waitFor(() => {
      expect(mockedFetchPage).toHaveBeenCalledWith(
        expect.objectContaining({ manufacturer: "ASUS", page: 1 })
      );
    });
  });

  it("clearing a filter resets page to 1", async () => {
    render(<MotherboardTable selectedBoardId={null} onSelectBoard={noop} />);

    await waitFor(() => {
      expect(screen.getByRole("table")).toBeInTheDocument();
    });

    // Set a filter first
    const manufacturerSelect = screen.getByDisplayValue("All Manufacturers");
    fireEvent.change(manufacturerSelect, { target: { value: "ASUS" } });

    await waitFor(() => {
      expect(mockedFetchPage).toHaveBeenCalledWith(
        expect.objectContaining({ manufacturer: "ASUS" })
      );
    });

    // Clear the filter
    fireEvent.change(manufacturerSelect, { target: { value: "" } });

    await waitFor(() => {
      expect(mockedFetchPage).toHaveBeenCalledWith(
        expect.objectContaining({ manufacturer: null, page: 1 })
      );
    });
  });

  it("clearing search resets page to 1", async () => {
    vi.useFakeTimers();

    render(<MotherboardTable selectedBoardId={null} onSelectBoard={noop} />);

    const searchInput = screen.getByLabelText(/search motherboards/i);

    // Type a search term
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "ASUS" } });
      vi.advanceTimersByTime(300);
    });

    // Clear the search
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "" } });
      vi.advanceTimersByTime(300);
    });

    expect(mockedFetchPage).toHaveBeenCalledWith(
      expect.objectContaining({ search: null, page: 1 })
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5.5 — Search debounce test
// ═══════════════════════════════════════════════════════════════════════════════

describe("Search debounce", () => {
  it("typing does not immediately trigger fetch; after 300ms it does", async () => {
    vi.useFakeTimers();

    render(<MotherboardTable selectedBoardId={null} onSelectBoard={noop} />);

    const searchInput = screen.getByLabelText(/search motherboards/i);
    const callCountBefore = mockedFetchPage.mock.calls.length;

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "ROG" } });
    });

    // No new fetch immediately after typing
    expect(mockedFetchPage.mock.calls.length).toBe(callCountBefore);

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Now the fetch should have been triggered with the search value
    expect(mockedFetchPage).toHaveBeenCalledWith(
      expect.objectContaining({ search: "ROG" })
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5.6 — Empty state test
// ═══════════════════════════════════════════════════════════════════════════════

describe("Empty state", () => {
  it("displays empty state message when fetch returns 0 rows", async () => {
    mockedFetchPage.mockResolvedValue({ rows: [], totalCount: 0 });

    render(<MotherboardTable selectedBoardId={null} onSelectBoard={noop} />);

    await waitFor(() => {
      expect(screen.getByText(/no motherboards found/i)).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5.7 — Pagination button presence test
// ═══════════════════════════════════════════════════════════════════════════════

describe("Pagination buttons", () => {
  it("renders Previous and Next buttons", async () => {
    render(<MotherboardTable selectedBoardId={null} onSelectBoard={noop} />);

    await waitFor(() => {
      expect(screen.getByRole("table")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /previous/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5.8 — Pre-selected board highlight test
// ═══════════════════════════════════════════════════════════════════════════════

describe("Pre-selected board highlight", () => {
  it("selected row has the selected style when selectedBoardId matches", async () => {
    render(<MotherboardTable selectedBoardId="asus-z890" onSelectBoard={noop} />);

    await waitFor(() => {
      expect(screen.getByRole("table")).toBeInTheDocument();
    });

    // Find the row containing ASUS data in the desktop table
    const rows = screen.getAllByRole("row");
    const selectedRow = rows.find((row) => row.textContent?.includes("ROG STRIX Z890-F"));
    expect(selectedRow).toBeDefined();
    expect(selectedRow!.className).toContain("ring-blue-500");
    expect(selectedRow!.className).toContain("border-blue-500");

    // Non-selected row should NOT have the selected style
    const otherRow = rows.find((row) => row.textContent?.includes("MAG X870 TOMAHAWK"));
    expect(otherRow).toBeDefined();
    expect(otherRow!.className).not.toContain("ring-blue-500");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5.9 — Responsive layout tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("Responsive layout", () => {
  it("renders both mobile list and desktop table in the DOM", async () => {
    render(<MotherboardTable selectedBoardId={null} onSelectBoard={noop} />);

    await waitFor(() => {
      expect(screen.getByRole("table")).toBeInTheDocument();
    });

    // Both layouts are rendered (hidden via CSS classes)
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").length).toBe(sampleRows.length);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").length).toBeGreaterThanOrEqual(5);
  });

  it("mobile filter panel is collapsed by default and toggleable", async () => {
    render(<MotherboardTable selectedBoardId={null} onSelectBoard={noop} />);

    await waitFor(() => {
      expect(screen.getByRole("table")).toBeInTheDocument();
    });

    // The "Filters" toggle button should exist
    const filtersButton = screen.getByRole("button", { name: /filters/i });
    expect(filtersButton).toBeInTheDocument();

    // The filter dropdowns container should have "hidden sm:flex" when collapsed
    const filterContainer = filtersButton.parentElement!.querySelector(
      ".hidden.sm\\:flex, .flex"
    );
    // Before clicking, the container should include "hidden" in its class (collapsed)
    const allSelectContainers = filtersButton
      .closest(".space-y-3")!
      .querySelectorAll("div");
    const dropdownContainer = Array.from(allSelectContainers).find(
      (el) => el.querySelector("select") !== null
    );
    expect(dropdownContainer).toBeDefined();
    expect(dropdownContainer!.className).toContain("hidden");

    // Click to open
    fireEvent.click(filtersButton);

    // After clicking, the container should have "flex" and not start with "hidden"
    expect(dropdownContainer!.className).toContain("flex");
    expect(dropdownContainer!.className).not.toMatch(/^hidden/);
  });

  it("mobile search input remains visible when filter panel toggles", async () => {
    render(<MotherboardTable selectedBoardId={null} onSelectBoard={noop} />);

    await waitFor(() => {
      expect(screen.getByRole("table")).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText(/search motherboards/i);
    expect(searchInput).toBeInTheDocument();

    // Toggle filters
    const filtersButton = screen.getByRole("button", { name: /filters/i });
    fireEvent.click(filtersButton);

    // Search input should still be visible
    expect(screen.getByLabelText(/search motherboards/i)).toBeInTheDocument();
  });
});
