import { describe, test, expect } from "vitest";
import * as fc from "fast-check";
import * as path from "path";
import {
  getDataType,
  checkSata,
  checkSchemaVersion,
  EXPECTED_SCHEMA_VERSIONS,
  SanityViolation,
} from "../../scripts/sanity-check";

// -- Constants --

const MAX_CAPACITY_GB = 65536; // 64 TB, matches sanity-check.ts

// Use a fake dataDir so we can construct predictable relative paths
const FAKE_DATA_DIR = "/fake/data";

// -- Generators --

// Random valid YAML filenames
const yamlFilename = fc
  .stringMatching(/^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/)
  .map((s) => `${s}.yaml`);

// Non-empty string for general fields
const nonEmptyString = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0);

// capacity_gb that exceeds the max allowed
const overMaxCapacity = fc.double({
  min: MAX_CAPACITY_GB + 1,
  max: MAX_CAPACITY_GB * 10,
  noNaN: true,
  noDefaultInfinity: true,
});

// schema_version that is NOT "2.0"
const nonTwoPointZeroVersion = nonEmptyString.filter((s) => s !== "2.0");

// SATA subtype arbitrary: either "sata-ssd" or "sata-hdd"
const sataSubtype = fc.constantFrom("sata-ssd" as const, "sata-hdd" as const);

// -- Property 6: Sanity check recognizes both SATA subtypes and applies capacity checks --
// Feature: sata-schema-split, Property 6: Sanity check recognizes both SATA subtypes and applies capacity checks
// Validates: Requirements 4.1, 4.2, 4.3

describe("Feature: sata-schema-split, Property 6: Sanity check recognizes both SATA subtypes and applies capacity checks", () => {
  test("getDataType returns 'sata-ssd' for paths under components/sata-ssd/", () => {
    fc.assert(
      fc.property(yamlFilename, (filename) => {
        const filePath = path.join(FAKE_DATA_DIR, "components", "sata-ssd", filename);
        const result = getDataType(filePath, FAKE_DATA_DIR);
        expect(result).toBe("sata-ssd");
      }),
      { numRuns: 100 }
    );
  });

  test("getDataType returns 'sata-hdd' for paths under components/sata-hdd/", () => {
    fc.assert(
      fc.property(yamlFilename, (filename) => {
        const filePath = path.join(FAKE_DATA_DIR, "components", "sata-hdd", filename);
        const result = getDataType(filePath, FAKE_DATA_DIR);
        expect(result).toBe("sata-hdd");
      }),
      { numRuns: 100 }
    );
  });

  test("checkSata produces a violation when capacity_gb exceeds MAX_CAPACITY_GB", () => {
    fc.assert(
      fc.property(overMaxCapacity, nonEmptyString, (capacity, filename) => {
        const violations: SanityViolation[] = [];
        const data: Record<string, unknown> = { capacity_gb: capacity };

        checkSata(violations, filename, data);

        expect(violations.length).toBeGreaterThanOrEqual(1);
        const capacityViolation = violations.find((v) => v.field === "capacity_gb");
        expect(capacityViolation).toBeDefined();
        expect(capacityViolation!.message).toContain("exceeds max allowed");
      }),
      { numRuns: 100 }
    );
  });
});

// -- Property 7: Sanity check enforces schema version 2.0 for both SATA subtypes --
// Feature: sata-schema-split, Property 7: Sanity check enforces schema version 2.0 for both SATA subtypes
// Validates: Requirements 4.4

describe("Feature: sata-schema-split, Property 7: Sanity check enforces schema version 2.0 for both SATA subtypes", () => {
  test("EXPECTED_SCHEMA_VERSIONS maps both sata-ssd and sata-hdd to '2.0'", () => {
    expect(EXPECTED_SCHEMA_VERSIONS["sata-ssd"]).toBe("2.0");
    expect(EXPECTED_SCHEMA_VERSIONS["sata-hdd"]).toBe("2.0");
  });

  test("checkSchemaVersion produces a violation for non-'2.0' schema_version on both SATA subtypes", () => {
    fc.assert(
      fc.property(
        sataSubtype,
        nonTwoPointZeroVersion,
        nonEmptyString,
        (dataType, badVersion, filename) => {
          const violations: SanityViolation[] = [];
          const data: Record<string, unknown> = { schema_version: badVersion };

          checkSchemaVersion(violations, filename, data, dataType);

          expect(violations.length).toBeGreaterThanOrEqual(1);
          const versionViolation = violations.find((v) => v.field === "schema_version");
          expect(versionViolation).toBeDefined();
          expect(versionViolation!.message).toContain("does not match expected");
          expect(versionViolation!.message).toContain('"2.0"');
        }
      ),
      { numRuns: 100 }
    );
  });
});
