import { describe, test, expect } from "vitest";
import * as fc from "fast-check";
import * as path from "path";
import { getSchemaPath, DATA_DIR } from "../../scripts/validate";

// -- Generators --

// Generate random valid YAML filenames (lowercase alphanumeric with hyphens, ending in .yaml)
const yamlFilename = fc
  .stringMatching(/^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/)
  .map((s) => `${s}.yaml`);

// -- Property 4: Validation script routes SATA subtype paths to correct schemas --
// Feature: sata-schema-split, Property 4: Validation script routes SATA subtype paths to correct schemas
// Validates: Requirements 3.1, 3.2

describe("Feature: sata-schema-split, Property 4: Validation script routes SATA subtype paths to correct schemas", () => {
  test("paths under data/components/sata-ssd/ route to component-sata-ssd.schema.json", () => {
    const expectedSchema = path.join(DATA_DIR, "schema", "component-sata-ssd.schema.json");

    fc.assert(
      fc.property(yamlFilename, (filename) => {
        const filePath = path.join(DATA_DIR, "components", "sata-ssd", filename);
        const result = getSchemaPath(filePath);
        expect(result).toBe(expectedSchema);
      }),
      { numRuns: 100 }
    );
  });

  test("paths under data/components/sata-hdd/ route to component-sata-hdd.schema.json", () => {
    const expectedSchema = path.join(DATA_DIR, "schema", "component-sata-hdd.schema.json");

    fc.assert(
      fc.property(yamlFilename, (filename) => {
        const filePath = path.join(DATA_DIR, "components", "sata-hdd", filename);
        const result = getSchemaPath(filePath);
        expect(result).toBe(expectedSchema);
      }),
      { numRuns: 100 }
    );
  });
});

// -- Property 5: Validation script rejects old sata/ directory paths --
// Feature: sata-schema-split, Property 5: Validation script rejects old sata/ directory paths
// Validates: Requirements 3.3

describe("Feature: sata-schema-split, Property 5: Validation script rejects old sata/ directory paths", () => {
  test("paths under data/components/sata/ (bare, not sata-ssd or sata-hdd) return null", () => {
    fc.assert(
      fc.property(yamlFilename, (filename) => {
        const filePath = path.join(DATA_DIR, "components", "sata", filename);
        const result = getSchemaPath(filePath);
        expect(result).toBeNull();
      }),
      { numRuns: 100 }
    );
  });
});
