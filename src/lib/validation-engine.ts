import type {
  Motherboard,
  Component,
  NVMeComponent,
  GPUComponent,
  SATASSDComponent,
  SATAHDDComponent,
  RAMComponent,
  CPUComponent,
  ValidationResult,
  MemoryConfig,
  M2Slot,
  PCIeSlot,
  SATAPort,
  SharingRule,
} from "./types";
import { parseStickId, getKitAssignments, getAssignedKitIds } from "./stick-utils";
import { isCpuGenDowngrade, resolveEffectiveSlotValues } from "./cpu-utils";

/**
 * Validates component-to-slot assignments against motherboard compatibility rules.
 * Runs entirely client-side — no server calls.
 */
export function validateAssignments(
  motherboard: Motherboard,
  assignments: Record<string, string>,
  components: Record<string, Component>,
  cpuComponent?: CPUComponent
): ValidationResult[] {
  try {
    if (!motherboard || !assignments) return [];

    const results: ValidationResult[] = [];

    // CPU socket compatibility check
    if (cpuComponent) {
      results.push(...validateCpuSocketCompat(motherboard, cpuComponent));
      results.push(...validateCpuDirectSlotGen(motherboard, cpuComponent));
    }

    for (const [slotId, componentId] of Object.entries(assignments)) {
      const component = components?.[componentId];
      if (!component) continue;

      const m2Slot = motherboard.m2_slots?.find((s) => s.id === slotId);
      if (m2Slot) {
        results.push(...validateM2Assignment(m2Slot, component, slotId, componentId, cpuComponent));
        continue;
      }

      // PCIe slot validation -- route GPU assignments to validatePCIeAssignment
      const pcieSlot = motherboard.pcie_slots?.find((s) => s.id === slotId);
      if (pcieSlot && isGPU(component)) {
        results.push(
          ...validatePCIeAssignment(
            pcieSlot,
            component,
            slotId,
            componentId,
            motherboard.pcie_slots,
            assignments
          )
        );
        continue;
      }

      // SATA port validation -- route to validateSATAAssignment
      const sataPort = motherboard.sata_ports?.find((p) => p.id === slotId);
      if (sataPort) {
        results.push(
          ...validateSATAAssignment(
            sataPort,
            component,
            slotId,
            componentId,
            motherboard,
            assignments
          )
        );
        continue;
      }

      // Memory slots are handled in bulk after the per-slot loop via
      // validateRAMStickAssignments, so skip them here.
      const memorySlot = motherboard.memory?.slots?.find((s) => s.id === slotId);
      if (memorySlot) {
        continue;
      }

      // Unknown slot IDs are silently skipped.
    }

    // RAM stick-level validation (runs once across all memory slots)
    if (motherboard.memory) {
      results.push(
        ...validateRAMStickAssignments(motherboard.memory, assignments, components)
      );
    }

    // Cross-slot sharing rule validation pass
    results.push(...validateSharingRules(motherboard, assignments, components));

    return results;
  } catch {
    return [];
  }
}

function isNVMe(component: Component): component is NVMeComponent {
  return component.type === "nvme";
}

/**
 * Produces an error when the CPU socket does not match the motherboard socket.
 * Returns an empty array when sockets match.
 */
export function validateCpuSocketCompat(
  motherboard: Motherboard,
  cpuComponent: CPUComponent
): ValidationResult[] {
  if (cpuComponent.socket === motherboard.socket) {
    return [];
  }

  return [
    {
      severity: "error",
      message: `${cpuComponent.model} requires socket ${cpuComponent.socket} but this motherboard uses ${motherboard.socket}`,
      slotId: "cpu",
      componentId: cpuComponent.id,
    },
  ];
}

/**
 * Produces a warning for each CPU-direct M.2 or PCIe slot whose effective gen
 * exceeds the CPU's pcie_config.cpu_gen. Chipset-sourced slots are skipped.
 */
