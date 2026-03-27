import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ComponentPicker from "../../src/components/ComponentPicker";
import type { DataManifest } from "../../src/lib/types";

// -- Mock data --

const gpuWithSpecs: DataManifest["components"][number] = {
  id: "nvidia-rtx-4090",
  type: "gpu",
  manufacturer: "NVIDIA",
  model: "RTX 4090",
  specs: {
    "power.tdp_w": 450,
    "interface.pcie_gen": 4,
    "physical.length_mm": 336,
  },
};

const gpuSecond: DataManifest["components"][number] = {
  id: "amd-rx-7900-xtx",
  type: "gpu",
  manufacturer: "AMD",
  model: "RX 7900 XTX",
  specs: {
    "power.tdp_w": 355,
    "interface.pcie_gen": 4,
    "physical.length_mm": 287,
  },
};

const gpuAllNullSpecs: DataManifest["components"][number] = {
  id: "generic-gpu",
  type: "gpu",
  manufacturer: "Generic",
  model: "GPU",
  specs: {
    "power.tdp_w": null,
    "interface.pcie_gen": null,
    "physical.length_mm": null,
  },
};

function makeBaseProps(overrides?: Partial<{
  manifestComponents: DataManifest["components"];
  onSelect: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
}>) {
  return {
    slotCategory: "pcie" as const,
    manifestComponents: overrides?.manifestComponents ?? [gpuWithSpecs, gpuSecond],
    onSelect: overrides?.onSelect ?? vi.fn(),
    onClose: overrides?.onClose ?? vi.fn(),
  };
}

