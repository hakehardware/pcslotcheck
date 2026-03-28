import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  transformMotherboard,
  transformSlots,
  transformComponent,
  generateSummaryLine,
  discoverYamlFiles,
  routeSchema,
  parseAndValidateFile,
  computeOrphans,
  extractComponentSpecs,
  generateManifest,
  type MotherboardYAML,
  type MotherboardRow,
  type SlotRow,
  type ComponentYAML,
  type NvmeComponentRow,
} from "../../scripts/sync";
import { assembleMotherboard } from "../../src/lib/supabase-queries";

describe("transformMotherboard", () => {
  const baseYaml: MotherboardYAML = {
    id: "test-board",
    manufacturer: "TestCo",
    model: "Test Board X",
    chipset: "Z890",
    socket: "LGA1851",
    form_factor: "ATX",
    schema_version: "1.0",
    memory: {
      type: "DDR5",
      max_speed_mhz: 8000,
      base_speed_mhz: 4800,
      max_capacity_gb: 128,
      ecc_support: false,
      channels: 2,
      slots: [
        { id: "dimm_a1", channel: "A", position: 1, recommended: true },
        { id: "dimm_b1", channel: "B", position: 1, recommended: true },
      ],
      recommended_population: {
        two_dimm: ["dimm_a1", "dimm_b1"],
      },
    },
    m2_slots: [],
    pcie_slots: [],
    sata_ports: [],
    sources: [{ type: "manufacturer", url: "https://example.com" }],
  };

  it("flattens memory config into top-level columns", () => {
    const row = transformMotherboard(baseYaml);

    expect(row.memory_type).toBe("DDR5");
    expect(row.memory_max_speed_mhz).toBe(8000);
    expect(row.memory_base_speed_mhz).toBe(4800);
    expect(row.memory_max_capacity_gb).toBe(128);
    expect(row.memory_ecc_support).toBe(false);
    expect(row.memory_channels).toBe(2);
    expect(row.memory_recommended_2dimm).toEqual(["dimm_a1", "dimm_b1"]);
  });

  it("copies top-level fields directly", () => {
    const row = transformMotherboard(baseYaml);

    expect(row.id).toBe("test-board");
    expect(row.manufacturer).toBe("TestCo");
    expect(row.model).toBe("Test Board X");
    expect(row.chipset).toBe("Z890");
    expect(row.socket).toBe("LGA1851");
    expect(row.form_factor).toBe("ATX");
    expect(row.schema_version).toBe("1.0");
    expect(row.sources).toEqual([
      { type: "manufacturer", url: "https://example.com" },
    ]);
  });

  it("sets optional cpu fields to null when cpu section is absent", () => {
    const row = transformMotherboard(baseYaml);

    expect(row.cpu_max_tdp_w).toBeNull();
    expect(row.cpu_pcie_lanes).toBeNull();
    expect(row.cpu_supported_series).toBeNull();
  });

  it("extracts cpu fields when cpu section is present", () => {
    const yamlWithCpu: MotherboardYAML = {
      ...baseYaml,
      cpu: {
        max_tdp_w: 253,
        pcie_lanes_from_cpu: 20,
        supported_series: ["Core Ultra 200S"],
      },
    };
    const row = transformMotherboard(yamlWithCpu);

    expect(row.cpu_max_tdp_w).toBe(253);
    expect(row.cpu_pcie_lanes).toBe(20);
    expect(row.cpu_supported_series).toEqual(["Core Ultra 200S"]);
  });

  it("sets optional metadata fields to null when absent", () => {
    const row = transformMotherboard(baseYaml);

    expect(row.notes).toBeNull();
    expect(row.contributed_by).toBeNull();
    expect(row.last_verified).toBeNull();
  });

  it("passes through optional metadata fields when present", () => {
    const yamlWithMeta: MotherboardYAML = {
      ...baseYaml,
      notes: ["Check BIOS version for DDR5-8000 support"],
      contributed_by: "hake",
      last_verified: "2025-01-15",
    };
    const row = transformMotherboard(yamlWithMeta);

    expect(row.notes).toEqual(["Check BIOS version for DDR5-8000 support"]);
    expect(row.contributed_by).toBe("hake");
    expect(row.last_verified).toBe("2025-01-15");
  });

  it("sets updated_at to a valid ISO timestamp", () => {
    const before = new Date().toISOString();
    const row = transformMotherboard(baseYaml);
    const after = new Date().toISOString();

    expect(row.updated_at).toBeDefined();
    expect(row.updated_at >= before).toBe(true);
    expect(row.updated_at <= after).toBe(true);
  });

  it("returns correct shape with all expected keys", () => {
    const row = transformMotherboard(baseYaml);
    const expectedKeys: (keyof MotherboardRow)[] = [
      "id",
      "manufacturer",
      "model",
      "chipset",
      "socket",
      "form_factor",
      "memory_type",
      "memory_max_speed_mhz",
      "memory_base_speed_mhz",
      "memory_max_capacity_gb",
      "memory_ecc_support",
      "memory_channels",
      "memory_recommended_2dimm",
      "cpu_max_tdp_w",
      "cpu_pcie_lanes",
      "cpu_supported_series",
      "notes",
      "sources",
      "contributed_by",
      "last_verified",
      "length_mm",
      "width_mm",
      "slot_positions",
      "schema_version",
      "updated_at",
    ];

    for (const key of expectedKeys) {
      expect(row).toHaveProperty(key);
    }
    expect(Object.keys(row)).toHaveLength(expectedKeys.length);
  });
});