export function validateCpuDirectSlotGen(
  motherboard: Motherboard,
  cpuComponent: CPUComponent
): ValidationResult[] {
  const results: ValidationResult[] = [];
  const cpuGen = cpuComponent.pcie_config.cpu_gen;

  for (const slot of motherboard.m2_slots ?? []) {
    const effective = resolveEffectiveSlotValues(
      slot.gen,
      slot.lanes,
      slot.cpu_overrides,
      cpuComponent.microarchitecture
    );
    if (isCpuGenDowngrade(effective.gen, cpuGen, slot.source)) {
      results.push({
        severity: "warning",
        message: `Slot ${slot.label} is advertised as Gen${effective.gen} but ${cpuComponent.model} only supports Gen${cpuGen} on CPU-direct lanes -- slot operates at Gen${cpuGen}`,
        slotId: slot.id,
        componentId: cpuComponent.id,
      });
    }
  }

  for (const slot of motherboard.pcie_slots ?? []) {
    const effective = resolveEffectiveSlotValues(
      slot.gen,
      slot.electrical_lanes,
      slot.cpu_overrides,
      cpuComponent.microarchitecture
    );
    if (isCpuGenDowngrade(effective.gen, cpuGen, slot.source)) {
      results.push({
        severity: "warning",
        message: `Slot ${slot.label} is advertised as Gen${effective.gen} but ${cpuComponent.model} only supports Gen${cpuGen} on CPU-direct lanes -- slot operates at Gen${cpuGen}`,
        slotId: slot.id,
        componentId: cpuComponent.id,
      });
    }
  }

  return results;
}

/**
 * Produces a warning when an NVMe drive's pcie_gen exceeds the effective slot
 * gen after CPU override resolution. Only fires when a CPU is selected.
 */
export function validateCpuNvmeGenMismatch(
  slot: M2Slot,
  nvmeComponent: NVMeComponent,
  cpuComponent: CPUComponent
): ValidationResult[] {
  const effective = resolveEffectiveSlotValues(
    slot.gen,
    slot.lanes,
    slot.cpu_overrides,
    cpuComponent.microarchitecture
  );

  if (
    nvmeComponent.interface.pcie_gen !== null &&
    nvmeComponent.interface.pcie_gen > effective.gen
  ) {
    return [
      {
        severity: "warning",
        message: `${nvmeComponent.model} is Gen${nvmeComponent.interface.pcie_gen} but slot ${slot.label} operates at Gen${effective.gen} with ${cpuComponent.model} -- reduced bandwidth`,
        slotId: slot.id,
        componentId: nvmeComponent.id,
      },
    ];
  }

  return [];
}

function isGPU(component: Component): component is GPUComponent {
  return component.type === "gpu";
}

function isSATA(component: Component): component is SATASSDComponent | SATAHDDComponent {
  return component.type === "sata_ssd" || component.type === "sata_hdd" || (component.type as string) === "sata_drive";
}

function isRAM(component: Component): component is RAMComponent {
  return component.type === "ram";
}

/** Maps PCIe physical_size string to lane count. */
const PHYSICAL_SIZE_LANES: Record<string, number> = {
  x1: 1,
  x4: 4,
  x8: 8,
  x16: 16,
};

/**
 * Validates a GPU-to-PCIe slot assignment for physical fit, lane width,
 * generation mismatch, and position-based blocking.
 */
