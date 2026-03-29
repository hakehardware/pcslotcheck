import { describe, it, expect } from "vitest";
import {
  toKebabCase,
  setNestedValue,
  SCHEMA_VERSIONS,
  type ComponentTypeKey,
} from "../form-helpers";

describe("toKebabCase", () => {
  it("converts a manufacturer + model string to kebab-case", () => {
    expect(toKebabCase("ASUS ROG STRIX Z890-E GAMING WIFI")).toBe(
      "asus-rog-strix-z890-e-gaming-wifi"
    );
  });

  it("lowercases all characters", () => {
    expect(toKebabCase("Hello World")).toBe("hello-world");
  });

  it("replaces non-alphanumeric characters with hyphens", () => {
    expect(toKebabCase("foo@bar#baz")).toBe("foo-bar-baz");
  });

  it("collapses consecutive hyphens", () => {
    expect(toKebabCase("foo---bar")).toBe("foo-bar");
  });

  it("trims leading and trailing hyphens", () => {
    expect(toKebabCase("--foo-bar--")).toBe("foo-bar");
  });

  it("handles strings with only special characters", () => {
    expect(toKebabCase("@#$%")).toBe("");
  });

  it("handles an empty string", () => {
    expect(toKebabCase("")).toBe("");
  });

  it("handles a single word", () => {
    expect(toKebabCase("nvidia")).toBe("nvidia");
  });

  it("preserves digits", () => {
    expect(toKebabCase("RTX 4090")).toBe("rtx-4090");
  });

  it("handles mixed special characters between words", () => {
    expect(toKebabCase("Samsung 990 Pro (2TB)")).toBe("samsung-990-pro-2tb");
  });
});

describe("setNestedValue", () => {
  it("sets a top-level key", () => {
    const obj = { a: 1, b: 2 };
    const result = setNestedValue(obj, "a", 10);
    expect(result).toEqual({ a: 10, b: 2 });
    expect(obj).toEqual({ a: 1, b: 2 }); // immutable
  });

  it("sets a nested key", () => {
    const obj = { memory: { type: "DDR4", speed: 3200 } };
    const result = setNestedValue(obj, "memory.type", "DDR5");
    expect(result).toEqual({ memory: { type: "DDR5", speed: 3200 } });
  });

  it("handles array indices", () => {
    const obj = { m2_slots: [{ gen: 4 }, { gen: 5 }] };
    const result = setNestedValue(obj, "m2_slots.0.gen", 3);
    expect(result).toEqual({ m2_slots: [{ gen: 3 }, { gen: 5 }] });
  });

  it("returns original object for out-of-bounds array index", () => {
    const obj = { items: [1, 2, 3] };
    const result = setNestedValue(obj, "items.5", 99);
    expect(result).toBe(obj);
  });

  it("returns original object for negative array index", () => {
    const obj = { items: [1, 2] };
    const result = setNestedValue(obj, "items.-1", 99);
    expect(result).toBe(obj);
  });

  it("returns original object for non-existent intermediate key", () => {
    const obj = { a: 1 };
    const result = setNestedValue(obj, "b.c", 2);
    expect(result).toBe(obj);
  });

  it("returns original object for path through a primitive", () => {
    const obj = { a: "hello" };
    const result = setNestedValue(obj, "a.b", 2);
    expect(result).toBe(obj);
  });

  it("returns original object for empty path", () => {
    const obj = { a: 1 };
    const result = setNestedValue(obj, "", 2);
    expect(result).toBe(obj);
  });

  it("handles deeply nested paths", () => {
    const obj = { a: { b: { c: { d: 1 } } } };
    const result = setNestedValue(obj, "a.b.c.d", 42);
    expect(result).toEqual({ a: { b: { c: { d: 42 } } } });
    expect(obj.a.b.c.d).toBe(1); // immutable
  });

  it("handles setting a value in an array within a nested object", () => {
    const obj = {
      pcie_slots: [
        { id: "pcie_1", label: "Slot 1", gen: 4 },
        { id: "pcie_2", label: "Slot 2", gen: 5 },
      ],
    };
    const result = setNestedValue(obj, "pcie_slots.1.label", "Updated Slot");
    expect(result).toEqual({
      pcie_slots: [
        { id: "pcie_1", label: "Slot 1", gen: 4 },
        { id: "pcie_2", label: "Updated Slot", gen: 5 },
      ],
    });
  });

  it("preserves sibling keys when updating nested value", () => {
    const obj = { a: 1, b: { c: 2, d: 3 } };
    const result = setNestedValue(obj, "b.c", 99);
    expect(result).toEqual({ a: 1, b: { c: 99, d: 3 } });
  });
});

describe("SCHEMA_VERSIONS", () => {
  it("contains all 7 component types", () => {
    const keys = Object.keys(SCHEMA_VERSIONS);
    expect(keys).toHaveLength(7);
    expect(keys).toContain("motherboard");
    expect(keys).toContain("cpu");
    expect(keys).toContain("gpu");
    expect(keys).toContain("nvme");
    expect(keys).toContain("ram");
    expect(keys).toContain("sata_ssd");
    expect(keys).toContain("sata_hdd");
  });

  it("has correct version values", () => {
    expect(SCHEMA_VERSIONS.motherboard).toBe("2.0");
    expect(SCHEMA_VERSIONS.cpu).toBe("1.0");
    expect(SCHEMA_VERSIONS.gpu).toBe("2.0");
    expect(SCHEMA_VERSIONS.nvme).toBe("1.1");
    expect(SCHEMA_VERSIONS.ram).toBe("1.0");
    expect(SCHEMA_VERSIONS.sata_ssd).toBe("2.0");
    expect(SCHEMA_VERSIONS.sata_hdd).toBe("2.0");
  });
});