describe("transformSlots", () => {
  const baseYaml: MotherboardYAML = {
    id: "test-board",
    manufacturer: "TestCo",
    model: "Test Board X",
    chipset: "Z890",
    socket: "LGA1851",
    form_factor: "ATX",
    schema_version: "1.0",
    memory: {
      type: "DDR5",
      max_speed_mhz: 8000,
      base_speed_mhz: 4800,
      max_capacity_gb: 128,
      ecc_support: false,
      channels: 2,
      slots: [
        { id: "dimm_a1", channel: "A", position: 1, recommended: false },
        { id: "dimm_a2", channel: "A", position: 2, recommended: true },
        { id: "dimm_b1", channel: "B", position: 1, recommended: false },
        { id: "dimm_b2", channel: "B", position: 2, recommended: true },
      ],
      recommended_population: {
        two_dimm: ["dimm_a2", "dimm_b2"],
      },
    },
    m2_slots: [
      {
        id: "m2_1",
        label: "M.2_1 (CPU)",
        interface: "PCIe",
        gen: 5,
        lanes: 4,
        form_factors: ["2280", "22110"],
        source: "CPU",
        supports_sata: false,
        heatsink_included: true,
        sharing: null,
      },
      {
        id: "m2_2",
        label: "M.2_2 (Chipset)",
        interface: "PCIe_or_SATA",
        gen: 4,
        lanes: 4,
        form_factors: ["2242", "2260", "2280"],
        source: "Chipset",
        supports_sata: true,
        heatsink_included: false,
        sharing: [
          {
            type: "disables",
            targets: ["sata_1", "sata_2"],
            condition: "M.2_2 is populated with a SATA device",
            effect: "SATA ports 1 and 2 are disabled",
          },
        ],
      },
    ],
    pcie_slots: [
      {
        id: "pcie_1",
        label: "PCIEX16_1 (CPU)",
        gen: 5,
        electrical_lanes: 16,
        physical_size: "x16",
        source: "CPU",
        reinforced: true,
        sharing: null,
      },
      {
        id: "pcie_2",
        label: "PCIEX1_1 (Chipset)",
        gen: 4,
        electrical_lanes: 1,
        physical_size: "x1",
        source: "Chipset",
        reinforced: false,
        sharing: [
          {
            type: "bandwidth_split",
            target: "m2_2",
            condition: "M.2_2 is populated",
            effect: "PCIEX1_1 operates at reduced bandwidth",
          },
        ],
      },
    ],
    sata_ports: [
      {
        id: "sata_1",
        version: "3.0",
        source: "Chipset",
        disabled_by: "m2_2",
      },
      {
        id: "sata_2",
        version: "3.0",
        source: "Chipset",
        disabled_by: null,
      },
    ],
    sources: [{ type: "manufacturer", url: "https://example.com" }],
  };

  it("returns correct total number of slot rows", () => {
    const rows = transformSlots(baseYaml);
    // 4 memory + 2 m2 + 2 pcie + 2 sata = 10
    expect(rows).toHaveLength(10);
  });

  it("assigns category 'memory' to memory slots with correct type-specific fields", () => {
    const rows = transformSlots(baseYaml);
    const memoryRows = rows.filter((r) => r.category === "memory");

    expect(memoryRows).toHaveLength(4);

    const a1 = memoryRows.find((r) => r.id === "dimm_a1")!;
    expect(a1.motherboard_id).toBe("test-board");
    expect(a1.category).toBe("memory");
    expect(a1.label).toBe("A1");
    expect(a1.dimm_channel).toBe("A");
    expect(a1.dimm_position).toBe(1);
    expect(a1.dimm_recommended).toBe(false);

    const b2 = memoryRows.find((r) => r.id === "dimm_b2")!;
    expect(b2.label).toBe("B2");
    expect(b2.dimm_channel).toBe("B");
    expect(b2.dimm_position).toBe(2);
    expect(b2.dimm_recommended).toBe(true);
  });

  it("sets non-memory type-specific columns to null for memory slots", () => {
    const rows = transformSlots(baseYaml);
    const memRow = rows.find((r) => r.category === "memory")!;

    expect(memRow.m2_interface).toBeNull();
    expect(memRow.m2_gen).toBeNull();
    expect(memRow.m2_lanes).toBeNull();
    expect(memRow.m2_form_factors).toBeNull();
    expect(memRow.m2_supports_sata).toBeNull();
    expect(memRow.m2_heatsink_included).toBeNull();
    expect(memRow.pcie_gen).toBeNull();
    expect(memRow.pcie_electrical_lanes).toBeNull();
    expect(memRow.pcie_physical_size).toBeNull();
    expect(memRow.pcie_reinforced).toBeNull();
    expect(memRow.sata_version).toBeNull();
  });

  it("assigns category 'm2' to M.2 slots with correct type-specific fields", () => {
    const rows = transformSlots(baseYaml);
    const m2Rows = rows.filter((r) => r.category === "m2");

    expect(m2Rows).toHaveLength(2);

    const m2_1 = m2Rows.find((r) => r.id === "m2_1")!;
    expect(m2_1.motherboard_id).toBe("test-board");
    expect(m2_1.label).toBe("M.2_1 (CPU)");
    expect(m2_1.m2_interface).toBe("PCIe");
    expect(m2_1.m2_gen).toBe(5);
    expect(m2_1.m2_lanes).toBe(4);
    expect(m2_1.m2_form_factors).toEqual(["2280", "22110"]);
    expect(m2_1.m2_supports_sata).toBe(false);
    expect(m2_1.m2_heatsink_included).toBe(true);
    expect(m2_1.source).toBe("CPU");
    expect(m2_1.sharing_rules).toBeNull();

    const m2_2 = m2Rows.find((r) => r.id === "m2_2")!;
    expect(m2_2.m2_interface).toBe("PCIe_or_SATA");
    expect(m2_2.m2_supports_sata).toBe(true);
    expect(m2_2.m2_heatsink_included).toBe(false);
    expect(m2_2.source).toBe("Chipset");
    expect(m2_2.sharing_rules).toEqual([
      {
        type: "disables",
        targets: ["sata_1", "sata_2"],
        condition: "M.2_2 is populated with a SATA device",
        effect: "SATA ports 1 and 2 are disabled",
      },
    ]);
  });

  it("sets non-m2 type-specific columns to null for M.2 slots", () => {
    const rows = transformSlots(baseYaml);
    const m2Row = rows.find((r) => r.category === "m2")!;

    expect(m2Row.dimm_channel).toBeNull();
    expect(m2Row.dimm_position).toBeNull();
    expect(m2Row.dimm_recommended).toBeNull();
    expect(m2Row.pcie_gen).toBeNull();
    expect(m2Row.pcie_electrical_lanes).toBeNull();
    expect(m2Row.pcie_physical_size).toBeNull();
    expect(m2Row.pcie_reinforced).toBeNull();
    expect(m2Row.sata_version).toBeNull();
  });

  it("assigns category 'pcie' to PCIe slots with correct type-specific fields", () => {
    const rows = transformSlots(baseYaml);
    const pcieRows = rows.filter((r) => r.category === "pcie");

    expect(pcieRows).toHaveLength(2);

    const pcie_1 = pcieRows.find((r) => r.id === "pcie_1")!;
    expect(pcie_1.motherboard_id).toBe("test-board");
    expect(pcie_1.label).toBe("PCIEX16_1 (CPU)");
    expect(pcie_1.pcie_gen).toBe(5);
    expect(pcie_1.pcie_electrical_lanes).toBe(16);
    expect(pcie_1.pcie_physical_size).toBe("x16");
    expect(pcie_1.pcie_reinforced).toBe(true);
    expect(pcie_1.source).toBe("CPU");
    expect(pcie_1.sharing_rules).toBeNull();

    const pcie_2 = pcieRows.find((r) => r.id === "pcie_2")!;
    expect(pcie_2.pcie_gen).toBe(4);
    expect(pcie_2.pcie_electrical_lanes).toBe(1);
    expect(pcie_2.pcie_physical_size).toBe("x1");
    expect(pcie_2.pcie_reinforced).toBe(false);
    expect(pcie_2.source).toBe("Chipset");
    expect(pcie_2.sharing_rules).toEqual([
      {
        type: "bandwidth_split",
        target: "m2_2",
        condition: "M.2_2 is populated",
        effect: "PCIEX1_1 operates at reduced bandwidth",
      },
    ]);
  });

  it("sets non-pcie type-specific columns to null for PCIe slots", () => {
    const rows = transformSlots(baseYaml);
    const pcieRow = rows.find((r) => r.category === "pcie")!;

    expect(pcieRow.dimm_channel).toBeNull();
    expect(pcieRow.dimm_position).toBeNull();
    expect(pcieRow.dimm_recommended).toBeNull();
    expect(pcieRow.m2_interface).toBeNull();
    expect(pcieRow.m2_gen).toBeNull();
    expect(pcieRow.m2_lanes).toBeNull();
    expect(pcieRow.m2_form_factors).toBeNull();
    expect(pcieRow.m2_supports_sata).toBeNull();
    expect(pcieRow.m2_heatsink_included).toBeNull();
    expect(pcieRow.sata_version).toBeNull();
  });

  it("assigns category 'sata' to SATA ports with correct type-specific fields", () => {
    const rows = transformSlots(baseYaml);
    const sataRows = rows.filter((r) => r.category === "sata");

    expect(sataRows).toHaveLength(2);

    const sata_1 = sataRows.find((r) => r.id === "sata_1")!;
    expect(sata_1.motherboard_id).toBe("test-board");
    expect(sata_1.label).toBe("SATA_1");
    expect(sata_1.sata_version).toBe("3.0");
    expect(sata_1.source).toBe("Chipset");
    expect(sata_1.disabled_by).toBe("m2_2");

    const sata_2 = sataRows.find((r) => r.id === "sata_2")!;
    expect(sata_2.label).toBe("SATA_2");
    expect(sata_2.disabled_by).toBeNull();
  });

  it("sets non-sata type-specific columns to null for SATA ports", () => {
    const rows = transformSlots(baseYaml);
    const sataRow = rows.find((r) => r.category === "sata")!;

    expect(sataRow.dimm_channel).toBeNull();
    expect(sataRow.dimm_position).toBeNull();
    expect(sataRow.dimm_recommended).toBeNull();
    expect(sataRow.m2_interface).toBeNull();
    expect(sataRow.m2_gen).toBeNull();
    expect(sataRow.m2_lanes).toBeNull();
    expect(sataRow.m2_form_factors).toBeNull();
    expect(sataRow.m2_supports_sata).toBeNull();
    expect(sataRow.m2_heatsink_included).toBeNull();
    expect(sataRow.pcie_gen).toBeNull();
    expect(sataRow.pcie_electrical_lanes).toBeNull();
    expect(sataRow.pcie_physical_size).toBeNull();
    expect(sataRow.pcie_reinforced).toBeNull();
  });

  it("assigns incrementing sort_order across all categories", () => {
    const rows = transformSlots(baseYaml);
    const sortOrders = rows.map((r) => r.sort_order);

    // Should be 0, 1, 2, ..., 9
    expect(sortOrders).toEqual(Array.from({ length: 10 }, (_, i) => i));
  });

  it("orders categories: memory first, then m2, pcie, sata", () => {
    const rows = transformSlots(baseYaml);
    const categories = rows.map((r) => r.category);

    // Memory slots (4), then m2 (2), then pcie (2), then sata (2)
    expect(categories.slice(0, 4)).toEqual(["memory", "memory", "memory", "memory"]);
    expect(categories.slice(4, 6)).toEqual(["m2", "m2"]);
    expect(categories.slice(6, 8)).toEqual(["pcie", "pcie"]);
    expect(categories.slice(8, 10)).toEqual(["sata", "sata"]);
  });

  it("returns empty array when all slot arrays are empty", () => {
    const emptyYaml: MotherboardYAML = {
      ...baseYaml,
      memory: { ...baseYaml.memory, slots: [] },
      m2_slots: [],
      pcie_slots: [],
      sata_ports: [],
    };
    const rows = transformSlots(emptyYaml);
    expect(rows).toEqual([]);
  });

  it("populates common columns correctly for all categories", () => {
    const rows = transformSlots(baseYaml);

    // Memory: source is null, no sharing, no disabled_by, no notes
    const memRow = rows.find((r) => r.category === "memory")!;
    expect(memRow.source).toBeNull();
    expect(memRow.disabled_by).toBeNull();
    expect(memRow.sharing_rules).toBeNull();
    expect(memRow.notes).toBeNull();

    // M.2: source from YAML, sharing from YAML
    const m2Row = rows.find((r) => r.id === "m2_1")!;
    expect(m2Row.source).toBe("CPU");
    expect(m2Row.disabled_by).toBeNull();
    expect(m2Row.notes).toBeNull();

    // PCIe: source from YAML
    const pcieRow = rows.find((r) => r.id === "pcie_1")!;
    expect(pcieRow.source).toBe("CPU");
    expect(pcieRow.disabled_by).toBeNull();
    expect(pcieRow.notes).toBeNull();

    // SATA: source from YAML, disabled_by from YAML
    const sataRow = rows.find((r) => r.id === "sata_1")!;
    expect(sataRow.source).toBe("Chipset");
    expect(sataRow.disabled_by).toBe("m2_2");
    expect(sataRow.notes).toBeNull();
  });

  it("each row has all expected SlotRow keys", () => {
    const rows = transformSlots(baseYaml);
    const expectedKeys: (keyof SlotRow)[] = [
      "id",
      "motherboard_id",
      "category",
      "label",
      "m2_interface",
      "m2_gen",
      "m2_lanes",
      "m2_form_factors",
      "m2_supports_sata",
      "m2_heatsink_included",
      "pcie_gen",
      "pcie_electrical_lanes",
      "pcie_physical_size",
      "pcie_reinforced",
      "dimm_channel",
      "dimm_position",
      "dimm_recommended",
      "sata_version",
      "source",
      "disabled_by",
      "sharing_rules",
      "notes",
      "sort_order",
    ];

    for (const row of rows) {
      for (const key of expectedKeys) {
        expect(row).toHaveProperty(key);
      }
      expect(Object.keys(row)).toHaveLength(expectedKeys.length);
    }
  });
});

