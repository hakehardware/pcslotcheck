import { describe, test, expect } from "vitest";
import * as fc from "fast-check";
import { extractSpecs } from "../../scripts/generate-manifest";

// -- Generators --

const nonEmptyString = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0);

const capacityArb = fc.double({
  min: 1,
  max: 65536,
  noNaN: true,
  noDefaultInfinity: true,
});

const sataSsdArb = fc.record({
  type: fc.constant("sata_ssd" as const),
  capacity_gb: capacityArb,
  form_factor: nonEmptyString,
  drive_type: fc.constant("ssd" as const),
  id: nonEmptyString,
  manufacturer: nonEmptyString,
  model: nonEmptyString,
  interface: nonEmptyString,
  schema_version: nonEmptyString,
});

const sataHddArb = fc.record({
  type: fc.constant("sata_hdd" as const),
  capacity_gb: capacityArb,
  form_factor: nonEmptyString,
  drive_type: fc.constant("hdd" as const),
  id: nonEmptyString,
  manufacturer: nonEmptyString,
  model: nonEmptyString,
  interface: nonEmptyString,
  schema_version: nonEmptyString,
});

// -- Property 8: Manifest extractSpecs returns correct keys for SATA subtypes --
// Feature: sata-schema-split, Property 8: Manifest extractSpecs returns correct keys for SATA subtypes
// Validates: Requirements 5.1, 5.2

describe("Feature: sata-schema-split, Property 8: Manifest extractSpecs returns correct keys for SATA subtypes", () => {
  const EXPECTED_KEYS = ["capacity_gb", "drive_type", "form_factor"];

  test("extractSpecs returns exactly capacity_gb, form_factor, and drive_type for sata_ssd", () => {
    fc.assert(
      fc.property(sataSsdArb, (data) => {
        const specs = extractSpecs(data as Record<string, unknown>);
        const keys = Object.keys(specs).sort();

        expect(keys).toEqual(EXPECTED_KEYS);
        expect(specs.capacity_gb).toBe(data.capacity_gb);
        expect(specs.form_factor).toBe(data.form_factor);
        expect(specs.drive_type).toBe(data.drive_type);
      }),
      { numRuns: 100 }
    );
  });

  test("extractSpecs returns exactly capacity_gb, form_factor, and drive_type for sata_hdd", () => {
    fc.assert(
      fc.property(sataHddArb, (data) => {
        const specs = extractSpecs(data as Record<string, unknown>);
        const keys = Object.keys(specs).sort();

        expect(keys).toEqual(EXPECTED_KEYS);
        expect(specs.capacity_gb).toBe(data.capacity_gb);
        expect(specs.form_factor).toBe(data.form_factor);
        expect(specs.drive_type).toBe(data.drive_type);
      }),
      { numRuns: 100 }
    );
  });
});
