import type {
  Motherboard,
  Component,
  NVMeComponent,
  GPUComponent,
  ValidationResult,
  M2Slot,
  PCIeSlot,
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

      // PCIe slot validation — route GPU assignments to validatePCIeAssignment
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

      // SATA port rules can be added later.
      // Unknown slot IDs are silently skipped.
    }

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

  // Append capacity variant note to all messages if present
  if (component.capacity_variant_note && component.capacity_variant_note.trim().length > 0) {
    for (const result of results) {
      result.message = `${result.message} [Note: ${component.capacity_variant_note}]`;
    }
  }

  return results;
}
