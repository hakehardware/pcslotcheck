import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import fc from "fast-check";
import { renderToString } from "react-dom/server";
import type { DataManifest } from "../../src/lib/types";

// =============================================================================
// Bugfix: hydration-mismatch-fix
// Property 1: Bug Condition - CheckPageClient Hydration Consistency
// Validates: Requirements 1.1, 1.4, 2.1, 2.4
//
// For any boardId value (null, undefined, empty string, valid board ID strings),
// CheckPageClient SHALL produce identical HTML on the initial render pass with
// no hydration mismatch warnings.
//
// The bug: useState(!!boardId) makes the initial loading state prop-dependent.
// When boardId is truthy, the server renders loading=true (showing a skeleton),
// but the expected behavior is loading=false on initial render for ALL boardId
// values, deferring the loading transition to useEffect after mount. This
// prop-dependent initial state is what causes server/client HTML divergence
// in the Next.js SSR pipeline.
//
// Test strategy: render CheckPageClient via renderToString (simulating SSR)
// and verify the initial HTML does not contain the loading skeleton for any
// boardId value. The loading skeleton is the animate-pulse div that only
// appears when boardId && loading && !boardSummary. With the bug, truthy
// boardId causes loading=true on the initial render, producing the skeleton.
// After the fix (useState(false)), loading starts false for all inputs.
// =============================================================================

// -- Mock next/navigation --
const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

// -- Mock supabase-queries to prevent real network calls --
vi.mock("../../src/lib/supabase-queries", () => ({
  fetchMotherboardFromSupabase: vi.fn(),
  fetchComponentFromSupabase: vi.fn(),
  fetchMotherboardPage: vi.fn(),
  fetchMotherboardSummaryById: vi.fn(),
  fetchFilterOptions: vi.fn(),
  assembleMotherboard: vi.fn(),
}));

import {
  fetchMotherboardSummaryById,
  fetchMotherboardFromSupabase,
  fetchMotherboardPage,
  fetchFilterOptions,
} from "../../src/lib/supabase-queries";

import CheckPageClient from "../../src/components/CheckPageClient";

const mockedFetchSummaryById = fetchMotherboardSummaryById as ReturnType<typeof vi.fn>;
const mockedFetchBoard = fetchMotherboardFromSupabase as ReturnType<typeof vi.fn>;
const mockedFetchPage = fetchMotherboardPage as ReturnType<typeof vi.fn>;
const mockedFetchFilters = fetchFilterOptions as ReturnType<typeof vi.fn>;

// Minimal valid DataManifest for rendering CheckPageClient
const emptyManifest: DataManifest = {
  motherboards: [],
  components: [],
};

// Generator: boardId values covering null, undefined, empty string, and valid IDs
const boardIdArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(""),
  fc.stringMatching(/^[a-z0-9-]{2,30}$/)
);

describe("Property 1: Bug Condition - CheckPageClient Hydration Consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock all supabase queries to prevent real network calls
    mockedFetchSummaryById.mockResolvedValue({
      id: "test-board",
      manufacturer: "TestMfg",
      model: "TestModel",
      chipset: "Z890",
      socket: "LGA1851",
      form_factor: "ATX",
    });
    mockedFetchBoard.mockResolvedValue(null);
    mockedFetchPage.mockResolvedValue({ rows: [], totalCount: 0 });
    mockedFetchFilters.mockResolvedValue({ manufacturers: [], chipsets: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it("initial render does not contain loading skeleton for any boardId value", () => {
    // Suppress console.error from React SSR warnings to keep output clean
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    fc.assert(
      fc.property(boardIdArb, (boardId) => {
        // Server-render the component. This simulates the SSR pass where
        // useState is evaluated but useEffect does NOT run.
        // With the bug: useState(!!boardId) -> loading=true for truthy boardId
        //   -> renders the animate-pulse loading skeleton div
        // Expected: useState(false) -> loading=false for ALL boardId values
        //   -> no loading skeleton on initial render
        const html = renderToString(
          <CheckPageClient
            manifest={emptyManifest}
            boardId={boardId ?? undefined}
          />
        );

        // The loading skeleton is identified by the animate-pulse class.
        // It renders when: boardId && loading && !boardSummary
        // On initial render, boardSummary is always null (fetch hasn't run).
        // So the skeleton appears iff boardId is truthy AND loading is true.
        //
        // With the bug (useState(!!boardId)):
        //   truthy boardId -> loading=true -> skeleton present (FAIL)
        //   falsy boardId  -> loading=false -> no skeleton (PASS)
        //
        // After fix (useState(false)):
        //   any boardId -> loading=false -> no skeleton (PASS)
        const hasLoadingSkeleton = html.includes("animate-pulse");

        expect(hasLoadingSkeleton).toBe(false);
      }),
      { numRuns: 100 }
    );

    consoleErrorSpy.mockRestore();
  });
});