describe("ComponentPicker integration with CompactCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -- Requirement 3.1: CompactCard components appear in search results --
  describe("CompactCard rendering in search results (Req 3.1)", () => {
    it("renders CompactCard with title and spec badges for GPU results", () => {
      const props = makeBaseProps();
      render(<ComponentPicker {...props} />);
      vi.advanceTimersByTime(250);

      // Title text from CompactCard
      expect(screen.getByText("NVIDIA RTX 4090")).toBeInTheDocument();
      expect(screen.getByText("AMD RX 7900 XTX")).toBeInTheDocument();

      // Spec badges rendered via MetadataBadge inside CompactCard
      expect(screen.getByText("TDP: 450W")).toBeInTheDocument();
      // Both GPUs share PCIe Gen 4, so use getAllByText
      expect(screen.getAllByText("PCIe Gen: Gen 4")).toHaveLength(2);
      expect(screen.getByText("Length: 336 mm")).toBeInTheDocument();
    });
  });

  // -- Requirement 3.4: Click selection --
  describe("click selection (Req 3.4)", () => {
    it("calls onSelect with the correct component ID when a result is clicked", () => {
      const onSelect = vi.fn();
      const props = makeBaseProps({ onSelect });
      render(<ComponentPicker {...props} />);
      vi.advanceTimersByTime(250);

      const options = screen.getAllByRole("option");
      fireEvent.click(options[0]);

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith("nvidia-rtx-4090");
    });

    it("calls onSelect with the second component ID when the second result is clicked", () => {
      const onSelect = vi.fn();
      const props = makeBaseProps({ onSelect });
      render(<ComponentPicker {...props} />);
      vi.advanceTimersByTime(250);

      const options = screen.getAllByRole("option");
      fireEvent.click(options[1]);

      expect(onSelect).toHaveBeenCalledWith("amd-rx-7900-xtx");
    });
  });

  // -- Requirement 3.5: Keyboard navigation --
  describe("keyboard navigation (Req 3.5)", () => {
    it("ArrowDown from search input focuses the first list item", () => {
      const props = makeBaseProps();
      render(<ComponentPicker {...props} />);
      vi.advanceTimersByTime(250);

      const searchInput = screen.getByRole("textbox");
      fireEvent.keyDown(searchInput, { key: "ArrowDown" });

      const options = screen.getAllByRole("option");
      expect(document.activeElement).toBe(options[0]);
    });

    it("ArrowDown on first item focuses the second item", () => {
      const props = makeBaseProps();
      render(<ComponentPicker {...props} />);
      vi.advanceTimersByTime(250);

      const searchInput = screen.getByRole("textbox");
      fireEvent.keyDown(searchInput, { key: "ArrowDown" });

      const options = screen.getAllByRole("option");
      fireEvent.keyDown(options[0], { key: "ArrowDown" });

      expect(document.activeElement).toBe(options[1]);
    });

    it("ArrowUp on first item returns focus to search input", () => {
      const props = makeBaseProps();
      render(<ComponentPicker {...props} />);
      vi.advanceTimersByTime(250);

      const searchInput = screen.getByRole("textbox");
      fireEvent.keyDown(searchInput, { key: "ArrowDown" });

      const options = screen.getAllByRole("option");
      fireEvent.keyDown(options[0], { key: "ArrowUp" });

      expect(document.activeElement).toBe(searchInput);
    });

    it("Enter on a list item calls onSelect with the correct ID", () => {
      const onSelect = vi.fn();
      const props = makeBaseProps({ onSelect });
      render(<ComponentPicker {...props} />);
      vi.advanceTimersByTime(250);

      const searchInput = screen.getByRole("textbox");
      fireEvent.keyDown(searchInput, { key: "ArrowDown" });

      const options = screen.getAllByRole("option");
      fireEvent.keyDown(options[0], { key: "Enter" });

      expect(onSelect).toHaveBeenCalledWith("nvidia-rtx-4090");
    });

    it("Space on a list item calls onSelect with the correct ID", () => {
      const onSelect = vi.fn();
      const props = makeBaseProps({ onSelect });
      render(<ComponentPicker {...props} />);
      vi.advanceTimersByTime(250);

      const searchInput = screen.getByRole("textbox");
      fireEvent.keyDown(searchInput, { key: "ArrowDown" });

      const options = screen.getAllByRole("option");
      fireEvent.keyDown(options[0], { key: " " });

      expect(onSelect).toHaveBeenCalledWith("nvidia-rtx-4090");
    });

    it("Escape calls onClose in modal mode", () => {
      const onClose = vi.fn();
      const props = makeBaseProps({ onClose });
      render(<ComponentPicker {...props} />);
      vi.advanceTimersByTime(250);

      const searchInput = screen.getByRole("textbox");
      fireEvent.keyDown(searchInput, { key: "Escape" });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("Escape from a list item also calls onClose", () => {
      const onClose = vi.fn();
      const props = makeBaseProps({ onClose });
      render(<ComponentPicker {...props} />);
      vi.advanceTimersByTime(250);

      const searchInput = screen.getByRole("textbox");
      fireEvent.keyDown(searchInput, { key: "ArrowDown" });

      const options = screen.getAllByRole("option");
      fireEvent.keyDown(options[0], { key: "Escape" });

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // -- Requirement 3.7: ARIA roles --
  describe("ARIA roles (Req 3.7)", () => {
    it("renders listbox role on the results container", () => {
      const props = makeBaseProps();
      render(<ComponentPicker {...props} />);
      vi.advanceTimersByTime(250);

      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    it("renders option role on each result item", () => {
      const props = makeBaseProps();
      render(<ComponentPicker {...props} />);
      vi.advanceTimersByTime(250);

      const options = screen.getAllByRole("option");
      expect(options).toHaveLength(2);
    });
  });

  // -- Requirement 4.3: Empty specs edge case --
  describe("empty specs edge case (Req 4.3)", () => {
    it("renders no badge elements when all spec values are null", () => {
      const props = makeBaseProps({ manifestComponents: [gpuAllNullSpecs] });
      render(<ComponentPicker {...props} />);
      vi.advanceTimersByTime(250);

      // The title should still render
      expect(screen.getByText("Generic GPU")).toBeInTheDocument();

      // No MetadataBadge elements should render (no spec text like "TDP:", "PCIe Gen:", "Length:")
      expect(screen.queryByText(/TDP:/)).not.toBeInTheDocument();
      expect(screen.queryByText(/PCIe Gen:/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Length:/)).not.toBeInTheDocument();

      // The option should exist but contain no badge spans
      const option = screen.getByRole("option");
      const badges = within(option).queryAllByText(/./);
      // Only the title text should be present, no spec badges
      const badgeSpans = option.querySelectorAll(
        ".inline-flex.text-xs.font-medium"
      );
      expect(badgeSpans).toHaveLength(0);
    });
  });
});
