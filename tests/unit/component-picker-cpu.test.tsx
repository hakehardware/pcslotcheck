import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ComponentPicker from "../../src/components/ComponentPicker";
import type { DataManifest } from "../../src/lib/types";

describe("ComponentPicker CPU-specific specs", () => {
  const cpuManifestEntry: DataManifest["components"][number] = {
    id: "amd-ryzen-7-9700x",
    type: "cpu",
    manufacturer: "AMD",
    model: "Ryzen 7 9700X",
    specs: {
      socket: "AM5",
      microarchitecture: "Zen 5",
      "pcie_config.cpu_gen": 5,
    },
  };

  const baseProps = {
    slotCategory: "memory" as const,
    manifestComponents: [cpuManifestEntry],
    onSelect: vi.fn(),
    onClose: vi.fn(),
  };

  it("renders CPU socket, microarchitecture, and PCIe gen specs", () => {
    // Use a slotCategory that maps to "cpu" type -- we pass "memory" but
    // override manifestComponents to contain a cpu entry. The ComponentPicker
    // filters by SLOT_CATEGORY_TO_COMPONENT_TYPE[slotCategory], so "memory"
    // maps to "ram" and won't show the CPU. We need to test with a category
    // that maps to "cpu". Since ComponentPicker accepts any string for
    // slotCategory via the union, we cast to test the cpu path.
    const { container } = render(
      <ComponentPicker
        {...baseProps}
        slotCategory={"cpu" as "memory"}
        manifestComponents={[cpuManifestEntry]}
      />,
    );

    // The component should render the CPU entry
    expect(screen.getByText(/AMD Ryzen 7 9700X/)).toBeInTheDocument();

    // Check CPU-specific spec labels and values
    expect(screen.getByText(/Socket: AM5/)).toBeInTheDocument();
    expect(screen.getByText(/Arch: Zen 5/)).toBeInTheDocument();
    expect(screen.getByText(/PCIe Gen: Gen 5/)).toBeInTheDocument();
  });

  it("does not render CPU entries when slotCategory is memory", () => {
    render(
      <ComponentPicker
        {...baseProps}
        slotCategory="memory"
        manifestComponents={[cpuManifestEntry]}
      />,
    );

    // memory maps to "ram", so the CPU entry should be filtered out
    expect(screen.queryByText(/AMD Ryzen 7 9700X/)).not.toBeInTheDocument();
    expect(screen.getByText(/No compatible components found/)).toBeInTheDocument();
  });
});