export function validatePCIeAssignment(
  slot: PCIeSlot,
  gpu: GPUComponent,
  slotId: string,
  componentId: string,
  allSlots: PCIeSlot[],
  assignments: Record<string, string>
): ValidationResult[] {
  const results: ValidationResult[] = [];

  // 1. Physical fit check — GPU lanes vs slot physical size
  const physicalLanes = PHYSICAL_SIZE_LANES[slot.physical_size] ?? 0;
  if (gpu.interface.lanes > physicalLanes) {
    results.push({
      severity: "error",
      message: `${gpu.model} requires x${gpu.interface.lanes} lanes but slot ${slot.label} is physically ${slot.physical_size} — the GPU cannot physically fit.`,
      slotId,
      componentId,
    });
  }

  // 2. Lane width mismatch — GPU lanes vs slot electrical lanes
  if (gpu.interface.lanes > slot.electrical_lanes) {
    results.push({
      severity: "error",
      message: `${gpu.model} requires x${gpu.interface.lanes} electrical lanes but slot ${slot.label} only provides x${slot.electrical_lanes} — lane width mismatch.`,
      slotId,
      componentId,
    });
  }

  // 3. Gen mismatch (downgrade) — GPU gen > slot gen
  if (gpu.interface.pcie_gen > slot.gen) {
    results.push({
      severity: "warning",
      message: `${gpu.model} is PCIe Gen${gpu.interface.pcie_gen} but slot ${slot.label} is Gen${slot.gen} — performance downgrade.`,
      slotId,
      componentId,
    });
  }

  // 4. Gen mismatch (underuse) — GPU gen < slot gen
  if (gpu.interface.pcie_gen < slot.gen) {
    results.push({
      severity: "info",
      message: `${gpu.model} is PCIe Gen${gpu.interface.pcie_gen} but slot ${slot.label} supports Gen${slot.gen} — the slot supports a higher gen.`,
      slotId,
      componentId,
    });
  }

  // 5. Physical blocking — check if GPU blocks adjacent populated slots
  const slotsOccupied = gpu.physical?.slots_occupied ?? 1;
  if (slotsOccupied > 1) {
    for (let offset = 1; offset < slotsOccupied; offset++) {
      const blockedPosition = slot.position + offset;
      const blockedSlot = allSlots.find((s) => s.position === blockedPosition);
      if (blockedSlot && assignments[blockedSlot.id] && blockedSlot.id !== slotId) {
        results.push({
          severity: "warning",
          message: `${gpu.model} occupies ${slotsOccupied} slot positions — it physically blocks slot ${blockedSlot.label} (position ${blockedPosition}) which has a component assigned.`,
          slotId,
          componentId,
        });
      }
    }
  }

  return results;
}

/**
 * Validates a component-to-SATA port assignment.
 * Checks component type compatibility and disabled-by conflicts.
 */
function validateSATAAssignment(
  port: SATAPort,
  component: Component,
  slotId: string,
  componentId: string,
  motherboard: Motherboard,
  assignments: Record<string, string>
): ValidationResult[] {
  const results: ValidationResult[] = [];

  // Component must be a SATA drive
  if (!isSATA(component)) {
    results.push({
      severity: "error",
      message: `${component.model} is a ${component.type} component but SATA port ${slotId} only accepts SATA drives — incompatible component type.`,
      slotId,
      componentId,
    });
    return results;
  }

  // Check if the port is disabled by a populated M.2 slot
  if (port.disabled_by) {
    const disablingSlotPopulated = assignments[port.disabled_by] !== undefined;
    if (disablingSlotPopulated) {
      results.push({
        severity: "error",
        message: `SATA port ${slotId} is disabled because M.2 slot ${port.disabled_by} is populated — this SATA drive will not be detected.`,
        slotId,
        componentId,
      });
    }
  }

  return results;
}

function validateM2Assignment(
  slot: M2Slot,
  component: Component,
  slotId: string,
  componentId: string,
  cpuComponent?: CPUComponent
): ValidationResult[] {
  if (!isNVMe(component)) return [];

  const results: ValidationResult[] = [];

  // Resolve effective slot gen/lanes when a CPU is selected
  const effective = cpuComponent
    ? resolveEffectiveSlotValues(
        slot.gen,
        slot.lanes,
        slot.cpu_overrides,
        cpuComponent.microarchitecture
      )
    : { gen: slot.gen, lanes: slot.lanes };

  // Error: SATA M.2 drive in an NVMe-only slot
  if (component.interface.protocol === "SATA" && !slot.supports_sata) {
    results.push({
      severity: "error",
      message: `${component.model} uses SATA protocol but slot ${slot.label} does not support SATA — this drive will not be detected.`,
      slotId,
      componentId,
    });
  }

  // Warning: NVMe gen exceeds effective slot gen — performance impact
  if (component.interface.pcie_gen !== null && component.interface.pcie_gen > effective.gen) {
    results.push({
      severity: "warning",
      message: `${component.model} is a Gen${component.interface.pcie_gen} NVMe drive but slot ${slot.label} is Gen${effective.gen} — the drive will run at reduced bandwidth.`,
      slotId,
      componentId,
    });
  }

  // Info: NVMe gen below effective slot gen — wastes slot potential
  if (component.interface.pcie_gen !== null && component.interface.pcie_gen < effective.gen) {
    results.push({
      severity: "info",
      message: `${component.model} is a Gen${component.interface.pcie_gen} NVMe drive in a Gen${effective.gen} slot (${slot.label}) — consider swapping with a Gen${effective.gen} drive to use the slot's full bandwidth.`,
      slotId,
      componentId,
    });
  }

  // CPU-dependent NVMe gen mismatch warning
  if (cpuComponent) {
    results.push(
      ...validateCpuNvmeGenMismatch(slot, component, cpuComponent)
    );
  }

  // Form factor check: component must fit the slot's supported form factors
  if (
    component.form_factor &&
    Array.isArray(slot.form_factors) &&
    slot.form_factors.length > 0 &&
    !slot.form_factors.includes(component.form_factor)
  ) {
    results.push({
      severity: "error",
      message: `${component.model} has form factor ${component.form_factor} but slot ${slot.label} only supports ${slot.form_factors.join(", ")} — the drive does not physically fit this slot.`,
      slotId,
      componentId,
    });
  }

  // Append capacity variant note to all messages if present
  if (component.capacity_variant_note && component.capacity_variant_note.trim().length > 0) {
    for (const result of results) {
      result.message = `${result.message} [Note: ${component.capacity_variant_note}]`;
    }
  }

  return results;
}

