/**
 * Unit + property tests for SlotOverlay rendering, click behavior, and aria-labels.
 *
 * Validates: Requirements 2.6, 2.7, 6.1, 6.4, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 10.3, 10.4
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import * as fc from "fast-check";
import type { SlotPosition } from "@/lib/types";
import type { VisualState } from "@/lib/physical-conflict-engine";
import SlotOverlay, { buildAriaLabel } from "../SlotOverlay";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal SlotPosition stub for tests. */
function makeSlotPosition(
  overrides: Partial<SlotPosition> = {},
): SlotPosition {
  return {
    slot_type: "pcie",
    slot_id: "pcie_1",
    x_pct: 10,
    y_pct: 20,
    width_pct: 30,
    height_pct: 5,
    ...overrides,
  };
}

const SLOT_TYPES: SlotPosition["slot_type"][] = [
  "cpu",
  "dimm",
  "pcie",
  "m2",
  "sata_group",
];

/** All visual states that should NOT trigger the onSlotClick callback. */
const NON_CLICKABLE_STATES: VisualState[] = [
  "populated",
  "blocked",
  "covered",
  "bandwidth-reduced",
];

/** All visual states (excluding drop-target which is never rendered). */
const ALL_RENDERED_STATES: VisualState[] = [
  "empty",
  "populated",
  "blocked",
  "covered",
  "bandwidth-reduced",
];

// ---------------------------------------------------------------------------
// Shared arbitraries
// ---------------------------------------------------------------------------

const arbSlotType: fc.Arbitrary<SlotPosition["slot_type"]> = fc.constantFrom(
  ...SLOT_TYPES,
);

const arbSlotId: fc.Arbitrary<string> = fc
  .tuple(arbSlotType, fc.integer({ min: 0, max: 9 }))
  .map(([type, n]) => `${type}_${n}`);

const arbNonClickableState: fc.Arbitrary<VisualState> = fc.constantFrom(
  ...NON_CLICKABLE_STATES,
);

const arbVisualState: fc.Arbitrary<VisualState> = fc.constantFrom(
  ...ALL_RENDERED_STATES,
);

const arbSlotPosition: fc.Arbitrary<SlotPosition> = fc
  .tuple(
    arbSlotType,
    arbSlotId,
    fc.double({ min: 0, max: 100, noNaN: true }),
    fc.double({ min: 0, max: 100, noNaN: true }),
    fc.double({ min: 1, max: 50, noNaN: true }),
    fc.double({ min: 1, max: 50, noNaN: true }),
  )
  .map(([slot_type, slot_id, x_pct, y_pct, width_pct, height_pct]) => ({
    slot_type,
    slot_id,
    x_pct,
    y_pct,
    width_pct,
    height_pct,
  }));

// ---------------------------------------------------------------------------
// Unit tests: visual state CSS classes
// ---------------------------------------------------------------------------

describe("SlotOverlay visual state CSS classes", () => {
  const stateCases: [VisualState, string[]][] = [
    ["empty", ["border-dashed", "border-zinc-500"]],
    ["populated", ["border-zinc-400"]],
    ["covered", ["border-yellow-400"]],
    ["blocked", ["border-red-400"]],
    ["bandwidth-reduced", ["border-orange-400"]],
  ];

  it.each(stateCases)(
    "renders correct classes for %s state",
    (state, expectedClasses) => {
      render(
        <SlotOverlay
          position={makeSlotPosition()}
          visualState={state}
          slotLabel="PCIE_1"
        />,
      );

      const el = screen.getByRole("button");
      for (const cls of expectedClasses) {
        expect(el.className).toContain(cls);
      }
    },
  );
});

// ---------------------------------------------------------------------------
// Unit tests: aria-label
// ---------------------------------------------------------------------------

