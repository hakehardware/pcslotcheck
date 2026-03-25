// Shared fast-check generators for RAM kit slot assignment property tests.
//
// These generators produce realistic but varied data for thorough property
// testing of the stick-level RAM assignment feature.

import * as fc from "fast-check";
import type { RAMComponent, MemoryConfig, MemorySlot } from "../types";

// -- Helpers ------------------------------------------------------------------

const STICK_SEPARATOR = "__stick_";

const DDR_TYPES = ["DDR4", "DDR5"] as const;
const MODULE_COUNTS = [1, 2, 4] as const;
const PER_MODULE_GB_OPTIONS = [4, 8, 16, 32] as const;
const MAX_CAPACITY_OPTIONS = [64, 128, 192, 256] as const;

const MANUFACTURERS = [
  "Corsair",
  "G.Skill",
  "Kingston",
  "Crucial",
  "TeamGroup",
  "Patriot",
];

const MODEL_PREFIXES = [
  "Vengeance",
  "Trident Z5",
  "Fury Beast",
  "Ballistix",
  "T-Force Delta",
  "Viper",
];

/** Kebab-case ID arbitrary that mimics real component IDs. */
const kebabSegmentArb = fc
  .stringMatching(/^[a-z][a-z0-9]{1,8}$/)
  .filter((s) => s.length >= 2);

// -- Public generators --------------------------------------------------------

/**
 * Generates a RAMComponent with realistic field values.
 *
 * The generated ID follows the kebab-case pattern used by real component files
 * (e.g., "corsair-vengeance-ddr5-6000-32gb"). The capacity object is always
 * internally consistent: total_gb === per_module_gb * modules.
 */
export function arbRAMComponent(): fc.Arbitrary<RAMComponent> {
  return fc
    .record({
      manufacturer: fc.constantFrom(...MANUFACTURERS),
      modelPrefix: fc.constantFrom(...MODEL_PREFIXES),
      ddrType: fc.constantFrom(...DDR_TYPES),
      speedMhz: fc.constantFrom(3200, 3600, 4800, 5200, 5600, 6000, 6400, 7200),
      baseSpeedMhz: fc.constantFrom(2133, 2400, 3200, 4800),
      perModuleGb: fc.constantFrom(...PER_MODULE_GB_OPTIONS),
      modules: fc.constantFrom(...MODULE_COUNTS),
      idSuffix: kebabSegmentArb,
    })
    .map(
      ({
        manufacturer,
        modelPrefix,
        ddrType,
        speedMhz,
        baseSpeedMhz,
        perModuleGb,
        modules,
        idSuffix,
      }) => {
        const totalGb = perModuleGb * modules;
        const id = [
          manufacturer.toLowerCase().replace(/[^a-z0-9]/g, ""),
          modelPrefix.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          ddrType.toLowerCase(),
          String(speedMhz),
          `${totalGb}gb`,
          idSuffix,
        ].join("-");

        return {
          id,
          type: "ram" as const,
          manufacturer,
          model: `${modelPrefix} ${ddrType}-${speedMhz} ${totalGb}GB (${modules}x${perModuleGb}GB)`,
          interface: {
            type: ddrType,
            speed_mhz: speedMhz,
            base_speed_mhz: baseSpeedMhz,
          },
          capacity: {
            per_module_gb: perModuleGb,
            modules,
            total_gb: totalGb,
          },
          schema_version: "1.0",
        } satisfies RAMComponent;
      }
    );
}


/**
 * Generates a MemoryConfig with a realistic set of DIMM slots.
 *
 * Always produces 2 channels (A and B) with 2 or 4 total slots. Slot IDs
 * follow the dimm_{channel}{position} convention used by real motherboard
 * YAML files. The recommended_population lists are consistent with the
 * generated slot set.
 */
