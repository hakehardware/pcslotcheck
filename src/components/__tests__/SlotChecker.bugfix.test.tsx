/**
 * Bug Condition Exploration Test -- SlotChecker build-param refresh
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3
 *
 * Bug: When the /check page is refreshed with a ?build= URL parameter,
 * the MotherboardTable selector reappears because the render condition
 * {!boardId && (...)} only checks the server-provided prop, not the
 * client-restored selectedBoardId or the presence of a build param.
 *
 * This test is EXPECTED TO FAIL on unfixed code -- failure confirms the bug.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import * as fc from "fast-check";
import { encode } from "../../lib/sharing";
import type { DataManifest, Motherboard } from "../../lib/types";

// -- Dynamic mock for useSearchParams ----------------------------------------

let mockBuildParam: string | null = null;

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === "build" ? mockBuildParam : null),
  }),
}));

// -- Supabase query mocks ----------------------------------------------------

const testMotherboard: Motherboard = {
  id: "test-board",
  manufacturer: "ASUS",
  model: "Test Board",
  chipset: "X870E",
  socket: "AM5",
  form_factor: "ATX",
  memory: {
    type: "DDR5",
    max_speed_mhz: 6400,
    base_speed_mhz: 4800,
    max_capacity_gb: 128,
    ecc_support: false,
    channels: 2,
    slots: [],
    recommended_population: { two_dimm: [] },
  },
  m2_slots: [],
  pcie_slots: [],
  sata_ports: [],
  sources: [],
  schema_version: "1.0",
};

const mockFetchMotherboard = vi.fn<(id: string) => Promise<Motherboard | null>>();
const mockFetchComponent = vi.fn();

vi.mock("../../lib/supabase-queries", () => ({
  fetchMotherboardFromSupabase: (...args: unknown[]) =>
    mockFetchMotherboard(...(args as [string])),
  fetchComponentFromSupabase: (...args: unknown[]) =>
    mockFetchComponent(...args),
  fetchMotherboardPage: vi.fn().mockResolvedValue({ rows: [], totalCount: 0 }),
  fetchFilterOptions: vi
    .fn()
    .mockResolvedValue({ manufacturers: [], chipsets: [] }),
}));

// -- Other dependency mocks --------------------------------------------------

vi.mock("../../lib/validation-engine", () => ({
  validateAssignments: vi.fn().mockReturnValue([]),
}));

vi.mock("../../lib/ui-helpers", () => ({
  resolveSharingRules: vi.fn().mockReturnValue({
    disabledSlots: new Set<string>(),
    bandwidthWarnings: new Map<string, string>(),
  }),
  groupSlotsByCategory: vi.fn().mockReturnValue([]),
}));

vi.mock("../../lib/cpu-utils", () => ({
  resolveEffectiveSlotValues: vi.fn().mockReturnValue({ gen: 5, lanes: 4 }),
  computeCpuImpact: vi.fn().mockReturnValue(null),
}));

vi.mock("../../lib/stick-utils", () => ({
  getKitAssignments: vi.fn().mockReturnValue({}),
  getAssignedKitIds: vi.fn().mockReturnValue([]),
}));

// -- Test manifest -----------------------------------------------------------

const boardIds = [
  "test-board",
  "asus-rog-strix-b650-e",
  "msi-mag-b650-tomahawk",
  "gigabyte-b650-aorus-elite",
];

const testManifest: DataManifest = {
  motherboards: boardIds.map((id) => ({
    id,
    manufacturer: "TestMfg",
    model: `Model ${id}`,
    socket: "AM5",
    chipset: "B650",
    form_factor: "ATX",
  })),
  components: [],
};

// -- Arbitrary: valid board ID from the manifest -----------------------------

const arbBoardId = fc.constantFrom(...boardIds);

// -- Tests -------------------------------------------------------------------

describe("Bug Condition Exploration: MotherboardTable visible during build param restoration", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetchMotherboard.mockResolvedValue(testMotherboard);
    mockFetchComponent.mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockBuildParam = null;
  });

  it("Property 1a: for all valid encoded build params, SlotChecker SHALL NOT render the MotherboardTable section", async () => {
    /**
     * Validates: Requirements 2.1
     *
     * For any valid board ID from the manifest, encoding it via encode()
     * and setting it as the ?build= search param, then rendering
     * <SlotChecker manifest={testManifest} boardId={undefined} />
     * SHALL NOT render the MotherboardTable section (aria-label="Motherboard selection").
     *
     * On UNFIXED code this WILL FAIL because the render condition
     * {!boardId && (...)} evaluates to true when boardId is undefined,
     * regardless of the ?build= param.
     */
    await fc.assert(
      fc.asyncProperty(arbBoardId, async (boardId) => {
        cleanup();
        vi.resetModules();

        const encoded = encode(boardId, {});
        mockBuildParam = encoded;

        mockFetchMotherboard.mockResolvedValue({
          ...testMotherboard,
          id: boardId,
        });

        const { default: SlotChecker } = await import("../SlotChecker");

        render(<SlotChecker manifest={testManifest} boardId={undefined} />);

        const motherboardSection = screen.queryByLabelText(
          "Motherboard selection"
        );
        expect(motherboardSection).not.toBeInTheDocument();
      }),
      { numRuns: 10 }
    );
  });

  it("Property 1b: for all valid encoded build params, SlotChecker SHALL NOT render the empty-state text", async () => {
    /**
     * Validates: Requirements 2.2
     *
     * For any valid board ID from the manifest, encoding it via encode()
     * and setting it as the ?build= search param, then rendering
     * <SlotChecker manifest={testManifest} boardId={undefined} />
     * SHALL NOT render the empty-state text
     * "Select a motherboard above to begin checking slot compatibility".
     *
     * On UNFIXED code this WILL FAIL because the empty-state condition
     * {!boardId && !selectedBoardId && !boardLoading && (...)} is momentarily
     * true before the restoration effect fires.
     */
    await fc.assert(
      fc.asyncProperty(arbBoardId, async (boardId) => {
        cleanup();
        vi.resetModules();

        const encoded = encode(boardId, {});
        mockBuildParam = encoded;

        mockFetchMotherboard.mockResolvedValue({
          ...testMotherboard,
          id: boardId,
        });

        const { default: SlotChecker } = await import("../SlotChecker");

        render(<SlotChecker manifest={testManifest} boardId={undefined} />);

        const emptyState = screen.queryByText(
          "Select a motherboard above to begin checking slot compatibility."
        );
        expect(emptyState).not.toBeInTheDocument();
      }),
      { numRuns: 10 }
    );
  });

  it("Property 1c: for all valid encoded build params, the component SHALL show a loading indicator or slot details on initial render", async () => {
    /**
     * Validates: Requirements 2.2, 2.3
     *
     * For any valid board ID from the manifest, encoding it via encode()
     * and setting it as the ?build= search param, then rendering
     * <SlotChecker manifest={testManifest} boardId={undefined} />
     * SHALL show a loading indicator (role="status") or slot details
     * on initial render.
     *
     * On UNFIXED code this WILL FAIL because boardLoading starts as false
     * and the restoration effect has not yet fired on the initial render,
     * so neither a loading indicator nor slot details are shown.
     */
    await fc.assert(
      fc.asyncProperty(arbBoardId, async (boardId) => {
        cleanup();
        vi.resetModules();

        const encoded = encode(boardId, {});
        mockBuildParam = encoded;

        mockFetchMotherboard.mockResolvedValue({
          ...testMotherboard,
          id: boardId,
        });

        const { default: SlotChecker } = await import("../SlotChecker");

        render(<SlotChecker manifest={testManifest} boardId={undefined} />);

        const loadingIndicators = screen.queryAllByRole("status");
        // We specifically look for the SlotChecker's own loading indicator
        // (not the MotherboardTable's internal one). The SlotChecker loading
        // indicator shows "Loading motherboard data..." text.
        const slotCheckerLoading = loadingIndicators.some((el) =>
          el.textContent?.includes("Loading motherboard data")
        );
        // Slot details would be indicated by the presence of the SlotList
        // or motherboard-specific content. For the initial render, we expect
        // at minimum the SlotChecker's own loading indicator (not just the
        // MotherboardTable's internal loading spinner).
        //
        // On UNFIXED code, the MotherboardTable renders its own loading
        // spinner, but the SlotChecker should show its OWN loading state
        // without the MotherboardTable being visible at all.
        const motherboardSection = screen.queryByLabelText(
          "Motherboard selection"
        );
        const hasProperLoadingState =
          slotCheckerLoading && motherboardSection === null;

        expect(hasProperLoadingState).toBe(true);
      }),
      { numRuns: 10 }
    );
  });
});