describe("SlotOverlay aria-label", () => {
  it("contains slot type label, slot ID, and visual state", () => {
    render(
      <SlotOverlay
        position={makeSlotPosition({
          slot_type: "pcie",
          slot_id: "pcie_1",
        })}
        visualState="blocked"
        slotLabel="PCIE_1"
      />,
    );

    const el = screen.getByRole("button");
    const label = el.getAttribute("aria-label") ?? "";
    expect(label).toContain("PCIe");
    expect(label).toContain("pcie_1");
    expect(label).toContain("blocked");
  });

  it("uses correct type labels for each slot type", () => {
    const typeCases: [SlotPosition["slot_type"], string][] = [
      ["cpu", "CPU"],
      ["dimm", "DIMM"],
      ["pcie", "PCIe"],
      ["m2", "M.2"],
      ["sata_group", "SATA"],
    ];

    for (const [slotType, expectedLabel] of typeCases) {
      const { unmount } = render(
        <SlotOverlay
          position={makeSlotPosition({
            slot_type: slotType,
            slot_id: `${slotType}_0`,
          })}
          visualState="empty"
          slotLabel={`${slotType}_0`}
        />,
      );

      const el = screen.getByRole("button");
      const label = el.getAttribute("aria-label") ?? "";
      expect(label).toContain(expectedLabel);
      unmount();
    }
  });
});

// ---------------------------------------------------------------------------
// Unit tests: conflict tooltip
// ---------------------------------------------------------------------------

describe("SlotOverlay conflict tooltip", () => {
  it("displays title attribute when conflictMessage is provided", () => {
    render(
      <SlotOverlay
        position={makeSlotPosition()}
        visualState="blocked"
        conflictMessage="Physically blocked by GPU above"
        slotLabel="PCIE_2"
      />,
    );

    const el = screen.getByRole("button");
    expect(el).toHaveAttribute("title", "Physically blocked by GPU above");
  });

  it("has no title attribute when no conflict message is provided", () => {
    render(
      <SlotOverlay
        position={makeSlotPosition()}
        visualState="empty"
        slotLabel="PCIE_1"
      />,
    );

    const el = screen.getByRole("button");
    expect(el).not.toHaveAttribute("title");
  });
});


// ---------------------------------------------------------------------------
// Feature: click-to-assign-interaction, Property 10: Non-clickable slot states do not invoke callback
// **Validates: Requirements 2.6, 2.7, 8.3, 8.4, 8.7**
// ---------------------------------------------------------------------------