export function arbMemoryConfig(): fc.Arbitrary<MemoryConfig> {
  return fc
    .record({
      ddrType: fc.constantFrom(...DDR_TYPES),
      maxCapacityGb: fc.constantFrom(...MAX_CAPACITY_OPTIONS),
      maxSpeedMhz: fc.constantFrom(3200, 4800, 5600, 6000, 6400, 7200, 9200),
      baseSpeedMhz: fc.constantFrom(2133, 2400, 3200, 4800),
      eccSupport: fc.boolean(),
      slotCount: fc.constantFrom(2, 4) as fc.Arbitrary<2 | 4>,
    })
    .map(
      ({
        ddrType,
        maxCapacityGb,
        maxSpeedMhz,
        baseSpeedMhz,
        eccSupport,
        slotCount,
      }) => {
        const slots: MemorySlot[] = [];

        // Channel A slots
        for (let pos = 1; pos <= slotCount / 2; pos++) {
          slots.push({
            id: `dimm_a${pos}`,
            channel: "A",
            position: pos,
            // Position 2 is typically recommended (farther from CPU)
            recommended: pos === 2 || slotCount === 2,
          });
        }

        // Channel B slots
        for (let pos = 1; pos <= slotCount / 2; pos++) {
          slots.push({
            id: `dimm_b${pos}`,
            channel: "B",
            position: pos,
            recommended: pos === 2 || slotCount === 2,
          });
        }

        // Build recommended population based on slot count
        const twoDimm =
          slotCount === 4
            ? ["dimm_a2", "dimm_b2"]
            : ["dimm_a1", "dimm_b1"];

        const fourDimm: string[] | undefined =
          slotCount === 4
            ? ["dimm_a2", "dimm_b2", "dimm_a1", "dimm_b1"]
            : undefined;

        const config: MemoryConfig = {
          type: ddrType,
          max_speed_mhz: maxSpeedMhz,
          base_speed_mhz: baseSpeedMhz,
          max_capacity_gb: maxCapacityGb,
          ecc_support: eccSupport,
          channels: 2,
          slots,
          recommended_population: {
            two_dimm: twoDimm,
            ...(fourDimm ? { four_dimm: fourDimm } : {}),
          },
        };

        return config;
      }
    );
}

/**
 * Generates stick-to-slot assignment maps for a single kit.
 *
 * Produces a partial or full mapping of DIMM slot IDs to synthetic stick IDs
 * for the given kit. Each stick ID follows the `{kitId}__stick_{n}` pattern.
 * The number of assigned sticks ranges from 0 to `modules`.
 *
 * @param kitId     - The component ID of the RAM kit
 * @param modules   - Number of sticks in the kit (1, 2, or 4)
 * @param slotIds   - Available DIMM slot IDs to assign sticks to
 */
export function arbStickAssignments(
  kitId: string,
  modules: number,
  slotIds: string[]
): fc.Arbitrary<Record<string, string>> {
  if (slotIds.length === 0 || modules === 0) {
    return fc.constant({});
  }

  // Pick a subset of slots (up to modules count) in random order
  const maxAssignable = Math.min(modules, slotIds.length);

  return fc
    .integer({ min: 0, max: maxAssignable })
    .chain((assignCount) => {
      if (assignCount === 0) return fc.constant({});

      return fc
        .shuffledSubarray(slotIds, {
          minLength: assignCount,
          maxLength: assignCount,
        })
        .map((chosenSlots) => {
          const assignments: Record<string, string> = {};
          for (let i = 0; i < chosenSlots.length; i++) {
            assignments[chosenSlots[i]] =
              `${kitId}${STICK_SEPARATOR}${i + 1}`;
          }
          return assignments;
        });
    });
}

/**
 * Generates stick-to-slot assignments across multiple kits with no slot
 * conflicts.
 *
 * Each kit gets a disjoint subset of the available slots. The total number
 * of assigned sticks across all kits never exceeds the number of available
 * slots.
 *
 * @param kitIds    - Array of component IDs for each kit
 * @param modules   - Array of module counts, one per kit (parallel to kitIds)
 * @param slotIds   - Available DIMM slot IDs
 */
