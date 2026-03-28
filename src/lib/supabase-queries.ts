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
  ComponentSummary,
  ComponentFilterOptions,
  ComponentPageResult,
  SharingRule,
  PCIeSlot,
  MotherboardSummary,
  MotherboardPageResult,
  FilterOptions,
} from "./types";
import type {
  MotherboardRow,
  SlotRow,
  PerTypeComponentRow,
  NvmeComponentRow,
  GpuComponentRow,
  RamComponentRow,
  SataComponentRow,
} from "./db-types";
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

  const motherboard: Motherboard = {
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

  if (row.length_mm !== null) {
    motherboard.length_mm = row.length_mm;
  }
  if (row.width_mm !== null) {
    motherboard.width_mm = row.width_mm;
  }
  if (row.slot_positions !== null) {
    motherboard.slot_positions = row.slot_positions;
  }

  return motherboard;
}


/**
 * Maps a flat per-type DB row to a lightweight ComponentSummary.
 *
 * Extracts id, type, manufacturer, model and builds the specs record
 * using keys that match COMPONENT_SPEC_COLUMNS so the table can render
 * them directly via getSpecValue().
 */
export function rowToComponentSummary(row: PerTypeComponentRow): ComponentSummary {
  const base = { id: row.id, type: row.type, manufacturer: row.manufacturer, model: row.model };

  switch (row.type) {
    case "nvme": {
      const r = row as NvmeComponentRow;
      return {
        ...base,
        specs: {
          "interface.protocol": r.interface_protocol,
          "interface.pcie_gen": r.interface_pcie_gen,
          "capacity_gb": r.capacity_gb,
        },
      };
    }
    case "gpu": {
      const r = row as GpuComponentRow;
      return {
        ...base,
        specs: {
          "interface.pcie_gen": r.interface_pcie_gen,
          "power.tdp_w": r.power_tdp_w,
          "physical.length_mm": r.physical_length_mm,
        },
      };
    }
    case "ram": {
      const r = row as RamComponentRow;
      return {
        ...base,
        specs: {
          "interface.type": r.interface_type,
          "interface.speed_mhz": r.interface_speed_mhz,
          "capacity.total_gb": r.capacity_total_gb,
        },
      };
    }
    case "sata_drive": {
      const r = row as SataComponentRow;
      return {
        ...base,
        specs: {
          "form_factor": r.form_factor,
          "capacity_gb": r.capacity_gb,
        },
      };
    }
  }
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
 * Fetches a single motherboard summary by its exact ID.
 * Returns a lightweight MotherboardSummary or null when no row matches.
 */
export async function fetchMotherboardSummaryById(
  id: string
): Promise<MotherboardSummary | null> {
  const { supabase } = await import("./supabase");

  const { data, error } = await supabase
    .from("motherboards")
    .select("id, manufacturer, model, chipset, socket, form_factor")
    .eq("id", id)
    .single();

  if (error || !data) return null;

  return data as MotherboardSummary;
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


/**
 * Fetches distinct manufacturer values from all 4 per-type component tables,
 * deduplicates and sorts alphabetically. Used to populate the manufacturer
 * filter dropdown on the components page.
 */
export async function fetchComponentFilterOptions(): Promise<ComponentFilterOptions> {
  const { supabase } = await import("./supabase");

  const tableNames = Object.values(COMPONENT_TABLE_MAP);

  const results = await Promise.all(
    tableNames.map((table) =>
      supabase.from(table).select("manufacturer")
    )
  );

  const allManufacturers = new Set<string>();

  for (const { data, error } of results) {
    if (error) {
      throw new Error(`Failed to fetch component filter options: ${error.message}`);
    }
    for (const row of data ?? []) {
      allManufacturers.add((row as { manufacturer: string }).manufacturer);
    }
  }

  return {
    manufacturers: [...allManufacturers].sort(),
  };
}

/** Parameters for fetching a paginated page of components. */
export interface ComponentPageParams {
  page: number;
  pageSize: number;
  type?: string | null;
  manufacturer?: string | null;
  search?: string | null;
}

/**
 * Fetches a paginated, filtered, searchable page of components from Supabase.
 *
 * When `type` is provided, queries the single corresponding per-type table.
 * When `type` is null/undefined, returns a placeholder (cross-table aggregation
 * is implemented separately).
 */
export async function fetchComponentPage(
  params: ComponentPageParams
): Promise<ComponentPageResult> {
  const { page, pageSize, type, manufacturer, search } = params;

  // Cross-table aggregation: query all 4 tables when no type filter
  if (!type) {
    const { supabase } = await import("./supabase");

    // Fixed table order: gpu, nvme, ram, sata_drive
    const TABLE_ORDER: { type: string; table: string }[] = [
      { type: "gpu", table: "components_gpu" },
      { type: "nvme", table: "components_nvme" },
      { type: "ram", table: "components_ram" },
      { type: "sata_drive", table: "components_sata" },
    ];

    // Helper to apply search/manufacturer filters to a query builder
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const applyFilters = (query: any, mfr?: string | null, srch?: string | null) => {
      let q = query;
      if (mfr) {
        q = q.eq("manufacturer", mfr);
      }
      if (srch) {
        const pattern = `%${srch}%`;
        q = q.or(`manufacturer.ilike.${pattern},model.ilike.${pattern}`);
      }
      return q;
    };

    // Step 1: Parallel count-only queries to all 4 tables
    const countResults = await Promise.all(
      TABLE_ORDER.map(({ table }) => {
        const q = applyFilters(
          supabase.from(table).select("*", { count: "exact", head: true }),
          manufacturer,
          search
        );
        return q;
      })
    );

    const tableCounts: number[] = [];
    for (const { count, error } of countResults) {
      if (error) {
        throw new Error(`Failed to fetch components: ${error.message}`);
      }
      tableCounts.push(count ?? 0);
    }

    // Step 2: Compute totalCount
    const totalCount = tableCounts.reduce((sum, c) => sum + c, 0);

    // Step 3: Compute global offset range for the requested page
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Step 4: Walk tables in order, find overlapping tables
    const allRows: ComponentSummary[] = [];
    let cumulative = 0;

    for (let i = 0; i < TABLE_ORDER.length; i++) {
      const tableCount = tableCounts[i];
      if (tableCount === 0) {
        continue;
      }

      const tableStart = cumulative;
      const tableEnd = cumulative + tableCount - 1;

      // Check if the requested range [from, to] overlaps with [tableStart, tableEnd]
      if (from > tableEnd || to < tableStart) {
        cumulative += tableCount;
        continue;
      }

      // Compute local from/to within this table
      const localFrom = Math.max(0, from - tableStart);
      const localTo = Math.min(tableCount - 1, to - tableStart);

      // Step 5: Fetch rows from this overlapping table
      let rowQuery = supabase
        .from(TABLE_ORDER[i].table)
        .select("*");

      rowQuery = applyFilters(rowQuery, manufacturer, search);

      rowQuery = rowQuery
        .order("manufacturer", { ascending: true })
        .order("model", { ascending: true })
        .range(localFrom, localTo);

      const { data, error } = await rowQuery;

      if (error) {
        throw new Error(`Failed to fetch components: ${error.message}`);
      }

      // Step 6: Map rows to ComponentSummary
      const mapped = (data ?? []).map((row) =>
        rowToComponentSummary(row as PerTypeComponentRow)
      );
      allRows.push(...mapped);

      cumulative += tableCount;
    }

    return { rows: allRows, totalCount };
  }

  const tableName = COMPONENT_TABLE_MAP[type];
  if (!tableName) {
    return { rows: [], totalCount: 0 };
  }

  const { supabase } = await import("./supabase");

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from(tableName)
    .select("*", { count: "exact" });

  if (manufacturer) {
    query = query.eq("manufacturer", manufacturer);
  }

  if (search) {
    const pattern = `%${search}%`;
    query = query.or(
      `manufacturer.ilike.${pattern},model.ilike.${pattern}`
    );
  }

  query = query
    .order("manufacturer", { ascending: true })
    .order("model", { ascending: true })
    .range(from, to);

  const { data, count, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch components: ${error.message}`);
  }

  const rows = (data ?? []).map((row) =>
    rowToComponentSummary(row as PerTypeComponentRow)
  );

  return {
    rows,
    totalCount: count ?? 0,
  };
}
