import { describe, it, expect } from "vitest";
import { validateAssignments } from "../../src/lib/validation-engine";
import type {
  Motherboard,
  NVMeComponent,
  GPUComponent,
  Component,
  M2Slot,
} from "../../src/lib/types";

// --- Helpers to build minimal test fixtures ---

function makeM2Slot(overrides: Partial<M2Slot> = {}): M2Slot {
  return {
    id: "m2_1",
    label: "M2_1",
    interface: "PCIe",
    gen: 4,
    lanes: 4,
    form_factors: ["2280"],
    source: "CPU",
    supports_sata: false,
    heatsink_included: false,
    sharing: null,
    ...overrides,
  };
}

function makeMotherboard(m2Slots: M2Slot[] = []): Motherboard {
  return {
    id: "test-board",
    manufacturer: "Test",
    model: "Test Board",
    chipset: "Z890",
    socket: "LGA1851",
    form_factor: "ATX",
    memory: {
      type: "DDR5",
      max_speed_mhz: 6400,
      base_speed_mhz: 4800,
      max_capacity_gb: 192,
      ecc_support: false,
      channels: 2,
      slots: [],
      recommended_population: { two_dimm: [] },
    },
    m2_slots: m2Slots,
    pcie_slots: [],
    sata_ports: [],
    sources: [],
    schema_version: "1.0",
  };
}

function makeNVMe(overrides: Partial<NVMeComponent> = {}): NVMeComponent {
  return {
    id: "test-nvme",
    type: "nvme",
    manufacturer: "Test",
    model: "Test NVMe",
    interface: { protocol: "NVMe", pcie_gen: 4, lanes: 4 },
    form_factor: "2280",
    capacity_gb: 1000,
    schema_version: "1.0",
    ...overrides,
  };
}

// --- Severity-level tests with concrete data ---

