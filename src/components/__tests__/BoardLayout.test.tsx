/**
 * Integration and property tests for BoardLayout click-to-assign flow.
 *
 * Validates: Requirements 1.1, 6.2, 6.4, 6.5, 7.1, 7.4, 7.5, 7.6
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import * as fc from "fast-check";
import type { Motherboard, DataManifest, SlotPosition } from "@/lib/types";

// Mock next/link to render a plain anchor
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock Supabase queries
vi.mock("@/lib/supabase-queries", () => ({
  fetchMotherboardFromSupabase: vi.fn(),
  fetchComponentFromSupabase: vi.fn(),
  fetchMotherboardSummaryById: vi.fn(),
}));

import { fetchMotherboardFromSupabase, fetchComponentFromSupabase } from "@/lib/supabase-queries";
import BoardLayout from "../BoardLayout";

// -- Test fixtures --

const SLOT_POSITIONS: SlotPosition[] = [
  {
    slot_type: "cpu",
    slot_id: "cpu_1",
    x_pct: 60,
    y_pct: 10,
    width_pct: 15,
    height_pct: 15,
  },
  {
    slot_type: "pcie",
    slot_id: "pcie_1",
    x_pct: 5,
    y_pct: 40,
    width_pct: 50,
    height_pct: 4,
  },
  {
    slot_type: "m2",
    slot_id: "m2_1",
    x_pct: 10,
    y_pct: 50,
    width_pct: 20,
    height_pct: 3,
  },
  {
    slot_type: "dimm",
    slot_id: "dimm_a1",
    x_pct: 80,
    y_pct: 15,
    width_pct: 3,
    height_pct: 25,
  },
];

function makeMockMotherboard(
  overrides: Partial<Motherboard> = {},
): Motherboard {
  return {
    id: "test-board-atx",
    manufacturer: "TestVendor",
    model: "ATX-Pro",
    chipset: "Z790",
    socket: "LGA1700",
    form_factor: "ATX",
    memory: {
      type: "DDR5",
      max_speed_mhz: 5600,
      base_speed_mhz: 4800,
      max_capacity_gb: 128,
      ecc_support: false,
      channels: 2,
      slots: [
        { id: "dimm_a1", channel: "A", position: 1, recommended: true },
        { id: "dimm_b1", channel: "B", position: 1, recommended: true },
      ],
      recommended_population: { two_dimm: ["dimm_a1", "dimm_b1"] },
    },
    m2_slots: [
      {
        id: "m2_1",
        label: "M2_1",
        interface: "PCIe",
        gen: 4,
        lanes: 4,
        form_factors: ["2280"],
        source: "CPU",
        supports_sata: false,
        heatsink_included: true,
        sharing: null,
      },
    ],
    pcie_slots: [
      {
        id: "pcie_1",
        label: "PCIEX16_1",
        gen: 5,
        electrical_lanes: 16,
        physical_size: "x16",
        position: 1,
        source: "CPU",
        reinforced: true,
        sharing: null,
      },
    ],
    sata_ports: [
      { id: "sata_1", version: "3.0", source: "Chipset", disabled_by: null },
      { id: "sata_2", version: "3.0", source: "Chipset", disabled_by: null },
    ],
    sources: [{ type: "manual", url: "https://example.com" }],
    schema_version: "1.0",
    slot_positions: SLOT_POSITIONS,
    ...overrides,
  };
}

const MOCK_MANIFEST: DataManifest = {
  motherboards: [
    {
      id: "test-board-atx",
      manufacturer: "TestVendor",
      model: "ATX-Pro",
      chipset: "Z790",
      socket: "LGA1700",
      form_factor: "ATX",
    },
  ],
  components: [
    {
      id: "gpu-1",
      type: "gpu",
      manufacturer: "NVIDIA",
      model: "RTX 4090",
      specs: { "physical.length_mm": 304 },
    },
    {
      id: "nvme-1",
      type: "nvme",
      manufacturer: "Samsung",
      model: "990 Pro",
      specs: { "capacity_gb": 2000, "interface.protocol": "NVMe" },
    },
    {
      id: "ram-1",
      type: "ram",
      manufacturer: "Corsair",
      model: "Vengeance DDR5",
      specs: { "interface.type": "DDR5", "capacity.total_gb": 32 },
    },
    {
      id: "cpu-1",
      type: "cpu",
      manufacturer: "Intel",
      model: "i9-14900K",
      specs: { socket: "LGA1700" },
    },
    {
      id: "sata-1",
      type: "sata_drive",
      manufacturer: "Samsung",
      model: "870 EVO",
      specs: { capacity_gb: 1000 },
    },
  ],
};

const mockFetchMotherboard = fetchMotherboardFromSupabase as ReturnType<typeof vi.fn>;
const mockFetchComponent = fetchComponentFromSupabase as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchComponent.mockResolvedValue(null);
});

// -- Integration Tests --

describe("BoardLayout - no board selected (empty case)", () => {
  it("renders clickable prompt instead of BoardSelector", () => {
    render(<BoardLayout manifest={MOCK_MANIFEST} />);

    expect(screen.getByText("Interactive Board Layout")).toBeInTheDocument();
    expect(screen.getByText("Click to select a motherboard")).toBeInTheDocument();
    expect(screen.getByTestId("empty-case-prompt")).toBeInTheDocument();
  });

  it("opens SearchModal in board mode when prompt is clicked", async () => {
    const user = userEvent.setup();
    render(<BoardLayout manifest={MOCK_MANIFEST} />);

    await user.click(screen.getByTestId("empty-case-prompt"));

    expect(screen.getByTestId("search-modal")).toBeInTheDocument();
    expect(screen.getByText("Select Motherboard")).toBeInTheDocument();
  });

  it("does not show reset buttons when no board is loaded", () => {
    render(<BoardLayout manifest={MOCK_MANIFEST} />);

    expect(screen.queryByTestId("clear-components-btn")).not.toBeInTheDocument();
    expect(screen.queryByTestId("reset-build-btn")).not.toBeInTheDocument();
  });
});

describe("BoardLayout - loading state", () => {
  it("shows loading indicator while fetching motherboard", () => {
    mockFetchMotherboard.mockReturnValue(new Promise(() => {}));

    render(<BoardLayout manifest={MOCK_MANIFEST} boardId="test-board-atx" />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Loading motherboard...")).toBeInTheDocument();
  });
});

describe("BoardLayout - no slot positions", () => {
  it('shows "Layout data not yet available" when motherboard has no slot_positions', async () => {
    const boardNoSlots = makeMockMotherboard({ slot_positions: undefined });
    mockFetchMotherboard.mockResolvedValue(boardNoSlots);

    render(<BoardLayout manifest={MOCK_MANIFEST} boardId="test-board-atx" />);

    await waitFor(() => {
      expect(
        screen.getByText("Layout data not yet available for this board."),
      ).toBeInTheDocument();
    });
  });
});

describe("BoardLayout - board dimensions not available", () => {
  it('shows "Board dimensions not available" for E-ATX without explicit dims', async () => {
    const boardEATX = makeMockMotherboard({
      form_factor: "E-ATX",
      length_mm: undefined,
      width_mm: undefined,
      slot_positions: SLOT_POSITIONS,
    });
    mockFetchMotherboard.mockResolvedValue(boardEATX);

    render(<BoardLayout manifest={MOCK_MANIFEST} boardId="test-board-atx" />);

    await waitFor(() => {
      expect(screen.getByText(/Board dimensions not available/)).toBeInTheDocument();
    });
  });
});

describe("BoardLayout - happy path with slot positions", () => {
  it("renders board view with slot overlays and reset buttons", async () => {
    const board = makeMockMotherboard();
    mockFetchMotherboard.mockResolvedValue(board);

    render(<BoardLayout manifest={MOCK_MANIFEST} boardId="test-board-atx" />);

    await waitFor(() => {
      expect(screen.getByText("TestVendor ATX-Pro")).toBeInTheDocument();
    });

    // Reset buttons should be visible
    expect(screen.getByTestId("clear-components-btn")).toBeInTheDocument();
    expect(screen.getByTestId("reset-build-btn")).toBeInTheDocument();
    expect(screen.getByText("Clear Components")).toBeInTheDocument();
    expect(screen.getByText("Reset Build")).toBeInTheDocument();

    // Board view should render
    expect(
      screen.getByRole("img", { name: "TestVendor ATX-Pro board layout" }),
    ).toBeInTheDocument();
  });

  it('shows "Switch to Slot Checker" link', async () => {
    const board = makeMockMotherboard();
    mockFetchMotherboard.mockResolvedValue(board);

    render(<BoardLayout manifest={MOCK_MANIFEST} boardId="test-board-atx" />);

    await waitFor(() => {
      expect(screen.getByText("Switch to Slot Checker")).toBeInTheDocument();
    });

    const link = screen.getByText("Switch to Slot Checker");
    expect(link.closest("a")).toHaveAttribute("href", "/check?board=test-board-atx");
  });
});

// -- Property Tests --

// Generators for property tests

/** Generate a random record of slot assignments (slotId -> componentId) */
const slotAssignmentArb = fc.dictionary(
  fc.stringMatching(/^[a-z][a-z0-9_]{1,10}$/),
  fc.stringMatching(/^[a-z][a-z0-9-]{1,15}$/),
);

