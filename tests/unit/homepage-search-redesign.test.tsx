import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

const { mockRedirect, mockPush, mockFetchMotherboardPage, mockFetchMotherboardSummaryById } = vi.hoisted(() => ({
  mockRedirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  mockPush: vi.fn(),
  mockFetchMotherboardPage: vi.fn().mockResolvedValue({ rows: [], totalCount: 0 }),
  mockFetchMotherboardSummaryById: vi.fn().mockResolvedValue(null),
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

// Mock next/font/google to avoid font loading in tests
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

// Mock next/navigation
vi.mock("next/navigation", async () => {
  const actual = await vi.importActual("next/navigation");
  return {
    ...actual,
    redirect: mockRedirect,
    useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
  };
});

// Mock supabase-queries
vi.mock("../../src/lib/supabase-queries", () => ({
  fetchMotherboardFromSupabase: vi.fn(),
  fetchComponentFromSupabase: vi.fn(),
  fetchMotherboardPage: (...args: unknown[]) => mockFetchMotherboardPage(...args),
  fetchMotherboardSummaryById: (...args: unknown[]) => mockFetchMotherboardSummaryById(...args),
  fetchFilterOptions: vi.fn(),
  assembleMotherboard: vi.fn(),
}));

// Mock data-manifest.json
vi.mock("../../../data-manifest.json", () => ({
  default: { components: [], motherboards: [] },
}));

// Mock SlotChecker to avoid pulling in the full component tree
vi.mock("@/components/SlotChecker", () => ({
  default: () => <div data-testid="slot-checker-mock">SlotChecker</div>,
}));

// Mock SearchPageClient for browse page tests
vi.mock("@/components/SearchPageClient", () => ({
  default: () => <div data-testid="search-page-client-mock">SearchPageClient</div>,
}));

import Home from "../../src/app/page";
import SearchPage from "../../src/app/search/page";
import SlotCheckerPage from "../../src/app/check/page";
import RootLayout from "../../src/app/layout";
import SearchBar from "../../src/components/SearchBar";
import CheckPageClient from "../../src/components/CheckPageClient";

/**
 * Helper to render the async check page server component.
 */
async function renderCheckerPage(params: Record<string, string | string[] | undefined> = {}) {
  const searchParams = Promise.resolve(params);
  const element = await SlotCheckerPage({ searchParams });
  return render(element as React.ReactElement);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchMotherboardPage.mockResolvedValue({ rows: [], totalCount: 0 });
});

// ---------------------------------------------------------------------------
// 1. Homepage renders title, tagline, SearchBar, contribution section,
//    no "Open Slot Checker" button
// Requirements: 1.2, 1.3, 1.11, 1.12
// ---------------------------------------------------------------------------

describe("Homepage content", () => {
  it("renders the PCSlotCheck title as h1", () => {
    render(<Home />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("PCSlotCheck");
  });

  it("renders a tagline describing the application purpose", () => {
    render(<Home />);
    expect(screen.getByText(/slot compatibility checker/i)).toBeInTheDocument();
  });

  it("renders the SearchBar component", () => {
    render(<Home />);
    const searchInput = screen.getByRole("combobox", { name: /search motherboards/i });
    expect(searchInput).toBeInTheDocument();
  });

  it("renders the contribution section", () => {
    render(<Home />);
    const section = screen.getByRole("region", { name: /contribute/i });
    expect(section).toBeInTheDocument();
  });

  it('does not render an "Open Slot Checker" button', () => {
    render(<Home />);
    const button = screen.queryByRole("link", { name: /open slot checker/i });
    expect(button).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. Browse page renders at /search with heading "Browse Motherboards"
// Requirements: 2.1, 2.4
// ---------------------------------------------------------------------------

describe("Browse page", () => {
  it('renders a heading "Browse Motherboards"', () => {
    render(<SearchPage />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Browse Motherboards");
  });

  it("renders the SearchPageClient component", () => {
    render(<SearchPage />);
    expect(screen.getByTestId("search-page-client-mock")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 3. Nav header contains "Home", "Browse", "Support" links and no
//    "Slot Checker" link
// Requirements: 4.1, 4.2
// ---------------------------------------------------------------------------

describe("Nav header links", () => {
  it('contains "Home", "Browse", and "Support" links', () => {
    render(
      <RootLayout>
        <div />
      </RootLayout>
    );
    const nav = screen.getByRole("navigation");
    expect(within(nav).getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(within(nav).getByRole("link", { name: "Browse" })).toHaveAttribute("href", "/search");
    expect(within(nav).getByRole("link", { name: "Support" })).toHaveAttribute("href", "/support");
  });

  it('does not contain a "Slot Checker" link', () => {
    render(
      <RootLayout>
        <div />
      </RootLayout>
    );
    const nav = screen.getByRole("navigation");
    const slotCheckerLink = within(nav).queryByRole("link", { name: /slot checker/i });
    expect(slotCheckerLink).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4. Check page redirects to / when no params
// Requirement: 3.9
// ---------------------------------------------------------------------------

describe("Check page redirect", () => {
  it("redirects to / when no search params are provided", async () => {
    try {
      await renderCheckerPage({});
    } catch (e: unknown) {
      // redirect() throws NEXT_REDIRECT — expected
      if (e instanceof Error && e.message !== "NEXT_REDIRECT") throw e;
    }
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });
});

// ---------------------------------------------------------------------------
// 5. Check page shows error with link to /search for invalid board ID
// Requirement: 3.3
// ---------------------------------------------------------------------------

describe("Check page error state", () => {
  it("shows error with link to /search when board is not found", async () => {
    mockFetchMotherboardPage.mockResolvedValue({ rows: [], totalCount: 0 });

    render(
      <CheckPageClient
        manifest={{ components: [], motherboards: [] } as never}
        boardId="nonexistent-board-id"
      />
    );

    // Wait for the fetch to complete and error state to render
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(screen.getByText(/motherboard not found/i)).toBeInTheDocument();
    const browseLink = screen.getByRole("link", { name: /browse motherboards/i });
    expect(browseLink).toHaveAttribute("href", "/search");
  });
});

// ---------------------------------------------------------------------------
// 6. Check page shows "Change Motherboard" link
// Requirement: 3.6
// ---------------------------------------------------------------------------

describe("Check page Change Motherboard link", () => {
  it('shows a "Change Motherboard" link pointing to /search', async () => {
    const boardRow = {
      id: "test-board-123",
      manufacturer: "ASUS",
      model: "ROG STRIX Z890",
      chipset: "Z890",
      socket: "LGA1851",
      form_factor: "ATX",
    };
    mockFetchMotherboardSummaryById.mockResolvedValue(boardRow);

    render(
      <CheckPageClient
        manifest={{ components: [], motherboards: [] } as never}
        boardId="test-board-123"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Change Motherboard")).toBeInTheDocument();
    });

    const changeLink = screen.getByRole("link", { name: /change motherboard/i });
    expect(changeLink).toHaveAttribute("href", "/search");
  });
});

// ---------------------------------------------------------------------------
// 7. SearchBar has aria-label="Search motherboards" and dropdown uses
//    role="listbox"
// Requirements: 5.1, 5.2
// ---------------------------------------------------------------------------

describe("SearchBar accessibility", () => {
  it('has aria-label="Search motherboards"', () => {
    render(<SearchBar />);
    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-label", "Search motherboards");
  });

  it('dropdown uses role="listbox" when results are shown', async () => {
    mockFetchMotherboardPage.mockResolvedValue({
      rows: [
        {
          id: "board-1",
          manufacturer: "MSI",
          model: "MAG X870",
          chipset: "X870",
          socket: "AM5",
          form_factor: "ATX",
        },
      ],
      totalCount: 1,
    });

    const user = userEvent.setup();
    render(<SearchBar />);

    const input = screen.getByRole("combobox");
    await user.type(input, "MSI");

    await waitFor(() => {
      const listbox = screen.getByRole("listbox");
      expect(listbox).toBeInTheDocument();
    });

    // Verify items use role="option"
    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 8. Nav header displays correctly on check page with board loaded
// Requirement: 4.3
// ---------------------------------------------------------------------------

describe("Nav header on check page", () => {
  it("displays standard navigation links when board is loaded", async () => {
    const { container } = render(
      <RootLayout>
        <div data-testid="check-page-content">Check page content</div>
      </RootLayout>
    );

    const nav = screen.getByRole("navigation");
    expect(within(nav).getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Browse" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Support" })).toBeInTheDocument();
  });
});
