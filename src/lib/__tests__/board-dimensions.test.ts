// Tests for board-dimensions.ts — property-based and unit tests
// Covers: getBoardDimensions, parseNvmeFormFactor, mmToPct

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import type { Motherboard } from "../types";
import {
  FORM_FACTOR_DIMENSIONS,
  getBoardDimensions,
  parseNvmeFormFactor,
  mmToPct,
} from "../board-dimensions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal motherboard stub with only the fields getBoardDimensions needs. */
function stubMotherboard(
  overrides: Partial<Pick<Motherboard, "form_factor" | "length_mm" | "width_mm">>,
): Motherboard {
  return {
    id: "test-board",
    manufacturer: "Test",
    model: "Test Board",
    chipset: "Z790",
    socket: "LGA1700",
    form_factor: "ATX",
    memory: {
      type: "DDR5",
      max_speed_mhz: 5600,
      base_speed_mhz: 4800,
      max_capacity_gb: 128,
      ecc_support: false,
      channels: 2,
      slots: [],
      recommended_population: { two_dimm: [] },
    },
    m2_slots: [],
    pcie_slots: [],
    sata_ports: [],
    sources: [],
    schema_version: "1.0",
    ...overrides,
  } as Motherboard;
}

const KNOWN_FORM_FACTORS = Object.keys(FORM_FACTOR_DIMENSIONS);

// ---------------------------------------------------------------------------
// Feature: interactive-board-layout, Property 1: Form factor dimension fallback
// **Validates: Requirements 1.4**
// ---------------------------------------------------------------------------

describe("Property 1: Form factor dimension fallback", () => {
  it("returns standard dimensions for known form factors without explicit dimensions", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...KNOWN_FORM_FACTORS),
        (formFactor) => {
          const board = stubMotherboard({ form_factor: formFactor });
          const result = getBoardDimensions(board);
          const expected = FORM_FACTOR_DIMENSIONS[formFactor];

          expect(result).not.toBeNull();
          expect(result!.widthMm).toBe(expected.width);
          expect(result!.heightMm).toBe(expected.height);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("returns explicit dimensions when both length_mm and width_mm are provided, regardless of form factor", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...KNOWN_FORM_FACTORS, "E-ATX", "CEB", "XL-ATX"),
        fc.integer({ min: 100, max: 600 }),
        fc.integer({ min: 100, max: 400 }),
        (formFactor, lengthMm, widthMm) => {
          const board = stubMotherboard({
            form_factor: formFactor,
            length_mm: lengthMm,
            width_mm: widthMm,
          });
          const result = getBoardDimensions(board);

          expect(result).not.toBeNull();
          expect(result!.widthMm).toBe(lengthMm);
          expect(result!.heightMm).toBe(widthMm);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("returns null for non-standardized form factors without explicit dimensions", () => {
    const nonStandardFormFactors = ["E-ATX", "CEB", "XL-ATX", "SSI-EEB", "FlexATX"];

    fc.assert(
      fc.property(
        fc.constantFrom(...nonStandardFormFactors),
        (formFactor) => {
          const board = stubMotherboard({ form_factor: formFactor });
          const result = getBoardDimensions(board);

          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: interactive-board-layout, Property 2: NVMe form factor parsing
// **Validates: Requirements 4.5**
// ---------------------------------------------------------------------------

describe("Property 2: NVMe form factor parsing", () => {
  it("round-trips valid form factor strings (2-digit prefix + 2-3 digit suffix)", () => {
    // Generate a 2-digit width (10-99) and a 2-3 digit length (10-999)
    const arbNvmeFormFactor = fc
      .record({
        width: fc.integer({ min: 10, max: 99 }),
        length: fc.integer({ min: 10, max: 999 }),
      })
      .filter(({ length }) => {
        // The combined string must be 4 or 5 chars total
        const lengthStr = String(length);
        return lengthStr.length >= 2 && lengthStr.length <= 3;
      })
      .map(({ width, length }) => ({
        str: `${width}${length}`,
        width,
        length,
      }));

    fc.assert(
      fc.property(arbNvmeFormFactor, ({ str, width, length }) => {
        const result = parseNvmeFormFactor(str);

        expect(result).not.toBeNull();
        expect(result!.widthMm).toBe(width);
        expect(result!.lengthMm).toBe(length);

        // Round-trip: formatting back should produce the original string
        const roundTrip = `${result!.widthMm}${result!.lengthMm}`;
        expect(roundTrip).toBe(str);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Unit tests for board-dimensions.ts
// ---------------------------------------------------------------------------

describe("getBoardDimensions", () => {
  it("ATX returns 305x244", () => {
    const board = stubMotherboard({ form_factor: "ATX" });
    const result = getBoardDimensions(board);
    expect(result).toEqual({ widthMm: 305, heightMm: 244 });
  });

  it("Micro-ATX returns 244x244", () => {
    const board = stubMotherboard({ form_factor: "Micro-ATX" });
    const result = getBoardDimensions(board);
    expect(result).toEqual({ widthMm: 244, heightMm: 244 });
  });

  it("Mini-ITX returns 170x170", () => {
    const board = stubMotherboard({ form_factor: "Mini-ITX" });
    const result = getBoardDimensions(board);
    expect(result).toEqual({ widthMm: 170, heightMm: 170 });
  });

  it("explicit dimensions override form factor", () => {
    const board = stubMotherboard({
      form_factor: "ATX",
      length_mm: 310,
      width_mm: 250,
    });
    const result = getBoardDimensions(board);
    expect(result).toEqual({ widthMm: 310, heightMm: 250 });
  });

  it("E-ATX without explicit dimensions returns null", () => {
    const board = stubMotherboard({ form_factor: "E-ATX" });
    const result = getBoardDimensions(board);
    expect(result).toBeNull();
  });

  it("E-ATX with explicit dimensions returns those dimensions", () => {
    const board = stubMotherboard({
      form_factor: "E-ATX",
      length_mm: 330,
      width_mm: 305,
    });
    const result = getBoardDimensions(board);
    expect(result).toEqual({ widthMm: 330, heightMm: 305 });
  });
});

describe("parseNvmeFormFactor", () => {
  it('"2280" -> 22x80', () => {
    expect(parseNvmeFormFactor("2280")).toEqual({ widthMm: 22, lengthMm: 80 });
  });

  it('"22110" -> 22x110', () => {
    expect(parseNvmeFormFactor("22110")).toEqual({ widthMm: 22, lengthMm: 110 });
  });

  it('"2242" -> 22x42', () => {
    expect(parseNvmeFormFactor("2242")).toEqual({ widthMm: 22, lengthMm: 42 });
  });

  it("returns null for strings too short", () => {
    expect(parseNvmeFormFactor("228")).toBeNull();
  });

  it("returns null for strings too long", () => {
    expect(parseNvmeFormFactor("228000")).toBeNull();
  });

  it("returns null for non-numeric input", () => {
    expect(parseNvmeFormFactor("abcd")).toBeNull();
  });
});

describe("mmToPct", () => {
  it("converts mm to percentage of board dimension", () => {
    // 80mm on a 305mm board = (80/305)*100
    const result = mmToPct(80, 305);
    expect(result).toBeCloseTo((80 / 305) * 100, 10);
  });

  it("full board dimension equals 100%", () => {
    expect(mmToPct(305, 305)).toBeCloseTo(100, 10);
  });

  it("zero mm equals 0%", () => {
    expect(mmToPct(0, 305)).toBe(0);
  });

  it("half the board dimension equals 50%", () => {
    expect(mmToPct(152.5, 305)).toBeCloseTo(50, 10);
  });
});
