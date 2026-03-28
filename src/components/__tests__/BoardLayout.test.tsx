/**
 * Integration tests for BoardLayout drag-and-drop flow.
 *
 * Validates: Requirements 4.2, 4.8, 8.1, 8.2, 8.3
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
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

// Mock @dnd-kit/react
vi.mock("@dnd-kit/react", () => ({
  DragDropProvider: ({
    children,
  }: {
    children: React.ReactNode;
    onDragEnd?: unknown;
  }) => <>{children}</>,
  DragOverlay: ({
    children,
  }: {
    children: (source: null) => React.ReactNode;
  }) => <>{children(null)}</>,
  useDraggable: () => ({
    ref: () => {},
    isDragging: false,
  }),
  useDroppable: () => ({
    ref: () => {},
    isDropTarget: false,
  }),
}));

import { fetchMotherboardFromSupabase } from "@/lib/supabase-queries";
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
    sata_ports: [],
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
      specs: { "capacity_gb": 2000 },
    },
    {
      id: "ram-1",
      type: "ram",
      manufacturer: "Corsair",
      model: "Vengeance DDR5",
      specs: { "interface.type": "DDR5" },
    },
    {
      id: "cpu-1",
      type: "cpu",
      manufacturer: "Intel",
      model: "i9-14900K",
      specs: { socket: "LGA1700" },
    },
  ],
};

const mockFetchMotherboard = fetchMotherboardFromSupabase as ReturnType<
  typeof vi.fn
>;

beforeEach(() => {
  vi.clearAllMocks();
});

// -- Tests --

describe("BoardLayout - no board selected", () => {
  it("renders board selector when no boardId is provided", () => {
    render(<BoardLayout manifest={MOCK_MANIFEST} />);

    expect(
      screen.getByText("Interactive Board Layout"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Select a motherboard to view its physical layout."),
    ).toBeInTheDocument();
    // BoardSelector renders tabs for each board
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });
});

describe("BoardLayout - loading state", () => {
  it("shows loading indicator while fetching motherboard", () => {
    // Never resolve the fetch so we stay in loading state
    mockFetchMotherboard.mockReturnValue(new Promise(() => {}));

    render(
      <BoardLayout manifest={MOCK_MANIFEST} boardId="test-board-atx" />,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Loading motherboard...")).toBeInTheDocument();
  });
});

describe("BoardLayout - no slot positions", () => {
  it('shows "Layout data not yet available" when motherboard has no slot_positions', async () => {
    const boardNoSlots = makeMockMotherboard({ slot_positions: undefined });
    mockFetchMotherboard.mockResolvedValue(boardNoSlots);

    render(
      <BoardLayout manifest={MOCK_MANIFEST} boardId="test-board-atx" />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Layout data not yet available for this board."),
      ).toBeInTheDocument();
    });

    // Should show link to slot checker
    const link = screen.getByText("Use Slot Checker instead");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute(
      "href",
      "/check?board=test-board-atx",
    );
  });

  it('shows "Layout data not yet available" when slot_positions is empty array', async () => {
    const boardEmptySlots = makeMockMotherboard({ slot_positions: [] });
    mockFetchMotherboard.mockResolvedValue(boardEmptySlots);

    render(
      <BoardLayout manifest={MOCK_MANIFEST} boardId="test-board-atx" />,
    );

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

    render(
      <BoardLayout manifest={MOCK_MANIFEST} boardId="test-board-atx" />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Board dimensions not available/),
      ).toBeInTheDocument();
    });

    const link = screen.getByText("Use Slot Checker instead");
    expect(link.closest("a")).toHaveAttribute(
      "href",
      "/check?board=test-board-atx",
    );
  });
});

describe("BoardLayout - happy path with slot positions", () => {
  it("renders board view with correct number of slot overlays", async () => {
    const board = makeMockMotherboard();
    mockFetchMotherboard.mockResolvedValue(board);

    render(
      <BoardLayout manifest={MOCK_MANIFEST} boardId="test-board-atx" />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("TestVendor ATX-Pro"),
      ).toBeInTheDocument();
    });

    // Board view should render with aria-label
    expect(
      screen.getByRole("img", {
        name: "TestVendor ATX-Pro board layout",
      }),
    ).toBeInTheDocument();

    // Each slot position should produce a SlotOverlay (role="button")
    const slotButtons = screen.getAllByRole("button");
    // 4 slot overlays + sidebar draggable items (4 components)
    // SlotOverlay buttons have aria-labels with slot type info
    const slotOverlays = slotButtons.filter((btn) => {
      const label = btn.getAttribute("aria-label") ?? "";
      return label.includes("slot");
    });
    expect(slotOverlays).toHaveLength(SLOT_POSITIONS.length);
  });

  it('shows "Switch to Slot Checker" link with correct href', async () => {
    const board = makeMockMotherboard();
    mockFetchMotherboard.mockResolvedValue(board);

    render(
      <BoardLayout manifest={MOCK_MANIFEST} boardId="test-board-atx" />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Switch to Slot Checker"),
      ).toBeInTheDocument();
    });

    const link = screen.getByText("Switch to Slot Checker");
    expect(link.closest("a")).toHaveAttribute(
      "href",
      "/check?board=test-board-atx",
    );
  });

  it("renders the I/O panel indicator on the board", async () => {
    const board = makeMockMotherboard();
    mockFetchMotherboard.mockResolvedValue(board);

    render(
      <BoardLayout manifest={MOCK_MANIFEST} boardId="test-board-atx" />,
    );

    await waitFor(() => {
      expect(screen.getByText("I/O")).toBeInTheDocument();
    });
  });
});
