import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import fc from "fast-check";
import type { DataManifest } from "../../src/lib/types";

// -- Mock next/navigation --
const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

// -- Mock supabase-queries --
vi.mock("../../src/lib/supabase-queries", () => ({
  fetchMotherboardFromSupabase: vi.fn(),
  fetchComponentFromSupabase: vi.fn(),
  fetchMotherboardPage: vi.fn(),
  fetchFilterOptions: vi.fn(),
  assembleMotherboard: vi.fn(),
}));

import {
  fetchMotherboardFromSupabase,
  fetchFilterOptions,
  fetchMotherboardPage,
} from "../../src/lib/supabase-queries";
import SlotChecker from "../../src/components/SlotChecker";

const mockedFetchBoard = fetchMotherboardFromSupabase as ReturnType<typeof vi.fn>;
const mockedFetchPage = fetchMotherboardPage as ReturnType<typeof vi.fn>;
const mockedFetchFilters = fetchFilterOptions as ReturnType<typeof vi.fn>;

// Minimal valid DataManifest for rendering SlotChecker
const emptyManifest: DataManifest = {
  motherboards: [],
  components: [],
};

// Arbitrary: board ID strings matching the slug pattern used in the project
const boardIdArb = fc
  .stringMatching(/^[a-z0-9][a-z0-9-]{2,28}[a-z0-9]$/)
  .filter((s) => s.length >= 4);

// ===============================================================================
// Feature: homepage-search-redesign, Property 8: Pre-selected boardId skips table and loads board data
// Validates: Requirements 3.1, 3.2, 3.4
// ===============================================================================

