import type {
  Motherboard,
  MemorySlot,
  M2Slot,
  PCIeSlot,
  SATAPort,
} from "./types";
import type { EffectiveSlotValues } from "./cpu-utils";
import type { SlotCategory, BadgeInfo, SlotEntry, SlotGroup } from "./ui-types";

/**
 * Groups all motherboard slots into category sections, skipping empty categories.
 * When effectiveSlotValues is provided, M.2 and PCIe badges reflect overridden gen/lanes.
 */
export function groupSlotsByCategory(
  motherboard: Motherboard,
  effectiveSlotValues?: Record<string, EffectiveSlotValues>,
): SlotGroup[] {
  const groups: SlotGroup[] = [];

  // Memory
  if (motherboard.memory.slots.length > 0) {
    const ddrBadge: BadgeInfo = {
      label: motherboard.memory.type,
      colorClass: DDR_BADGE,
    };
    groups.push({
      category: "memory",
      displayName: "Memory (DIMM)",
      slots: motherboard.memory.slots.map((slot): SlotEntry => ({
        id: slot.id,
        label: `DIMM ${slot.channel}${slot.position}`,
        category: "memory",
        badges: [ddrBadge, ...generateBadges(slot, "memory")],
      })),
    });
  }

  // M.2
  if (motherboard.m2_slots.length > 0) {
    groups.push({
      category: "m2",
      displayName: "M.2 (NVMe/SATA)",
      slots: motherboard.m2_slots.map((slot): SlotEntry => ({
        id: slot.id,
        label: slot.label,
        category: "m2",
        badges: generateBadges(slot, "m2", effectiveSlotValues?.[slot.id]),
      })),
    });
  }

  // PCIe
  if (motherboard.pcie_slots.length > 0) {
    groups.push({
      category: "pcie",
      displayName: "PCIe",
      slots: motherboard.pcie_slots.map((slot): SlotEntry => ({
        id: slot.id,
        label: slot.label,
        category: "pcie",
        badges: generateBadges(slot, "pcie", effectiveSlotValues?.[slot.id]),
      })),
    });
  }

  // SATA
  if (motherboard.sata_ports.length > 0) {
    groups.push({
      category: "sata",
      displayName: "SATA",
      slots: motherboard.sata_ports.map((slot): SlotEntry => ({
        id: slot.id,
        label: `SATA ${slot.id.split("_").pop()}`,
        category: "sata",
        badges: generateBadges(slot, "sata"),
      })),
    });
  }

  return groups;
}


// Badge color constants
const GEN_COLORS: Record<number, string> = {
  5: "bg-green-700/60 text-green-200",
  4: "bg-blue-700/60 text-blue-200",
  3: "bg-zinc-700/60 text-zinc-300",
};

const SOURCE_COLORS: Record<string, string> = {
  CPU: "bg-teal-700/60 text-teal-200",
  Chipset: "bg-purple-700/60 text-purple-200",
};

const SATA_BADGE = "bg-amber-700/60 text-amber-200";
const RECOMMENDED_BADGE = "bg-yellow-700/60 text-yellow-200";
const DDR_BADGE = "bg-blue-700/60 text-blue-200";
const NEUTRAL_BADGE = "bg-zinc-700/60 text-zinc-300";
const DOWNGRADE_BADGE = "bg-orange-700/60 text-orange-200";

/**
 * Generates badge label/colorClass pairs for a slot based on its category.
 * When effectiveValues is provided for m2/pcie slots, badges reflect the
 * effective gen/lanes. A downgrade indicator is shown when effective gen
 * differs from the slot's base gen.
 */