describe("transformComponent", () => {
  it("flattens NVMe fields into typed columns", () => {
    const yaml: ComponentYAML = {
      id: "samsung-990-pro-2tb",
      type: "nvme",
      manufacturer: "Samsung",
      model: "990 PRO 2TB",
      schema_version: "1.0",
      interface: { protocol: "NVMe", pcie_gen: 5, lanes: 4 },
      form_factor: "2280",
      capacity_gb: 2000,
    };
    const row = transformComponent(yaml);

    expect(row.id).toBe("samsung-990-pro-2tb");
    expect(row.type).toBe("nvme");
    expect(row.manufacturer).toBe("Samsung");
    expect(row.model).toBe("990 PRO 2TB");
    expect(row.sku).toBeNull();
    expect(row.schema_version).toBe("1.0");
    expect(row.sources).toBeNull();
    expect(row.contributed_by).toBeNull();
    expect(row).not.toHaveProperty("specs");
    if (row.type === "nvme") {
      expect(row.interface_protocol).toBe("NVMe");
      expect(row.interface_pcie_gen).toBe(5);
      expect(row.interface_lanes).toBe(4);
      expect(row.form_factor).toBe("2280");
      expect(row.capacity_gb).toBe(2000);
    }
  });

  it("flattens GPU fields into typed columns", () => {
    const yaml: ComponentYAML = {
      id: "nvidia-rtx-4070-ti-super",
      type: "gpu",
      manufacturer: "NVIDIA",
      model: "GeForce RTX 4070 Ti SUPER",
      schema_version: "1.0",
      interface: { pcie_gen: 4, lanes: 16 },
      physical: { slot_width: 2, length_mm: 304, slots_occupied: 2 },
      power: { tdp_w: 285, recommended_psu_w: 700, power_connectors: [{ type: "16-pin", count: 1 }] },
    };
    const row = transformComponent(yaml);

    expect(row.id).toBe("nvidia-rtx-4070-ti-super");
    expect(row.type).toBe("gpu");
    expect(row).not.toHaveProperty("specs");
    if (row.type === "gpu") {
      expect(row.interface_pcie_gen).toBe(4);
      expect(row.interface_lanes).toBe(16);
      expect(row.physical_slot_width).toBe(2);
      expect(row.physical_length_mm).toBe(304);
      expect(row.physical_slots_occupied).toBe(2);
      expect(row.power_tdp_w).toBe(285);
      expect(row.power_recommended_psu_w).toBe(700);
      expect(row.power_connectors).toEqual([{ type: "16-pin", count: 1 }]);
    }
  });

  it("flattens RAM fields into typed columns", () => {
    const yaml: ComponentYAML = {
      id: "corsair-vengeance-ddr5-6000-32gb",
      type: "ram",
      manufacturer: "Corsair",
      model: "Vengeance DDR5-6000 32GB (2x16GB)",
      schema_version: "1.0",
      interface: { type: "DDR5", speed_mhz: 6000, base_speed_mhz: 4800 },
      capacity: { per_module_gb: 16, modules: 2, total_gb: 32 },
    };
    const row = transformComponent(yaml);

    expect(row.id).toBe("corsair-vengeance-ddr5-6000-32gb");
    expect(row.type).toBe("ram");
    expect(row).not.toHaveProperty("specs");
    if (row.type === "ram") {
      expect(row.interface_type).toBe("DDR5");
      expect(row.interface_speed_mhz).toBe(6000);
      expect(row.interface_base_speed_mhz).toBe(4800);
      expect(row.capacity_per_module_gb).toBe(16);
      expect(row.capacity_modules).toBe(2);
      expect(row.capacity_total_gb).toBe(32);
    }
  });

  it("flattens SATA fields into typed columns", () => {
    const yaml: ComponentYAML = {
      id: "samsung-870-evo-1tb",
      type: "sata_drive",
      manufacturer: "Samsung",
      model: "870 EVO 1TB",
      schema_version: "1.0",
      form_factor: "2.5",
      capacity_gb: 1000,
      interface: "SATA III",
    };
    const row = transformComponent(yaml);

    expect(row.id).toBe("samsung-870-evo-1tb");
    expect(row.type).toBe("sata_drive");
    expect(row).not.toHaveProperty("specs");
    if (row.type === "sata_drive") {
      expect(row.form_factor).toBe("2.5");
      expect(row.capacity_gb).toBe(1000);
      expect(row.interface).toBe("SATA III");
    }
  });

  it("passes through optional sku, sources, and contributed_by when present", () => {
    const yaml: ComponentYAML = {
      id: "test-component",
      type: "nvme",
      manufacturer: "TestCo",
      model: "Test Drive",
      sku: "TC-NV-001",
      sources: [{ type: "manufacturer", url: "https://example.com" }],
      contributed_by: "hake",
      schema_version: "1.0",
      interface: { protocol: "NVMe", pcie_gen: 4, lanes: 4 },
      form_factor: "2280",
      capacity_gb: 500,
    };
    const row = transformComponent(yaml);

    expect(row.sku).toBe("TC-NV-001");
    expect(row.sources).toEqual([{ type: "manufacturer", url: "https://example.com" }]);
    expect(row.contributed_by).toBe("hake");
  });

  it("sets updated_at to a valid ISO timestamp", () => {
    const yaml: ComponentYAML = {
      id: "test",
      type: "nvme",
      manufacturer: "T",
      model: "T",
      schema_version: "1.0",
      interface: { protocol: "NVMe", pcie_gen: 4, lanes: 4 },
      form_factor: "2280",
      capacity_gb: 100,
    };
    const before = new Date().toISOString();
    const row = transformComponent(yaml);
    const after = new Date().toISOString();

    expect(row.updated_at).toBeDefined();
    expect(row.updated_at >= before).toBe(true);
    expect(row.updated_at <= after).toBe(true);
  });

  it("returns correct shape with all expected keys", () => {
    const yaml: ComponentYAML = {
      id: "test",
      type: "nvme",
      manufacturer: "T",
      model: "T",
      schema_version: "1.0",
      interface: { protocol: "NVMe", pcie_gen: 4, lanes: 4 },
      form_factor: "2280",
      capacity_gb: 100,
    };
    const row = transformComponent(yaml);
    const expectedKeys: (keyof NvmeComponentRow)[] = [
      "id",
      "type",
      "manufacturer",
      "model",
      "sku",
      "summary_line",
      "sources",
      "contributed_by",
      "schema_version",
      "updated_at",
      "interface_protocol",
      "interface_pcie_gen",
      "interface_lanes",
      "form_factor",
      "capacity_gb",
      "capacity_variant_note",
    ];

    for (const key of expectedKeys) {
      expect(row).toHaveProperty(key);
    }
    expect(Object.keys(row)).toHaveLength(expectedKeys.length);
  });
});

