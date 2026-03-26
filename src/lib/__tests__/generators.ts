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


// -- Motherboard with mixed slots generator for CPU impact tests --------------

/**
 * Generates a Motherboard with a mix of CPU and Chipset sourced M.2 and PCIe
 * slots, some with cpu_overrides. Useful for computeCpuImpact property tests.
 */
export function arbMotherboardWithSlots(): fc.Arbitrary<Motherboard> {
  return fc
    .record({
      socket: fc.constantFrom(...CPU_SOCKETS),
      idSuffix: kebabSegmentArb,
      m2Slots: fc.array(arbM2Slot(), { minLength: 0, maxLength: 4 }),
      pcieSlots: fc.array(arbPCIeSlot(), { minLength: 0, maxLength: 4 }),
    })
    .map(({ socket, idSuffix, m2Slots, pcieSlots }) => {
      // Ensure unique slot IDs by appending index
      const uniqueM2 = m2Slots.map((s, i) => ({ ...s, id: `m2_${i + 1}`, label: `M.2_${i + 1} (${s.source})` }));
      const uniquePcie = pcieSlots.map((s, i) => ({ ...s, id: `pcie_${i + 1}`, label: `PCIEX${s.electrical_lanes}(G${s.gen}) #${i + 1}`, position: i + 1 }));

      return {
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
        m2_slots: uniqueM2,
        pcie_slots: uniquePcie,
        sata_ports: [],
        sources: [],
        schema_version: "1.0",
      } satisfies Motherboard;
    });
}

/**
 * Generates a Motherboard guaranteed to have at least one CPU-sourced and
 * one Chipset-sourced slot. Useful for Property 3 (only CPU slots in results).
 */
export function arbMotherboardWithMixedSources(): fc.Arbitrary<Motherboard> {
  return fc
    .record({
      socket: fc.constantFrom(...CPU_SOCKETS),
      idSuffix: kebabSegmentArb,
      cpuM2: arbM2Slot(),
      chipsetM2: arbM2Slot(),
      cpuPcie: arbPCIeSlot(),
      chipsetPcie: arbPCIeSlot(),
    })
    .map(({ socket, idSuffix, cpuM2, chipsetM2, cpuPcie, chipsetPcie }) => ({
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
      m2_slots: [
        { ...cpuM2, id: "m2_1", label: "M.2_1 (CPU)", source: "CPU" as const },
        { ...chipsetM2, id: "m2_2", label: "M.2_2 (Chipset)", source: "Chipset" as const },
      ],
      pcie_slots: [
        { ...cpuPcie, id: "pcie_1", label: `PCIEX${cpuPcie.electrical_lanes}(G${cpuPcie.gen}) #1`, source: "CPU" as const, position: 1 },
        { ...chipsetPcie, id: "pcie_2", label: `PCIEX${chipsetPcie.electrical_lanes}(G${chipsetPcie.gen}) #2`, source: "Chipset" as const, position: 2 },
      ],
      sata_ports: [],
      sources: [],
      schema_version: "1.0",
    } satisfies Motherboard));
}

// =============================================================================
// Component Browser generators
// =============================================================================
//
// Generators for MotherboardSummary, ComponentSummary, full Motherboard, and
// the Component union type. Used by property tests in tasks 7.2-7.6.

import type {
  MotherboardSummary,
  ComponentSummary,
  GPUComponent,
  SATAComponent,
  SATAPort,
  Component,
} from "../types";

// -- Value pools --------------------------------------------------------------

const MB_MANUFACTURERS = ["ASUS", "MSI", "Gigabyte", "ASRock"] as const;
const MB_CHIPSETS = ["B650", "B650E", "X670E", "X870E", "B760", "Z790", "Z890"] as const;
const MB_SOCKETS = ["AM5", "LGA 1700", "LGA 1851"] as const;
const MB_FORM_FACTORS = ["ATX", "Micro-ATX", "Mini-ITX", "E-ATX"] as const;

