// Feature: component-browser, Property 1: Active nav link matches current route
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import fc from "fast-check";

// -- Mock next/link to render a plain <a> tag --
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

// -- Mock next/navigation with a controllable usePathname --
let mockPathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

import NavBar from "../../src/components/NavBar";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/boards", label: "Boards" },
  { href: "/components", label: "Components" },
  { href: "/contribute", label: "Contribute" },
  { href: "/support", label: "Support" },
] as const;

/**
 * Check if an element has an exact CSS class token (not a substring match).
 * This avoids false positives like "hover:text-zinc-50" matching "text-zinc-50".
 */
function hasExactClass(el: HTMLElement, cls: string): boolean {
  return el.classList.contains(cls);
}

/**
 * Helper: render NavBar with a given pathname and return the link elements.
 */
function renderNavBar(pathname: string) {
  mockPathname = pathname;
  const { container, unmount } = render(<NavBar />);
  // NavBar renders links inside <ul> > <li> > <a>
  const navLinks = Array.from(container.querySelectorAll("ul a")) as HTMLAnchorElement[];
  return { navLinks, unmount };
}

/**
 * Determine which link should be active for a given pathname,
 * mirroring the NavBar logic exactly.
 */
function expectedActiveHref(pathname: string): string | null {
  for (const link of NAV_LINKS) {
    const isActive =
      link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
    if (isActive) return link.href;
  }
  return null;
}

// -- Arbitraries --

// Generate a pathname that exactly matches one of the nav link hrefs
const exactNavPathArb = fc.constantFrom("/", "/boards", "/components", "/support");

// Generate a sub-route pathname under one of the non-root nav links
// e.g. /boards/something, /components/cpu-123, /support/faq
const subRouteSegmentArb = fc
  .stringMatching(/^[a-z0-9][a-z0-9-]{0,20}$/)
  .filter((s) => s.length >= 1);

const subRoutePathArb = fc
  .tuple(
    fc.constantFrom("/boards", "/components", "/support"),
    subRouteSegmentArb
  )
  .map(([base, segment]) => `${base}/${segment}`);

// Generate a pathname that does NOT match any nav link
// (not "/" and not starting with /boards, /components, or /support)
const unmatchedPathArb = fc
  .stringMatching(/^\/[a-z][a-z0-9-]{0,20}$/)
  .filter(
    (p) =>
      p !== "/" &&
      !p.startsWith("/boards") &&
      !p.startsWith("/components") &&
      !p.startsWith("/support")
  );

// Combined arbitrary covering all cases
const anyPathnameArb = fc.oneof(exactNavPathArb, subRoutePathArb, unmatchedPathArb);

// ═══════════════════════════════════════════════════════════════════════════════
// Property 1: Active nav link matches current route
// Feature: component-browser, Property 1: Active nav link matches current route
// Validates: Requirements 1.3, 1.4
// ═══════════════════════════════════════════════════════════════════════════════

describe("Property 1: Active nav link matches current route", () => {
  afterEach(() => {
    cleanup();
  });

  it("for any pathname matching a nav link, that link gets text-zinc-50 and others get text-zinc-400", () => {
    fc.assert(
      fc.property(anyPathnameArb, (pathname) => {
        const { navLinks, unmount } = renderNavBar(pathname);
        const activeHref = expectedActiveHref(pathname);

        for (const link of navLinks) {
          const href = link.getAttribute("href");

          if (href === activeHref) {
            expect(hasExactClass(link, "text-zinc-50")).toBe(true);
            expect(hasExactClass(link, "text-zinc-400")).toBe(false);
          } else {
            expect(hasExactClass(link, "text-zinc-400")).toBe(true);
            expect(hasExactClass(link, "text-zinc-50")).toBe(false);
          }
        }

        unmount();
      }),
      { numRuns: 100 }
    );
  });

  it("sub-routes activate the correct parent nav link (e.g. /search/something activates Motherboards)", () => {
    fc.assert(
      fc.property(subRoutePathArb, (pathname) => {
        const { navLinks, unmount } = renderNavBar(pathname);
        const activeHref = expectedActiveHref(pathname);

        // A sub-route should always match one of the non-root links
        expect(activeHref).not.toBeNull();

        for (const link of navLinks) {
          const href = link.getAttribute("href");

          if (href === activeHref) {
            expect(hasExactClass(link, "text-zinc-50")).toBe(true);
          } else {
            expect(hasExactClass(link, "text-zinc-400")).toBe(true);
          }
        }

        unmount();
      }),
      { numRuns: 100 }
    );
  });

  it("exactly one link is active when pathname matches a nav route", () => {
    fc.assert(
      fc.property(
        fc.oneof(exactNavPathArb, subRoutePathArb),
        (pathname) => {
          const { navLinks, unmount } = renderNavBar(pathname);

          const activeLinks = navLinks.filter((link) =>
            hasExactClass(link, "text-zinc-50")
          );
          expect(activeLinks.length).toBe(1);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("no link is active when pathname does not match any nav route", () => {
    fc.assert(
      fc.property(unmatchedPathArb, (pathname) => {
        const { navLinks, unmount } = renderNavBar(pathname);

        const activeLinks = navLinks.filter((link) =>
          hasExactClass(link, "text-zinc-50")
        );
        expect(activeLinks.length).toBe(0);

        const inactiveLinks = navLinks.filter((link) =>
          hasExactClass(link, "text-zinc-400")
        );
        expect(inactiveLinks.length).toBe(NAV_LINKS.length);

        unmount();
      }),
      { numRuns: 100 }
    );
  });
});