/**
 * Validates a RAM component assignment against the motherboard's memory configuration.
 * Checks DDR type compatibility, speed limits, total capacity, and DIMM placement.
 */
export function validateRAMAssignment(
  memoryConfig: MemoryConfig,
  component: Component,
  slotId: string,
  componentId: string,
  assignments: Record<string, string>,
  components: Record<string, Component>
): ValidationResult[] {
  const results: ValidationResult[] = [];

  // 1. Component type must be RAM
  if (!isRAM(component)) {
    results.push({
      severity: "error",
      message: `${component.model} is a ${component.type} component but memory slot ${slotId} only accepts RAM modules — incompatible component type.`,
      slotId,
      componentId,
    });
    return results;
  }

  // 2. DDR type mismatch
  if (component.interface.type !== memoryConfig.type) {
    results.push({
      severity: "error",
      message: `${component.model} is ${component.interface.type} but this motherboard requires ${memoryConfig.type} — incompatible DDR generation.`,
      slotId,
      componentId,
    });
  }

  // 3. Speed exceeds max
  if (component.interface.speed_mhz > memoryConfig.max_speed_mhz) {
    results.push({
      severity: "info",
      message: `${component.model} is rated for ${component.interface.speed_mhz} MHz but this motherboard supports up to ${memoryConfig.max_speed_mhz} MHz — the RAM will run at the board's maximum speed.`,
      slotId,
      componentId,
    });
  }

  // 4. Total RAM capacity across all assigned modules
  let totalCapacityGb = 0;
  const populatedMemorySlotIds: string[] = [];
  for (const [assignedSlotId, assignedComponentId] of Object.entries(assignments)) {
    const assignedComponent = components[assignedComponentId];
    if (assignedComponent && isRAM(assignedComponent)) {
      const isMemorySlot = memoryConfig.slots.some((s) => s.id === assignedSlotId);
      if (isMemorySlot) {
        populatedMemorySlotIds.push(assignedSlotId);
        if (assignedComponent.capacity?.total_gb !== undefined) {
          totalCapacityGb += assignedComponent.capacity.total_gb;
        }
      }
    }
  }

  if (totalCapacityGb > memoryConfig.max_capacity_gb) {
    results.push({
      severity: "error",
      message: `Total RAM capacity (${totalCapacityGb} GB) exceeds this motherboard's maximum of ${memoryConfig.max_capacity_gb} GB.`,
      slotId,
      componentId,
    });
  }

  // 5. Non-recommended DIMM placement for 2-module configurations
  if (
    populatedMemorySlotIds.length === 2 &&
    memoryConfig.recommended_population?.two_dimm &&
    memoryConfig.recommended_population.two_dimm.length > 0
  ) {
    const recommended = new Set(memoryConfig.recommended_population.two_dimm);
    const populated = new Set(populatedMemorySlotIds);
    const isRecommended =
      recommended.size === populated.size &&
      [...recommended].every((id) => populated.has(id));
    if (!isRecommended) {
      results.push({
        severity: "warning",
        message: `RAM modules are in slots ${populatedMemorySlotIds.join(", ")} but the recommended placement for 2 DIMMs is ${memoryConfig.recommended_population.two_dimm.join(", ")} — suboptimal memory performance.`,
        slotId,
        componentId,
      });
    }
  }

  return results;
}