describe("Property 8: Pre-selected boardId skips table and loads board data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mocks so MotherboardTable does not throw when rendered
    mockedFetchBoard.mockResolvedValue(null);
    mockedFetchPage.mockResolvedValue({ rows: [], totalCount: 0 });
    mockedFetchFilters.mockResolvedValue({ manufacturers: [], chipsets: [] });
  });

  it("MotherboardTable is NOT rendered when boardId prop is provided", async () => {
    await fc.assert(
      fc.asyncProperty(boardIdArb, async (boardId) => {
        mockedFetchBoard.mockResolvedValue(null);

        const { container, unmount } = render(
          <SlotChecker manifest={emptyManifest} boardId={boardId} />
        );

        // MotherboardTable renders a section with aria-label="Motherboard selection"
        // and a table with role="table". Neither should be present.
        const motherboardSection = container.querySelector(
          'section[aria-label="Motherboard selection"]'
        );
        expect(motherboardSection).toBeNull();

        // Also verify no table element from MotherboardTable
        const table = container.querySelector('table[role="table"]');
        expect(table).toBeNull();

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  });

  it("MotherboardTable IS rendered when boardId prop is NOT provided", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(undefined),
        async () => {
          mockedFetchPage.mockResolvedValue({ rows: [], totalCount: 0 });
          mockedFetchFilters.mockResolvedValue({
            manufacturers: [],
            chipsets: [],
          });

          const { container, unmount } = render(
            <SlotChecker manifest={emptyManifest} />
          );

          // The "Motherboard selection" section should be present
          const motherboardSection = container.querySelector(
            'section[aria-label="Motherboard selection"]'
          );
          expect(motherboardSection).not.toBeNull();

          unmount();
          cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ===============================================================================
// Feature: homepage-search-redesign, Property 10: Build param takes priority over board param
// Validates: Requirements 3.8
// ===============================================================================

import { encode, decode } from "../../src/lib/sharing";

describe("Property 10: Build param takes priority over board param", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear any leftover search params from previous iterations
    mockSearchParams.delete("build");
    mockSearchParams.delete("board");
    mockedFetchBoard.mockResolvedValue(null);
    mockedFetchPage.mockResolvedValue({ rows: [], totalCount: 0 });
    mockedFetchFilters.mockResolvedValue({ manufacturers: [], chipsets: [] });
  });

  it("fetchMotherboardFromSupabase is called with the build param board ID, not the boardId prop", async () => {
    // Generate two distinct board IDs: one for the prop, one for the build param
    const distinctBoardIdPair = fc
      .tuple(boardIdArb, boardIdArb)
      .filter(([a, b]) => a !== b);

    await fc.assert(
      fc.asyncProperty(distinctBoardIdPair, async ([propBoardId, buildBoardId]) => {
        vi.clearAllMocks();
        mockedFetchBoard.mockResolvedValue(null);
        mockedFetchPage.mockResolvedValue({ rows: [], totalCount: 0 });
        mockedFetchFilters.mockResolvedValue({ manufacturers: [], chipsets: [] });

        // Encode a build string using the buildBoardId
        const buildString = encode(buildBoardId, {});

        // Set the ?build= search param so SlotChecker reads it on mount
        mockSearchParams.set("build", buildString);

        // The manifest must contain the build board ID for the restore to proceed
        const manifestWithBuildBoard: DataManifest = {
          motherboards: [
            {
              id: buildBoardId,
              manufacturer: "TestMfg",
              model: "TestModel",
              socket: "AM5",
              chipset: "X870",
              form_factor: "ATX",
            },
          ],
          components: [],
        };

        const { unmount } = render(
          <SlotChecker manifest={manifestWithBuildBoard} boardId={propBoardId} />
        );

        // Wait for the async effect to fire
        await vi.waitFor(() => {
          expect(mockedFetchBoard).toHaveBeenCalled();
        });

        // The build param's board ID should be used, not the prop's board ID
        const firstCallArg = mockedFetchBoard.mock.calls[0][0];
        expect(firstCallArg).toBe(buildBoardId);
        expect(firstCallArg).not.toBe(propBoardId);

        unmount();
        cleanup();
        mockSearchParams.delete("build");
      }),
      { numRuns: 100 }
    );
  });
});

// ===============================================================================
// Feature: homepage-search-redesign, Property 1: Board selection navigates to correct check URL
// Validates: Requirements 1.9, 1.10, 2.3, 5.8
// ===============================================================================

import SearchBar from "../../src/components/SearchBar";
import { act, screen, fireEvent, waitFor } from "@testing-library/react";

// Arbitrary: generate valid MotherboardSummary objects
const motherboardSummaryArb = fc.record({
  id: fc
    .stringMatching(/^[a-z0-9][a-z0-9-]{2,28}[a-z0-9]$/)
    .filter((s) => s.length >= 4),
  manufacturer: fc.stringMatching(/^[A-Z][a-zA-Z]{1,14}$/),
  model: fc.stringMatching(/^[A-Z][a-zA-Z0-9 -]{1,24}$/),
  chipset: fc.stringMatching(/^[A-Z][a-zA-Z0-9]{1,9}$/),
  socket: fc.stringMatching(/^[A-Z][A-Z0-9]{1,5}$/),
  form_factor: fc.constantFrom("ATX", "Micro-ATX", "Mini-ITX", "E-ATX"),
});

// Helper: flush microtasks to allow resolved promises to settle
function flushMicrotasks() {
  return act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
      vi.advanceTimersByTime(0);
    });
  });
}

// Helper: type into the search input, advance debounce, and wait for results
async function typeAndWaitForResults(
  input: HTMLElement,
  mockFetchPage: ReturnType<typeof vi.fn>,
  board: { id: string; manufacturer: string; model: string; chipset: string; socket: string; form_factor: string }
) {
  mockFetchPage.mockResolvedValue({ rows: [board], totalCount: 1 });

  // Use fireEvent for reliable input simulation with fake timers
  await act(async () => {
    fireEvent.change(input, { target: { value: "test" } });
  });

  // Advance past the 300ms debounce and flush microtasks for promise resolution
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });

  // Flush again to ensure React state updates from the resolved promise settle
  await flushMicrotasks();
}

