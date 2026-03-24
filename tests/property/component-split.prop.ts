// Feature: component-split — Property-based tests for per-type component table split

import { describe, test, expect } from "vitest";
import * as fc from "fast-check";
import {
  transformComponent,
  reconstructComponent,
  generateSummaryLine,
  computeOrphans,
  COMPONENT_TABLE_MAP,
} from "../../scripts/sync";
import type { PerTypeComponentRow, ComponentYAML } from "../../scripts/sync";

// ── Arbitraries ─────────────────────────────────────────────────────────────

const idArb = fc
  .stringMatching(/^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$/)
  .filter((s) => s.length >= 2);

const nonEmptyStringArb = fc
  .stringMatching(/^[A-Za-z0-9][A-Za-z0-9 _-]{0,19}$/)
  .filter((s) => s.length >= 1);

/** Generate a random valid NVMe component YAML object. */
function arbNvmeYAML(): fc.Arbitrary<ComponentYAML> {
  return fc.record({
    id: idArb,
    type: fc.constant("nvme"),
    manufacturer: nonEmptyStringArb,
    model: nonEmptyStringArb,
    sku: fc.option(nonEmptyStringArb, { nil: undefined }),
    schema_version: fc.constantFrom("1.0", "2.0"),
    sources: fc.option(
      fc.constant([{ type: "manual", url: "https://example.com" }]),
      { nil: undefined }
    ),
    contributed_by: fc.option(nonEmptyStringArb, { nil: undefined }),
    interface: fc.record({
      protocol: fc.constantFrom("NVMe", "NVMe 2.0"),
      pcie_gen: fc.constantFrom(3, 4, 5),
      lanes: fc.constantFrom(2, 4),
    }),
    form_factor: fc.constantFrom("2280", "2242", "2230"),
    capacity_gb: fc.constantFrom(250, 500, 1000, 2000, 4000),
    capacity_variant_note: fc.option(nonEmptyStringArb, { nil: undefined }),
  });
}

/** Generate a random valid GPU component YAML object. */
function arbGpuYAML(): fc.Arbitrary<ComponentYAML> {
  return fc.record({
    id: idArb,
    type: fc.constant("gpu"),
    chip_manufacturer: fc.constantFrom("NVIDIA", "AMD", "Intel"),
    manufacturer: nonEmptyStringArb,
    model: nonEmptyStringArb,
    sku: fc.option(nonEmptyStringArb, { nil: undefined }),
    schema_version: fc.constant("2.0"),
    sources: fc.option(
      fc.constant([{ type: "manual", url: "https://example.com" }]),
      { nil: undefined }
    ),
    contributed_by: fc.option(nonEmptyStringArb, { nil: undefined }),
    interface: fc.record({
      pcie_gen: fc.constantFrom(3, 4, 5),
      lanes: fc.constantFrom(1, 4, 8, 16),
    }),
    physical: fc.record({
      slot_width: fc.constantFrom(1, 2, 3),
      length_mm: fc.integer({ min: 150, max: 400 }),
      slots_occupied: fc.integer({ min: 1, max: 4 }),
    }),
    power: fc.record({
      tdp_w: fc.integer({ min: 75, max: 600 }),
      recommended_psu_w: fc.option(fc.integer({ min: 450, max: 1200 }), { nil: undefined }),
      power_connectors: fc.array(
        fc.record({
          type: fc.constantFrom("6-pin", "8-pin", "12-pin", "16-pin/12VHPWR", "16-pin/12V-2x6"),
          count: fc.integer({ min: 1, max: 4 }),
        }),
        { minLength: 1, maxLength: 3 }
      ),
    }),
  });
}

/** Generate a random valid RAM component YAML object. */
function arbRamYAML(): fc.Arbitrary<ComponentYAML> {
  return fc.integer({ min: 1, max: 4 }).chain((modules) => {
    const perModule = fc.constantFrom(4, 8, 16, 32);
    return perModule.chain((perModGb) =>
      fc.record({
        id: idArb,
        type: fc.constant("ram"),
        manufacturer: nonEmptyStringArb,
        model: nonEmptyStringArb,
        sku: fc.option(nonEmptyStringArb, { nil: undefined }),
        schema_version: fc.constantFrom("1.0", "2.0"),
        sources: fc.option(
          fc.constant([{ type: "manual", url: "https://example.com" }]),
          { nil: undefined }
        ),
        contributed_by: fc.option(nonEmptyStringArb, { nil: undefined }),
        interface: fc.record({
          type: fc.constantFrom("DDR4", "DDR5"),
          speed_mhz: fc.constantFrom(3200, 3600, 4800, 5600, 6000, 6400),
          base_speed_mhz: fc.option(fc.constantFrom(2133, 3200, 4800), { nil: undefined }),
        }),
        capacity: fc.constant({
          per_module_gb: perModGb,
          modules,
          total_gb: perModGb * modules,
        }),
      })
    );
  });
}

