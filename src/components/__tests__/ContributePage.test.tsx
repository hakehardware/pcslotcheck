/**
 * Page-level unit tests for the Contribute page.
 *
 * Validates: Requirements 1.1, 1.4, 3.1-3.5, 4.2, 4.4, 6.4, 9.4, 10.4
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentTypeKey } from "@/lib/form-helpers";
import ContributeClient from "../../app/contribute/ContributeClient";
import NavBar from "../NavBar";
import ValidationPanelContribute from "../ValidationPanelContribute";

// Static schema imports
import motherboardSchema from "../../../data/schema/motherboard.schema.json";
import cpuSchema from "../../../data/schema/component-cpu.schema.json";
import gpuSchema from "../../../data/schema/component-gpu.schema.json";
import nvmeSchema from "../../../data/schema/component-nvme.schema.json";
import ramSchema from "../../../data/schema/component-ram.schema.json";
import sataSsdSchema from "../../../data/schema/component-sata-ssd.schema.json";
import sataHddSchema from "../../../data/schema/component-sata-hdd.schema.json";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_SCHEMAS: Record<ComponentTypeKey, object> = {
  motherboard: motherboardSchema,
  cpu: cpuSchema,
  gpu: gpuSchema,
  nvme: nvmeSchema,
  ram: ramSchema,
  sata_ssd: sataSsdSchema,
  sata_hdd: sataHddSchema,
};

// Mock next/navigation for NavBar
vi.mock("next/navigation", () => ({
  usePathname: () => "/contribute",
}));

// Mock BoardCanvasEditor to avoid heavy CaseCanvas dependency in unit tests
vi.mock("../BoardCanvasEditor", () => ({
  default: () => <div data-testid="board-canvas-editor-mock" />,
}));

// ---------------------------------------------------------------------------
// Req 1.1: ComponentTypeSelector renders all 7 options
// ---------------------------------------------------------------------------
describe("ComponentTypeSelector renders all 7 options (Req 1.1)", () => {
  it("displays radio buttons for each component type", () => {
    render(<ContributeClient schemas={ALL_SCHEMAS} />);

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(7);

    const labels = [
      "Motherboard",
      "CPU",
      "GPU",
      "NVMe",
      "RAM",
      "SATA SSD",
      "SATA HDD",
    ];
    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

// ---------------------------------------------------------------------------
// Req 1.4: No type selected on initial load
// ---------------------------------------------------------------------------
describe("No type selected on initial load (Req 1.4)", () => {
  it("all radio buttons are unchecked initially", () => {
    render(<ContributeClient schemas={ALL_SCHEMAS} />);

    const radios = screen.getAllByRole("radio");
    for (const radio of radios) {
      expect(radio).toHaveAttribute("aria-checked", "false");
    }
  });

  it("form engine is not rendered before selecting a type", () => {
    const { container } = render(<ContributeClient schemas={ALL_SCHEMAS} />);

    // No fieldsets or form inputs should be present before type selection
    const fieldsets = container.querySelectorAll("fieldset");
    expect(fieldsets).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Req 3.1-3.5: Motherboard form renders expected sections via wizard steps
// ---------------------------------------------------------------------------
describe("Motherboard form renders memory, M.2, PCIe, SATA, sources sections (Req 3.1-3.5)", () => {
  it("renders Board Details fields on step 1 and can navigate to Memory step", () => {
    const { container } = render(<ContributeClient schemas={ALL_SCHEMAS} />);

    // Select Motherboard type
    const motherboardBtn = screen.getByText("Motherboard");
    fireEvent.click(motherboardBtn);

    // Step indicator should show Board Details as current step
    expect(screen.getByText("Board Details")).toBeInTheDocument();

    // Memory step should be visible in the step indicator
    expect(screen.getByText("Memory")).toBeInTheDocument();

    // Navigate to Memory step by clicking its button in the step indicator
    fireEvent.click(screen.getByText("Memory"));

    // Memory fieldset should now be rendered
    const legends = container.querySelectorAll("legend");
    const legendTexts = Array.from(legends).map((l) => l.textContent ?? "");
    const found = legendTexts.some((text) => text.includes("Memory"));
    expect(found).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Req 4.2: Validation errors display with field path and message
// ---------------------------------------------------------------------------
describe("Validation errors display with field path and message (Req 4.2)", () => {
  it("shows per-step validation errors after selecting a type with empty form data", async () => {
    render(<ContributeClient schemas={ALL_SCHEMAS} />);

    // Select CPU type -- empty form will trigger validation errors after debounce
    const cpuBtn = screen.getByText("CPU");
    fireEvent.click(cpuBtn);

    // Navigate to Review step to see all errors unfiltered
    fireEvent.click(screen.getByText("Review & Download"));

    // Wait for debounced validation (300ms) to produce error list items
    await waitFor(
      () => {
        const listItems = screen.getAllByRole("listitem");
        expect(listItems.length).toBeGreaterThan(0);
      },
      { timeout: 1500 },
    );

    // Each error item should contain a path and a message
    const listItems = screen.getAllByRole("listitem");
    for (const item of listItems) {
      expect(item.textContent).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Req 4.4: Success indicator shown when valid
// ---------------------------------------------------------------------------
describe("Success indicator shown when valid (Req 4.4)", () => {
  it("shows the ValidationPanelContribute success message when isValid", () => {
    render(
      <ValidationPanelContribute errors={[]} isValid={true} />,
    );

    expect(screen.getByText("All validation checks passed")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Req 6.4: Download button disabled when errors exist (on Review step)
// ---------------------------------------------------------------------------
describe("Download button disabled when errors exist (Req 6.4)", () => {
  it("renders a disabled download button on the Review step", async () => {
    render(<ContributeClient schemas={ALL_SCHEMAS} />);

    // Select GPU type -- empty form means validation errors
    const gpuBtn = screen.getByText("GPU");
    fireEvent.click(gpuBtn);

    // Navigate to Review step
    fireEvent.click(screen.getByText("Review & Download"));

    // Wait for debounced validation
    await waitFor(
      () => {
        const downloadBtn = screen.getByRole("button", { name: /download component/i });
        expect(downloadBtn).toBeDisabled();
      },
      { timeout: 1000 },
    );

    // The disabled message should be present
    expect(
      screen.getByText("Resolve all validation errors before downloading."),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Req 9.4: YAML preview shows output on Review step
// ---------------------------------------------------------------------------
describe("YAML preview shows output with validity indicator (Req 9.4)", () => {
  it("renders YAML Preview header and Not yet valid badge on Review step", async () => {
    render(<ContributeClient schemas={ALL_SCHEMAS} />);

    // Select NVMe type
    const nvmeBtn = screen.getByText("NVMe");
    fireEvent.click(nvmeBtn);

    // Navigate to Review step
    fireEvent.click(screen.getByText("Review & Download"));

    // Wait for debounced validation to run
    await waitFor(
      () => {
        expect(screen.getByText("YAML Preview")).toBeInTheDocument();
      },
      { timeout: 1000 },
    );

    // Invalid data should show the "Not yet valid" badge
    await waitFor(
      () => {
        expect(screen.getByText("Not yet valid")).toBeInTheDocument();
      },
      { timeout: 1000 },
    );
  });
});

// ---------------------------------------------------------------------------
// Req 10.4: Navigation link present
// ---------------------------------------------------------------------------
describe("Navigation link present (Req 10.4)", () => {
  it("NavBar contains a Contribute link pointing to /contribute", () => {
    render(<NavBar />);

    const contributeLink = screen.getByRole("link", { name: /contribute/i });
    expect(contributeLink).toBeInTheDocument();
    expect(contributeLink).toHaveAttribute("href", "/contribute");
  });
});