describe("validateAssignments", () => {
  describe("error severity: SATA-protocol NVMe in PCIe-only M.2 slot", () => {
    it("returns an error when Samsung 870 EVO (SATA protocol) is assigned to an NVMe-only slot", () => {
      const slot = makeM2Slot({ id: "m2_1", label: "M2_1", gen: 4, supports_sata: false });
      const board = makeMotherboard([slot]);

      // NVMe-form-factor drive that uses SATA protocol (like an 870 EVO M.2 variant)
      const sataM2: NVMeComponent = makeNVMe({
        id: "samsung-870-evo-1tb",
        manufacturer: "Samsung",
        model: "870 EVO 1TB",
        interface: { protocol: "SATA", pcie_gen: null, lanes: null },
      });

      const results = validateAssignments(
        board,
        { m2_1: "samsung-870-evo-1tb" },
        { "samsung-870-evo-1tb": sataM2 }
      );

      expect(results).toHaveLength(1);
      expect(results[0].severity).toBe("error");
      expect(results[0].slotId).toBe("m2_1");
      expect(results[0].componentId).toBe("samsung-870-evo-1tb");
      expect(results[0].message).toContain("SATA");
    });
  });

  describe("warning severity: Gen5 NVMe in Gen4 M.2 slot", () => {
    it("returns a warning when Samsung 990 PRO (Gen5) is assigned to a Gen4 slot", () => {
      const slot = makeM2Slot({ id: "m2_1", label: "M2_1", gen: 4, supports_sata: false });
      const board = makeMotherboard([slot]);

      const gen5Drive: NVMeComponent = makeNVMe({
        id: "samsung-990-pro-2tb",
        manufacturer: "Samsung",
        model: "990 PRO 2TB",
        interface: { protocol: "NVMe", pcie_gen: 5, lanes: 4 },
      });

      const results = validateAssignments(
        board,
        { m2_1: "samsung-990-pro-2tb" },
        { "samsung-990-pro-2tb": gen5Drive }
      );

      expect(results).toHaveLength(1);
      expect(results[0].severity).toBe("warning");
      expect(results[0].slotId).toBe("m2_1");
      expect(results[0].componentId).toBe("samsung-990-pro-2tb");
      expect(results[0].message).toContain("Gen5");
      expect(results[0].message).toContain("Gen4");
    });
  });

  describe("info severity: Gen4 NVMe in Gen5 M.2 slot", () => {
    it("returns an info when WD Black SN770 (Gen4) is assigned to a Gen5 slot", () => {
      const slot = makeM2Slot({ id: "m2_1", label: "M2_1", gen: 5, supports_sata: false });
      const board = makeMotherboard([slot]);

      const gen4Drive: NVMeComponent = makeNVMe({
        id: "wd-black-sn770-1tb",
        manufacturer: "Western Digital",
        model: "WD_BLACK SN770 1TB",
        interface: { protocol: "NVMe", pcie_gen: 4, lanes: 4 },
      });

      const results = validateAssignments(
        board,
        { m2_1: "wd-black-sn770-1tb" },
        { "wd-black-sn770-1tb": gen4Drive }
      );

      expect(results).toHaveLength(1);
      expect(results[0].severity).toBe("info");
      expect(results[0].slotId).toBe("m2_1");
      expect(results[0].componentId).toBe("wd-black-sn770-1tb");
      expect(results[0].message).toContain("Gen4");
      expect(results[0].message).toContain("Gen5");
    });
  });

  // --- Edge cases ---

  describe("edge cases", () => {
    it("returns empty array for null motherboard", () => {
      const results = validateAssignments(
        null as unknown as Motherboard,
        { m2_1: "some-id" },
        {}
      );
      expect(results).toEqual([]);
    });

    it("returns empty array for undefined motherboard", () => {
      const results = validateAssignments(
        undefined as unknown as Motherboard,
        { m2_1: "some-id" },
        {}
      );
      expect(results).toEqual([]);
    });

    it("returns empty array for null assignments", () => {
      const board = makeMotherboard([makeM2Slot()]);
      const results = validateAssignments(
        board,
        null as unknown as Record<string, string>,
        {}
      );
      expect(results).toEqual([]);
    });

    it("returns empty array for undefined assignments", () => {
      const board = makeMotherboard([makeM2Slot()]);
      const results = validateAssignments(
        board,
        undefined as unknown as Record<string, string>,
        {}
      );
      expect(results).toEqual([]);
    });

    it("returns empty array for empty assignments object", () => {
      const board = makeMotherboard([makeM2Slot()]);
      const results = validateAssignments(board, {}, {});
      expect(results).toEqual([]);
    });

    it("skips and returns empty array when component ID is not found in components map", () => {
      const board = makeMotherboard([makeM2Slot()]);
      const results = validateAssignments(
        board,
        { m2_1: "nonexistent-component" },
        {}
      );
      expect(results).toEqual([]);
    });

    it("skips and returns empty array when slot ID is not found on motherboard", () => {
      const board = makeMotherboard([makeM2Slot({ id: "m2_1" })]);
      const drive = makeNVMe({ id: "test-nvme" });

      const results = validateAssignments(
        board,
        { nonexistent_slot: "test-nvme" },
        { "test-nvme": drive }
      );
      expect(results).toEqual([]);
    });

    it("skips and returns empty array for unknown component type (e.g. GPU assigned to M.2 slot)", () => {
      const board = makeMotherboard([makeM2Slot({ id: "m2_1" })]);
      const gpu: GPUComponent = {
        id: "test-gpu",
        type: "gpu",
        manufacturer: "NVIDIA",
        model: "RTX 4070 Ti SUPER",
        interface: { pcie_gen: 4, lanes: 16 },
        physical: { slot_width: 3, length_mm: 336, slots_occupied: 2 },
        power: { tdp_w: 285, recommended_psu_w: 700, power_connectors: [{ type: "16-pin/12VHPWR", count: 1 }] },
        chip_manufacturer: "NVIDIA",
        schema_version: "1.0",
      };

      const results = validateAssignments(
        board,
        { m2_1: "test-gpu" },
        { "test-gpu": gpu as Component }
      );
      expect(results).toEqual([]);
    });
  });

  // --- Compatible assignment ---

  describe("compatible assignment", () => {
    it("returns empty array for Gen4 NVMe in Gen4 slot (perfect match)", () => {
      const slot = makeM2Slot({ id: "m2_1", label: "M2_1", gen: 4, supports_sata: false });
      const board = makeMotherboard([slot]);

      const drive = makeNVMe({
        id: "wd-black-sn770-1tb",
        model: "WD_BLACK SN770 1TB",
        interface: { protocol: "NVMe", pcie_gen: 4, lanes: 4 },
      });

      const results = validateAssignments(
        board,
        { m2_1: "wd-black-sn770-1tb" },
        { "wd-black-sn770-1tb": drive }
      );
      expect(results).toEqual([]);
    });
  });
});