describe("generateSummaryLine", () => {
  it("generates correct summary for NVMe (Samsung 990 PRO)", () => {
    const specs = {
      interface: { protocol: "NVMe", pcie_gen: 5, lanes: 4 },
      form_factor: "2280",
      capacity_gb: 2000,
    };
    const line = generateSummaryLine("nvme", specs);
    expect(line).toBe("NVMe, Gen5, x4, 2000 GB");
  });

  it("generates correct summary for NVMe (WD Black SN770)", () => {
    const specs = {
      interface: { protocol: "NVMe", pcie_gen: 4, lanes: 4 },
      form_factor: "2280",
      capacity_gb: 1000,
    };
    const line = generateSummaryLine("nvme", specs);
    expect(line).toBe("NVMe, Gen4, x4, 1000 GB");
  });

  it("generates correct summary for GPU (RTX 4070 Ti SUPER)", () => {
    const specs = {
      interface: { pcie_gen: 4, lanes: 16 },
      physical: { slot_width: 2, length_mm: 304 },
      power: { tdp_w: 285, recommended_psu_w: 700 },
    };
    const line = generateSummaryLine("gpu", specs);
    expect(line).toBe("PCIe Gen4, 285W TDP");
  });

  it("generates correct summary for RAM (Corsair Vengeance DDR5-6000)", () => {
    const specs = {
      interface: { type: "DDR5", speed_mhz: 6000, base_speed_mhz: 4800 },
      capacity: { per_module_gb: 16, modules: 2, total_gb: 32 },
    };
    const line = generateSummaryLine("ram", specs);
    expect(line).toBe("DDR5-6000, 32 GB");
  });

  it("generates correct summary for SATA drive (Samsung 870 EVO)", () => {
    const specs = {
      form_factor: "2.5",
      capacity_gb: 1000,
      interface: "SATA III",
    };
    const line = generateSummaryLine("sata_drive", specs);
    expect(line).toBe("2.5, 1000 GB");
  });

  it("returns empty string for unknown component type", () => {
    expect(generateSummaryLine("unknown_type", {})).toBe("");
  });

  it("handles NVMe with missing interface gracefully", () => {
    const line = generateSummaryLine("nvme", { capacity_gb: 500 });
    expect(line).toBe("NVMe, 500 GB");
  });

  it("handles GPU with missing power gracefully", () => {
    const specs = { interface: { pcie_gen: 5 } };
    const line = generateSummaryLine("gpu", specs);
    expect(line).toBe("PCIe Gen5");
  });

  it("handles RAM with missing capacity gracefully", () => {
    const specs = { interface: { type: "DDR4", speed_mhz: 3200 } };
    const line = generateSummaryLine("ram", specs);
    expect(line).toBe("DDR4-3200");
  });

  it("handles SATA drive with missing form_factor gracefully", () => {
    const line = generateSummaryLine("sata_drive", { capacity_gb: 2000 });
    expect(line).toBe("2000 GB");
  });
});

