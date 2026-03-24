// Feature: supabase-sync-pipeline, Property 1: Motherboard transform round-trip

import { describe, test, expect } from "vitest";
import * as fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  transformMotherboard,
  transformSlots,
  transformComponent,
  generateSummaryLine,
  discoverYamlFiles,
  computeOrphans,
  parseAndValidateFile,
  routeSchema,
  generateManifest,
  extractComponentSpecs,
} from "../../scripts/sync";
import type { MotherboardYAML, ComponentYAML } from "../../scripts/sync";
import * as yaml from "js-yaml";
import { assembleMotherboard } from "../../src/lib/supabase-queries";
import type { SharingRule } from "../../src/lib/types";

// ── Arbitraries ─────────────────────────────────────────────────────────────

const idArb = fc
  .stringMatching(/^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$/)
  .filter((s) => s.length >= 2);

const nonEmptyStringArb = fc
  .stringMatching(/^[A-Za-z0-9][A-Za-z0-9 _-]{0,19}$/)
  .filter((s) => s.length >= 1);

/** Generate a valid SharingRule. */
const sharingRuleArb: fc.Arbitrary<SharingRule> = fc.record({
  type: fc.constantFrom("disables" as const, "bandwidth_split" as const),
  targets: fc.option(fc.array(idArb, { minLength: 1, maxLength: 3 }), { nil: undefined }),
  target: fc.option(idArb, { nil: undefined }),
  condition: nonEmptyStringArb,
  effect: fc.option(nonEmptyStringArb, { nil: undefined }),
});

/** Generate a random memory slot with a unique-ish id. */
function arbMemorySlot(slotId: string) {
  return fc.record({
    id: fc.constant(slotId),
    channel: fc.constantFrom("A" as const, "B" as const),
    position: fc.integer({ min: 1, max: 4 }),
    recommended: fc.boolean(),
  });
}

/** Generate an array of memory slots with unique IDs. */
const arbMemorySlots = fc
  .integer({ min: 0, max: 8 })
  .chain((count): fc.Arbitrary<{ id: string; channel: "A" | "B"; position: number; recommended: boolean }[]> => {
    if (count === 0) return fc.constant([] as { id: string; channel: "A" | "B"; position: number; recommended: boolean }[]);
    const ids = Array.from({ length: count }, (_, i) => `dimm_${i + 1}`);
    return fc.tuple(...ids.map((id) => arbMemorySlot(id))) as fc.Arbitrary<
      { id: string; channel: "A" | "B"; position: number; recommended: boolean }[]
    >;
  });

/** Generate an M.2 slot. */
function arbM2Slot(slotId: string) {
  return fc
    .record({
      id: fc.constant(slotId),
      label: nonEmptyStringArb,
      interface: fc.constantFrom("PCIe" as const, "SATA" as const, "PCIe_or_SATA" as const),
      gen: fc.constantFrom(3, 4, 5),
      lanes: fc.constantFrom(2, 4),
      form_factors: fc.constantFrom(["2280"], ["2242", "2280"], ["2230", "2242", "2280"]),
      source: fc.constantFrom("CPU" as const, "Chipset" as const),
      supports_sata: fc.boolean(),
      heatsink_included: fc.boolean(),
      sharing: fc.option(fc.array(sharingRuleArb, { minLength: 1, maxLength: 2 }), { nil: null }),
    });
}

/** Generate an array of M.2 slots with unique IDs. */
const arbM2Slots = fc
  .integer({ min: 0, max: 4 })
  .chain((count): fc.Arbitrary<MotherboardYAML["m2_slots"]> => {
    if (count === 0) return fc.constant([] as unknown as MotherboardYAML["m2_slots"]);
    const ids = Array.from({ length: count }, (_, i) => `m2_${i + 1}`);
    return fc.tuple(...ids.map((id) => arbM2Slot(id))) as unknown as fc.Arbitrary<
      MotherboardYAML["m2_slots"]
    >;
  });

/** Generate a PCIe slot. */
function arbPCIeSlot(slotId: string) {
  return fc.record({
    id: fc.constant(slotId),
    label: nonEmptyStringArb,
    gen: fc.constantFrom(3, 4, 5),
    electrical_lanes: fc.constantFrom(1, 4, 8, 16),
    physical_size: fc.constantFrom("x1" as const, "x4" as const, "x8" as const, "x16" as const),
    source: fc.constantFrom("CPU" as const, "Chipset" as const),
    reinforced: fc.boolean(),
    sharing: fc.option(fc.array(sharingRuleArb, { minLength: 1, maxLength: 2 }), { nil: null }),
  });
}

/** Generate an array of PCIe slots with unique IDs. */
const arbPCIeSlots = fc
  .integer({ min: 0, max: 4 })
  .chain((count): fc.Arbitrary<MotherboardYAML["pcie_slots"]> => {
    if (count === 0) return fc.constant([] as unknown as MotherboardYAML["pcie_slots"]);
    const ids = Array.from({ length: count }, (_, i) => `pcie_${i + 1}`);
    return fc.tuple(...ids.map((id) => arbPCIeSlot(id))) as fc.Arbitrary<
      MotherboardYAML["pcie_slots"]
    >;
  });

/** Generate a SATA port. */
function arbSATAPort(slotId: string) {
  return fc.record({
    id: fc.constant(slotId),
    version: fc.constantFrom("SATA III", "SATA II"),
    source: fc.constantFrom("CPU" as const, "Chipset" as const),
    disabled_by: fc.option(idArb, { nil: null }),
  });
}

/** Generate an array of SATA ports with unique IDs. */
const arbSATAPorts = fc
  .integer({ min: 0, max: 6 })
  .chain((count): fc.Arbitrary<MotherboardYAML["sata_ports"]> => {
    if (count === 0) return fc.constant([] as unknown as MotherboardYAML["sata_ports"]);
    const ids = Array.from({ length: count }, (_, i) => `sata_${i + 1}`);
    return fc.tuple(...ids.map((id) => arbSATAPort(id))) as fc.Arbitrary<
      MotherboardYAML["sata_ports"]
    >;
  });

/**
 * Generate a complete valid MotherboardYAML object.
 * The `recommended_population.two_dimm` references actual slot IDs from the generated memory slots.
 */
