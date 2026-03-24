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

import SupportPage from "../../src/app/support/page";
import Home from "../../src/app/page";

/**
 * Helper: render a component and return all external <a> elements
 * (those with an href starting with "http").
 */
function getExternalLinks(ui: React.ReactElement): HTMLAnchorElement[] {
  const { container } = render(ui);
  const allAnchors = Array.from(container.querySelectorAll("a"));
  return allAnchors.filter(
    (a) => a.getAttribute("href")?.startsWith("http")
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Property 1: External links open safely in new tabs
// Feature: support-page, Property 1: External links open safely in new tabs
// Validates: Requirements 2.4, 2.5, 3.4, 3.5, 4.4, 4.5, 7.3, 7.4
// ═══════════════════════════════════════════════════════════════════════════════

describe("Property 1: External links open safely in new tabs", () => {
  it("every external link on the Support Page has target=_blank and rel with noopener noreferrer", () => {
    const externalLinks = getExternalLinks(<SupportPage />);
    expect(externalLinks.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(
        fc.constantFrom(...externalLinks),
        (link: HTMLAnchorElement) => {
          expect(link.getAttribute("target")).toBe("_blank");
          const rel = link.getAttribute("rel") ?? "";
          expect(rel).toContain("noopener");
          expect(rel).toContain("noreferrer");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("every external link on the Landing Page has target=_blank and rel with noopener noreferrer", () => {
    const externalLinks = getExternalLinks(<Home />);
    expect(externalLinks.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(
        fc.constantFrom(...externalLinks),
        (link: HTMLAnchorElement) => {
          expect(link.getAttribute("target")).toBe("_blank");
          const rel = link.getAttribute("rel") ?? "";
          expect(rel).toContain("noopener");
          expect(rel).toContain("noreferrer");
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 2: Support page uses semantic HTML structure
// Feature: support-page, Property 2: Support page uses semantic HTML structure
// Validates: Requirements 8.1, 8.3
// ═══════════════════════════════════════════════════════════════════════════════

describe("Property 2: Support page uses semantic HTML structure", () => {
  it("all content sections use <section> elements, headings use h1/h2, body text uses <p>, links use <a>", () => {
    const { container } = render(<SupportPage />);

    fc.assert(
      fc.property(fc.constant(true), () => {
        // Verify sections exist
        const sections = container.querySelectorAll("section");
        expect(sections.length).toBeGreaterThan(0);

        // Verify exactly one <h1>
        const h1s = container.querySelectorAll("h1");
        expect(h1s.length).toBe(1);

        // Verify section headings are <h2>
        const h2s = container.querySelectorAll("h2");
        expect(h2s.length).toBe(sections.length);

        // Each section contains at least one <h2>, one <p>, and one <a>
        sections.forEach((section) => {
          expect(section.querySelectorAll("h2").length).toBeGreaterThanOrEqual(1);
          expect(section.querySelectorAll("p").length).toBeGreaterThanOrEqual(1);
          expect(section.querySelectorAll("a").length).toBeGreaterThanOrEqual(1);
        });
      }),
      { numRuns: 100 }
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 3: External links have descriptive accessible names
// Feature: support-page, Property 3: External links have descriptive accessible names
// Validates: Requirements 8.2
// ═══════════════════════════════════════════════════════════════════════════════

describe("Property 3: External links have descriptive accessible names", () => {
  const genericPatterns = /^(click here|here|link|read more|learn more|more)$/i;

  it("every external link on the Support Page has a non-empty, descriptive text", () => {
    const externalLinks = getExternalLinks(<SupportPage />);
    expect(externalLinks.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(
        fc.constantFrom(...externalLinks),
        (link: HTMLAnchorElement) => {
          const text = (link.textContent ?? "").trim();
          expect(text.length).toBeGreaterThan(0);
          expect(text).not.toMatch(genericPatterns);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("every external link on the Landing Page has a non-empty, descriptive text", () => {
    const externalLinks = getExternalLinks(<Home />);
    expect(externalLinks.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(
        fc.constantFrom(...externalLinks),
        (link: HTMLAnchorElement) => {
          const text = (link.textContent ?? "").trim();
          expect(text.length).toBeGreaterThan(0);
          expect(text).not.toMatch(genericPatterns);
        }
      ),
      { numRuns: 100 }
    );
  });
});