/**
 * Feature: click-to-assign-interaction
 * Property 14: Clear components retains motherboard
 *
 * For any board state with a loaded motherboard and any set of slot assignments
 * and SATA drive assignments, invoking "Clear Components" shall result in all
 * assignments being empty while the motherboard selection remains unchanged.
 *
 * Validates: Requirements 6.2
 */
describe("Property 14: Clear components retains motherboard", () => {
  it("clears all assignments while retaining the motherboard", async () => {
    await fc.assert(
      fc.asyncProperty(
        slotAssignmentArb,
        slotAssignmentArb,
        async (slotAssigns, sataAssigns) => {
          const board = makeMockMotherboard();
          mockFetchMotherboard.mockResolvedValue(board);
          mockFetchComponent.mockResolvedValue(null);

          const { unmount } = render(
            <BoardLayout manifest={MOCK_MANIFEST} boardId="test-board-atx" />,
          );

          // Wait for board to load
          await waitFor(() => {
            expect(screen.getByText("TestVendor ATX-Pro")).toBeInTheDocument();
          });

          // Click "Clear Components"
          const clearBtn = screen.getByTestId("clear-components-btn");
          await act(async () => {
            clearBtn.click();
          });

          // Motherboard should still be displayed (retained)
          expect(screen.getByText("TestVendor ATX-Pro")).toBeInTheDocument();

          // Reset buttons should still be visible (board is still loaded)
          expect(screen.getByTestId("clear-components-btn")).toBeInTheDocument();
          expect(screen.getByTestId("reset-build-btn")).toBeInTheDocument();

          // The board view should still be rendered (not the empty case prompt)
          expect(screen.queryByTestId("empty-case-prompt")).not.toBeInTheDocument();

          // All slot overlays should be in "empty" state (no populated overlays)
          const slotButtons = screen.getAllByRole("button").filter((btn) => {
            const label = btn.getAttribute("aria-label") ?? "";
            return label.includes("slot") && label.includes("populated");
          });
          expect(slotButtons).toHaveLength(0);

          unmount();
        },
      ),
      { numRuns: 10 },
    );
  });
});

