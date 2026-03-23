import { describe, it, expect } from "vitest";
import { encode, decode } from "../../src/lib/sharing";

describe("sharing module", () => {
  // --- Base64url format verification ---

  describe("base64url format", () => {
    it("encoded output contains only URL-safe characters", () => {
      const encoded = encode("asus-rog-strix-z890", {
        m2_1: "samsung-990-pro-2tb",
        m2_2: "wd-black-sn770-1tb",
      });

      // Only alphanumeric, dash, underscore allowed
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("encoded output does not contain +, /, or = characters", () => {
      const encoded = encode("msi-mag-x870-tomahawk-wifi", {
        m2_1: "samsung-990-pro-2tb",
        pcie_1: "nvidia-rtx-4070-ti-super",
      });

      expect(encoded).not.toContain("+");
      expect(encoded).not.toContain("/");
      expect(encoded).not.toContain("=");
    });
  });

  // --- Specific encode/decode examples ---

  describe("encode/decode round-trip", () => {
    it("encodes a known motherboard ID + assignments and decodes back to the original", () => {
      const motherboardId = "asus-rog-strix-z890-f-gaming-wifi";
      const assignments = {
        m2_1: "samsung-990-pro-2tb",
        m2_2: "wd-black-sn770-1tb",
      };

      const encoded = encode(motherboardId, assignments);
      expect(typeof encoded).toBe("string");
      expect(encoded.length).toBeGreaterThan(0);

      const decoded = decode(encoded);
      expect(decoded).not.toBeNull();
      expect(decoded!.motherboardId).toBe(motherboardId);
      expect(decoded!.assignments).toEqual(assignments);
    });

    it("produces a deterministic encoded string for the same input", () => {
      const id = "test-board";
      const assignments = { slot_a: "comp-1" };

      const first = encode(id, assignments);
      const second = encode(id, assignments);
      expect(first).toBe(second);
    });
  });

  // --- Edge cases ---

  describe("edge cases", () => {
    it("empty assignments encode to a valid string and round-trip correctly", () => {
      const encoded = encode("some-board", {});
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);

      const decoded = decode(encoded);
      expect(decoded).not.toBeNull();
      expect(decoded!.motherboardId).toBe("some-board");
      expect(decoded!.assignments).toEqual({});
    });

    it("empty string input to decode returns null", () => {
      expect(decode("")).toBeNull();
    });

    it("random garbage string to decode returns null", () => {
      expect(decode("not-valid-base64url-!@#$%^&*()")).toBeNull();
    });

    it("valid base64 but not JSON to decode returns null", () => {
      // btoa("hello world") = "aGVsbG8gd29ybGQ=" → base64url = "aGVsbG8gd29ybGQ"
      expect(decode("aGVsbG8gd29ybGQ")).toBeNull();
    });

    it("valid JSON but wrong structure to decode returns null", () => {
      // Encode {"x": 1} — valid JSON but missing m/a fields
      const base64 = btoa(JSON.stringify({ x: 1 }));
      const base64url = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      expect(decode(base64url)).toBeNull();
    });

    it("null input to decode returns null", () => {
      expect(decode(null as unknown as string)).toBeNull();
    });

    it("undefined input to decode returns null", () => {
      expect(decode(undefined as unknown as string)).toBeNull();
    });
  });
});
