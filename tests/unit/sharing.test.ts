import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { encode, decode } from "../../src/lib/sharing";
import { makeStickId } from "../../src/lib/stick-utils";
import {
  arbRAMComponent,
  arbMemoryConfig,
  arbStickAssignments,
  arbMultiKitAssignments,
} from "../../src/lib/__tests__/generators";

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

  // --- Task 6.1: Stick-level assignment round-trip unit tests ---

  describe("stick-level assignment round-trip", () => {
    it("encodes assignments with stick IDs and decodes back to the same state", () => {
      const motherboardId = "asus-rog-strix-z890-f-gaming-wifi";
      const assignments = {
        dimm_a2: makeStickId("corsair-vengeance-ddr5-6000-32gb", 1),
        dimm_b2: makeStickId("corsair-vengeance-ddr5-6000-32gb", 2),
      };

      const encoded = encode(motherboardId, assignments);
      expect(typeof encoded).toBe("string");
      expect(encoded.length).toBeGreaterThan(0);

      const decoded = decode(encoded);
      expect(decoded).not.toBeNull();
      expect(decoded!.motherboardId).toBe(motherboardId);
      expect(decoded!.assignments).toEqual(assignments);
    });

    it("handles mixed assignments (stick IDs and regular component IDs)", () => {
      const motherboardId = "msi-mag-x870-tomahawk-wifi";
      const assignments = {
        dimm_a2: makeStickId("corsair-vengeance-ddr5-6000-32gb", 1),
        dimm_b2: makeStickId("corsair-vengeance-ddr5-6000-32gb", 2),
        m2_1: "samsung-990-pro-2tb",
        pcie_1: "nvidia-rtx-4070-ti-super",
      };

      const encoded = encode(motherboardId, assignments);
      const decoded = decode(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.motherboardId).toBe(motherboardId);
      expect(decoded!.assignments).toEqual(assignments);
    });

    it("handles a 4-stick kit assignment across all DIMM slots", () => {
      const motherboardId = "gigabyte-z890-aorus-master";
      const kitId = "gskill-trident-z5-ddr5-6400-64gb";
      const assignments = {
        dimm_a1: makeStickId(kitId, 1),
        dimm_a2: makeStickId(kitId, 2),
        dimm_b1: makeStickId(kitId, 3),
        dimm_b2: makeStickId(kitId, 4),
      };

      const encoded = encode(motherboardId, assignments);
      const decoded = decode(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.motherboardId).toBe(motherboardId);
      expect(decoded!.assignments).toEqual(assignments);
    });

    it("handles multiple kits with stick IDs assigned to different slots", () => {
      const motherboardId = "asus-rog-strix-z890-e-gaming-wifi";
      const assignments = {
        dimm_a2: makeStickId("corsair-vengeance-ddr5-6000-32gb", 1),
        dimm_b2: makeStickId("corsair-vengeance-ddr5-6000-32gb", 2),
        dimm_a1: makeStickId("gskill-trident-z5-ddr5-6400-32gb", 1),
        dimm_b1: makeStickId("gskill-trident-z5-ddr5-6400-32gb", 2),
      };

      const encoded = encode(motherboardId, assignments);
      const decoded = decode(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.assignments).toEqual(assignments);
    });
  });

  // --- Task 6.2: Property 12 — URL sharing round-trip ---
  // Validates: Requirements 10.1, 10.2, 10.3

  describe("Property 12: URL sharing round-trip", () => {
    const DIMM_SLOTS = ["dimm_a1", "dimm_a2", "dimm_b1", "dimm_b2"];

    it("for any valid assignment state with stick IDs, encode then decode produces equivalent state", () => {
      fc.assert(
        fc.property(
          arbRAMComponent().chain((kit) =>
            fc.tuple(
              arbMemoryConfig(),
              arbStickAssignments(kit.id, kit.capacity.modules, DIMM_SLOTS)
            )
          ),
          fc.string({ minLength: 3, maxLength: 40 }).filter((s) => /^[a-z0-9-]+$/.test(s)),
          ([memConfig, assignments], boardId) => {
            // Skip empty assignments — nothing to round-trip
            if (Object.keys(assignments).length === 0) return;

            const encoded = encode(boardId, assignments);

            // Encoded string must be non-empty and URL-safe
            expect(encoded.length).toBeGreaterThan(0);
            expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);

            const decoded = decode(encoded);
            expect(decoded).not.toBeNull();
            expect(decoded!.motherboardId).toBe(boardId);
            expect(decoded!.assignments).toEqual(assignments);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // --- Task 9: CPU assignment in shareable URLs ---

  describe("CPU assignment round-trip", () => {
    it("encodes a build with cpuId and decodes back to the same state", () => {
      const motherboardId = "asus-rog-strix-z890-f-gaming-wifi";
      const assignments = { m2_1: "samsung-990-pro-2tb" };
      const cpuId = "intel-core-i7-14700k";

      const encoded = encode(motherboardId, assignments, cpuId);
      const decoded = decode(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.motherboardId).toBe(motherboardId);
      expect(decoded!.assignments).toEqual(assignments);
      expect(decoded!.cpuId).toBe(cpuId);
    });

    it("decoding a URL without c field returns cpuId undefined", () => {
      // Manually encode a payload without the c field (pre-CPU format)
      const payload = JSON.stringify({
        m: "asus-rog-strix-z890-f-gaming-wifi",
        a: { m2_1: "samsung-990-pro-2tb" },
      });
      const base64 = btoa(payload);
      const base64url = base64
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const decoded = decode(base64url);

      expect(decoded).not.toBeNull();
      expect(decoded!.motherboardId).toBe("asus-rog-strix-z890-f-gaming-wifi");
      expect(decoded!.assignments).toEqual({ m2_1: "samsung-990-pro-2tb" });
      expect(decoded!.cpuId).toBeUndefined();
    });

    it("encoding without cpuId omits c field from payload", () => {
      const encoded = encode("test-board", { m2_1: "some-nvme" });

      // Decode the base64url manually to inspect the raw JSON
      let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
      const pad = base64.length % 4;
      if (pad) base64 += "=".repeat(4 - pad);
      const json = JSON.parse(atob(base64));

      expect(json).not.toHaveProperty("c");
      expect(json.m).toBe("test-board");
      expect(json.a).toEqual({ m2_1: "some-nvme" });
    });

    it("encoding with cpuId includes c field in payload", () => {
      const encoded = encode("test-board", { m2_1: "some-nvme" }, "amd-ryzen-7-9700x");

      let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
      const pad = base64.length % 4;
      if (pad) base64 += "=".repeat(4 - pad);
      const json = JSON.parse(atob(base64));

      expect(json.c).toBe("amd-ryzen-7-9700x");
    });
  });

  // --- Task 6.3: Backward-compatibility — legacy kit-level assignment ---

  describe("backward compatibility with legacy kit-level assignments", () => {
    it("decoding a legacy URL with kit-level RAM assignment (no __stick_ suffix) works", () => {
      const motherboardId = "asus-rog-strix-z890-f-gaming-wifi";
      const legacyAssignments = {
        dimm_a2: "corsair-vengeance-ddr5-6000-32gb",
      };

      const encoded = encode(motherboardId, legacyAssignments);
      const decoded = decode(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.motherboardId).toBe(motherboardId);
      expect(decoded!.assignments).toEqual(legacyAssignments);
    });

    it("decoding a legacy URL with multiple kit-level RAM assignments works", () => {
      const motherboardId = "msi-mag-z890-tomahawk-wifi";
      const legacyAssignments = {
        dimm_a2: "corsair-vengeance-ddr5-6000-32gb",
        dimm_b2: "gskill-trident-z5-ddr5-6400-32gb",
      };

      const encoded = encode(motherboardId, legacyAssignments);
      const decoded = decode(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.motherboardId).toBe(motherboardId);
      expect(decoded!.assignments).toEqual(legacyAssignments);
    });

    it("decoding a legacy URL with mixed component types (RAM kit-level + NVMe) works", () => {
      const motherboardId = "gigabyte-z890-aorus-elite-wifi7";
      const legacyAssignments = {
        dimm_a2: "corsair-vengeance-ddr5-6000-32gb",
        m2_1: "samsung-990-pro-2tb",
        pcie_1: "nvidia-rtx-4070-ti-super",
      };

      const encoded = encode(motherboardId, legacyAssignments);
      const decoded = decode(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.motherboardId).toBe(motherboardId);
      expect(decoded!.assignments).toEqual(legacyAssignments);
    });
  });
});
