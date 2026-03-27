import { describe, it, expect } from "vitest";
import * as path from "path";
import {
  transformComponent,
  reconstructComponent,
  COMPONENT_TABLE_MAP,
  computeOrphans,
  parseAndValidateFile,
  type PerTypeComponentRow,
  type NvmeComponentRow,
  type GpuComponentRow,
  type RamComponentRow,
  type SataComponentRow,
  type ComponentYAML,
} from "../../scripts/sync";

// ─── 6.1: Per-type transform with real seed data ─────────────────────

describe("per-type transform with real seed data", () => {
  it("NVMe (samsung-990-pro-2tb) transforms to correct typed columns", () => {
    const filePath = path.resolve(__dirname, "../../data/components/nvme/samsung-990-pro-2tb.yaml");
    const parsed = parseAndValidateFile(filePath);
    expect("data" in parsed).toBe(true);
    if (!("data" in parsed)) return;

    const row = transformComponent(parsed.data as ComponentYAML);
    expect(row.type).toBe("nvme");
    if (row.type !== "nvme") return;

    expect(row.interface_protocol).toBe("NVMe");
    expect(row.interface_pcie_gen).toBe(5);
    expect(row.interface_lanes).toBe(4);
    expect(row.form_factor).toBe("2280");
    expect(row.capacity_gb).toBe(2000);
  });

  it("GPU (nvidia-rtx-4070-ti-super) transforms to correct typed columns", () => {
    const filePath = path.resolve(__dirname, "../../data/components/gpu/nvidia-rtx-4070-ti-super.yaml");
    const parsed = parseAndValidateFile(filePath);
    expect("data" in parsed).toBe(true);
    if (!("data" in parsed)) return;

    const row = transformComponent(parsed.data as ComponentYAML);
    expect(row.type).toBe("gpu");
    if (row.type !== "gpu") return;

    expect(row.chip_manufacturer).toBe("NVIDIA");
    expect(row.interface_pcie_gen).toBe(4);
    expect(row.interface_lanes).toBe(16);
    expect(row.physical_slot_width).toBe(3);
    expect(row.physical_length_mm).toBe(310);
    expect(row.physical_slots_occupied).toBe(3);
    expect(row.power_tdp_w).toBe(285);
  });

  it("RAM (corsair-vengeance-ddr5-6000-32gb) transforms to correct typed columns", () => {
    const filePath = path.resolve(__dirname, "../../data/components/ram/corsair-vengeance-ddr5-6000-32gb.yaml");
    const parsed = parseAndValidateFile(filePath);
    expect("data" in parsed).toBe(true);
    if (!("data" in parsed)) return;

    const row = transformComponent(parsed.data as ComponentYAML);
    expect(row.type).toBe("ram");
    if (row.type !== "ram") return;

    expect(row.interface_type).toBe("DDR5");
    expect(row.interface_speed_mhz).toBe(6000);
    expect(row.interface_base_speed_mhz).toBe(4800);
    expect(row.capacity_per_module_gb).toBe(16);
    expect(row.capacity_modules).toBe(2);
    expect(row.capacity_total_gb).toBe(32);
  });

  it("SATA SSD (samsung-870-evo-1tb) transforms to correct typed columns", () => {
    const filePath = path.resolve(__dirname, "../../data/components/sata-ssd/samsung-870-evo-1tb.yaml");
    const parsed = parseAndValidateFile(filePath);
    expect("data" in parsed).toBe(true);
    if (!("data" in parsed)) return;

    const row = transformComponent(parsed.data as ComponentYAML);
    expect(row.type).toBe("sata_drive");
    if (row.type !== "sata_drive") return;

    expect(row.form_factor).toBe("2.5");
    expect(row.capacity_gb).toBe(1000);
    expect(row.interface).toBe("SATA III");
  });
});

// ─── 6.2: Reconstruction edge cases ─────────────────────────────────

