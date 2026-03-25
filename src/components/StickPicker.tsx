"use client";

import { IoClose } from "react-icons/io5";
import { makeStickId } from "../lib/stick-utils";
import type { RAMComponent, MemorySlot } from "../lib/types";

interface StickPickerProps {
  kitComponent: RAMComponent;
  memorySlots: MemorySlot[];
  /** Current stick-to-slot assignments for THIS kit. Key = dimm slot ID, value = stick synthetic ID */
  stickAssignments: Record<string, string>;
  /** All assignments across all kits (to determine which slots are taken) */
  allAssignments: Record<string, string>;
  onStickAssign: (slotId: string, stickId: string) => void;
  onStickRemove: (slotId: string) => void;
  onRemoveKit: () => void;
}

/**
 * Build a reverse lookup: stickId -> slotId from an assignments map.
 */
function invertAssignments(
  assignments: Record<string, string>,
): Record<string, string> {
  const inverted: Record<string, string> = {};
  for (const [slotId, stickId] of Object.entries(assignments)) {
    inverted[stickId] = slotId;
  }
  return inverted;
}

export default function StickPicker({
  kitComponent,
  memorySlots,
  stickAssignments,
  allAssignments,
  onStickAssign,
  onStickRemove,
  onRemoveKit,
}: StickPickerProps) {
  const moduleCount = kitComponent.capacity.modules;
  const perModuleGb = kitComponent.capacity.per_module_gb;

  // Reverse lookup: stickId -> slotId (for this kit only)
  const stickToSlot = invertAssignments(stickAssignments);

  // Set of all slot IDs currently assigned (across all kits)
  const allAssignedSlotIds = new Set(Object.keys(allAssignments));

  return (
    <div
      className="rounded-lg border border-zinc-700 bg-zinc-900 p-4"
      role="group"
      aria-label={`${kitComponent.model} stick assignments`}
    >
      {/* Kit header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100">
          {kitComponent.manufacturer} {kitComponent.model}
        </h3>
        <button
          type="button"
          onClick={onRemoveKit}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-400 hover:bg-zinc-800 hover:text-red-300"
          aria-label={`Remove ${kitComponent.model}`}
        >
          <IoClose aria-hidden="true" className="h-3.5 w-3.5" />
          Remove Kit
        </button>
      </div>

      {/* Stick rows */}
      <div className="space-y-2">
        {Array.from({ length: moduleCount }, (_, i) => {
          const stickIndex = i + 1;
          const stickId = makeStickId(kitComponent.id, stickIndex);
          const assignedSlotId = stickToSlot[stickId] ?? "";

          return (
            <div
              key={stickId}
              className="flex flex-col gap-2 rounded border border-zinc-700 bg-zinc-800 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="text-sm text-zinc-300">
                Stick {stickIndex} of {moduleCount} -- {perModuleGb} GB --{" "}
                {kitComponent.model}
              </span>

              <select
                value={assignedSlotId}
                onChange={(e) => {
                  const newSlotId = e.target.value;
                  // Remove previous assignment if this stick was assigned
                  if (assignedSlotId) {
                    onStickRemove(assignedSlotId);
                  }
                  // Assign to new slot (unless "Unassigned" was selected)
                  if (newSlotId) {
                    onStickAssign(newSlotId, stickId);
                  }
                }}
                className="rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-sm text-zinc-200 focus:border-zinc-400 focus:outline-none"
                aria-label={`Slot for stick ${stickIndex} of ${kitComponent.model}`}
              >
                <option value="">Unassigned</option>
                {memorySlots.map((slot) => {
                  // A slot is taken if it appears in allAssignments
                  // BUT it should NOT be disabled if it is assigned to THIS stick
                  const isCurrentStickSlot = assignedSlotId === slot.id;
                  const isTaken =
                    allAssignedSlotIds.has(slot.id) && !isCurrentStickSlot;

                  return (
                    <option
                      key={slot.id}
                      value={slot.id}
                      disabled={isTaken}
                    >
                      {slot.id} (Ch {slot.channel}, Pos {slot.position})
                      {slot.recommended ? " [recommended]" : ""}
                      {isTaken ? " [in use]" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