export function arbMultiKitAssignments(
  kitIds: string[],
  modules: number[],
  slotIds: string[]
): fc.Arbitrary<Record<string, string>> {
  if (kitIds.length === 0 || slotIds.length === 0) {
    return fc.constant({});
  }

  // Shuffle the available slots, then greedily partition them across kits
  return fc.shuffledSubarray(slotIds, { minLength: 0, maxLength: slotIds.length }).chain(
    (shuffledSlots) => {
      // For each kit, decide how many sticks to assign (0..min(modules, remaining))
      // We build this iteratively using chain to thread remaining slots through
      let remaining = [...shuffledSlots];
      const kitArbs: fc.Arbitrary<Record<string, string>>[] = [];

      for (let k = 0; k < kitIds.length; k++) {
        const kitId = kitIds[k];
        const kitModules = modules[k];
        const maxForKit = Math.min(kitModules, remaining.length);

        if (maxForKit === 0) {
          kitArbs.push(fc.constant({}));
          continue;
        }

        // Take up to maxForKit slots from the remaining pool for this kit
        const slotsForKit = remaining.slice(0, maxForKit);
        remaining = remaining.slice(maxForKit);

        kitArbs.push(
          fc
            .integer({ min: 0, max: slotsForKit.length })
            .map((count) => {
              const assignments: Record<string, string> = {};
              for (let i = 0; i < count; i++) {
                assignments[slotsForKit[i]] =
                  `${kitId}${STICK_SEPARATOR}${i + 1}`;
              }
              return assignments;
            })
        );
      }

      // Merge all kit assignments into a single record
      return fc.tuple(...(kitArbs as [fc.Arbitrary<Record<string, string>>])).map(
        (allKitAssignments) => {
          const merged: Record<string, string> = {};
          for (const kitAssignment of allKitAssignments) {
            Object.assign(merged, kitAssignment);
          }
          return merged;
        }
      );
    }
  );
}

import type { CPUOverride, M2Slot, PCIeSlot, NVMeComponent } from "../types";

// -- CPU-related generators ---------------------------------------------------

/** Pool of microarchitecture codenames used across CPU generators. */
export const MICROARCHITECTURES = [
  "Raphael",
  "Phoenix",
  "Phoenix 2",
  "Granite Ridge",
  "Strix Point",
  "Alder Lake",
  "Raptor Lake",
  "Raptor Lake Refresh",
  "Arrow Lake",
] as const;

/** Maps microarchitecture codenames to user-friendly architecture names. */
export const CODENAME_TO_ARCHITECTURE: Record<string, string> = {
  "Raphael": "Zen 4",
  "Phoenix": "Zen 4",
  "Phoenix 2": "Zen 4 / Zen 4c",
  "Granite Ridge": "Zen 5",
  "Strix Point": "Zen 5",
  "Alder Lake": "12th Gen Core",
  "Raptor Lake": "13th Gen Core",
  "Raptor Lake Refresh": "14th Gen Core",
  "Arrow Lake": "Core Ultra (Series 2)",
};

/**
 * Generates a CPUOverride with a microarchitecture drawn from the shared pool
 * and optional gen/lanes fields.
 */
export function arbCPUOverride(): fc.Arbitrary<CPUOverride> {
  return fc
    .record({
      microarchitecture: fc.constantFrom(...MICROARCHITECTURES),
      gen: fc.option(fc.integer({ min: 1, max: 6 }), { nil: undefined }),
      lanes: fc.option(fc.integer({ min: 1, max: 16 }), { nil: undefined }),
    })
    .map(({ microarchitecture, gen, lanes }) => {
      const override: CPUOverride = { microarchitecture };
      if (gen !== undefined) override.gen = gen;
      if (lanes !== undefined) override.lanes = lanes;
      return override;
    });
}

import type { CPUComponent, Motherboard } from "../types";

// -- CPU socket pools ---------------------------------------------------------

const CPU_SOCKETS = ["AM5", "LGA 1700", "LGA 1851"] as const;

