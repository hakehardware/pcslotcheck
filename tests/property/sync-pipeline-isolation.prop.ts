// @vitest-environment node
// Feature: hydration-mismatch-fix, Property 2: Preservation - Sync Pipeline Environment Isolation
//
// These preservation tests validate that the sync pipeline transforms produce
// correct, consistent results in a Node.js environment, isolated from any
// React/jsdom state. They run BEFORE the fix is applied to confirm baseline
// behavior, and AFTER the fix to confirm no regressions.

import { describe, test, expect } from "vitest";
import * as fc from "fast-check";
import {
  transformMotherboard,
  transformSlots,
  transformComponent,
} from "../../scripts/sync";
import { reconstructComponent } from "../../src/lib/db-types";
import type { MotherboardYAML, ComponentYAML } from "../../scripts/sync";
import type { SharingRule } from "../../src/lib/types";

// -- Arbitraries (reused patterns from supabase-sync-pipeline.prop.ts) --------

const idArb = fc
  .stringMatching(/^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$/)
  .filter((s) => s.length >= 2);

const nonEmptyStringArb = fc
  .stringMatching(/^[A-Za-z0-9][A-Za-z0-9 _-]{0,19}$/)
  .filter((s) => s.length >= 1);

const sharingRuleArb: fc.Arbitrary<SharingRule> = fc.record({
  type: fc.constantFrom("disables" as const, "bandwidth_split" as const),
  targets: fc.option(fc.array(idArb, { minLength: 1, maxLength: 3 }), { nil: undefined }),
  target: fc.option(idArb, { nil: undefined }),
  condition: nonEmptyStringArb,
  effect: fc.option(nonEmptyStringArb, { nil: undefined }),
});

function arbMemorySlot(slotId: string) {
  return fc.record({
    id: fc.constant(slotId),
    channel: fc.constantFrom("A" as const, "B" as const),
    position: fc.integer({ min: 1, max: 4 }),
    recommended: fc.boolean(),
  });
}

const arbMemorySlots = fc
  .integer({ min: 0, max: 8 })
  .chain((count): fc.Arbitrary<{ id: string; channel: "A" | "B"; position: number; recommended: boolean }[]> => {
    if (count === 0) return fc.constant([]);
    const ids = Array.from({ length: count }, (_, i) => `dimm_${i + 1}`);
    return fc.tuple(...ids.map((id) => arbMemorySlot(id))) as fc.Arbitrary<
      { id: string; channel: "A" | "B"; position: number; recommended: boolean }[]
    >;
  });

