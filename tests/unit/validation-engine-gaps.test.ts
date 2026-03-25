import { describe, test, expect } from "vitest";
import { validateAssignments } from "../../src/lib/validation-engine";
import { makeStickId } from "../../src/lib/stick-utils";
import type {
  Motherboard,
  M2Slot,
  PCIeSlot,
  SATAPort,
  MemoryConfig,
  MemorySlot,
  NVMeComponent,
  SATAComponent,
  RAMComponent,
  Component,
  SharingRule,
} from "../../src/lib/types";

// -- Helpers ------------------------------------------------------------------

function makeMotherboard(overrides: Partial<Motherboard> = {}): Motherboard {
  return {
    id: "test-board",
    manufacturer: "TestCo",
    model: "Test Board",
    chipset: "Z890",
    socket: "LGA1851",
    form_factor: "ATX",
    memory: {
      type: "DDR5",
      max_speed_mhz: 6000,
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
    sources: [{ type: "manual", url: "https://example.com" }],
    schema_version: "2.0",
    ...overrides,
  };
}

function makeM2Slot(overrides: Partial<M2Slot> = {}): M2Slot {
  return {
    id: "m2_1",
    label: "M.2_1",
    interface: "PCIe",
    gen: 4,
    lanes: 4,
    form_factors: ["2280"],
    source: "CPU",
    supports_sata: false,
    heatsink_included: true,
    sharing: null,
    ...overrides,
  };
}

function makePCIeSlot(overrides: Partial<PCIeSlot> = {}): PCIeSlot {
  return {
    id: "pcie_1",
    label: "PCIEX16_1",
    gen: 5,
    electrical_lanes: 16,
    physical_size: "x16",
    position: 1,
    source: "CPU",
    reinforced: true,
    sharing: null,
    ...overrides,
  };
}

function makeSATAPort(overrides: Partial<SATAPort> = {}): SATAPort {
  return {
    id: "sata_1",
    version: "3.0",
    source: "Chipset",
    disabled_by: null,
    ...overrides,
  };
}

function makeNVMe(overrides: Partial<NVMeComponent> = {}): NVMeComponent {
  return {
    id: "nvme-test",
    type: "nvme",
    manufacturer: "Samsung",
    model: "990 PRO 2TB",
    interface: { protocol: "NVMe", pcie_gen: 4, lanes: 4 },
    form_factor: "2280",
    capacity_gb: 2000,
    schema_version: "1.0",
    ...overrides,
  };
}

function makeSATA(overrides: Partial<SATAComponent> = {}): SATAComponent {
  return {
    id: "sata-drive-test",
    type: "sata_drive",
    manufacturer: "Samsung",
    model: "870 EVO 1TB",
    form_factor: "2.5",
    capacity_gb: 1000,
    interface: "SATA III",
    schema_version: "1.0",
    ...overrides,
  };
}

function makeRAM(overrides: Partial<RAMComponent> = {}): RAMComponent {
  return {
    id: "ram-test",
    type: "ram",
    manufacturer: "Corsair",
    model: "Vengeance DDR5-6000 32GB",
    interface: { type: "DDR5", speed_mhz: 6000, base_speed_mhz: 4800 },
    capacity: { per_module_gb: 16, modules: 2, total_gb: 32 },
    schema_version: "1.0",
    ...overrides,
  };
}

// -- 1. M.2 form factor mismatch and match ------------------------------------

describe("M.2 form factor validation", () => {
  test("NVMe drive with form_factor 22110 in a slot that only supports 2280 produces error", () => {
    const slot = makeM2Slot({ id: "m2_1", form_factors: ["2280"] });
    const board = makeMotherboard({ m2_slots: [slot] });
    const comp = makeNVMe({ id: "nvme-22110", form_factor: "22110" });

    const results = validateAssignments(board, { m2_1: "nvme-22110" }, { "nvme-22110": comp });

    const errors = results.filter((r) => r.severity === "error" && r.slotId === "m2_1");
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some((e) => e.message.includes("22110"))).toBe(true);
    expect(errors.some((e) => e.message.includes("does not physically fit"))).toBe(true);
  });

  test("NVMe drive with form_factor 2280 in a slot that supports 2280 and 22110 produces no form factor error", () => {
    const slot = makeM2Slot({ id: "m2_1", form_factors: ["2280", "22110"] });
    const board = makeMotherboard({ m2_slots: [slot] });
    const comp = makeNVMe({ id: "nvme-2280", form_factor: "2280" });

    const results = validateAssignments(board, { m2_1: "nvme-2280" }, { "nvme-2280": comp });

    const formFactorErrors = results.filter(
      (r) => r.severity === "error" && r.slotId === "m2_1" && r.message.includes("does not physically fit")
    );
    expect(formFactorErrors).toHaveLength(0);
  });
});

