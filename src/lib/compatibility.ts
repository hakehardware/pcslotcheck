import type {
  ComponentSummary,
  MotherboardSummary,
  Motherboard,
  SlotPosition,
} from "./types";

// --- Types ---

/** Result of a compatibility check */
export interface CompatibilityResult {
  compatible: boolean;
  reason: string | null; // null when compatible, human-readable string when not
}

/** Annotated component for search results */
export type AnnotatedComponent = ComponentSummary & {
  compatible: boolean;
  reason: string | null;
};

// --- Mappings ---

/** Maps each slot type to the component types that belong in that category */
export const SLOT_TYPE_TO_COMPONENT_TYPES: Record<
  SlotPosition["slot_type"],
  string[]
> = {
  pcie: ["gpu"],
  m2: ["nvme"],
  dimm: ["ram"],
  cpu: ["cpu"],
  sata_group: ["sata_ssd", "sata_hdd", "sata_drive"],
};

// --- Compatibility ---

/**
 * Check if a ComponentSummary is compatible with a given slot on a motherboard.
 *
 * Rules:
 * - GPU to PCIe: always compatible
 * - NVMe to M.2: protocol must match slot interface (with supports_sata gate)
 * - RAM to DIMM: interface.type must match motherboard.memory.type
 * - CPU to socket: socket must match motherboard.socket
 * - SATA to bay: always compatible
 * - Type mismatch: incompatible
 */
export function checkCompatibility(
  component: ComponentSummary,
  slotType: SlotPosition["slot_type"],
  motherboard: Motherboard,
  slotId?: string,
): CompatibilityResult {
  const allowedTypes = SLOT_TYPE_TO_COMPONENT_TYPES[slotType];
  if (!allowedTypes || !allowedTypes.includes(component.type)) {
    return {
      compatible: false,
      reason: `Component type "${component.type}" is not compatible with ${slotType} slots`,
    };
  }

  switch (slotType) {
    case "pcie":
      // GPU to PCIe: always compatible
      return { compatible: true, reason: null };

    case "m2": {
      // NVMe to M.2: protocol matching
      const protocol = component.specs["interface.protocol"] as
        | string
        | undefined;
      const m2Slot = slotId
        ? motherboard.m2_slots.find((s) => s.id === slotId)
        : undefined;

      // If we can't find the specific slot, treat as compatible (safe default)
      if (!m2Slot) {
        return { compatible: true, reason: null };
      }

      const slotInterface = m2Slot.interface; // "PCIe" | "SATA" | "PCIe_or_SATA"

      if (protocol === "NVMe") {
        // NVMe protocol matches PCIe or PCIe_or_SATA
        if (slotInterface === "PCIe" || slotInterface === "PCIe_or_SATA") {
          return { compatible: true, reason: null };
        }
        return {
          compatible: false,
          reason: `Requires NVMe interface, slot only supports SATA`,
        };
      }

      if (protocol === "SATA") {
        // SATA protocol matches SATA, or PCIe_or_SATA when supports_sata is true
        if (slotInterface === "SATA") {
          return { compatible: true, reason: null };
        }
        if (slotInterface === "PCIe_or_SATA" && m2Slot.supports_sata) {
          return { compatible: true, reason: null };
        }
        return {
          compatible: false,
          reason: `Requires SATA interface, slot does not support SATA`,
        };
      }

      // Unknown protocol -- treat as compatible
      return { compatible: true, reason: null };
    }

    case "dimm": {
      // RAM to DIMM: interface.type must match motherboard.memory.type
      const ramType = component.specs["interface.type"] as string | undefined;
      const boardMemType = motherboard.memory.type;

      if (ramType && ramType !== boardMemType) {
        return {
          compatible: false,
          reason: `${ramType} -- board requires ${boardMemType}`,
        };
      }
      return { compatible: true, reason: null };
    }

    case "cpu": {
      // CPU to socket: socket must match
      const cpuSocket = component.specs["socket"] as string | undefined;
      const boardSocket = motherboard.socket;

      if (cpuSocket && cpuSocket !== boardSocket) {
        return {
          compatible: false,
          reason: `Wrong socket: ${cpuSocket}, board has ${boardSocket}`,
        };
      }
      return { compatible: true, reason: null };
    }

    case "sata_group":
      // SATA to bay: always compatible
      return { compatible: true, reason: null };

    default:
      return { compatible: true, reason: null };
  }
}

// --- Filtering ---

/**
 * Filter and annotate components for a given slot.
 *
 * When compatibleOnly is true, returns only components that pass checkCompatibility.
 * When compatibleOnly is false, returns all components whose type is in the
 * slot's category, annotated with compatible/reason.
 */
export function filterComponentsForSlot(
  components: ComponentSummary[],
  slotType: SlotPosition["slot_type"],
  motherboard: Motherboard,
  compatibleOnly: boolean,
  slotId?: string,
): AnnotatedComponent[] {
  const allowedTypes = SLOT_TYPE_TO_COMPONENT_TYPES[slotType] ?? [];

  // First filter to only components in this slot's category
  const categoryComponents = components.filter((c) =>
    allowedTypes.includes(c.type),
  );

  // Annotate each with compatibility info
  const annotated: AnnotatedComponent[] = categoryComponents.map((c) => {
    const result = checkCompatibility(c, slotType, motherboard, slotId);
    return { ...c, compatible: result.compatible, reason: result.reason };
  });

  if (compatibleOnly) {
    return annotated.filter((c) => c.compatible);
  }

  return annotated;
}

// --- Search ---

/**
 * Fuzzy text match against relevant fields of a motherboard or component.
 *
 * For MotherboardSummary: matches against manufacturer, model, chipset, socket.
 * For ComponentSummary: matches against manufacturer, model.
 *
 * Uses lowercase substring matching.
 */
export function matchesSearch(
  item: MotherboardSummary | ComponentSummary,
  query: string,
): boolean {
  if (!query) return true;

  const lowerQuery = query.toLowerCase();

  // Common fields
  const fields: string[] = [item.manufacturer, item.model];

  // MotherboardSummary has chipset and socket
  if ("chipset" in item) {
    const mb = item as MotherboardSummary;
    fields.push(mb.chipset, mb.socket);
  }

  return fields.some(
    (field) => field != null && field.toLowerCase().includes(lowerQuery),
  );
}