const CPU_MANUFACTURERS = ["AMD", "Intel"] as const;

const CPU_MODEL_PREFIXES = [
  "Ryzen 7",
  "Ryzen 9",
  "Core i5",
  "Core i7",
  "Core i9",
] as const;

/**
 * Generates a CPUComponent with realistic field values.
 *
 * Socket, microarchitecture, and pcie_config are independently randomized
 * so property tests can exercise all combinations (including mismatched ones).
 * The `architecture` field is derived from the codename via CODENAME_TO_ARCHITECTURE.
 * `cpu_lanes` is optional, and `cores`, `threads`, `tdp_w` are optionally generated.
 */
export function arbCPUComponent(): fc.Arbitrary<CPUComponent> {
  return fc
    .record({
      manufacturer: fc.constantFrom(...CPU_MANUFACTURERS),
      modelPrefix: fc.constantFrom(...CPU_MODEL_PREFIXES),
      socket: fc.constantFrom(...CPU_SOCKETS),
      microarchitecture: fc.constantFrom(...MICROARCHITECTURES),
      cpuGen: fc.integer({ min: 3, max: 5 }),
      cpuLanes: fc.option(fc.integer({ min: 16, max: 28 }), { nil: undefined }),
      cores: fc.option(fc.integer({ min: 1, max: 128 }), { nil: undefined }),
      threads: fc.option(fc.integer({ min: 1, max: 256 }), { nil: undefined }),
      tdpW: fc.option(fc.integer({ min: 1, max: 500 }), { nil: undefined }),
      idSuffix: kebabSegmentArb,
    })
    .map(({ manufacturer, modelPrefix, socket, microarchitecture, cpuGen, cpuLanes, cores, threads, tdpW, idSuffix }) => {
      const pcie_config: CPUComponent["pcie_config"] = { cpu_gen: cpuGen };
      if (cpuLanes !== undefined) pcie_config.cpu_lanes = cpuLanes;

      const cpu: CPUComponent = {
        id: `${manufacturer.toLowerCase()}-${modelPrefix.toLowerCase().replace(/\s+/g, "-")}-${idSuffix}`,
        type: "cpu" as const,
        manufacturer,
        model: `${modelPrefix} ${idSuffix}`,
        socket,
        microarchitecture,
        architecture: CODENAME_TO_ARCHITECTURE[microarchitecture],
        pcie_config,
        schema_version: "1.0",
      };
      if (cores !== undefined) cpu.cores = cores;
      if (threads !== undefined) cpu.threads = threads;
      if (tdpW !== undefined) cpu.tdp_w = tdpW;

      return cpu;
    });
}

/**
 * Generates a minimal Motherboard with only the fields needed for
 * socket-level and slot-level CPU validation tests.
 *
 * The motherboard has a random socket, empty slot arrays, and a minimal
 * memory config. Extend as needed for slot-level property tests.
 */
