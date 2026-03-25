import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import ComponentPicker from "../../src/components/ComponentPicker";
import type { DataManifest } from "../../src/lib/types";

// -- Test data ---------------------------------------------------------------

const cpuComponent: DataManifest["components"][number] = {
  id: "test-cpu-1",
  type: "cpu",
  manufacturer: "AMD",
  model: "Ryzen 7 9700X",
  specs: { socket: "AM5", microarchitecture: "Zen 5", "pcie_config.cpu_gen": 5 },
};

const nvmeComponent: DataManifest["components"][number] = {
  id: "test-nvme-1",
  type: "nvme",
  manufacturer: "Samsung",
  model: "990 Pro 2TB",
  specs: { capacity_gb: 2000, "interface.pcie_gen": 4, "interface.protocol": "NVMe" },
};

const GITHUB_ISSUES_URL = "https://github.com/hakehardware/pcslotcheck/issues";

// -- Tests -------------------------------------------------------------------

describe("ComponentPicker unit tests", () => {
  afterEach(() => {
    cleanup();
  });

  // 1. Escape key closes the picker
  it("Escape key closes the picker", async () => {
    const onClose = vi.fn();
    render(
      <ComponentPicker
        slotCategory="m2"
        manifestComponents={[nvmeComponent]}
        onSelect={vi.fn()}
        onClose={onClose}
      />
    );

    const searchInput = screen.getByRole("textbox");
    await userEvent.click(searchInput);
    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // 2. ArrowDown from search input focuses first result
  it("ArrowDown from search input focuses first result", async () => {
    render(
      <ComponentPicker
        slotCategory="m2"
        manifestComponents={[nvmeComponent]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const searchInput = screen.getByRole("textbox");
    await userEvent.click(searchInput);
    await userEvent.keyboard("{ArrowDown}");

    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveFocus();
  });

  // 3. ArrowUp from first result returns focus to search input
  it("ArrowUp from first result returns focus to search input", async () => {
    render(
      <ComponentPicker
        slotCategory="m2"
        manifestComponents={[nvmeComponent]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const searchInput = screen.getByRole("textbox");
    // Move focus to first result
    await userEvent.click(searchInput);
    await userEvent.keyboard("{ArrowDown}");

    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveFocus();

    // ArrowUp should return to search input
    await userEvent.keyboard("{ArrowUp}");
    expect(searchInput).toHaveFocus();
  });

  // 4. Enter/Space on result fires onSelect
  it("Enter on result fires onSelect with component id", async () => {
    const onSelect = vi.fn();
    render(
      <ComponentPicker
        slotCategory="m2"
        manifestComponents={[nvmeComponent]}
        onSelect={onSelect}
        onClose={vi.fn()}
      />
    );

    const searchInput = screen.getByRole("textbox");
    await userEvent.click(searchInput);
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledWith("test-nvme-1");
  });

  it("Space on result fires onSelect with component id", async () => {
    const onSelect = vi.fn();
    render(
      <ComponentPicker
        slotCategory="m2"
        manifestComponents={[nvmeComponent]}
        onSelect={onSelect}
        onClose={vi.fn()}
      />
    );

    const searchInput = screen.getByRole("textbox");
    await userEvent.click(searchInput);
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard(" ");

    expect(onSelect).toHaveBeenCalledWith("test-nvme-1");
  });

  // 5. Auto-focus on search input when picker opens
  it("auto-focuses search input when picker opens", async () => {
    vi.useFakeTimers();
    render(
      <ComponentPicker
        slotCategory="m2"
        manifestComponents={[nvmeComponent]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // The auto-focus uses setTimeout(0), so advance timers
    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    const searchInput = screen.getByRole("textbox");
    expect(searchInput).toHaveFocus();
    vi.useRealTimers();
  });

  // 6. Empty-state message includes GitHub issues link
  it("empty-state message includes GitHub issues link", () => {
    render(
      <ComponentPicker
        slotCategory="m2"
        manifestComponents={[]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const link = screen.getByRole("link", { name: /github/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", GITHUB_ISSUES_URL);
  });

  // 7. CPU empty-state mentions specific socket
  it("CPU empty-state mentions specific socket", () => {
    render(
      <ComponentPicker
        slotCategory="cpu"
        manifestComponents={[]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        motherboardSocket="AM5"
      />
    );

    expect(screen.getByText(/AM5/)).toBeInTheDocument();
  });

  // 8. Selected-component card renders remove button and fires onRemove
  it("selected-component card renders remove button and fires onRemove", async () => {
    const onRemove = vi.fn();
    render(
      <ComponentPicker
        slotCategory="m2"
        manifestComponents={[nvmeComponent]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        selectedComponentId="test-nvme-1"
        onRemove={onRemove}
      />
    );

    // The selected card should show the component info
    expect(screen.getByText(/Samsung 990 Pro 2TB/)).toBeInTheDocument();

    // Find and click the remove button
    const removeButton = screen.getByRole("button", { name: /remove/i });
    expect(removeButton).toBeInTheDocument();
    await userEvent.click(removeButton);

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  // 9. Debounce delays search (use fake timers)
  it("debounce delays search results", async () => {
    vi.useFakeTimers();

    const secondNvme: DataManifest["components"][number] = {
      id: "test-nvme-2",
      type: "nvme",
      manufacturer: "WD",
      model: "Black SN770 1TB",
      specs: { capacity_gb: 1000, "interface.pcie_gen": 4, "interface.protocol": "NVMe" },
    };

    render(
      <ComponentPicker
        slotCategory="m2"
        manifestComponents={[nvmeComponent, secondNvme]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Auto-focus timeout
    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    // Both components should be visible initially
    expect(screen.getByText(/Samsung 990 Pro 2TB/)).toBeInTheDocument();
    expect(screen.getByText(/WD Black SN770 1TB/)).toBeInTheDocument();

    // Simulate typing via fireEvent (avoids userEvent async timing issues with fake timers)
    const searchInput = screen.getByRole("textbox");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(searchInput, { target: { value: "Samsung" } });

    // Before debounce fires, both should still be visible
    expect(screen.getByText(/Samsung 990 Pro 2TB/)).toBeInTheDocument();
    expect(screen.getByText(/WD Black SN770 1TB/)).toBeInTheDocument();

    // Advance past the debounce delay
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // Now only Samsung should be visible
    expect(screen.getByText(/Samsung 990 Pro 2TB/)).toBeInTheDocument();
    expect(screen.queryByText(/WD Black SN770 1TB/)).not.toBeInTheDocument();

    vi.useRealTimers();
  });
});
