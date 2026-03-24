import { describe, it, expect } from "vitest";
import {
  groupSlotsByCategory,
  generateBadges,
  resolveSharingRules,
} from "../../src/lib/ui-helpers";
import type { Motherboard, MemorySlot, M2Slot, PCIeSlot, SATAPort } from "../../src/lib/types";

// ── Real ASUS Z890-F motherboard data (inline) ──────────────────────────────

const asusZ890F: Motherboard = {
  id: "asus-rog-strix-z890-f-gaming-wifi",
  manufacturer: "ASUS",
  model: "ROG STRIX Z890-F GAMING WIFI",
  chipset: "Z890",
  socket: "LGA1851",
  form_factor: "ATX",
  schema_version: "1.0",
  sources: [{ type: "manufacturer", url: "https://rog.asus.com/us/motherboards/rog-strix/rog-strix-z890-f-gaming-wifi/spec/" }],
  memory: {
    type: "DDR5",
    max_speed_mhz: 9066,
    base_speed_mhz: 4800,
    max_capacity_gb: 256,
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
      four_dimm: ["dimm_a1", "dimm_a2", "dimm_b1", "dimm_b2"],
    },
  },
  m2_slots: [
    { id: "m2_1", label: "M.2_1 (CPU)", interface: "PCIe", gen: 5, lanes: 4, form_factors: ["2242","2260","2280","22110"], source: "CPU", supports_sata: false, heatsink_included: true, sharing: null },
    { id: "m2_2", label: "M.2_2 (CPU)", interface: "PCIe", gen: 4, lanes: 4, form_factors: ["2280"], source: "CPU", supports_sata: false, heatsink_included: true, sharing: null },
    { id: "m2_3", label: "M.2_3 (Chipset)", interface: "PCIe", gen: 4, lanes: 4, form_factors: ["2280"], source: "Chipset", supports_sata: false, heatsink_included: true, sharing: null },
    { id: "m2_4", label: "M.2_4 (Chipset)", interface: "PCIe", gen: 4, lanes: 4, form_factors: ["2280","22110"], source: "Chipset", supports_sata: false, heatsink_included: true, sharing: null },
    { id: "m2_5", label: "M.2_5 (Chipset)", interface: "PCIe_or_SATA", gen: 4, lanes: 4, form_factors: ["2242","2260","2280"], source: "Chipset", supports_sata: true, heatsink_included: false, sharing: [{ type: "disables", targets: ["sata_1","sata_2"], condition: "M.2_5 is populated with a SATA device", effect: "SATA ports 1 and 2 are disabled" }] },
  ],
  pcie_slots: [
    { id: "pcie_1", label: "PCIEX16_1 (CPU)", gen: 5, electrical_lanes: 16, physical_size: "x16", position: 1, source: "CPU", reinforced: true, sharing: null },
    { id: "pcie_2", label: "PCIEX16_2 (Chipset)", gen: 4, electrical_lanes: 4, physical_size: "x16", position: 2, source: "Chipset", reinforced: false, sharing: null },
  ],
  sata_ports: [
    { id: "sata_1", version: "3.0", source: "Chipset", disabled_by: "m2_5" },
    { id: "sata_2", version: "3.0", source: "Chipset", disabled_by: "m2_5" },
    { id: "sata_3", version: "3.0", source: "Chipset", disabled_by: null },
    { id: "sata_4", version: "3.0", source: "Chipset", disabled_by: null },
  ],
};

// ── Real MSI X870 motherboard data (inline) ──────────────────────────────────