describe("assembleMotherboard", () => {
  const baseYaml: MotherboardYAML = {
    id: "test-board",
    manufacturer: "TestCo",
    model: "Test Board X",
    chipset: "Z890",
    socket: "LGA1851",
    form_factor: "ATX",
    schema_version: "1.0",
    memory: {
      type: "DDR5",
      max_speed_mhz: 8000,
      base_speed_mhz: 4800,
      max_capacity_gb: 128,
      ecc_support: false,
      channels: 2,
      slots: [
        { id: "dimm_a1", channel: "A", position: 1, recommended: true },
        { id: "dimm_b1", channel: "B", position: 1, recommended: true },
        { id: "dimm_a2", channel: "A", position: 2, recommended: false },
        { id: "dimm_b2", channel: "B", position: 2, recommended: false },
      ],
      recommended_population: {
        two_dimm: ["dimm_a1", "dimm_b1"],
      },
    },
    m2_slots: [
      {
        id: "m2_1",
        label: "M.2_1 (CPU)",
        interface: "PCIe",
        gen: 5,
        lanes: 4,
        form_factors: ["2280", "22110"],
        source: "CPU",
        supports_sata: false,
        heatsink_included: true,
        sharing: null,
      },
      {
        id: "m2_2",
        label: "M.2_2 (Chipset)",
        interface: "PCIe_or_SATA",
        gen: 4,
        lanes: 4,
        form_factors: ["2242", "2260", "2280"],
        source: "Chipset",
        supports_sata: true,
        heatsink_included: false,
        sharing: [
          {
            type: "disables",
            targets: ["sata_1", "sata_2"],
            condition: "M.2_2 is populated with a SATA device",
            effect: "SATA ports 1 and 2 are disabled",
          },
        ],
      },
    ],
    pcie_slots: [
      {
        id: "pcie_1",
        label: "PCIEX16_1 (CPU)",
        gen: 5,
        electrical_lanes: 16,
        physical_size: "x16",
        source: "CPU",
        reinforced: true,
        sharing: null,
      },
    ],
    sata_ports: [
      {
        id: "sata_1",
        version: "3.0",
        source: "Chipset",
        disabled_by: "m2_2",
      },
      {
        id: "sata_2",
        version: "3.0",
        source: "Chipset",
        disabled_by: null,
      },
    ],
    sources: [{ type: "manufacturer", url: "https://example.com" }],
  };

  it("reassembles top-level motherboard fields correctly", () => {
    const row = transformMotherboard(baseYaml);
    const slotRows = transformSlots(baseYaml);
    const result = assembleMotherboard(row, slotRows);

    expect(result.id).toBe("test-board");
    expect(result.manufacturer).toBe("TestCo");
    expect(result.model).toBe("Test Board X");
    expect(result.chipset).toBe("Z890");
    expect(result.socket).toBe("LGA1851");
    expect(result.form_factor).toBe("ATX");
    expect(result.schema_version).toBe("1.0");
    expect(result.sources).toEqual([{ type: "manufacturer", url: "https://example.com" }]);
  });

  it("reassembles memory config with slots and recommended_population", () => {
    const row = transformMotherboard(baseYaml);
    const slotRows = transformSlots(baseYaml);
    const result = assembleMotherboard(row, slotRows);

    expect(result.memory.type).toBe("DDR5");
    expect(result.memory.max_speed_mhz).toBe(8000);
    expect(result.memory.base_speed_mhz).toBe(4800);
    expect(result.memory.max_capacity_gb).toBe(128);
    expect(result.memory.ecc_support).toBe(false);
    expect(result.memory.channels).toBe(2);
    expect(result.memory.recommended_population.two_dimm).toEqual(["dimm_a1", "dimm_b1"]);
  });

  it("reassembles memory slots with correct fields", () => {
    const row = transformMotherboard(baseYaml);
    const slotRows = transformSlots(baseYaml);
    const result = assembleMotherboard(row, slotRows);

    expect(result.memory.slots).toHaveLength(4);
    const a1 = result.memory.slots.find(s => s.id === "dimm_a1")!;
    expect(a1.channel).toBe("A");
    expect(a1.position).toBe(1);
    expect(a1.recommended).toBe(true);

    const b2 = result.memory.slots.find(s => s.id === "dimm_b2")!;
    expect(b2.channel).toBe("B");
    expect(b2.position).toBe(2);
    expect(b2.recommended).toBe(false);
  });

  it("reassembles M.2 slots with all type-specific fields", () => {
    const row = transformMotherboard(baseYaml);
    const slotRows = transformSlots(baseYaml);
    const result = assembleMotherboard(row, slotRows);

    expect(result.m2_slots).toHaveLength(2);

    const m2_1 = result.m2_slots.find(s => s.id === "m2_1")!;
    expect(m2_1.label).toBe("M.2_1 (CPU)");
    expect(m2_1.interface).toBe("PCIe");
    expect(m2_1.gen).toBe(5);
    expect(m2_1.lanes).toBe(4);
    expect(m2_1.form_factors).toEqual(["2280", "22110"]);
    expect(m2_1.source).toBe("CPU");
    expect(m2_1.supports_sata).toBe(false);
    expect(m2_1.heatsink_included).toBe(true);
    expect(m2_1.sharing).toBeNull();

    const m2_2 = result.m2_slots.find(s => s.id === "m2_2")!;
    expect(m2_2.interface).toBe("PCIe_or_SATA");
    expect(m2_2.supports_sata).toBe(true);
    expect(m2_2.sharing).toEqual([
      {
        type: "disables",
        targets: ["sata_1", "sata_2"],
        condition: "M.2_2 is populated with a SATA device",
        effect: "SATA ports 1 and 2 are disabled",
      },
    ]);
  });

  it("reassembles PCIe slots with all type-specific fields", () => {
    const row = transformMotherboard(baseYaml);
    const slotRows = transformSlots(baseYaml);
    const result = assembleMotherboard(row, slotRows);

    expect(result.pcie_slots).toHaveLength(1);
    const pcie = result.pcie_slots[0];
    expect(pcie.id).toBe("pcie_1");
    expect(pcie.label).toBe("PCIEX16_1 (CPU)");
    expect(pcie.gen).toBe(5);
    expect(pcie.electrical_lanes).toBe(16);
    expect(pcie.physical_size).toBe("x16");
    expect(pcie.source).toBe("CPU");
    expect(pcie.reinforced).toBe(true);
    expect(pcie.sharing).toBeNull();
  });

  it("reassembles SATA ports with disabled_by field", () => {
    const row = transformMotherboard(baseYaml);
    const slotRows = transformSlots(baseYaml);
    const result = assembleMotherboard(row, slotRows);

    expect(result.sata_ports).toHaveLength(2);

    const sata_1 = result.sata_ports.find(s => s.id === "sata_1")!;
    expect(sata_1.version).toBe("3.0");
    expect(sata_1.source).toBe("Chipset");
    expect(sata_1.disabled_by).toBe("m2_2");

    const sata_2 = result.sata_ports.find(s => s.id === "sata_2")!;
    expect(sata_2.disabled_by).toBeNull();
  });

  it("handles empty slot arrays correctly", () => {
    const emptyYaml: MotherboardYAML = {
      ...baseYaml,
      memory: { ...baseYaml.memory, slots: [] },
      m2_slots: [],
      pcie_slots: [],
      sata_ports: [],
    };
    const row = transformMotherboard(emptyYaml);
    const slotRows = transformSlots(emptyYaml);
    const result = assembleMotherboard(row, slotRows);

    expect(result.memory.slots).toEqual([]);
    expect(result.m2_slots).toEqual([]);
    expect(result.pcie_slots).toEqual([]);
    expect(result.sata_ports).toEqual([]);
  });

  it("preserves slot count per category through round-trip", () => {
    const row = transformMotherboard(baseYaml);
    const slotRows = transformSlots(baseYaml);
    const result = assembleMotherboard(row, slotRows);

    expect(result.memory.slots).toHaveLength(baseYaml.memory.slots.length);
    expect(result.m2_slots).toHaveLength(baseYaml.m2_slots.length);
    expect(result.pcie_slots).toHaveLength(baseYaml.pcie_slots.length);
    expect(result.sata_ports).toHaveLength(baseYaml.sata_ports.length);
  });
});

