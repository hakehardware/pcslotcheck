/**
 * Supabase Sync Pipeline
 *
 * Reads YAML data files, validates against JSON Schema, transforms into
 * flat DB rows, and upserts into Supabase Postgres tables.
 *
 * This file is built incrementally:
 * - Task 2.1: transformMotherboard (flatten nested YAML → DB columns)
 * - Task 2.2: transformSlots (all slot categories)
 * - Task 2.3: transformComponent + generateSummaryLine
 * - Task 4.x: sync orchestration, YAML discovery, upsert logic
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { createClient } from "@supabase/supabase-js";
import type { SharingRule } from "../src/lib/types";

// ─── YAML Input Types ────────────────────────────────────────────────

/** Shape of a motherboard YAML file after parsing. */
export interface MotherboardYAML {
  id: string;
  manufacturer: string;
  model: string;
  chipset: string;
  socket: string;
  form_factor: string;
  schema_version: string;

  memory: {
    type: "DDR4" | "DDR5";
    max_speed_mhz: number;
    base_speed_mhz: number;
    max_capacity_gb: number;
    ecc_support: boolean;
    channels: number;
    slots: {
      id: string;
      channel: "A" | "B";
      position: number;
      recommended: boolean;
    }[];
    recommended_population: {
      two_dimm: string[];
      four_dimm?: string[];
    };
  };

  m2_slots: {
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
  }[];

  pcie_slots: {
    id: string;
    label: string;
    gen: number;
    electrical_lanes: number;
    physical_size: "x1" | "x4" | "x8" | "x16";
    source: "CPU" | "Chipset";
    reinforced: boolean;
    sharing: SharingRule[] | null;
  }[];

  sata_ports: {
    id: string;
    version: string;
    source: "CPU" | "Chipset";
    disabled_by: string | null;
  }[];

  cpu?: {
    max_tdp_w?: number;
    pcie_lanes_from_cpu?: number;
    supported_series?: string[];
  };

  notes?: string[];
  sources: { type: string; url: string }[];
  contributed_by?: string;
  last_verified?: string;
}

/** Shape of a component YAML file after parsing. */
export interface ComponentYAML {
  id: string;
  type: string;
  manufacturer: string;
  model: string;
  sku?: string;
  sources?: { type: string; url: string }[];
  contributed_by?: string;
  schema_version: string;
  [key: string]: unknown;
}

// ─── DB Row Types ────────────────────────────────────────────────────

// Re-export shared DB row types and utilities from the browser-safe module.
// These were extracted so supabase-queries.ts can import them without pulling
// in Node.js-only dependencies (fs, path, js-yaml, ajv).
export type {
  MotherboardRow,
  SlotRow,
  ComponentRowBase,
  NvmeComponentRow,
  GpuComponentRow,
  RamComponentRow,
  SataComponentRow,
  PerTypeComponentRow,
} from "../src/lib/db-types";
export { COMPONENT_TABLE_MAP, reconstructComponent } from "../src/lib/db-types";

// Local imports for use within this file's transform functions.
import type {
  MotherboardRow,
  SlotRow,
  PerTypeComponentRow,
  NvmeComponentRow,
  GpuComponentRow,
  RamComponentRow,
  SataComponentRow,
} from "../src/lib/db-types";
import { COMPONENT_TABLE_MAP } from "../src/lib/db-types";

// ─── Transform Functions ─────────────────────────────────────────────

/**
 * Flattens a nested motherboard YAML structure into a flat DB row.
 * Memory and CPU sections are unpacked into top-level columns.
 * Sets `updated_at` to the current ISO timestamp.
 */
