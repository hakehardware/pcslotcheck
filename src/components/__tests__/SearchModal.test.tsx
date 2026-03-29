/**
 * Unit + property tests for SearchModal component.
 *
 * Validates: Requirements 1.3, 3.4, 3.5, 3.8, 4.5
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import * as fc from "fast-check";
import SearchModal, {
  getModalHeading,
  getComponentSpecText,
  type SearchModalMode,
  type SearchModalProps,
} from "../SearchModal";
import type {
  MotherboardSummary,
  ComponentSummary,
  DataManifest,
  SlotPosition,
  Motherboard,
} from "@/lib/types";
import { checkCompatibility } from "@/lib/compatibility";

// ---------------------------------------------------------------------------
// Helpers & Generators
// ---------------------------------------------------------------------------

const SLOT_TYPES: SlotPosition["slot_type"][] = [
  "cpu",
  "dimm",
  "pcie",
  "m2",
  "sata_group",
];

const arbSlotType: fc.Arbitrary<SlotPosition["slot_type"]> = fc.constantFrom(
  ...SLOT_TYPES,
);

const arbSlotId: fc.Arbitrary<string> = fc
  .tuple(arbSlotType, fc.integer({ min: 0, max: 9 }))
  .map(([type, n]) => `${type}_${n}`);

/** Generate a MotherboardSummary with random but valid fields. */
const arbMotherboardSummary: fc.Arbitrary<MotherboardSummary> = fc
  .tuple(
    fc.integer({ min: 1, max: 9999 }),
    fc.constantFrom("ASUS", "MSI", "Gigabyte", "ASRock"),
    fc.constantFrom("PRO-A", "STRIX-B", "AORUS-X", "TOMAHAWK", "EDGE"),
    fc.constantFrom("B650", "X670E", "Z790", "B760", "X870E"),
    fc.constantFrom("AM5", "LGA1700", "LGA1851"),
    fc.constantFrom("ATX", "mATX", "ITX"),
  )
  .map(([n, manufacturer, modelSuffix, chipset, socket, form_factor]) => ({
    id: `mb-${n}-${modelSuffix}`,
    manufacturer,
    model: `${manufacturer} ${modelSuffix}`,
    chipset,
    socket,
    form_factor,
  }));

/** Generate a minimal Motherboard object for component mode. */
function makeMotherboard(overrides: Partial<Motherboard> = {}): Motherboard {
  return {
    id: "test-board",
    manufacturer: "ASUS",
    model: "ROG STRIX B650",
    chipset: "B650",
    socket: "AM5",
    form_factor: "ATX",
    memory: {
      type: "DDR5",
      max_speed_mhz: 6400,
      base_speed_mhz: 4800,
      max_capacity_gb: 128,
      ecc_support: false,
      channels: 2,
      slots: [],
      recommended_population: { two_dimm: ["dimm_1", "dimm_3"] },
    },
    m2_slots: [
      {
        id: "m2_1",
        label: "M2_1",
        interface: "PCIe",
        gen: 5,
        lanes: 4,
        form_factors: ["2280"],
        source: "CPU",
        supports_sata: false,
        heatsink_included: true,
        sharing: null,
      },
    ],
    pcie_slots: [],
    sata_ports: [],
    sources: [],
    schema_version: "1.0",
    ...overrides,
  };
}

/** Generate a ComponentSummary for a given type with appropriate specs. */
function makeComponentSummary(
  type: string,
  id: string,
  specs: Record<string, unknown> = {},
): ComponentSummary {
  const defaults: Record<string, Record<string, unknown>> = {
    gpu: { chip_manufacturer: "NVIDIA" },
    nvme: { capacity_gb: 1000, "interface.protocol": "NVMe" },
    ram: { "capacity.total_gb": 32, "interface.type": "DDR5" },
    cpu: { socket: "AM5" },
    sata_ssd: { capacity_gb: 500 },
    sata_hdd: { capacity_gb: 2000 },
    sata_drive: { capacity_gb: 1000 },
  };

  return {
    id,
    type,
    manufacturer: "TestMfr",
    model: `TestModel-${id}`,
    specs: { ...(defaults[type] ?? {}), ...specs },
  };
}

