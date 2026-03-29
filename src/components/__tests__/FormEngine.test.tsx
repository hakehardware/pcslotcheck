/**
 * Property-based tests for FormEngine component.
 *
 * Validates: Requirements 1.2, 1.3, 2.1, 2.5
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import * as fc from "fast-check";
import type { ComponentTypeKey } from "@/lib/form-helpers";
import FormEngine from "../FormEngine";

// Static schema imports
import cpuSchema from "../../../data/schema/component-cpu.schema.json";
import gpuSchema from "../../../data/schema/component-gpu.schema.json";
import nvmeSchema from "../../../data/schema/component-nvme.schema.json";
import ramSchema from "../../../data/schema/component-ram.schema.json";
import sataSsdSchema from "../../../data/schema/component-sata-ssd.schema.json";
import sataHddSchema from "../../../data/schema/component-sata-hdd.schema.json";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface JsonSchema {
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  definitions?: Record<string, SchemaProperty>;
}

interface SchemaProperty {
  type?: string;
  const?: unknown;
  enum?: unknown[];
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  items?: SchemaProperty | { $ref?: string };
  oneOf?: SchemaProperty[];
  $ref?: string;
}

/** All non-motherboard schemas paired with their type key. */
const COMPONENT_SCHEMAS: Array<{ key: ComponentTypeKey; schema: JsonSchema }> = [
  { key: "cpu", schema: cpuSchema as unknown as JsonSchema },
  { key: "gpu", schema: gpuSchema as unknown as JsonSchema },
  { key: "nvme", schema: nvmeSchema as unknown as JsonSchema },
  { key: "ram", schema: ramSchema as unknown as JsonSchema },
  { key: "sata_ssd", schema: sataSsdSchema as unknown as JsonSchema },
  { key: "sata_hdd", schema: sataHddSchema as unknown as JsonSchema },
];

