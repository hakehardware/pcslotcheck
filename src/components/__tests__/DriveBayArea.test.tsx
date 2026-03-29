// Unit and property tests for DriveBayArea component.

import { describe, it, expect, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import * as fc from "fast-check";
import DriveBayArea from "../DriveBayArea";
import type { SATAPort, Component, SATASSDComponent } from "@/lib/types";
import type { VisualState } from "@/lib/physical-conflict-engine";

// ===================================================================
// Generators
// ===================================================================

/** Generate a random SATA port with a unique id based on index. */
function arbSataPort(index: number): fc.Arbitrary<SATAPort> {
  return fc.record({
    id: fc.constant(`sata_${index + 1}`),
    version: fc.constantFrom("SATA III", "SATA II"),
    source: fc.constantFrom("CPU" as const, "Chipset" as const),
    disabled_by: fc.constant(null),
    sharing: fc.constant(null),
  });
}

/** Generate an array of 1-8 SATA ports with sequential ids. */
const arbSataPorts: fc.Arbitrary<SATAPort[]> = fc
  .integer({ min: 1, max: 8 })
  .chain((count) =>
    fc.tuple(...Array.from({ length: count }, (_, i) => arbSataPort(i))),
  );

// ===================================================================
// Unit Tests
// ===================================================================

describe("DriveBayArea unit tests", () => {
  it("renders correct number of bays for 4 SATA ports", () => {
    const ports: SATAPort[] = Array.from({ length: 4 }, (_, i) => ({
      id: `sata_${i + 1}`,
      version: "SATA III",
      source: "Chipset" as const,
      disabled_by: null,
    }));

    const { getAllByTestId } = render(
      <DriveBayArea
        sataPorts={ports}
        assignments={{}}
        loadedComponents={{}}
        visualStates={{}}
        conflictMessages={{}}
        mode="display"
      />,
    );

    const bays = getAllByTestId(/^drive-bay-sata_/);
    expect(bays).toHaveLength(4);
  });

  it("shows 'No SATA ports' when sataPorts is empty", () => {
    const { getByText } = render(
      <DriveBayArea
        sataPorts={[]}
        assignments={{}}
        loadedComponents={{}}
        visualStates={{}}
        conflictMessages={{}}
        mode="display"
      />,
    );

    expect(getByText("No SATA ports")).toBeTruthy();
  });

  it("shows populated state with model name when assigned", () => {
    const ports: SATAPort[] = [
      { id: "sata_1", version: "SATA III", source: "Chipset", disabled_by: null },
    ];
    const comp: SATASSDComponent = {
      id: "samsung-870-evo",
      type: "sata_ssd",
      manufacturer: "Samsung",
      model: "870 EVO 1TB",
      form_factor: "2.5",
      capacity_gb: 1000,
      interface: "SATA III",
      drive_type: "ssd",
      schema_version: "1.0",
    };

    const { getByText } = render(
      <DriveBayArea
        sataPorts={ports}
        assignments={{ sata_1: "samsung-870-evo" }}
        loadedComponents={{ "samsung-870-evo": comp }}
        visualStates={{ sata_1: "populated" }}
        conflictMessages={{}}
        mode="display"
      />,
    );

    expect(getByText("870 EVO 1TB")).toBeTruthy();
  });

  it("shows blocked state when sharing rule disables port", () => {
    const ports: SATAPort[] = [
      { id: "sata_1", version: "SATA III", source: "Chipset", disabled_by: "m2_1" },
    ];

    const { getByTestId } = render(
      <DriveBayArea
        sataPorts={ports}
        assignments={{}}
        loadedComponents={{}}
        visualStates={{ sata_1: "blocked" }}
        conflictMessages={{ sata_1: "Disabled by M.2 slot m2_1" }}
        mode="display"
      />,
    );

    const bay = getByTestId("drive-bay-sata_1");
    expect(bay.className).toContain("border-red-400");
    expect(bay.className).toContain("bg-red-400/20");
  });

  it("renders bays in edit mode without droppable ref", () => {
    const ports: SATAPort[] = [
      { id: "sata_1", version: "SATA III", source: "Chipset", disabled_by: null },
    ];

    const { getByTestId } = render(
      <DriveBayArea
        sataPorts={ports}
        assignments={{}}
        loadedComponents={{}}
        visualStates={{}}
        conflictMessages={{}}
        mode="edit"
      />,
    );

    expect(getByTestId("drive-bay-sata_1")).toBeTruthy();
  });
});


// ===================================================================
// Property Tests
// ===================================================================

// ---------------------------------------------------------------------------
// Feature: case-frame-board-revamp, Property 5: Drive bay slot count matches SATA ports
// **Validates: Requirements 9.2, 9.3**
// ---------------------------------------------------------------------------

describe("Property 5: Drive bay slot count matches SATA ports", () => {
  it("renders exactly one bay per SATA port with matching labels", () => {
    fc.assert(
      fc.property(arbSataPorts, (ports) => {
        cleanup();
        const { container } = render(
          <DriveBayArea
            sataPorts={ports}
            assignments={{}}
            loadedComponents={{}}
            visualStates={{}}
            conflictMessages={{}}
            mode="display"
          />,
        );

        const bays = container.querySelectorAll("[data-testid^='drive-bay-sata_']");

        // Bay count matches port count
        expect(bays).toHaveLength(ports.length);

        // Each bay label matches the corresponding port id
        for (let i = 0; i < ports.length; i++) {
          expect(bays[i].getAttribute("data-testid")).toBe(
            `drive-bay-${ports[i].id}`,
          );
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: case-frame-board-revamp, Property 6: Sharing rule disabled SATA produces blocked drive bay
// **Validates: Requirements 9.6**
// ---------------------------------------------------------------------------

describe("Property 6: Sharing rule disabled SATA -> blocked drive bay", () => {
  // Generator: produce SATA ports where a random subset are blocked
  const arbPortsWithBlocked: fc.Arbitrary<{
    ports: SATAPort[];
    visualStates: Record<string, VisualState>;
    blockedIds: string[];
  }> = fc
    .integer({ min: 1, max: 8 })
    .chain((count) => {
      const ports: SATAPort[] = Array.from({ length: count }, (_, i) => ({
        id: `sata_${i + 1}`,
        version: "SATA III",
        source: "Chipset" as const,
        disabled_by: null,
        sharing: null,
      }));

      // Generate a boolean mask for which ports are blocked
      return fc
        .array(fc.boolean(), { minLength: count, maxLength: count })
        .filter((mask) => mask.some(Boolean)) // at least one blocked
        .map((mask) => {
          const visualStates: Record<string, VisualState> = {};
          const blockedIds: string[] = [];

          for (let i = 0; i < count; i++) {
            if (mask[i]) {
              visualStates[ports[i].id] = "blocked";
              blockedIds.push(ports[i].id);
            } else {
              visualStates[ports[i].id] = "empty";
            }
          }

          return { ports, visualStates, blockedIds };
        });
    });

  it("blocked SATA ports render with blocked visual state classes", () => {
    fc.assert(
      fc.property(arbPortsWithBlocked, ({ ports, visualStates, blockedIds }) => {
        cleanup();
        const { container } = render(
          <DriveBayArea
            sataPorts={ports}
            assignments={{}}
            loadedComponents={{}}
            visualStates={visualStates}
            conflictMessages={{}}
            mode="display"
          />,
        );

        for (const portId of blockedIds) {
          const bay = container.querySelector(`[data-testid="drive-bay-${portId}"]`);
          expect(bay).not.toBeNull();
          expect(bay!.className).toContain("border-red-400");
          expect(bay!.className).toContain("bg-red-400/20");
        }
      }),
      { numRuns: 100 },
    );
  });
});


// ---------------------------------------------------------------------------
// Shared arbitraries for click behavior tests
// ---------------------------------------------------------------------------

/** Visual states that should NOT trigger the onBayClick callback. */
const NON_CLICKABLE_BAY_STATES: VisualState[] = ["blocked", "populated"];

const arbNonClickableBayState: fc.Arbitrary<VisualState> = fc.constantFrom(
  ...NON_CLICKABLE_BAY_STATES,
);

const arbPortId: fc.Arbitrary<string> = fc
  .integer({ min: 1, max: 20 })
  .map((n) => `sata_${n}`);

/** Generate a single SATA port with a given id. */
function makeSataPort(id: string): SATAPort {
  return {
    id,
    version: "SATA III",
    source: "Chipset",
    disabled_by: null,
  };
}

/** Generate a SATA SSD component stub for populated bays. */
function makeSataComponent(id: string): SATASSDComponent {
  return {
    id,
    type: "sata_ssd",
    manufacturer: "TestMfr",
    model: "TestModel",
    form_factor: "2.5",
    capacity_gb: 500,
    interface: "SATA III",
    drive_type: "ssd",
    schema_version: "1.0",
  };
}

// ---------------------------------------------------------------------------
// Feature: click-to-assign-interaction, Property 12: Non-clickable bay states do not invoke callback
// **Validates: Requirements 9.3, 9.4**
// ---------------------------------------------------------------------------

describe("Property 12: Non-clickable bay states do not invoke callback", () => {
  it("click on blocked bay does not invoke onBayClick", () => {
    fc.assert(
      fc.property(arbPortId, (portId) => {
        cleanup();
        const onBayClick = vi.fn();
        const port = makeSataPort(portId);

        render(
          <DriveBayArea
            sataPorts={[port]}
            assignments={{}}
            loadedComponents={{}}
            visualStates={{ [portId]: "blocked" }}
            conflictMessages={{}}
            mode="display"
            onBayClick={onBayClick}
          />,
        );

        const bay = screen.getByTestId(`drive-bay-${portId}`);
        fireEvent.click(bay);
        expect(onBayClick).not.toHaveBeenCalled();
        cleanup();
      }),
      { numRuns: 100 },
    );
  });

  it("click on populated bay does not invoke onBayClick", () => {
    fc.assert(
      fc.property(arbPortId, (portId) => {
        cleanup();
        const onBayClick = vi.fn();
        const port = makeSataPort(portId);
        const compId = `comp-${portId}`;
        const comp = makeSataComponent(compId);

        render(
          <DriveBayArea
            sataPorts={[port]}
            assignments={{ [portId]: compId }}
            loadedComponents={{ [compId]: comp }}
            visualStates={{ [portId]: "populated" }}
            conflictMessages={{}}
            mode="display"
            onBayClick={onBayClick}
          />,
        );

        const bay = screen.getByTestId(`drive-bay-${portId}`);
        fireEvent.click(bay);
        expect(onBayClick).not.toHaveBeenCalled();
        cleanup();
      }),
      { numRuns: 100 },
    );
  });

  it("Enter keypress on non-clickable bay states does not invoke onBayClick", () => {
    fc.assert(
      fc.property(
        arbPortId,
        arbNonClickableBayState,
        (portId, visualState) => {
          cleanup();
          const onBayClick = vi.fn();
          const port = makeSataPort(portId);

          const assignments: Record<string, string> =
            visualState === "populated" ? { [portId]: `comp-${portId}` } : {};
          const loadedComponents: Record<string, Component> =
            visualState === "populated"
              ? { [`comp-${portId}`]: makeSataComponent(`comp-${portId}`) }
              : {};

          render(
            <DriveBayArea
              sataPorts={[port]}
              assignments={assignments}
              loadedComponents={loadedComponents}
              visualStates={{ [portId]: visualState }}
              conflictMessages={{}}
              mode="display"
              onBayClick={onBayClick}
            />,
          );

          const bay = screen.getByTestId(`drive-bay-${portId}`);
          fireEvent.keyDown(bay, { key: "Enter" });
          expect(onBayClick).not.toHaveBeenCalled();
          cleanup();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: click-to-assign-interaction, Property 13: Empty bay activation invokes callback with correct port ID
// **Validates: Requirements 9.2, 9.5**
// ---------------------------------------------------------------------------

describe("Property 13: Empty bay activation invokes callback with correct port ID", () => {
  it("click on empty, non-blocked bay invokes onBayClick with correct port ID", () => {
    fc.assert(
      fc.property(arbPortId, (portId) => {
        cleanup();
        const onBayClick = vi.fn();
        const port = makeSataPort(portId);

        render(
          <DriveBayArea
            sataPorts={[port]}
            assignments={{}}
            loadedComponents={{}}
            visualStates={{ [portId]: "empty" }}
            conflictMessages={{}}
            mode="display"
            onBayClick={onBayClick}
          />,
        );

        const bay = screen.getByTestId(`drive-bay-${portId}`);
        fireEvent.click(bay);
        expect(onBayClick).toHaveBeenCalledTimes(1);
        expect(onBayClick).toHaveBeenCalledWith(portId);
        cleanup();
      }),
      { numRuns: 100 },
    );
  });

  it("Enter keypress on empty, non-blocked bay invokes onBayClick with correct port ID", () => {
    fc.assert(
      fc.property(arbPortId, (portId) => {
        cleanup();
        const onBayClick = vi.fn();
        const port = makeSataPort(portId);

        render(
          <DriveBayArea
            sataPorts={[port]}
            assignments={{}}
            loadedComponents={{}}
            visualStates={{ [portId]: "empty" }}
            conflictMessages={{}}
            mode="display"
            onBayClick={onBayClick}
          />,
        );

        const bay = screen.getByTestId(`drive-bay-${portId}`);
        fireEvent.keyDown(bay, { key: "Enter" });
        expect(onBayClick).toHaveBeenCalledTimes(1);
        expect(onBayClick).toHaveBeenCalledWith(portId);
        cleanup();
      }),
      { numRuns: 100 },
    );
  });

  it("empty bay has cursor-pointer class", () => {
    fc.assert(
      fc.property(arbPortId, (portId) => {
        cleanup();
        const port = makeSataPort(portId);

        render(
          <DriveBayArea
            sataPorts={[port]}
            assignments={{}}
            loadedComponents={{}}
            visualStates={{ [portId]: "empty" }}
            conflictMessages={{}}
            mode="display"
          />,
        );

        const bay = screen.getByTestId(`drive-bay-${portId}`);
        expect(bay.className).toContain("cursor-pointer");
        cleanup();
      }),
      { numRuns: 100 },
    );
  });
});