describe("Property 10: Non-clickable slot states do not invoke callback", () => {
  it("click on non-empty visual states does not invoke onSlotClick", () => {
    fc.assert(
      fc.property(
        arbSlotPosition,
        arbNonClickableState,
        (position, visualState) => {
          const onSlotClick = vi.fn();
          const { unmount } = render(
            <SlotOverlay
              position={position}
              visualState={visualState}
              slotLabel={position.slot_id}
              onSlotClick={onSlotClick}
              mode="display"
            />,
          );

          const el = screen.getByRole("button");
          fireEvent.click(el);
          expect(onSlotClick).not.toHaveBeenCalled();
          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Enter keypress on non-empty visual states does not invoke onSlotClick", () => {
    fc.assert(
      fc.property(
        arbSlotPosition,
        arbNonClickableState,
        (position, visualState) => {
          const onSlotClick = vi.fn();
          const { unmount } = render(
            <SlotOverlay
              position={position}
              visualState={visualState}
              slotLabel={position.slot_id}
              onSlotClick={onSlotClick}
              mode="display"
            />,
          );

          const el = screen.getByRole("button");
          fireEvent.keyDown(el, { key: "Enter" });
          expect(onSlotClick).not.toHaveBeenCalled();
          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("click on empty slot in edit mode does not invoke onSlotClick", () => {
    fc.assert(
      fc.property(arbSlotPosition, (position) => {
        const onSlotClick = vi.fn();
        const { unmount } = render(
          <SlotOverlay
            position={position}
            visualState="empty"
            slotLabel={position.slot_id}
            onSlotClick={onSlotClick}
            mode="edit"
          />,
        );

        const el = screen.getByRole("button");
        fireEvent.click(el);
        expect(onSlotClick).not.toHaveBeenCalled();

        fireEvent.keyDown(el, { key: "Enter" });
        expect(onSlotClick).not.toHaveBeenCalled();
        unmount();
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: click-to-assign-interaction, Property 11: Empty slot activation invokes callback with correct arguments
// **Validates: Requirements 8.2, 8.5**
// ---------------------------------------------------------------------------

describe("Property 11: Empty slot activation invokes callback with correct arguments", () => {
  it("click on empty slot in display mode invokes onSlotClick with correct slotId and slotType", () => {
    fc.assert(
      fc.property(arbSlotPosition, (position) => {
        const onSlotClick = vi.fn();
        const { unmount } = render(
          <SlotOverlay
            position={position}
            visualState="empty"
            slotLabel={position.slot_id}
            onSlotClick={onSlotClick}
            mode="display"
          />,
        );

        const el = screen.getByRole("button");
        fireEvent.click(el);
        expect(onSlotClick).toHaveBeenCalledTimes(1);
        expect(onSlotClick).toHaveBeenCalledWith(
          position.slot_id,
          position.slot_type,
        );
        unmount();
      }),
      { numRuns: 100 },
    );
  });

  it("Enter keypress on empty slot in display mode invokes onSlotClick with correct slotId and slotType", () => {
    fc.assert(
      fc.property(arbSlotPosition, (position) => {
        const onSlotClick = vi.fn();
        const { unmount } = render(
          <SlotOverlay
            position={position}
            visualState="empty"
            slotLabel={position.slot_id}
            onSlotClick={onSlotClick}
            mode="display"
          />,
        );

        const el = screen.getByRole("button");
        fireEvent.keyDown(el, { key: "Enter" });
        expect(onSlotClick).toHaveBeenCalledTimes(1);
        expect(onSlotClick).toHaveBeenCalledWith(
          position.slot_id,
          position.slot_type,
        );
        unmount();
      }),
      { numRuns: 100 },
    );
  });

  it("empty slot in display mode has cursor-pointer class", () => {
    fc.assert(
      fc.property(arbSlotPosition, (position) => {
        const { unmount } = render(
          <SlotOverlay
            position={position}
            visualState="empty"
            slotLabel={position.slot_id}
            mode="display"
          />,
        );

        const el = screen.getByRole("button");
        expect(el.className).toContain("cursor-pointer");
        unmount();
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: click-to-assign-interaction, Property 19: Aria-label format preserved
// **Validates: Requirements 8.6**
// ---------------------------------------------------------------------------

describe("Property 19: Aria-label format preserved", () => {
  const TYPE_LABEL_MAP: Record<SlotPosition["slot_type"], string> = {
    cpu: "CPU",
    dimm: "DIMM",
    pcie: "PCIe",
    m2: "M.2",
    sata_group: "SATA",
  };

  it("buildAriaLabel returns '{TypeLabel} slot {slotId}, {visualState}' for all slot types and visual states", () => {
    fc.assert(
      fc.property(
        arbSlotType,
        arbSlotId,
        arbVisualState,
        (slotType, slotId, visualState) => {
          const result = buildAriaLabel(slotType, slotId, visualState);
          const expectedLabel = TYPE_LABEL_MAP[slotType];
          const expected = `${expectedLabel} slot ${slotId}, ${visualState}`;
          expect(result).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rendered SlotOverlay aria-label matches buildAriaLabel output", () => {
    fc.assert(
      fc.property(
        arbSlotPosition,
        arbVisualState,
        (position, visualState) => {
          const { unmount } = render(
            <SlotOverlay
              position={position}
              visualState={visualState}
              slotLabel={position.slot_id}
            />,
          );

          const el = screen.getByRole("button");
          const renderedLabel = el.getAttribute("aria-label");
          const expected = buildAriaLabel(
            position.slot_type,
            position.slot_id,
            visualState,
          );
          expect(renderedLabel).toBe(expected);
          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });
});
