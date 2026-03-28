// Unit tests for component-browser edge cases:
// - Empty manifests
// - Missing JSON 404s
// - Missing spec fields rendering as dash
// - Semantic markup
// - Heading hierarchy
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// -- Mock next/link -----------------------------------------------------------
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// -- Mock next/navigation -----------------------------------------------------
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// -- Mock react-icons ---------------------------------------------------------
vi.mock("react-icons/fi", () => ({
  FiArrowLeft: () => <span data-testid="icon-arrow-left" />,
  FiExternalLink: () => <span data-testid="icon-external-link" />,
  FiSearch: () => <span data-testid="icon-search" />,
  FiChevronUp: () => <span data-testid="icon-chevron-up" />,
  FiChevronDown: () => <span data-testid="icon-chevron-down" />,
  FiCpu: () => <span data-testid="icon-cpu" />,
  FiGrid: () => <span data-testid="icon-grid" />,
  FiHardDrive: () => <span data-testid="icon-hard-drive" />,
  FiServer: () => <span data-testid="icon-server" />,
  FiDisc: () => <span data-testid="icon-disc" />,
}));

// -- Mock node:fs for detail pages --------------------------------------------
const mockReadFile = vi.fn();
vi.mock("node:fs", () => {
  const mod = {
    promises: {
      readFile: (...args: unknown[]) => mockReadFile(...args),
    },
  };
  return { ...mod, default: mod };
});

// -- Mock supabase-queries for MotherboardTable -------------------------------
vi.mock("../../src/lib/supabase-queries", () => ({
  fetchMotherboardPage: vi.fn(),
  fetchFilterOptions: vi.fn(),
  assembleMotherboard: vi.fn(),
  fetchMotherboardFromSupabase: vi.fn(),
  fetchComponentFromSupabase: vi.fn(),
}));

import {
  fetchMotherboardPage,
  fetchFilterOptions,
} from "../../src/lib/supabase-queries";

const mockedFetchPage = fetchMotherboardPage as ReturnType<typeof vi.fn>;
const mockedFetchFilters = fetchFilterOptions as ReturnType<typeof vi.fn>;

// -- Import components under test after mocks ---------------------------------
import ComponentTable from "../../src/components/ComponentTable";
import MotherboardTable from "../../src/components/MotherboardTable";
import BoardDetailPage from "../../src/app/boards/[id]/page";
import ComponentDetailPage from "../../src/app/components/[id]/page";

import type { ComponentSummary } from "../../src/lib/types";

// =============================================================================
// 1. Empty manifests
// =============================================================================

describe("Empty manifests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("ComponentTable renders empty-state message when given an empty array", () => {
    const { container } = render(<ComponentTable components={[]} />);
    const text = container.textContent ?? "";
    expect(text).toContain("No components are available");
  });

  it("MotherboardTable renders empty-state message when given an empty array", async () => {
    mockedFetchPage.mockResolvedValue({ rows: [], totalCount: 0 });
    mockedFetchFilters.mockResolvedValue({
      manufacturers: [],
      chipsets: [],
    });

    const onSelectBoard = vi.fn();
    const { container } = render(
      <MotherboardTable selectedBoardId={null} onSelectBoard={onSelectBoard} />
    );

    await waitFor(() => {
      const text = container.textContent ?? "";
      expect(text).toContain("No motherboards found");
    });
  });
});

// =============================================================================
// 2. Missing JSON 404s
// =============================================================================

describe("Missing JSON 404s", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("Board detail page renders 'Motherboard not found' when JSON file does not exist", async () => {
    mockReadFile.mockRejectedValueOnce(new Error("ENOENT: no such file"));
    const jsx = await BoardDetailPage({
      params: Promise.resolve({ id: "nonexistent-board" }),
    });
    const { container } = render(<>{jsx}</>);
    const text = container.textContent ?? "";

    expect(text).toContain("Motherboard not found");

    const backLink = container.querySelector('a[href="/boards"]');
    expect(backLink).toBeTruthy();
  });

  it("Component detail page renders 'Component not found' when JSON file does not exist", async () => {
    mockReadFile.mockRejectedValueOnce(new Error("ENOENT: no such file"));
    const jsx = await ComponentDetailPage({
      params: Promise.resolve({ id: "nonexistent-component" }),
    });
    const { container } = render(<>{jsx}</>);
    const text = container.textContent ?? "";

    expect(text).toContain("Component not found");

    const backLink = container.querySelector('a[href="/components"]');
    expect(backLink).toBeTruthy();
  });
});