function arbM2Slot(slotId: string) {
  return fc.record({
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

const arbM2Slots = fc
  .integer({ min: 0, max: 4 })
  .chain((count): fc.Arbitrary<MotherboardYAML["m2_slots"]> => {
    if (count === 0) return fc.constant([] as unknown as MotherboardYAML["m2_slots"]);
    const ids = Array.from({ length: count }, (_, i) => `m2_${i + 1}`);
    return fc.tuple(...ids.map((id) => arbM2Slot(id))) as unknown as fc.Arbitrary<
      MotherboardYAML["m2_slots"]
    >;
  });

function arbPCIeSlot(slotId: string, position: number) {
  return fc.record({
    id: fc.constant(slotId),
    label: nonEmptyStringArb,
    gen: fc.constantFrom(3, 4, 5),
    electrical_lanes: fc.constantFrom(1, 4, 8, 16),
    physical_size: fc.constantFrom("x1" as const, "x4" as const, "x8" as const, "x16" as const),
    position: fc.constant(position),
    source: fc.constantFrom("CPU" as const, "Chipset" as const),
    reinforced: fc.boolean(),
    sharing: fc.option(fc.array(sharingRuleArb, { minLength: 1, maxLength: 2 }), { nil: null }),
  });
}

const arbPCIeSlots = fc
  .integer({ min: 0, max: 4 })
  .chain((count): fc.Arbitrary<MotherboardYAML["pcie_slots"]> => {
    if (count === 0) return fc.constant([] as unknown as MotherboardYAML["pcie_slots"]);
    const ids = Array.from({ length: count }, (_, i) => `pcie_${i + 1}`);
    return fc.tuple(...ids.map((id, i) => arbPCIeSlot(id, i + 1))) as fc.Arbitrary<
      MotherboardYAML["pcie_slots"]
    >;
  });

function arbSATAPort(slotId: string) {
  return fc.record({
    id: fc.constant(slotId),
    version: fc.constantFrom("SATA III", "SATA II"),
    source: fc.constantFrom("CPU" as const, "Chipset" as const),
    disabled_by: fc.option(idArb, { nil: null }),
  });
}

const arbSATAPorts = fc
  .integer({ min: 0, max: 6 })
  .chain((count): fc.Arbitrary<MotherboardYAML["sata_ports"]> => {
    if (count === 0) return fc.constant([] as unknown as MotherboardYAML["sata_ports"]);
    const ids = Array.from({ length: count }, (_, i) => `sata_${i + 1}`);
    return fc.tuple(...ids.map((id) => arbSATAPort(id))) as fc.Arbitrary<
      MotherboardYAML["sata_ports"]
    >;
  });

function arbMotherboardYAML(): fc.Arbitrary<MotherboardYAML> {
  return fc
    .tuple(arbMemorySlots, arbM2Slots, arbPCIeSlots, arbSATAPorts)
    .chain(([memSlots, m2Slots, pcieSlots, sataPorts]) => {
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
            recommended_population: fc.constant({ two_dimm: twoDimm }),
          }),
          m2_slots: fc.constant(m2Slots),
          pcie_slots: fc.constant(pcieSlots),
          sata_ports: fc.constant(sataPorts),
          sources: fc.constant([{ type: "manual", url: "https://example.com" }]),
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

// -- Component Arbitraries ----------------------------------------------------

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

function arbComponentYAML(): fc.Arbitrary<ComponentYAML> {
  return fc.oneof(arbNvmeYAML(), arbGpuYAML(), arbRamYAML(), arbSataDriveYAML());
}

// -- Property Tests -----------------------------------------------------------

describe("Property 2: Preservation - Sync Pipeline Environment Isolation", () => {
  /**
   * Validates: Requirements 2.3, 3.1, 3.2, 3.4
   *
   * For all generated motherboard YAML inputs, transformMotherboard and
   * transformSlots produce consistent results in a Node.js environment.
   * This confirms the sync pipeline logic is correct and isolated from
   * any React/jsdom environment contamination.
   */

  test("transformMotherboard and transformSlots produce consistent results in Node.js", () => {
    fc.assert(
      fc.property(arbMotherboardYAML(), (mbYaml) => {
        // Transform the motherboard YAML into a flat DB row
        const row = transformMotherboard(mbYaml);

        // Core identity fields must match the input
        expect(row.id).toBe(mbYaml.id);
        expect(row.manufacturer).toBe(mbYaml.manufacturer);
        expect(row.model).toBe(mbYaml.model);
        expect(row.chipset).toBe(mbYaml.chipset);
        expect(row.socket).toBe(mbYaml.socket);
        expect(row.form_factor).toBe(mbYaml.form_factor);

        // Memory fields must be flattened correctly
        expect(row.memory_type).toBe(mbYaml.memory.type);
        expect(row.memory_max_speed_mhz).toBe(mbYaml.memory.max_speed_mhz);
        expect(row.memory_base_speed_mhz).toBe(mbYaml.memory.base_speed_mhz);
        expect(row.memory_max_capacity_gb).toBe(mbYaml.memory.max_capacity_gb);
        expect(row.memory_ecc_support).toBe(mbYaml.memory.ecc_support);
        expect(row.memory_channels).toBe(mbYaml.memory.channels);
        expect(row.memory_recommended_2dimm).toEqual(
          mbYaml.memory.recommended_population.two_dimm
        );

        // Transform slots and verify counts per category
        const slotRows = transformSlots(mbYaml);
        const expectedTotal =
          mbYaml.memory.slots.length +
          mbYaml.m2_slots.length +
          mbYaml.pcie_slots.length +
          mbYaml.sata_ports.length;
        expect(slotRows.length).toBe(expectedTotal);

        // Every slot row references the correct motherboard
        for (const slot of slotRows) {
          expect(slot.motherboard_id).toBe(mbYaml.id);
        }

        // Category counts match source arrays
        const memorySlots = slotRows.filter((r) => r.category === "memory");
        const m2Slots = slotRows.filter((r) => r.category === "m2");
        const pcieSlots = slotRows.filter((r) => r.category === "pcie");
        const sataSlots = slotRows.filter((r) => r.category === "sata");

        expect(memorySlots.length).toBe(mbYaml.memory.slots.length);
        expect(m2Slots.length).toBe(mbYaml.m2_slots.length);
        expect(pcieSlots.length).toBe(mbYaml.pcie_slots.length);
        expect(sataSlots.length).toBe(mbYaml.sata_ports.length);

        // Running the same transform again produces identical results
        // (idempotency within a single Node.js process)
        const row2 = transformMotherboard(mbYaml);
        const slotRows2 = transformSlots(mbYaml);

        // Compare non-timestamp fields
        const { updated_at: _ts1, ...rowFields } = row;
        const { updated_at: _ts2, ...rowFields2 } = row2;
        expect(rowFields).toEqual(rowFields2);
        expect(slotRows).toEqual(slotRows2);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Validates: Requirements 2.3, 3.4
   *
   * For all generated component YAML inputs, transformComponent and
   * reconstructComponent produce round-trip equivalent results in a
   * Node.js environment. The reconstructed component should match the
   * original YAML (excluding metadata fields like sku, sources,
   * contributed_by, summary_line, and updated_at).
   */

  test("transformComponent and reconstructComponent produce round-trip equivalent results in Node.js", () => {
    /** Recursively normalize: convert null to undefined, then strip undefined keys. */
    function normalize(obj: unknown): unknown {
      if (obj === null || obj === undefined) return undefined;
      if (Array.isArray(obj)) return obj.map(normalize);
      if (typeof obj === "object") {
        const result: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
          const normalized = normalize(val);
          if (normalized !== undefined) result[key] = normalized;
        }
        return result;
      }
      return obj;
    }

    fc.assert(
      fc.property(arbComponentYAML(), (compYaml) => {
        // Transform YAML to a per-type DB row
        const row = transformComponent(compYaml);

        // Base fields must match
        expect(row.id).toBe(compYaml.id);
        expect(row.type).toBe(compYaml.type);
        expect(row.manufacturer).toBe(compYaml.manufacturer);
        expect(row.model).toBe(compYaml.model);

        // Reconstruct the Component union from the per-type row
        const reconstructed = reconstructComponent(row);

        // Build expected from original YAML, excluding metadata/generated fields
        const expected: Record<string, unknown> = { ...compYaml };
        delete expected.sku;
        delete expected.sources;
        delete expected.contributed_by;
        delete expected.summary_line;
        delete expected.updated_at;

        // Normalize both sides: null and undefined are equivalent for optional fields
        expect(normalize(reconstructed)).toEqual(normalize(expected));

        // Running the same transform again produces identical results
        const row2 = transformComponent(compYaml);
        const { updated_at: _ts1, ...rowFields } = row;
        const { updated_at: _ts2, ...rowFields2 } = row2;
        expect(rowFields).toEqual(rowFields2);
      }),
      { numRuns: 100 }
    );
  });
});