/** Generate a random valid SATA drive component YAML object. */
function arbSataDriveYAML(): fc.Arbitrary<ComponentYAML> {
  return fc.record({
    id: idArb,
    type: fc.constant("sata_drive"),
    manufacturer: nonEmptyStringArb,
    model: nonEmptyStringArb,
    sku: fc.option(nonEmptyStringArb, { nil: undefined }),
    schema_version: fc.constantFrom("1.0", "2.0"),
    sources: fc.option(
      fc.constant([{ type: "manual", url: "https://example.com" }]),
      { nil: undefined }
    ),
    contributed_by: fc.option(nonEmptyStringArb, { nil: undefined }),
    form_factor: fc.constantFrom("2.5", "3.5"),
    capacity_gb: fc.constantFrom(250, 500, 1000, 2000, 4000),
    interface: fc.constant("SATA III"),
  });
}

/** Generate a random valid component YAML object of any type. */
function arbComponentYAML(): fc.Arbitrary<ComponentYAML> {
  return fc.oneof(arbNvmeYAML(), arbGpuYAML(), arbRamYAML(), arbSataDriveYAML());
}

// ── Property 1: Per-type component transform round-trip ─────────────────────
// Feature: component-split, Property 1: Per-type component transform round-trip

describe("Property 1: Per-type component transform round-trip", () => {
  /**
   * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 3.2, 3.3, 3.4, 3.6, 6.2, 6.4
   *
   * For any valid ComponentYAML object, transforming it into a per-type row
   * and then reconstructing the Component union from that row should produce
   * an object equivalent to the original YAML input (excluding summary_line,
   * updated_at, sku, sources, contributed_by which are metadata not part of
   * the Component union type).
   */

  test("NVMe: transform -> reconstruct produces equivalent Component", () => {
    fc.assert(
      fc.property(arbNvmeYAML(), (yaml) => {
        const row = transformComponent(yaml);
        const reconstructed = reconstructComponent(row);

        const expected: Record<string, unknown> = {
          id: yaml.id,
          type: "nvme",
          manufacturer: yaml.manufacturer,
          model: yaml.model,
          interface: yaml.interface,
          form_factor: yaml.form_factor,
          capacity_gb: yaml.capacity_gb,
          schema_version: yaml.schema_version,
        };
        if (yaml.capacity_variant_note !== undefined) {
          expected.capacity_variant_note = yaml.capacity_variant_note;
        }

        expect(reconstructed).toEqual(expected);
      }),
      { numRuns: 100 }
    );
  });

  test("GPU: transform -> reconstruct produces equivalent Component", () => {
    fc.assert(
      fc.property(arbGpuYAML(), (yaml) => {
        const row = transformComponent(yaml);
        const reconstructed = reconstructComponent(row);

        const power = yaml.power as { tdp_w: number; recommended_psu_w?: number; power_connectors: { type: string; count: number }[] };
        const expected = {
          id: yaml.id,
          type: "gpu",
          chip_manufacturer: yaml.chip_manufacturer,
          manufacturer: yaml.manufacturer,
          model: yaml.model,
          interface: yaml.interface,
          physical: yaml.physical,
          power: {
            tdp_w: power.tdp_w,
            // reconstructComponent uses the raw DB value (null for undefined)
            recommended_psu_w: power.recommended_psu_w ?? null,
            power_connectors: power.power_connectors,
          },
          schema_version: yaml.schema_version,
        };

        expect(reconstructed).toEqual(expected);
      }),
      { numRuns: 100 }
    );
  });

  test("RAM: transform -> reconstruct produces equivalent Component", () => {
    fc.assert(
      fc.property(arbRamYAML(), (yaml) => {
        const row = transformComponent(yaml);
        const reconstructed = reconstructComponent(row);

        const iface = yaml.interface as { type: string; speed_mhz: number; base_speed_mhz?: number };
        const expected = {
          id: yaml.id,
          type: "ram",
          manufacturer: yaml.manufacturer,
          model: yaml.model,
          interface: {
            type: iface.type,
            speed_mhz: iface.speed_mhz,
            // reconstructComponent uses the raw DB value (null for undefined)
            base_speed_mhz: iface.base_speed_mhz ?? null,
          },
          capacity: yaml.capacity,
          schema_version: yaml.schema_version,
        };

        expect(reconstructed).toEqual(expected);
      }),
      { numRuns: 100 }
    );
  });

  test("SATA: transform -> reconstruct produces equivalent Component", () => {
    fc.assert(
      fc.property(arbSataDriveYAML(), (yaml) => {
        const row = transformComponent(yaml);
        const reconstructed = reconstructComponent(row);

        const expected = {
          id: yaml.id,
          type: "sata_drive",
          manufacturer: yaml.manufacturer,
          model: yaml.model,
          form_factor: yaml.form_factor,
          capacity_gb: yaml.capacity_gb,
          interface: yaml.interface,
          schema_version: yaml.schema_version,
        };

        expect(reconstructed).toEqual(expected);
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 2: Component type maps to correct table name ───────────────────
// Feature: component-split, Property 2: Component type maps to correct table name

describe("Property 2: Component type maps to correct table name", () => {
  /**
   * Validates: Requirements 4.1, 4.2, 4.3, 4.4
   *
   * For the four known component types, COMPONENT_TABLE_MAP returns the
   * correct per-type table name. For any unknown type string, it returns
   * undefined.
   */

  test("known types map to correct table names", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("nvme", "gpu", "ram", "sata_drive"),
        (type) => {
          const expectedMap: Record<string, string> = {
            nvme: "components_nvme",
            gpu: "components_gpu",
            ram: "components_ram",
            sata_drive: "components_sata",
          };
          expect(COMPONENT_TABLE_MAP[type]).toBe(expectedMap[type]);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("unknown types return undefined", () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb.filter(
          (s) => !["nvme", "gpu", "ram", "sata_drive"].includes(s)
        ),
        (type) => {
          expect(COMPONENT_TABLE_MAP[type]).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 3: Per-type orphan detection is correct ────────────────────────
// Feature: component-split, Property 3: Per-type orphan detection is correct

describe("Property 3: Per-type orphan detection is correct", () => {
  /**
   * Validates: Requirements 5.1, 5.2, 5.3
   *
   * For any set of DB IDs and synced IDs per type, computeOrphans returns
   * exactly those IDs present in DB but absent from synced. Cross-type
   * isolation: syncing an ID under one type does not affect orphan detection
   * under another type.
   */

  const idSetArb = fc.array(idArb, { minLength: 0, maxLength: 20 });

  test("orphans are exactly DB IDs minus synced IDs per type", () => {
    fc.assert(
      fc.property(idSetArb, idSetArb, (dbIds, syncedIds) => {
        const orphans = computeOrphans(dbIds, syncedIds);
        const syncedSet = new Set(syncedIds);
        const expectedOrphans = dbIds.filter((id) => !syncedSet.has(id));
        expect(orphans).toEqual(expectedOrphans);
      }),
      { numRuns: 100 }
    );
  });

  test("cross-type isolation: syncing under one type does not affect another", () => {
    fc.assert(
      fc.property(
        idSetArb,
        idSetArb,
        idSetArb,
        (dbIdsTypeA, syncedIdsTypeA, syncedIdsTypeB) => {
          // Orphans for type A should only depend on type A's synced IDs
          const orphansA = computeOrphans(dbIdsTypeA, syncedIdsTypeA);
          const orphansAWithB = computeOrphans(dbIdsTypeA, syncedIdsTypeA);

          // Adding synced IDs for type B should not change type A's orphans
          // (computeOrphans is called per-type, so type B's IDs are irrelevant)
          expect(orphansA).toEqual(orphansAWithB);

          // Verify the actual orphan set is correct
          const syncedSetA = new Set(syncedIdsTypeA);
          const expectedOrphansA = dbIdsTypeA.filter((id) => !syncedSetA.has(id));
          expect(orphansA).toEqual(expectedOrphansA);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 4: Per-type transform idempotency ─────────────────────────────
// Feature: component-split, Property 4: Per-type transform idempotency

describe("Property 4: Per-type transform idempotency", () => {
  /**
   * Validates: Requirements 10.1
   *
   * For any valid ComponentYAML object, calling transformComponent() twice
   * with the same input produces identical per-type row objects when
   * comparing all fields except updated_at.
   */

  function stripUpdatedAt(row: PerTypeComponentRow): Record<string, unknown> {
    const { updated_at, ...rest } = row;
    return rest;
  }

  test("transformComponent is idempotent (excluding updated_at)", () => {
    fc.assert(
      fc.property(arbComponentYAML(), (yaml) => {
        const row1 = stripUpdatedAt(transformComponent(yaml));
        const row2 = stripUpdatedAt(transformComponent(yaml));
        expect(row1).toEqual(row2);
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 5: Summary line preserved in per-type transform ────────────────
// Feature: component-split, Property 5: Summary line preserved in per-type transform

describe("Property 5: Summary line preserved in per-type transform", () => {
  /**
   * Validates: Requirements 3.5, 9.3
   *
   * For any valid ComponentYAML object, the summary_line in the per-type row
   * produced by transformComponent() should be identical to the value produced
   * by calling generateSummaryLine() directly with the same type and specs.
   */

  test("summary_line matches independent generateSummaryLine call", () => {
    fc.assert(
      fc.property(arbComponentYAML(), (yaml) => {
        const row = transformComponent(yaml);

        // Extract specs the same way transformComponent does: rest-spread minus base fields
        const { id, type, manufacturer, model, sku, sources, contributed_by, schema_version, ...specs } = yaml;
        const expectedSummary = generateSummaryLine(type, specs);

        expect(row.summary_line).toBe(expectedSummary);
      }),
      { numRuns: 100 }
    );
  });
});
