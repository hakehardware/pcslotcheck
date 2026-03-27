// Property-based tests for tag-card-consistency feature.
// Uses fast-check with minimum 100 iterations per property.

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import fc from "fast-check";

import MetadataBadge from "../../src/components/MetadataBadge";
import AttributeBadge from "../../src/components/AttributeBadge";
import CompactCard from "../../src/components/CompactCard";
import { SPEC_DISPLAY_KEYS } from "../../src/lib/component-search";
import { getThumbnailIcon } from "../../src/lib/thumbnail";
import { SLOT_CATEGORY_ICON_TYPE } from "../../src/components/ComponentPicker";
import { COMPONENT_TYPE_META } from "../../src/lib/component-type-meta";
import type { SlotCategory } from "../../src/lib/ui-types";

// Arbitrary that produces non-empty printable strings suitable for labels
const arbLabel = fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0);

// Arbitrary that produces Tailwind-style color class strings
const arbColorClass = fc.constantFrom(
  "bg-green-900 text-green-300",
  "bg-red-900 text-red-300",
  "bg-blue-900 text-blue-300",
  "bg-yellow-900 text-yellow-300",
  "bg-purple-900 text-purple-300",
  "bg-zinc-700 text-zinc-300",
  "bg-orange-900 text-orange-300"
);

// Shared structural classes that both badge types must have
const SHARED_STRUCTURAL_CLASSES = ["rounded", "text-xs", "font-medium", "px-2", "py-0.5"];

// MetadataBadge-specific classes
const METADATA_REQUIRED_CLASSES = ["bg-zinc-800", "text-zinc-400"];

// ---------------------------------------------------------------------------
// Feature: tag-card-consistency, Property 1: Badge structural class parity
// **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 4.2**
// ---------------------------------------------------------------------------