export function transformMotherboard(yaml: MotherboardYAML): MotherboardRow {
  return {
    id: yaml.id,
    manufacturer: yaml.manufacturer,
    model: yaml.model,
    chipset: yaml.chipset,
    socket: yaml.socket,
    form_factor: yaml.form_factor,
    memory_type: yaml.memory.type,
    memory_max_speed_mhz: yaml.memory.max_speed_mhz,
    memory_base_speed_mhz: yaml.memory.base_speed_mhz,
    memory_max_capacity_gb: yaml.memory.max_capacity_gb,
    memory_ecc_support: yaml.memory.ecc_support,
    memory_channels: yaml.memory.channels,
    memory_recommended_2dimm: yaml.memory.recommended_population.two_dimm,
    cpu_max_tdp_w: yaml.cpu?.max_tdp_w ?? null,
    cpu_pcie_lanes: yaml.cpu?.pcie_lanes_from_cpu ?? null,
    cpu_supported_series: yaml.cpu?.supported_series ?? null,
    notes: yaml.notes ?? null,
    sources: yaml.sources,
    contributed_by: yaml.contributed_by ?? null,
    last_verified: yaml.last_verified ?? null,
    schema_version: yaml.schema_version,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Transforms all slot arrays from a motherboard YAML into flat SlotRow[].
 * Each category populates its type-specific columns and sets all others to null.
 * Common columns (label, source, disabled_by, sharing_rules, notes, sort_order)
 * are populated for every category.
 */
export function transformSlots(yaml: MotherboardYAML): SlotRow[] {
  const rows: SlotRow[] = [];
  let sortOrder = 0;

  // Memory slots
  for (const slot of yaml.memory.slots) {
    rows.push({
      id: slot.id,
      motherboard_id: yaml.id,
      category: "memory",
      label: `${slot.channel}${slot.position}`,
      dimm_channel: slot.channel,
      dimm_position: slot.position,
      dimm_recommended: slot.recommended,
      // M.2-specific — null
      m2_interface: null,
      m2_gen: null,
      m2_lanes: null,
      m2_form_factors: null,
      m2_supports_sata: null,
      m2_heatsink_included: null,
      // PCIe-specific — null
      pcie_gen: null,
      pcie_electrical_lanes: null,
      pcie_physical_size: null,
      pcie_reinforced: null,
      // SATA-specific — null
      sata_version: null,
      // Common
      source: null,
      disabled_by: null,
      sharing_rules: null,
      notes: null,
      sort_order: sortOrder++,
    });
  }

  // M.2 slots
  for (const slot of yaml.m2_slots) {
    rows.push({
      id: slot.id,
      motherboard_id: yaml.id,
      category: "m2",
      label: slot.label,
      m2_interface: slot.interface,
      m2_gen: slot.gen,
      m2_lanes: slot.lanes,
      m2_form_factors: slot.form_factors,
      m2_supports_sata: slot.supports_sata,
      m2_heatsink_included: slot.heatsink_included,
      // Memory-specific — null
      dimm_channel: null,
      dimm_position: null,
      dimm_recommended: null,
      // PCIe-specific — null
      pcie_gen: null,
      pcie_electrical_lanes: null,
      pcie_physical_size: null,
      pcie_reinforced: null,
      // SATA-specific — null
      sata_version: null,
      // Common
      source: slot.source,
      disabled_by: null,
      sharing_rules: slot.sharing ?? null,
      notes: null,
      sort_order: sortOrder++,
    });
  }

  // PCIe slots
  for (const slot of yaml.pcie_slots) {
    rows.push({
      id: slot.id,
      motherboard_id: yaml.id,
      category: "pcie",
      label: slot.label,
      pcie_gen: slot.gen,
      pcie_electrical_lanes: slot.electrical_lanes,
      pcie_physical_size: slot.physical_size,
      pcie_reinforced: slot.reinforced,
      // Memory-specific — null
      dimm_channel: null,
      dimm_position: null,
      dimm_recommended: null,
      // M.2-specific — null
      m2_interface: null,
      m2_gen: null,
      m2_lanes: null,
      m2_form_factors: null,
      m2_supports_sata: null,
      m2_heatsink_included: null,
      // SATA-specific — null
      sata_version: null,
      // Common
      source: slot.source,
      disabled_by: null,
      sharing_rules: slot.sharing ?? null,
      notes: null,
      sort_order: sortOrder++,
    });
  }

  // SATA ports
  for (const slot of yaml.sata_ports) {
    rows.push({
      id: slot.id,
      motherboard_id: yaml.id,
      category: "sata",
      label: slot.id.toUpperCase(),
      sata_version: slot.version,
      // Memory-specific — null
      dimm_channel: null,
      dimm_position: null,
      dimm_recommended: null,
      // M.2-specific — null
      m2_interface: null,
      m2_gen: null,
      m2_lanes: null,
      m2_form_factors: null,
      m2_supports_sata: null,
      m2_heatsink_included: null,
      // PCIe-specific — null
      pcie_gen: null,
      pcie_electrical_lanes: null,
      pcie_physical_size: null,
      pcie_reinforced: null,
      // Common
      source: slot.source,
      disabled_by: slot.disabled_by ?? null,
      sharing_rules: null,
      notes: null,
      sort_order: sortOrder++,
    });
  }

  return rows;
}

/**
 * Transforms a component YAML object into a per-type flat DB row.
 * Switches on component type to flatten nested fields into typed columns.
 * A human-readable `summary_line` is generated from the specs.
 */
export function transformComponent(yaml: ComponentYAML): PerTypeComponentRow {
  const { id, type, manufacturer, model, sku, sources, contributed_by, schema_version, ...specs } = yaml;

  const base = {
    id,
    manufacturer,
    model,
    sku: sku ?? null,
    sources: (sources as { type: string; url: string }[]) ?? null,
    contributed_by: contributed_by ?? null,
    schema_version,
    updated_at: new Date().toISOString(),
  };

  switch (type) {
    case "nvme": {
      const iface = yaml.interface as { protocol: string; pcie_gen?: number | null; lanes?: number | null };
      return {
        ...base,
        type: "nvme",
        summary_line: generateSummaryLine("nvme", specs),
        interface_protocol: iface.protocol,
        interface_pcie_gen: iface.pcie_gen ?? null,
        interface_lanes: iface.lanes ?? null,
        form_factor: yaml.form_factor as string,
        capacity_gb: yaml.capacity_gb as number,
        capacity_variant_note: (yaml.capacity_variant_note as string) ?? null,
      };
    }
    case "gpu": {
      const iface = yaml.interface as { pcie_gen: number; lanes: number };
      const physical = yaml.physical as { slot_width: number; length_mm: number; slots_occupied: number };
      const power = yaml.power as { tdp_w: number; recommended_psu_w?: number; power_connectors: { type: string; count: number }[] };
      return {
        ...base,
        type: "gpu",
        summary_line: generateSummaryLine("gpu", specs),
        chip_manufacturer: (yaml.chip_manufacturer as string) ?? null,
        interface_pcie_gen: iface.pcie_gen,
        interface_lanes: iface.lanes,
        physical_slot_width: physical.slot_width,
        physical_length_mm: physical.length_mm,
        physical_slots_occupied: physical.slots_occupied,
        power_tdp_w: power.tdp_w,
        power_recommended_psu_w: power.recommended_psu_w ?? null,
        power_connectors: power.power_connectors,
      };
    }
    case "ram": {
      const iface = yaml.interface as { type: string; speed_mhz: number; base_speed_mhz?: number };
      const capacity = yaml.capacity as { per_module_gb: number; modules: number; total_gb: number };
      return {
        ...base,
        type: "ram",
        summary_line: generateSummaryLine("ram", specs),
        interface_type: iface.type,
        interface_speed_mhz: iface.speed_mhz,
        interface_base_speed_mhz: iface.base_speed_mhz ?? null,
        capacity_per_module_gb: capacity.per_module_gb,
        capacity_modules: capacity.modules,
        capacity_total_gb: capacity.total_gb,
      };
    }
    case "sata_drive":
    case "sata_ssd":
    case "sata_hdd": {
      return {
        ...base,
        type: "sata_drive",
        summary_line: generateSummaryLine("sata_drive", specs),
        form_factor: yaml.form_factor as string,
        capacity_gb: yaml.capacity_gb as number,
        interface: yaml.interface as string,
      };
    }
    default:
      throw new Error(`Unknown component type: ${type}`);
  }
}

/**
 * Generates a human-readable summary line for a component based on its type
 * and specs. Each component type highlights its most important attributes.
 */
export function generateSummaryLine(type: string, specs: Record<string, unknown>): string {
  switch (type) {
    case "nvme": {
      const iface = specs.interface as { protocol?: string; pcie_gen?: number; lanes?: number } | undefined;
      const gen = iface?.pcie_gen ? `Gen${iface.pcie_gen}` : "";
      const lanes = iface?.lanes ? `x${iface.lanes}` : "";
      const protocol = iface?.protocol ?? "NVMe";
      const capacity = specs.capacity_gb ? `${specs.capacity_gb} GB` : "";
      return [protocol, gen, lanes, capacity].filter(Boolean).join(", ");
    }
    case "gpu": {
      const iface = specs.interface as { pcie_gen?: number } | undefined;
      const power = specs.power as { tdp_w?: number } | undefined;
      const gen = iface?.pcie_gen ? `PCIe Gen${iface.pcie_gen}` : "";
      const tdp = power?.tdp_w ? `${power.tdp_w}W TDP` : "";
      return [gen, tdp].filter(Boolean).join(", ");
    }
    case "ram": {
      const iface = specs.interface as { type?: string; speed_mhz?: number } | undefined;
      const capacity = specs.capacity as { total_gb?: number } | undefined;
      const memType = iface?.type && iface?.speed_mhz ? `${iface.type}-${iface.speed_mhz}` : "";
      const total = capacity?.total_gb ? `${capacity.total_gb} GB` : "";
      return [memType, total].filter(Boolean).join(", ");
    }
    case "sata_drive": {
      const capacity = specs.capacity_gb ? `${specs.capacity_gb} GB` : "";
      const ff = specs.form_factor ? `${specs.form_factor}` : "";
      return [ff, capacity].filter(Boolean).join(", ");
    }
    default:
      return "";
  }
}

// ─── YAML File Discovery & Schema Routing ────────────────────────────

/**
 * Recursively discovers all `.yaml` files under `{baseDir}/data/motherboards/`
 * and `{baseDir}/data/components/`. Returns absolute file paths.
 */
export function discoverYamlFiles(baseDir: string): string[] {
  const results: string[] = [];
  const dirs = [
    path.join(baseDir, "data", "motherboards"),
    path.join(baseDir, "data", "components"),
  ];

  for (const dir of dirs) {
    collectYamlFilesRecursive(dir, results);
  }

  return results;
}

function collectYamlFilesRecursive(dir: string, results: string[]): void {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectYamlFilesRecursive(full, results);
    } else if (entry.isFile() && entry.name.endsWith(".yaml")) {
      results.push(full);
    }
  }
}

