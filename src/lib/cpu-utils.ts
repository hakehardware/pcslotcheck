import type { CPUOverride } from "./types";

export interface EffectiveSlotValues {
  gen: number;
  lanes: number;
}

/**
 * Resolve effective gen/lanes for a slot given CPU overrides and microarchitecture.
 *
 * If a matching override is found, its gen/lanes replace the base values
 * (falling back to base for any field the override does not specify).
 * If no match or microarchitecture is null, base values are returned.
 */
export function resolveEffectiveSlotValues(
  baseGen: number,
  baseLanes: number,
  cpuOverrides: CPUOverride[] | undefined | null,
  microarchitecture: string | null
): EffectiveSlotValues {
  if (!microarchitecture || !cpuOverrides || cpuOverrides.length === 0) {
    return { gen: baseGen, lanes: baseLanes };
  }

  const match = cpuOverrides.find(
    (o) => o.microarchitecture === microarchitecture
  );

  if (!match) {
    return { gen: baseGen, lanes: baseLanes };
  }

  return {
    gen: match.gen ?? baseGen,
    lanes: match.lanes ?? baseLanes,
  };
}

/**
 * Returns true iff the slot is CPU-direct and the CPU's PCIe gen
 * is lower than the slot's advertised gen (i.e., the CPU downgrades it).
 */
export function isCpuGenDowngrade(
  slotGen: number,
  cpuGen: number,
  slotSource: "CPU" | "Chipset"
): boolean {
  return slotSource === "CPU" && slotGen > cpuGen;
}
