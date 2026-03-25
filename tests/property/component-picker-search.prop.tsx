// Feature: component-picker-search — Property tests for ComponentPicker rendering
// Properties 6 and 7 from the design document.

import { describe, it, expect, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import fc from "fast-check";

import ComponentPicker from "../../src/components/ComponentPicker";
import { SPEC_DISPLAY_KEYS } from "../../src/lib/component-search";
import { SLOT_CATEGORY_TO_COMPONENT_TYPE } from "../../src/lib/ui-types";
import type { SlotCategory } from "../../src/lib/ui-types";
import type { DataManifest } from "../../src/lib/types";

// -- Shared types and helpers ------------------------------------------------

type ManifestComponent = DataManifest["components"][number];

const slotCategories: SlotCategory[] = ["cpu", "m2", "pcie", "memory", "sata"];

const expectedPlaceholders: Record<SlotCategory, string> = {
  cpu: "Search CPUs...",
  m2: "Search NVMe drives...",
  pcie: "Search GPUs...",
  memory: "Search RAM...",
  sata: "Search SATA drives...",
};

/** Safe alphanumeric string for generated field values. */
const safeStringArb = fc
  .stringMatching(/^[A-Za-z0-9][A-Za-z0-9 -]{0,14}[A-Za-z0-9]$/)
  .filter((s) => s.trim().length >= 2);

/**
 * Generate a random specs object for a given component type.
 * For CPU, the "socket" key is always a non-null string so that socket
 * filtering in ComponentPicker can find the component.
 */
function arbSpecsForType(type: string): fc.Arbitrary<Record<string, unknown>> {
  const displayKeys = SPEC_DISPLAY_KEYS[type] ?? [];
  if (displayKeys.length === 0) return fc.constant({});

  const entries: fc.Arbitrary<[string, unknown]>[] = displayKeys.map(({ key }) => {
    // CPU socket must always be non-null so the component passes socket filtering
    if (type === "cpu" && key === "socket") {
      return safeStringArb.map((v) => [key, v] as [string, unknown]);
    }
    return fc.oneof(
      safeStringArb.map((v) => [key, v] as [string, unknown]),
      fc.integer({ min: 1, max: 9999 }).map((v) => [key, v] as [string, unknown]),
      fc.constant([key, null] as [string, unknown])
    );
  });
  return fc.tuple(...entries).map((pairs) => Object.fromEntries(pairs));
}

/** Generate a component of a specific type. */
function arbComponentOfType(type: string): fc.Arbitrary<ManifestComponent> {
  return fc
    .record({
      id: fc.stringMatching(/^[a-z0-9]{4,12}$/).filter((s) => s.length >= 4),
      manufacturer: safeStringArb,
      model: safeStringArb,
      specs: arbSpecsForType(type),
    })
    .map((base) => ({ ...base, type }));
}

/**
 * Resolve the formatted spec value the same way ComponentPicker does.
 * This mirrors the `formatSpecValue` function inside ComponentPicker.tsx.
 */
function formatSpecValue(key: string, value: unknown): string {
  if (value == null) return "\u2014";
  if (key.includes("capacity") && typeof value === "number") return `${value} GB`;
  if (key.includes("tdp_w") && typeof value === "number") return `${value}W`;
  if (key.includes("speed_mhz") && typeof value === "number") return `${value} MHz`;
  if (key.includes("length_mm") && typeof value === "number") return `${value} mm`;
  if (key.includes("pcie_gen") && typeof value === "number") return `Gen ${value}`;
  if (key.includes("cpu_gen") && typeof value === "number") return `Gen ${value}`;
  return String(value);
}


// ═══════════════════════════════════════════════════════════════════════════════
// Property 7: Placeholder text matches slot category
// Feature: component-picker-search, Property 7
// **Validates: Requirements 2.2**
// ═══════════════════════════════════════════════════════════════════════════════

describe("Feature: component-picker-search, Property 7: Placeholder text matches slot category", () => {
  it("search input placeholder contains the expected type name for each slot category", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...slotCategories),
        (category) => {
          const componentType = SLOT_CATEGORY_TO_COMPONENT_TYPE[category];

          // Create a minimal compatible component so the search input renders
          const component: ManifestComponent = {
            id: "test-component-1",
            type: componentType,
            manufacturer: "TestMfg",
            model: "TestModel",
            specs: category === "cpu" ? { socket: "AM5" } : {},
          };

          const { container, unmount } = render(
            <ComponentPicker
              slotCategory={category}
              manifestComponents={[component]}
              onSelect={vi.fn()}
              onClose={vi.fn()}
              motherboardSocket={category === "cpu" ? "AM5" : undefined}
            />
          );

          const input = container.querySelector('input[type="text"]');
          expect(input).toBeTruthy();
          expect(input!.getAttribute("placeholder")).toBe(
            expectedPlaceholders[category]
          );

          unmount();
          cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// Property 6: Selected component card displays correct information
// Feature: component-picker-search, Property 6
// **Validates: Requirements 1.5**
// ═══════════════════════════════════════════════════════════════════════════════

describe("Feature: component-picker-search, Property 6: Selected component card displays correct information", () => {
  it("rendered card contains manufacturer, model, and all non-null SPEC_DISPLAY_KEYS values", () => {
    // Generate a random component type, then a component of that type
    const scenarioArb = fc
      .constantFrom(...slotCategories)
      .chain((category) => {
        const componentType = SLOT_CATEGORY_TO_COMPONENT_TYPE[category];
        return arbComponentOfType(componentType).map((component) => ({
          category,
          component,
        }));
      });

    fc.assert(
      fc.property(scenarioArb, ({ category, component }) => {
        const { container, unmount } = render(
          <ComponentPicker
            slotCategory={category}
            manifestComponents={[component]}
            onSelect={vi.fn()}
            onClose={vi.fn()}
            selectedComponentId={component.id}
            onRemove={vi.fn()}
            motherboardSocket={
              category === "cpu"
                ? (component.specs.socket as string) ?? "AM5"
                : undefined
            }
          />
        );

        const text = container.textContent ?? "";

        // Must contain manufacturer and model
        expect(text).toContain(component.manufacturer);
        expect(text).toContain(component.model);

        // Must contain all non-null spec display values
        const specKeys = SPEC_DISPLAY_KEYS[component.type] ?? [];
        for (const { key, label } of specKeys) {
          const value = component.specs[key];
          if (value != null) {
            const formatted = formatSpecValue(key, value);
            expect(text).toContain(label);
            expect(text).toContain(formatted);
          }
        }

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  });
});