describe("discoverYamlFiles", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "discover-yaml-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("discovers YAML files under data/motherboards/ and data/components/", () => {
    // Create directory structure
    fs.mkdirSync(path.join(tmpDir, "data", "motherboards", "asus"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "data", "components", "nvme"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "data", "motherboards", "asus", "board.yaml"), "id: board");
    fs.writeFileSync(path.join(tmpDir, "data", "components", "nvme", "drive.yaml"), "id: drive");

    const files = discoverYamlFiles(tmpDir);
    expect(files).toHaveLength(2);
    expect(files.some(f => f.endsWith("board.yaml"))).toBe(true);
    expect(files.some(f => f.endsWith("drive.yaml"))).toBe(true);
  });

  it("returns absolute file paths", () => {
    fs.mkdirSync(path.join(tmpDir, "data", "motherboards"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "data", "motherboards", "test.yaml"), "id: test");

    const files = discoverYamlFiles(tmpDir);
    expect(files).toHaveLength(1);
    expect(path.isAbsolute(files[0])).toBe(true);
  });

  it("recursively discovers nested YAML files", () => {
    fs.mkdirSync(path.join(tmpDir, "data", "motherboards", "msi", "sub"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "data", "motherboards", "msi", "a.yaml"), "id: a");
    fs.writeFileSync(path.join(tmpDir, "data", "motherboards", "msi", "sub", "b.yaml"), "id: b");

    const files = discoverYamlFiles(tmpDir);
    expect(files).toHaveLength(2);
  });

  it("ignores non-YAML files", () => {
    fs.mkdirSync(path.join(tmpDir, "data", "motherboards"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "data", "motherboards", "board.yaml"), "id: board");
    fs.writeFileSync(path.join(tmpDir, "data", "motherboards", "readme.md"), "# readme");
    fs.writeFileSync(path.join(tmpDir, "data", "motherboards", "data.json"), "{}");

    const files = discoverYamlFiles(tmpDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain("board.yaml");
  });

  it("discovers files across all component types", () => {
    for (const type of ["nvme", "gpu", "ram", "sata"]) {
      fs.mkdirSync(path.join(tmpDir, "data", "components", type), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "data", "components", type, `${type}-item.yaml`), `id: ${type}-item`);
    }

    const files = discoverYamlFiles(tmpDir);
    expect(files).toHaveLength(4);
  });

  it("returns empty array when directories do not exist", () => {
    const files = discoverYamlFiles(tmpDir);
    expect(files).toEqual([]);
  });

  it("works with the real project data directory", () => {
    const projectRoot = path.resolve(__dirname, "../..");
    const files = discoverYamlFiles(projectRoot);

    // We know the project has YAML files in data/motherboards and data/components
    expect(files.length).toBeGreaterThan(0);
    expect(files.every(f => f.endsWith(".yaml"))).toBe(true);
    expect(files.every(f => path.isAbsolute(f))).toBe(true);
  });
});

describe("routeSchema", () => {
  it("routes motherboard files to motherboard.schema.json", () => {
    const result = routeSchema("/project/data/motherboards/asus/board.yaml");
    expect(result).not.toBeNull();
    expect(result!.replace(/\\/g, "/")).toContain("data/schema/motherboard.schema.json");
  });

  it("routes nested motherboard files correctly", () => {
    const result = routeSchema("/project/data/motherboards/msi/sub/board.yaml");
    expect(result).not.toBeNull();
    expect(result!.replace(/\\/g, "/")).toContain("data/schema/motherboard.schema.json");
  });

  it("routes nvme component files to component-nvme.schema.json", () => {
    const result = routeSchema("/project/data/components/nvme/samsung-990-pro.yaml");
    expect(result).not.toBeNull();
    expect(result!.replace(/\\/g, "/")).toContain("data/schema/component-nvme.schema.json");
  });

  it("routes gpu component files to component-gpu.schema.json", () => {
    const result = routeSchema("/project/data/components/gpu/rtx-4070.yaml");
    expect(result).not.toBeNull();
    expect(result!.replace(/\\/g, "/")).toContain("data/schema/component-gpu.schema.json");
  });

  it("routes ram component files to component-ram.schema.json", () => {
    const result = routeSchema("/project/data/components/ram/corsair-ddr5.yaml");
    expect(result).not.toBeNull();
    expect(result!.replace(/\\/g, "/")).toContain("data/schema/component-ram.schema.json");
  });

  it("routes sata component files to component-sata.schema.json", () => {
    const result = routeSchema("/project/data/components/sata/samsung-870.yaml");
    expect(result).not.toBeNull();
    expect(result!.replace(/\\/g, "/")).toContain("data/schema/component-sata.schema.json");
  });

  it("returns null for files outside recognized directories", () => {
    expect(routeSchema("/project/data/other/file.yaml")).toBeNull();
    expect(routeSchema("/project/src/lib/types.ts")).toBeNull();
    expect(routeSchema("/project/scripts/sync.ts")).toBeNull();
  });

  it("returns null for unrecognized component types", () => {
    expect(routeSchema("/project/data/components/unknown/item.yaml")).toBeNull();
  });

  it("derives the base directory from the file path", () => {
    const result = routeSchema("/home/user/projects/pcslotcheck/data/motherboards/asus/board.yaml");
    expect(result).not.toBeNull();
    // The schema path should be relative to the same base
    expect(result!.replace(/\\/g, "/")).toContain("/home/user/projects/pcslotcheck/");
    expect(result!.replace(/\\/g, "/").endsWith("data/schema/motherboard.schema.json")).toBe(true);
  });

  it("handles Windows-style backslash paths", () => {
    const result = routeSchema("C:\\projects\\pcslotcheck\\data\\motherboards\\asus\\board.yaml");
    expect(result).not.toBeNull();
    expect(result!.replace(/\\/g, "/")).toContain("data/schema/motherboard.schema.json");
  });
});


