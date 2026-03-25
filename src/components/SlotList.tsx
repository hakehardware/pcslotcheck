"use client";

import { IoAdd } from "react-icons/io5";
import { groupSlotsByCategory } from "../lib/ui-helpers";
import { getKitAssignments } from "../lib/stick-utils";
import SlotCard from "./SlotCard";
import StickPicker from "./StickPicker";
import type { Motherboard, Component, RAMComponent } from "../lib/types";
import type { SlotCategory } from "../lib/ui-types";

interface SlotListProps {
  motherboard: Motherboard;
  assignments: Record<string, string>;
  loadedComponents: Record<string, Component>;
  disabledSlots: Set<string>;
  bandwidthWarnings: Map<string, string>;
  selectedKits: Set<string>;
  onAssign: (slotId: string) => void;
  onRemove: (slotId: string) => void;
  onAddRamKit: () => void;
  onStickAssign: (slotId: string, stickId: string) => void;
  onStickRemove: (slotId: string) => void;
  onRemoveKit: (kitComponentId: string) => void;
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
  selectedKits,
  onAssign,
  onRemove,
  onAddRamKit,
  onStickAssign,
  onStickRemove,
  onRemoveKit,
}: SlotListProps) {
  const groups = groupSlotsByCategory(motherboard);

  // Count how many DIMM slots are currently assigned (for populated count)
  const memorySlotIds = new Set(motherboard.memory.slots.map((s) => s.id));
  const assignedDimmCount = Object.keys(assignments).filter((slotId) =>
    memorySlotIds.has(slotId),
  ).length;
  const totalDimmSlots = motherboard.memory.slots.length;

  // Check if there are still available DIMM slots for adding more kits
  const hasAvailableDimmSlots = assignedDimmCount < totalDimmSlots;

  return (
    <div className="space-y-8">
      {groups.map((group) => {
        // Memory section gets special rendering with StickPickers
        if (group.category === "memory") {
          return (
            <section
              key={group.category}
              aria-labelledby={`section-${group.category}`}
            >
              <h2
                id={`section-${group.category}`}
                className="mb-4 flex items-center gap-2 text-lg font-semibold text-zinc-100"
              >
                <span>{group.displayName}</span>
                <span className="ml-auto text-sm font-normal text-zinc-400">
                  {assignedDimmCount}/{totalDimmSlots} populated
                </span>
              </h2>

              <div className="space-y-3">
                {Array.from(selectedKits).map((kitId) => {
                  const kitComponent = loadedComponents[kitId] as
                    | RAMComponent
                    | undefined;
                  if (!kitComponent || kitComponent.type !== "ram") {
                    return (
                      <div
                        key={kitId}
                        className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 text-sm text-zinc-400"
                      >
                        Loading kit data...
                      </div>
                    );
                  }

                  const kitStickAssignments = getKitAssignments(
                    assignments,
                    kitId,
                  );

                  return (
                    <StickPicker
                      key={kitId}
                      kitComponent={kitComponent}
                      memorySlots={motherboard.memory.slots}
                      stickAssignments={kitStickAssignments}
                      allAssignments={assignments}
                      onStickAssign={onStickAssign}
                      onStickRemove={onStickRemove}
                      onRemoveKit={() => onRemoveKit(kitId)}
                    />
                  );
                })}

                {hasAvailableDimmSlots && (
                  <button
                    type="button"
                    onClick={onAddRamKit}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-600 px-4 py-3 text-sm text-zinc-400 hover:border-zinc-500 hover:text-zinc-300"
                  >
                    <IoAdd aria-hidden="true" className="h-4 w-4" />
                    Add RAM Kit
                  </button>
                )}
              </div>
            </section>
          );
        }

        // Non-memory sections render as before
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
