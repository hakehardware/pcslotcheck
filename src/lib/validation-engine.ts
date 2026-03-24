import type {
  Motherboard,
  Component,
  NVMeComponent,
  GPUComponent,
  SATAComponent,
  RAMComponent,
  ValidationResult,
  MemoryConfig,
  M2Slot,
  PCIeSlot,
  SATAPort,
  SharingRule,
} from "./types";

/**
 * Validates component-to-slot assignments against motherboard compatibility rules.
 * Runs entirely client-side — no server calls.
 */
export function validateAssignments(
  motherboard: Motherboard,
  assignments: Record<string, string>,
  components: Record<string, Component>
): ValidationResult[] {
  try {
    if (!motherboard || !assignments) return [];

    const results: ValidationResult[] = [];

    for (const [slotId, componentId] of Object.entries(assignments)) {
      const component = components?.[componentId];
      if (!component) continue;

      const m2Slot = motherboard.m2_slots?.find((s) => s.id === slotId);
      if (m2Slot) {
        results.push(...validateM2Assignment(m2Slot, component, slotId, componentId));
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

      // Memory slot validation -- route to validateRAMAssignment
      const memorySlot = motherboard.memory?.slots?.find((s) => s.id === slotId);
      if (memorySlot) {
        results.push(
          ...validateRAMAssignment(
            motherboard.memory,
            component,
            slotId,
            componentId,
            assignments,
            components
          )
        );
        continue;
      }

      // Unknown slot IDs are silently skipped.
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

function isGPU(component: Component): component is GPUComponent {
  return component.type === "gpu";
}

function isSATA(component: Component): component is SATAComponent {
  return component.type === "sata_drive";
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
  componentId: string
): ValidationResult[] {
  if (!isNVMe(component)) return [];

  const results: ValidationResult[] = [];

  // Error: SATA M.2 drive in an NVMe-only slot
  if (component.interface.protocol === "SATA" && !slot.supports_sata) {
    results.push({
      severity: "error",
      message: `${component.model} uses SATA protocol but slot ${slot.label} does not support SATA — this drive will not be detected.`,
      slotId,
      componentId,
    });
  }

  // Warning: Gen5 NVMe in a Gen4 slot — performance impact
  if (component.interface.pcie_gen === 5 && slot.gen === 4) {
    results.push({
      severity: "warning",
      message: `${component.model} is a Gen5 NVMe drive but slot ${slot.label} is Gen4 — the drive will run at reduced bandwidth.`,
      slotId,
      componentId,
    });
  }

  // Info: Gen4 NVMe in a Gen5 slot — wastes slot potential
  if (component.interface.pcie_gen === 4 && slot.gen === 5) {
    results.push({
      severity: "info",
      message: `${component.model} is a Gen4 NVMe drive in a Gen5 slot (${slot.label}) — consider swapping with a Gen5 drive to use the slot's full bandwidth.`,
      slotId,
      componentId,
    });
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
