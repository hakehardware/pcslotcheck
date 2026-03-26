// Feature: component-browser, Properties 11-13: Detail view property tests
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import fc from "fast-check";
import type {
  Motherboard,
  Component,
  CPUComponent,
  GPUComponent,
  NVMeComponent,
  RAMComponent,
  SATAComponent,
} from "../../src/lib/types";
import {
  arbFullMotherboard,
  arbComponent,
} from "../../src/lib/__tests__/generators";

// -- Mock next/link to render a plain <a> tag ---------------------------------
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

// -- Mock react-icons to render simple spans ----------------------------------
vi.mock("react-icons/fi", () => ({
  FiArrowLeft: () => <span data-testid="icon-arrow-left" />,
  FiExternalLink: () => <span data-testid="icon-external-link" />,
}));

// -- Mock node:fs so page components can read our test data -------------------
const mockReadFile = vi.fn();
vi.mock("node:fs", () => {
  const mod = {
    promises: {
      readFile: (...args: unknown[]) => mockReadFile(...args),
    },
  };
  return { ...mod, default: mod };
});

// -- Helpers ------------------------------------------------------------------

function dash(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

const TYPE_LABELS: Record<string, string> = {
  cpu: "CPU",
  gpu: "GPU",
  nvme: "NVMe",
  ram: "RAM",
  sata_drive: "SATA Drive",
};

// Import page components after mocks are set up
import BoardDetailPage from "../../src/app/boards/[id]/page";
import ComponentDetailPage from "../../src/app/components/[id]/page";

/**
 * Call the board detail page as an async function and render the returned JSX.
 */
async function renderBoardDetail(board: Motherboard) {
  mockReadFile.mockResolvedValueOnce(JSON.stringify(board));
  const jsx = await BoardDetailPage({ params: Promise.resolve({ id: board.id }) });
  return render(<>{jsx}</>);
}

/**
 * Call the component detail page as an async function and render the returned JSX.
 */
async function renderComponentDetail(component: Component) {
  mockReadFile.mockResolvedValueOnce(JSON.stringify(component));
  const jsx = await ComponentDetailPage({ params: Promise.resolve({ id: component.id }) });
  return render(<>{jsx}</>);
}

// =============================================================================
// Property 11: Motherboard detail view contains all required fields
// Feature: component-browser, Property 11: Motherboard detail view contains all required fields
// **Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6**
// =============================================================================

describe("Property 11: Motherboard detail view contains all required fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("for any valid motherboard, the rendered detail view contains all top-level, memory, M.2, PCIe, and SATA fields", async () => {
    await fc.assert(
      fc.asyncProperty(arbFullMotherboard(), async (board) => {
        const { container, unmount } = await renderBoardDetail(board);
        const text = container.textContent ?? "";

        // Top-level fields
        expect(text).toContain(board.manufacturer);
        expect(text).toContain(board.model);
        expect(text).toContain(board.chipset);
        expect(text).toContain(board.socket);
        expect(text).toContain(board.form_factor);

        // Memory configuration
        expect(text).toContain(board.memory.type);
        expect(text).toContain(`${board.memory.max_speed_mhz} MHz`);
        expect(text).toContain(`${board.memory.max_capacity_gb} GB`);
        expect(text).toContain(String(board.memory.slots.length));
        expect(text).toContain(board.memory.ecc_support ? "Yes" : "No");

        // M.2 slots
        for (const slot of board.m2_slots) {
          expect(text).toContain(slot.label);
          expect(text).toContain(slot.interface);
          expect(text).toContain(String(slot.gen));
          expect(text).toContain(String(slot.lanes));
          if (slot.form_factors.length > 0) {
            expect(text).toContain(slot.form_factors.join(", "));
          }
          expect(text).toContain(slot.source);
          expect(text).toContain(slot.supports_sata ? "Yes" : "No");
        }

        // PCIe slots
        for (const slot of board.pcie_slots) {
          expect(text).toContain(slot.label);
          expect(text).toContain(String(slot.gen));
          expect(text).toContain(String(slot.electrical_lanes));
          expect(text).toContain(slot.physical_size);
          expect(text).toContain(String(slot.position));
          expect(text).toContain(slot.source);
        }

        // SATA ports
        for (const port of board.sata_ports) {
          expect(text).toContain(port.version);
          expect(text).toContain(port.source);
        }

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  });
});

// =============================================================================
// Property 12: Motherboard detail includes slot checker link
// Feature: component-browser, Property 12: Motherboard detail includes slot checker link
// **Validates: Requirements 4.9**
// =============================================================================

describe("Property 12: Motherboard detail includes slot checker link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("for any motherboard with id X, the detail view contains a link with href /check?board=X", async () => {
    await fc.assert(
      fc.asyncProperty(arbFullMotherboard(), async (board) => {
        const { container, unmount } = await renderBoardDetail(board);

        const links = Array.from(container.querySelectorAll("a")) as HTMLAnchorElement[];
        const slotCheckerLink = links.find(
          (a) => a.getAttribute("href") === `/check?board=${board.id}`
        );
        expect(slotCheckerLink).toBeTruthy();

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  });
});

// =============================================================================
// Property 13: Component detail view contains type-appropriate fields
// Feature: component-browser, Property 13: Component detail view contains type-appropriate fields
// **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.6, 5.7**
// =============================================================================

describe("Property 13: Component detail view contains type-appropriate fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("for any valid component, the rendered detail view contains common fields and all type-specific fields", async () => {
    await fc.assert(
      fc.asyncProperty(arbComponent(), async (component) => {
        const { container, unmount } = await renderComponentDetail(component);
        const text = container.textContent ?? "";

        // Common fields
        expect(text).toContain(component.manufacturer);
        expect(text).toContain(component.model);
        const typeLabel = TYPE_LABELS[component.type] ?? component.type;
        expect(text).toContain(typeLabel);

        // Type-specific fields
        switch (component.type) {
          case "cpu": {
            const cpu = component as CPUComponent;
            expect(text).toContain(cpu.socket);
            expect(text).toContain(cpu.microarchitecture);
            expect(text).toContain(cpu.architecture);
            if (cpu.cores != null) expect(text).toContain(String(cpu.cores));
            if (cpu.threads != null) expect(text).toContain(String(cpu.threads));
            if (cpu.tdp_w != null) expect(text).toContain(`${cpu.tdp_w} W`);
            expect(text).toContain(String(cpu.pcie_config.cpu_gen));
            if (cpu.pcie_config.cpu_lanes != null) {
              expect(text).toContain(String(cpu.pcie_config.cpu_lanes));
            }
            break;
          }
          case "gpu": {
            const gpu = component as GPUComponent;
            expect(text).toContain(String(gpu.interface.pcie_gen));
            expect(text).toContain(String(gpu.interface.lanes));
            expect(text).toContain(`${gpu.physical.length_mm} mm`);
            expect(text).toContain(`${gpu.physical.slot_width}-slot`);
            expect(text).toContain(`${gpu.power.tdp_w} W`);
            for (const conn of gpu.power.power_connectors) {
              expect(text).toContain(`${conn.count}x ${conn.type}`);
            }
            break;
          }
          case "nvme": {
            const nvme = component as NVMeComponent;
            expect(text).toContain(dash(nvme.interface.protocol));
            expect(text).toContain(dash(nvme.interface.pcie_gen));
            expect(text).toContain(dash(nvme.interface.lanes));
            expect(text).toContain(nvme.form_factor);
            expect(text).toContain(`${nvme.capacity_gb} GB`);
            break;
          }
          case "ram": {
            const ram = component as RAMComponent;
            expect(text).toContain(ram.interface.type);
            expect(text).toContain(`${ram.interface.speed_mhz} MHz`);
            expect(text).toContain(`${ram.interface.base_speed_mhz} MHz`);
            expect(text).toContain(String(ram.capacity.modules));
            expect(text).toContain(`${ram.capacity.per_module_gb} GB`);
            expect(text).toContain(`${ram.capacity.total_gb} GB`);
            break;
          }
          case "sata_drive": {
            const sata = component as SATAComponent;
            expect(text).toContain(sata.form_factor);
            expect(text).toContain(`${sata.capacity_gb} GB`);
            expect(text).toContain(sata.interface);
            break;
          }
        }

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  });
});
