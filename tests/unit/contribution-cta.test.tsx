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

// Mock next/font/google to avoid font loading in tests
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

// Mock SlotChecker to avoid pulling in the full component tree
vi.mock("@/components/SlotChecker", () => ({
  default: () => <div data-testid="slot-checker-mock">SlotChecker</div>,
}));

// Mock data-manifest.json used by the checker page
vi.mock("../../../data-manifest.json", () => ({
  default: { components: [], motherboards: [] },
}));

import Home from "../../src/app/page";
import SlotCheckerPage from "../../src/app/check/page";
import ComponentPicker from "../../src/components/ComponentPicker";
import {
  GITHUB_REPO_URL,
  GITHUB_ISSUES_URL,
  GITHUB_CONTRIBUTING_URL,
} from "../../src/lib/github-links";

// ═══════════════════════════════════════════════════════════════════════════════
// 6.2 — Landing Page contribution section tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("Landing Page contribution section", () => {
  it('renders a <section> with aria-label containing "Contribute"', () => {
    render(<Home />);
    const section = screen.getByRole("region", { name: /contribute/i });
    expect(section).toBeInTheDocument();
  });

  it("contains a community-driven heading", () => {
    render(<Home />);
    const section = screen.getByRole("region", { name: /contribute/i });
    const heading = within(section).getByRole("heading");
    expect(heading).toHaveTextContent(/community-driven/i);
  });

  it("contains description text about contributing data", () => {
    render(<Home />);
    const section = screen.getByRole("region", { name: /contribute/i });
    expect(within(section).getByText(/motherboard data/i)).toBeInTheDocument();
  });

  it("contains a link to GitHub Issues with correct href", () => {
    render(<Home />);
    const section = screen.getByRole("region", { name: /contribute/i });
    const issuesLink = within(section).getByRole("link", { name: /issue/i });
    expect(issuesLink).toHaveAttribute("href", GITHUB_ISSUES_URL);
  });

  it("contains a link to CONTRIBUTING guide with correct href", () => {
    render(<Home />);
    const section = screen.getByRole("region", { name: /contribute/i });
    const guideLink = within(section).getByRole("link", { name: /contributing guide/i });
    expect(guideLink).toHaveAttribute("href", GITHUB_CONTRIBUTING_URL);
  });

  it('both links have target="_blank" and rel="noopener noreferrer"', () => {
    render(<Home />);
    const section = screen.getByRole("region", { name: /contribute/i });
    const links = within(section).getAllByRole("link");
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6.3 — Checker Page contribution banner tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("Checker Page contribution banner", () => {
  it('renders a <section> with aria-label containing "Contribute"', () => {
    render(<SlotCheckerPage />);
    const section = screen.getByRole("region", { name: /contribute/i });
    expect(section).toBeInTheDocument();
  });

  it("contains help text about finding issues or missing data", () => {
    render(<SlotCheckerPage />);
    const section = screen.getByRole("region", { name: /contribute/i });
    expect(within(section).getByText(/find an issue or missing data/i)).toBeInTheDocument();
  });

  it("contains a link to GitHub Issues with correct href", () => {
    render(<SlotCheckerPage />);
    const section = screen.getByRole("region", { name: /contribute/i });
    const issuesLink = within(section).getByRole("link", { name: /github/i });
    expect(issuesLink).toHaveAttribute("href", GITHUB_ISSUES_URL);
  });

  it("contains a link to CONTRIBUTING guide with correct href", () => {
    render(<SlotCheckerPage />);
    const section = screen.getByRole("region", { name: /contribute/i });
    const guideLink = within(section).getByRole("link", { name: /contributing guide/i });
    expect(guideLink).toHaveAttribute("href", GITHUB_CONTRIBUTING_URL);
  });

  it('both links have target="_blank" and rel="noopener noreferrer"', () => {
    render(<SlotCheckerPage />);
    const section = screen.getByRole("region", { name: /contribute/i });
    const links = within(section).getAllByRole("link");
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6.4 — ComponentPicker empty state prompt tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("ComponentPicker empty state prompt", () => {
  const emptyProps = {
    slotCategory: "m2" as const,
    manifestComponents: [],
    onSelect: vi.fn(),
    onClose: vi.fn(),
  };

  it("shows contribution prompt text when no components match", () => {
    render(<ComponentPicker {...emptyProps} />);
    expect(screen.getByText(/know a compatible component/i)).toBeInTheDocument();
  });

  it("contains a link to GitHub Issues with correct href", () => {
    render(<ComponentPicker {...emptyProps} />);
    const link = screen.getByRole("link", { name: /github/i });
    expect(link).toHaveAttribute("href", GITHUB_ISSUES_URL);
  });

  it('link has target="_blank" and rel="noopener noreferrer"', () => {
    render(<ComponentPicker {...emptyProps} />);
    const link = screen.getByRole("link", { name: /github/i });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6.5 — github-links.ts configuration tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("github-links.ts configuration", () => {
  it("GITHUB_ISSUES_URL ends with /issues", () => {
    expect(GITHUB_ISSUES_URL).toMatch(/\/issues$/);
  });

  it("GITHUB_CONTRIBUTING_URL ends with /CONTRIBUTING.md", () => {
    expect(GITHUB_CONTRIBUTING_URL).toMatch(/\/CONTRIBUTING\.md$/);
  });

  it("all URLs are derived from GITHUB_REPO_URL", () => {
    expect(GITHUB_ISSUES_URL.startsWith(GITHUB_REPO_URL)).toBe(true);
    expect(GITHUB_CONTRIBUTING_URL.startsWith(GITHUB_REPO_URL)).toBe(true);
  });
});