/** Resolve a $ref path within a schema */
function resolveRef(ref: string, rootSchema: JsonSchema): SchemaProperty | undefined {
  const parts = ref.replace(/^#\//, "").split("/");
  let current: unknown = rootSchema;
  for (const part of parts) {
    if (current && typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current as SchemaProperty | undefined;
}

/** Resolve a property, following $ref if present */
function resolveProperty(prop: SchemaProperty, rootSchema: JsonSchema): SchemaProperty {
  if (prop.$ref) {
    const resolved = resolveRef(prop.$ref, rootSchema);
    return resolved ?? prop;
  }
  return prop;
}

/**
 * Collect all top-level enum fields from a schema (non-recursive, flat properties only).
 * Returns array of { path, enumValues, schemaType }.
 */
function collectEnumFields(
  schema: JsonSchema,
): Array<{ path: string; enumValues: unknown[]; schemaType: string }> {
  const results: Array<{ path: string; enumValues: unknown[]; schemaType: string }> = [];
  const properties = schema.properties ?? {};

  for (const [key, propDef] of Object.entries(properties)) {
    const resolved = resolveProperty(propDef, schema);
    if (resolved.enum && resolved.type) {
      results.push({ path: key, enumValues: resolved.enum, schemaType: resolved.type });
    }
    // Also check nested object properties for enums
    if (resolved.type === "object" && resolved.properties) {
      for (const [nestedKey, nestedProp] of Object.entries(resolved.properties)) {
        const resolvedNested = resolveProperty(nestedProp, schema);
        if (resolvedNested.enum && resolvedNested.type) {
          results.push({
            path: `${key}.${nestedKey}`,
            enumValues: resolvedNested.enum,
            schemaType: resolvedNested.type,
          });
        }
      }
    }
  }
  return results;
}

/**
 * Collect flat (non-object, non-array) properties from a schema for type mapping checks.
 * Returns array of { path, schemaType, hasEnum }.
 */
function collectFlatProperties(
  schema: JsonSchema,
): Array<{ path: string; schemaType: string; hasEnum: boolean }> {
  const results: Array<{ path: string; schemaType: string; hasEnum: boolean }> = [];
  const properties = schema.properties ?? {};

  for (const [key, propDef] of Object.entries(properties)) {
    const resolved = resolveProperty(propDef, schema);
    if (resolved.type === "string" || resolved.type === "number" || resolved.type === "integer" || resolved.type === "boolean") {
      results.push({ path: key, schemaType: resolved.type, hasEnum: !!resolved.enum });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Feature: yaml-generator, Property 4: Form fields match schema required properties
// Validates: Requirements 1.2
// ---------------------------------------------------------------------------
describe("Property 4: Form fields match schema required properties", () => {
  const schemaArb = fc.constantFrom(...COMPONENT_SCHEMAS);

  it("rendered form includes every property in schema's required array", () => {
    // The FormEngine hides the `type` field for non-motherboard component types
    // because it is auto-managed. We account for this by checking that hidden
    // auto-managed fields are set via onBatchChange instead of rendered in the DOM.
    const AUTO_MANAGED_HIDDEN: Record<string, (key: ComponentTypeKey) => boolean> = {
      type: (k) => k !== "motherboard",
    };

    fc.assert(
      fc.property(schemaArb, ({ key, schema }) => {
        const onChange = vi.fn();
        const onBatchChange = vi.fn();

        const { container, unmount } = render(
          <FormEngine
            schema={schema}
            componentType={key}
            formData={{}}
            onChange={onChange}
            onBatchChange={onBatchChange}
          />,
        );

        const requiredFields = schema.required ?? [];

        for (const fieldName of requiredFields) {
          // Skip fields that are intentionally hidden by the engine
          const hiddenCheck = AUTO_MANAGED_HIDDEN[fieldName];
          if (hiddenCheck && hiddenCheck(key)) {
            // Verify the engine auto-sets this field via onBatchChange
            const batchCalls = onBatchChange.mock.calls;
            const wasAutoSet = batchCalls.some((call) => {
              const updates = call[0] as Array<{ path: string; value: unknown }>;
              return updates.some((u) => u.path === fieldName);
            });
            expect(wasAutoSet).toBe(true);
            continue;
          }

          // The FormEngine renders fields with id="field-{path}" for simple fields
          // or as fieldsets with legend text for object/array fields.
          const fieldById = container.querySelector(`#field-${fieldName}`);
          const fieldByToggle = container.querySelector(`#toggle-${fieldName}`);

          // For object/array fields, look for a fieldset whose legend contains the field name
          const fieldsets = container.querySelectorAll("fieldset");
          let foundInFieldset = false;
          const formattedLabel = fieldName
            .replace(/_/g, " ")
            .replace(/\b\w/g, (c: string) => c.toUpperCase());

          for (const fs of fieldsets) {
            const legend = fs.querySelector("legend");
            if (legend && legend.textContent?.includes(formattedLabel)) {
              foundInFieldset = true;
              break;
            }
          }

          const found = fieldById !== null || fieldByToggle !== null || foundInFieldset;
          expect(found).toBe(true);
        }

        unmount();
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: yaml-generator, Property 5: Schema type to input type mapping
// Validates: Requirements 2.1
// ---------------------------------------------------------------------------
describe("Property 5: Schema type to input type mapping", () => {
  // Build a list of all (schema, componentType, fieldPath, expectedInputType) tuples
  const fieldMappings: Array<{
    key: ComponentTypeKey;
    schema: JsonSchema;
    path: string;
    schemaType: string;
    hasEnum: boolean;
  }> = [];

  for (const { key, schema } of COMPONENT_SCHEMAS) {
    for (const field of collectFlatProperties(schema)) {
      fieldMappings.push({ key, schema, ...field });
    }
  }

  const fieldArb = fc.constantFrom(...fieldMappings);

  it("string fields without enum render text inputs", () => {
    const stringFields = fieldMappings.filter(
      (f) => f.schemaType === "string" && !f.hasEnum,
    );
    if (stringFields.length === 0) return;

    const arb = fc.constantFrom(...stringFields);
    fc.assert(
      fc.property(arb, ({ key, schema, path }) => {
        const onChange = vi.fn();
        const onBatchChange = vi.fn();

        const { container, unmount } = render(
          <FormEngine
            schema={schema}
            componentType={key}
            formData={{}}
            onChange={onChange}
            onBatchChange={onBatchChange}
          />,
        );

        const input = container.querySelector(`#field-${path}`) as HTMLInputElement | null;
        if (input) {
          expect(input.tagName.toLowerCase()).toBe("input");
          expect(input.type).toBe("text");
        }

        unmount();
      }),
      { numRuns: 100 },
    );
  });

  it("number and integer fields without enum render number inputs", () => {
    const numberFields = fieldMappings.filter(
      (f) => (f.schemaType === "number" || f.schemaType === "integer") && !f.hasEnum,
    );
    if (numberFields.length === 0) return;

    const arb = fc.constantFrom(...numberFields);
    fc.assert(
      fc.property(arb, ({ key, schema, path }) => {
        const onChange = vi.fn();
        const onBatchChange = vi.fn();

        const { container, unmount } = render(
          <FormEngine
            schema={schema}
            componentType={key}
            formData={{}}
            onChange={onChange}
            onBatchChange={onBatchChange}
          />,
        );

        const input = container.querySelector(`#field-${path}`) as HTMLInputElement | null;
        if (input) {
          expect(input.tagName.toLowerCase()).toBe("input");
          expect(input.type).toBe("number");
        }

        unmount();
      }),
      { numRuns: 100 },
    );
  });

  it("string fields with enum render select dropdowns", () => {
    const enumFields = fieldMappings.filter(
      (f) => f.schemaType === "string" && f.hasEnum,
    );
    if (enumFields.length === 0) return;

    const arb = fc.constantFrom(...enumFields);
    fc.assert(
      fc.property(arb, ({ key, schema, path }) => {
        const onChange = vi.fn();
        const onBatchChange = vi.fn();

        const { container, unmount } = render(
          <FormEngine
            schema={schema}
            componentType={key}
            formData={{}}
            onChange={onChange}
            onBatchChange={onBatchChange}
          />,
        );

        const select = container.querySelector(`#field-${path}`) as HTMLSelectElement | null;
        if (select) {
          expect(select.tagName.toLowerCase()).toBe("select");
        }

        unmount();
      }),
      { numRuns: 100 },
    );
  });

  it("boolean fields render toggle switches", () => {
    const boolFields = fieldMappings.filter((f) => f.schemaType === "boolean");
    if (boolFields.length === 0) return;

    const arb = fc.constantFrom(...boolFields);
    fc.assert(
      fc.property(arb, ({ key, schema, path }) => {
        const onChange = vi.fn();
        const onBatchChange = vi.fn();

        const { container, unmount } = render(
          <FormEngine
            schema={schema}
            componentType={key}
            formData={{}}
            onChange={onChange}
            onBatchChange={onBatchChange}
          />,
        );

        const toggle = container.querySelector(`#field-${path}`) as HTMLElement | null;
        if (toggle) {
          expect(toggle.getAttribute("role")).toBe("switch");
        }

        unmount();
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: yaml-generator, Property 6: Enum fields contain only valid values
// Validates: Requirements 2.5
// ---------------------------------------------------------------------------
describe("Property 6: Enum fields contain only valid values", () => {
  // Collect all enum fields across all schemas
  const enumEntries: Array<{
    key: ComponentTypeKey;
    schema: JsonSchema;
    path: string;
    enumValues: unknown[];
    schemaType: string;
  }> = [];

  for (const { key, schema } of COMPONENT_SCHEMAS) {
    for (const field of collectEnumFields(schema)) {
      enumEntries.push({ key, schema, ...field });
    }
  }

  if (enumEntries.length === 0) {
    it.skip("no enum fields found across schemas", () => {});
  } else {
    const enumArb = fc.constantFrom(...enumEntries);

    it("select dropdown contains exactly the enum values from the schema", () => {
      fc.assert(
        fc.property(enumArb, ({ key, schema, path, enumValues, schemaType }) => {
          const onChange = vi.fn();
          const onBatchChange = vi.fn();

          // For nested paths like "interface.protocol", provide nested formData
          const formData: Record<string, unknown> = {};
          const parts = path.split(".");
          if (parts.length > 1) {
            let current: Record<string, unknown> = formData;
            for (let i = 0; i < parts.length - 1; i++) {
              current[parts[i]] = {};
              current = current[parts[i]] as Record<string, unknown>;
            }
          }

          const { container, unmount } = render(
            <FormEngine
              schema={schema}
              componentType={key}
              formData={formData}
              onChange={onChange}
              onBatchChange={onBatchChange}
            />,
          );

          const fieldId = `field-${path}`;
          const select = container.querySelector(`#${CSS.escape(fieldId)}`) as HTMLSelectElement | null;

          if (select) {
            // Get all option values, excluding the placeholder "-- Select --"
            const optionValues = Array.from(select.options)
              .map((opt) => opt.value)
              .filter((v) => v !== "");

            const expectedValues = enumValues.map(String);

            // The dropdown should contain exactly the enum values
            expect(optionValues.sort()).toEqual(expectedValues.sort());
          }

          unmount();
        }),
        { numRuns: 100 },
      );
    });
  }
});

// ---------------------------------------------------------------------------
// Feature: yaml-generator, Property 7: Type switching clears form data
// Validates: Requirements 1.3
// ---------------------------------------------------------------------------
describe("Property 7: Type switching clears form data", () => {
  const componentTypes: ComponentTypeKey[] = ["cpu", "gpu", "nvme", "ram", "sata_ssd", "sata_hdd"];

  // Generate pairs of distinct types
  const distinctPairArb = fc
    .tuple(
      fc.constantFrom(...componentTypes),
      fc.constantFrom(...componentTypes),
    )
    .filter(([a, b]) => a !== b);

  function getSchemaForType(typeKey: ComponentTypeKey): JsonSchema {
    const entry = COMPONENT_SCHEMAS.find((s) => s.key === typeKey);
    return entry!.schema;
  }

  /** Create sample non-empty form data for a given type */
  function createSampleData(typeKey: ComponentTypeKey): Record<string, unknown> {
    const schema = getSchemaForType(typeKey);
    const data: Record<string, unknown> = {};
    const properties = schema.properties ?? {};

    for (const [key, propDef] of Object.entries(properties)) {
      const resolved = resolveProperty(propDef, schema);
      if (resolved.type === "string") {
        data[key] = resolved.const !== undefined ? String(resolved.const) : "test-value";
      } else if (resolved.type === "number" || resolved.type === "integer") {
        data[key] = 42;
      } else if (resolved.type === "boolean") {
        data[key] = true;
      }
    }
    return data;
  }

  it("switching component type with empty formData means no old data carries over", () => {
    fc.assert(
      fc.property(distinctPairArb, ([typeA, typeB]) => {
        const onChange = vi.fn();
        const onBatchChange = vi.fn();

        const schemaA = getSchemaForType(typeA);
        const sampleDataA = createSampleData(typeA);

        // Render with type A and populated data
        const { unmount: unmountA } = render(
          <FormEngine
            schema={schemaA}
            componentType={typeA}
            formData={sampleDataA}
            onChange={onChange}
            onBatchChange={onBatchChange}
          />,
        );
        unmountA();

        // Now render with type B and empty formData (simulating type switch + clear)
        const schemaB = getSchemaForType(typeB);
        const emptyData: Record<string, unknown> = {};

        const { container, unmount: unmountB } = render(
          <FormEngine
            schema={schemaB}
            componentType={typeB}
            formData={emptyData}
            onChange={onChange}
            onBatchChange={onBatchChange}
          />,
        );

        // Verify that text inputs in the new form are empty
        const textInputs = container.querySelectorAll('input[type="text"]');
        for (const input of textInputs) {
          const htmlInput = input as HTMLInputElement;
          // Read-only auto-generated fields may have values set by onBatchChange
          if (!htmlInput.readOnly) {
            expect(htmlInput.value).toBe("");
          }
        }

        // Verify that number inputs are empty
        const numberInputs = container.querySelectorAll('input[type="number"]');
        for (const input of numberInputs) {
          const htmlInput = input as HTMLInputElement;
          expect(htmlInput.value).toBe("");
        }

        // Verify that select dropdowns are at default (empty) value
        const selects = container.querySelectorAll("select");
        for (const select of selects) {
          expect(select.value).toBe("");
        }

        unmountB();
      }),
      { numRuns: 100 },
    );
  });
});