/**
 * Evaluates all sharing rules from m2_slots, pcie_slots, and sata_ports.
 * Produces errors/warnings for cross-slot conflicts (disables, bandwidth splits).
 * Skips legacy rules that lack a trigger field.
 */
export function validateSharingRules(
  motherboard: Motherboard,
  assignments: Record<string, string>,
  components: Record<string, Component>
): ValidationResult[] {
  const results: ValidationResult[] = [];

  // Collect all sharing rules with their source slot IDs
  const rulesWithSource: { rule: SharingRule; sourceSlotId: string }[] = [];

  for (const slot of motherboard.m2_slots ?? []) {
    if (Array.isArray(slot.sharing)) {
      for (const rule of slot.sharing) {
        rulesWithSource.push({ rule, sourceSlotId: slot.id });
      }
    }
  }

  for (const slot of motherboard.pcie_slots ?? []) {
    if (Array.isArray(slot.sharing)) {
      for (const rule of slot.sharing) {
        rulesWithSource.push({ rule, sourceSlotId: slot.id });
      }
    }
  }

  for (const port of motherboard.sata_ports ?? []) {
    if (Array.isArray(port.sharing)) {
      for (const rule of port.sharing) {
        rulesWithSource.push({ rule, sourceSlotId: port.id });
      }
    }
  }

  for (const { rule, sourceSlotId } of rulesWithSource) {
    // Skip legacy rules without a trigger field
    if (!rule.trigger) continue;

    const trigger = rule.trigger;

    // Evaluate trigger logic
    let triggered = false;
    if (trigger.logic === "and") {
      triggered = trigger.slot_ids.every((id) => assignments[id] !== undefined);
    } else {
      // "or" or "any_populated"
      triggered = trigger.slot_ids.some((id) => assignments[id] !== undefined);
    }

    if (!triggered) continue;

    // Device filter check: source slot's component must match all filter fields
    if (rule.device_filter) {
      const sourceComponentId = assignments[sourceSlotId];
      if (!sourceComponentId) continue;
      const sourceComponent = components[sourceComponentId];
      if (!sourceComponent) continue;

      if (!matchesDeviceFilter(sourceComponent, rule.device_filter)) continue;
    }

    const sourceComponentId = assignments[sourceSlotId] ?? "";

    // Get target slot IDs
    const targetIds = getTargetIds(rule);

    if (rule.type === "disables") {
      for (const targetId of targetIds) {
        if (assignments[targetId] !== undefined) {
          results.push({
            severity: "error",
            message: `Sharing conflict: slot ${sourceSlotId} disables ${targetId}, but ${targetId} has a component assigned.`,
            slotId: targetId,
            componentId: sourceComponentId,
          });
        } else {
          results.push({
            severity: "warning",
            message: `Sharing rule: slot ${sourceSlotId} disables ${targetId} — this slot/port is unavailable.`,
            slotId: targetId,
            componentId: sourceComponentId,
          });
        }
      }
    } else if (rule.type === "bandwidth_split") {
      if (rule.degraded_lanes === undefined) continue;

      const targetId = targetIds[0];
      if (!targetId) continue;

      results.push({
        severity: "warning",
        message: `Sharing rule: slot ${sourceSlotId} reduces ${targetId} bandwidth to x${rule.degraded_lanes} lanes.`,
        slotId: targetId,
        componentId: sourceComponentId,
      });
    }
  }

  return results;
}

/** Get target slot IDs from a sharing rule (supports both targets array and single target). */
function getTargetIds(rule: SharingRule): string[] {
  if (Array.isArray(rule.targets) && rule.targets.length > 0) {
    return rule.targets;
  }
  if (rule.target) {
    return [rule.target];
  }
  return [];
}

