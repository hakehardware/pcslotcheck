import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import CpuImpactPanel from "../../src/components/CpuImpactPanel";
import type { CpuImpactResult } from "../../src/lib/cpu-utils";

const compatibleNoDowngrades: CpuImpactResult = {
  socketMatch: true,
  cpuSocket: "AM5",
  motherboardSocket: "AM5",
  slotImpacts: [],
  overallStatus: "compatible",
};

const socketMismatch: CpuImpactResult = {
  socketMatch: false,
  cpuSocket: "LGA1700",
  motherboardSocket: "AM5",
  slotImpacts: [],
  overallStatus: "error",
};

const compatibleWithDowngrades: CpuImpactResult = {
  socketMatch: true,
  cpuSocket: "AM5",
  motherboardSocket: "AM5",
  slotImpacts: [
    {
      slotId: "m2_1",
      slotLabel: "M2_1 (CPU)",
      source: "CPU",
      baseGen: 5,
      effectiveGen: 4,
      baseLanes: 4,
      effectiveLanes: 4,
      hasGenDowngrade: true,
      hasLaneReduction: false,
    },
    {
      slotId: "pcie_1",
      slotLabel: "PCIEX16_1 (CPU)",
      source: "CPU",
      baseGen: 5,
      effectiveGen: 4,
      baseLanes: 16,
      effectiveLanes: 8,
      hasGenDowngrade: true,
      hasLaneReduction: true,
    },
  ],
  overallStatus: "warning",
};

describe("CpuImpactPanel", () => {
  it("renders socket-compatible message when socketMatch is true", () => {
    render(<CpuImpactPanel impact={compatibleNoDowngrades} />);
    expect(screen.getByText("Socket compatible (AM5)")).toBeInTheDocument();
  });

  it("renders socket-error message with both socket names when socketMatch is false", () => {
    render(<CpuImpactPanel impact={socketMismatch} />);
    expect(
      screen.getByText(
        "Socket mismatch: CPU is LGA1700, motherboard is AM5"
      )
    ).toBeInTheDocument();
  });

  it('renders "no downgrades" message when slotImpacts is empty and socket matches', () => {
    render(<CpuImpactPanel impact={compatibleNoDowngrades} />);
    expect(
      screen.getByText("No slot downgrades detected")
    ).toBeInTheDocument();
  });

  it("renders socket compatibility as the first item in the panel", () => {
    render(<CpuImpactPanel impact={compatibleWithDowngrades} />);
    const region = screen.getByRole("region", {
      name: "CPU impact summary",
    });
    const items = within(region).getAllByText(/.+/);
    // First text content should be the socket line
    expect(items[0].textContent).toContain("Socket compatible");
  });

  it("renders per-slot impact items for affected slots", () => {
    render(<CpuImpactPanel impact={compatibleWithDowngrades} />);
    expect(
      screen.getByText("M2_1 (CPU): Gen5 to Gen4")
    ).toBeInTheDocument();
    expect(
      screen.getByText("PCIEX16_1 (CPU): Gen5 to Gen4, x16 to x8")
    ).toBeInTheDocument();
  });

  it("does not render no-downgrades message when there are slot impacts", () => {
    render(<CpuImpactPanel impact={compatibleWithDowngrades} />);
    expect(
      screen.queryByText("No slot downgrades detected")
    ).not.toBeInTheDocument();
  });

  it("does not render no-downgrades message on socket mismatch", () => {
    render(<CpuImpactPanel impact={socketMismatch} />);
    expect(
      screen.queryByText("No slot downgrades detected")
    ).not.toBeInTheDocument();
  });
});