/**
 * Given a file path, determines which JSON Schema to use for validation.
 *
 * - Paths containing `/data/motherboards/` → `data/schema/motherboard.schema.json`
 * - Paths containing `/data/components/{type}/` (nvme, gpu, ram, sata) → `data/schema/component-{type}.schema.json`
 * - Otherwise → null
 */
export function routeSchema(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, "/");

  const mbMatch = normalized.match(/\/data\/motherboards\//);
  if (mbMatch) {
    const idx = normalized.indexOf("/data/motherboards/");
    const baseDir = normalized.substring(0, idx);
    return path.join(baseDir, "data", "schema", "motherboard.schema.json");
  }

  const compMatch = normalized.match(/\/data\/components\/(nvme|gpu|ram|sata-ssd|sata-hdd|sata)\//);
  if (compMatch) {
    const idx = normalized.indexOf("/data/components/");
    const baseDir = normalized.substring(0, idx);
    return path.join(baseDir, "data", "schema", `component-${compMatch[1]}.schema.json`);
  }

  return null;
}


// ─── YAML Parsing & Validation ───────────────────────────────────────

/** Shared Ajv instance for schema validation. */
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

/** Cache of compiled validators keyed by schema file path. */
const validatorCache = new Map<string, ReturnType<Ajv["compile"]>>();

/**
 * Parses a YAML file and validates it against the routed JSON Schema.
 *
 * Returns the parsed data with its type on success, or an error string on failure.
 * Invalid or unparseable files produce an error result — they never throw.
 */
export function parseAndValidateFile(
  filePath: string
): { data: MotherboardYAML | ComponentYAML; type: "motherboard" | "component" } | { error: string } {
  // 1. Determine the correct schema
  const schemaPath = routeSchema(filePath);
  if (!schemaPath) {
    return { error: `Could not determine schema for file: ${filePath}` };
  }

  // 2. Read file content
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    return { error: `Failed to read file ${filePath}: ${(err as Error).message}` };
  }

  // 3. Parse YAML
  let parsed: unknown;
  try {
    parsed = yaml.load(content);
  } catch (err) {
    return { error: `YAML parse error in ${filePath}: ${(err as Error).message}` };
  }

  // 4. Load and compile schema (cached)
  if (!validatorCache.has(schemaPath)) {
    let schemaJson: unknown;
    try {
      schemaJson = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
    } catch (err) {
      return { error: `Failed to load schema ${schemaPath}: ${(err as Error).message}` };
    }
    try {
      validatorCache.set(schemaPath, ajv.compile(schemaJson as object));
    } catch (err) {
      // If schema with same $id was already compiled (e.g. loaded from a different path),
      // look it up by $id and cache that validator for this path.
      const schemaObj = schemaJson as { $id?: string };
      if (schemaObj.$id) {
        const existing = ajv.getSchema(schemaObj.$id);
        if (existing) {
          validatorCache.set(schemaPath, existing);
        } else {
          return { error: `Failed to compile schema ${schemaPath}: ${(err as Error).message}` };
        }
      } else {
        return { error: `Failed to compile schema ${schemaPath}: ${(err as Error).message}` };
      }
    }
  }
  const validate = validatorCache.get(schemaPath)!;

  // 5. Validate against schema
  const valid = validate(parsed);
  if (!valid) {
    const details = validate.errors!
      .map((e) => `${e.instancePath || "/"} ${e.message}`)
      .join("; ");
    return { error: `Schema validation failed for ${filePath}: ${details}` };
  }

  // 6. Determine type from path
  const normalized = filePath.replace(/\\/g, "/");
  const isMotherboard = /\/data\/motherboards\//.test(normalized);

  if (isMotherboard) {
    return { data: parsed as MotherboardYAML, type: "motherboard" };
  } else {
    return { data: parsed as ComponentYAML, type: "component" };
  }
}