/** Check if a component matches a device filter. */
function matchesDeviceFilter(
  component: Component,
  filter: NonNullable<SharingRule["device_filter"]>
): boolean {
  // Only NVMe components have the interface fields we need to match against
  if (!isNVMe(component)) return false;

  if (filter.protocol !== undefined && component.interface.protocol !== filter.protocol) {
    return false;
  }
  if (filter.pcie_gen !== undefined && component.interface.pcie_gen !== filter.pcie_gen) {
    return false;
  }
  if (filter.form_factor !== undefined && component.form_factor !== filter.form_factor) {
    return false;
  }
  return true;
}


// ---------------------------------------------------------------------------
// RAM stick-level validation
// ---------------------------------------------------------------------------

/**
 * Top-level RAM validation for stick-level assignments.
 *
 * Collects all stick assignments from the flat assignments map, resolves each
 * stick to its parent kit, then runs per-kit and cross-kit validators.
 */
export function validateRAMStickAssignments(
  memoryConfig: MemoryConfig,
  assignments: Record<string, string>,
  components: Record<string, Component>
): ValidationResult[] {
  const results: ValidationResult[] = [];

  // Collect only entries where the value is a stick ID and the key is a DIMM slot
  const dimmSlotIds = new Set(memoryConfig.slots.map((s) => s.id));
  const stickAssignments: Record<string, string> = {};
  for (const [slotId, value] of Object.entries(assignments)) {
    if (dimmSlotIds.has(slotId) && parseStickId(value) !== null) {
      stickAssignments[slotId] = value;
    }
  }

  const assignedKitIds = getAssignedKitIds(stickAssignments);

  // Per-kit validations
  for (const kitId of assignedKitIds) {
    const kitComponent = components[kitId];
    if (!kitComponent || !isRAM(kitComponent)) continue;

    const kitEntries = getKitAssignments(stickAssignments, kitId);
    const kitSlotIds = Object.keys(kitEntries);
    const assignedStickCount = kitSlotIds.length;

    results.push(...validateDDRCompat(memoryConfig, kitComponent));
    results.push(...validateStickCountVsSlots(memoryConfig, kitComponent));
    results.push(...validateIncompleteKit(kitComponent, assignedStickCount));
    results.push(...validateDualChannel(memoryConfig, kitComponent, kitSlotIds));
  }

  // Cross-kit validations
  const allPopulatedSlotIds = Object.keys(stickAssignments);
  results.push(...validateMixedKits(assignedKitIds));
  results.push(
    ...validateTotalCapacity(memoryConfig, stickAssignments, components)
  );
  results.push(
    ...validateRecommendedPopulation(memoryConfig, allPopulatedSlotIds)
  );

  return results;
}

/**
 * Produces a warning when ALL sticks from a multi-stick kit are on the same
 * memory channel. Single-stick kits are skipped (dual-channel is irrelevant).
 */
function validateDualChannel(
  memoryConfig: MemoryConfig,
  kitComponent: RAMComponent,
  kitStickSlots: string[]
): ValidationResult[] {
  // Only relevant for multi-stick kits (modules > 1)
  if (kitComponent.capacity.modules <= 1) return [];
  if (kitStickSlots.length <= 1) return [];

  const channels = new Set<string>();
  for (const slotId of kitStickSlots) {
    const slot = memoryConfig.slots.find((s) => s.id === slotId);
    if (slot) channels.add(slot.channel);
  }

  if (channels.size === 1) {
    const channel = [...channels][0];
    return [
      {
        severity: "warning" as const,
        message: `${kitComponent.model}: all sticks are on channel ${channel} -- dual-channel mode is not active`,
        slotId: kitStickSlots[0],
        componentId: kitComponent.id,
      },
    ];
  }

  return [];
}

/**
 * Compares populated slot IDs against recommended_population.two_dimm or
 * four_dimm. Warning if mismatch, info if no recommendation for that count.
 */
