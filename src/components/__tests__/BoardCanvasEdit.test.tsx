/**
 * Property-based tests for BoardCanvasEditor component.
 *
 * Validates: Requirements 7.1, 7.2, 7.5, 7.6, 7.11
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import * as fc from "fast-check";
import BoardCanvasEditor from "../BoardCanvasEditor";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal motherboard formData with the given dimensions and slots. */
function buildFormData(opts: {
  length_mm?: unknown;
  width_mm?: unknown;
  socket?: string;
  memorySlots?: Array<{ id: string }>;
  m2Slots?: Array<{ id: string }>;
  pcieSlots?: Array<{ id: string }>;
  sataPorts?: Array<{ id: string }>;
}): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  if (opts.length_mm !== undefined) data.length_mm = opts.length_mm;
  if (opts.width_mm !== undefined) data.width_mm = opts.width_mm;
  if (opts.socket !== undefined) data.socket = opts.socket;

  if (opts.memorySlots) {
    data.memory = { slots: opts.memorySlots };
  }
  if (opts.m2Slots) {
    data.m2_slots = opts.m2Slots;
  }
  if (opts.pcieSlots) {
    data.pcie_slots = opts.pcieSlots;
  }
  if (opts.sataPorts) {
    data.sata_ports = opts.sataPorts;
  }

  return data;
}

/** Arbitrary for a positive number (used for valid dimensions). */
const positiveMmArb = fc.integer({ min: 1, max: 500 });

/** Arbitrary for non-positive or non-numeric dimension values. */
const invalidDimArb = fc.oneof(
  fc.constant(0),
  fc.constant(-1),
  fc.integer({ min: -1000, max: 0 }),
  fc.constant(""),
  fc.constant(undefined),
);

/** Arbitrary for a simple slot id string. */
const slotIdArb = fc.stringMatching(/^[a-z][a-z0-9_]{0,15}$/).filter((s) => s.length > 0);

// ---------------------------------------------------------------------------
// Feature: yaml-generator, Property 14: Board canvas button enabled state
// Validates: Requirements 7.1, 7.2
// ---------------------------------------------------------------------------
describe("Property 14: Board canvas button enabled state", () => {
  it("button is enabled when both length_mm and width_mm are positive numbers", () => {
    fc.assert(
      fc.property(positiveMmArb, positiveMmArb, (length_mm, width_mm) => {
        const onChange = vi.fn();

        const { unmount } = render(
          <BoardCanvasEditor
            formData={buildFormData({ length_mm, width_mm })}
            onChange={onChange}
          />,
        );

        const btn = screen.getByTestId("configure-slot-positions-btn");
        expect(btn).not.toBeDisabled();

        unmount();
      }),
      { numRuns: 100 },
    );
  });

  it("button is disabled when length_mm is not positive", () => {
    fc.assert(
      fc.property(invalidDimArb, positiveMmArb, (length_mm, width_mm) => {
        const onChange = vi.fn();

        const { unmount } = render(
          <BoardCanvasEditor
            formData={buildFormData({ length_mm, width_mm })}
            onChange={onChange}
          />,
        );

        const btn = screen.getByTestId("configure-slot-positions-btn");
        expect(btn).toBeDisabled();

        unmount();
      }),
      { numRuns: 100 },
    );
  });

  it("button is disabled when width_mm is not positive", () => {
    fc.assert(
      fc.property(positiveMmArb, invalidDimArb, (length_mm, width_mm) => {
        const onChange = vi.fn();

        const { unmount } = render(
          <BoardCanvasEditor
            formData={buildFormData({ length_mm, width_mm })}
            onChange={onChange}
          />,
        );

        const btn = screen.getByTestId("configure-slot-positions-btn");
        expect(btn).toBeDisabled();

        unmount();
      }),
      { numRuns: 100 },
    );
  });

  it("button is disabled when both dimensions are not positive", () => {
    fc.assert(
      fc.property(invalidDimArb, invalidDimArb, (length_mm, width_mm) => {
        const onChange = vi.fn();

        const { unmount } = render(
          <BoardCanvasEditor
            formData={buildFormData({ length_mm, width_mm })}
            onChange={onChange}
          />,
        );

        const btn = screen.getByTestId("configure-slot-positions-btn");
        expect(btn).toBeDisabled();

        unmount();
      }),
      { numRuns: 100 },
    );
  });
});