// ─── Manifest Generation ─────────────────────────────────────────────

/** Sort object keys recursively for deterministic JSON output. */
function sortKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(sortKeys);
  }
  if (obj !== null && typeof obj === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}

/**
 * Extracts type-specific key specs for a component manifest entry.
 * Matches the logic from `generate-manifest.ts`.
 */
export function extractComponentSpecs(data: ComponentYAML): Record<string, unknown> {
  const type = data.type;

  switch (type) {
    case "nvme": {
      const iface = data.interface as Record<string, unknown> | undefined;
      return {
        capacity_gb: data.capacity_gb,
        "interface.protocol": iface?.protocol,
        "interface.pcie_gen": iface?.pcie_gen,
      };
    }
    case "gpu": {
      const iface = data.interface as Record<string, unknown> | undefined;
      const power = data.power as Record<string, unknown> | undefined;
      const physical = data.physical as Record<string, unknown> | undefined;
      return {
        "interface.pcie_gen": iface?.pcie_gen,
        "power.tdp_w": power?.tdp_w,
        "physical.length_mm": physical?.length_mm,
      };
    }
    case "ram": {
      const iface = data.interface as Record<string, unknown> | undefined;
      const capacity = data.capacity as Record<string, unknown> | undefined;
      return {
        "interface.type": iface?.type,
        "interface.speed_mhz": iface?.speed_mhz,
        "capacity.total_gb": capacity?.total_gb,
      };
    }
    case "sata_drive": {
      return {
        capacity_gb: data.capacity_gb,
        form_factor: data.form_factor,
      };
    }
    default:
      return {};
  }
}