/** Map slot types to their component types for generators. */
const SLOT_TO_COMP_TYPES: Record<SlotPosition["slot_type"], string[]> = {
  pcie: ["gpu"],
  m2: ["nvme"],
  dimm: ["ram"],
  cpu: ["cpu"],
  sata_group: ["sata_ssd", "sata_hdd", "sata_drive"],
};

/** Generate a ComponentSummary that matches a given slot type. */
function arbComponentForSlot(
  slotType: SlotPosition["slot_type"],
): fc.Arbitrary<ComponentSummary> {
  const types = SLOT_TO_COMP_TYPES[slotType];
  return fc
    .tuple(
      fc.constantFrom(...types),
      fc.integer({ min: 1, max: 9999 }),
      fc.constantFrom("Corsair", "Samsung", "NVIDIA", "AMD", "Intel", "Kingston"),
    )
    .map(([type, n, mfr]) => {
      const id = `${type}-${n}`;
      const specs: Record<string, unknown> = {};
      switch (type) {
        case "gpu":
          specs["chip_manufacturer"] = fc.sample(
            fc.constantFrom("NVIDIA", "AMD", "Intel"),
            1,
          )[0];
          break;
        case "nvme":
          specs["capacity_gb"] = fc.sample(
            fc.constantFrom(256, 512, 1000, 2000),
            1,
          )[0];
          specs["interface.protocol"] = "NVMe";
          break;
        case "ram":
          specs["capacity.total_gb"] = fc.sample(
            fc.constantFrom(8, 16, 32, 64),
            1,
          )[0];
          specs["interface.type"] = "DDR5";
          break;
        case "cpu":
          specs["socket"] = "AM5";
          break;
        case "sata_ssd":
        case "sata_hdd":
        case "sata_drive":
          specs["capacity_gb"] = fc.sample(
            fc.constantFrom(250, 500, 1000, 2000),
            1,
          )[0];
          break;
      }
      return {
        id,
        type,
        manufacturer: mfr,
        model: `${mfr} Model ${n}`,
        specs,
      };
    });
}

