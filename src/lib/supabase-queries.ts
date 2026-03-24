/**
 * Supabase data fetching and reassembly functions.
 *
 * These functions replace static JSON fetches with Supabase queries.
 * The `assembleMotherboard` function reassembles flat DB rows back into
 * the nested `Motherboard` TypeScript type used by the application.
 */

import type {
  Motherboard,
  Component,
  SharingRule,
} from "./types";
import type { MotherboardRow, SlotRow } from "../../scripts/sync";

/**
 * Reassembles flat DB rows (motherboard row + slot rows) back into the
 * nested `Motherboard` TypeScript type.
 *
 * Filters slot rows by `category` and maps each to the corresponding
 * typed array: MemorySlot[], M2Slot[], PCIeSlot[], SATAPort[].
 * Reconstructs the `memory` config including `recommended_population.two_dimm`
 * from the flattened `memory_recommended_2dimm` column.
 */
export function assembleMotherboard(row: MotherboardRow, slotRows: SlotRow[]): Motherboard {
  const memorySlots = slotRows
    .filter(s => s.category === "memory")
    .map(s => ({
      id: s.id,
      channel: s.dimm_channel as "A" | "B",
      position: s.dimm_position!,
      recommended: s.dimm_recommended!,
    }));

  const m2Slots = slotRows
    .filter(s => s.category === "m2")
    .map(s => ({
      id: s.id,
      label: s.label,
      interface: s.m2_interface as "PCIe" | "SATA" | "PCIe_or_SATA",
      gen: s.m2_gen!,
      lanes: s.m2_lanes!,
      form_factors: s.m2_form_factors!,
      source: s.source as "CPU" | "Chipset",
      supports_sata: s.m2_supports_sata!,
      heatsink_included: s.m2_heatsink_included!,
      sharing: s.sharing_rules as SharingRule[] | null,
    }));

  const pcieSlots = slotRows
    .filter(s => s.category === "pcie")
    .map(s => ({
      id: s.id,
      label: s.label,
      gen: s.pcie_gen!,
      electrical_lanes: s.pcie_electrical_lanes!,
      physical_size: s.pcie_physical_size as "x1" | "x4" | "x8" | "x16",
      source: s.source as "CPU" | "Chipset",
      reinforced: s.pcie_reinforced!,
      sharing: s.sharing_rules as SharingRule[] | null,
    }));

  const sataPorts = slotRows
    .filter(s => s.category === "sata")
    .map(s => ({
      id: s.id,
      version: s.sata_version!,
      source: s.source as "CPU" | "Chipset",
      disabled_by: s.disabled_by,
    }));

  return {
    id: row.id,
    manufacturer: row.manufacturer,
    model: row.model,
    chipset: row.chipset,
    socket: row.socket,
    form_factor: row.form_factor,
    memory: {
      type: row.memory_type as "DDR4" | "DDR5",
      max_speed_mhz: row.memory_max_speed_mhz,
      base_speed_mhz: row.memory_base_speed_mhz,
      max_capacity_gb: row.memory_max_capacity_gb,
      ecc_support: row.memory_ecc_support,
      channels: row.memory_channels,
      slots: memorySlots,
      recommended_population: {
        two_dimm: row.memory_recommended_2dimm,
      },
    },
    m2_slots: m2Slots,
    pcie_slots: pcieSlots,
    sata_ports: sataPorts,
    sources: row.sources,
    schema_version: row.schema_version,
  };
}


/**
 * Fetches a motherboard and all its slots from Supabase, assembles into
 * the nested Motherboard type. Returns null when no motherboard row found.
 */
export async function fetchMotherboardFromSupabase(id: string): Promise<Motherboard | null> {
  const { supabase } = await import("./supabase");

  const { data: row, error: mbError } = await supabase
    .from("motherboards")
    .select("*")
    .eq("id", id)
    .single();

  if (mbError || !row) return null;

  const { data: slotRows, error: slotError } = await supabase
    .from("slots")
    .select("*")
    .eq("motherboard_id", id)
    .order("sort_order");

  if (slotError) return null;

  return assembleMotherboard(row as MotherboardRow, (slotRows ?? []) as SlotRow[]);
}

/**
 * Fetches a component from Supabase and reconstructs the full typed object
 * by merging base fields with the specs JSONB column.
 * Returns null when no component row found.
 */
export async function fetchComponentFromSupabase(id: string): Promise<Component | null> {
  const { supabase } = await import("./supabase");

  const { data: row, error } = await supabase
    .from("components")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !row) return null;

  const { id: compId, type, manufacturer, model, specs, schema_version } = row as {
    id: string;
    type: string;
    manufacturer: string;
    model: string;
    specs: Record<string, unknown>;
    schema_version: string;
  };

  return {
    id: compId,
    type,
    manufacturer,
    model,
    schema_version,
    ...specs,
  } as Component;
}