const GPU_CHIP_MANUFACTURERS = ["NVIDIA", "AMD"] as const;
const GPU_MANUFACTURERS = ["ASUS", "MSI", "Gigabyte", "EVGA", "Zotac", "Sapphire"] as const;
const GPU_MODEL_PREFIXES = ["RTX 4070", "RTX 4080", "RTX 4090", "RX 7800 XT", "RX 7900 XTX"] as const;
const POWER_CONNECTOR_TYPES = ["8-pin", "12VHPWR", "6-pin", "16-pin"] as const;

const SATA_MANUFACTURERS = ["Samsung", "Crucial", "WD", "Seagate", "Kingston"] as const;
const SATA_MODEL_PREFIXES = ["870 EVO", "MX500", "Blue", "BarraCuda", "A400"] as const;
const SATA_FORM_FACTORS = ["2.5\"", "3.5\""] as const;
const SATA_INTERFACES = ["SATA III", "SATA II"] as const;

const COMPONENT_TYPES = ["cpu", "gpu", "nvme", "ram", "sata_drive"] as const;

// -- MotherboardSummary -------------------------------------------------------

/**
 * Generates a MotherboardSummary with realistic field values.
 * All fields are non-empty strings.
 */
export function arbMotherboardSummary(): fc.Arbitrary<MotherboardSummary> {
  return fc
    .record({
      manufacturer: fc.constantFrom(...MB_MANUFACTURERS),
      chipset: fc.constantFrom(...MB_CHIPSETS),
      socket: fc.constantFrom(...MB_SOCKETS),
      formFactor: fc.constantFrom(...MB_FORM_FACTORS),
      idSuffix: kebabSegmentArb,
    })
    .map(({ manufacturer, chipset, socket, formFactor, idSuffix }) => ({
      id: `${manufacturer.toLowerCase()}-${chipset.toLowerCase()}-${idSuffix}`,
      manufacturer,
      model: `${manufacturer} ${chipset} ${idSuffix}`,
      chipset,
      socket,
      form_factor: formFactor,
    }));
}

// -- ComponentSummary ---------------------------------------------------------

/** Generates type-appropriate specs for a ComponentSummary. */
function arbSpecsForType(type: string): fc.Arbitrary<Record<string, unknown>> {
  switch (type) {
    case "cpu":
      return fc
        .record({
          socket: fc.constantFrom(...MB_SOCKETS),
          microarchitecture: fc.constantFrom(...MICROARCHITECTURES),
          pcie_gen: fc.integer({ min: 3, max: 5 }),
        })
        .map((s) => s as Record<string, unknown>);
    case "gpu":
      return fc
        .record({
          pcie_gen: fc.integer({ min: 3, max: 5 }),
          tdp_w: fc.integer({ min: 100, max: 600 }),
          length_mm: fc.integer({ min: 200, max: 400 }),
        })
        .map((s) => s as Record<string, unknown>);
    case "nvme":
      return fc
        .record({
          protocol: fc.constantFrom("NVMe", "SATA"),
          pcie_gen: fc.integer({ min: 3, max: 5 }),
          capacity_gb: fc.constantFrom(500, 1000, 2000, 4000),
        })
        .map((s) => s as Record<string, unknown>);
    case "ram":
      return fc
        .record({
          type: fc.constantFrom("DDR4", "DDR5"),
          speed_mhz: fc.constantFrom(3200, 4800, 5600, 6000, 6400),
          total_gb: fc.constantFrom(16, 32, 64, 128),
        })
        .map((s) => s as Record<string, unknown>);
    case "sata_drive":
      return fc
        .record({
          form_factor: fc.constantFrom(...SATA_FORM_FACTORS),
          capacity_gb: fc.constantFrom(250, 500, 1000, 2000, 4000),
        })
        .map((s) => s as Record<string, unknown>);
    default:
      return fc.constant({} as Record<string, unknown>);
  }
}

/**
 * Generates a ComponentSummary with a random component type and
 * type-appropriate specs.
 */
