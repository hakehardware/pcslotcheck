import type { CPUOverride, Motherboard, CPUComponent } from "./types";

export interface SlotImpact {
  slotId: string;
  slotLabel: string;
  source: "CPU" | "Chipset";
  baseGen: number;
  effectiveGen: number;
  baseLanes: number;
  effectiveLanes: number;
  hasGenDowngrade: boolean;
  hasLaneReduction: boolean;
}

export interface CpuImpactResult {
  socketMatch: boolean;
  cpuSocket: string;
  motherboardSocket: string;
  slotImpacts: SlotImpact[];
  overallStatus: "compatible" | "warning" | "error";
}

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

/**
 * Compute the full CPU impact summary for a motherboard + CPU combination.
 *
 * Compares socket compatibility, iterates all M.2 and PCIe slots, resolves
 * effective values via resolveEffectiveSlotValues(), and derives per-slot
 * impact items for CPU-sourced slots only.
 */
export function computeCpuImpact(
  motherboard: Motherboard,
  cpuComponent: CPUComponent
): CpuImpactResult {
  const socketMatch = cpuComponent.socket === motherboard.socket;

  const slotImpacts: SlotImpact[] = [];

  // Process M.2 slots
  for (const slot of motherboard.m2_slots) {
    if (slot.source !== "CPU") continue;

    const effective = resolveEffectiveSlotValues(
      slot.gen,
      slot.lanes,
      slot.cpu_overrides,
      cpuComponent.microarchitecture
    );

    slotImpacts.push({
      slotId: slot.id,
      slotLabel: slot.label,
      source: slot.source,
      baseGen: slot.gen,
      effectiveGen: effective.gen,
      baseLanes: slot.lanes,
      effectiveLanes: effective.lanes,
      hasGenDowngrade: effective.gen < slot.gen,
      hasLaneReduction: effective.lanes < slot.lanes,
    });
  }

  // Process PCIe slots
  for (const slot of motherboard.pcie_slots) {
    if (slot.source !== "CPU") continue;

    const effective = resolveEffectiveSlotValues(
      slot.gen,
      slot.electrical_lanes,
      slot.cpu_overrides,
      cpuComponent.microarchitecture
    );

    slotImpacts.push({
      slotId: slot.id,
      slotLabel: slot.label,
      source: slot.source,
      baseGen: slot.gen,
      effectiveGen: effective.gen,
      baseLanes: slot.electrical_lanes,
      effectiveLanes: effective.lanes,
      hasGenDowngrade: effective.gen < slot.gen,
      hasLaneReduction: effective.lanes < slot.electrical_lanes,
    });
  }

  // Derive overall status
  let overallStatus: CpuImpactResult["overallStatus"];
  if (!socketMatch) {
    overallStatus = "error";
  } else if (
    slotImpacts.some((s) => s.hasGenDowngrade || s.hasLaneReduction)
  ) {
    overallStatus = "warning";
  } else {
    overallStatus = "compatible";
  }

  return {
    socketMatch,
    cpuSocket: cpuComponent.socket,
    motherboardSocket: motherboard.socket,
    slotImpacts,
    overallStatus,
  };
}
