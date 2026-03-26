import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import CpuStatusIcon from "../../src/components/CpuStatusIcon";

describe("CpuStatusIcon", () => {
  it('renders green checkmark icon with correct aria-label for "compatible" status', () => {
    render(<CpuStatusIcon status="compatible" />);
    const icon = screen.getByLabelText("CPU fully compatible");
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveClass("text-green-400");
  });

  it('renders orange warning icon with correct aria-label for "warning" status', () => {
    render(<CpuStatusIcon status="warning" />);
    const icon = screen.getByLabelText("CPU compatible with slot downgrades");
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveClass("text-orange-400");
  });

  it('renders red close icon with correct aria-label for "error" status', () => {
    render(<CpuStatusIcon status="error" />);
    const icon = screen.getByLabelText("CPU socket incompatible");
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveClass("text-red-400");
  });
});