// -- 2. SATA drive validation -------------------------------------------------

describe("SATA drive validation", () => {
  test("SATA drive in a non-disabled port produces no errors", () => {
    const port = makeSATAPort({ id: "sata_1", disabled_by: null });
    const board = makeMotherboard({ sata_ports: [port] });
    const comp = makeSATA({ id: "sata-drive" });

    const results = validateAssignments(board, { sata_1: "sata-drive" }, { "sata-drive": comp });

    const errors = results.filter((r) => r.severity === "error" && r.slotId === "sata_1");
    expect(errors).toHaveLength(0);
  });

  test("SATA drive in a port disabled by a populated M.2 slot produces error", () => {
    const m2Slot = makeM2Slot({ id: "m2_4" });
    const port = makeSATAPort({ id: "sata_3", disabled_by: "m2_4" });
    const board = makeMotherboard({ m2_slots: [m2Slot], sata_ports: [port] });
    const nvme = makeNVMe({ id: "nvme-in-m2" });
    const sata = makeSATA({ id: "sata-drive" });

    const results = validateAssignments(
      board,
      { m2_4: "nvme-in-m2", sata_3: "sata-drive" },
      { "nvme-in-m2": nvme, "sata-drive": sata }
    );

    const errors = results.filter(
      (r) => r.severity === "error" && r.slotId === "sata_3" && r.message.includes("disabled")
    );
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some((e) => e.message.includes("m2_4"))).toBe(true);
  });

  test("NVMe component assigned to a SATA port produces incompatible type error", () => {
    const port = makeSATAPort({ id: "sata_1" });
    const board = makeMotherboard({ sata_ports: [port] });
    const nvme = makeNVMe({ id: "nvme-wrong" });

    const results = validateAssignments(board, { sata_1: "nvme-wrong" }, { "nvme-wrong": nvme });

    const errors = results.filter(
      (r) => r.severity === "error" && r.slotId === "sata_1" && r.message.includes("incompatible")
    );
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });
});

// -- 3. RAM validation --------------------------------------------------------

describe("RAM validation", () => {
  const memorySlots: MemorySlot[] = [
    { id: "dimm_a1", channel: "A", position: 0, recommended: false },
    { id: "dimm_a2", channel: "A", position: 1, recommended: true },
    { id: "dimm_b1", channel: "B", position: 2, recommended: false },
    { id: "dimm_b2", channel: "B", position: 3, recommended: true },
  ];

  const baseMemory: MemoryConfig = {
    type: "DDR5",
    max_speed_mhz: 6000,
    base_speed_mhz: 4800,
    max_capacity_gb: 128,
    ecc_support: false,
    channels: 2,
    slots: memorySlots,
    recommended_population: { two_dimm: ["dimm_a2", "dimm_b2"] },
  };

  test("DDR4 RAM on DDR5 board produces error", () => {
    const board = makeMotherboard({ memory: { ...baseMemory, type: "DDR5" } });
    const ram = makeRAM({
      id: "ddr4-ram",
      interface: { type: "DDR4", speed_mhz: 3200, base_speed_mhz: 2133 },
    });

    const stickId = makeStickId("ddr4-ram", 1);
    const results = validateAssignments(board, { dimm_a2: stickId }, { "ddr4-ram": ram });

    const errors = results.filter(
      (r) => r.severity === "error" && r.message.includes("DDR4")
    );
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some((e) => e.message.includes("DDR5"))).toBe(true);
  });

  test("RAM speed exceeding board max is not flagged at stick level (no speed helper)", () => {
    const board = makeMotherboard({ memory: baseMemory });
    const ram = makeRAM({
      id: "fast-ram",
      interface: { type: "DDR5", speed_mhz: 7200, base_speed_mhz: 4800 },
      capacity: { per_module_gb: 16, modules: 1, total_gb: 16 },
    });

    const stickId = makeStickId("fast-ram", 1);
    const results = validateAssignments(board, { dimm_a2: stickId }, { "fast-ram": ram });

    // The stick-level validators do not include a speed check, so no
    // speed-related info should appear. DDR compat passes (both DDR5),
    // capacity is fine, and a 1-module kit fully assigned produces no
    // incomplete-kit error.
    const speedInfos = results.filter(
      (r) => r.severity === "info" && r.message.includes("7200")
    );
    expect(speedInfos).toHaveLength(0);
  });

  test("Two 128GB modules on board with max_capacity_gb 128 produces error (256 > 128)", () => {
    const board = makeMotherboard({ memory: { ...baseMemory, max_capacity_gb: 128 } });
    const ram1 = makeRAM({
      id: "big-ram-1",
      capacity: { per_module_gb: 128, modules: 1, total_gb: 128 },
    });
    const ram2 = makeRAM({
      id: "big-ram-2",
      capacity: { per_module_gb: 128, modules: 1, total_gb: 128 },
    });

    const stick1 = makeStickId("big-ram-1", 1);
    const stick2 = makeStickId("big-ram-2", 1);
    const results = validateAssignments(
      board,
      { dimm_a2: stick1, dimm_b2: stick2 },
      { "big-ram-1": ram1, "big-ram-2": ram2 }
    );

    const errors = results.filter(
      (r) => r.severity === "error" && r.message.includes("exceeds")
    );
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some((e) => e.message.includes("128"))).toBe(true);
  });

  test("Two RAM modules in non-recommended slots produces warning", () => {
    const board = makeMotherboard({ memory: baseMemory });
    const ram1 = makeRAM({
      id: "ram-nr-1",
      capacity: { per_module_gb: 16, modules: 1, total_gb: 16 },
    });
    const ram2 = makeRAM({
      id: "ram-nr-2",
      capacity: { per_module_gb: 16, modules: 1, total_gb: 16 },
    });

    const stick1 = makeStickId("ram-nr-1", 1);
    const stick2 = makeStickId("ram-nr-2", 1);
    // Assign to dimm_a1 and dimm_b1 instead of recommended dimm_a2 and dimm_b2
    const results = validateAssignments(
      board,
      { dimm_a1: stick1, dimm_b1: stick2 },
      { "ram-nr-1": ram1, "ram-nr-2": ram2 }
    );

    const warnings = results.filter(
      (r) => r.severity === "warning" && r.message.includes("recommended")
    );
    expect(warnings.length).toBeGreaterThanOrEqual(1);
  });
});

