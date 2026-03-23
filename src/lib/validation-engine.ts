import type {
  Motherboard,
  Component,
  NVMeComponent,
  ValidationResult,
  M2Slot,
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

      // PCIe slot and SATA port rules can be added later.
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

  return results;
}