export function arbComponentSummary(): fc.Arbitrary<ComponentSummary> {
  return fc.constantFrom(...COMPONENT_TYPES).chain((type) =>
    fc
      .record({
        manufacturer: fc.constantFrom(
          "AMD", "Intel", "NVIDIA", "Samsung", "Corsair", "Crucial", "WD"
        ),
        idSuffix: kebabSegmentArb,
        specs: arbSpecsForType(type),
      })
      .map(({ manufacturer, idSuffix, specs }) => ({
        id: `${type}-${manufacturer.toLowerCase()}-${idSuffix}`,
        type,
        manufacturer,
        model: `${manufacturer} ${type.toUpperCase()} ${idSuffix}`,
        specs,
      }))
  );
}

/**
 * Generates a ComponentSummary for a specific component type.
 */
export function arbComponentSummaryOfType(
  type: (typeof COMPONENT_TYPES)[number]
): fc.Arbitrary<ComponentSummary> {
  return fc
    .record({
      manufacturer: fc.constantFrom(
        "AMD", "Intel", "NVIDIA", "Samsung", "Corsair", "Crucial", "WD"
      ),
      idSuffix: kebabSegmentArb,
      specs: arbSpecsForType(type),
    })
    .map(({ manufacturer, idSuffix, specs }) => ({
      id: `${type}-${manufacturer.toLowerCase()}-${idSuffix}`,
      type,
      manufacturer,
      model: `${manufacturer} ${type.toUpperCase()} ${idSuffix}`,
      specs,
    }));
}

// -- GPUComponent -------------------------------------------------------------

/**
 * Generates a GPUComponent with realistic field values.
 */
export function arbGPUComponent(): fc.Arbitrary<GPUComponent> {
  return fc
    .record({
      chipManufacturer: fc.constantFrom(...GPU_CHIP_MANUFACTURERS),
      manufacturer: fc.constantFrom(...GPU_MANUFACTURERS),
      modelPrefix: fc.constantFrom(...GPU_MODEL_PREFIXES),
      pcieGen: fc.integer({ min: 3, max: 5 }),
      lanes: fc.constantFrom(8, 16),
      slotWidth: fc.constantFrom(2, 2.5, 3),
      lengthMm: fc.integer({ min: 200, max: 400 }),
      slotsOccupied: fc.constantFrom(2, 3),
      tdpW: fc.integer({ min: 100, max: 600 }),
      recommendedPsuW: fc.constantFrom(650, 750, 850, 1000),
      connectorType: fc.constantFrom(...POWER_CONNECTOR_TYPES),
      connectorCount: fc.integer({ min: 1, max: 3 }),
      idSuffix: kebabSegmentArb,
    })
    .map(({
      chipManufacturer, manufacturer, modelPrefix, pcieGen, lanes,
      slotWidth, lengthMm, slotsOccupied, tdpW, recommendedPsuW,
      connectorType, connectorCount, idSuffix,
    }) => ({
      id: `${manufacturer.toLowerCase()}-${modelPrefix.toLowerCase().replace(/\s+/g, "-")}-${idSuffix}`,
      type: "gpu" as const,
      chip_manufacturer: chipManufacturer,
      manufacturer,
      model: `${manufacturer} ${modelPrefix} ${idSuffix}`,
      interface: { pcie_gen: pcieGen, lanes },
      physical: { slot_width: slotWidth, length_mm: lengthMm, slots_occupied: slotsOccupied },
      power: {
        tdp_w: tdpW,
        recommended_psu_w: recommendedPsuW,
        power_connectors: [{ type: connectorType, count: connectorCount }],
      },
      schema_version: "1.0",
    }));
}

// -- SATAComponent ------------------------------------------------------------

/**
 * Generates a SATAComponent with realistic field values.
 */