describe("Property 1: Board selection navigates to correct check URL", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("clicking a result navigates to /check?board={id}", async () => {
    await fc.assert(
      fc.asyncProperty(motherboardSummaryArb, async (board) => {
        mockPush.mockClear();

        const { unmount } = render(<SearchBar />);

        const input = screen.getByRole("combobox", {
          name: "Search motherboards",
        });

        await typeAndWaitForResults(input, mockedFetchPage, board);

        // Click on the result option
        const option = screen.getByRole("option");
        fireEvent.click(option);

        // Verify router.push was called with the correct URL
        expect(mockPush).toHaveBeenCalledWith(`/check?board=${board.id}`);

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  }, 120_000);

  it("keyboard ArrowDown + Enter navigates to /check?board={id}", async () => {
    await fc.assert(
      fc.asyncProperty(motherboardSummaryArb, async (board) => {
        mockPush.mockClear();

        const { unmount } = render(<SearchBar />);

        const input = screen.getByRole("combobox", {
          name: "Search motherboards",
        });

        await typeAndWaitForResults(input, mockedFetchPage, board);

        // Use keyboard: ArrowDown to highlight first item, Enter to select
        fireEvent.keyDown(input, { key: "ArrowDown" });
        fireEvent.keyDown(input, { key: "Enter" });

        // Verify router.push was called with the correct URL
        expect(mockPush).toHaveBeenCalledWith(`/check?board=${board.id}`);

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  }, 120_000);
});

// ===============================================================================
// Feature: homepage-search-redesign, Property 2: Search results match query across all searchable fields
// Validates: Requirements 1.4
// ===============================================================================

describe("Property 2: Search results match query across all searchable fields", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("every displayed result contains the query in at least one visible field", async () => {
    // Generate a short alphabetic query (1-6 chars) to use as a search term
    const queryArb = fc
      .stringMatching(/^[a-zA-Z]{1,6}$/)
      .filter((s) => s.length >= 1);

    // Given a query, generate a board that contains the query in at least one
    // searchable field (manufacturer, model, chipset, or socket).
    const matchingBoardArb = (query: string) => {
      // Pick which field will contain the query
      const fieldArb = fc.constantFrom(
        "manufacturer" as const,
        "model" as const,
        "chipset" as const,
        "socket" as const
      );

      return fieldArb.chain((field) => {
        // Build a board where the chosen field embeds the query as a substring
        const prefix = fc.stringMatching(/^[A-Z][a-zA-Z]{0,4}$/);
        const suffix = fc.stringMatching(/^[a-zA-Z]{0,4}$/);

        return fc.tuple(prefix, suffix).map(([pre, suf]) => {
          const fieldValue = `${pre}${query}${suf}`;
          const base = {
            id: `board-${query.toLowerCase()}-${pre.toLowerCase()}`,
            manufacturer: "TestMfg",
            model: "TestModel",
            chipset: "Z890",
            socket: "LGA1851",
            form_factor: "ATX" as const,
          };
          return { ...base, [field]: fieldValue };
        });
      });
    };

    await fc.assert(
      fc.asyncProperty(
        queryArb.chain((query) =>
          fc.tuple(
            fc.constant(query),
            fc.array(matchingBoardArb(query), { minLength: 1, maxLength: 5 })
          )
        ),
        async ([query, boards]) => {
          mockedFetchPage.mockResolvedValue({
            rows: boards,
            totalCount: boards.length,
          });

          const { unmount } = render(<SearchBar />);

          const input = screen.getByRole("combobox", {
            name: "Search motherboards",
          });

          // Type the generated query into the search input
          await act(async () => {
            fireEvent.change(input, { target: { value: query } });
          });

          // Advance past the 300ms debounce
          await act(async () => {
            await vi.advanceTimersByTimeAsync(300);
          });

          // Flush microtasks for promise resolution and React state updates
          await flushMicrotasks();

          // Verify fetchMotherboardPage was called with the query
          expect(mockedFetchPage).toHaveBeenCalledWith(
            expect.objectContaining({ search: query })
          );

          // Get all rendered option elements
          const options = screen.getAllByRole("option");
          expect(options.length).toBe(boards.length);

          // Each rendered result must contain the query (case-insensitive)
          // in its visible text content. The SearchBar renders manufacturer,
          // model, chipset, socket, and form_factor for each result.
          const lowerQuery = query.toLowerCase();
          for (const option of options) {
            const text = (option.textContent ?? "").toLowerCase();
            expect(text).toContain(lowerQuery);
          }

          unmount();
          cleanup();
        }
      ),
      { numRuns: 100 }
    );
  }, 120_000);
});

// ===============================================================================
// Feature: homepage-search-redesign, Property 3: Dropdown displays at most 5 results
// Validates: Requirements 1.6
// ===============================================================================

describe("Property 3: Dropdown displays at most 5 results", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("rendered option count equals min(N, 5) for any generated board array of size 0-10", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(motherboardSummaryArb, { minLength: 0, maxLength: 10 }),
        async (boards) => {
          // The real fetchMotherboardPage uses pageSize: 5, so it returns at
          // most 5 rows. Simulate that by slicing the generated array.
          const returnedBoards = boards.slice(0, 5);
          const expectedCount = returnedBoards.length;

          mockedFetchPage.mockResolvedValue({
            rows: returnedBoards,
            totalCount: boards.length,
          });

          const { unmount } = render(<SearchBar />);

          const input = screen.getByRole("combobox", {
            name: "Search motherboards",
          });

          // Type a query to trigger the fetch
          await act(async () => {
            fireEvent.change(input, { target: { value: "test" } });
          });

          // Advance past the 300ms debounce
          await act(async () => {
            await vi.advanceTimersByTimeAsync(300);
          });

          // Flush microtasks for promise resolution and React state updates
          await flushMicrotasks();

          if (expectedCount === 0) {
            // When no results are returned and query is non-empty, SearchBar
            // shows "No motherboards found" text instead of option elements.
            const options = screen.queryAllByRole("option");
            expect(options.length).toBe(0);
          } else {
            const options = screen.getAllByRole("option");
            expect(options.length).toBe(expectedCount);
            // The count must never exceed 5
            expect(options.length).toBeLessThanOrEqual(5);
          }

          unmount();
          cleanup();
        }
      ),
      { numRuns: 100 }
    );
  }, 120_000);
});