export function arbMinimalMotherboard(): fc.Arbitrary<Motherboard> {
  return fc
    .record({
      socket: fc.constantFrom(...CPU_SOCKETS),
      idSuffix: kebabSegmentArb,
    })
    .map(({ socket, idSuffix }) => ({
      id: `board-${idSuffix}`,
      manufacturer: "TestVendor",
      model: `Test Board ${idSuffix}`,
      chipset: "X870E",
      socket,
      form_factor: "ATX",
      memory: {
        type: "DDR5" as const,
        max_speed_mhz: 6400,
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
    }));
}

// -- Slot generators for CPU-direct validation tests --------------------------

const SLOT_SOURCES = ["CPU", "Chipset"] as const;

/**
 * Generates an M2Slot with a random source (CPU or Chipset), gen, lanes,
 * and optional cpu_overrides. Useful for Property 4 tests.
 */
export function arbM2Slot(): fc.Arbitrary<M2Slot> {
  return fc
    .record({
      idSuffix: fc.integer({ min: 1, max: 8 }),
      gen: fc.integer({ min: 3, max: 5 }),
      lanes: fc.constantFrom(2, 4),
      source: fc.constantFrom(...SLOT_SOURCES),
      overrides: fc.option(
        fc.array(arbCPUOverride(), { minLength: 0, maxLength: 3 }),
        { nil: undefined }
      ),
    })
    .map(({ idSuffix, gen, lanes, source, overrides }) => ({
      id: `m2_${idSuffix}`,
      label: `M.2_${idSuffix} (${source})`,
      interface: "PCIe" as const,
      gen,
      lanes,
      form_factors: ["2280"],
      source,
      supports_sata: false,
      heatsink_included: false,
      sharing: null,
      ...(overrides ? { cpu_overrides: overrides } : {}),
    }));
}

/**
 * Generates a PCIeSlot with a random source (CPU or Chipset), gen,
 * electrical_lanes, and optional cpu_overrides. Useful for Property 4 tests.
 */
export function arbPCIeSlot(): fc.Arbitrary<PCIeSlot> {
  return fc
    .record({
      idSuffix: fc.integer({ min: 1, max: 6 }),
      gen: fc.integer({ min: 3, max: 5 }),
      electricalLanes: fc.constantFrom(1, 4, 8, 16),
      source: fc.constantFrom(...SLOT_SOURCES),
      overrides: fc.option(
        fc.array(arbCPUOverride(), { minLength: 0, maxLength: 3 }),
        { nil: undefined }
      ),
    })
    .map(({ idSuffix, gen, electricalLanes, source, overrides }) => ({
      id: `pcie_${idSuffix}`,
      label: `PCIEX${electricalLanes}(G${gen}) #${idSuffix}`,
      gen,
      electrical_lanes: electricalLanes,
      physical_size: `x${electricalLanes}` as PCIeSlot["physical_size"],
      position: idSuffix,
      source,
      reinforced: false,
      sharing: null,
      ...(overrides ? { cpu_overrides: overrides } : {}),
    }));
}

// -- NVMe component generator -------------------------------------------------

const NVME_MANUFACTURERS = ["Samsung", "WD", "Crucial", "Sabrent", "SK Hynix"];
const NVME_MODEL_PREFIXES = ["990 Pro", "SN850X", "T500", "Rocket", "P41 Platinum"];

/**
 * Generates an NVMeComponent with realistic field values.
 * pcie_gen ranges from 3 to 5 to exercise gen comparison logic.
 */
export function arbNVMeComponent(): fc.Arbitrary<NVMeComponent> {
  return fc
    .record({
      manufacturer: fc.constantFrom(...NVME_MANUFACTURERS),
      modelPrefix: fc.constantFrom(...NVME_MODEL_PREFIXES),
      pcieGen: fc.integer({ min: 3, max: 5 }),
      lanes: fc.constantFrom(2, 4),
      capacityGb: fc.constantFrom(500, 1000, 2000, 4000),
      idSuffix: kebabSegmentArb,
    })
    .map(({ manufacturer, modelPrefix, pcieGen, lanes, capacityGb, idSuffix }) => ({
      id: `${manufacturer.toLowerCase()}-${modelPrefix.toLowerCase().replace(/\s+/g, "-")}-${idSuffix}`,
      type: "nvme" as const,
      manufacturer,
      model: `${manufacturer} ${modelPrefix} ${capacityGb}GB`,
      interface: {
        protocol: "NVMe" as const,
        pcie_gen: pcieGen,
        lanes,
      },
      form_factor: "2280",
      capacity_gb: capacityGb,
      schema_version: "1.0",
    }));
}

// -- Aliases for CPU spec task naming conventions -----------------------------

/** Alias for arbM2Slot — generates M.2 slots with optional cpu_overrides. */
export const arbM2SlotWithOverrides = arbM2Slot;

/** Alias for arbPCIeSlot — generates PCIe slots with optional cpu_overrides. */
export const arbPCIeSlotWithOverrides = arbPCIeSlot;