describe("parseAndValidateFile", () => {
  const projectRoot = path.resolve(__dirname, "../..");
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "parse-validate-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("parses and validates a real motherboard YAML file", () => {
    const filePath = path.join(
      projectRoot,
      "data/motherboards/asus/asus-rog-strix-z890-f-gaming-wifi.yaml"
    );
    const result = parseAndValidateFile(filePath);

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.type).toBe("motherboard");
      expect((result.data as MotherboardYAML).id).toBe("asus-rog-strix-z890-f-gaming-wifi");
      expect((result.data as MotherboardYAML).manufacturer).toBe("ASUS");
    }
  });

  it("parses and validates a real component YAML file", () => {
    const filePath = path.join(
      projectRoot,
      "data/components/nvme/samsung-990-pro-2tb.yaml"
    );
    const result = parseAndValidateFile(filePath);

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.type).toBe("component");
      expect((result.data as ComponentYAML).id).toBe("samsung-990-pro-2tb");
      expect((result.data as ComponentYAML).type).toBe("nvme");
    }
  });

  it("returns an error for malformed YAML", () => {
    // Create a directory structure that matches the schema routing pattern
    const mbDir = path.join(tmpDir, "data", "motherboards", "test");
    fs.mkdirSync(mbDir, { recursive: true });
    const filePath = path.join(mbDir, "bad.yaml");
    fs.writeFileSync(filePath, ":\n  - :\n    bad: [unclosed");

    const result = parseAndValidateFile(filePath);

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("YAML parse error");
    }
  });

  it("returns an error for YAML that fails schema validation", () => {
    // Create a motherboard YAML file that parses but fails schema validation
    const mbDir = path.join(tmpDir, "data", "motherboards", "test");
    fs.mkdirSync(mbDir, { recursive: true });

    // Copy the real schema so ajv can find it
    const schemaDir = path.join(tmpDir, "data", "schema");
    fs.mkdirSync(schemaDir, { recursive: true });
    fs.copyFileSync(
      path.join(projectRoot, "data/schema/motherboard.schema.json"),
      path.join(schemaDir, "motherboard.schema.json")
    );

    const filePath = path.join(mbDir, "invalid-board.yaml");
    // Valid YAML but missing required fields for motherboard schema
    fs.writeFileSync(filePath, "id: invalid-board\nmanufacturer: Test\n");

    const result = parseAndValidateFile(filePath);

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("Schema validation failed");
    }
  });

  it("returns an error for files outside recognized directories", () => {
    const filePath = path.join(tmpDir, "random", "file.yaml");
    fs.mkdirSync(path.join(tmpDir, "random"), { recursive: true });
    fs.writeFileSync(filePath, "id: test\n");

    const result = parseAndValidateFile(filePath);

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("Could not determine schema");
    }
  });

  it("returns an error for a non-existent file", () => {
    const filePath = path.join(tmpDir, "data", "motherboards", "ghost.yaml");

    const result = parseAndValidateFile(filePath);

    // routeSchema returns null because the path doesn't match, OR read fails
    expect("error" in result).toBe(true);
  });
});

describe("computeOrphans", () => {
  it("returns IDs in DB but not in YAML", () => {
    const dbIds = ["a", "b", "c", "d"];
    const yamlIds = ["a", "c"];
    expect(computeOrphans(dbIds, yamlIds)).toEqual(["b", "d"]);
  });

  it("returns empty array when all DB IDs are in YAML", () => {
    const dbIds = ["a", "b"];
    const yamlIds = ["a", "b", "c"];
    expect(computeOrphans(dbIds, yamlIds)).toEqual([]);
  });

  it("returns all DB IDs when YAML set is empty", () => {
    const dbIds = ["x", "y", "z"];
    expect(computeOrphans(dbIds, [])).toEqual(["x", "y", "z"]);
  });

  it("returns empty array when both sets are empty", () => {
    expect(computeOrphans([], [])).toEqual([]);
  });

  it("returns empty array when DB set is empty", () => {
    expect(computeOrphans([], ["a", "b"])).toEqual([]);
  });

  it("handles duplicate IDs in DB list correctly", () => {
    const dbIds = ["a", "b", "a", "c"];
    const yamlIds = ["a"];
    expect(computeOrphans(dbIds, yamlIds)).toEqual(["b", "c"]);
  });
});

describe("Sync exit code logic", () => {
  it("indicates success (exit 0) when filesSkipped is 0", () => {
    const result: import("../../scripts/sync").SyncResult = {
      motherboardsSynced: 2,
      componentsSynced: 5,
      motherboardsDeleted: 0,
      componentsDeleted: 0,
      filesSkipped: 0,
      errors: [],
    };

    expect(result.filesSkipped).toBe(0);
    // Exit code 0: no files skipped
    const exitCode = result.filesSkipped > 0 ? 1 : 0;
    expect(exitCode).toBe(0);
  });

  it("indicates failure (exit 1) when filesSkipped > 0", () => {
    const result: import("../../scripts/sync").SyncResult = {
      motherboardsSynced: 1,
      componentsSynced: 3,
      motherboardsDeleted: 0,
      componentsDeleted: 0,
      filesSkipped: 2,
      errors: [
        { file: "bad1.yaml", error: "parse error" },
        { file: "bad2.yaml", error: "schema validation failed" },
      ],
    };

    expect(result.filesSkipped).toBeGreaterThan(0);
    const exitCode = result.filesSkipped > 0 ? 1 : 0;
    expect(exitCode).toBe(1);
  });

  it("tracks errors alongside skipped count", () => {
    const result: import("../../scripts/sync").SyncResult = {
      motherboardsSynced: 0,
      componentsSynced: 0,
      motherboardsDeleted: 0,
      componentsDeleted: 0,
      filesSkipped: 1,
      errors: [{ file: "broken.yaml", error: "YAML parse error" }],
    };

    expect(result.errors).toHaveLength(result.filesSkipped);
    expect(result.errors[0].file).toBe("broken.yaml");
  });
});


describe("extractComponentSpecs", () => {
  it("extracts NVMe specs: capacity_gb, interface.protocol, interface.pcie_gen", () => {
    const yaml: ComponentYAML = {
      id: "samsung-990-pro-2tb",
      type: "nvme",
      manufacturer: "Samsung",
      model: "990 PRO 2TB",
      schema_version: "1.0",
      interface: { protocol: "NVMe", pcie_gen: 5, lanes: 4 },
      form_factor: "2280",
      capacity_gb: 2000,
    };
    const specs = extractComponentSpecs(yaml);
    expect(specs).toEqual({
      capacity_gb: 2000,
      "interface.protocol": "NVMe",
      "interface.pcie_gen": 5,
    });
  });

  it("extracts GPU specs: interface.pcie_gen, power.tdp_w, physical.length_mm", () => {
    const yaml: ComponentYAML = {
      id: "nvidia-rtx-4070-ti-super",
      type: "gpu",
      manufacturer: "NVIDIA",
      model: "GeForce RTX 4070 Ti SUPER",
      schema_version: "1.0",
      interface: { pcie_gen: 4, lanes: 16 },
      physical: { slot_width: 2, length_mm: 304 },
      power: { tdp_w: 285, recommended_psu_w: 700 },
    };
    const specs = extractComponentSpecs(yaml);
    expect(specs).toEqual({
      "interface.pcie_gen": 4,
      "power.tdp_w": 285,
      "physical.length_mm": 304,
    });
  });

  it("extracts RAM specs: interface.type, interface.speed_mhz, capacity.total_gb", () => {
    const yaml: ComponentYAML = {
      id: "corsair-vengeance-ddr5-6000-32gb",
      type: "ram",
      manufacturer: "Corsair",
      model: "Vengeance DDR5-6000 32GB (2x16GB)",
      schema_version: "1.0",
      interface: { type: "DDR5", speed_mhz: 6000, base_speed_mhz: 4800 },
      capacity: { per_module_gb: 16, modules: 2, total_gb: 32 },
    };
    const specs = extractComponentSpecs(yaml);
    expect(specs).toEqual({
      "interface.type": "DDR5",
      "interface.speed_mhz": 6000,
      "capacity.total_gb": 32,
    });
  });

  it("extracts SATA drive specs: capacity_gb, form_factor", () => {
    const yaml: ComponentYAML = {
      id: "samsung-870-evo-1tb",
      type: "sata_drive",
      manufacturer: "Samsung",
      model: "870 EVO 1TB",
      schema_version: "1.0",
      form_factor: "2.5",
      capacity_gb: 1000,
      interface: "SATA III",
    };
    const specs = extractComponentSpecs(yaml);
    expect(specs).toEqual({
      capacity_gb: 1000,
      form_factor: "2.5",
    });
  });

  it("returns empty object for unknown component type", () => {
    const yaml: ComponentYAML = {
      id: "unknown-thing",
      type: "unknown",
      manufacturer: "X",
      model: "Y",
      schema_version: "1.0",
    };
    expect(extractComponentSpecs(yaml)).toEqual({});
  });
});

