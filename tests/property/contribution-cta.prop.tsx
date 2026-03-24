import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import fc from "fast-check";

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

// Mock CheckPageClient to avoid pulling in the full component tree
vi.mock("@/components/CheckPageClient", () => ({
  default: () => <div data-testid="check-page-client-mock">CheckPageClient</div>,
}));

// Mock next/navigation for redirect (used by check page when no params)
vi.mock("next/navigation", async () => {
  const actual = await vi.importActual("next/navigation");
  return {
    ...actual,
    redirect: vi.fn(),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
  };
});

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

/**
 * Helper to render the async SlotCheckerPage server component.
 * Calls it as a function with a mock searchParams Promise containing
 * a board param so it doesn't redirect.
 */
async function renderCheckerPage(): Promise<React.ReactElement> {
  const searchParams = Promise.resolve({ board: "test-board" });
  const element = await SlotCheckerPage({ searchParams });
  return element as React.ReactElement;
}

/**
 * Helper: render a component and return all <section> elements whose
 * aria-label contains "contribute" (case-insensitive).
 */
function getContributionSections(ui: React.ReactElement): HTMLElement[] {
  const { container } = render(ui);
  const allSections = Array.from(container.querySelectorAll("section"));
  return allSections.filter((s) =>
    (s.getAttribute("aria-label") ?? "").toLowerCase().includes("contribute")
  );
}

/**
 * Helper: render a component and return all <a> elements with target="_blank"
 * that live inside contribution sections.
 */
function getExternalCtaLinks(ui: React.ReactElement): HTMLAnchorElement[] {
  const sections = getContributionSections(ui);
  return sections.flatMap((section) =>
    Array.from(
      section.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]')
    )
  );
}

/**
 * Helper: render a component and return all <a> elements inside contribution sections.
 */
function getAllCtaLinks(ui: React.ReactElement): HTMLAnchorElement[] {
  const sections = getContributionSections(ui);
  return sections.flatMap((section) =>
    Array.from(section.querySelectorAll<HTMLAnchorElement>("a"))
  );
}

/** ComponentPicker with empty props to trigger the empty state */
const emptyPickerProps = {
  slotCategory: "m2" as const,
  manifestComponents: [] as never[],
  onSelect: vi.fn(),
  onClose: vi.fn(),
};

// ═══════════════════════════════════════════════════════════════════════════════
// Property 1: CTA sections use semantic HTML with accessible labels
// Feature: contribution-cta, Property 1
// Validates: Requirements 4.1, 4.2
// ═══════════════════════════════════════════════════════════════════════════════

describe("Property 1: CTA sections use semantic HTML with accessible labels", () => {
  it("every contribution section on the Landing Page has a non-empty aria-label", () => {
    const sections = getContributionSections(<Home />);
    expect(sections.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(fc.constantFrom(...sections), (section: HTMLElement) => {
        const label = section.getAttribute("aria-label") ?? "";
        expect(label.trim().length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it("every contribution section on the Checker Page has a non-empty aria-label", async () => {
    const page = await renderCheckerPage();
    const sections = getContributionSections(page);
    expect(sections.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(fc.constantFrom(...sections), (section: HTMLElement) => {
        const label = section.getAttribute("aria-label") ?? "";
        expect(label.trim().length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it("every contribution section in ComponentPicker empty state has a non-empty aria-label", () => {
    const sections = getContributionSections(
      <ComponentPicker {...emptyPickerProps} />
    );
    expect(sections.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(fc.constantFrom(...sections), (section: HTMLElement) => {
        const label = section.getAttribute("aria-label") ?? "";
        expect(label.trim().length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 2: External CTA links have accessible external indication
// Feature: contribution-cta, Property 2
// Validates: Requirements 4.3
// ═══════════════════════════════════════════════════════════════════════════════

describe("Property 2: External CTA links have accessible external indication", () => {
  it("every external link in Landing Page contribution sections has noopener/noreferrer and external indication", () => {
    const links = getExternalCtaLinks(<Home />);
    expect(links.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(fc.constantFrom(...links), (link: HTMLAnchorElement) => {
        const rel = link.getAttribute("rel") ?? "";
        expect(rel).toContain("noopener");
        expect(rel).toContain("noreferrer");

        const accessibleName = (
          link.getAttribute("aria-label") ??
          link.textContent ??
          ""
        ).toLowerCase();
        expect(accessibleName).toMatch(/opens in new tab/i);
      }),
      { numRuns: 100 }
    );
  });

  it("every external link in Checker Page contribution sections has noopener/noreferrer and external indication", async () => {
    const page = await renderCheckerPage();
    const links = getExternalCtaLinks(page);
    expect(links.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(fc.constantFrom(...links), (link: HTMLAnchorElement) => {
        const rel = link.getAttribute("rel") ?? "";
        expect(rel).toContain("noopener");
        expect(rel).toContain("noreferrer");

        const accessibleName = (
          link.getAttribute("aria-label") ??
          link.textContent ??
          ""
        ).toLowerCase();
        expect(accessibleName).toMatch(/opens in new tab/i);
      }),
      { numRuns: 100 }
    );
  });

  it("every external link in ComponentPicker empty state has noopener/noreferrer and external indication", () => {
    const links = getExternalCtaLinks(
      <ComponentPicker {...emptyPickerProps} />
    );
    expect(links.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(fc.constantFrom(...links), (link: HTMLAnchorElement) => {
        const rel = link.getAttribute("rel") ?? "";
        expect(rel).toContain("noopener");
        expect(rel).toContain("noreferrer");

        const accessibleName = (
          link.getAttribute("aria-label") ??
          link.textContent ??
          ""
        ).toLowerCase();
        expect(accessibleName).toMatch(/opens in new tab/i);
      }),
      { numRuns: 100 }
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 3: Rendered GitHub URLs match centralized configuration
// Feature: contribution-cta, Property 3
// Validates: Requirements 5.1, 5.2
// ═══════════════════════════════════════════════════════════════════════════════

describe("Property 3: Rendered GitHub URLs match centralized configuration", () => {
  const allowedUrls = [GITHUB_REPO_URL, GITHUB_ISSUES_URL, GITHUB_CONTRIBUTING_URL];

  it("every link in Landing Page contribution sections has an href matching a centralized URL constant", () => {
    const links = getAllCtaLinks(<Home />);
    expect(links.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(fc.constantFrom(...links), (link: HTMLAnchorElement) => {
        const href = link.getAttribute("href") ?? "";
        expect(allowedUrls).toContain(href);
      }),
      { numRuns: 100 }
    );
  });

  it("every link in Checker Page contribution sections has an href matching a centralized URL constant", async () => {
    const page = await renderCheckerPage();
    const links = getAllCtaLinks(page);
    expect(links.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(fc.constantFrom(...links), (link: HTMLAnchorElement) => {
        const href = link.getAttribute("href") ?? "";
        expect(allowedUrls).toContain(href);
      }),
      { numRuns: 100 }
    );
  });

  it("every link in ComponentPicker empty state contribution sections has an href matching a centralized URL constant", () => {
    const links = getAllCtaLinks(<ComponentPicker {...emptyPickerProps} />);
    expect(links.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(fc.constantFrom(...links), (link: HTMLAnchorElement) => {
        const href = link.getAttribute("href") ?? "";
        expect(allowedUrls).toContain(href);
      }),
      { numRuns: 100 }
    );
  });
});