// ---------------------------------------------------------------------------
// Feature: yaml-generator, Property 15: Slot chip creation matches form slots
// Validates: Requirements 7.5, 7.6
// ---------------------------------------------------------------------------
describe("Property 15: Slot chip creation matches form slots", () => {
  /** Arbitrary for a set of unique slot ids (1-4 items). */
  const uniqueSlotIdsArb = (prefix: string) =>
    fc
      .uniqueArray(fc.integer({ min: 1, max: 20 }), { minLength: 0, maxLength: 4 })
      .map((nums) => nums.map((n) => `${prefix}_${n}`));

  /** Arbitrary for a complete motherboard slot configuration. */
  const slotConfigArb = fc.record({
    hasSocket: fc.boolean(),
    dimmIds: uniqueSlotIdsArb("dimm"),
    m2Ids: uniqueSlotIdsArb("m2"),
    pcieIds: uniqueSlotIdsArb("pcie"),
    sataIds: uniqueSlotIdsArb("sata"),
  });

  it("creates exactly one SlotOverlay chip per defined slot with correct slot_type", () => {
    fc.assert(
      fc.property(slotConfigArb, ({ hasSocket, dimmIds, m2Ids, pcieIds, sataIds }) => {
        const onChange = vi.fn();

        const formData = buildFormData({
          length_mm: 305,
          width_mm: 244,
          socket: hasSocket ? "LGA 1851" : undefined,
          memorySlots: dimmIds.map((id) => ({ id })),
          m2Slots: m2Ids.map((id) => ({ id })),
          pcieSlots: pcieIds.map((id) => ({ id })),
          sataPorts: sataIds.map((id) => ({ id })),
        });

        const { unmount } = render(
          <BoardCanvasEditor formData={formData} onChange={onChange} />,
        );

        // Click the button to open the canvas
        const btn = screen.getByTestId("configure-slot-positions-btn");
        fireEvent.click(btn);

        // Build expected slot chips (non-sata_group slots appear as SlotOverlay
        // on the board; sata_group is rendered in DriveBayArea instead).
        // BoardView filters out sata_group from SlotOverlay rendering.
        const expectedBoardChips: Array<{ type: string; id: string }> = [];

        if (hasSocket) {
          expectedBoardChips.push({ type: "CPU", id: "cpu_socket" });
        }
        for (const id of dimmIds) {
          expectedBoardChips.push({ type: "DIMM", id });
        }
        for (const id of m2Ids) {
          expectedBoardChips.push({ type: "M.2", id });
        }
        for (const id of pcieIds) {
          expectedBoardChips.push({ type: "PCIe", id });
        }

        // Verify each expected chip has a corresponding SlotOverlay with correct aria-label
        for (const chip of expectedBoardChips) {
          const label = `${chip.type} slot ${chip.id}, empty`;
          const overlay = screen.getByLabelText(label);
          expect(overlay).toBeInTheDocument();
        }

        // Count total SlotOverlay chips on the board (role="button" with slot aria-labels)
        // Each SlotOverlay has role="button" and an aria-label matching the pattern
        const allOverlays = screen.getAllByRole("button").filter((el) => {
          const ariaLabel = el.getAttribute("aria-label") ?? "";
          return /^(CPU|DIMM|M\.2|PCIe|SATA) slot .+, empty$/.test(ariaLabel);
        });

        // The board should have exactly the expected number of slot chips
        // (sata_group chips are filtered out by BoardView, so they won't appear here)
        expect(allOverlays.length).toBe(expectedBoardChips.length);

        unmount();
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: yaml-generator, Property 18: Slot synchronization with form
// Validates: Requirements 7.11
// ---------------------------------------------------------------------------
describe("Property 18: Slot synchronization with form", () => {
  it("adding slots in form adds corresponding chips on the canvas", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 1, max: 3 }),
        (initialCount, addCount) => {
          const onChange = vi.fn();

          // Start with initialCount DIMM slots
          const initialDimms = Array.from({ length: initialCount }, (_, i) => ({
            id: `dimm_${i + 1}`,
          }));

          const formData = buildFormData({
            length_mm: 305,
            width_mm: 244,
            socket: "LGA 1851",
            memorySlots: initialDimms,
          });

          const { rerender, unmount } = render(
            <BoardCanvasEditor formData={formData} onChange={onChange} />,
          );

          // Open the canvas
          const btn = screen.getByTestId("configure-slot-positions-btn");
          fireEvent.click(btn);

          // Verify initial chip count (CPU + initial DIMMs)
          const initialOverlays = screen.getAllByRole("button").filter((el) => {
            const label = el.getAttribute("aria-label") ?? "";
            return /^DIMM slot .+, empty$/.test(label);
          });
          expect(initialOverlays.length).toBe(initialCount);

          // Add more DIMM slots by re-rendering with updated formData
          const totalCount = initialCount + addCount;
          const updatedDimms = Array.from({ length: totalCount }, (_, i) => ({
            id: `dimm_${i + 1}`,
          }));

          const updatedFormData = buildFormData({
            length_mm: 305,
            width_mm: 244,
            socket: "LGA 1851",
            memorySlots: updatedDimms,
          });

          rerender(
            <BoardCanvasEditor formData={updatedFormData} onChange={onChange} />,
          );

          // Verify updated chip count
          const updatedOverlays = screen.getAllByRole("button").filter((el) => {
            const label = el.getAttribute("aria-label") ?? "";
            return /^DIMM slot .+, empty$/.test(label);
          });
          expect(updatedOverlays.length).toBe(totalCount);

          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("removing slots in form removes corresponding chips from the canvas", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }),
        fc.integer({ min: 1, max: 2 }),
        (initialCount, removeCount) => {
          const safeRemove = Math.min(removeCount, initialCount);
          const onChange = vi.fn();

          const initialM2s = Array.from({ length: initialCount }, (_, i) => ({
            id: `m2_${i + 1}`,
          }));

          const formData = buildFormData({
            length_mm: 305,
            width_mm: 244,
            m2Slots: initialM2s,
          });

          const { rerender, unmount } = render(
            <BoardCanvasEditor formData={formData} onChange={onChange} />,
          );

          // Open the canvas
          const btn = screen.getByTestId("configure-slot-positions-btn");
          fireEvent.click(btn);

          // Verify initial M.2 chip count
          const initialOverlays = screen.getAllByRole("button").filter((el) => {
            const label = el.getAttribute("aria-label") ?? "";
            return /^M\.2 slot .+, empty$/.test(label);
          });
          expect(initialOverlays.length).toBe(initialCount);

          // Remove slots by re-rendering with fewer
          const remainingCount = initialCount - safeRemove;
          const reducedM2s = Array.from({ length: remainingCount }, (_, i) => ({
            id: `m2_${i + 1}`,
          }));

          const updatedFormData = buildFormData({
            length_mm: 305,
            width_mm: 244,
            m2Slots: reducedM2s,
          });

          rerender(
            <BoardCanvasEditor formData={updatedFormData} onChange={onChange} />,
          );

          // Verify reduced chip count
          const updatedOverlays = screen.getAllByRole("button").filter((el) => {
            const label = el.getAttribute("aria-label") ?? "";
            return /^M\.2 slot .+, empty$/.test(label);
          });
          expect(updatedOverlays.length).toBe(remainingCount);

          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });
});
