import { describe, test, expect } from "vitest";
import * as fc from "fast-check";
import { encode, decode } from "../../src/lib/sharing";

// ── Property 10: Sharing encode/decode round-trip ───────────────────────────

describe("Property 10: Sharing encode/decode round-trip", () => {
  /**
   * Validates: Requirements 11.3
   */

  test("encoding then decoding produces the original input", () => {
    const motherboardIdArb = fc.string({ minLength: 1 });
    const assignmentsArb = fc.dictionary(
      fc.string({ minLength: 1 }),
      fc.string({ minLength: 1 })
    );

    fc.assert(
      fc.property(motherboardIdArb, assignmentsArb, (motherboardId, assignments) => {
        const encoded = encode(motherboardId, assignments);
        const decoded = decode(encoded);

        expect(decoded).not.toBeNull();
        expect(decoded!.motherboardId).toBe(motherboardId);
        expect(decoded!.assignments).toEqual(assignments);
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 11: Malformed decode returns null without throwing ─────────────

describe("Property 11: Malformed decode returns null without throwing", () => {
  /**
   * Validates: Requirements 11.5
   */

  test("malformed strings return null and never throw", () => {
    const malformedArb = fc.oneof(
      // Empty strings
      fc.constant(""),
      // Random ASCII strings
      fc.string(),
      // Random bytes (non-ASCII)
      fc.uint8Array({ minLength: 1, maxLength: 64 }).map((arr) =>
        Array.from(arr)
          .map((b) => String.fromCharCode(b))
          .join("")
      ),
      // Truncated base64 strings (single char, odd lengths)
      fc.base64String({ minLength: 1, maxLength: 32 }).map((s) =>
        s.slice(0, Math.max(1, Math.floor(s.length / 2)))
      ),
      // Valid base64 but non-JSON content
      fc.string({ minLength: 1 }).map((s) => {
        try {
          return btoa(s);
        } catch {
          return s;
        }
      }),
      // Valid JSON but missing required fields (m, a)
      fc.oneof(
        fc.constant(btoa(JSON.stringify({}))),
        fc.constant(btoa(JSON.stringify({ m: "board" }))),
        fc.constant(btoa(JSON.stringify({ a: {} }))),
        fc.constant(btoa(JSON.stringify({ m: 123, a: {} }))),
        fc.constant(btoa(JSON.stringify({ m: "board", a: "not-object" }))),
        fc.constant(btoa(JSON.stringify({ m: "board", a: null }))),
        fc.constant(btoa(JSON.stringify({ m: "board", a: [1, 2] })))
      )
    );

    fc.assert(
      fc.property(malformedArb, (input) => {
        // decode must return null and must NOT throw
        const result = decode(input);
        expect(result).toBeNull();
      }),
      { numRuns: 100 }
    );
  });
});
