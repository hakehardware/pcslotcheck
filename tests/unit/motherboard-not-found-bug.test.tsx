import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { MotherboardSummary } from "../../src/lib/types";

// --- Hoisted mock for fetchMotherboardSummaryById ---
const { mockFetchMotherboardSummaryById } = vi.hoisted(() => ({
  mockFetchMotherboardSummaryById: vi.fn(),
}));

// Mock next/link to render a plain <a> tag
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

// Mock supabase-queries -- wire fetchMotherboardSummaryById to the hoisted mock
vi.mock("../../src/lib/supabase-queries", () => ({
  fetchMotherboardSummaryById: (...args: unknown[]) =>
    mockFetchMotherboardSummaryById(...args),
  fetchMotherboardFromSupabase: vi.fn(),
  fetchComponentFromSupabase: vi.fn(),
  fetchMotherboardPage: vi.fn(),
  fetchFilterOptions: vi.fn(),
  assembleMotherboard: vi.fn(),
}));

// Mock SlotChecker to avoid pulling in the full component tree
vi.mock("@/components/SlotChecker", () => ({
  default: () => <div data-testid="slot-checker-mock">SlotChecker</div>,
}));

import CheckPageClient from "../../src/components/CheckPageClient";

// --- Sample data ---
const validSummary: MotherboardSummary = {
  id: "asus-rog-maximus-z890-hero",
  manufacturer: "ASUS",
  model: "ROG MAXIMUS Z890 HERO",
  chipset: "Z890",
  socket: "LGA1851",
  form_factor: "ATX",
};

const emptyManifest = { components: [], motherboards: [] } as never;

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// (a) fetchMotherboardSummaryById returns a valid MotherboardSummary for a known ID
// =============================================================================

describe("fetchMotherboardSummaryById", () => {
  it("returns a valid MotherboardSummary for a known ID", async () => {
    // Import the real module to get the mocked version
    const { fetchMotherboardSummaryById } = await import(
      "../../src/lib/supabase-queries"
    );

    mockFetchMotherboardSummaryById.mockResolvedValue(validSummary);

    const result = await fetchMotherboardSummaryById("asus-rog-maximus-z890-hero");

    expect(mockFetchMotherboardSummaryById).toHaveBeenCalledWith(
      "asus-rog-maximus-z890-hero"
    );
    expect(result).toEqual(validSummary);
    expect(result).toHaveProperty("id", "asus-rog-maximus-z890-hero");
    expect(result).toHaveProperty("manufacturer", "ASUS");
    expect(result).toHaveProperty("model", "ROG MAXIMUS Z890 HERO");
    expect(result).toHaveProperty("chipset", "Z890");
    expect(result).toHaveProperty("socket", "LGA1851");
    expect(result).toHaveProperty("form_factor", "ATX");
  });

  // ===========================================================================
  // (b) returns null for a non-existent ID
  // ===========================================================================

  it("returns null for a non-existent ID", async () => {
    const { fetchMotherboardSummaryById } = await import(
      "../../src/lib/supabase-queries"
    );

    mockFetchMotherboardSummaryById.mockResolvedValue(null);

    const result = await fetchMotherboardSummaryById("nonexistent-board-id");

    expect(mockFetchMotherboardSummaryById).toHaveBeenCalledWith(
      "nonexistent-board-id"
    );
    expect(result).toBeNull();
  });
});

// =============================================================================
// (c) CheckPageClient renders the board header when the summary is found
// =============================================================================

describe("CheckPageClient with valid board", () => {
  it("renders the board manufacturer and model in the header", async () => {
    mockFetchMotherboardSummaryById.mockResolvedValue(validSummary);

    render(
      <CheckPageClient
        manifest={emptyManifest}
        boardId="asus-rog-maximus-z890-hero"
      />
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1 })
      ).toHaveTextContent("ASUS ROG MAXIMUS Z890 HERO");
    });

    // "Change Motherboard" link should point to /search
    const changeLink = screen.getByRole("link", { name: /change motherboard/i });
    expect(changeLink).toHaveAttribute("href", "/search");
  });
});

// =============================================================================
// (d) CheckPageClient renders "Motherboard not found" when the summary is null
// =============================================================================

describe("CheckPageClient with invalid board", () => {
  it('renders "Motherboard not found" when fetchMotherboardSummaryById returns null', async () => {
    mockFetchMotherboardSummaryById.mockResolvedValue(null);

    render(
      <CheckPageClient
        manifest={emptyManifest}
        boardId="nonexistent-board-id"
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(screen.getByText(/motherboard not found/i)).toBeInTheDocument();
    expect(
      screen.getByText(/nonexistent-board-id/i)
    ).toBeInTheDocument();

    const browseLink = screen.getByRole("link", { name: /browse motherboards/i });
    expect(browseLink).toHaveAttribute("href", "/search");
  });
});
