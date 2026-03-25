/**
 * URL-based build sharing — encode/decode motherboard + slot assignments
 * as base64url-encoded JSON for shareable URLs.
 */

/**
 * Encode a motherboard ID, slot assignments, and optional CPU ID into a base64url string.
 */
export function encode(
  motherboardId: string,
  assignments: Record<string, string>,
  cpuId?: string
): string {
  const payload = JSON.stringify({
    m: motherboardId,
    ...(cpuId ? { c: cpuId } : {}),
    a: assignments,
  });
  const base64 = btoa(payload);
  // Convert base64 to base64url: replace + with -, / with _, remove trailing =
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Decode a base64url string back into motherboard ID and assignments.
 * Returns null for any malformed, empty, or invalid input — never throws.
 */
export function decode(
  queryString: string
): { motherboardId: string; assignments: Record<string, string>; cpuId?: string } | null {
  try {
    if (!queryString) return null;

    // Convert base64url back to base64: replace - with +, _ with /
    let base64 = queryString.replace(/-/g, "+").replace(/_/g, "/");
    // Add padding as needed
    const pad = base64.length % 4;
    if (pad) {
      base64 += "=".repeat(4 - pad);
    }

    const json = atob(base64);
    const parsed = JSON.parse(json);

    // Validate structure
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.m !== "string" ||
      typeof parsed.a !== "object" ||
      parsed.a === null ||
      Array.isArray(parsed.a)
    ) {
      return null;
    }

    return {
      motherboardId: parsed.m,
      assignments: parsed.a,
      ...(typeof parsed.c === "string" ? { cpuId: parsed.c } : {}),
    };
  } catch {
    return null;
  }
}