// =============================================================================
// 3. Missing spec fields rendering as dash
// =============================================================================

describe("Missing spec fields rendering as dash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("ComponentTable renders '-' for null/undefined spec values", () => {
    const components: ComponentSummary[] = [
      {
        id: "cpu-test-missing-specs",
        type: "cpu",
        manufacturer: "TestVendor",
        model: "Test CPU",
        specs: {
          socket: null,
          microarchitecture: undefined,
          pcie_gen: null,
        },
      },
    ];

    const { container } = render(<ComponentTable components={components} />);

    // Filter by cpu type to show spec columns
    const typeSelect = container.querySelector(
      'select[aria-label="Filter by component type"]'
    ) as HTMLSelectElement;
    expect(typeSelect).toBeTruthy();

    fireEvent.change(typeSelect, { target: { value: "cpu" } });

    // After filtering, the spec cells should show "-"
    const tds = Array.from(container.querySelectorAll("td"));
    const dashCells = tds.filter((td) => td.textContent === "-");
    expect(dashCells.length).toBeGreaterThanOrEqual(1);
  });

  it("Component detail page renders '-' for missing optional CPU fields", async () => {
    const cpuWithMissingFields = {
      id: "test-cpu-minimal",
      type: "cpu",
      manufacturer: "AMD",
      model: "Ryzen Test",
      socket: "AM5",
      microarchitecture: "Zen 4",
      architecture: "Zen 4",
      pcie_config: { cpu_gen: 5 },
      // cores, threads, tdp_w are intentionally omitted
      schema_version: "1.0",
    };

    mockReadFile.mockResolvedValueOnce(JSON.stringify(cpuWithMissingFields));
    const jsx = await ComponentDetailPage({
      params: Promise.resolve({ id: "test-cpu-minimal" }),
    });
    const { container } = render(<>{jsx}</>);
    const text = container.textContent ?? "";

    // The dash helper renders "-" for undefined/null values
    // Cores, Threads, and TDP should all show "-"
    const dds = Array.from(container.querySelectorAll("dd"));
    const coresDD = dds.find(
      (dd) =>
        dd.previousElementSibling?.textContent === "Cores"
    );
    const threadsDD = dds.find(
      (dd) =>
        dd.previousElementSibling?.textContent === "Threads"
    );
    const tdpDD = dds.find(
      (dd) =>
        dd.previousElementSibling?.textContent === "TDP"
    );

    expect(coresDD?.textContent).toBe("-");
    expect(threadsDD?.textContent).toBe("-");
    expect(tdpDD?.textContent).toBe("-");
  });
});


// =============================================================================
// 4. Semantic markup
// =============================================================================

describe("Semantic markup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("ComponentTable uses table, thead, th, tbody, tr elements", () => {
    const components: ComponentSummary[] = [
      {
        id: "cpu-test-semantic",
        type: "cpu",
        manufacturer: "AMD",
        model: "Ryzen 7 9700X",
        specs: { socket: "AM5", microarchitecture: "Zen 5", pcie_gen: 5 },
      },
    ];

    const { container } = render(<ComponentTable components={components} />);

    expect(container.querySelector("table")).toBeTruthy();
    expect(container.querySelector("thead")).toBeTruthy();
    expect(container.querySelector("th")).toBeTruthy();
    expect(container.querySelector("tbody")).toBeTruthy();
    expect(container.querySelector("tbody tr")).toBeTruthy();
  });

  it("Board detail page uses table elements for M.2, PCIe, and SATA sections", async () => {
    const board = {
      id: "test-board-semantic",
      manufacturer: "ASUS",
      model: "ROG Test",
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
      m2_slots: [
        {
          id: "m2_1",
          label: "M.2_1",
          interface: "PCIe",
          gen: 5,
          lanes: 4,
          form_factors: ["2280"],
          source: "CPU",
          supports_sata: false,
          heatsink_included: false,
          sharing: null,
        },
      ],
      pcie_slots: [
        {
          id: "pcie_1",
          label: "PCIEX16",
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
        { id: "sata_1", version: "SATA III", source: "Chipset", disabled_by: null },
      ],
      sources: [],
      schema_version: "1.0",
    };

    mockReadFile.mockResolvedValueOnce(JSON.stringify(board));
    const jsx = await BoardDetailPage({
      params: Promise.resolve({ id: "test-board-semantic" }),
    });
    const { container } = render(<>{jsx}</>);

    const tables = container.querySelectorAll("table");
    // M.2, PCIe, and SATA sections each render a table
    expect(tables.length).toBe(3);

    // Each table has thead and tbody
    for (const table of Array.from(tables)) {
      expect(table.querySelector("thead")).toBeTruthy();
      expect(table.querySelector("th")).toBeTruthy();
      expect(table.querySelector("tbody")).toBeTruthy();
    }
  });
});

