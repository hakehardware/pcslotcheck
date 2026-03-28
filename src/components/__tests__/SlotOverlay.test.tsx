/**
 * Unit tests for SlotOverlay rendering and aria-labels.
 *
 * Validates: Requirements 6.1, 6.4, 10.3, 10.4
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { SlotPosition } from "@/lib/types";
import type { VisualState } from "@/lib/physical-conflict-engine";

// Mock @dnd-kit/react — useDroppable needs a DragDropProvider context
vi.mock("@dnd-kit/react", () => ({
  useDroppable: () => ({
    ref: (el: HTMLElement | null) => {
      void el;
    },
    isDropTarget: false,
  }),
}));

import SlotOverlay from "../SlotOverlay";

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

describe("SlotOverlay visual state CSS classes", () => {
  const stateCases: [VisualState, string[]][] = [
    ["empty", ["border-dashed", "border-zinc-500"]],
    ["drop-target", ["border-green-400"]],
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
          isDropTarget={false}
        />,
      );

      const el = screen.getByRole("button");
      for (const cls of expectedClasses) {
        expect(el.className).toContain(cls);
      }
    },
  );
});


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
        isDropTarget={false}
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
          isDropTarget={false}
        />,
      );

      const el = screen.getByRole("button");
      const label = el.getAttribute("aria-label") ?? "";
      expect(label).toContain(expectedLabel);
      unmount();
    }
  });
});

describe("SlotOverlay conflict tooltip", () => {
  it("displays title attribute when conflictMessage is provided", () => {
    render(
      <SlotOverlay
        position={makeSlotPosition()}
        visualState="blocked"
        conflictMessage="Physically blocked by GPU above"
        slotLabel="PCIE_2"
        isDropTarget={false}
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
        isDropTarget={false}
      />,
    );

    const el = screen.getByRole("button");
    expect(el).not.toHaveAttribute("title");
  });
});
