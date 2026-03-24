"use client";

import { groupSlotsByCategory } from "../lib/ui-helpers";
import SlotCard from "./SlotCard";
import type { Motherboard, Component } from "../lib/types";
import type { SlotCategory } from "../lib/ui-types";

interface SlotListProps {
  motherboard: Motherboard;
  assignments: Record<string, string>;
  loadedComponents: Record<string, Component>;
  disabledSlots: Set<string>;
  bandwidthWarnings: Map<string, string>;
  onAssign: (slotId: string) => void;
  onRemove: (slotId: string) => void;
}

const CATEGORY_ICONS: Record<SlotCategory, string> = {
  memory: "🧮",
  m2: "💿",
  pcie: "🔌",
  sata: "💽",
};

/**
 * Finds the label of the slot that disabled a given target slot,
 * by scanning the motherboard's M.2 and PCIe sharing rules.
 */
function findDisabledByLabel(
  motherboard: Motherboard,
  targetSlotId: string,
  assignments: Record<string, string>,
): string | undefined {
  for (const slot of motherboard.m2_slots) {
    if (!(slot.id in assignments) || !slot.sharing) continue;
    for (const rule of slot.sharing) {
      if (rule.type === "disables" && rule.targets?.includes(targetSlotId)) {
        return slot.label;
      }
    }
  }
  for (const slot of motherboard.pcie_slots) {
    if (!(slot.id in assignments) || !slot.sharing) continue;
    for (const rule of slot.sharing) {
      if (rule.type === "disables" && rule.targets?.includes(targetSlotId)) {
        return slot.label;
      }
    }
  }
  return undefined;
}

export default function SlotList({
  motherboard,
  assignments,
  loadedComponents,
  disabledSlots,
  bandwidthWarnings,
  onAssign,
  onRemove,
}: SlotListProps) {
  const groups = groupSlotsByCategory(motherboard);

  return (
    <div className="space-y-8">
      {groups.map((group) => {
        const populatedCount = group.slots.filter(
          (slot) => slot.id in assignments,
        ).length;

        return (
          <section
            key={group.category}
            aria-labelledby={`section-${group.category}`}
          >
            <h2
              id={`section-${group.category}`}
              className="mb-4 flex items-center gap-2 text-lg font-semibold text-zinc-100"
            >
              <span aria-hidden="true">{CATEGORY_ICONS[group.category]}</span>
              <span>{group.displayName}</span>
              <span className="ml-auto text-sm font-normal text-zinc-400">
                {populatedCount}/{group.slots.length} populated
              </span>
            </h2>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.slots.map((slot) => {
                const componentId = assignments[slot.id];
                const assignedComponent = componentId
                  ? loadedComponents[componentId] ?? null
                  : null;
                const isDisabled = disabledSlots.has(slot.id);
                const disabledBy = isDisabled
                  ? findDisabledByLabel(motherboard, slot.id, assignments)
                  : undefined;
                const bandwidthWarning =
                  bandwidthWarnings.get(slot.id) ?? null;

                return (
                  <SlotCard
                    key={slot.id}
                    slotId={slot.id}
                    label={slot.label}
                    badges={slot.badges}
                    assignedComponent={assignedComponent}
                    isDisabled={isDisabled}
                    disabledBy={disabledBy}
                    bandwidthWarning={bandwidthWarning}
                    onAssign={() => onAssign(slot.id)}
                    onRemove={() => onRemove(slot.id)}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
