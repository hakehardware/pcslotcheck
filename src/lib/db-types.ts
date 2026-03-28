/**
 * Shared database row types and reconstruction utilities.
 *
 * This module contains types and functions shared between the sync pipeline
 * (scripts/sync.ts) and the client-side query layer (src/lib/supabase-queries.ts).
 * It must NOT import any Node.js-only modules (fs, path, etc.) since it gets
 * bundled into the browser.
 */

import type {
  SharingRule,
  SlotPosition,
  Component,
  NVMeComponent,
  GPUComponent,
  RAMComponent,
  SATAComponent,
} from "./types";

// ─── Motherboard Row ─────────────────────────────────────────────────

export interface MotherboardRow {
  id: string;
  manufacturer: string;
  model: string;
  chipset: string;
  socket: string;
  form_factor: string;
  memory_type: string;
  memory_max_speed_mhz: number;
  memory_base_speed_mhz: number;
  memory_max_capacity_gb: number;
  memory_ecc_support: boolean;
  memory_channels: number;
  memory_recommended_2dimm: string[];
  cpu_max_tdp_w: number | null;
  cpu_pcie_lanes: number | null;
  cpu_supported_series: string[] | null;
  notes: string[] | null;
  sources: { type: string; url: string }[];
  contributed_by: string | null;
  last_verified: string | null;
  length_mm: number | null;
  width_mm: number | null;
  slot_positions: SlotPosition[] | null;
  schema_version: string;
  updated_at: string;
}

// ─── Slot Row ────────────────────────────────────────────────────────

export interface SlotRow {
  id: string;
  motherboard_id: string;
  category: "memory" | "m2" | "pcie" | "sata";
  label: string;
  // M.2-specific
  m2_interface: string | null;
  m2_gen: number | null;
  m2_lanes: number | null;
  m2_form_factors: string[] | null;
  m2_supports_sata: boolean | null;
  m2_heatsink_included: boolean | null;
  // PCIe-specific
  pcie_gen: number | null;
  pcie_electrical_lanes: number | null;
  pcie_physical_size: string | null;
  pcie_reinforced: boolean | null;
  // Memory-specific
  dimm_channel: string | null;
  dimm_position: number | null;
  dimm_recommended: boolean | null;
  // SATA-specific
  sata_version: string | null;
  // Common columns
  source: string | null;
  disabled_by: string | null;
  sharing_rules: SharingRule[] | null;
  notes: string[] | null;
  sort_order: number;
}

// ─── Per-Type Component Rows ─────────────────────────────────────────

export interface ComponentRowBase {
  id: string;
  type: string;
  manufacturer: string;
  model: string;
  sku: string | null;
  summary_line: string;
  sources: { type: string; url: string }[] | null;
  contributed_by: string | null;
  schema_version: string;
  updated_at: string;
}

export interface NvmeComponentRow extends ComponentRowBase {
  type: "nvme";
  interface_protocol: string;
  interface_pcie_gen: number | null;
  interface_lanes: number | null;
  form_factor: string;
  capacity_gb: number;
  capacity_variant_note: string | null;
}

export interface GpuComponentRow extends ComponentRowBase {
  type: "gpu";
  chip_manufacturer: string | null;
  interface_pcie_gen: number;
  interface_lanes: number;
  physical_slot_width: number;
  physical_length_mm: number;
  physical_slots_occupied: number;
  power_tdp_w: number;
  power_recommended_psu_w: number | null;
  power_connectors: { type: string; count: number }[];
}

export interface RamComponentRow extends ComponentRowBase {
  type: "ram";
  interface_type: string;
  interface_speed_mhz: number;
  interface_base_speed_mhz: number | null;
  capacity_per_module_gb: number;
  capacity_modules: number;
  capacity_total_gb: number;
}

export interface SataComponentRow extends ComponentRowBase {
  type: "sata_drive";
  form_factor: string;
  capacity_gb: number;
  interface: string;
}

export type PerTypeComponentRow =
  | NvmeComponentRow
  | GpuComponentRow
  | RamComponentRow
  | SataComponentRow;

/** Maps component type strings to their per-type Supabase table names. */
export const COMPONENT_TABLE_MAP: Record<string, string> = {
  nvme: "components_nvme",
  gpu: "components_gpu",
  ram: "components_ram",
  sata_drive: "components_sata",
};

// ─── Reconstruction ──────────────────────────────────────────────────

/**
 * Reconstructs a full typed Component union from a flat per-type DB row.
 * Used by both the sync pipeline (for manifest generation) and the
 * client query layer (for Supabase fetches).
 */
export function reconstructComponent(row: PerTypeComponentRow): Component {
  switch (row.type) {
    case "nvme": {
      const result: NVMeComponent = {
        id: row.id,
        type: "nvme",
        manufacturer: row.manufacturer,
        model: row.model,
        interface: {
          protocol: row.interface_protocol as "NVMe" | "SATA",
          pcie_gen: row.interface_pcie_gen,
          lanes: row.interface_lanes,
        },
        form_factor: row.form_factor,
        capacity_gb: row.capacity_gb,
        schema_version: row.schema_version,
      };
      if (row.capacity_variant_note !== null) {
        result.capacity_variant_note = row.capacity_variant_note;
      }
      return result;
    }
    case "gpu": {
      return {
        id: row.id,
        type: "gpu",
        chip_manufacturer: row.chip_manufacturer!,
        manufacturer: row.manufacturer,
        model: row.model,
        interface: {
          pcie_gen: row.interface_pcie_gen,
          lanes: row.interface_lanes,
        },
        physical: {
          slot_width: row.physical_slot_width,
          length_mm: row.physical_length_mm,
          slots_occupied: row.physical_slots_occupied,
        },
        power: {
          tdp_w: row.power_tdp_w,
          recommended_psu_w: row.power_recommended_psu_w!,
          power_connectors: row.power_connectors,
        },
        schema_version: row.schema_version,
      } as GPUComponent;
    }
    case "ram": {
      return {
        id: row.id,
        type: "ram",
        manufacturer: row.manufacturer,
        model: row.model,
        interface: {
          type: row.interface_type as "DDR4" | "DDR5",
          speed_mhz: row.interface_speed_mhz,
          base_speed_mhz: row.interface_base_speed_mhz!,
        },
        capacity: {
          per_module_gb: row.capacity_per_module_gb,
          modules: row.capacity_modules,
          total_gb: row.capacity_total_gb,
        },
        schema_version: row.schema_version,
      } as RAMComponent;
    }
    case "sata_drive": {
      return {
        id: row.id,
        type: "sata_drive",
        manufacturer: row.manufacturer,
        model: row.model,
        form_factor: row.form_factor,
        capacity_gb: row.capacity_gb,
        interface: row.interface,
        schema_version: row.schema_version,
      } as SATAComponent;
    }
  }
}
