/**
 * Unit tests for UnderDevelopmentBanner component.
 *
 * Validates: Requirements 1.2, 1.3, 2.1, 2.4, 3.1, 3.2, 3.3
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import UnderDevelopmentBanner from "../UnderDevelopmentBanner";

describe("UnderDevelopmentBanner", () => {
  it("renders with role='status'", () => {
    render(<UnderDevelopmentBanner />);
    const banner = screen.getByRole("status");
    expect(banner).toBeInTheDocument();
  });

  it("contains text about active development and incomplete data", () => {
    render(<UnderDevelopmentBanner />);
    const banner = screen.getByRole("status");
    expect(banner.textContent).toMatch(/active development/i);
    expect(banner.textContent).toMatch(/incomplete/i);
  });

  it("contains an SVG icon with aria-hidden='true'", () => {
    render(<UnderDevelopmentBanner />);
    const banner = screen.getByRole("status");
    const svg = banner.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("text is real DOM text content (not an image)", () => {
    render(<UnderDevelopmentBanner />);
    const banner = screen.getByRole("status");
    // Verify there are no <img> elements — text is rendered as real DOM text
    expect(banner.querySelector("img")).toBeNull();
    // Verify the banner has meaningful text content
    expect(banner.textContent!.trim().length).toBeGreaterThan(0);
  });

  it("does not contain a button element", () => {
    render(<UnderDevelopmentBanner />);
    const banner = screen.getByRole("status");
    expect(banner.querySelector("button")).toBeNull();
  });

  it("does not have fixed or sticky positioning classes", () => {
    render(<UnderDevelopmentBanner />);
    const banner = screen.getByRole("status");
    expect(banner.className).not.toMatch(/\bfixed\b/);
    expect(banner.className).not.toMatch(/\bsticky\b/);
  });
});
