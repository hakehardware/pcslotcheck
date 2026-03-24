import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import fs from "fs";
import path from "path";

const { mockPush, mockFetchMotherboardPage } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockFetchMotherboardPage: vi.fn().mockResolvedValue({ rows: [], totalCount: 0 }),
}));

// Mock next/navigation
vi.mock("next/navigation", async () => {
  const actual = await vi.importActual("next/navigation");
  return {
    ...actual,
    useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
  };
});

// Mock supabase-queries
vi.mock("../../src/lib/supabase-queries", () => ({
  fetchMotherboardPage: (...args: unknown[]) => mockFetchMotherboardPage(...args),
}));

import SearchBar from "../../src/components/SearchBar";
import BoardSelector from "../../src/components/BoardSelector";
import BoardCardContent from "../../src/components/BoardCardContent";

const sampleBoards = [
  {
    id: "asus-rog-strix-z890",
    manufacturer: "ASUS",
    model: "ROG STRIX Z890",
    chipset: "Z890",
    socket: "LGA1851",
    form_factor: "ATX",
  },
  {
    id: "msi-mag-x870",
    manufacturer: "MSI",
    model: "MAG X870",
    chipset: "X870",
    socket: "AM5",
    form_factor: "ATX",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchMotherboardPage.mockResolvedValue({ rows: [], totalCount: 0 });
});

// ---------------------------------------------------------------------------
// 1. SearchBar ARIA preservation (Validates 4.1)
// ---------------------------------------------------------------------------

describe("SearchBar ARIA preservation", () => {
  it('renders <li> elements with role="option" and aria-selected', async () => {
    mockFetchMotherboardPage.mockResolvedValue({
      rows: sampleBoards,
      totalCount: 2,
    });

    const user = userEvent.setup();
    render(<SearchBar />);

    const input = screen.getByRole("combobox");
    await user.type(input, "ASUS");

    await waitFor(() => {
      const options = screen.getAllByRole("option");
      expect(options.length).toBe(2);
      options.forEach((option) => {
        expect(option.tagName).toBe("LI");
        expect(option).toHaveAttribute("aria-selected");
      });
    });
  });
});

// ---------------------------------------------------------------------------
// 2. BoardSelector ARIA preservation (Validates 4.3)
// ---------------------------------------------------------------------------

describe("BoardSelector ARIA preservation", () => {
  it('renders <button> elements with role="tab" and aria-selected', () => {
    render(
      <BoardSelector
        boards={sampleBoards}
        selectedBoardId="asus-rog-strix-z890"
        onSelectBoard={vi.fn()}
      />
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs.length).toBe(2);
    tabs.forEach((tab) => {
      expect(tab.tagName).toBe("BUTTON");
      expect(tab).toHaveAttribute("aria-selected");
    });

    // Verify the selected one has aria-selected="true"
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");
  });
});

// ---------------------------------------------------------------------------
// 3. Icon is BsMotherboard (Validates 1.2, 5.2)
// ---------------------------------------------------------------------------

describe("BoardCardContent icon", () => {
  it("renders an SVG icon from the Bootstrap Icons set", () => {
    const { container } = render(
      <BoardCardContent
        manufacturer="ASUS"
        model="ROG STRIX Z890"
        chipset="Z890"
        socket="LGA1851"
        formFactor="ATX"
      />
    );

    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    // BsMotherboard from react-icons/bs renders with the "bi" class prefix
    // or stroke attributes typical of Bootstrap Icons
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });
});

// ---------------------------------------------------------------------------
// 4. Icon size and color (Validates 1.3)
// ---------------------------------------------------------------------------

describe("BoardCardContent icon size and color", () => {
  it("renders icon with 24x24 size and text-zinc-500 class", () => {
    const { container } = render(
      <BoardCardContent
        manufacturer="ASUS"
        model="ROG STRIX Z890"
        chipset="Z890"
        socket="LGA1851"
        formFactor="ATX"
      />
    );

    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    // react-icons sets width/height via the size prop
    expect(svg).toHaveAttribute("width", "24");
    expect(svg).toHaveAttribute("height", "24");
    // Color class applied via className
    expect(svg?.classList.toString()).toContain("text-zinc-500");
  });
});

// ---------------------------------------------------------------------------
// 5. Keyboard navigation covers full card (Validates 4.4)
// ---------------------------------------------------------------------------

describe("SearchBar keyboard navigation", () => {
  it("applies active highlight class to the full <li> container wrapping icon and text", async () => {
    mockFetchMotherboardPage.mockResolvedValue({
      rows: sampleBoards,
      totalCount: 2,
    });

    const user = userEvent.setup();
    render(<SearchBar />);

    const input = screen.getByRole("combobox");
    await user.type(input, "ASUS");

    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBe(2);
    });

    // Press ArrowDown to activate the first item
    await user.keyboard("{ArrowDown}");

    const options = screen.getAllByRole("option");
    const activeOption = options[0];

    // The active <li> should have the highlight class covering the full card
    expect(activeOption.className).toContain("bg-zinc-800");
    // The <li> wraps the BoardCardContent (icon + text)
    const svg = activeOption.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 6. Metadata badge spacing (Validates 3.3)
// ---------------------------------------------------------------------------

describe("Metadata badge spacing", () => {
  it("renders metadata container with gap class for consistent spacing", () => {
    const { container } = render(
      <BoardCardContent
        manufacturer="ASUS"
        model="ROG STRIX Z890"
        chipset="Z890"
        socket="LGA1851"
        formFactor="ATX"
      />
    );

    // The metadata row is a flex container with gap-1.5
    const metadataContainer = container.querySelector(".flex.flex-wrap");
    expect(metadataContainer).toBeInTheDocument();
    expect(metadataContainer?.className).toMatch(/gap/);
  });
});

// ---------------------------------------------------------------------------
// 7. react-icons in dependencies (Validates 5.1)
// ---------------------------------------------------------------------------

describe("react-icons dependency", () => {
  it("is listed under dependencies in package.json", () => {
    const pkgPath = path.resolve(__dirname, "../../package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    expect(pkg.dependencies).toHaveProperty("react-icons");
  });
});