describe("reconstruction edge cases", () => {
  it("NVMe with null pcie_gen and lanes (SATA M.2 protocol)", () => {
    const row: NvmeComponentRow = {
      id: "test-sata-m2",
      type: "nvme",
      manufacturer: "TestCo",
      model: "Test SATA M.2",
      sku: null,
      summary_line: "SATA, 500 GB",
      sources: null,
      contributed_by: null,
      schema_version: "1.0",
      updated_at: new Date().toISOString(),
      interface_protocol: "SATA",
      interface_pcie_gen: null,
      interface_lanes: null,
      form_factor: "2280",
      capacity_gb: 500,
      capacity_variant_note: null,
    };

    const component = reconstructComponent(row);
    expect(component.type).toBe("nvme");
    if (component.type !== "nvme") return;

    expect(component.interface.protocol).toBe("SATA");
    expect(component.interface.pcie_gen).toBeNull();
    expect(component.interface.lanes).toBeNull();
  });

  it("GPU with null power_recommended_psu_w", () => {
    const row: GpuComponentRow = {
      id: "test-gpu-no-psu",
      type: "gpu",
      manufacturer: "TestCo",
      model: "Test GPU",
      sku: null,
      summary_line: "PCIe Gen4, 150W TDP",
      sources: null,
      contributed_by: null,
      schema_version: "1.0",
      updated_at: new Date().toISOString(),
      chip_manufacturer: "NVIDIA",
      interface_pcie_gen: 4,
      interface_lanes: 16,
      physical_slot_width: 2,
      physical_length_mm: 250,
      physical_slots_occupied: 2,
      power_tdp_w: 150,
      power_recommended_psu_w: null,
      power_connectors: [{ type: "8-pin", count: 1 }],
    };

    const component = reconstructComponent(row);
    expect(component.type).toBe("gpu");
    if (component.type !== "gpu") return;

    expect(component.power.recommended_psu_w).toBeNull();
  });

  it("RAM with null interface_base_speed_mhz", () => {
    const row: RamComponentRow = {
      id: "test-ram-no-base",
      type: "ram",
      manufacturer: "TestCo",
      model: "Test RAM",
      sku: null,
      summary_line: "DDR4-3200, 16 GB",
      sources: null,
      contributed_by: null,
      schema_version: "1.0",
      updated_at: new Date().toISOString(),
      interface_type: "DDR4",
      interface_speed_mhz: 3200,
      interface_base_speed_mhz: null,
      capacity_per_module_gb: 8,
      capacity_modules: 2,
      capacity_total_gb: 16,
    };

    const component = reconstructComponent(row);
    expect(component.type).toBe("ram");
    if (component.type !== "ram") return;

    expect(component.interface.base_speed_mhz).toBeNull();
  });

  it("table routing returns undefined for unknown types", () => {
    expect(COMPONENT_TABLE_MAP["unknown"]).toBeUndefined();
    expect(COMPONENT_TABLE_MAP[""]).toBeUndefined();
  });
});

// ─── 6.3: SyncResult counting (computeOrphans aggregation) ──────────

describe("SyncResult counting via computeOrphans", () => {
  it("identifies orphans correctly (DB has extras)", () => {
    const orphans = computeOrphans(["a", "b", "c"], ["a"]);
    expect(orphans).toEqual(["b", "c"]);
    expect(orphans).toHaveLength(2);
  });

  it("returns empty when all DB IDs are synced", () => {
    const orphans = computeOrphans(["x"], ["x"]);
    expect(orphans).toEqual([]);
    expect(orphans).toHaveLength(0);
  });

  it("returns all DB IDs when nothing is synced", () => {
    const orphans = computeOrphans(["a", "b"], []);
    expect(orphans).toEqual(["a", "b"]);
    expect(orphans).toHaveLength(2);
  });

  it("summing orphan counts across multiple calls gives correct total", () => {
    const nvmeOrphans = computeOrphans(["n1", "n2", "n3"], ["n1"]);
    const gpuOrphans = computeOrphans(["g1"], ["g1"]);
    const ramOrphans = computeOrphans(["r1", "r2"], []);
    const sataOrphans = computeOrphans(["s1", "s2"], ["s1", "s2"]);

    const totalDeleted =
      nvmeOrphans.length + gpuOrphans.length + ramOrphans.length + sataOrphans.length;

    expect(nvmeOrphans).toEqual(["n2", "n3"]);
    expect(gpuOrphans).toEqual([]);
    expect(ramOrphans).toEqual(["r1", "r2"]);
    expect(sataOrphans).toEqual([]);
    expect(totalDeleted).toBe(4);
  });
});