// -- 4. M.2-to-SATA disable (populated and empty targets) --------------------

describe("M.2-to-SATA disable sharing rules", () => {
  const sourceSlotId = "m2_5";
  const targetPortId1 = "sata_1";
  const targetPortId2 = "sata_2";

  function buildBoardWithM2ToSataDisable(): Motherboard {
    const m2Slot = makeM2Slot({
      id: sourceSlotId,
      label: "M.2_5",
      interface: "PCIe_or_SATA",
      supports_sata: true,
      form_factors: ["2242", "2260", "2280"],
      sharing: [
        {
          type: "disables",
          targets: [targetPortId1, targetPortId2],
          direction: "m2_to_sata",
          trigger: { slot_ids: [sourceSlotId], logic: "any_populated" },
          device_filter: { protocol: "SATA" },
          condition: "M.2_5 is populated with a SATA device",
          effect: "SATA ports 1 and 2 are disabled",
        },
      ],
    });
    const port1 = makeSATAPort({ id: targetPortId1, disabled_by: sourceSlotId });
    const port2 = makeSATAPort({ id: targetPortId2, disabled_by: sourceSlotId });
    return makeMotherboard({ m2_slots: [m2Slot], sata_ports: [port1, port2] });
  }

  test("M.2 and SATA both populated produces error for each target", () => {
    const board = buildBoardWithM2ToSataDisable();
    // SATA protocol NVMe in M.2 slot triggers the device_filter
    const m2Comp = makeNVMe({
      id: "sata-m2-drive",
      interface: { protocol: "SATA", pcie_gen: null, lanes: null },
      form_factor: "2280",
    });
    const sataDrive1 = makeSATA({ id: "sata-d1" });
    const sataDrive2 = makeSATA({ id: "sata-d2" });

    const results = validateAssignments(
      board,
      { [sourceSlotId]: "sata-m2-drive", [targetPortId1]: "sata-d1", [targetPortId2]: "sata-d2" },
      { "sata-m2-drive": m2Comp, "sata-d1": sataDrive1, "sata-d2": sataDrive2 }
    );

    const sharingErrors = results.filter(
      (r) =>
        r.severity === "error" &&
        r.message.includes(sourceSlotId) &&
        (r.slotId === targetPortId1 || r.slotId === targetPortId2)
    );
    expect(sharingErrors.length).toBeGreaterThanOrEqual(2);
  });

  test("M.2 populated but SATA empty produces warning for each target", () => {
    const board = buildBoardWithM2ToSataDisable();
    const m2Comp = makeNVMe({
      id: "sata-m2-drive",
      interface: { protocol: "SATA", pcie_gen: null, lanes: null },
      form_factor: "2280",
    });

    const results = validateAssignments(
      board,
      { [sourceSlotId]: "sata-m2-drive" },
      { "sata-m2-drive": m2Comp }
    );

    const sharingWarnings = results.filter(
      (r) =>
        r.severity === "warning" &&
        r.message.includes(sourceSlotId) &&
        (r.slotId === targetPortId1 || r.slotId === targetPortId2)
    );
    expect(sharingWarnings.length).toBeGreaterThanOrEqual(2);
    expect(sharingWarnings.every((w) => w.message.includes("unavailable"))).toBe(true);
  });
});

