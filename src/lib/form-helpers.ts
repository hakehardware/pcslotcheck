// Component type keys for the type selector
export type ComponentTypeKey =
  | "motherboard"
  | "cpu"
  | "gpu"
  | "nvme"
  | "ram"
  | "sata_ssd"
  | "sata_hdd";

// Schema version mapping per component type
export const SCHEMA_VERSIONS: Record<ComponentTypeKey, string> = {
  motherboard: "2.0",
  cpu: "1.0",
  gpu: "2.0",
  nvme: "1.1",
  ram: "1.0",
  sata_ssd: "2.0",
  sata_hdd: "2.0",
};

/**
 * Convert a display string to kebab-case id format.
 * Lowercases, replaces non-alphanumeric with hyphens,
 * collapses consecutive hyphens, trims leading/trailing hyphens.
 */
export function toKebabCase(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Immutably set a value at a dot-separated path in a nested object.
 * Handles array indices (e.g. "m2_slots.0.gen").
 * Returns the original object unchanged on invalid paths.
 */
export function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const keys = path.split(".");
  if (keys.length === 0 || (keys.length === 1 && keys[0] === "")) {
    return obj;
  }

  return setAtDepth(obj, keys, 0, value) as Record<string, unknown>;
}

function setAtDepth(
  current: unknown,
  keys: string[],
  index: number,
  value: unknown,
): unknown {
  const key = keys[index];

  // Last key -- set the value
  if (index === keys.length - 1) {
    if (Array.isArray(current)) {
      const arrIndex = Number(key);
      if (!Number.isInteger(arrIndex) || arrIndex < 0 || arrIndex >= current.length) {
        return current;
      }
      const copy = [...current];
      copy[arrIndex] = value;
      return copy;
    }
    if (current !== null && typeof current === "object") {
      return { ...current as Record<string, unknown>, [key]: value };
    }
    return current;
  }

  // Intermediate key -- recurse
  if (Array.isArray(current)) {
    const arrIndex = Number(key);
    if (!Number.isInteger(arrIndex) || arrIndex < 0 || arrIndex >= current.length) {
      return current;
    }
    const child = current[arrIndex];
    const updated = setAtDepth(child, keys, index + 1, value);
    if (updated === child) return current;
    const copy = [...current];
    copy[arrIndex] = updated;
    return copy;
  }

  if (current !== null && typeof current === "object") {
    const record = current as Record<string, unknown>;
    const child = record[key];
    if (child === undefined) {
      return current;
    }
    const updated = setAtDepth(child, keys, index + 1, value);
    if (updated === child) return current;
    return { ...record, [key]: updated };
  }

  // Path is invalid (hit a primitive before exhausting keys)
  return current;
}