/** Render SearchModal with defaults and return helpers. */
function renderSearchModal(overrides: Partial<SearchModalProps> = {}) {
  const defaultProps: SearchModalProps = {
    mode: { kind: "board" },
    manifest: { motherboards: [], components: [] },
    onSelect: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  return render(<SearchModal {...defaultProps} />);
}

// ---------------------------------------------------------------------------
// Unit tests: basic rendering
// ---------------------------------------------------------------------------

describe("SearchModal basic rendering", () => {
  it("renders with auto-focused input", () => {
    renderSearchModal();
    const input = screen.getByTestId("search-modal-input");
    expect(input).toBeInTheDocument();
    expect(document.activeElement).toBe(input);
  });

  it("closes on Escape key", () => {
    const onClose = vi.fn();
    renderSearchModal({ onClose });
    fireEvent.keyDown(screen.getByTestId("search-modal"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on backdrop click", () => {
    const onClose = vi.fn();
    renderSearchModal({ onClose });
    fireEvent.click(screen.getByTestId("search-modal-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });

  it("hides compatible-only toggle in board mode", () => {
    renderSearchModal({ mode: { kind: "board" } });
    expect(screen.queryByTestId("compatible-only-toggle")).toBeNull();
  });

  it("shows compatible-only toggle in component mode", () => {
    const mode: SearchModalMode = {
      kind: "component",
      slotId: "pcie_1",
      slotType: "pcie",
      motherboard: makeMotherboard(),
    };
    renderSearchModal({ mode });
    expect(screen.getByTestId("compatible-only-toggle")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Feature: click-to-assign-interaction, Property 1: Board mode displays all motherboards
// **Validates: Requirements 1.3**
// ---------------------------------------------------------------------------

describe("Property 1: Board mode displays all motherboards", () => {
  it("board mode with no search query displays exactly N items for N motherboards", () => {
    fc.assert(
      fc.property(
        fc.array(arbMotherboardSummary, { minLength: 0, maxLength: 20 }),
        (motherboards) => {
          // Deduplicate by id to avoid key collisions
          const uniqueMbs = [
            ...new Map(motherboards.map((mb) => [mb.id, mb])).values(),
          ];
          cleanup();
          renderSearchModal({
            mode: { kind: "board" },
            manifest: { motherboards: uniqueMbs, components: [] },
          });

          const resultList = screen.getByTestId("search-modal-results");
          const items = resultList.querySelectorAll('[role="option"]');
          expect(items).toHaveLength(uniqueMbs.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: click-to-assign-interaction, Property 5: Incompatible components are non-selectable
// **Validates: Requirements 4.5**
// ---------------------------------------------------------------------------

describe("Property 5: Incompatible components are non-selectable", () => {
  it("clicking an incompatible component does not trigger onSelect", () => {
    // Create a board with DDR5 and AM5 socket
    const motherboard = makeMotherboard();

    // Create an incompatible RAM component (DDR4 on DDR5 board)
    const incompatibleRam: ComponentSummary = {
      id: "ram-incompatible",
      type: "ram",
      manufacturer: "Corsair",
      model: "Vengeance DDR4",
      specs: { "capacity.total_gb": 16, "interface.type": "DDR4" },
    };

    // Create a compatible RAM component
    const compatibleRam: ComponentSummary = {
      id: "ram-compatible",
      type: "ram",
      manufacturer: "Corsair",
      model: "Vengeance DDR5",
      specs: { "capacity.total_gb": 32, "interface.type": "DDR5" },
    };

    const onSelect = vi.fn();
    const mode: SearchModalMode = {
      kind: "component",
      slotId: "dimm_1",
      slotType: "dimm",
      motherboard,
    };

    renderSearchModal({
      mode,
      manifest: {
        motherboards: [],
        components: [incompatibleRam, compatibleRam],
      },
      onSelect,
    });

    // Uncheck "compatible only" to show incompatible items
    const toggle = screen.getByTestId("compatible-only-toggle");
    fireEvent.click(toggle);

    // Click the incompatible item
    const incompatibleItem = screen.getByTestId("result-ram-incompatible");
    fireEvent.click(incompatibleItem);
    expect(onSelect).not.toHaveBeenCalled();

    // Click the compatible item -- should work
    const compatibleItem = screen.getByTestId("result-ram-compatible");
    fireEvent.click(compatibleItem);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("incompatible components across slot types are non-selectable (property)", () => {
    // Test with CPU socket mismatch
    const motherboard = makeMotherboard({ socket: "AM5" });

    const incompatibleCpu: ComponentSummary = {
      id: "cpu-wrong",
      type: "cpu",
      manufacturer: "Intel",
      model: "i9-14900K",
      specs: { socket: "LGA1700" },
    };

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        (_seed) => {
          cleanup();
          const onSelect = vi.fn();
          const mode: SearchModalMode = {
            kind: "component",
            slotId: "cpu_0",
            slotType: "cpu",
            motherboard,
          };

          renderSearchModal({
            mode,
            manifest: { motherboards: [], components: [incompatibleCpu] },
            onSelect,
          });

          // Uncheck "compatible only"
          const toggle = screen.getByTestId("compatible-only-toggle");
          fireEvent.click(toggle);

          const item = screen.getByTestId("result-cpu-wrong");
          expect(item.getAttribute("aria-disabled")).toBe("true");
          expect(item.className).toContain("opacity-50");

          fireEvent.click(item);
          expect(onSelect).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: click-to-assign-interaction, Property 16: Motherboard result contains all required fields
// **Validates: Requirements 3.4**
// ---------------------------------------------------------------------------

describe("Property 16: Motherboard result contains all required fields", () => {
  it("each motherboard result shows manufacturer, model, chipset, socket, and form_factor", () => {
    fc.assert(
      fc.property(arbMotherboardSummary, (mb) => {
        cleanup();
        renderSearchModal({
          mode: { kind: "board" },
          manifest: { motherboards: [mb], components: [] },
        });

        const item = screen.getByTestId(`result-${mb.id}`);
        const text = item.textContent ?? "";

        expect(text).toContain(mb.manufacturer);
        expect(text).toContain(mb.model);
        expect(text).toContain(mb.chipset);
        expect(text).toContain(mb.socket);
        expect(text).toContain(mb.form_factor);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: click-to-assign-interaction, Property 17: Component result contains all required fields
// **Validates: Requirements 3.5**
// ---------------------------------------------------------------------------

describe("Property 17: Component result contains all required fields", () => {
  it("GPU result shows manufacturer, model, and chip_manufacturer", () => {
    const comp: ComponentSummary = {
      id: "gpu-1",
      type: "gpu",
      manufacturer: "EVGA",
      model: "RTX 4090 FTW3",
      specs: { chip_manufacturer: "NVIDIA" },
    };

    renderSearchModal({
      mode: {
        kind: "component",
        slotId: "pcie_1",
        slotType: "pcie",
        motherboard: makeMotherboard(),
      },
      manifest: { motherboards: [], components: [comp] },
    });

    const item = screen.getByTestId("result-gpu-1");
    const text = item.textContent ?? "";
    expect(text).toContain("EVGA");
    expect(text).toContain("RTX 4090 FTW3");
    expect(text).toContain("NVIDIA");
  });

  it("NVMe result shows manufacturer, model, and capacity_gb", () => {
    cleanup();
    const comp: ComponentSummary = {
      id: "nvme-1",
      type: "nvme",
      manufacturer: "Samsung",
      model: "990 Pro 2TB",
      specs: { capacity_gb: 2000, "interface.protocol": "NVMe" },
    };

    renderSearchModal({
      mode: {
        kind: "component",
        slotId: "m2_1",
        slotType: "m2",
        motherboard: makeMotherboard(),
      },
      manifest: { motherboards: [], components: [comp] },
    });

    const item = screen.getByTestId("result-nvme-1");
    const text = item.textContent ?? "";
    expect(text).toContain("Samsung");
    expect(text).toContain("990 Pro 2TB");
    expect(text).toContain("2000 GB");
  });

  it("RAM result shows manufacturer, model, interface.type, and capacity.total_gb", () => {
    cleanup();
    const comp: ComponentSummary = {
      id: "ram-1",
      type: "ram",
      manufacturer: "Kingston",
      model: "Fury Beast DDR5",
      specs: { "capacity.total_gb": 64, "interface.type": "DDR5" },
    };

    renderSearchModal({
      mode: {
        kind: "component",
        slotId: "dimm_1",
        slotType: "dimm",
        motherboard: makeMotherboard(),
      },
      manifest: { motherboards: [], components: [comp] },
    });

    const item = screen.getByTestId("result-ram-1");
    const text = item.textContent ?? "";
    expect(text).toContain("Kingston");
    expect(text).toContain("Fury Beast DDR5");
    expect(text).toContain("DDR5");
    expect(text).toContain("64 GB");
  });

  it("CPU result shows manufacturer, model, and socket", () => {
    cleanup();
    const comp: ComponentSummary = {
      id: "cpu-1",
      type: "cpu",
      manufacturer: "AMD",
      model: "Ryzen 9 7950X",
      specs: { socket: "AM5" },
    };

    renderSearchModal({
      mode: {
        kind: "component",
        slotId: "cpu_0",
        slotType: "cpu",
        motherboard: makeMotherboard(),
      },
      manifest: { motherboards: [], components: [comp] },
    });

    const item = screen.getByTestId("result-cpu-1");
    const text = item.textContent ?? "";
    expect(text).toContain("AMD");
    expect(text).toContain("Ryzen 9 7950X");
    expect(text).toContain("AM5");
  });

  it("SATA result shows manufacturer, model, and capacity_gb", () => {
    cleanup();
    const comp: ComponentSummary = {
      id: "sata-1",
      type: "sata_ssd",
      manufacturer: "Samsung",
      model: "870 EVO 1TB",
      specs: { capacity_gb: 1000 },
    };

    renderSearchModal({
      mode: {
        kind: "component",
        slotId: "sata_group_0",
        slotType: "sata_group",
        motherboard: makeMotherboard(),
      },
      manifest: { motherboards: [], components: [comp] },
    });

    const item = screen.getByTestId("result-sata-1");
    const text = item.textContent ?? "";
    expect(text).toContain("Samsung");
    expect(text).toContain("870 EVO 1TB");
    expect(text).toContain("1000 GB");
  });

  it("component results contain manufacturer and model for any type (property)", () => {
    const arbType = fc.constantFrom("gpu", "nvme", "ram", "cpu", "sata_ssd");
    const arbMfr = fc.constantFrom("Corsair", "Samsung", "NVIDIA", "AMD", "Intel");
    const arbModel = fc.constantFrom(
      "Model A1", "Model B2", "Pro X3", "Ultra C4", "Lite D5",
    );

    // Map slot types for each component type
    const typeToSlot: Record<string, SlotPosition["slot_type"]> = {
      gpu: "pcie",
      nvme: "m2",
      ram: "dimm",
      cpu: "cpu",
      sata_ssd: "sata_group",
    };

    fc.assert(
      fc.property(arbType, arbMfr, arbModel, (type, mfr, model) => {
        cleanup();
        const specs: Record<string, unknown> = {};
        switch (type) {
          case "gpu": specs["chip_manufacturer"] = "NVIDIA"; break;
          case "nvme": specs["capacity_gb"] = 1000; specs["interface.protocol"] = "NVMe"; break;
          case "ram": specs["capacity.total_gb"] = 32; specs["interface.type"] = "DDR5"; break;
          case "cpu": specs["socket"] = "AM5"; break;
          case "sata_ssd": specs["capacity_gb"] = 500; break;
        }

        const comp: ComponentSummary = {
          id: `comp-test`,
          type,
          manufacturer: mfr,
          model,
          specs,
        };

        const slotType = typeToSlot[type];
        renderSearchModal({
          mode: {
            kind: "component",
            slotId: `${slotType}_0`,
            slotType,
            motherboard: makeMotherboard(),
          },
          manifest: { motherboards: [], components: [comp] },
        });

        const item = screen.getByTestId("result-comp-test");
        const text = item.textContent ?? "";
        expect(text).toContain(mfr);
        expect(text).toContain(model);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: click-to-assign-interaction, Property 18: Modal heading matches context
// **Validates: Requirements 3.8**
// ---------------------------------------------------------------------------

describe("Property 18: Modal heading matches context", () => {
  const TYPE_LABEL_MAP: Record<SlotPosition["slot_type"], string> = {
    pcie: "GPU",
    m2: "NVMe",
    dimm: "RAM",
    cpu: "CPU",
    sata_group: "SATA Drive",
  };

  it("getModalHeading returns 'Select Motherboard' for board mode", () => {
    expect(getModalHeading({ kind: "board" })).toBe("Select Motherboard");
  });

  it("getModalHeading returns correct heading for all slot types and slot IDs (property)", () => {
    fc.assert(
      fc.property(arbSlotType, arbSlotId, (slotType, slotId) => {
        const mode: SearchModalMode = {
          kind: "component",
          slotId,
          slotType,
          motherboard: makeMotherboard(),
        };
        const heading = getModalHeading(mode);
        const expectedLabel = TYPE_LABEL_MAP[slotType];
        expect(heading).toBe(`Select ${expectedLabel} for ${slotId}`);
      }),
      { numRuns: 100 },
    );
  });

  it("rendered heading matches getModalHeading for board mode", () => {
    renderSearchModal({ mode: { kind: "board" } });
    const heading = screen.getByTestId("search-modal-heading");
    expect(heading.textContent).toBe("Select Motherboard");
  });

  it("rendered heading matches getModalHeading for component mode (property)", () => {
    fc.assert(
      fc.property(arbSlotType, arbSlotId, (slotType, slotId) => {
        cleanup();
        const mode: SearchModalMode = {
          kind: "component",
          slotId,
          slotType,
          motherboard: makeMotherboard(),
        };
        renderSearchModal({ mode });

        const heading = screen.getByTestId("search-modal-heading");
        const expected = getModalHeading(mode);
        expect(heading.textContent).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });
});
