import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

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

// Mock next/navigation (needed because Homepage renders SearchBar which uses useRouter)
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock supabase-queries (needed because Homepage renders SearchBar which calls fetchMotherboardPage)
vi.mock("../../src/lib/supabase-queries", () => ({
  fetchMotherboardFromSupabase: vi.fn(),
  fetchComponentFromSupabase: vi.fn(),
  fetchMotherboardPage: vi.fn().mockResolvedValue({ rows: [], totalCount: 0 }),
  fetchFilterOptions: vi.fn(),
  assembleMotherboard: vi.fn(),
}));

// Mock next/font/google to avoid font loading in tests
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

import SupportPage from "../../src/app/support/page";
import Home from "../../src/app/page";
import RootLayout from "../../src/app/layout";

// ═══════════════════════════════════════════════════════════════════════════════
// 4.2 — Support page content tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("Support page content", () => {
  it('renders with "Support" as h1 heading', () => {
    render(<SupportPage />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Support");
  });

  it("displays three sections with correct headings in order", () => {
    render(<SupportPage />);
    const h2s = screen.getAllByRole("heading", { level: 2 });
    expect(h2s).toHaveLength(3);
    expect(h2s[0]).toHaveTextContent("Tip Directly");
    expect(h2s[1]).toHaveTextContent("Shop Affiliate Links");
    expect(h2s[2]).toHaveTextContent("Follow and Subscribe");
  });

  it("each section contains its exact description text", () => {
    render(<SupportPage />);
    expect(
      screen.getByText(
        "Tips go directly toward lab hardware, upgrades, and producing more content."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Using affiliate links costs you nothing extra\. When you shop through them, a small commission helps fund lab hardware and future content\./
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Subscribing, following, and sharing helps the channel grow and reach more people\. Every follow counts\./
      )
    ).toBeInTheDocument();
  });

  it("each section contains a link with the correct href", () => {
    render(<SupportPage />);
    const coffeeLink = screen.getByRole("link", { name: "Buy Me a Coffee" });
    expect(coffeeLink).toHaveAttribute(
      "href",
      "https://buymeacoffee.com/hakehardware"
    );

    const amazonLink = screen.getByRole("link", { name: "Amazon Storefront" });
    expect(amazonLink).toHaveAttribute(
      "href",
      "https://www.amazon.com/shop/hakehardware"
    );

    const youtubeLink = screen.getByRole("link", {
      name: "Hake Hardware on YouTube",
    });
    expect(youtubeLink).toHaveAttribute(
      "href",
      "https://www.youtube.com/@hakehardware"
    );
  });

  it("affiliate section contains the disclaimer text", () => {
    render(<SupportPage />);
    expect(
      screen.getByText(
        "Affiliate relationships do not influence review scores or recommendations."
      )
    ).toBeInTheDocument();
  });

  it("footer text appears on the page", () => {
    render(<SupportPage />);
    expect(
      screen.getByText(
        /Thank you for being part of the community/
      )
    ).toBeInTheDocument();
  });

  it("heading hierarchy: exactly one h1 and three h2 elements", () => {
    render(<SupportPage />);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    const h2s = screen.getAllByRole("heading", { level: 2 });
    expect(h1s).toHaveLength(1);
    expect(h2s).toHaveLength(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4.3 — Navigation bar tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("Navigation bar", () => {
  it('contains a "Support" link with href /support', () => {
    render(
      <RootLayout>
        <div />
      </RootLayout>
    );
    const nav = screen.getByRole("navigation");
    const supportLink = within(nav).getByRole("link", { name: "Support" });
    expect(supportLink).toHaveAttribute("href", "/support");
  });

  it('displays "Home", "Boards", and "Support" links', () => {
    render(
      <RootLayout>
        <div />
      </RootLayout>
    );
    const nav = screen.getByRole("navigation");
    expect(within(nav).getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(
      within(nav).getByRole("link", { name: "Boards" })
    ).toBeInTheDocument();
    expect(
      within(nav).getByRole("link", { name: "Support" })
    ).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4.4 — Landing page content tests (post-redesign)
// The YouTube link was intentionally removed from the homepage as part of the
// homepage-search-redesign (Requirement 1.12). These tests verify the new
// homepage structure instead.
// ═══════════════════════════════════════════════════════════════════════════════

describe("Landing page content (post-redesign)", () => {
  it("displays the PCSlotCheck title", () => {
    render(<Home />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("PCSlotCheck");
  });

  it("contains a 'browse all motherboards' link to /search", () => {
    render(<Home />);
    const browseLink = screen.getByRole("link", {
      name: /browse all motherboards/i,
    });
    expect(browseLink).toHaveAttribute("href", "/boards");
  });
});