describe("generateManifest", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "manifest-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const sampleMotherboards: MotherboardYAML[] = [
    {
      id: "msi-mag-x870-tomahawk-wifi",
      manufacturer: "MSI",
      model: "MAG X870 TOMAHAWK WIFI",
      chipset: "X870",
      socket: "AM5",
      form_factor: "ATX",
      schema_version: "1.0",
      memory: {
        type: "DDR5",
        max_speed_mhz: 8000,
        base_speed_mhz: 4800,
        max_capacity_gb: 128,
        ecc_support: false,
        channels: 2,
        slots: [],
        recommended_population: { two_dimm: [] },
      },
      m2_slots: [],
      pcie_slots: [],
      sata_ports: [],
      sources: [{ type: "manufacturer", url: "https://msi.com" }],
    },
    {
      id: "asus-rog-strix-z890-f-gaming-wifi",
      manufacturer: "ASUS",
      model: "ROG STRIX Z890-F GAMING WIFI",
      chipset: "Z890",
      socket: "LGA1851",
      form_factor: "ATX",
      schema_version: "1.0",
      memory: {
        type: "DDR5",
        max_speed_mhz: 9000,
        base_speed_mhz: 4800,
        max_capacity_gb: 192,
        ecc_support: false,
        channels: 2,
        slots: [],
        recommended_population: { two_dimm: [] },
      },
      m2_slots: [],
      pcie_slots: [],
      sata_ports: [],
      sources: [{ type: "manufacturer", url: "https://asus.com" }],
    },
  ];

  const sampleComponents: ComponentYAML[] = [
    {
      id: "samsung-990-pro-2tb",
      type: "nvme",
      manufacturer: "Samsung",
      model: "990 PRO 2TB",
      schema_version: "1.0",
      interface: { protocol: "NVMe", pcie_gen: 5, lanes: 4 },
      form_factor: "2280",
      capacity_gb: 2000,
    },
    {
      id: "corsair-vengeance-ddr5-6000-32gb",
      type: "ram",
      manufacturer: "Corsair",
      model: "Vengeance DDR5-6000 32GB (2x16GB)",
      schema_version: "1.0",
      interface: { type: "DDR5", speed_mhz: 6000, base_speed_mhz: 4800 },
      capacity: { per_module_gb: 16, modules: 2, total_gb: 32 },
    },
  ];

  it("writes data-manifest.json to the specified base directory", () => {
    generateManifest(tmpDir, sampleMotherboards, sampleComponents);
    const manifestPath = path.join(tmpDir, "data-manifest.json");
    expect(fs.existsSync(manifestPath)).toBe(true);
  });

  it("produces valid JSON matching the DataManifest format", () => {
    generateManifest(tmpDir, sampleMotherboards, sampleComponents);
    const content = JSON.parse(fs.readFileSync(path.join(tmpDir, "data-manifest.json"), "utf-8"));
    expect(content).toHaveProperty("motherboards");
    expect(content).toHaveProperty("components");
    expect(Array.isArray(content.motherboards)).toBe(true);
    expect(Array.isArray(content.components)).toBe(true);
  });

  it("includes correct motherboard summary fields", () => {
    generateManifest(tmpDir, sampleMotherboards, sampleComponents);
    const content = JSON.parse(fs.readFileSync(path.join(tmpDir, "data-manifest.json"), "utf-8"));
    const mb = content.motherboards[0]; // sorted by id, ASUS comes first
    expect(mb.id).toBe("asus-rog-strix-z890-f-gaming-wifi");
    expect(mb.manufacturer).toBe("ASUS");
    expect(mb.model).toBe("ROG STRIX Z890-F GAMING WIFI");
    expect(mb.socket).toBe("LGA1851");
    expect(mb.chipset).toBe("Z890");
    expect(mb.form_factor).toBe("ATX");
    // Should NOT include memory, slots, sources, etc.
    expect(mb).not.toHaveProperty("memory");
    expect(mb).not.toHaveProperty("sources");
  });

  it("includes correct component summary fields with extracted specs", () => {
    generateManifest(tmpDir, sampleMotherboards, sampleComponents);
    const content = JSON.parse(fs.readFileSync(path.join(tmpDir, "data-manifest.json"), "utf-8"));
    const ramComp = content.components.find((c: { id: string }) => c.id === "corsair-vengeance-ddr5-6000-32gb");
    expect(ramComp.type).toBe("ram");
    expect(ramComp.manufacturer).toBe("Corsair");
    expect(ramComp.model).toBe("Vengeance DDR5-6000 32GB (2x16GB)");
    expect(ramComp.specs).toEqual({
      "capacity.total_gb": 32,
      "interface.speed_mhz": 6000,
      "interface.type": "DDR5",
    });
  });

  it("sorts motherboards by id ascending", () => {
    generateManifest(tmpDir, sampleMotherboards, sampleComponents);
    const content = JSON.parse(fs.readFileSync(path.join(tmpDir, "data-manifest.json"), "utf-8"));
    const ids = content.motherboards.map((m: { id: string }) => m.id);
    expect(ids).toEqual([...ids].sort());
    expect(ids[0]).toBe("asus-rog-strix-z890-f-gaming-wifi");
    expect(ids[1]).toBe("msi-mag-x870-tomahawk-wifi");
  });

  it("sorts components by id ascending", () => {
    generateManifest(tmpDir, sampleMotherboards, sampleComponents);
    const content = JSON.parse(fs.readFileSync(path.join(tmpDir, "data-manifest.json"), "utf-8"));
    const ids = content.components.map((c: { id: string }) => c.id);
    expect(ids).toEqual([...ids].sort());
  });

  it("sorts JSON keys for deterministic output", () => {
    generateManifest(tmpDir, sampleMotherboards, sampleComponents);
    const raw = fs.readFileSync(path.join(tmpDir, "data-manifest.json"), "utf-8");
    const content = JSON.parse(raw);
    // Top-level keys should be sorted: "components" before "motherboards"
    const topKeys = Object.keys(content);
    expect(topKeys).toEqual(["components", "motherboards"]);
  });

  it("handles empty arrays gracefully", () => {
    generateManifest(tmpDir, [], []);
    const content = JSON.parse(fs.readFileSync(path.join(tmpDir, "data-manifest.json"), "utf-8"));
    expect(content.motherboards).toEqual([]);
    expect(content.components).toEqual([]);
  });
});
