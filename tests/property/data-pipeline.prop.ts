import { describe, test, expect } from "vitest";
import * as fc from "fast-check";

// ── Pure logic replicated from scripts for testability ──────────────────────

/**
 * Duplicate detection logic (mirrors check-duplicates.ts):
 * Given a map of id → file paths, duplicates are entries where the array has length > 1.
 */
function findDuplicates(
  idToFiles: Map<string, string[]>
): Map<string, string[]> {
  const duplicates = new Map<string, string[]>();
  for (const [id, files] of idToFiles) {
    if (files.length > 1) {
      duplicates.set(id, files);
    }
  }
  return duplicates;
}

/**
 * Build an id→files map from a collection of objects with `id` fields,
 * each associated with a file path.
 */
function buildIdMap(
  entries: { id: string; filePath: string }[]
): Map<string, string[]> {
  const idToFiles = new Map<string, string[]>();
  for (const entry of entries) {
    if (!idToFiles.has(entry.id)) {
      idToFiles.set(entry.id, []);
    }
    idToFiles.get(entry.id)!.push(entry.filePath);
  }
  return idToFiles;
}

/**
 * Sanity check value logic (mirrors sanity-check.ts checkValue):
 * Returns a violation object if value > maxAllowed, otherwise null.
 */
interface Violation {
  file: string;
  field: string;
  value: number;
  maxAllowed: number;
}

function checkValue(
  file: string,
  field: string,
  value: number,
  maxAllowed: number
): Violation | null {
  if (value > maxAllowed) {
    return { file, field, value, maxAllowed };
  }
  return null;
}

// ── Sanity check ranges from sanity-check.ts ────────────────────────────────

const RANGES = [
  { field: "pcie_gen", max: 5 },
  { field: "lane_count", max: 16 },
  { field: "tdp_w", max: 1000 },
  { field: "capacity_gb", max: 65536 },
] as const;

// ── Arbitraries ─────────────────────────────────────────────────────────────

const idArb = fc
  .stringMatching(/^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$/)
  .filter((s) => s.length >= 2);

const filePathArb = fc
  .tuple(
    fc.constantFrom("data/motherboards/asus/", "data/motherboards/msi/", "data/components/nvme/", "data/components/gpu/"),
    idArb
  )
  .map(([dir, name]) => `${dir}${name}.yaml`);

// ── Property 3: Duplicate ID detection across all data files ────────────────