/**
 * Generates `data-manifest.json` from successfully parsed YAML objects.
 * Writes to `{baseDir}/data-manifest.json` with deterministic ordering and sorted keys.
 */
export function generateManifest(
  baseDir: string,
  motherboardYamls: MotherboardYAML[],
  componentYamls: ComponentYAML[]
): void {
  const motherboards = motherboardYamls
    .map((mb) => ({
      id: mb.id,
      manufacturer: mb.manufacturer,
      model: mb.model,
      socket: mb.socket,
      chipset: mb.chipset,
      form_factor: mb.form_factor,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const components = componentYamls
    .map((comp) => ({
      id: comp.id,
      type: comp.type,
      manufacturer: comp.manufacturer,
      model: comp.model,
      specs: extractComponentSpecs(comp),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const manifest = sortKeys({ motherboards, components });

  fs.writeFileSync(
    path.join(baseDir, "data-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n"
  );
}

// ─── Sync Result ─────────────────────────────────────────────────────

/** Summary of a sync run. */
export interface SyncResult {
  motherboardsSynced: number;
  componentsSynced: number;
  motherboardsDeleted: number;
  componentsDeleted: number;
  filesSkipped: number;
  errors: { file: string; error: string }[];
}

// ─── Orphan Cleanup Helper ───────────────────────────────────────────

/**
 * Pure function: returns IDs present in `dbIds` but not in `yamlIds`.
 * Used to identify orphan rows that should be deleted from the database.
 */
export function computeOrphans(dbIds: string[], yamlIds: string[]): string[] {
  const yamlSet = new Set(yamlIds);
  return dbIds.filter((id) => !yamlSet.has(id));
}

// ─── Sync Orchestration ──────────────────────────────────────────────

/**
 * Main sync orchestration function.
 *
 * Discovers YAML files, validates, transforms, and upserts into Supabase.
 * After all files are processed, performs orphan cleanup for motherboards
 * and components whose YAML files have been removed.
 *
 * Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables.
 */
export async function sync(baseDir: string): Promise<SyncResult> {
  // 1. Check env vars
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set."
    );
  }

  // 2. Initialize Supabase client with service role key
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 3. Discover all YAML files
  const files = discoverYamlFiles(baseDir);

  const result: SyncResult = {
    motherboardsSynced: 0,
    componentsSynced: 0,
    motherboardsDeleted: 0,
    componentsDeleted: 0,
    filesSkipped: 0,
    errors: [],
  };

  const syncedMotherboardIds: string[] = [];
  const syncedIdsByType: Record<string, string[]> = {};
  const syncedMotherboardYamls: MotherboardYAML[] = [];
  const syncedComponentYamls: ComponentYAML[] = [];

  // 4. Process each file
  for (const file of files) {
    const parsed = parseAndValidateFile(file);

    if ("error" in parsed) {
      console.error(`[SKIP] ${file}: ${parsed.error}`);
      result.filesSkipped++;
      result.errors.push({ file, error: parsed.error });
      continue;
    }

    try {
      if (parsed.type === "motherboard") {
        const mbYaml = parsed.data as MotherboardYAML;
        const mbRow = transformMotherboard(mbYaml);
        const slotRows = transformSlots(mbYaml);

        // Upsert motherboard row
        const { error: mbError } = await supabase
          .from("motherboards")
          .upsert(mbRow, { onConflict: "id" });

        if (mbError) {
          throw new Error(`Motherboard upsert failed: ${mbError.message}`);
        }

        // Delete existing slots for this motherboard, then insert current slots
        const { error: deleteSlotError } = await supabase
          .from("slots")
          .delete()
          .eq("motherboard_id", mbYaml.id);

        if (deleteSlotError) {
          throw new Error(`Slot delete failed: ${deleteSlotError.message}`);
        }

        if (slotRows.length > 0) {
          const { error: insertSlotError } = await supabase
            .from("slots")
            .insert(slotRows);

          if (insertSlotError) {
            throw new Error(`Slot insert failed: ${insertSlotError.message}`);
          }
        }

        syncedMotherboardIds.push(mbYaml.id);
        syncedMotherboardYamls.push(mbYaml);
        result.motherboardsSynced++;
        console.log(`[SYNC] motherboard: ${mbYaml.id}`);
      } else {
        const compYaml = parsed.data as ComponentYAML;
        const tableName = COMPONENT_TABLE_MAP[compYaml.type];
        if (!tableName) {
          throw new Error(`Unknown component type: ${compYaml.type}`);
        }

        const compRow = transformComponent(compYaml);

        // Upsert component row to per-type table
        const { error: compError } = await supabase
          .from(tableName)
          .upsert(compRow, { onConflict: "id" });

        if (compError) {
          throw new Error(`Component upsert failed: ${compError.message}`);
        }

        if (!syncedIdsByType[compYaml.type]) {
          syncedIdsByType[compYaml.type] = [];
        }
        syncedIdsByType[compYaml.type].push(compYaml.id);
        syncedComponentYamls.push(compYaml);
        result.componentsSynced++;
        console.log(`[SYNC] ${tableName}: ${compYaml.id}`);
      }
    } catch (err) {
      console.error(`[SKIP] ${file}: ${(err as Error).message}`);
      result.filesSkipped++;
      result.errors.push({ file, error: (err as Error).message });
    }
  }

  // 5. Orphan cleanup — delete rows in DB that are no longer in YAML
  try {
    // Get all existing motherboard IDs from DB
    const { data: dbMotherboards, error: mbQueryError } = await supabase
      .from("motherboards")
      .select("id");

    if (mbQueryError) {
      console.error(`[WARN] Failed to query motherboard IDs for orphan cleanup: ${mbQueryError.message}`);
    } else if (dbMotherboards) {
      const dbMbIds = dbMotherboards.map((r: { id: string }) => r.id);
      const orphanMbIds = computeOrphans(dbMbIds, syncedMotherboardIds);

      if (orphanMbIds.length > 0) {
        const { error: deleteMbError } = await supabase
          .from("motherboards")
          .delete()
          .in("id", orphanMbIds);

        if (deleteMbError) {
          console.error(`[WARN] Failed to delete orphan motherboards: ${deleteMbError.message}`);
        } else {
          result.motherboardsDeleted = orphanMbIds.length;
        }
      }
    }

    // Per-type component orphan cleanup
    for (const [type, tableName] of Object.entries(COMPONENT_TABLE_MAP)) {
      const { data: dbRows, error: queryError } = await supabase
        .from(tableName)
        .select("id");

      if (queryError) {
        console.error(`[WARN] Failed to query ${tableName} IDs for orphan cleanup: ${queryError.message}`);
        continue;
      }

      if (dbRows) {
        const dbIds = dbRows.map((r: { id: string }) => r.id);
        const orphanIds = computeOrphans(dbIds, syncedIdsByType[type] ?? []);

        if (orphanIds.length > 0) {
          const { error: deleteError } = await supabase
            .from(tableName)
            .delete()
            .in("id", orphanIds);

          if (deleteError) {
            console.error(`[WARN] Failed to delete orphan components from ${tableName}: ${deleteError.message}`);
          } else {
            result.componentsDeleted += orphanIds.length;
          }
        }
      }
    }
  } catch (err) {
    console.error(`[WARN] Orphan cleanup error: ${(err as Error).message}`);
  }

  // 6. Generate data-manifest.json from successfully processed YAML objects
  try {
    generateManifest(baseDir, syncedMotherboardYamls, syncedComponentYamls);
    console.log(`[MANIFEST] Generated data-manifest.json (${syncedMotherboardYamls.length} boards, ${syncedComponentYamls.length} components)`);
  } catch (err) {
    console.error(`[WARN] Manifest generation error: ${(err as Error).message}`);
  }

  return result;
}

// ─── CLI Entry Point ─────────────────────────────────────────────────

/**
 * Entry point when running via `npx tsx scripts/sync.ts`.
 * Calls sync(), logs a summary, and exits with the appropriate code.
 */
export async function main(): Promise<void> {
  const baseDir = process.cwd();
  const result = await sync(baseDir);

  console.log("--- Sync Summary ---");
  console.log(`Motherboards synced: ${result.motherboardsSynced}`);
  console.log(`Components synced:   ${result.componentsSynced}`);
  console.log(`Motherboards deleted (orphans): ${result.motherboardsDeleted}`);
  console.log(`Components deleted (orphans):   ${result.componentsDeleted}`);
  console.log(`Files skipped:       ${result.filesSkipped}`);

  if (result.filesSkipped > 0) {
    console.error(`Exiting with code 1 — ${result.filesSkipped} file(s) skipped due to errors.`);
    process.exit(1);
  }

  process.exit(0);
}

// Only run when executed directly (not when imported by tests/other modules)
const isDirectExecution =
  typeof process !== "undefined" &&
  process.argv[1] &&
  process.argv[1].replace(/\\/g, "/").includes("scripts/sync");

if (isDirectExecution) {
  main();
}
