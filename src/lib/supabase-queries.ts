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
  PCIeSlot,
  MotherboardSummary,
  MotherboardPageResult,
  FilterOptions,
} from "./types";
import type { MotherboardRow, SlotRow, PerTypeComponentRow } from "./db-types";
import { COMPONENT_TABLE_MAP, reconstructComponent } from "./db-types";

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
    pcie_slots: pcieSlots as PCIeSlot[],
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
 * Fetches a component from the correct per-type Supabase table and
 * reconstructs the full typed Component union from flat columns.
 * Returns null when the type is unknown or no component row is found.
 */
export async function fetchComponentFromSupabase(
  id: string,
  type: string
): Promise<Component | null> {
  const { supabase } = await import("./supabase");

  const tableName = COMPONENT_TABLE_MAP[type];
  if (!tableName) return null;

  const { data: row, error } = await supabase
    .from(tableName)
    .select("*")
    .eq("id", id)
    .single();

  if (error || !row) return null;

  return reconstructComponent(row as PerTypeComponentRow);
}

/**
 * Fetches a paginated, filtered, searchable page of motherboards from Supabase.
 * Supports manufacturer/chipset exact-match filters and case-insensitive
 * text search across manufacturer, model, chipset, and socket columns.
 */
export async function fetchMotherboardPage(params: {
  page: number;
  pageSize: number;
  manufacturer?: string | null;
  chipset?: string | null;
  search?: string | null;
}): Promise<MotherboardPageResult> {
  const { supabase } = await import("./supabase");

  const { page, pageSize, manufacturer, chipset, search } = params;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("motherboards")
    .select("id, manufacturer, model, chipset, socket, form_factor", { count: "exact" });

  if (manufacturer) {
    query = query.eq("manufacturer", manufacturer);
  }

  if (chipset) {
    query = query.eq("chipset", chipset);
  }

  if (search) {
    const pattern = `%${search}%`;
    query = query.or(
      `manufacturer.ilike.${pattern},model.ilike.${pattern},chipset.ilike.${pattern},socket.ilike.${pattern}`
    );
  }

  query = query
    .order("manufacturer", { ascending: true })
    .order("model", { ascending: true })
    .range(from, to);

  const { data, count, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch motherboards: ${error.message}`);
  }

  return {
    rows: (data ?? []) as MotherboardSummary[],
    totalCount: count ?? 0,
  };
}

/**
 * Fetches distinct manufacturer and chipset values from the motherboards table
 * for populating filter dropdowns. Deduplicates and sorts alphabetically.
 */
export async function fetchFilterOptions(): Promise<FilterOptions> {
  const { supabase } = await import("./supabase");

  const { data, error } = await supabase
    .from("motherboards")
    .select("manufacturer, chipset");

  if (error) {
    throw new Error(`Failed to fetch filter options: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{ manufacturer: string; chipset: string }>;

  const manufacturers = [...new Set(rows.map((r) => r.manufacturer))].sort();
  const chipsets = [...new Set(rows.map((r) => r.chipset))].sort();

  return { manufacturers, chipsets };
}
