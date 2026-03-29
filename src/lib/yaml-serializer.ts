import { stringify, parse } from "yaml";
import type { Pair } from "yaml";
import type { ComponentTypeKey } from "./form-helpers";

// Property order maps matching JSON Schema property definitions.
// Each array lists the top-level keys in the order they appear in the schema's
// "properties" object, so serialized YAML matches existing data files.
const PROPERTY_ORDER: Record<ComponentTypeKey, string[]> = {
  motherboard: [
    "id",
    "manufacturer",
    "model",
    "chipset",
    "socket",
    "form_factor",
    "memory",
    "m2_slots",
    "pcie_slots",
    "sata_ports",
    "sources",
    "schema_version",
    "length_mm",
    "width_mm",
    "slot_positions",
  ],
  cpu: [
    "id",
    "type",
    "manufacturer",
    "model",
    "socket",
    "microarchitecture",
    "architecture",
    "pcie_config",
    "cores",
    "threads",
    "tdp_w",
    "schema_version",
  ],
  gpu: [
    "id",
    "type",
    "chip_manufacturer",
    "manufacturer",
    "model",
    "interface",
    "physical",
    "power",
    "schema_version",
  ],
  nvme: [
    "id",
    "type",
    "manufacturer",
    "model",
    "interface",
    "form_factor",
    "capacity_gb",
    "capacity_variant_note",
    "schema_version",
  ],
  ram: [
    "id",
    "type",
    "manufacturer",
    "model",
    "interface",
    "capacity",
    "schema_version",
  ],
  sata_ssd: [
    "id",
    "type",
    "manufacturer",
    "model",
    "form_factor",
    "capacity_gb",
    "interface",
    "drive_type",
    "schema_version",
  ],
  sata_hdd: [
    "id",
    "type",
    "manufacturer",
    "model",
    "form_factor",
    "capacity_gb",
    "interface",
    "drive_type",
    "schema_version",
  ],
};

// Exported for testing
export { PROPERTY_ORDER };

// Create a sort comparator for map entries based on schema property order.
function createSortComparator(componentType: ComponentTypeKey) {
  const order = PROPERTY_ORDER[componentType];
  return (a: Pair, b: Pair): number => {
    const aKey = String(a.key);
    const bKey = String(b.key);
    const aIndex = order.indexOf(aKey);
    const bIndex = order.indexOf(bKey);
    // Keys not in the order list go to the end, sorted alphabetically
    const aPos = aIndex === -1 ? order.length : aIndex;
    const bPos = bIndex === -1 ? order.length : bIndex;
    if (aPos !== bPos) return aPos - bPos;
    // Both unknown: sort alphabetically
    return aKey.localeCompare(bKey);
  };
}

// Serialize form data to YAML string with schema-ordered properties.
export function serializeToYaml(
  data: Record<string, unknown>,
  componentType: ComponentTypeKey,
): string {
  try {
    return stringify(data, {
      indent: 2,
      defaultStringType: "PLAIN",
      nullStr: "null",
      sortMapEntries: createSortComparator(componentType),
      flowCollectionPadding: false,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown serialization error";
    return `# Serialization error: ${message}\n`;
  }
}

// Parse a YAML string back to a data object.
// Returns an empty object on parse failure.
export function parseYaml(yamlString: string): Record<string, unknown> {
  try {
    const result = parse(yamlString);
    if (result !== null && typeof result === "object" && !Array.isArray(result)) {
      return result as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

// Strip undefined values and empty optional fields before serialization.
export function cleanFormData(
  data: Record<string, unknown>,
  componentType: ComponentTypeKey,
): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  const order = PROPERTY_ORDER[componentType];

  for (const key of Object.keys(data)) {
    const value = data[key];

    // Strip undefined values
    if (value === undefined) continue;

    // Strip empty strings for optional fields (not in required set)
    // Required fields are kept even if empty to let validation catch them
    if (value === "" && !isRequiredField(key, componentType)) continue;

    // Recursively clean nested objects (but not arrays or null)
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const cleanedNested = cleanNestedObject(value as Record<string, unknown>);
      if (Object.keys(cleanedNested).length > 0) {
        cleaned[key] = cleanedNested;
      }
      continue;
    }

    cleaned[key] = value;
  }

  // Preserve key ordering by only including keys that exist in the data
  const ordered: Record<string, unknown> = {};
  for (const key of order) {
    if (key in cleaned) {
      ordered[key] = cleaned[key];
    }
  }
  // Add any keys not in the order list
  for (const key of Object.keys(cleaned)) {
    if (!(key in ordered)) {
      ordered[key] = cleaned[key];
    }
  }

  return ordered;
}

// Check if a field is required for the given component type.
// Uses a simplified check based on common required fields across schemas.
function isRequiredField(key: string, componentType: ComponentTypeKey): boolean {
  const requiredFields: Record<ComponentTypeKey, string[]> = {
    motherboard: [
      "id", "manufacturer", "model", "chipset", "socket", "form_factor",
      "memory", "m2_slots", "pcie_slots", "sata_ports", "sources", "schema_version",
    ],
    cpu: [
      "id", "type", "manufacturer", "model", "socket", "microarchitecture",
      "architecture", "pcie_config", "schema_version",
    ],
    gpu: [
      "id", "type", "chip_manufacturer", "manufacturer", "model",
      "interface", "physical", "power", "schema_version",
    ],
    nvme: [
      "id", "type", "manufacturer", "model", "interface", "form_factor",
      "capacity_gb", "schema_version",
    ],
    ram: [
      "id", "type", "manufacturer", "model", "interface", "capacity",
      "schema_version",
    ],
    sata_ssd: [
      "id", "type", "manufacturer", "model", "form_factor", "capacity_gb",
      "interface", "drive_type", "schema_version",
    ],
    sata_hdd: [
      "id", "type", "manufacturer", "model", "form_factor", "capacity_gb",
      "interface", "drive_type", "schema_version",
    ],
  };
  return requiredFields[componentType]?.includes(key) ?? false;
}

// Recursively clean a nested object by stripping undefined values.
function cleanNestedObject(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value === undefined) continue;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      cleaned[key] = cleanNestedObject(value as Record<string, unknown>);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}