export function arbSATAComponent(): fc.Arbitrary<SATAComponent> {
  return fc
    .record({
      manufacturer: fc.constantFrom(...SATA_MANUFACTURERS),
      modelPrefix: fc.constantFrom(...SATA_MODEL_PREFIXES),
      formFactor: fc.constantFrom(...SATA_FORM_FACTORS),
      capacityGb: fc.constantFrom(250, 500, 1000, 2000, 4000),
      sataInterface: fc.constantFrom(...SATA_INTERFACES),
      idSuffix: kebabSegmentArb,
    })
    .map(({ manufacturer, modelPrefix, formFactor, capacityGb, sataInterface, idSuffix }) => ({
      id: `${manufacturer.toLowerCase()}-${modelPrefix.toLowerCase().replace(/\s+/g, "-")}-${idSuffix}`,
      type: "sata_drive" as const,
      manufacturer,
      model: `${manufacturer} ${modelPrefix} ${capacityGb}GB`,
      form_factor: formFactor,
      capacity_gb: capacityGb,
      interface: sataInterface,
      schema_version: "1.0",
    }));
}

// -- SATAPort -----------------------------------------------------------------

/**
 * Generates a SATAPort with realistic field values.
 */
export function arbSATAPort(): fc.Arbitrary<SATAPort> {
  return fc
    .record({
      idSuffix: fc.integer({ min: 1, max: 8 }),
      version: fc.constantFrom("SATA III", "SATA II"),
      source: fc.constantFrom(...SLOT_SOURCES),
    })
    .map(({ idSuffix, version, source }) => ({
      id: `sata_${idSuffix}`,
      version,
      source,
      disabled_by: null,
    }));
}

// -- Full Motherboard ---------------------------------------------------------

/**
 * Generates a full Motherboard object with memory config, M.2 slots,
 * PCIe slots, and SATA ports. Suitable for detail-view property tests.
 */
export function arbFullMotherboard(): fc.Arbitrary<Motherboard> {
  return fc
    .record({
      manufacturer: fc.constantFrom(...MB_MANUFACTURERS),
      chipset: fc.constantFrom(...MB_CHIPSETS),
      socket: fc.constantFrom(...MB_SOCKETS),
      formFactor: fc.constantFrom(...MB_FORM_FACTORS),
      idSuffix: kebabSegmentArb,
      memory: arbMemoryConfig(),
      m2Slots: fc.array(arbM2Slot(), { minLength: 1, maxLength: 4 }),
      pcieSlots: fc.array(arbPCIeSlot(), { minLength: 1, maxLength: 4 }),
      sataPorts: fc.array(arbSATAPort(), { minLength: 1, maxLength: 8 }),
    })
    .map(({ manufacturer, chipset, socket, formFactor, idSuffix, memory, m2Slots, pcieSlots, sataPorts }) => {
      // Ensure unique IDs within each slot array
      const uniqueM2 = m2Slots.map((s, i) => ({
        ...s,
        id: `m2_${i + 1}`,
        label: `M.2_${i + 1} (${s.source})`,
      }));
      const uniquePcie = pcieSlots.map((s, i) => ({
        ...s,
        id: `pcie_${i + 1}`,
        label: `PCIEX${s.electrical_lanes}(G${s.gen}) #${i + 1}`,
        position: i + 1,
      }));
      const uniqueSata = sataPorts.map((s, i) => ({
        ...s,
        id: `sata_${i + 1}`,
      }));

      return {
        id: `${manufacturer.toLowerCase()}-${chipset.toLowerCase()}-${idSuffix}`,
        manufacturer,
        model: `${manufacturer} ${chipset} ${idSuffix}`,
        chipset,
        socket,
        form_factor: formFactor,
        memory,
        m2_slots: uniqueM2,
        pcie_slots: uniquePcie,
        sata_ports: uniqueSata,
        sources: [{ type: "manual", url: "https://example.com" }],
        schema_version: "1.0",
      } satisfies Motherboard;
    });
}

// -- Component union ----------------------------------------------------------

/**
 * Generates a Component (union of all 5 component types) with equal
 * probability for each type.
 */
export function arbComponent(): fc.Arbitrary<Component> {
  return fc.oneof(
    arbCPUComponent(),
    arbGPUComponent(),
    arbNVMeComponent(),
    arbRAMComponent(),
    arbSATAComponent()
  );
}
