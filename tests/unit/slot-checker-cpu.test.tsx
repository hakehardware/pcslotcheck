import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type { DataManifest, Motherboard } from "../../src/lib/types";

// -- Mocks -------------------------------------------------------------------

// next/navigation
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: () => null,
  }),
}));

// Supabase queries
const mockFetchMotherboard = vi.fn<(id: string) => Promise<Motherboard | null>>();
const mockFetchComponent = vi.fn();
vi.mock("../../src/lib/supabase-queries", () => ({
  fetchMotherboardFromSupabase: (...args: unknown[]) => mockFetchMotherboard(...(args as [string])),
  fetchComponentFromSupabase: (...args: unknown[]) => mockFetchComponent(...args),
  fetchMotherboardPage: vi.fn().mockResolvedValue({ rows: [], totalCount: 0 }),
  fetchFilterOptions: vi.fn().mockResolvedValue({ manufacturers: [], chipsets: [] }),
}));

// Validation engine
vi.mock("../../src/lib/validation-engine", () => ({
  validateAssignments: vi.fn().mockReturnValue([]),
}));

// Sharing
vi.mock("../../src/lib/sharing", () => ({
  encode: vi.fn().mockReturnValue("encoded"),
  decode: vi.fn().mockReturnValue(null),
}));

// UI helpers
vi.mock("../../src/lib/ui-helpers", () => ({
  resolveSharingRules: vi.fn().mockReturnValue({
    disabledSlots: new Set<string>(),
    bandwidthWarnings: new Map<string, string>(),
  }),
  groupSlotsByCategory: vi.fn().mockReturnValue([]),
}));

// CPU utils
vi.mock("../../src/lib/cpu-utils", () => ({
  resolveEffectiveSlotValues: vi.fn().mockReturnValue({ gen: 5, lanes: 4 }),
}));

// Stick utils
vi.mock("../../src/lib/stick-utils", () => ({
  getKitAssignments: vi.fn().mockReturnValue({}),
  getAssignedKitIds: vi.fn().mockReturnValue([]),
}));

// -- Test data ---------------------------------------------------------------

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

const testManifest: DataManifest = {
  motherboards: [
    {
      id: "test-board",
      manufacturer: "ASUS",
      model: "Test Board",
      socket: "AM5",
      chipset: "X870E",
      form_factor: "ATX",
    },
  ],
  components: [
    {
      id: "test-cpu-1",
      type: "cpu",
      manufacturer: "AMD",
      model: "Ryzen 7 9700X",
      specs: {
        socket: "AM5",
        microarchitecture: "Zen 5",
        "pcie_config.cpu_gen": 5,
      },
    },
  ],
};

// -- Tests -------------------------------------------------------------------

describe("SlotChecker CPU integration", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("CPU picker renders inline with correct props when motherboard is loaded", async () => {
    mockFetchMotherboard.mockResolvedValue(testMotherboard);
    mockFetchComponent.mockResolvedValue(null);

    // Dynamic import after mocks are set up
    const { default: SlotChecker } = await import(
      "../../src/components/SlotChecker"
    );

    await act(async () => {
      render(<SlotChecker manifest={testManifest} boardId="test-board" />);
    });

    // Wait for the board to load and the CPU picker to appear
    await waitFor(() => {
      expect(screen.getByText("CPU")).toBeInTheDocument();
    });

    // The collapsed CPU picker should show a "Select CPU" button
    const selectButton = screen.getByRole("button", { name: /select cpu/i });
    expect(selectButton).toBeInTheDocument();

    // Open the CPU picker
    await userEvent.click(selectButton);

    // Verify the CPU component is listed with correct data
    await waitFor(() => {
      expect(screen.getByText(/AMD Ryzen 7 9700X/)).toBeInTheDocument();
    });

    // Verify socket-specific heading is shown (AM5)
    expect(screen.getByText(/Compatible CPUs \(AM5\)/)).toBeInTheDocument();
  });

  it("CPU selection and removal flow works through ComponentPicker", async () => {
    mockFetchMotherboard.mockResolvedValue(testMotherboard);
    mockFetchComponent.mockResolvedValue(null);

    const { default: SlotChecker } = await import(
      "../../src/components/SlotChecker"
    );

    await act(async () => {
      render(<SlotChecker manifest={testManifest} boardId="test-board" />);
    });

    // Wait for the board to load
    await waitFor(() => {
      expect(screen.getByText("CPU")).toBeInTheDocument();
    });

    // Open the CPU picker
    const selectButton = screen.getByRole("button", { name: /select cpu/i });
    await userEvent.click(selectButton);

    // Wait for the CPU to appear in the list
    await waitFor(() => {
      expect(screen.getByText(/AMD Ryzen 7 9700X/)).toBeInTheDocument();
    });

    // Select the CPU by clicking on it
    const cpuOption = screen.getByRole("option");
    await userEvent.click(cpuOption);

    // After selection, the selected-component card should show
    await waitFor(() => {
      expect(screen.getByText(/AMD Ryzen 7 9700X/)).toBeInTheDocument();
    });

    // The remove button should be present
    const removeButton = screen.getByRole("button", { name: /remove/i });
    expect(removeButton).toBeInTheDocument();

    // Click remove to clear the CPU
    await userEvent.click(removeButton);

    // After removal, the "Select CPU" button should reappear
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /select cpu/i })
      ).toBeInTheDocument();
    });
  });
});