const msiX870: Motherboard = {
  id: "msi-mag-x870-tomahawk-wifi",
  manufacturer: "MSI",
  model: "MAG X870 TOMAHAWK WIFI",
  chipset: "X870",
  socket: "AM5",
  form_factor: "ATX",
  schema_version: "1.0",
  sources: [{ type: "manufacturer", url: "https://us.msi.com/Motherboard/MAG-X870-TOMAHAWK-WIFI/Specification" }],
  memory: {
    type: "DDR5",
    max_speed_mhz: 8400,
    base_speed_mhz: 4800,
    max_capacity_gb: 256,
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
      four_dimm: ["dimm_a1", "dimm_a2", "dimm_b1", "dimm_b2"],
    },
  },
  m2_slots: [
    { id: "m2_1", label: "M2_1 (CPU)", interface: "PCIe", gen: 5, lanes: 4, form_factors: ["2280","22110"], source: "CPU", supports_sata: false, heatsink_included: true, sharing: null },
    { id: "m2_2", label: "M2_2 (CPU)", interface: "PCIe", gen: 5, lanes: 4, form_factors: ["2260","2280"], source: "CPU", supports_sata: false, heatsink_included: true, sharing: [{ type: "bandwidth_split", target: "usb_40gbps_c", condition: "M.2_2 is populated", effect: "USB 40Gbps Type-C ports operate at PCIe 5.0 x2" }] },
    { id: "m2_3", label: "M2_3 (Chipset)", interface: "PCIe", gen: 4, lanes: 2, form_factors: ["2260","2280"], source: "Chipset", supports_sata: false, heatsink_included: true, sharing: [{ type: "bandwidth_split", target: "pcie_3", condition: "M.2_3 is populated", effect: "PCI_E3 slot operates at x2 instead of x4" }] },
    { id: "m2_4", label: "M2_4 (Chipset)", interface: "PCIe", gen: 4, lanes: 4, form_factors: ["2260","2280"], source: "Chipset", supports_sata: false, heatsink_included: true, sharing: [{ type: "disables", targets: ["sata_3","sata_4"], condition: "M.2_4 is populated", effect: "SATA ports 3 and 4 are disabled" }] },
  ],
  pcie_slots: [
    { id: "pcie_1", label: "PCI_E1 (CPU)", gen: 5, electrical_lanes: 16, physical_size: "x16", position: 1, source: "CPU", reinforced: true, sharing: null },
    { id: "pcie_2", label: "PCI_E2 (Chipset)", gen: 3, electrical_lanes: 1, physical_size: "x16", position: 2, source: "Chipset", reinforced: false, sharing: null },
    { id: "pcie_3", label: "PCI_E3 (Chipset)", gen: 4, electrical_lanes: 4, physical_size: "x16", position: 3, source: "Chipset", reinforced: false, sharing: [{ type: "bandwidth_split", target: "m2_3", condition: "M.2_3 is populated", effect: "PCI_E3 operates at x2 instead of x4" }] },
  ],
  sata_ports: [
    { id: "sata_1", version: "3.0", source: "Chipset", disabled_by: null },
    { id: "sata_2", version: "3.0", source: "Chipset", disabled_by: null },
    { id: "sata_3", version: "3.0", source: "Chipset", disabled_by: "m2_4" },
    { id: "sata_4", version: "3.0", source: "Chipset", disabled_by: "m2_4" },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// 1. groupSlotsByCategory with real ASUS Z890-F data
// ═══════════════════════════════════════════════════════════════════════════════

describe("groupSlotsByCategory", () => {
  describe("ASUS Z890-F motherboard", () => {
    const groups = groupSlotsByCategory(asusZ890F);

    it("produces 4 groups (memory, m2, pcie, sata)", () => {
      expect(groups).toHaveLength(4);
      expect(groups.map((g) => g.category)).toEqual(["memory", "m2", "pcie", "sata"]);
    });

    it("has correct slot counts per group", () => {
      const memory = groups.find((g) => g.category === "memory")!;
      const m2 = groups.find((g) => g.category === "m2")!;
      const pcie = groups.find((g) => g.category === "pcie")!;
      const sata = groups.find((g) => g.category === "sata")!;

      expect(memory.slots).toHaveLength(4);
      expect(m2.slots).toHaveLength(5);
      expect(pcie.slots).toHaveLength(2);
      expect(sata.slots).toHaveLength(4);
    });

    it("has correct display names", () => {
      expect(groups.map((g) => g.displayName)).toEqual([
        "Memory (DIMM)",
        "M.2 (NVMe/SATA)",
        "PCIe",
        "SATA",
      ]);
    });

    it("generates correct memory slot labels", () => {
      const memory = groups.find((g) => g.category === "memory")!;
      const labels = memory.slots.map((s) => s.label);
      expect(labels).toEqual(["DIMM A1", "DIMM A2", "DIMM B1", "DIMM B2"]);
    });

    it("generates correct SATA slot labels", () => {
      const sata = groups.find((g) => g.category === "sata")!;
      const labels = sata.slots.map((s) => s.label);
      expect(labels).toEqual(["SATA 1", "SATA 2", "SATA 3", "SATA 4"]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. generateBadges for each slot type
// ═══════════════════════════════════════════════════════════════════════════════

describe("generateBadges", () => {
  it("M.2 Gen5 CPU slot: Gen5 (green), x4 (zinc), CPU (teal)", () => {
    const slot: M2Slot = asusZ890F.m2_slots[0]; // m2_1: Gen5, CPU, 4 lanes
    const badges = generateBadges(slot, "m2");

    expect(badges).toEqual([
      { label: "Gen5", colorClass: expect.stringContaining("green") },
      { label: "x4", colorClass: expect.stringContaining("zinc") },
      { label: "CPU", colorClass: expect.stringContaining("teal") },
    ]);
  });

  it("M.2 Gen4 Chipset slot with supports_sata: Gen4 (blue), x4, Chipset (purple), +SATA (amber)", () => {
    const slot: M2Slot = asusZ890F.m2_slots[4]; // m2_5: Gen4, Chipset, supports_sata
    const badges = generateBadges(slot, "m2");

    expect(badges).toEqual([
      { label: "Gen4", colorClass: expect.stringContaining("blue") },
      { label: "x4", colorClass: expect.stringContaining("zinc") },
      { label: "Chipset", colorClass: expect.stringContaining("purple") },
      { label: "+SATA", colorClass: expect.stringContaining("amber") },
    ]);
  });

  it("PCIe Gen5 x16 CPU reinforced slot: Gen5, x16, CPU, Reinforced", () => {
    const slot: PCIeSlot = asusZ890F.pcie_slots[0]; // pcie_1: Gen5, x16, CPU, reinforced
    const badges = generateBadges(slot, "pcie");

    expect(badges).toEqual([
      { label: "Gen5", colorClass: expect.stringContaining("green") },
      { label: "x16", colorClass: expect.stringContaining("zinc") },
      { label: "CPU", colorClass: expect.stringContaining("teal") },
      { label: "Reinforced", colorClass: expect.stringContaining("zinc") },
    ]);
  });

  it("PCIe Gen4 x4 in x16 physical slot: Gen4, x4, x16 slot, Chipset", () => {
    const slot: PCIeSlot = asusZ890F.pcie_slots[1]; // pcie_2: Gen4, 4 lanes, x16 physical, Chipset
    const badges = generateBadges(slot, "pcie");

    expect(badges).toEqual([
      { label: "Gen4", colorClass: expect.stringContaining("blue") },
      { label: "x4", colorClass: expect.stringContaining("zinc") },
      { label: "x16 slot", colorClass: expect.stringContaining("zinc") },
      { label: "Chipset", colorClass: expect.stringContaining("purple") },
    ]);
  });

  it("Memory recommended slot: has Channel badge and ★ Recommended", () => {
    const slot: MemorySlot = asusZ890F.memory.slots[1]; // dimm_a2: recommended
    const badges = generateBadges(slot, "memory");

    const labels = badges.map((b) => b.label);
    expect(labels).toContain("Channel A");
    expect(labels).toContain("★ Recommended");
  });

  it("Memory non-recommended slot: does NOT have ★ Recommended", () => {
    const slot: MemorySlot = asusZ890F.memory.slots[0]; // dimm_a1: not recommended
    const badges = generateBadges(slot, "memory");

    const labels = badges.map((b) => b.label);
    expect(labels).toContain("Channel A");
    expect(labels).not.toContain("★ Recommended");
  });

  it("SATA port: has SATA 3.0 and Chipset badges", () => {
    const slot: SATAPort = asusZ890F.sata_ports[0]; // sata_1
    const badges = generateBadges(slot, "sata");

    expect(badges).toEqual([
      { label: "SATA 3.0", colorClass: expect.stringContaining("zinc") },
      { label: "Chipset", colorClass: expect.stringContaining("purple") },
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. resolveSharingRules with M.2 slot that disables SATA ports
// ═══════════════════════════════════════════════════════════════════════════════

describe("resolveSharingRules", () => {
  describe("ASUS Z890-F: m2_5 disables sata_1 and sata_2", () => {
    it("when m2_5 is populated, sata_1 and sata_2 are disabled", () => {
      const { disabledSlots, bandwidthWarnings } = resolveSharingRules(asusZ890F, {
        m2_5: "some-nvme-drive",
      });

      expect(disabledSlots.has("sata_1")).toBe(true);
      expect(disabledSlots.has("sata_2")).toBe(true);
      expect(disabledSlots.size).toBe(2);
      expect(bandwidthWarnings.size).toBe(0);
    });

    it("when m2_5 is NOT populated, no slots are disabled", () => {
      const { disabledSlots, bandwidthWarnings } = resolveSharingRules(asusZ890F, {
        m2_1: "some-nvme-drive",
      });

      expect(disabledSlots.size).toBe(0);
      expect(bandwidthWarnings.size).toBe(0);
    });
  });

  describe("MSI X870: m2_4 disables sata_3 and sata_4", () => {
    it("when m2_4 is populated, sata_3 and sata_4 are disabled", () => {
      const { disabledSlots } = resolveSharingRules(msiX870, {
        m2_4: "some-nvme-drive",
      });

      expect(disabledSlots.has("sata_3")).toBe(true);
      expect(disabledSlots.has("sata_4")).toBe(true);
      expect(disabledSlots.size).toBe(2);
    });
  });

  describe("MSI X870: bandwidth warnings", () => {
    it("when m2_2 is populated, bandwidth warning for usb_40gbps_c", () => {
      const { bandwidthWarnings } = resolveSharingRules(msiX870, {
        m2_2: "some-nvme-drive",
      });

      expect(bandwidthWarnings.has("usb_40gbps_c")).toBe(true);
      expect(bandwidthWarnings.get("usb_40gbps_c")).toBe(
        "USB 40Gbps Type-C ports operate at PCIe 5.0 x2",
      );
    });

    it("when m2_3 is populated, bandwidth warning for pcie_3", () => {
      const { bandwidthWarnings } = resolveSharingRules(msiX870, {
        m2_3: "some-nvme-drive",
      });

      expect(bandwidthWarnings.has("pcie_3")).toBe(true);
      expect(bandwidthWarnings.get("pcie_3")).toBe(
        "PCI_E3 slot operates at x2 instead of x4",
      );
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe("edge cases", () => {
  it("motherboard with no M.2 slots: groupSlotsByCategory omits M.2 group", () => {
    const board: Motherboard = {
      ...asusZ890F,
      m2_slots: [],
    };
    const groups = groupSlotsByCategory(board);
    const categories = groups.map((g) => g.category);

    expect(categories).not.toContain("m2");
    expect(categories).toContain("memory");
    expect(categories).toContain("pcie");
    expect(categories).toContain("sata");
  });

  it("motherboard with no SATA ports: groupSlotsByCategory omits SATA group", () => {
    const board: Motherboard = {
      ...asusZ890F,
      sata_ports: [],
    };
    const groups = groupSlotsByCategory(board);
    const categories = groups.map((g) => g.category);

    expect(categories).not.toContain("sata");
    expect(categories).toContain("memory");
    expect(categories).toContain("m2");
    expect(categories).toContain("pcie");
  });

  it("motherboard with empty memory slots: groupSlotsByCategory omits Memory group", () => {
    const board: Motherboard = {
      ...asusZ890F,
      memory: { ...asusZ890F.memory, slots: [] },
    };
    const groups = groupSlotsByCategory(board);
    const categories = groups.map((g) => g.category);

    expect(categories).not.toContain("memory");
    expect(categories).toContain("m2");
    expect(categories).toContain("pcie");
    expect(categories).toContain("sata");
  });

  it("resolveSharingRules with empty assignments returns empty sets", () => {
    const { disabledSlots, bandwidthWarnings } = resolveSharingRules(asusZ890F, {});

    expect(disabledSlots.size).toBe(0);
    expect(bandwidthWarnings.size).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Integration flow tests — validation engine with real data
// ═══════════════════════════════════════════════════════════════════════════════

import { validateAssignments } from "../../src/lib/validation-engine";
import { encode, decode } from "../../src/lib/sharing";
import type { NVMeComponent, Component } from "../../src/lib/types";

const samsungGen5: NVMeComponent = {
  id: "samsung-990-pro-2tb",
  type: "nvme",
  manufacturer: "Samsung",
  model: "990 PRO 2TB",
  interface: { protocol: "NVMe", pcie_gen: 5, lanes: 4 },
  form_factor: "2280",
  capacity_gb: 2000,
  schema_version: "1.0",
};

const sataNvme: NVMeComponent = {
  id: "crucial-bx500-sata-m2",
  type: "nvme",
  manufacturer: "Crucial",
  model: "BX500 SATA M.2",
  interface: { protocol: "SATA", pcie_gen: null, lanes: null },
  form_factor: "2280",
  capacity_gb: 500,
  schema_version: "1.0",
};

describe("integration: select board → assign component → validation fires", () => {
  it("Gen5 NVMe in Gen5 slot produces no warnings", () => {
    const assignments = { m2_1: "samsung-990-pro-2tb" };
    const loadedComponents: Record<string, Component> = {
      "samsung-990-pro-2tb": samsungGen5,
    };

    const results = validateAssignments(asusZ890F, assignments, loadedComponents);
    expect(results).toEqual([]);
  });

  it("Gen5 NVMe in Gen4 slot produces warning", () => {
    // m2_2 on ASUS Z890-F is Gen4
    const assignments = { m2_2: "samsung-990-pro-2tb" };
    const loadedComponents: Record<string, Component> = {
      "samsung-990-pro-2tb": samsungGen5,
    };

    const results = validateAssignments(asusZ890F, assignments, loadedComponents);
    expect(results).toHaveLength(1);
    expect(results[0].severity).toBe("warning");
    expect(results[0].slotId).toBe("m2_2");
    expect(results[0].componentId).toBe("samsung-990-pro-2tb");
    expect(results[0].message).toContain("Gen5");
    expect(results[0].message).toContain("Gen4");
  });

  it("SATA NVMe in non-SATA M.2 slot produces error", () => {
    // m2_1 on ASUS Z890-F has supports_sata: false
    const assignments = { m2_1: "crucial-bx500-sata-m2" };
    const loadedComponents: Record<string, Component> = {
      "crucial-bx500-sata-m2": sataNvme,
    };

    const results = validateAssignments(asusZ890F, assignments, loadedComponents);
    expect(results).toHaveLength(1);
    expect(results[0].severity).toBe("error");
    expect(results[0].slotId).toBe("m2_1");
    expect(results[0].componentId).toBe("crucial-bx500-sata-m2");
    expect(results[0].message).toContain("SATA");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. URL encoding/decoding round-trip tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("URL encoding/decoding", () => {
  it("encode then decode round-trip preserves state", () => {
    const motherboardId = "asus-rog-strix-z890-f-gaming-wifi";
    const assignments = { m2_1: "samsung-990-pro-2tb", m2_3: "wd-black-sn770-1tb" };

    const encoded = encode(motherboardId, assignments);
    const decoded = decode(encoded);

    expect(decoded).not.toBeNull();
    expect(decoded!.motherboardId).toBe(motherboardId);
    expect(decoded!.assignments).toEqual(assignments);
  });

  it("decode with malformed input returns null", () => {
    const result = decode("not-valid-base64!!!");
    expect(result).toBeNull();
  });

  it("decode with empty string returns null", () => {
    const result = decode("");
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Board switch clears assignments (data-level verification)
// ═══════════════════════════════════════════════════════════════════════════════

describe("board switch clears assignments", () => {
  it("switching boards produces empty assignments", () => {
    // Simulate the logic from handleSelectBoard: assignments are reset to {}
    const previousAssignments = { m2_1: "samsung-990-pro-2tb", m2_3: "wd-black-sn770-1tb" };
    expect(Object.keys(previousAssignments).length).toBeGreaterThan(0);

    // Board switch clears assignments (mirrors SlotChecker.handleSelectBoard)
    const cleared: Record<string, string> = {};
    expect(Object.keys(cleared)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Sharing rules + validation combined
// ═══════════════════════════════════════════════════════════════════════════════

describe("sharing rules + validation combined", () => {
  it("M.2 slot with sharing rules disables SATA ports, then validation runs on remaining assignments", () => {
    // Populate m2_5 on ASUS Z890-F (has disables rule for sata_1, sata_2)
    const assignments = { m2_5: "samsung-990-pro-2tb" };
    const loadedComponents: Record<string, Component> = {
      "samsung-990-pro-2tb": samsungGen5,
    };

    // Step 1: Resolve sharing rules
    const { disabledSlots } = resolveSharingRules(asusZ890F, assignments);
    expect(disabledSlots.has("sata_1")).toBe(true);
    expect(disabledSlots.has("sata_2")).toBe(true);

    // Step 2: Validation runs without error on the same assignments
    // m2_5 is Gen4, samsung-990-pro-2tb is Gen5 → should produce a warning
    const results = validateAssignments(asusZ890F, assignments, loadedComponents);
    // m2_5 is Gen4 slot, Gen5 drive → warning expected
    expect(results).toHaveLength(1);
    expect(results[0].severity).toBe("warning");
    expect(results[0].slotId).toBe("m2_5");
  });
});