export function generateBadges(
  slot: MemorySlot | M2Slot | PCIeSlot | SATAPort,
  category: SlotCategory,
  effectiveValues?: EffectiveSlotValues,
): BadgeInfo[] {
  const badges: BadgeInfo[] = [];

  switch (category) {
    case "memory": {
      const s = slot as MemorySlot;
      // DDR type badge is prepended by groupSlotsByCategory (needs motherboard.memory.type)
      badges.push({ label: `Channel ${s.channel}`, colorClass: NEUTRAL_BADGE });
      if (s.recommended) {
        badges.push({ label: "\u2605 Recommended", colorClass: RECOMMENDED_BADGE });
      }
      break;
    }

    case "m2": {
      const s = slot as M2Slot;
      const effectiveGen = effectiveValues?.gen ?? s.gen;
      const effectiveLanes = effectiveValues?.lanes ?? s.lanes;
      const isDowngraded = effectiveValues != null && effectiveGen !== s.gen;

      if (isDowngraded) {
        badges.push({ label: `Gen${s.gen} -> Gen${effectiveGen}`, colorClass: DOWNGRADE_BADGE });
      } else {
        const genColor = GEN_COLORS[effectiveGen] ?? NEUTRAL_BADGE;
        badges.push({ label: `Gen${effectiveGen}`, colorClass: genColor });
      }
      badges.push({ label: `x${effectiveLanes}`, colorClass: NEUTRAL_BADGE });
      badges.push({ label: s.source, colorClass: SOURCE_COLORS[s.source] ?? NEUTRAL_BADGE });
      if (s.supports_sata) {
        badges.push({ label: "+SATA", colorClass: SATA_BADGE });
      }
      break;
    }

    case "pcie": {
      const s = slot as PCIeSlot;
      const effectiveGen = effectiveValues?.gen ?? s.gen;
      const effectiveLanes = effectiveValues?.lanes ?? s.electrical_lanes;
      const isDowngraded = effectiveValues != null && effectiveGen !== s.gen;

      if (isDowngraded) {
        badges.push({ label: `Gen${s.gen} -> Gen${effectiveGen}`, colorClass: DOWNGRADE_BADGE });
      } else {
        const genColor = GEN_COLORS[effectiveGen] ?? NEUTRAL_BADGE;
        badges.push({ label: `Gen${effectiveGen}`, colorClass: genColor });
      }
      badges.push({ label: `x${effectiveLanes}`, colorClass: NEUTRAL_BADGE });
      if (s.physical_size !== `x${effectiveLanes}`) {
        badges.push({ label: `${s.physical_size} slot`, colorClass: NEUTRAL_BADGE });
      }
      badges.push({ label: s.source, colorClass: SOURCE_COLORS[s.source] ?? NEUTRAL_BADGE });
      if (s.reinforced) {
        badges.push({ label: "Reinforced", colorClass: NEUTRAL_BADGE });
      }
      break;
    }

    case "sata": {
      const s = slot as SATAPort;
      badges.push({ label: `SATA ${s.version}`, colorClass: NEUTRAL_BADGE });
      badges.push({ label: s.source, colorClass: SOURCE_COLORS[s.source] ?? NEUTRAL_BADGE });
      break;
    }
  }

  return badges;
}


/**
 * Resolves sharing rules for populated slots, returning disabled slots
 * and bandwidth warnings.
 */
export function resolveSharingRules(
  motherboard: Motherboard,
  assignments: Record<string, string>,
): { disabledSlots: Set<string>; bandwidthWarnings: Map<string, string> } {
  const disabledSlots = new Set<string>();
  const bandwidthWarnings = new Map<string, string>();

  // Check M.2 slots
  for (const slot of motherboard.m2_slots) {
    if (!(slot.id in assignments) || !slot.sharing) continue;
    for (const rule of slot.sharing) {
      if (rule.type === "disables" && rule.targets) {
        for (const target of rule.targets) {
          disabledSlots.add(target);
        }
      }
      if (rule.type === "bandwidth_split" && rule.target && rule.effect) {
        bandwidthWarnings.set(rule.target, rule.effect);
      }
    }
  }

  // Check PCIe slots
  for (const slot of motherboard.pcie_slots) {
    if (!(slot.id in assignments) || !slot.sharing) continue;
    for (const rule of slot.sharing) {
      if (rule.type === "disables" && rule.targets) {
        for (const target of rule.targets) {
          disabledSlots.add(target);
        }
      }
      if (rule.type === "bandwidth_split" && rule.target && rule.effect) {
        bandwidthWarnings.set(rule.target, rule.effect);
      }
    }
  }

  return { disabledSlots, bandwidthWarnings };
}