// ===============================================================================
// Feature: homepage-search-redesign, Property 4: Each dropdown result contains all summary fields
// Validates: Requirements 1.8
// ===============================================================================

describe("Property 4: Each dropdown result contains all summary fields", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("each rendered option contains manufacturer, model, chipset, socket, and form_factor", async () => {
    // Generate 1-5 summaries with unique IDs
    const boardsArb = fc
      .array(motherboardSummaryArb, { minLength: 1, maxLength: 5 })
      .chain((boards) => {
        // Ensure unique IDs by appending index suffix
        const uniqueBoards = boards.map((b, i) => ({
          ...b,
          id: `${b.id}-${i}`,
        }));
        return fc.constant(uniqueBoards);
      });

    await fc.assert(
      fc.asyncProperty(boardsArb, async (boards) => {
        mockedFetchPage.mockResolvedValue({
          rows: boards,
          totalCount: boards.length,
        });

        const { unmount } = render(<SearchBar />);

        const input = screen.getByRole("combobox", {
          name: "Search motherboards",
        });

        // Type a query to trigger the fetch
        await act(async () => {
          fireEvent.change(input, { target: { value: "test" } });
        });

        // Advance past the 300ms debounce
        await act(async () => {
          await vi.advanceTimersByTimeAsync(300);
        });

        // Flush microtasks for promise resolution and React state updates
        await flushMicrotasks();

        const options = screen.getAllByRole("option");
        expect(options.length).toBe(boards.length);

        // Each option must contain all five summary fields in its text content
        for (let i = 0; i < boards.length; i++) {
          const text = options[i].textContent ?? "";
          expect(text).toContain(boards[i].manufacturer);
          expect(text).toContain(boards[i].model);
          expect(text).toContain(boards[i].chipset);
          expect(text).toContain(boards[i].socket);
          expect(text).toContain(boards[i].form_factor);
        }

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  }, 120_000);
});

// ===============================================================================
// Feature: homepage-search-redesign, Property 5: aria-expanded reflects dropdown visibility
// Validates: Requirements 5.3, 5.4
// ===============================================================================

describe("Property 5: aria-expanded reflects dropdown visibility", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("aria-expanded is false before typing, true after results appear", async () => {
    await fc.assert(
      fc.asyncProperty(motherboardSummaryArb, async (board) => {
        mockedFetchPage.mockResolvedValue({
          rows: [board],
          totalCount: 1,
        });

        const { unmount } = render(<SearchBar />);

        const input = screen.getByRole("combobox", {
          name: "Search motherboards",
        });

        // Before typing, dropdown is not visible so aria-expanded should be "false"
        expect(input).toHaveAttribute("aria-expanded", "false");

        // Type a query and wait for results to appear
        await typeAndWaitForResults(input, mockedFetchPage, board);

        // After results appear, dropdown is visible so aria-expanded should be "true"
        expect(input).toHaveAttribute("aria-expanded", "true");

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  }, 120_000);
});

// ===============================================================================
// Feature: homepage-search-redesign, Property 6: Arrow key navigation cycles through dropdown results
// Validates: Requirements 5.5, 5.6
// ===============================================================================

describe("Property 6: Arrow key navigation cycles through dropdown results", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("ArrowDown from input highlights first item, then advances clamped at last item", async () => {
    // Generate 1-5 summaries with unique IDs
    const boardsArb = fc
      .array(motherboardSummaryArb, { minLength: 1, maxLength: 5 })
      .chain((boards) => {
        const uniqueBoards = boards.map((b, i) => ({
          ...b,
          id: `${b.id}-${i}`,
        }));
        return fc.constant(uniqueBoards);
      });

    await fc.assert(
      fc.asyncProperty(boardsArb, async (boards) => {
        mockedFetchPage.mockResolvedValue({
          rows: boards,
          totalCount: boards.length,
        });

        const { unmount } = render(<SearchBar />);

        const input = screen.getByRole("combobox", {
          name: "Search motherboards",
        });

        // Type a query and wait for results to appear
        await act(async () => {
          fireEvent.change(input, { target: { value: "test" } });
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(300);
        });
        await flushMicrotasks();

        const options = screen.getAllByRole("option");
        expect(options.length).toBe(boards.length);

        // Initially no option should be selected (activeIndex = -1)
        for (const opt of options) {
          expect(opt).toHaveAttribute("aria-selected", "false");
        }

        // Press ArrowDown once: should highlight first item (index 0)
        fireEvent.keyDown(input, { key: "ArrowDown" });
        expect(options[0]).toHaveAttribute("aria-selected", "true");
        for (let j = 1; j < options.length; j++) {
          expect(options[j]).toHaveAttribute("aria-selected", "false");
        }

        // Press ArrowDown for each subsequent item up to the last
        for (let i = 1; i < boards.length; i++) {
          fireEvent.keyDown(input, { key: "ArrowDown" });
          expect(options[i]).toHaveAttribute("aria-selected", "true");
          // All other options should not be selected
          for (let j = 0; j < options.length; j++) {
            if (j !== i) {
              expect(options[j]).toHaveAttribute("aria-selected", "false");
            }
          }
        }

        // Press ArrowDown again at the last item: should stay clamped at last
        const lastIndex = boards.length - 1;
        fireEvent.keyDown(input, { key: "ArrowDown" });
        expect(options[lastIndex]).toHaveAttribute("aria-selected", "true");
        for (let j = 0; j < lastIndex; j++) {
          expect(options[j]).toHaveAttribute("aria-selected", "false");
        }

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  }, 120_000);

  it("ArrowUp navigates back and clamps at first item (index 0)", async () => {
    // Generate 2-5 summaries so we can navigate down then back up
    const boardsArb = fc
      .array(motherboardSummaryArb, { minLength: 2, maxLength: 5 })
      .chain((boards) => {
        const uniqueBoards = boards.map((b, i) => ({
          ...b,
          id: `${b.id}-${i}`,
        }));
        return fc.constant(uniqueBoards);
      });

    await fc.assert(
      fc.asyncProperty(boardsArb, async (boards) => {
        mockedFetchPage.mockResolvedValue({
          rows: boards,
          totalCount: boards.length,
        });

        const { unmount } = render(<SearchBar />);

        const input = screen.getByRole("combobox", {
          name: "Search motherboards",
        });

        // Type a query and wait for results to appear
        await act(async () => {
          fireEvent.change(input, { target: { value: "test" } });
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(300);
        });
        await flushMicrotasks();

        const options = screen.getAllByRole("option");

        // Navigate down to index 2 (or last if fewer items)
        const targetDown = Math.min(2, boards.length - 1);
        for (let i = 0; i <= targetDown; i++) {
          fireEvent.keyDown(input, { key: "ArrowDown" });
        }
        expect(options[targetDown]).toHaveAttribute("aria-selected", "true");

        // Navigate back up one step
        fireEvent.keyDown(input, { key: "ArrowUp" });
        const expectedUp = Math.max(targetDown - 1, 0);
        expect(options[expectedUp]).toHaveAttribute("aria-selected", "true");
        for (let j = 0; j < options.length; j++) {
          if (j !== expectedUp) {
            expect(options[j]).toHaveAttribute("aria-selected", "false");
          }
        }

        // Navigate all the way up to index 0 and then press ArrowUp again
        // to verify clamping at 0
        for (let i = 0; i < boards.length; i++) {
          fireEvent.keyDown(input, { key: "ArrowUp" });
        }
        expect(options[0]).toHaveAttribute("aria-selected", "true");
        for (let j = 1; j < options.length; j++) {
          expect(options[j]).toHaveAttribute("aria-selected", "false");
        }

        // One more ArrowUp: should stay clamped at index 0
        fireEvent.keyDown(input, { key: "ArrowUp" });
        expect(options[0]).toHaveAttribute("aria-selected", "true");

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  }, 120_000);
});

// ===============================================================================
// Feature: homepage-search-redesign, Property 7: Escape closes dropdown and restores input focus
// Validates: Requirements 5.7
// ===============================================================================

describe("Property 7: Escape closes dropdown and restores input focus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("pressing Escape hides the dropdown, removes options, and keeps focus on input", async () => {
    await fc.assert(
      fc.asyncProperty(motherboardSummaryArb, async (board) => {
        mockedFetchPage.mockResolvedValue({
          rows: [board],
          totalCount: 1,
        });

        const { unmount } = render(<SearchBar />);

        const input = screen.getByRole("combobox", {
          name: "Search motherboards",
        });

        // Type a query and wait for results to appear in the dropdown
        await typeAndWaitForResults(input, mockedFetchPage, board);

        // Verify dropdown is visible before pressing Escape
        expect(input).toHaveAttribute("aria-expanded", "true");
        expect(screen.getAllByRole("option").length).toBeGreaterThan(0);

        // Press Escape
        fireEvent.keyDown(input, { key: "Escape" });

        // Verify dropdown is hidden
        expect(input).toHaveAttribute("aria-expanded", "false");

        // Verify no option elements are rendered
        const options = screen.queryAllByRole("option");
        expect(options.length).toBe(0);

        // Verify the input still has focus
        expect(document.activeElement).toBe(input);

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  }, 120_000);
});

// ===============================================================================
// Feature: homepage-search-redesign, Property 9: Board heading contains manufacturer and model
// Validates: Requirements 3.5
// ===============================================================================

import CheckPageClient from "../../src/components/CheckPageClient";

describe("Property 9: Board heading contains manufacturer and model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchBoard.mockResolvedValue(null);
    mockedFetchPage.mockResolvedValue({ rows: [], totalCount: 0 });
    mockedFetchFilters.mockResolvedValue({ manufacturers: [], chipsets: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it("heading contains both manufacturer and model when board is loaded", async () => {
    await fc.assert(
      fc.asyncProperty(motherboardSummaryArb, async (board) => {
        vi.clearAllMocks();

        // Mock fetchMotherboardPage to return the generated board
        // so CheckPageClient finds an exact ID match
        mockedFetchPage.mockResolvedValue({
          rows: [board],
          totalCount: 1,
        });

        const manifest: DataManifest = {
          motherboards: [],
          components: [],
        };

        const { unmount } = render(
          <CheckPageClient manifest={manifest} boardId={board.id} />
        );

        // Wait for the heading to appear after the async fetch resolves
        const heading = await waitFor(() => {
          const h1 = screen.getByRole("heading", { level: 1 });
          expect(h1).toBeTruthy();
          return h1;
        });

        // Verify the heading text contains both manufacturer and model
        const headingText = heading.textContent ?? "";
        expect(headingText).toContain(board.manufacturer);
        expect(headingText).toContain(board.model);

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  }, 120_000);
});

// ===============================================================================
// Feature: homepage-search-redesign, Property 11: Build sharing round-trip preservation
// Validates: Requirements 3.7, 6.1, 6.2
// ===============================================================================

describe("Property 11: Build sharing round-trip preservation", () => {
  // Arbitrary: non-empty alphanumeric-with-hyphens motherboard IDs
  const motherboardIdArb = fc
    .stringMatching(/^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$/)
    .filter((s) => s.length >= 2);

  // Arbitrary: non-empty alphanumeric slot/component IDs
  const slotIdArb = fc
    .stringMatching(/^[a-z0-9][a-z0-9-]{0,14}[a-z0-9]$/)
    .filter((s) => s.length >= 2);

  const componentIdArb = fc
    .stringMatching(/^[a-z0-9][a-z0-9-]{0,14}[a-z0-9]$/)
    .filter((s) => s.length >= 2);

  // Arbitrary: assignment maps (Record<string, string>) with 0-10 entries
  const assignmentsArb = fc.dictionary(slotIdArb, componentIdArb, {
    minKeys: 0,
    maxKeys: 10,
  });

  it("encode then decode produces the original motherboard ID and assignments", () => {
    fc.assert(
      fc.property(motherboardIdArb, assignmentsArb, (motherboardId, assignments) => {
        const encoded = encode(motherboardId, assignments);
        const decoded = decode(encoded);

        // Decoded result must not be null
        expect(decoded).not.toBeNull();

        // Motherboard ID must round-trip exactly
        expect(decoded!.motherboardId).toBe(motherboardId);

        // Assignments must deep-equal the original
        expect(decoded!.assignments).toEqual(assignments);
      }),
      { numRuns: 100 }
    );
  });
});

// ===============================================================================
// Feature: homepage-search-redesign, Property 12: URL build param updates on assignment change
// Validates: Requirements 6.3
// ===============================================================================

describe("Property 12: URL build param updates on assignment change", () => {
  // Reuse the same arbitrary patterns as Property 11
  const motherboardIdArb = fc
    .stringMatching(/^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$/)
    .filter((s) => s.length >= 2);

  const slotIdArb = fc
    .stringMatching(/^[a-z0-9][a-z0-9-]{0,14}[a-z0-9]$/)
    .filter((s) => s.length >= 2);

  const componentIdArb = fc
    .stringMatching(/^[a-z0-9][a-z0-9-]{0,14}[a-z0-9]$/)
    .filter((s) => s.length >= 2);

  const assignmentsArb = fc.dictionary(slotIdArb, componentIdArb, {
    minKeys: 0,
    maxKeys: 10,
  });

  it("different assignments produce different encoded strings that decode to the updated state", () => {
    // Generate two assignment maps that are structurally different
    const distinctAssignmentsPair = fc
      .tuple(motherboardIdArb, assignmentsArb, assignmentsArb)
      .filter(([, a, b]) => JSON.stringify(a) !== JSON.stringify(b));

    fc.assert(
      fc.property(distinctAssignmentsPair, ([motherboardId, assignmentsBefore, assignmentsAfter]) => {
        const encodedBefore = encode(motherboardId, assignmentsBefore);
        const encodedAfter = encode(motherboardId, assignmentsAfter);

        // When assignments differ, the encoded build strings must differ
        expect(encodedAfter).not.toBe(encodedBefore);

        // Decoding the updated build string must produce the correct state
        const decoded = decode(encodedAfter);
        expect(decoded).not.toBeNull();
        expect(decoded!.motherboardId).toBe(motherboardId);
        expect(decoded!.assignments).toEqual(assignmentsAfter);
      }),
      { numRuns: 100 }
    );
  });
});
