import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import fc from "fast-check";

import BoardCardContent from "../../src/components/BoardCardContent";
import MetadataBadge from "../../src/components/MetadataBadge";

// =============================================================================
// Feature: search-card-redesign, Property 1: BoardCardContent renders all board data fields
// Validates: Requirements 1.1, 1.4, 2.1, 2.2, 2.3, 2.4, 4.2
// =============================================================================

const boardDataArb = fc.record({
  manufacturer: fc.string({ minLength: 1 }),
  model: fc.string({ minLength: 1 }),
  chipset: fc.string({ minLength: 1 }),
  socket: fc.string({ minLength: 1 }),
  formFactor: fc.string({ minLength: 1 }),
});

describe("Property 1: BoardCardContent renders all board data fields", () => {
  it("renders all five board data values in the text content", () => {
    fc.assert(
      fc.property(boardDataArb, (data) => {
        const { container } = render(<BoardCardContent {...data} />);
        const text = container.textContent ?? "";

        expect(text).toContain(data.manufacturer);
        expect(text).toContain(data.model);
        expect(text).toContain(data.chipset);
        expect(text).toContain(data.socket);
        expect(text).toContain(data.formFactor);
      }),
      { numRuns: 100 }
    );
  });

  it("renders the icon with aria-hidden='true'", () => {
    fc.assert(
      fc.property(boardDataArb, (data) => {
        const { container } = render(<BoardCardContent {...data} />);
        const svg = container.querySelector("svg");

        expect(svg).not.toBeNull();
        expect(svg!.getAttribute("aria-hidden")).toBe("true");
      }),
      { numRuns: 100 }
    );
  });

  it("uses a horizontal flex layout container", () => {
    fc.assert(
      fc.property(boardDataArb, (data) => {
        const { container } = render(<BoardCardContent {...data} />);
        const flexContainer = container.firstElementChild as HTMLElement;

        expect(flexContainer).not.toBeNull();
        expect(flexContainer.className).toContain("flex");
        expect(flexContainer.className).toContain("items-center");
      }),
      { numRuns: 100 }
    );
  });
});
// =============================================================================
// Feature: search-card-redesign, Property 2: MetadataBadge renders label with pill styling
// Validates: Requirements 3.1, 3.2, 3.4
// =============================================================================

describe("Property 2: MetadataBadge renders label with pill styling", () => {
  it("renders a span whose text content equals the label", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (label) => {
        const { container } = render(<MetadataBadge label={label} />);
        const span = container.querySelector("span");

        expect(span).not.toBeNull();
        expect(span!.textContent).toBe(label);
      }),
      { numRuns: 100 }
    );
  });

  it("applies pill styling classes to the span", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (label) => {
        const { container } = render(<MetadataBadge label={label} />);
        const span = container.querySelector("span");

        expect(span).not.toBeNull();
        const classList = span!.className;
        expect(classList).toContain("rounded-full");
        expect(classList).toContain("bg-zinc-800");
        expect(classList).toContain("text-zinc-400");
        expect(classList).toContain("px-2");
      }),
      { numRuns: 100 }
    );
  });
});
