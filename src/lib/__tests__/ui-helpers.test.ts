import { describe, it, expect } from "vitest";
import { generateBadges } from "../ui-helpers";
import type { M2Slot, PCIeSlot } from "../types";

describe("generateBadges", () => {
  const baseM2Slot: M2Slot = {
    id: "m2_1",
    label: "M.2_1 (CPU)",
    interface: "PCIe",
    gen: 5,
    lanes: 4,
    form_factors: ["2280"],
    source: "CPU",
    supports_sata: false,
    heatsink_included: true,
    sharing: null,
  };

  const basePCIeSlot: PCIeSlot = {
    id: "pcie_1",
    label: "PCIEX16(G5)",
    position: 1,
    gen: 5,
    electrical_lanes: 16,
    physical_size: "x16",
    source: "CPU",
    reinforced: true,
    sharing: null,
  };

  it("shows base gen badge when no effective values provided (m2)", () => {
    const badges = generateBadges(baseM2Slot, "m2");
    const genBadge = badges.find((b) => b.label.startsWith("Gen"));
    expect(genBadge).toBeDefined();
    expect(genBadge!.label).toBe("Gen5");
    expect(genBadge!.colorClass).not.toContain("orange");
  });

  it('shows "Gen5 -> Gen4" downgrade indicator when effective gen differs (m2)', () => {
    const badges = generateBadges(baseM2Slot, "m2", { gen: 4, lanes: 4 });
    const downgradeBadge = badges.find((b) => b.label.includes("->"));
    expect(downgradeBadge).toBeDefined();
    expect(downgradeBadge!.label).toBe("Gen5 -> Gen4");
    expect(downgradeBadge!.colorClass).toContain("orange");
  });

  it("shows no downgrade indicator when effective gen matches base gen (m2)", () => {
    const badges = generateBadges(baseM2Slot, "m2", { gen: 5, lanes: 4 });
    const downgradeBadge = badges.find((b) => b.label.includes("->"));
    expect(downgradeBadge).toBeUndefined();
    const genBadge = badges.find((b) => b.label.startsWith("Gen"));
    expect(genBadge!.label).toBe("Gen5");
  });

  it('shows "Gen5 -> Gen4" downgrade indicator when effective gen differs (pcie)', () => {
    const badges = generateBadges(basePCIeSlot, "pcie", { gen: 4, lanes: 16 });
    const downgradeBadge = badges.find((b) => b.label.includes("->"));
    expect(downgradeBadge).toBeDefined();
    expect(downgradeBadge!.label).toBe("Gen5 -> Gen4");
    expect(downgradeBadge!.colorClass).toContain("orange");
  });

  it("uses effective lanes in badge when provided (m2)", () => {
    const badges = generateBadges(baseM2Slot, "m2", { gen: 5, lanes: 2 });
    const lanesBadge = badges.find((b) => b.label.startsWith("x"));
    expect(lanesBadge).toBeDefined();
    expect(lanesBadge!.label).toBe("x2");
  });

  it("uses effective lanes in badge when provided (pcie)", () => {
    const badges = generateBadges(basePCIeSlot, "pcie", { gen: 5, lanes: 8 });
    const lanesBadge = badges.find((b) => b.label === "x8");
    expect(lanesBadge).toBeDefined();
  });
});
