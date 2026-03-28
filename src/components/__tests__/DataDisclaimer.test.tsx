/**
 * Unit tests for DataDisclaimer component.
 *
 * Validates: Requirements 5.2, 5.3, 5.4, 5.7
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import DataDisclaimer from "../DataDisclaimer";

describe("DataDisclaimer", () => {
  it("renders with role='note'", () => {
    render(<DataDisclaimer />);
    const disclaimer = screen.getByRole("note");
    expect(disclaimer).toBeInTheDocument();
  });

  it("contains text about community-contributed data", () => {
    render(<DataDisclaimer />);
    const disclaimer = screen.getByRole("note");
    expect(disclaimer.textContent).toMatch(/community-contributed/i);
  });

  it("contains text advising to check motherboard manual", () => {
    render(<DataDisclaimer />);
    const disclaimer = screen.getByRole("note");
    expect(disclaimer.textContent).toMatch(/motherboard manual/i);
  });

  it("contains an SVG icon with aria-hidden='true'", () => {
    render(<DataDisclaimer />);
    const disclaimer = screen.getByRole("note");
    const svg = disclaimer.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });
});
