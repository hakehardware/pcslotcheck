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