// =============================================================================
// 5. Heading hierarchy
// =============================================================================

describe("Heading hierarchy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("Board detail page uses h1 for board name and h2 for sections", async () => {
    const board = {
      id: "test-board-headings",
      manufacturer: "MSI",
      model: "MAG B650",
      chipset: "B650",
      socket: "AM5",
      form_factor: "ATX",
      memory: {
        type: "DDR5",
        max_speed_mhz: 6000,
        base_speed_mhz: 4800,
        max_capacity_gb: 128,
        ecc_support: false,
        channels: 2,
        slots: [],
        recommended_population: { two_dimm: [] },
      },
      m2_slots: [
        {
          id: "m2_1",
          label: "M.2_1",
          interface: "PCIe",
          gen: 4,
          lanes: 4,
          form_factors: ["2280"],
          source: "Chipset",
          supports_sata: false,
          heatsink_included: false,
          sharing: null,
        },
      ],
      pcie_slots: [
        {
          id: "pcie_1",
          label: "PCIEX16",
          gen: 4,
          electrical_lanes: 16,
          physical_size: "x16",
          position: 1,
          source: "CPU",
          reinforced: false,
          sharing: null,
        },
      ],
      sata_ports: [
        { id: "sata_1", version: "SATA III", source: "Chipset", disabled_by: null },
      ],
      sources: [],
      schema_version: "1.0",
    };

    mockReadFile.mockResolvedValueOnce(JSON.stringify(board));
    const jsx = await BoardDetailPage({
      params: Promise.resolve({ id: "test-board-headings" }),
    });
    const { container } = render(<>{jsx}</>);

    // h1 contains the board name
    const h1 = container.querySelector("h1");
    expect(h1).toBeTruthy();
    expect(h1!.textContent).toContain("MSI");
    expect(h1!.textContent).toContain("MAG B650");

    // h2 headings for each section
    const h2s = Array.from(container.querySelectorAll("h2"));
    const h2Texts = h2s.map((h) => h.textContent ?? "");

    expect(h2Texts).toContain("Memory Configuration");
    expect(h2Texts).toContain("M.2 Slots");
    expect(h2Texts).toContain("PCIe Slots");
    expect(h2Texts).toContain("SATA Ports");
  });

  it("Component detail page uses h1 for component name and h2 for type-specific sections", async () => {
    const gpu = {
      id: "test-gpu-headings",
      type: "gpu",
      chip_manufacturer: "NVIDIA",
      manufacturer: "ASUS",
      model: "RTX 4070 Ti Super",
      interface: { pcie_gen: 4, lanes: 16 },
      physical: { slot_width: 2.5, length_mm: 304, slots_occupied: 3 },
      power: {
        tdp_w: 285,
        recommended_psu_w: 700,
        power_connectors: [{ type: "16-pin", count: 1 }],
      },
      schema_version: "1.0",
    };

    mockReadFile.mockResolvedValueOnce(JSON.stringify(gpu));
    const jsx = await ComponentDetailPage({
      params: Promise.resolve({ id: "test-gpu-headings" }),
    });
    const { container } = render(<>{jsx}</>);

    // h1 contains the component name
    const h1 = container.querySelector("h1");
    expect(h1).toBeTruthy();
    expect(h1!.textContent).toContain("ASUS");
    expect(h1!.textContent).toContain("RTX 4070 Ti Super");

    // h2 headings for GPU-specific sections
    const h2s = Array.from(container.querySelectorAll("h2"));
    expect(h2s.length).toBeGreaterThanOrEqual(1);

    // GPU should have PCIe Interface, Physical Dimensions, Power Requirements
    const h2Texts = h2s.map((h) => h.textContent ?? "");
    expect(h2Texts).toContain("PCIe Interface");
    expect(h2Texts).toContain("Physical Dimensions");
    expect(h2Texts).toContain("Power Requirements");
  });
});
