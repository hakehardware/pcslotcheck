// Property tests for StickPicker component rendering.
// Feature: ram-kit-slot-assignment, Properties 2 and 3.

import { describe, it, expect } from "vitest";
import { render, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import fc from "fast-check";

import StickPicker from "../../src/components/StickPicker";
import { makeStickId } from "../../src/lib/stick-utils";
import {
  arbRAMComponent,
  arbMemoryConfig,
  arbStickAssignments,
} from "../../src/lib/__tests__/generators";
import type { RAMComponent, MemoryConfig } from "../../src/lib/types";

// ---------------------------------------------------------------------------
// Property 2: StickPicker renders correct stick rows
// Validates: Requirements 2.1, 2.2, 2.3
//
// For any RAM kit with N modules and any motherboard with M DIMM slots,
// the StickPicker should render exactly N rows, each labeled
// "Stick {i} of {N}" with the correct per-stick capacity, and each row's
// dropdown should list all M DIMM slots.
// ---------------------------------------------------------------------------

describe("Property 2: StickPicker renders correct stick rows", () => {
  it("renders exactly N stick rows with correct labels and M slot options per dropdown", () => {
    fc.assert(
      fc.property(
        arbRAMComponent(),
        arbMemoryConfig(),
        (kit: RAMComponent, memConfig: MemoryConfig) => {
          const moduleCount = kit.capacity.modules;
          const slots = memConfig.slots;

          const { container } = render(
            <StickPicker
              kitComponent={kit}
              memorySlots={slots}
              stickAssignments={{}}
              allAssignments={{}}
              onStickAssign={() => {}}
              onStickRemove={() => {}}
              onRemoveKit={() => {}}
            />,
          );

          // Each stick row is rendered inside a div with a span containing the label.
          // The label format is: "Stick {i} of {N} -- {perModuleGb} GB -- {model}"
          const selects = container.querySelectorAll("select");
          expect(selects.length).toBe(moduleCount);

          // Verify each row label and dropdown option count
          for (let i = 1; i <= moduleCount; i++) {
            const expectedLabel = `Stick ${i} of ${moduleCount} -- ${kit.capacity.per_module_gb} GB`;

            // Find the span containing this stick label
            const spans = Array.from(container.querySelectorAll("span"));
            const matchingSpan = spans.find((span) =>
              (span.textContent ?? "").includes(expectedLabel),
            );
            expect(matchingSpan).toBeTruthy();

            // The select for this stick should have aria-label referencing stick index
            const select = container.querySelector(
              `select[aria-label="Slot for stick ${i} of ${kit.model}"]`,
            );
            expect(select).toBeTruthy();

            if (select) {
              // Options = 1 "Unassigned" + M slot options
              const options = select.querySelectorAll("option");
              expect(options.length).toBe(1 + slots.length);

              // First option is "Unassigned"
              expect(options[0].textContent).toBe("Unassigned");
              expect(options[0].getAttribute("value")).toBe("");

              // Each slot option should contain the slot ID
              for (let s = 0; s < slots.length; s++) {
                const slotOption = options[s + 1];
                expect(slotOption.getAttribute("value")).toBe(slots[s].id);
                expect(slotOption.textContent).toContain(slots[s].id);
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ---------------------------------------------------------------------------
// Property 3: Assigned DIMM slots are disabled in other stick dropdowns
// Validates: Requirements 2.4
//
// For any set of stick-to-slot assignments, a DIMM slot that is already
// assigned to a stick should appear as disabled in the dropdowns of all
// other unassigned sticks (both within the same kit and across kits).
// ---------------------------------------------------------------------------

describe("Property 3: Assigned DIMM slots are disabled in other stick dropdowns", () => {
  it("slots assigned to one stick are disabled in all other stick dropdowns", () => {
    fc.assert(
      fc.property(
        arbRAMComponent(),
        arbMemoryConfig(),
        (kit: RAMComponent, memConfig: MemoryConfig) => {
          const moduleCount = kit.capacity.modules;
          const slots = memConfig.slots;
          const slotIds = slots.map((s) => s.id);

          // Build a partial assignment: assign the first stick to the first
          // available slot (if any). We use the shared generator to create
          // realistic assignments, but for this property we need at least one
          // assignment to test the disabled behavior.
          if (slotIds.length === 0 || moduleCount < 2) {
            // Nothing meaningful to test with 0 slots or single-stick kits
            return;
          }

          // Assign stick 1 to slot 0, stick 2 to slot 1 (if available)
          const assignCount = Math.min(moduleCount, slotIds.length);
          const stickAssignments: Record<string, string> = {};
          for (let i = 0; i < assignCount; i++) {
            stickAssignments[slotIds[i]] = makeStickId(kit.id, i + 1);
          }

          const { container } = render(
            <StickPicker
              kitComponent={kit}
              memorySlots={slots}
              stickAssignments={stickAssignments}
              allAssignments={stickAssignments}
              onStickAssign={() => {}}
              onStickRemove={() => {}}
              onRemoveKit={() => {}}
            />,
          );

          const selects = container.querySelectorAll("select");
          expect(selects.length).toBe(moduleCount);

          // For each stick's dropdown, check that slots assigned to OTHER
          // sticks are disabled, and the slot assigned to THIS stick is not.
          for (let stickIdx = 0; stickIdx < moduleCount; stickIdx++) {
            const select = selects[stickIdx];
            const stickId = makeStickId(kit.id, stickIdx + 1);
            const thisStickSlot = Object.entries(stickAssignments).find(
              ([, sid]) => sid === stickId,
            )?.[0];

            for (const slot of slots) {
              const option = select.querySelector(
                `option[value="${slot.id}"]`,
              ) as HTMLOptionElement | null;
              if (!option) continue;

              const isAssignedToOther =
                slot.id in stickAssignments &&
                stickAssignments[slot.id] !== stickId;

              if (isAssignedToOther) {
                expect(option.disabled).toBe(true);
              } else if (slot.id === thisStickSlot) {
                // The slot assigned to this stick should NOT be disabled
                expect(option.disabled).toBe(false);
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("slots assigned by other kits appear disabled in all stick dropdowns", () => {
    fc.assert(
      fc.property(
        arbRAMComponent(),
        arbRAMComponent(),
        arbMemoryConfig(),
        (kitA: RAMComponent, kitB: RAMComponent, memConfig: MemoryConfig) => {
          const slots = memConfig.slots;
          const slotIds = slots.map((s) => s.id);

          if (slotIds.length < 2 || kitA.id === kitB.id) {
            // Need at least 2 slots and distinct kits
            return;
          }

          // Kit B occupies the first slot
          const otherKitAssignments: Record<string, string> = {
            [slotIds[0]]: makeStickId(kitB.id, 1),
          };

          // Kit A has no assignments yet
          const kitAAssignments: Record<string, string> = {};

          // allAssignments includes both kits
          const allAssignments = { ...otherKitAssignments, ...kitAAssignments };

          const { container } = render(
            <StickPicker
              kitComponent={kitA}
              memorySlots={slots}
              stickAssignments={kitAAssignments}
              allAssignments={allAssignments}
              onStickAssign={() => {}}
              onStickRemove={() => {}}
              onRemoveKit={() => {}}
            />,
          );

          const selects = container.querySelectorAll("select");

          // In every dropdown for kit A, the slot occupied by kit B should be disabled
          for (const select of selects) {
            const occupiedOption = select.querySelector(
              `option[value="${slotIds[0]}"]`,
            ) as HTMLOptionElement | null;
            if (occupiedOption) {
              expect(occupiedOption.disabled).toBe(true);
            }

            // Other slots should not be disabled
            for (let s = 1; s < slotIds.length; s++) {
              const freeOption = select.querySelector(
                `option[value="${slotIds[s]}"]`,
              ) as HTMLOptionElement | null;
              if (freeOption) {
                expect(freeOption.disabled).toBe(false);
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