// -- 5. M.2-to-PCIe bandwidth split (with and without device filter) ----------

describe("M.2-to-PCIe bandwidth split sharing rules", () => {
  test("M.2 populated triggers bandwidth_split warning with degraded_lanes", () => {
    const sourceSlotId = "m2_3";
    const targetSlotId = "pcie_3";

    const m2Slot = makeM2Slot({
      id: sourceSlotId,
      label: "M2_3",
      gen: 4,
      lanes: 2,
      form_factors: ["2260", "2280"],
      sharing: [
        {
          type: "bandwidth_split",
          target: targetSlotId,
          direction: "m2_to_pcie",
          trigger: { slot_ids: [sourceSlotId], logic: "any_populated" },
          degraded_lanes: 2,
        },
      ],
    });
    const pcieSlot = makePCIeSlot({
      id: targetSlotId,
      label: "PCI_E3",
      gen: 4,
      electrical_lanes: 4,
      physical_size: "x16",
    });
    const board = makeMotherboard({ m2_slots: [m2Slot], pcie_slots: [pcieSlot] });
    const nvme = makeNVMe({ id: "nvme-bw", form_factor: "2280", interface: { protocol: "NVMe", pcie_gen: 4, lanes: 4 } });

    const results = validateAssignments(board, { [sourceSlotId]: "nvme-bw" }, { "nvme-bw": nvme });

    const warnings = results.filter(
      (r) => r.severity === "warning" && r.slotId === targetSlotId && r.message.includes(sourceSlotId)
    );
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings.some((w) => w.message.includes("2"))).toBe(true);
  });

  test("M.2 bandwidth_split with device_filter for SATA does not fire for NVMe component", () => {
    const sourceSlotId = "m2_filter";
    const targetSlotId = "pcie_filter";

    const m2Slot = makeM2Slot({
      id: sourceSlotId,
      label: "M2_filter",
      interface: "PCIe_or_SATA",
      supports_sata: true,
      form_factors: ["2280"],
      sharing: [
        {
          type: "bandwidth_split",
          target: targetSlotId,
          direction: "m2_to_pcie",
          trigger: { slot_ids: [sourceSlotId], logic: "any_populated" },
          device_filter: { protocol: "SATA" },
          degraded_lanes: 2,
        },
      ],
    });
    const pcieSlot = makePCIeSlot({ id: targetSlotId });
    const board = makeMotherboard({ m2_slots: [m2Slot], pcie_slots: [pcieSlot] });
    // NVMe protocol -- does NOT match the SATA filter
    const nvme = makeNVMe({ id: "nvme-no-match", form_factor: "2280" });

    const results = validateAssignments(board, { [sourceSlotId]: "nvme-no-match" }, { "nvme-no-match": nvme });

    const sharingResults = results.filter(
      (r) => r.slotId === targetSlotId && r.message.includes(sourceSlotId)
    );
    expect(sharingResults).toHaveLength(0);
  });
});

// -- 6. PCIe-to-M.2 disable (populated and empty targets) --------------------