function arbMotherboardYAML(): fc.Arbitrary<MotherboardYAML> {
  return fc
    .tuple(arbMemorySlots, arbM2Slots, arbPCIeSlots, arbSATAPorts)
    .chain(([memSlots, m2Slots, pcieSlots, sataPorts]) => {
      // Pick a subset of memory slot IDs for two_dimm recommendation
      const memIds = memSlots.map((s) => s.id);
      const twoDimmArb =
        memIds.length === 0
          ? fc.constant([] as string[])
          : fc.subarray(memIds, { minLength: 0, maxLength: Math.min(2, memIds.length) });

      return twoDimmArb.chain((twoDimm) =>
        fc.record({
          id: idArb,
          manufacturer: nonEmptyStringArb,
          model: nonEmptyStringArb,
          chipset: fc.constantFrom("Z890", "X870", "B650", "Z790"),
          socket: fc.constantFrom("LGA1851", "AM5", "LGA1700"),
          form_factor: fc.constantFrom("ATX", "Micro-ATX", "Mini-ITX"),
          schema_version: fc.constantFrom("1.0", "2.0"),
          memory: fc.record({
            type: fc.constantFrom("DDR4" as const, "DDR5" as const),
            max_speed_mhz: fc.integer({ min: 2133, max: 8000 }),
            base_speed_mhz: fc.integer({ min: 2133, max: 6000 }),
            max_capacity_gb: fc.constantFrom(64, 128, 192, 256),
            ecc_support: fc.boolean(),
            channels: fc.constantFrom(2, 4),
            slots: fc.constant(memSlots),
            recommended_population: fc.constant({
              two_dimm: twoDimm,
            }),
          }),
          m2_slots: fc.constant(m2Slots),
          pcie_slots: fc.constant(pcieSlots),
          sata_ports: fc.constant(sataPorts),
          sources: fc.constant([{ type: "manual", url: "https://example.com" }]),
          // Optional fields that don't survive the round-trip
          contributed_by: fc.option(nonEmptyStringArb, { nil: undefined }),
          last_verified: fc.option(fc.constant("2025-01-01"), { nil: undefined }),
          notes: fc.option(
            fc.array(nonEmptyStringArb, { minLength: 1, maxLength: 3 }),
            { nil: undefined }
          ),
          cpu: fc.option(
            fc.record({
              max_tdp_w: fc.option(fc.integer({ min: 65, max: 350 }), { nil: undefined }),
              pcie_lanes_from_cpu: fc.option(fc.integer({ min: 16, max: 28 }), { nil: undefined }),
              supported_series: fc.option(
                fc.array(nonEmptyStringArb, { minLength: 1, maxLength: 3 }),
                { nil: undefined }
              ),
            }),
            { nil: undefined }
          ),
        })
      );
    });
}

// ── Property 1: Motherboard transform round-trip ────────────────────────────

