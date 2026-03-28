// === Slot Position Types ===

/** Percentage-based slot position on the board */
export interface SlotPosition {
  slot_type: "cpu" | "dimm" | "pcie" | "m2" | "sata_group";
  slot_id: string;
  x_pct: number;   // 0-100, left edge
  y_pct: number;   // 0-100, top edge
  width_pct: number;  // 0-100
  height_pct: number; // 0-100
}

// === Motherboard Types ===

export interface MemorySlot {
  id: string;
  channel: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";
  position: number;
  recommended: boolean;
}

export interface MemoryConfig {
  type: "DDR4" | "DDR5";
  max_speed_mhz: number;
  base_speed_mhz: number;
  max_capacity_gb: number;
  ecc_support: boolean;
  channels: number;
  slots: MemorySlot[];
  recommended_population: {
    two_dimm: string[];
    four_dimm?: string[];
  };
}

export interface SharingTrigger {
  slot_ids: string[];
  logic: "and" | "or" | "any_populated";
}

export interface DeviceFilter {
  protocol?: "NVMe" | "SATA";
  pcie_gen?: number;
  form_factor?: string;
}

export interface SharingRule {
  type: "disables" | "bandwidth_split";
  targets?: string[];
  target?: string;
  direction?: "m2_to_pcie" | "pcie_to_m2" | "m2_to_sata" | "sata_to_pcie";
  trigger?: SharingTrigger;
  device_filter?: DeviceFilter;
  degraded_lanes?: number;
  // Legacy human-readable fields (kept for backward compat)
  condition?: string;
  effect?: string;
}

export interface CPUOverride {
  microarchitecture: string;
  gen?: number;
  lanes?: number;
}

export interface M2Slot {
  id: string;
  label: string;
  interface: "PCIe" | "SATA" | "PCIe_or_SATA";
  gen: number;
  lanes: number;
  form_factors: string[];
  source: "CPU" | "Chipset";
  supports_sata: boolean;
  heatsink_included: boolean;
  sharing: SharingRule[] | null;
  cpu_overrides?: CPUOverride[];
}

export interface PCIeSlot {
  id: string;
  label: string;
  gen: number;
  electrical_lanes: number;
  physical_size: "x1" | "x4" | "x8" | "x16";
  position: number;
  source: "CPU" | "Chipset";
  reinforced: boolean;
  sharing: SharingRule[] | null;
  cpu_overrides?: CPUOverride[];
}

export interface SATAPort {
  id: string;
  version: string;
  source: "CPU" | "Chipset";
  disabled_by: string | null;
  sharing?: SharingRule[] | null;
}

export interface Motherboard {
  id: string;
  manufacturer: string;
  model: string;
  chipset: string;
  socket: string;
  form_factor: string;
  memory: MemoryConfig;
  m2_slots: M2Slot[];
  pcie_slots: PCIeSlot[];
  sata_ports: SATAPort[];
  sources: { type: string; url: string }[];
  schema_version: string;
  length_mm?: number;
  width_mm?: number;
  slot_positions?: SlotPosition[];
}

// === Component Types ===

export interface NVMeComponent {
  id: string;
  type: "nvme";
  manufacturer: string;
  model: string;
  interface: {
    protocol: "NVMe" | "SATA";
    pcie_gen: number | null;
    lanes: number | null;
  };
  form_factor: string;
  capacity_gb: number;
  capacity_variant_note?: string;
  schema_version: string;
}

export interface GPUComponent {
  id: string;
  type: "gpu";
  chip_manufacturer: string;
  manufacturer: string;
  model: string;
  interface: {
    pcie_gen: number;
    lanes: number;
  };
  physical: {
    slot_width: number;
    length_mm: number;
    slots_occupied: number;
  };
  power: {
    tdp_w: number;
    recommended_psu_w: number;
    power_connectors: { type: string; count: number }[];
  };
  schema_version: string;
}

export interface RAMComponent {
  id: string;
  type: "ram";
  manufacturer: string;
  model: string;
  interface: {
    type: "DDR4" | "DDR5";
    speed_mhz: number;
    base_speed_mhz: number;
  };
  capacity: {
    per_module_gb: number;
    modules: number;
    total_gb: number;
  };
  schema_version: string;
}

export interface SATASSDComponent {
  id: string;
  type: "sata_ssd";
  manufacturer: string;
  model: string;
  form_factor: string;
  capacity_gb: number;
  interface: string;
  drive_type: "ssd";
  schema_version: string;
}

export interface SATAHDDComponent {
  id: string;
  type: "sata_hdd";
  manufacturer: string;
  model: string;
  form_factor: string;
  capacity_gb: number;
  interface: string;
  drive_type: "hdd";
  schema_version: string;
}

export interface CPUComponent {
  id: string;
  type: "cpu";
  manufacturer: string;
  model: string;
  socket: string;
  microarchitecture: string;
  architecture: string;
  pcie_config: {
    cpu_gen: number;
    cpu_lanes?: number;
  };
  cores?: number;
  threads?: number;
  tdp_w?: number;
  schema_version: string;
}

export type Component = NVMeComponent | GPUComponent | RAMComponent | SATASSDComponent | SATAHDDComponent | SATAComponent | CPUComponent;

/**
 * Backward-compat alias for the legacy `sata_drive` DB row type.
 * The database layer (Phase 2) still stores SATA components as `sata_drive`.
 * Use SATASSDComponent or SATAHDDComponent for new code.
 */
export interface SATAComponent {
  id: string;
  type: "sata_drive";
  manufacturer: string;
  model: string;
  form_factor: string;
  capacity_gb: number;
  interface: string;
  schema_version: string;
}

// === Validation Types ===

export type Severity = "error" | "warning" | "info";

export interface ValidationResult {
  severity: Severity;
  message: string;
  slotId: string;
  componentId: string;
}

// === Sharing Types ===

export type SlotAssignment = Record<string, string>;

export interface SharedBuild {
  motherboardId: string;
  assignments: SlotAssignment;
  cpuId?: string;
}

// === Component Table Types ===

export interface ComponentSummary {
  id: string;
  type: string;
  manufacturer: string;
  model: string;
  specs: Record<string, unknown>;
}

export interface ComponentPageResult {
  rows: ComponentSummary[];
  totalCount: number;
}

export interface ComponentFilterOptions {
  manufacturers: string[];
}

// === Motherboard Table Selector Types ===

export interface MotherboardSummary {
  id: string;
  manufacturer: string;
  model: string;
  chipset: string;
  socket: string;
  form_factor: string;
}

// === Manifest Type ===

export interface DataManifest {
  motherboards: MotherboardSummary[];
  components: ComponentSummary[];
}

export interface MotherboardPageResult {
  rows: MotherboardSummary[];
  totalCount: number;
}

export interface FilterOptions {
  manufacturers: string[];
  chipsets: string[];
}
