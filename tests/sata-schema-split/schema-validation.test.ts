import { describe, test, expect } from "vitest";
import * as fc from "fast-check";
import Ajv from "ajv";
import * as fs from "fs";
import * as path from "path";

// -- Schema loading --

const SCHEMA_DIR = path.resolve(__dirname, "..", "..", "data", "schema");

function loadSchema(filename: string) {
  return JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, filename), "utf-8"));
}

const ssdSchema = loadSchema("component-sata-ssd.schema.json");
const hddSchema = loadSchema("component-sata-hdd.schema.json");

function makeAjv() {
  return new Ajv({ allErrors: true });
}

// -- Generators --

const REQUIRED_FIELDS = [
  "id",
  "type",
  "manufacturer",
  "model",
  "form_factor",
  "capacity_gb",
  "interface",
  "drive_type",
  "schema_version",
] as const;

const nonEmptyString = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0);

const capacityArb = fc.double({ min: 1, max: 65536, noNaN: true, noDefaultInfinity: true });

const sataSsdArb = fc.record({
  id: nonEmptyString,
  type: fc.constant("sata_ssd" as const),
  manufacturer: nonEmptyString,
  model: nonEmptyString,
  form_factor: nonEmptyString,
  capacity_gb: capacityArb,
  interface: nonEmptyString,
  drive_type: fc.constant("ssd" as const),
  schema_version: nonEmptyString,
});

const sataHddArb = fc.record({
  id: nonEmptyString,
  type: fc.constant("sata_hdd" as const),
  manufacturer: nonEmptyString,
  model: nonEmptyString,
  form_factor: nonEmptyString,
  capacity_gb: capacityArb,
  interface: nonEmptyString,
  drive_type: fc.constant("hdd" as const),
  schema_version: nonEmptyString,
});


// Extra field name that never collides with schema properties
const extraFieldName = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => s.trim().length > 0)
  .filter((s) => !(REQUIRED_FIELDS as readonly string[]).includes(s))
  .filter((s) => /^[a-zA-Z_]/.test(s));

// -- Property 1: Schema validates matching SATA subtype data --
// Feature: sata-schema-split, Property 1: Schema validates matching SATA subtype data
// Validates: Requirements 1.1, 1.2

describe("Feature: sata-schema-split, Property 1: Schema validates matching SATA subtype data", () => {
  test("valid SATA SSD data passes SSD schema validation", () => {
    const ajv = makeAjv();
    const validate = ajv.compile(ssdSchema);

    fc.assert(
      fc.property(sataSsdArb, (data) => {
        const valid = validate(data);
        if (!valid) {
          expect.fail(
            `Expected valid SSD data to pass, but got errors: ${JSON.stringify(validate.errors)}`
          );
        }
        expect(valid).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  test("valid SATA HDD data passes HDD schema validation", () => {
    const ajv = makeAjv();
    const validate = ajv.compile(hddSchema);

    fc.assert(
      fc.property(sataHddArb, (data) => {
        const valid = validate(data);
        if (!valid) {
          expect.fail(
            `Expected valid HDD data to pass, but got errors: ${JSON.stringify(validate.errors)}`
          );
        }
        expect(valid).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});

// -- Property 2: Schema rejects data missing any required field --
// Feature: sata-schema-split, Property 2: Schema rejects data missing any required field
// Validates: Requirements 1.3

describe("Feature: sata-schema-split, Property 2: Schema rejects data missing any required field", () => {
  const fieldIndexArb = fc.integer({ min: 0, max: REQUIRED_FIELDS.length - 1 });

  test("SSD data with a missing required field fails schema validation", () => {
    const ajv = makeAjv();
    const validate = ajv.compile(ssdSchema);

    fc.assert(
      fc.property(sataSsdArb, fieldIndexArb, (data, fieldIndex) => {
        const fieldToRemove = REQUIRED_FIELDS[fieldIndex];
        const mutated = { ...data } as Record<string, unknown>;
        delete mutated[fieldToRemove];

        const valid = validate(mutated);
        expect(valid).toBe(false);
        expect(validate.errors).toBeDefined();
        expect(validate.errors!.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  test("HDD data with a missing required field fails schema validation", () => {
    const ajv = makeAjv();
    const validate = ajv.compile(hddSchema);

    fc.assert(
      fc.property(sataHddArb, fieldIndexArb, (data, fieldIndex) => {
        const fieldToRemove = REQUIRED_FIELDS[fieldIndex];
        const mutated = { ...data } as Record<string, unknown>;
        delete mutated[fieldToRemove];

        const valid = validate(mutated);
        expect(valid).toBe(false);
        expect(validate.errors).toBeDefined();
        expect(validate.errors!.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});

// -- Property 3: Schema rejects data with extra fields --
// Feature: sata-schema-split, Property 3: Schema rejects data with extra fields
// Validates: Requirements 1.5

describe("Feature: sata-schema-split, Property 3: Schema rejects data with extra fields", () => {
  test("SSD data with an extra field fails schema validation", () => {
    const ajv = makeAjv();
    const validate = ajv.compile(ssdSchema);

    fc.assert(
      fc.property(sataSsdArb, extraFieldName, nonEmptyString, (data, extraKey, extraValue) => {
        const mutated = { ...data, [extraKey]: extraValue } as Record<string, unknown>;

        const valid = validate(mutated);
        expect(valid).toBe(false);
        expect(validate.errors).toBeDefined();
        const hasAdditionalPropError = validate.errors!.some(
          (e) => e.keyword === "additionalProperties"
        );
        expect(hasAdditionalPropError).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  test("HDD data with an extra field fails schema validation", () => {
    const ajv = makeAjv();
    const validate = ajv.compile(hddSchema);

    fc.assert(
      fc.property(sataHddArb, extraFieldName, nonEmptyString, (data, extraKey, extraValue) => {
        const mutated = { ...data, [extraKey]: extraValue } as Record<string, unknown>;

        const valid = validate(mutated);
        expect(valid).toBe(false);
        expect(validate.errors).toBeDefined();
        const hasAdditionalPropError = validate.errors!.some(
          (e) => e.keyword === "additionalProperties"
        );
        expect(hasAdditionalPropError).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});