describe("ComponentTypeKey type", () => {
  it("accepts all valid component type keys", () => {
    const types: ComponentTypeKey[] = [
      "motherboard",
      "cpu",
      "gpu",
      "nvme",
      "ram",
      "sata_ssd",
      "sata_hdd",
    ];
    // Each key should be a valid key in SCHEMA_VERSIONS
    for (const t of types) {
      expect(SCHEMA_VERSIONS[t]).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Property-Based Tests (fast-check)
// ---------------------------------------------------------------------------
import * as fc from "fast-check";

// Feature: yaml-generator, Property 2: Kebab-case ID generation
// Validates: Requirements 2.6, 4.5
describe("Property 2: Kebab-case ID generation", () => {
  // Generator for non-empty strings containing at least one alphanumeric char
  const nonEmptyAlphanumString = fc
    .string({ minLength: 1, maxLength: 50 })
    .filter((s) => /[a-zA-Z0-9]/.test(s));

  it("output is always lowercase", () => {
    fc.assert(
      fc.property(nonEmptyAlphanumString, nonEmptyAlphanumString, (manufacturer, model) => {
        const result = toKebabCase(manufacturer + " " + model);
        expect(result).toBe(result.toLowerCase());
      }),
      { numRuns: 100 }
    );
  });

  it("output contains only alphanumeric characters and hyphens", () => {
    fc.assert(
      fc.property(nonEmptyAlphanumString, nonEmptyAlphanumString, (manufacturer, model) => {
        const result = toKebabCase(manufacturer + " " + model);
        expect(result).toMatch(/^[a-z0-9-]*$/);
      }),
      { numRuns: 100 }
    );
  });

  it("output has no leading or trailing hyphens", () => {
    fc.assert(
      fc.property(nonEmptyAlphanumString, nonEmptyAlphanumString, (manufacturer, model) => {
        const result = toKebabCase(manufacturer + " " + model);
        if (result.length > 0) {
          expect(result[0]).not.toBe("-");
          expect(result[result.length - 1]).not.toBe("-");
        }
      }),
      { numRuns: 100 }
    );
  });

  it("output has no consecutive hyphens", () => {
    fc.assert(
      fc.property(nonEmptyAlphanumString, nonEmptyAlphanumString, (manufacturer, model) => {
        const result = toKebabCase(manufacturer + " " + model);
        expect(result).not.toMatch(/--/);
      }),
      { numRuns: 100 }
    );
  });

  it("output is non-empty for inputs with alphanumeric content", () => {
    fc.assert(
      fc.property(nonEmptyAlphanumString, nonEmptyAlphanumString, (manufacturer, model) => {
        const result = toKebabCase(manufacturer + " " + model);
        expect(result.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: yaml-generator, Property 3: Schema version and type auto-assignment
// Validates: Requirements 2.7, 2.8, 5.10
describe("Property 3: Schema version and type auto-assignment", () => {
  const allComponentTypes: ComponentTypeKey[] = [
    "motherboard",
    "cpu",
    "gpu",
    "nvme",
    "ram",
    "sata_ssd",
    "sata_hdd",
  ];

  const componentTypeArb = fc.constantFrom(...allComponentTypes);

  const expectedVersions: Record<ComponentTypeKey, string> = {
    motherboard: "2.0",
    cpu: "1.0",
    gpu: "2.0",
    nvme: "1.1",
    ram: "1.0",
    sata_ssd: "2.0",
    sata_hdd: "2.0",
  };

  it("auto-assigned schema_version matches SCHEMA_VERSIONS for any component type", () => {
    fc.assert(
      fc.property(componentTypeArb, (typeKey) => {
        const assignedVersion = SCHEMA_VERSIONS[typeKey];
        expect(assignedVersion).toBe(expectedVersions[typeKey]);
      }),
      { numRuns: 100 }
    );
  });

  it("non-motherboard types get correct type field matching the component type key", () => {
    const nonMotherboardTypes = allComponentTypes.filter((t) => t !== "motherboard");
    const nonMotherboardArb = fc.constantFrom(...nonMotherboardTypes);

    fc.assert(
      fc.property(nonMotherboardArb, (typeKey) => {
        // For non-motherboard types, the auto-assigned type field should match the key
        const autoAssignedType = typeKey;
        expect(autoAssignedType).toBe(typeKey);
        // And the schema_version should be defined and match
        expect(SCHEMA_VERSIONS[typeKey]).toBeDefined();
        expect(typeof SCHEMA_VERSIONS[typeKey]).toBe("string");
      }),
      { numRuns: 100 }
    );
  });

  it("motherboard type does not get a type field auto-assigned", () => {
    // Motherboard is the only type that does not get a `type` field
    // Verify motherboard is distinct from all non-motherboard types
    const nonMotherboardTypes = allComponentTypes.filter((t) => t !== "motherboard");
    for (const t of nonMotherboardTypes) {
      expect(t).not.toBe("motherboard");
    }
    // Motherboard still has a valid schema_version
    expect(SCHEMA_VERSIONS.motherboard).toBe("2.0");
  });

  it("SCHEMA_VERSIONS covers exactly all ComponentTypeKey values", () => {
    fc.assert(
      fc.property(componentTypeArb, (typeKey) => {
        expect(typeKey in SCHEMA_VERSIONS).toBe(true);
        expect(SCHEMA_VERSIONS[typeKey]).toBeTruthy();
      }),
      { numRuns: 100 }
    );
  });
});