describe("Property 1: Badge structural class parity", () => {
  it("both MetadataBadge and AttributeBadge contain all shared structural classes", () => {
    fc.assert(
      fc.property(arbLabel, arbColorClass, (label, colorClass) => {
        const metaResult = render(<MetadataBadge label={label} />);
        const attrResult = render(<AttributeBadge label={label} colorClass={colorClass} />);

        const metaSpan = metaResult.container.querySelector("span")!;
        const attrSpan = attrResult.container.querySelector("span")!;

        const metaClasses = metaSpan.className;
        const attrClasses = attrSpan.className;

        for (const cls of SHARED_STRUCTURAL_CLASSES) {
          expect(metaClasses).toContain(cls);
          expect(attrClasses).toContain(cls);
        }

        metaResult.unmount();
        attrResult.unmount();
      }),
      { numRuns: 100 }
    );
  });

  it("MetadataBadge contains its neutral color scheme classes", () => {
    fc.assert(
      fc.property(arbLabel, (label) => {
        const { container, unmount } = render(<MetadataBadge label={label} />);
        const span = container.querySelector("span")!;
        const classes = span.className;

        for (const cls of METADATA_REQUIRED_CLASSES) {
          expect(classes).toContain(cls);
        }

        unmount();
      }),
      { numRuns: 100 }
    );
  });

  it("MetadataBadge does not contain rounded-full", () => {
    fc.assert(
      fc.property(arbLabel, (label) => {
        const { container, unmount } = render(<MetadataBadge label={label} />);
        const span = container.querySelector("span")!;
        const classes = span.className;

        expect(classes).not.toContain("rounded-full");

        unmount();
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: tag-card-consistency, Property 3: AttributeBadge renders provided colorClass
// **Validates: Requirements 4.1**
// ---------------------------------------------------------------------------

describe("Property 3: AttributeBadge renders provided colorClass", () => {
  it("rendered element class list contains the provided colorClass", () => {
    fc.assert(
      fc.property(arbLabel, arbColorClass, (label, colorClass) => {
        const { container, unmount } = render(
          <AttributeBadge label={label} colorClass={colorClass} />
        );

        const span = container.querySelector("span")!;
        const classes = span.className;

        // colorClass may contain multiple space-separated classes (e.g. "bg-green-900 text-green-300")
        for (const cls of colorClass.split(" ")) {
          expect(classes).toContain(cls);
        }

        unmount();
      }),
      { numRuns: 100 }
    );
  });
});


// ---------------------------------------------------------------------------
// Feature: tag-card-consistency, Property 2: ComponentPicker CompactCard data formatting
// **Validates: Requirements 3.2, 3.3**
// ---------------------------------------------------------------------------

// Replicate the formatSpecValue logic from ComponentPicker (not exported)
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

// Component types that have SPEC_DISPLAY_KEYS entries
const COMPONENT_TYPES_WITH_SPECS = Object.keys(SPEC_DISPLAY_KEYS);

// Arbitrary for a non-empty printable string (manufacturer/model names)
const arbName = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => s.trim().length > 0);

// Arbitrary for a spec value: either null or a number or a short string
const arbSpecValue = fc.oneof(
  fc.constant(null),
  fc.integer({ min: 1, max: 9999 }),
  fc.string({ minLength: 1, maxLength: 15 }).filter((s) => s.trim().length > 0)
);

// Arbitrary that generates a component type and matching spec object
const arbComponentWithSpecs = fc
  .constantFrom(...COMPONENT_TYPES_WITH_SPECS)
  .chain((componentType) => {
    const specKeys = SPEC_DISPLAY_KEYS[componentType];
    // Build a record arbitrary for the spec keys of this component type
    const specEntries = specKeys.map(({ key }) =>
      arbSpecValue.map((val) => [key, val] as const)
    );
    return fc.tuple(fc.constant(componentType), fc.tuple(...specEntries)).map(
      ([type, entries]) => ({
        type,
        specs: Object.fromEntries(entries) as Record<string, unknown>,
      })
    );
  });

describe("Property 2: ComponentPicker CompactCard data formatting", () => {
  it("CompactCard receives correct title and specs from component data", () => {
    fc.assert(
      fc.property(
        arbName,
        arbName,
        arbComponentWithSpecs,
        (manufacturer, model, componentData) => {
          const { type, specs } = componentData;
          const specKeys = SPEC_DISPLAY_KEYS[type];

          // Build expected title the same way ComponentPicker does
          const expectedTitle = `${manufacturer} ${model}`;

          // Build expected specs array the same way ComponentPicker does
          const expectedSpecs = specKeys
            .map(({ key, label }) => {
              const value = specs[key];
              if (value == null) return null;
              return `${label}: ${formatSpecValue(key, value)}`;
            })
            .filter((s): s is string => s !== null);

          // Resolve the icon (use any valid category; we just need a valid IconType)
          const icon = getThumbnailIcon(type);

          // Render CompactCard with the formatted data
          const { container, unmount } = render(
            <CompactCard icon={icon} title={expectedTitle} specs={expectedSpecs} />
          );

          // Verify title is rendered correctly
          const titleEl = container.querySelector(".text-sm.font-medium.text-zinc-100");
          expect(titleEl).not.toBeNull();
          expect(titleEl!.textContent).toBe(expectedTitle);

          // Verify specs: each non-null formatted spec should appear as a MetadataBadge
          const badgeEls = container.querySelectorAll(".flex.flex-wrap.gap-1\\.5 span");
          const renderedSpecs = Array.from(badgeEls).map((el) => el.textContent);
          expect(renderedSpecs).toEqual(expectedSpecs);

          // When all specs are null, no badge row should render
          if (expectedSpecs.length === 0) {
            const badgeRow = container.querySelector(".flex.flex-wrap.gap-1\\.5");
            expect(badgeRow).toBeNull();
          }

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ---------------------------------------------------------------------------
// Feature: tag-card-consistency, Property 4: Slot category icon resolution
// **Validates: Requirements 3.6**
// ---------------------------------------------------------------------------

// All slot categories used in ComponentPicker
const ALL_SLOT_CATEGORIES: SlotCategory[] = ["cpu", "m2", "pcie", "memory", "sata"];

describe("Property 4: Slot category icon resolution", () => {
  it("getThumbnailIcon resolves to the COMPONENT_TYPE_META icon for every slot category", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_SLOT_CATEGORIES),
        (category) => {
          const mappedType = SLOT_CATEGORY_ICON_TYPE[category];
          const resolvedIcon = getThumbnailIcon(mappedType);
          const expectedIcon = COMPONENT_TYPE_META[mappedType].icon;

          expect(resolvedIcon).toBe(expectedIcon);
        }
      ),
      { numRuns: 100 }
    );
  });
});