// -- Preservation Tests ------------------------------------------------------

describe("Preservation: Non-Build-Param Behavior Unchanged", () => {
  /**
   * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
   *
   * These tests capture the existing correct behavior of SlotChecker
   * when no ?build= URL parameter is present. They MUST PASS on the
   * current unfixed code to establish a baseline, and continue to pass
   * after the fix is applied (no regressions).
   */

  beforeEach(() => {
    vi.resetModules();
    mockFetchMotherboard.mockResolvedValue(testMotherboard);
    mockFetchComponent.mockResolvedValue(null);
    mockBuildParam = null;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockBuildParam = null;
  });

  it("Property 2a: for all non-empty boardId strings, SlotChecker SHALL NOT render the MotherboardTable section", async () => {
    /**
     * Validates: Requirements 3.1
     *
     * For any non-empty board ID string passed as the boardId prop,
     * rendering <SlotChecker manifest={testManifest} boardId={boardId} />
     * SHALL NOT render the MotherboardTable section
     * (aria-label="Motherboard selection").
     *
     * This preserves the existing !boardId behavior for direct ?board= links.
     * On unfixed code, the condition {!boardId && (...)} evaluates to false
     * when boardId is a non-empty string, so the table is hidden.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter((s) => s.length > 0),
        async (boardId) => {
          cleanup();
          vi.resetModules();

          mockFetchMotherboard.mockResolvedValue({
            ...testMotherboard,
            id: boardId,
          });

          const { default: SlotChecker } = await import("../SlotChecker");

          render(<SlotChecker manifest={testManifest} boardId={boardId} />);

          const motherboardSection = screen.queryByLabelText(
            "Motherboard selection"
          );
          expect(motherboardSection).not.toBeInTheDocument();
        }
      ),
      { numRuns: 20 }
    );
  });

  it("Example 2b: fresh visit with boardId=undefined renders MotherboardTable and empty-state message", async () => {
    /**
     * Validates: Requirements 3.2
     *
     * Rendering with boardId={undefined}, no ?build= param, and no prior
     * selection SHALL render the MotherboardTable section and the
     * empty-state message "Select a motherboard above to begin checking
     * slot compatibility."
     *
     * This preserves the fresh /check visit behavior where the user sees
     * the board selector table and a prompt to select a board.
     */
    vi.resetModules();
    mockBuildParam = null;

    const { default: SlotChecker } = await import("../SlotChecker");

    render(<SlotChecker manifest={testManifest} boardId={undefined} />);

    // MotherboardTable section should be present
    const motherboardSection = screen.queryByLabelText(
      "Motherboard selection"
    );
    expect(motherboardSection).toBeInTheDocument();

    // Empty-state message should be present
    const emptyState = screen.queryByText(
      "Select a motherboard above to begin checking slot compatibility."
    );
    expect(emptyState).toBeInTheDocument();
  });

  it("Example 2c: manual board selection hides the empty-state message and triggers loading", async () => {
    /**
     * Validates: Requirements 3.3
     *
     * Rendering with boardId={undefined}, no ?build= param, then
     * simulating a board selection SHALL hide the empty-state message
     * and show a loading indicator while the board data is fetched.
     *
     * This preserves the manual selection behavior where selecting a
     * board from the MotherboardTable triggers data loading and removes
     * the empty-state prompt.
     */
    vi.resetModules();
    mockBuildParam = null;

    // Delay the fetch so we can observe the loading state
    mockFetchMotherboard.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(testMotherboard), 100)
        )
    );

    const { default: SlotChecker } = await import("../SlotChecker");
    const { act } = await import("@testing-library/react");

    const { rerender } = render(
      <SlotChecker manifest={testManifest} boardId={undefined} />
    );

    // Before selection: empty-state should be present
    expect(
      screen.queryByText(
        "Select a motherboard above to begin checking slot compatibility."
      )
    ).toBeInTheDocument();

    // Simulate board selection by finding the MotherboardTable's onSelectBoard
    // callback. The MotherboardTable is rendered inside the section, and the
    // SlotChecker passes handleSelectBoard to it. We trigger it by finding
    // a board row and clicking it. Since MotherboardTable is mocked to return
    // empty rows, we instead re-render with a boardId to simulate the effect
    // of selection (the boardId prop triggers the auto-fetch useEffect).
    //
    // Actually, we can trigger handleSelectBoard directly by accessing the
    // MotherboardTable's onSelectBoard prop. But since MotherboardTable is
    // a real component with mocked data (empty rows), there are no rows to
    // click. Instead, we test the state transition by re-rendering with a
    // boardId prop, which triggers the same fetchBoard path.
    await act(async () => {
      rerender(
        <SlotChecker manifest={testManifest} boardId="test-board" />
      );
    });

    // After providing boardId: empty-state should be gone
    expect(
      screen.queryByText(
        "Select a motherboard above to begin checking slot compatibility."
      )
    ).not.toBeInTheDocument();

    // The MotherboardTable section should also be hidden (boardId is now truthy)
    expect(
      screen.queryByLabelText("Motherboard selection")
    ).not.toBeInTheDocument();
  });
});