describe("Property 3: Duplicate ID detection across all data files", () => {
  /**
   * Validates: Requirements 5.4
   */

  test("collections with all unique IDs produce no duplicates", () => {
    // Generate a set of unique IDs, each mapped to exactly one file
    const uniqueEntriesArb = fc
      .uniqueArray(
        fc.tuple(idArb, filePathArb),
        { minLength: 1, maxLength: 20, selector: ([id]) => id }
      )
      .map((pairs) =>
        pairs.map(([id, filePath]) => ({ id, filePath }))
      );

    fc.assert(
      fc.property(uniqueEntriesArb, (entries) => {
        const idMap = buildIdMap(entries);
        const duplicates = findDuplicates(idMap);
        expect(duplicates.size).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  test("collections with duplicate IDs are correctly detected", () => {
    // Generate entries where at least one ID appears in multiple files
    const entriesWithDupsArb = fc
      .tuple(
        idArb,
        fc.uniqueArray(filePathArb, { minLength: 2, maxLength: 5 }),
        fc.array(
          fc.tuple(idArb, filePathArb),
          { minLength: 0, maxLength: 10 }
        )
      )
      .map(([dupId, dupFiles, extras]) => {
        const dupEntries = dupFiles.map((fp) => ({ id: dupId, filePath: fp }));
        const extraEntries = extras.map(([id, fp]) => ({ id, filePath: fp }));
        return { dupId, entries: [...dupEntries, ...extraEntries] };
      });

    fc.assert(
      fc.property(entriesWithDupsArb, ({ dupId, entries }) => {
        const idMap = buildIdMap(entries);
        const duplicates = findDuplicates(idMap);

        // The deliberately duplicated ID must be detected
        expect(duplicates.has(dupId)).toBe(true);
        expect(duplicates.get(dupId)!.length).toBeGreaterThanOrEqual(2);
      }),
      { numRuns: 100 }
    );
  });

  test("duplicate count matches entries with array length > 1", () => {
    // Generate arbitrary entries and verify the invariant
    const entriesArb = fc.array(
      fc.tuple(idArb, filePathArb).map(([id, fp]) => ({ id, filePath: fp })),
      { minLength: 1, maxLength: 30 }
    );

    fc.assert(
      fc.property(entriesArb, (entries) => {
        const idMap = buildIdMap(entries);
        const duplicates = findDuplicates(idMap);

        // Every entry in duplicates must have length > 1
        for (const [, files] of duplicates) {
          expect(files.length).toBeGreaterThan(1);
        }

        // Every non-duplicate entry must have length === 1
        for (const [id, files] of idMap) {
          if (!duplicates.has(id)) {
            expect(files.length).toBe(1);
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 4: Sanity check flags out-of-range values ──────────────────────

describe("Property 4: Sanity check flags out-of-range values", () => {
  /**
   * Validates: Requirements 5.5
   */

  for (const range of RANGES) {
    test(`values within range for ${range.field} (0 to ${range.max}) are NOT flagged`, () => {
      const inRangeArb = fc.double({
        min: 0,
        max: range.max,
        noNaN: true,
        noDefaultInfinity: true,
      });

      fc.assert(
        fc.property(inRangeArb, (value) => {
          const violation = checkValue("test.yaml", range.field, value, range.max);
          expect(violation).toBeNull();
        }),
        { numRuns: 100 }
      );
    });

    test(`values exceeding range for ${range.field} (> ${range.max}) ARE flagged`, () => {
      const overRangeArb = fc.double({
        min: range.max + 0.001,
        max: range.max * 100,
        noNaN: true,
        noDefaultInfinity: true,
      });

      fc.assert(
        fc.property(overRangeArb, (value) => {
          const violation = checkValue("test.yaml", range.field, value, range.max);
          expect(violation).not.toBeNull();
          expect(violation!.value).toBe(value);
          expect(violation!.maxAllowed).toBe(range.max);
          expect(violation!.field).toBe(range.field);
        }),
        { numRuns: 100 }
      );
    });
  }

  test("exact boundary value (equal to max) is NOT flagged", () => {
    const rangeArb = fc.constantFrom(...RANGES);

    fc.assert(
      fc.property(rangeArb, (range) => {
        const violation = checkValue("test.yaml", range.field, range.max, range.max);
        expect(violation).toBeNull();
      }),
      { numRuns: 100 }
    );
  });
});


// ── Pure logic replicated from generate-manifest.ts for testability ─────────

/** Sort object keys recursively for deterministic output (mirrors generate-manifest.ts). */
function sortKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(sortKeys);
  }
  if (obj !== null && typeof obj === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}

/** Extract type-specific key specs for a component manifest entry (mirrors generate-manifest.ts). */
function extractSpecs(data: Record<string, unknown>): Record<string, unknown> {
  const type = data.type as string;
  switch (type) {
    case "nvme": {
      const iface = data.interface as Record<string, unknown> | undefined;
      return {
        capacity_gb: data.capacity_gb,
        "interface.protocol": iface?.protocol,
        "interface.pcie_gen": iface?.pcie_gen,
      };
    }
    case "gpu": {
      const iface = data.interface as Record<string, unknown> | undefined;
      const power = data.power as Record<string, unknown> | undefined;
      const physical = data.physical as Record<string, unknown> | undefined;
      return {
        "interface.pcie_gen": iface?.pcie_gen,
        "power.tdp_w": power?.tdp_w,
        "physical.length_mm": physical?.length_mm,
      };
    }
    case "ram": {
      const iface = data.interface as Record<string, unknown> | undefined;
      const capacity = data.capacity as Record<string, unknown> | undefined;
      return {
        "interface.type": iface?.type,
        "interface.speed_mhz": iface?.speed_mhz,
        "capacity.total_gb": capacity?.total_gb,
      };
    }
    case "sata_drive": {
      return {
        capacity_gb: data.capacity_gb,
        form_factor: data.form_factor,
      };
    }
    default:
      return {};
  }
}

/** Build a motherboard manifest summary (mirrors generate-manifest.ts). */
function buildMotherboardSummary(data: Record<string, unknown>): Record<string, unknown> {
  return {
    id: data.id,
    manufacturer: data.manufacturer,
    model: data.model,
    socket: data.socket,
    chipset: data.chipset,
    form_factor: data.form_factor,
  };
}

/** Build a component manifest summary (mirrors generate-manifest.ts). */
function buildComponentSummary(data: Record<string, unknown>): Record<string, unknown> {
  return {
    id: data.id,
    type: data.type,
    manufacturer: data.manufacturer,
    model: data.model,
    specs: extractSpecs(data),
  };
}

// ── Arbitraries for Properties 6 & 7 ───────────────────────────────────────

const nonEmptyStringArb = fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9 _-]{0,19}$/).filter((s) => s.length >= 1);

const motherboardDataArb = fc.record({
  id: idArb,
  manufacturer: nonEmptyStringArb,
  model: nonEmptyStringArb,
  socket: fc.constantFrom("LGA1851", "AM5", "LGA1700", "AM4"),
  chipset: fc.constantFrom("Z890", "X870", "B650", "Z790"),
  form_factor: fc.constantFrom("ATX", "Micro-ATX", "Mini-ITX", "E-ATX"),
  schema_version: fc.constant("1.0"),
});

const nvmeDataArb = fc.record({
  id: idArb,
  type: fc.constant("nvme" as const),
  manufacturer: nonEmptyStringArb,
  model: nonEmptyStringArb,
  interface: fc.record({
    protocol: fc.constantFrom("NVMe", "SATA"),
    pcie_gen: fc.constantFrom(3, 4, 5, null),
    lanes: fc.constantFrom(2, 4, null),
  }),
  form_factor: fc.constantFrom("2280", "2242", "2260", "22110"),
  capacity_gb: fc.integer({ min: 128, max: 8000 }),
  schema_version: fc.constant("1.0"),
});

const gpuDataArb = fc.record({
  id: idArb,
  type: fc.constant("gpu" as const),
  manufacturer: nonEmptyStringArb,
  model: nonEmptyStringArb,
  interface: fc.record({
    pcie_gen: fc.constantFrom(3, 4, 5),
    lanes: fc.constantFrom(8, 16),
  }),
  physical: fc.record({
    slot_width: fc.constantFrom(2, 3),
    length_mm: fc.integer({ min: 150, max: 400 }),
  }),
  power: fc.record({
    tdp_w: fc.integer({ min: 75, max: 600 }),
    recommended_psu_w: fc.integer({ min: 450, max: 1000 }),
  }),
  schema_version: fc.constant("1.0"),
});

const ramDataArb = fc.record({
  id: idArb,
  type: fc.constant("ram" as const),
  manufacturer: nonEmptyStringArb,
  model: nonEmptyStringArb,
  interface: fc.record({
    type: fc.constantFrom("DDR4", "DDR5"),
    speed_mhz: fc.constantFrom(3200, 3600, 4800, 5600, 6000),
    base_speed_mhz: fc.constantFrom(2133, 3200, 4800),
  }),
  capacity: fc.record({
    per_module_gb: fc.constantFrom(8, 16, 32),
    modules: fc.constantFrom(1, 2, 4),
    total_gb: fc.constantFrom(16, 32, 64, 128),
  }),
  schema_version: fc.constant("1.0"),
});

const sataDataArb = fc.record({
  id: idArb,
  type: fc.constant("sata_drive" as const),
  manufacturer: nonEmptyStringArb,
  model: nonEmptyStringArb,
  form_factor: fc.constantFrom("2.5", "3.5"),
  capacity_gb: fc.integer({ min: 120, max: 8000 }),
  interface: fc.constant("SATA III"),
  schema_version: fc.constant("1.0"),
});

const componentDataArb = fc.oneof(nvmeDataArb, gpuDataArb, ramDataArb, sataDataArb);

// ── Property 6: Manifest contains required summary fields for all entries ───

describe("Property 6: Manifest contains required summary fields for all entries", () => {
  /**
   * Validates: Requirements 6.2, 6.3
   */

  test("motherboard manifest summary contains id, manufacturer, model, socket, chipset, form_factor", () => {
    fc.assert(
      fc.property(motherboardDataArb, (mbData) => {
        const summary = buildMotherboardSummary(mbData as Record<string, unknown>);
        expect(summary).toHaveProperty("id", mbData.id);
        expect(summary).toHaveProperty("manufacturer", mbData.manufacturer);
        expect(summary).toHaveProperty("model", mbData.model);
        expect(summary).toHaveProperty("socket", mbData.socket);
        expect(summary).toHaveProperty("chipset", mbData.chipset);
        expect(summary).toHaveProperty("form_factor", mbData.form_factor);
      }),
      { numRuns: 100 }
    );
  });

  test("component manifest summary contains id, type, manufacturer, model, specs", () => {
    fc.assert(
      fc.property(componentDataArb, (compData) => {
        const summary = buildComponentSummary(compData as Record<string, unknown>);
        expect(summary).toHaveProperty("id", compData.id);
        expect(summary).toHaveProperty("type", compData.type);
        expect(summary).toHaveProperty("manufacturer", compData.manufacturer);
        expect(summary).toHaveProperty("model", compData.model);
        expect(summary).toHaveProperty("specs");
        expect(typeof summary.specs).toBe("object");
      }),
      { numRuns: 100 }
    );
  });

  test("nvme specs contain capacity_gb, interface.protocol, interface.pcie_gen", () => {
    fc.assert(
      fc.property(nvmeDataArb, (nvme) => {
        const specs = extractSpecs(nvme as Record<string, unknown>);
        expect(specs).toHaveProperty("capacity_gb", nvme.capacity_gb);
        expect(specs).toHaveProperty("interface.protocol", nvme.interface.protocol);
        expect(specs).toHaveProperty("interface.pcie_gen", nvme.interface.pcie_gen);
      }),
      { numRuns: 100 }
    );
  });

  test("gpu specs contain interface.pcie_gen, power.tdp_w, physical.length_mm", () => {
    fc.assert(
      fc.property(gpuDataArb, (gpu) => {
        const specs = extractSpecs(gpu as Record<string, unknown>);
        expect(specs).toHaveProperty("interface.pcie_gen", gpu.interface.pcie_gen);
        expect(specs).toHaveProperty("power.tdp_w", gpu.power.tdp_w);
        expect(specs).toHaveProperty("physical.length_mm", gpu.physical.length_mm);
      }),
      { numRuns: 100 }
    );
  });

  test("ram specs contain interface.type, interface.speed_mhz, capacity.total_gb", () => {
    fc.assert(
      fc.property(ramDataArb, (ram) => {
        const specs = extractSpecs(ram as Record<string, unknown>);
        expect(specs).toHaveProperty("interface.type", ram.interface.type);
        expect(specs).toHaveProperty("interface.speed_mhz", ram.interface.speed_mhz);
        expect(specs).toHaveProperty("capacity.total_gb", ram.capacity.total_gb);
      }),
      { numRuns: 100 }
    );
  });

  test("sata_drive specs contain capacity_gb, form_factor", () => {
    fc.assert(
      fc.property(sataDataArb, (sata) => {
        const specs = extractSpecs(sata as Record<string, unknown>);
        expect(specs).toHaveProperty("capacity_gb", sata.capacity_gb);
        expect(specs).toHaveProperty("form_factor", sata.form_factor);
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 7: Deterministic manifest generation ───────────────────────────

describe("Property 7: Deterministic manifest generation", () => {
  /**
   * Validates: Requirements 6.5, 6.6
   */

  test("sortKeys + JSON.stringify produces byte-identical output across multiple calls", () => {
    const dataSetArb = fc.record({
      motherboards: fc.array(motherboardDataArb, { minLength: 0, maxLength: 10 }),
      components: fc.array(componentDataArb, { minLength: 0, maxLength: 10 }),
    });

    fc.assert(
      fc.property(dataSetArb, (dataSet) => {
        const manifest = {
          motherboards: dataSet.motherboards.map((m) =>
            buildMotherboardSummary(m as Record<string, unknown>)
          ),
          components: dataSet.components.map((c) =>
            buildComponentSummary(c as Record<string, unknown>)
          ),
        };

        const run1 = JSON.stringify(sortKeys(manifest), null, 2);
        const run2 = JSON.stringify(sortKeys(manifest), null, 2);

        expect(run1).toBe(run2);
      }),
      { numRuns: 100 }
    );
  });

  test("key ordering is deterministic regardless of insertion order", () => {
    const dataSetArb = fc.record({
      motherboards: fc.array(motherboardDataArb, { minLength: 1, maxLength: 5 }),
      components: fc.array(componentDataArb, { minLength: 1, maxLength: 5 }),
    });

    fc.assert(
      fc.property(dataSetArb, (dataSet) => {
        // Build manifest in original order
        const manifestA = {
          motherboards: dataSet.motherboards.map((m) =>
            buildMotherboardSummary(m as Record<string, unknown>)
          ),
          components: dataSet.components.map((c) =>
            buildComponentSummary(c as Record<string, unknown>)
          ),
        };

        // Build manifest in reversed key insertion order
        const manifestB = {
          components: dataSet.components.map((c) =>
            buildComponentSummary(c as Record<string, unknown>)
          ),
          motherboards: dataSet.motherboards.map((m) =>
            buildMotherboardSummary(m as Record<string, unknown>)
          ),
        };

        const jsonA = JSON.stringify(sortKeys(manifestA), null, 2);
        const jsonB = JSON.stringify(sortKeys(manifestB), null, 2);

        expect(jsonA).toBe(jsonB);
      }),
      { numRuns: 100 }
    );
  });

  test("output is valid JSON (round-trip parse/stringify produces equivalent output)", () => {
    const dataSetArb = fc.record({
      motherboards: fc.array(motherboardDataArb, { minLength: 0, maxLength: 5 }),
      components: fc.array(componentDataArb, { minLength: 0, maxLength: 5 }),
    });

    fc.assert(
      fc.property(dataSetArb, (dataSet) => {
        const manifest = {
          motherboards: dataSet.motherboards.map((m) =>
            buildMotherboardSummary(m as Record<string, unknown>)
          ),
          components: dataSet.components.map((c) =>
            buildComponentSummary(c as Record<string, unknown>)
          ),
        };

        const json = JSON.stringify(sortKeys(manifest), null, 2);
        const parsed = JSON.parse(json);
        const reStringified = JSON.stringify(sortKeys(parsed), null, 2);

        expect(json).toBe(reStringified);
      }),
      { numRuns: 100 }
    );
  });
});