describe("PCIe-to-M.2 disable sharing rules", () => {
  const sourceSlotId = "pcie_x";
  const targetSlotId = "m2_target";

  function buildBoardWithPCIeToM2Disable(): Motherboard {
    const pcieSlot = makePCIeSlot({
      id: sourceSlotId,
      label: "PCIEX16_X",
      sharing: [
        {
          type: "disables",
          targets: [targetSlotId],
          direction: "pcie_to_m2",
          trigger: { slot_ids: [sourceSlotId], logic: "any_populated" },
        },
      ],
    });
    const m2Slot = makeM2Slot({ id: targetSlotId, label: "M.2_target" });
    return makeMotherboard({ pcie_slots: [pcieSlot], m2_slots: [m2Slot] });
  }

  test("PCIe and M.2 both populated produces error", () => {
    const board = buildBoardWithPCIeToM2Disable();
    // Use a GPU for the PCIe slot so it routes through PCIe validation
    // Actually, sharing rules are evaluated in the cross-slot pass regardless
    // We just need the slot populated -- use an NVMe as a placeholder component
    const pcieComp = makeNVMe({ id: "pcie-comp" });
    const m2Comp = makeNVMe({ id: "m2-comp", form_factor: "2280" });

    const results = validateAssignments(
      board,
      { [sourceSlotId]: "pcie-comp", [targetSlotId]: "m2-comp" },
      { "pcie-comp": pcieComp, "m2-comp": m2Comp }
    );

    const errors = results.filter(
      (r) => r.severity === "error" && r.slotId === targetSlotId && r.message.includes(sourceSlotId)
    );
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  test("PCIe populated but M.2 empty produces warning", () => {
    const board = buildBoardWithPCIeToM2Disable();
    const pcieComp = makeNVMe({ id: "pcie-comp" });

    const results = validateAssignments(
      board,
      { [sourceSlotId]: "pcie-comp" },
      { "pcie-comp": pcieComp }
    );

    const warnings = results.filter(
      (r) => r.severity === "warning" && r.slotId === targetSlotId && r.message.includes(sourceSlotId)
    );
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings.some((w) => w.message.includes("unavailable"))).toBe(true);
  });
});

// -- 7. SATA-to-PCIe degradation ----------------------------------------------

describe("SATA-to-PCIe degradation sharing rules", () => {
  test("SATA port with bandwidth_split rule targeting PCIe slot produces warning when populated", () => {
    const sourcePortId = "sata_bw";
    const targetSlotId = "pcie_bw_target";

    const sataPort = makeSATAPort({
      id: sourcePortId,
      sharing: [
        {
          type: "bandwidth_split",
          target: targetSlotId,
          direction: "sata_to_pcie",
          trigger: { slot_ids: [sourcePortId], logic: "any_populated" },
          degraded_lanes: 2,
        },
      ],
    });
    const pcieSlot = makePCIeSlot({ id: targetSlotId, label: "PCI_E_BW" });
    const board = makeMotherboard({ sata_ports: [sataPort], pcie_slots: [pcieSlot] });
    const sataDrive = makeSATA({ id: "sata-bw-drive" });

    const results = validateAssignments(
      board,
      { [sourcePortId]: "sata-bw-drive" },
      { "sata-bw-drive": sataDrive }
    );

    const warnings = results.filter(
      (r) => r.severity === "warning" && r.slotId === targetSlotId && r.message.includes(sourcePortId)
    );
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings.some((w) => w.message.includes("2"))).toBe(true);
  });
});

// -- 8. Legacy sharing rules without trigger (no crash) -----------------------

describe("Legacy sharing rules without trigger", () => {
  test("Sharing rule with only condition/effect text and no trigger does not crash", () => {
    const legacyRule: SharingRule = {
      type: "disables",
      targets: ["sata_1"],
      condition: "M.2_1 is populated",
      effect: "SATA port 1 is disabled",
      // No trigger field
    };

    const m2Slot = makeM2Slot({
      id: "m2_legacy",
      sharing: [legacyRule],
    });
    const sataPort = makeSATAPort({ id: "sata_1" });
    const board = makeMotherboard({ m2_slots: [m2Slot], sata_ports: [sataPort] });
    const nvme = makeNVMe({ id: "nvme-legacy", form_factor: "2280" });

    const results = validateAssignments(
      board,
      { m2_legacy: "nvme-legacy" },
      { "nvme-legacy": nvme }
    );

    // Should not crash, should return an array
    expect(Array.isArray(results)).toBe(true);
    // Legacy rules without trigger are skipped, so no sharing results for sata_1
    const sharingResults = results.filter(
      (r) => r.slotId === "sata_1" && r.message.includes("m2_legacy")
    );
    expect(sharingResults).toHaveLength(0);
  });
});

// -- 9. Empty assignments returns empty results --------------------------------

describe("Empty assignments", () => {
  test("Empty assignments object returns empty results array", () => {
    const board = makeMotherboard({
      m2_slots: [makeM2Slot()],
      pcie_slots: [makePCIeSlot()],
      sata_ports: [makeSATAPort()],
    });

    const results = validateAssignments(board, {}, {});

    expect(results).toEqual([]);
  });
});