function validateRecommendedPopulation(
  memoryConfig: MemoryConfig,
  allPopulatedSlotIds: string[]
): ValidationResult[] {
  const count = allPopulatedSlotIds.length;
  if (count === 0) return [];

  const rec = memoryConfig.recommended_population;
  let recommended: string[] | undefined;

  if (count === 2) {
    recommended = rec?.two_dimm;
  } else if (count === 4) {
    recommended = rec?.four_dimm;
  }

  // If there's a recommendation for this count, check it
  if (recommended && recommended.length > 0) {
    const recSet = new Set(recommended);
    const popSet = new Set(allPopulatedSlotIds);
    const match =
      recSet.size === popSet.size &&
      [...recSet].every((id) => popSet.has(id));

    if (!match) {
      const populatedStr = allPopulatedSlotIds.join(", ");
      const recommendedStr = recommended.join(", ");
      return [
        {
          severity: "warning" as const,
          message: `RAM in slots ${populatedStr} but recommended placement for ${count} DIMMs is ${recommendedStr}`,
          slotId: allPopulatedSlotIds[0],
          componentId: "",
        },
      ];
    }
    return [];
  }

  // No recommendation exists for this count
  return [
    {
      severity: "info" as const,
      message: `No manufacturer recommendation exists for ${count} DIMM population`,
      slotId: allPopulatedSlotIds[0],
      componentId: "",
    },
  ];
}

/**
 * Error when assignedStickCount < kitComponent.capacity.modules.
 */
function validateIncompleteKit(
  kitComponent: RAMComponent,
  assignedStickCount: number
): ValidationResult[] {
  const totalModules = kitComponent.capacity.modules;
  if (assignedStickCount >= totalModules) return [];

  const unassigned = totalModules - assignedStickCount;
  return [
    {
      severity: "error" as const,
      message: `${kitComponent.model}: ${unassigned} of ${totalModules} sticks unassigned -- all sticks must be installed`,
      slotId: "",
      componentId: kitComponent.id,
    },
  ];
}

/**
 * Warning when 2+ distinct kit IDs are assigned.
 */
function validateMixedKits(
  assignedKitIds: string[]
): ValidationResult[] {
  if (assignedKitIds.length < 2) return [];

  return [
    {
      severity: "warning" as const,
      message:
        "Multiple RAM kits detected -- mixing kits may prevent XMP/EXPO profiles from activating at rated speeds",
      slotId: "",
      componentId: "",
    },
  ];
}

/**
 * Error when sum of per_module_gb across all assigned sticks exceeds
 * max_capacity_gb.
 */
function validateTotalCapacity(
  memoryConfig: MemoryConfig,
  allStickAssignments: Record<string, string>,
  components: Record<string, Component>
): ValidationResult[] {
  let totalGb = 0;

  for (const stickId of Object.values(allStickAssignments)) {
    const parsed = parseStickId(stickId);
    if (!parsed) continue;
    const kit = components[parsed.componentId];
    if (!kit || !isRAM(kit)) continue;
    totalGb += kit.capacity.per_module_gb;
  }

  if (totalGb > memoryConfig.max_capacity_gb) {
    return [
      {
        severity: "error" as const,
        message: `Total RAM capacity (${totalGb} GB) exceeds this motherboard's maximum of ${memoryConfig.max_capacity_gb} GB`,
        slotId: "",
        componentId: "",
      },
    ];
  }

  return [];
}

/**
 * Error when kit's interface.type doesn't match memoryConfig.type.
 */
function validateDDRCompat(
  memoryConfig: MemoryConfig,
  kitComponent: RAMComponent
): ValidationResult[] {
  if (kitComponent.interface.type === memoryConfig.type) return [];

  return [
    {
      severity: "error" as const,
      message: `${kitComponent.model} is ${kitComponent.interface.type} but this motherboard requires ${memoryConfig.type}`,
      slotId: "",
      componentId: kitComponent.id,
    },
  ];
}

/**
 * Error when kit's capacity.modules exceeds number of DIMM slots.
 */
function validateStickCountVsSlots(
  memoryConfig: MemoryConfig,
  kitComponent: RAMComponent
): ValidationResult[] {
  const slotCount = memoryConfig.slots.length;
  if (kitComponent.capacity.modules <= slotCount) return [];

  return [
    {
      severity: "error" as const,
      message: `${kitComponent.model} has ${kitComponent.capacity.modules} sticks but this motherboard only has ${slotCount} DIMM slots`,
      slotId: "",
      componentId: kitComponent.id,
    },
  ];
}
