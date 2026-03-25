// Pure utility functions for creating and parsing synthetic stick IDs.
//
// Stick IDs encode a parent kit component ID and a 1-based stick index
// into a single string: "{componentId}__stick_{index}".
// The "__stick_" separator is unambiguous because component IDs use
// hyphens and never contain double underscores.

const STICK_SEPARATOR = "__stick_";

/**
 * Create a synthetic stick ID from a component ID and 1-based stick index.
 *
 * Example: makeStickId("corsair-vengeance-ddr5-6000-32gb", 1)
 *       -> "corsair-vengeance-ddr5-6000-32gb__stick_1"
 */
export function makeStickId(componentId: string, stickIndex: number): string {
  return `${componentId}${STICK_SEPARATOR}${stickIndex}`;
}

/**
 * Parse a synthetic stick ID back to its component ID and 1-based index.
 * Returns null if the string is not a valid stick ID.
 */
export function parseStickId(
  stickId: string
): { componentId: string; stickIndex: number } | null {
  const separatorIndex = stickId.lastIndexOf(STICK_SEPARATOR);
  if (separatorIndex === -1) return null;

  const componentId = stickId.slice(0, separatorIndex);
  if (componentId.length === 0) return null;

  const indexStr = stickId.slice(separatorIndex + STICK_SEPARATOR.length);
  const stickIndex = Number(indexStr);

  if (!Number.isInteger(stickIndex) || stickIndex < 1) return null;

  return { componentId, stickIndex };
}

/**
 * Check whether a string is a synthetic stick ID.
 */
export function isStickId(id: string): boolean {
  return parseStickId(id) !== null;
}

/**
 * Get all stick IDs for a component with the given module count.
 * Returns an array of stick IDs with 1-based indexing.
 *
 * Example: getStickIds("kit-a", 2) -> ["kit-a__stick_1", "kit-a__stick_2"]
 */
export function getStickIds(
  componentId: string,
  moduleCount: number
): string[] {
  const ids: string[] = [];
  for (let i = 1; i <= moduleCount; i++) {
    ids.push(makeStickId(componentId, i));
  }
  return ids;
}

/**
 * From a flat assignments map (slotId -> stickId), extract all entries
 * whose stick IDs belong to the given kit component ID.
 */
export function getKitAssignments(
  assignments: Record<string, string>,
  componentId: string
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [slotId, stickId] of Object.entries(assignments)) {
    const parsed = parseStickId(stickId);
    if (parsed !== null && parsed.componentId === componentId) {
      result[slotId] = stickId;
    }
  }
  return result;
}

/**
 * From a flat assignments map, get all unique kit component IDs that
 * have at least one stick assignment.
 */
export function getAssignedKitIds(
  assignments: Record<string, string>
): string[] {
  const kitIds = new Set<string>();
  for (const stickId of Object.values(assignments)) {
    const parsed = parseStickId(stickId);
    if (parsed !== null) {
      kitIds.add(parsed.componentId);
    }
  }
  return Array.from(kitIds);
}