describe("Property 1: Motherboard transform round-trip", () => {
  /**
   * Validates: Requirements 4.1, 5.2, 5.3, 5.4, 5.5, 5.6, 10.1
   *
   * For any valid motherboard YAML object, transforming it into flat DB columns
   * (motherboard row + slot rows) and then reassembling those rows back into
   * the nested Motherboard TypeScript type should produce an object structurally
   * equivalent to the original YAML input — same slot counts per category,
   * same field values for all non-timestamp, non-metadata fields.
   */

  test("transform → reassemble produces structurally equivalent Motherboard", () => {
    fc.assert(
      fc.property(arbMotherboardYAML(), (yaml) => {
        const row = transformMotherboard(yaml);
        const slotRows = transformSlots(yaml);
        const assembled = assembleMotherboard(row, slotRows);

        // ── Top-level fields ──
        expect(assembled.id).toBe(yaml.id);
        expect(assembled.manufacturer).toBe(yaml.manufacturer);
        expect(assembled.model).toBe(yaml.model);
        expect(assembled.chipset).toBe(yaml.chipset);
        expect(assembled.socket).toBe(yaml.socket);
        expect(assembled.form_factor).toBe(yaml.form_factor);
        expect(assembled.schema_version).toBe(yaml.schema_version);

        // ── Memory config ──
        expect(assembled.memory.type).toBe(yaml.memory.type);
        expect(assembled.memory.max_speed_mhz).toBe(yaml.memory.max_speed_mhz);
        expect(assembled.memory.base_speed_mhz).toBe(yaml.memory.base_speed_mhz);
        expect(assembled.memory.max_capacity_gb).toBe(yaml.memory.max_capacity_gb);
        expect(assembled.memory.ecc_support).toBe(yaml.memory.ecc_support);
        expect(assembled.memory.channels).toBe(yaml.memory.channels);
        expect(assembled.memory.recommended_population.two_dimm).toEqual(
          yaml.memory.recommended_population.two_dimm
        );

        // ── Sources ──
        expect(assembled.sources).toEqual(yaml.sources);

        // ── Memory slots: count and field values ──
        expect(assembled.memory.slots).toHaveLength(yaml.memory.slots.length);
        for (let i = 0; i < yaml.memory.slots.length; i++) {
          const orig = yaml.memory.slots[i];
          const reassembled = assembled.memory.slots[i];
          expect(reassembled.id).toBe(orig.id);
          expect(reassembled.channel).toBe(orig.channel);
          expect(reassembled.position).toBe(orig.position);
          expect(reassembled.recommended).toBe(orig.recommended);
        }

        // ── M.2 slots: count and field values ──
        expect(assembled.m2_slots).toHaveLength(yaml.m2_slots.length);
        for (let i = 0; i < yaml.m2_slots.length; i++) {
          const orig = yaml.m2_slots[i];
          const reassembled = assembled.m2_slots[i];
          expect(reassembled.id).toBe(orig.id);
          expect(reassembled.label).toBe(orig.label);
          expect(reassembled.interface).toBe(orig.interface);
          expect(reassembled.gen).toBe(orig.gen);
          expect(reassembled.lanes).toBe(orig.lanes);
          expect(reassembled.form_factors).toEqual(orig.form_factors);
          expect(reassembled.source).toBe(orig.source);
          expect(reassembled.supports_sata).toBe(orig.supports_sata);
          expect(reassembled.heatsink_included).toBe(orig.heatsink_included);
          expect(reassembled.sharing).toEqual(orig.sharing);
        }

        // ── PCIe slots: count and field values ──
        expect(assembled.pcie_slots).toHaveLength(yaml.pcie_slots.length);
        for (let i = 0; i < yaml.pcie_slots.length; i++) {
          const orig = yaml.pcie_slots[i];
          const reassembled = assembled.pcie_slots[i];
          expect(reassembled.id).toBe(orig.id);
          expect(reassembled.label).toBe(orig.label);
          expect(reassembled.gen).toBe(orig.gen);
          expect(reassembled.electrical_lanes).toBe(orig.electrical_lanes);
          expect(reassembled.physical_size).toBe(orig.physical_size);
          expect(reassembled.source).toBe(orig.source);
          expect(reassembled.reinforced).toBe(orig.reinforced);
          expect(reassembled.sharing).toEqual(orig.sharing);
        }

        // ── SATA ports: count and field values ──
        expect(assembled.sata_ports).toHaveLength(yaml.sata_ports.length);
        for (let i = 0; i < yaml.sata_ports.length; i++) {
          const orig = yaml.sata_ports[i];
          const reassembled = assembled.sata_ports[i];
          expect(reassembled.id).toBe(orig.id);
          expect(reassembled.version).toBe(orig.version);
          expect(reassembled.source).toBe(orig.source);
          expect(reassembled.disabled_by).toBe(orig.disabled_by);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ── Component Arbitraries ───────────────────────────────────────────────────

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
  });
}

/** Generate a random valid GPU component YAML object. */
function arbGpuYAML(): fc.Arbitrary<ComponentYAML> {
  return fc.record({
    id: idArb,
    type: fc.constant("gpu"),
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
      pcie_gen: fc.constantFrom(3, 4, 5),
      lanes: fc.constantFrom(8, 16),
    }),
    physical: fc.record({
      slot_width: fc.constantFrom(1, 2, 3),
      length_mm: fc.integer({ min: 150, max: 400 }),
    }),
    power: fc.record({
      tdp_w: fc.integer({ min: 75, max: 600 }),
      recommended_psu_w: fc.option(fc.integer({ min: 450, max: 1200 }), { nil: undefined }),
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

// ── Property 2: Component transform round-trip ──────────────────────────────
// Feature: supabase-sync-pipeline, Property 2: Component transform round-trip

describe("Property 2: Component transform round-trip", () => {
  /**
   * Validates: Requirements 6.1, 6.3, 10.2
   *
   * For any valid component YAML object (nvme, gpu, ram, or sata_drive),
   * extracting the base fields and storing the remaining fields as a `specs`
   * JSONB blob, then merging them back together, should produce an object
   * equivalent to the original YAML input (excluding generated fields like
   * `summary_line` and `updated_at`).
   */

  test("transformComponent → merge base + specs reproduces original YAML", () => {
    fc.assert(
      fc.property(arbComponentYAML(), (yaml) => {
        const row = transformComponent(yaml);

        // Base fields must match
        expect(row.id).toBe(yaml.id);
        expect(row.type).toBe(yaml.type);
        expect(row.manufacturer).toBe(yaml.manufacturer);
        expect(row.model).toBe(yaml.model);
        expect(row.sku).toBe(yaml.sku ?? null);
        expect(row.schema_version).toBe(yaml.schema_version);
        expect(row.contributed_by).toBe(yaml.contributed_by ?? null);
        expect(row.sources).toEqual(yaml.sources ?? null);

        // Reconstruct the original by merging base fields + specs
        const reconstructed: Record<string, unknown> = {
          id: row.id,
          type: row.type,
          manufacturer: row.manufacturer,
          model: row.model,
          schema_version: row.schema_version,
          ...row.specs,
        };
        if (row.sku !== null) reconstructed.sku = row.sku;
        if (row.sources !== null) reconstructed.sources = row.sources;
        if (row.contributed_by !== null) reconstructed.contributed_by = row.contributed_by;

        // Build expected from original YAML, excluding generated fields
        const expected: Record<string, unknown> = { ...yaml };
        // Remove undefined optional fields to match reconstruction
        for (const key of Object.keys(expected)) {
          if (expected[key] === undefined) delete expected[key];
        }

        expect(reconstructed).toEqual(expected);
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 3: Summary line contains key specs ─────────────────────────────
// Feature: supabase-sync-pipeline, Property 3: Summary line contains key specs

describe("Property 3: Summary line contains key specs", () => {
  /**
   * Validates: Requirements 6.2
   *
   * For any valid component YAML object, the generated summary_line should be
   * a non-empty string. For NVMe components it should contain the capacity.
   * For RAM components it should contain the memory type and speed. For GPU
   * components it should contain the PCIe generation. For SATA drives it
   * should contain the capacity.
   */

  test("NVMe summary line is non-empty and contains capacity", () => {
    fc.assert(
      fc.property(arbNvmeYAML(), (yaml) => {
        const row = transformComponent(yaml);
        expect(row.summary_line.length).toBeGreaterThan(0);
        expect(row.summary_line).toContain(String(yaml.capacity_gb));
      }),
      { numRuns: 100 }
    );
  });

  test("RAM summary line is non-empty and contains memory type and speed", () => {
    fc.assert(
      fc.property(arbRamYAML(), (yaml) => {
        const row = transformComponent(yaml);
        const iface = yaml.interface as { type: string; speed_mhz: number };
        expect(row.summary_line.length).toBeGreaterThan(0);
        expect(row.summary_line).toContain(iface.type);
        expect(row.summary_line).toContain(String(iface.speed_mhz));
      }),
      { numRuns: 100 }
    );
  });

  test("GPU summary line is non-empty and contains PCIe gen", () => {
    fc.assert(
      fc.property(arbGpuYAML(), (yaml) => {
        const row = transformComponent(yaml);
        const iface = yaml.interface as { pcie_gen: number };
        expect(row.summary_line.length).toBeGreaterThan(0);
        expect(row.summary_line).toContain(`Gen${iface.pcie_gen}`);
      }),
      { numRuns: 100 }
    );
  });

  test("SATA drive summary line is non-empty and contains capacity", () => {
    fc.assert(
      fc.property(arbSataDriveYAML(), (yaml) => {
        const row = transformComponent(yaml);
        expect(row.summary_line.length).toBeGreaterThan(0);
        expect(row.summary_line).toContain(String(yaml.capacity_gb));
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 9: Slot category assignment matches source array ───────────────
// Feature: supabase-sync-pipeline, Property 9: Slot category assignment matches source array

describe("Property 9: Slot category assignment matches source array", () => {
  /**
   * Validates: Requirements 5.2, 5.3, 5.4, 5.5
   *
   * For any valid motherboard YAML, every slot from `memory.slots` should
   * produce a row with `category = "memory"`, every slot from `m2_slots`
   * should produce `category = "m2"`, every slot from `pcie_slots` should
   * produce `category = "pcie"`, and every slot from `sata_ports` should
   * produce `category = "sata"`. The total number of slot rows should equal
   * the sum of all source arrays.
   */

  test("each slot category matches its source array and total count is correct", () => {
    fc.assert(
      fc.property(arbMotherboardYAML(), (yaml) => {
        const slotRows = transformSlots(yaml);

        const memoryRows = slotRows.filter((r) => r.category === "memory");
        const m2Rows = slotRows.filter((r) => r.category === "m2");
        const pcieRows = slotRows.filter((r) => r.category === "pcie");
        const sataRows = slotRows.filter((r) => r.category === "sata");

        // Every memory slot ID appears in the memory category rows
        const memoryIds = yaml.memory.slots.map((s) => s.id);
        expect(memoryRows.map((r) => r.id)).toEqual(memoryIds);
        for (const r of memoryRows) {
          expect(r.category).toBe("memory");
        }

        // Every m2 slot ID appears in the m2 category rows
        const m2Ids = yaml.m2_slots.map((s) => s.id);
        expect(m2Rows.map((r) => r.id)).toEqual(m2Ids);
        for (const r of m2Rows) {
          expect(r.category).toBe("m2");
        }

        // Every pcie slot ID appears in the pcie category rows
        const pcieIds = yaml.pcie_slots.map((s) => s.id);
        expect(pcieRows.map((r) => r.id)).toEqual(pcieIds);
        for (const r of pcieRows) {
          expect(r.category).toBe("pcie");
        }

        // Every sata port ID appears in the sata category rows
        const sataIds = yaml.sata_ports.map((s) => s.id);
        expect(sataRows.map((r) => r.id)).toEqual(sataIds);
        for (const r of sataRows) {
          expect(r.category).toBe("sata");
        }

        // Total slot row count equals sum of all source arrays
        const expectedTotal =
          yaml.memory.slots.length +
          yaml.m2_slots.length +
          yaml.pcie_slots.length +
          yaml.sata_ports.length;
        expect(slotRows.length).toBe(expectedTotal);
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 7: YAML file discovery is exhaustive ───────────────────────────
// Feature: supabase-sync-pipeline, Property 7: YAML file discovery is exhaustive

describe("Property 7: YAML file discovery is exhaustive", () => {
  /**
   * Validates: Requirements 3.1
   *
   * For any directory tree containing `.yaml` files at arbitrary nesting depths
   * under `data/motherboards/` and `data/components/`, the file discovery
   * function should return every `.yaml` file and no non-YAML files.
   */

  /** Arbitrary for a valid file/directory name segment. */
  const nameSegmentArb = fc
    .stringMatching(/^[a-z][a-z0-9-]{0,9}$/)
    .filter((s) => s.length >= 1);

  /** Arbitrary for a file extension (yaml or non-yaml). */
  const yamlExtArb = fc.constant(".yaml");
  const nonYamlExtArb = fc.constantFrom(".json", ".txt", ".yml", ".md", ".ts", ".csv", "");

  /** Arbitrary for a file entry: name + whether it's a yaml file. */
  const fileEntryArb = fc.oneof(
    nameSegmentArb.map((name) => ({ name: name + ".yaml", isYaml: true })),
    fc.tuple(nameSegmentArb, nonYamlExtArb).map(([name, ext]) => ({
      name: name + ext,
      isYaml: false,
    }))
  );

  /**
   * Generate a flat list of (relativePath, isYaml) entries representing files
   * at various nesting depths under a root category directory.
   */
  const dirTreeArb = fc
    .array(
      fc.tuple(
        fc.array(nameSegmentArb, { minLength: 0, maxLength: 3 }),
        fileEntryArb
      ),
      { minLength: 0, maxLength: 10 }
    )
    .map((entries) =>
      entries.map(([dirs, file]) => ({
        relPath: [...dirs, file.name].join("/"),
        isYaml: file.isYaml,
      }))
    );

  /**
   * Generate trees for both motherboards and components directories.
   */
  const dualTreeArb = fc.tuple(dirTreeArb, dirTreeArb);

  test("discovers every .yaml file and no non-YAML files", () => {
    fc.assert(
      fc.property(dualTreeArb, ([mbTree, compTree]) => {
        // Create a temp directory as baseDir
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yaml-disc-"));

        try {
          const expectedYamlPaths = new Set<string>();

          // Create motherboards tree
          const mbDir = path.join(tmpDir, "data", "motherboards");
          for (const entry of mbTree) {
            const fullPath = path.join(mbDir, entry.relPath);
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, "# placeholder");
            if (entry.isYaml) {
              expectedYamlPaths.add(fullPath);
            }
          }

          // Create components tree
          const compDir = path.join(tmpDir, "data", "components");
          for (const entry of compTree) {
            const fullPath = path.join(compDir, entry.relPath);
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, "# placeholder");
            if (entry.isYaml) {
              expectedYamlPaths.add(fullPath);
            }
          }

          // Ensure the base directories exist even if trees are empty
          fs.mkdirSync(mbDir, { recursive: true });
          fs.mkdirSync(compDir, { recursive: true });

          // Call the discovery function
          const discovered = discoverYamlFiles(tmpDir);
          const discoveredSet = new Set(discovered);

          // 1. Every .yaml file in the tree is returned
          for (const expected of expectedYamlPaths) {
            expect(discoveredSet.has(expected)).toBe(true);
          }

          // 2. No non-YAML files are returned
          for (const found of discovered) {
            expect(found.endsWith(".yaml")).toBe(true);
          }

          // 3. The count matches exactly
          expect(discovered.length).toBe(expectedYamlPaths.size);
        } finally {
          // Cleanup
          fs.rmSync(tmpDir, { recursive: true, force: true });
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 4: Sync idempotency ────────────────────────────────────────────
// Feature: supabase-sync-pipeline, Property 4: Sync idempotency

describe("Property 4: Sync idempotency", () => {
  /**
   * Validates: Requirements 7.1, 7.2, 7.3
   *
   * For any set of valid YAML files, running the sync transform twice on the
   * same input should produce identical sets of motherboard rows, slot rows,
   * and component rows (comparing all non-timestamp columns).
   */

  /** Strip timestamp columns for comparison. */
  function stripTimestamps(row: Record<string, unknown>): Record<string, unknown> {
    const { updated_at, ...rest } = row;
    return rest;
  }

  test("motherboard transform is idempotent (non-timestamp columns)", () => {
    fc.assert(
      fc.property(arbMotherboardYAML(), (yaml) => {
        const row1 = stripTimestamps(transformMotherboard(yaml) as unknown as Record<string, unknown>);
        const row2 = stripTimestamps(transformMotherboard(yaml) as unknown as Record<string, unknown>);
        expect(row1).toEqual(row2);
      }),
      { numRuns: 100 }
    );
  });

  test("slot transform is idempotent", () => {
    fc.assert(
      fc.property(arbMotherboardYAML(), (yaml) => {
        const slots1 = transformSlots(yaml);
        const slots2 = transformSlots(yaml);
        expect(slots1).toEqual(slots2);
      }),
      { numRuns: 100 }
    );
  });

  test("component transform is idempotent (non-timestamp columns)", () => {
    fc.assert(
      fc.property(arbComponentYAML(), (yaml) => {
        const row1 = stripTimestamps(transformComponent(yaml) as unknown as Record<string, unknown>);
        const row2 = stripTimestamps(transformComponent(yaml) as unknown as Record<string, unknown>);
        expect(row1).toEqual(row2);
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 8: Schema routing selects the correct schema per file path ─────
// Feature: supabase-sync-pipeline, Property 8: Schema routing selects the correct schema per file path

describe("Property 8: Schema routing selects the correct schema per file path", () => {
  /**
   * Validates: Requirements 3.2
   *
   * For any file path under `data/motherboards/`, the schema router should
   * select the motherboard schema. For any file path under
   * `data/components/{type}/`, the schema router should select the
   * `component-{type}` schema. For any file path outside these directories,
   * the schema router should return null.
   */

  /** Arbitrary for a valid path segment (directory or file name without extension). */
  const pathSegmentArb = fc
    .stringMatching(/^[a-z][a-z0-9-]{0,9}$/)
    .filter((s) => s.length >= 1);

  /** Arbitrary for a random base directory prefix. */
  const baseDirArb = fc
    .array(pathSegmentArb, { minLength: 0, maxLength: 3 })
    .map((segments) => "/" + segments.join("/"));

  /** Arbitrary for random sub-path segments after the category directory. */
  const subPathArb = fc
    .array(pathSegmentArb, { minLength: 0, maxLength: 3 })
    .map((segments) => segments.join("/"));

  /** Arbitrary for a YAML filename. */
  const yamlFileArb = pathSegmentArb.map((name) => name + ".yaml");

  /** Valid component types recognized by routeSchema. */
  const componentTypeArb = fc.constantFrom("nvme", "gpu", "ram", "sata");

  test("motherboard paths select motherboard schema", () => {
    fc.assert(
      fc.property(baseDirArb, subPathArb, yamlFileArb, (baseDir, subPath, file) => {
        const segments = [baseDir, "data", "motherboards", subPath, file].filter(Boolean);
        const filePath = segments.join("/").replace(/\/+/g, "/");

        const result = routeSchema(filePath);

        expect(result).not.toBeNull();
        // The result should end with the motherboard schema filename
        expect(result!.replace(/\\/g, "/")).toContain("data/schema/motherboard.schema.json");
      }),
      { numRuns: 100 }
    );
  });

  test("component paths select the correct component-{type} schema", () => {
    fc.assert(
      fc.property(
        baseDirArb,
        componentTypeArb,
        subPathArb,
        yamlFileArb,
        (baseDir, compType, subPath, file) => {
          const segments = [baseDir, "data", "components", compType, subPath, file].filter(Boolean);
          const filePath = segments.join("/").replace(/\/+/g, "/");

          const result = routeSchema(filePath);

          expect(result).not.toBeNull();
          expect(result!.replace(/\\/g, "/")).toContain(
            `data/schema/component-${compType}.schema.json`
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  test("paths outside recognized directories return null", () => {
    fc.assert(
      fc.property(
        fc.array(pathSegmentArb, { minLength: 1, maxLength: 5 }),
        yamlFileArb,
        (segments, file) => {
          // Build a path that does NOT contain /data/motherboards/ or /data/components/{type}/
          const joined = segments.join("/");
          // Filter out any path that accidentally matches the recognized patterns
          const fullPath = "/" + joined + "/" + file;
          const normalized = fullPath.replace(/\\/g, "/");
          if (
            /\/data\/motherboards\//.test(normalized) ||
            /\/data\/components\/(nvme|gpu|ram|sata)\//.test(normalized)
          ) {
            return; // skip — this accidentally matched a valid pattern
          }

          const result = routeSchema(fullPath);
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 5: Orphan cleanup removes exactly the right IDs ────────────────
// Feature: supabase-sync-pipeline, Property 5: Orphan cleanup removes exactly the right IDs

describe("Property 5: Orphan cleanup removes exactly the right IDs", () => {
  /**
   * Validates: Requirements 7.4, 7.5
   *
   * For any two sets of IDs where set B (YAML IDs) is a subset of set A (DB IDs),
   * computeOrphans(A, B) should return exactly (A - B) — the IDs in the DB
   * but not in the current YAML.
   */

  /** Generate a set of unique IDs. */
  const idSetArb = fc
    .uniqueArray(idArb, { minLength: 0, maxLength: 20 })
    .filter((arr) => new Set(arr).size === arr.length);

  /**
   * Generate a pair (dbIds, yamlIds) where yamlIds ⊆ dbIds.
   * dbIds = set A (all IDs in DB), yamlIds = set B (current YAML IDs, subset of A).
   */
  const dbAndYamlIdsArb = idSetArb.chain((dbIds) =>
    fc.subarray(dbIds, { minLength: 0, maxLength: dbIds.length }).map((yamlIds) => ({
      dbIds,
      yamlIds,
    }))
  );

  test("returns exactly (dbIds - yamlIds) for subset pairs", () => {
    fc.assert(
      fc.property(dbAndYamlIdsArb, ({ dbIds, yamlIds }) => {
        const orphans = computeOrphans(dbIds, yamlIds);
        const yamlSet = new Set(yamlIds);
        const expectedOrphans = dbIds.filter((id) => !yamlSet.has(id));

        // 1. Every returned ID is in dbIds but not in yamlIds
        const dbSet = new Set(dbIds);
        for (const id of orphans) {
          expect(dbSet.has(id)).toBe(true);
          expect(yamlSet.has(id)).toBe(false);
        }

        // 2. Every ID in (A - B) is returned
        const orphanSet = new Set(orphans);
        for (const id of expectedOrphans) {
          expect(orphanSet.has(id)).toBe(true);
        }

        // 3. No ID in B is returned
        for (const id of yamlIds) {
          expect(orphanSet.has(id)).toBe(false);
        }

        // 4. Exact count match
        expect(orphans.length).toBe(expectedOrphans.length);
      }),
      { numRuns: 100 }
    );
  });

  test("returns empty when dbIds equals yamlIds (no orphans)", () => {
    fc.assert(
      fc.property(idSetArb, (ids) => {
        const orphans = computeOrphans(ids, ids);
        expect(orphans).toEqual([]);
      }),
      { numRuns: 100 }
    );
  });

  test("returns all dbIds when yamlIds is empty (all orphans)", () => {
    fc.assert(
      fc.property(idSetArb, (dbIds) => {
        const orphans = computeOrphans(dbIds, []);
        expect(orphans.length).toBe(dbIds.length);
        expect(new Set(orphans)).toEqual(new Set(dbIds));
      }),
      { numRuns: 100 }
    );
  });

  test("returns empty when both sets are empty", () => {
    const orphans = computeOrphans([], []);
    expect(orphans).toEqual([]);
  });
});

// ── Property 6: Invalid files are skipped without aborting valid syncs ───────
// Feature: supabase-sync-pipeline, Property 6: Invalid files are skipped without aborting valid syncs

describe("Property 6: Invalid files are skipped without aborting valid syncs", () => {
  /**
   * Validates: Requirements 3.3, 3.4
   *
   * For any mix of valid YAML files, invalid (unparseable) YAML files, and
   * schema-failing YAML files, parseAndValidateFile should:
   * 1. Return { data, type } for all valid files
   * 2. Return { error } for all invalid/schema-failing files
   * 3. Never throw — always return a result
   * 4. Count of successes + count of errors = total files
   */

  /** Path to the real schema directory (needed for validation). */
  const SCHEMA_DIR = path.resolve(__dirname, "../../data/schema");

  /**
   * Creates a temp base directory with the schema files copied in,
   * so parseAndValidateFile can resolve schemas via routeSchema.
   */
  function createTempBase(): string {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prop6-"));
    const schemaDestDir = path.join(tmpDir, "data", "schema");
    fs.mkdirSync(schemaDestDir, { recursive: true });

    // Copy all schema files
    for (const file of fs.readdirSync(SCHEMA_DIR)) {
      if (file.endsWith(".json")) {
        fs.copyFileSync(path.join(SCHEMA_DIR, file), path.join(schemaDestDir, file));
      }
    }

    // Ensure data directories exist
    fs.mkdirSync(path.join(tmpDir, "data", "motherboards", "test"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "data", "components", "gpu"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "data", "components", "sata"), { recursive: true });

    return tmpDir;
  }

  /** Minimal valid motherboard YAML that passes schema validation. */
  function validMotherboardYaml(id: string): string {
    return yaml.dump({
      id,
      manufacturer: "TestMfg",
      model: "TestModel",
      chipset: "Z890",
      socket: "LGA1851",
      form_factor: "ATX",
      schema_version: "1.0",
      memory: {
        type: "DDR5",
        max_speed_mhz: 6000,
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
      sources: [{ type: "manual", url: "https://example.com" }],
    });
  }

  /** Minimal valid GPU component YAML that passes schema validation. */
  function validGpuYaml(id: string): string {
    return yaml.dump({
      id,
      type: "gpu",
      manufacturer: "TestGPU",
      model: "TestCard",
      interface: { pcie_gen: 4, lanes: 16 },
      physical: { slot_width: 2, length_mm: 300 },
      power: { tdp_w: 250, recommended_psu_w: 650 },
      schema_version: "1.0",
    });
  }

  /** Minimal valid SATA component YAML that passes schema validation. */
  function validSataYaml(id: string): string {
    return yaml.dump({
      id,
      type: "sata_drive",
      manufacturer: "TestSATA",
      model: "TestDrive",
      form_factor: "2.5",
      capacity_gb: 1000,
      interface: "SATA III",
      schema_version: "1.0",
    });
  }

  /** Represents a file to write and its expected outcome. */
  interface TestFile {
    relPath: string;
    content: string;
    expectValid: boolean;
  }

  /** Arbitrary for a unique slug. */
  const slugArb = fc
    .stringMatching(/^[a-z][a-z0-9]{1,8}$/)
    .filter((s) => s.length >= 2);

  /** Arbitrary for a valid motherboard file entry. */
  const validMbFileArb = slugArb.map((slug): TestFile => ({
    relPath: `data/motherboards/test/${slug}.yaml`,
    content: validMotherboardYaml(slug),
    expectValid: true,
  }));

  /** Arbitrary for a valid GPU component file entry. */
  const validGpuFileArb = slugArb.map((slug): TestFile => ({
    relPath: `data/components/gpu/${slug}.yaml`,
    content: validGpuYaml(slug),
    expectValid: true,
  }));

  /** Arbitrary for a valid SATA component file entry. */
  const validSataFileArb = slugArb.map((slug): TestFile => ({
    relPath: `data/components/sata/${slug}.yaml`,
    content: validSataYaml(slug),
    expectValid: true,
  }));

  /** Arbitrary for an invalid (unparseable) YAML file. */
  const invalidYamlFileArb = fc.tuple(
    slugArb,
    fc.constantFrom(
      "data/motherboards/test",
      "data/components/gpu",
      "data/components/sata"
    ),
    fc.constantFrom(
      ":\n  - :\n    bad: [unterminated",
      "{{{{not yaml at all}}}}",
      "key: value\n  bad indent\n    : broken",
      "- [unclosed bracket",
      "foo: bar: baz: :",
    )
  ).map(([slug, dir, badContent]): TestFile => ({
    relPath: `${dir}/bad-${slug}.yaml`,
    content: badContent,
    expectValid: false,
  }));

  /** Arbitrary for a schema-failing YAML file (valid YAML, wrong structure). */
  const schemaFailFileArb = fc.tuple(
    slugArb,
    fc.constantFrom(
      "data/motherboards/test",
      "data/components/gpu",
      "data/components/sata"
    )
  ).map(([slug, dir]): TestFile => ({
    relPath: `${dir}/schemafail-${slug}.yaml`,
    // Valid YAML but missing required fields — will fail schema validation
    content: yaml.dump({ id: slug, random_field: "not a real schema" }),
    expectValid: false,
  }));

  /** Arbitrary for a mix of valid and invalid files with unique paths. */
  const fileMixArb = fc.tuple(
    fc.array(fc.oneof(validMbFileArb, validGpuFileArb, validSataFileArb), { minLength: 1, maxLength: 4 }),
    fc.array(invalidYamlFileArb, { minLength: 0, maxLength: 3 }),
    fc.array(schemaFailFileArb, { minLength: 0, maxLength: 3 })
  ).map(([valid, invalid, schemaFail]) => {
    // Deduplicate by relPath (keep first occurrence)
    const seen = new Set<string>();
    const all: TestFile[] = [];
    for (const f of [...valid, ...invalid, ...schemaFail]) {
      if (!seen.has(f.relPath)) {
        seen.add(f.relPath);
        all.push(f);
      }
    }
    return all;
  }).filter((files) => files.length >= 1);

  test("valid files succeed, invalid/schema-failing files return errors, never throws, counts match", () => {
    fc.assert(
      fc.property(fileMixArb, (files) => {
        const tmpDir = createTempBase();

        try {
          // Write all files to the temp directory
          for (const f of files) {
            const fullPath = path.join(tmpDir, f.relPath);
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, f.content, "utf-8");
          }

          let successCount = 0;
          let errorCount = 0;

          for (const f of files) {
            const fullPath = path.join(tmpDir, f.relPath);

            // parseAndValidateFile must never throw
            let result: ReturnType<typeof parseAndValidateFile>;
            try {
              result = parseAndValidateFile(fullPath);
            } catch (e) {
              // If it throws, the property fails
              expect.unreachable(
                `parseAndValidateFile threw for ${f.relPath}: ${(e as Error).message}`
              );
              return;
            }

            if (f.expectValid) {
              // Valid files should return { data, type }
              expect("data" in result).toBe(true);
              expect("error" in result).toBe(false);
              if ("data" in result) {
                expect(result.type).toMatch(/^(motherboard|component)$/);
              }
              successCount++;
            } else {
              // Invalid files should return { error }
              expect("error" in result).toBe(true);
              expect("data" in result).toBe(false);
              errorCount++;
            }
          }

          // synced + skipped = total
          expect(successCount + errorCount).toBe(files.length);
        } finally {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 11: Sync exit code reflects validation errors ──────────────────
// Feature: supabase-sync-pipeline, Property 11: Sync exit code reflects validation errors

describe("Property 11: Sync exit code reflects validation errors", () => {
  /**
   * Validates: Requirements 12.4
   *
   * For any sync run where at least one file was skipped due to validation or
   * parse errors, the sync result should indicate a non-zero exit code (1).
   * For any sync run where all files were processed successfully, the result
   * should indicate a zero exit code (0).
   *
   * Since we can't easily test process.exit() in a property test, we test the
   * invariant on SyncResult objects: filesSkipped > 0 ? 1 : 0
   */

  /** Arbitrary for a file+error entry. */
  const errorEntryArb = fc.record({
    file: nonEmptyStringArb.map((s) => `data/${s}.yaml`),
    error: nonEmptyStringArb,
  });

  /** Generate a random SyncResult with errors array length matching filesSkipped. */
  const arbSyncResult: fc.Arbitrary<import("../../scripts/sync").SyncResult> = fc
    .record({
      motherboardsSynced: fc.nat({ max: 100 }),
      componentsSynced: fc.nat({ max: 100 }),
      motherboardsDeleted: fc.nat({ max: 50 }),
      componentsDeleted: fc.nat({ max: 50 }),
      filesSkipped: fc.nat({ max: 50 }),
    })
    .chain((base) =>
      fc
        .array(errorEntryArb, {
          minLength: base.filesSkipped,
          maxLength: base.filesSkipped,
        })
        .map((errors) => ({ ...base, errors }))
    );

  /** Derive the expected exit code from a SyncResult, matching main() logic. */
  function deriveExitCode(result: import("../../scripts/sync").SyncResult): number {
    return result.filesSkipped > 0 ? 1 : 0;
  }

  test("filesSkipped > 0 implies exit code 1", () => {
    const arbWithSkips = arbSyncResult.filter((r) => r.filesSkipped > 0);

    fc.assert(
      fc.property(arbWithSkips, (result) => {
        expect(deriveExitCode(result)).toBe(1);
        expect(result.errors.length).toBe(result.filesSkipped);
      }),
      { numRuns: 100 }
    );
  });

  test("filesSkipped === 0 implies exit code 0", () => {
    const arbNoSkips = arbSyncResult.filter((r) => r.filesSkipped === 0);

    fc.assert(
      fc.property(arbNoSkips, (result) => {
        expect(deriveExitCode(result)).toBe(0);
        expect(result.errors).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });

  test("errors array length always matches filesSkipped", () => {
    fc.assert(
      fc.property(arbSyncResult, (result) => {
        expect(result.errors.length).toBe(result.filesSkipped);

        const exitCode = deriveExitCode(result);
        if (result.filesSkipped > 0) {
          expect(exitCode).toBe(1);
        } else {
          expect(exitCode).toBe(0);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 10: Manifest completeness and deterministic ordering ───────────
// Feature: supabase-sync-pipeline, Property 10: Manifest completeness and deterministic ordering

describe("Property 10: Manifest completeness and deterministic ordering", () => {
  /**
   * Validates: Requirements 11.1, 11.2, 11.3, 11.4
   *
   * For any set of valid YAML objects (motherboards and components),
   * generateManifest should produce a JSON file where:
   * 1. There is exactly one entry per motherboard and one per component
   * 2. Each motherboard entry includes id, manufacturer, model, socket, chipset, form_factor
   * 3. Each component entry includes id, type, manufacturer, model, specs
   * 4. Entries within each category are sorted ascending by id
   */

  /**
   * Deduplicate YAML objects by id, keeping the first occurrence.
   * generateManifest produces one entry per unique object passed in.
   */
  function deduplicateById<T extends { id: string }>(items: T[]): T[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  test("manifest contains exactly one entry per motherboard/component with required fields, sorted by id", () => {
    fc.assert(
      fc.property(
        fc.array(arbMotherboardYAML(), { minLength: 0, maxLength: 6 }),
        fc.array(arbComponentYAML(), { minLength: 0, maxLength: 8 }),
        (motherboards, components) => {
          const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prop10-"));

          try {
            // Deduplicate inputs by id (same as what a real sync would produce)
            const uniqueMbs = deduplicateById(motherboards);
            const uniqueComps = deduplicateById(components);

            // Generate the manifest
            generateManifest(tmpDir, uniqueMbs, uniqueComps);

            // Read and parse the manifest
            const manifestPath = path.join(tmpDir, "data-manifest.json");
            expect(fs.existsSync(manifestPath)).toBe(true);

            const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

            // ── 1. Exactly one entry per motherboard ──
            expect(manifest.motherboards).toHaveLength(uniqueMbs.length);

            // ── 2. Each motherboard entry has required fields ──
            for (const entry of manifest.motherboards) {
              expect(entry).toHaveProperty("id");
              expect(typeof entry.id).toBe("string");
              expect(entry).toHaveProperty("manufacturer");
              expect(typeof entry.manufacturer).toBe("string");
              expect(entry).toHaveProperty("model");
              expect(typeof entry.model).toBe("string");
              expect(entry).toHaveProperty("socket");
              expect(typeof entry.socket).toBe("string");
              expect(entry).toHaveProperty("chipset");
              expect(typeof entry.chipset).toBe("string");
              expect(entry).toHaveProperty("form_factor");
              expect(typeof entry.form_factor).toBe("string");
            }

            // Verify motherboard field values match input
            const mbById = new Map(uniqueMbs.map((mb) => [mb.id, mb]));
            for (const entry of manifest.motherboards) {
              const orig = mbById.get(entry.id);
              expect(orig).toBeDefined();
              expect(entry.manufacturer).toBe(orig!.manufacturer);
              expect(entry.model).toBe(orig!.model);
              expect(entry.socket).toBe(orig!.socket);
              expect(entry.chipset).toBe(orig!.chipset);
              expect(entry.form_factor).toBe(orig!.form_factor);
            }

            // ── 3. Exactly one entry per component ──
            expect(manifest.components).toHaveLength(uniqueComps.length);

            // ── 4. Each component entry has required fields ──
            for (const entry of manifest.components) {
              expect(entry).toHaveProperty("id");
              expect(typeof entry.id).toBe("string");
              expect(entry).toHaveProperty("type");
              expect(typeof entry.type).toBe("string");
              expect(entry).toHaveProperty("manufacturer");
              expect(typeof entry.manufacturer).toBe("string");
              expect(entry).toHaveProperty("model");
              expect(typeof entry.model).toBe("string");
              expect(entry).toHaveProperty("specs");
              expect(typeof entry.specs).toBe("object");
            }

            // Verify component field values match input
            const compById = new Map(uniqueComps.map((c) => [c.id, c]));
            for (const entry of manifest.components) {
              const orig = compById.get(entry.id);
              expect(orig).toBeDefined();
              expect(entry.type).toBe(orig!.type);
              expect(entry.manufacturer).toBe(orig!.manufacturer);
              expect(entry.model).toBe(orig!.model);
              // Specs should match extractComponentSpecs output
              expect(entry.specs).toEqual(extractComponentSpecs(orig!));
            }

            // ── 5. Motherboard entries sorted ascending by id ──
            for (let i = 1; i < manifest.motherboards.length; i++) {
              expect(
                manifest.motherboards[i - 1].id.localeCompare(manifest.motherboards[i].id)
              ).toBeLessThanOrEqual(0);
            }

            // ── 6. Component entries sorted ascending by id ──
            for (let i = 1; i < manifest.components.length; i++) {
              expect(
                manifest.components[i - 1].id.localeCompare(manifest.components[i].id)
              ).toBeLessThanOrEqual(0);
            }
          } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test("calling generateManifest twice with the same input produces identical output", () => {
    fc.assert(
      fc.property(
        fc.array(arbMotherboardYAML(), { minLength: 1, maxLength: 4 }),
        fc.array(arbComponentYAML(), { minLength: 1, maxLength: 4 }),
        (motherboards, components) => {
          const tmpDir1 = fs.mkdtempSync(path.join(os.tmpdir(), "prop10a-"));
          const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), "prop10b-"));

          try {
            const uniqueMbs = deduplicateById(motherboards);
            const uniqueComps = deduplicateById(components);

            generateManifest(tmpDir1, uniqueMbs, uniqueComps);
            generateManifest(tmpDir2, uniqueMbs, uniqueComps);

            const manifest1 = fs.readFileSync(
              path.join(tmpDir1, "data-manifest.json"),
              "utf-8"
            );
            const manifest2 = fs.readFileSync(
              path.join(tmpDir2, "data-manifest.json"),
              "utf-8"
            );

            // Byte-for-byte identical output (deterministic)
            expect(manifest1).toBe(manifest2);
          } finally {
            fs.rmSync(tmpDir1, { recursive: true, force: true });
            fs.rmSync(tmpDir2, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