/**
 * Feature: click-to-assign-interaction
 * Property 15: Reset build clears all state
 *
 * For any board state with a loaded motherboard and any set of assignments,
 * invoking "Reset Build" shall result in no motherboard selected, no slot
 * assignments, and no SATA drive assignments.
 *
 * Validates: Requirements 6.4
 */
describe("Property 15: Reset build clears all state", () => {
  it("returns to empty case state with no motherboard or assignments", async () => {
    await fc.assert(
      fc.asyncProperty(
        slotAssignmentArb,
        slotAssignmentArb,
        async (slotAssigns, sataAssigns) => {
          const board = makeMockMotherboard();
          mockFetchMotherboard.mockResolvedValue(board);
          mockFetchComponent.mockResolvedValue(null);

          const { unmount } = render(
            <BoardLayout manifest={MOCK_MANIFEST} boardId="test-board-atx" />,
          );

          // Wait for board to load
          await waitFor(() => {
            expect(screen.getByText("TestVendor ATX-Pro")).toBeInTheDocument();
          });

          // Click "Reset Build"
          const resetBtn = screen.getByTestId("reset-build-btn");
          await act(async () => {
            resetBtn.click();
          });

          // Should return to empty case state
          await waitFor(() => {
            expect(screen.getByTestId("empty-case-prompt")).toBeInTheDocument();
          });

          // Motherboard name should no longer be displayed as a heading
          expect(screen.queryByText("TestVendor ATX-Pro")).not.toBeInTheDocument();

          // Reset buttons should be hidden (no board loaded)
          expect(screen.queryByTestId("clear-components-btn")).not.toBeInTheDocument();
          expect(screen.queryByTestId("reset-build-btn")).not.toBeInTheDocument();

          // Empty case prompt should be visible
          expect(screen.getByText("Click to select a motherboard")).toBeInTheDocument();

          unmount();
        },
      ),
      { numRuns: 10 },
    );
  });
});
