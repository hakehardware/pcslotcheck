import * as yaml from "js-yaml";
import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.resolve(__dirname, "..", "data");
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PUBLIC_DATA_DIR = path.join(PROJECT_ROOT, "public", "data");

/** Recursively collect all .yaml files under a directory. */
function collectYamlFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectYamlFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".yaml")) {
      results.push(full);
    }
  }
  return results;
}

/** Sort object keys recursively for deterministic output. */
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

/** Extract type-specific key specs for a component manifest entry. */
export function extractSpecs(data: Record<string, unknown>): Record<string, unknown> {
  const type = data.type as string;

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
    case "cpu": {
      const pcieConfig = data.pcie_config as Record<string, unknown> | undefined;
      return {
        socket: data.socket,
        microarchitecture: data.microarchitecture,
        architecture: data.architecture,
        "pcie_config.cpu_gen": pcieConfig?.cpu_gen,
      };
    }
    default:
      return {};
  }
}

/** Ensure a directory exists, creating it recursively if needed. */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function main(): void {
  const motherboardDir = path.join(DATA_DIR, "motherboards");
  const componentsDir = path.join(DATA_DIR, "components");

  const motherboardFiles = collectYamlFiles(motherboardDir);
  const componentFiles = collectYamlFiles(componentsDir);

  if (motherboardFiles.length === 0 && componentFiles.length === 0) {
    console.log("ℹ No YAML files found. Producing manifest with empty arrays.");
    const emptyManifest = { components: [], motherboards: [] };
    fs.writeFileSync(
      path.join(PROJECT_ROOT, "data-manifest.json"),
      JSON.stringify(emptyManifest, null, 2) + "\n"
    );
    return;
  }

  // Parse all motherboard YAML files
  const motherboards: { summary: Record<string, unknown>; full: Record<string, unknown> }[] = [];
  for (const filePath of motherboardFiles) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const data = yaml.load(raw) as Record<string, unknown>;
      if (!data || typeof data !== "object") {
        console.warn(`⚠ Skipping ${filePath}: not a valid YAML object`);
        continue;
      }
      motherboards.push({
        summary: {
          id: data.id,
          manufacturer: data.manufacturer,
          model: data.model,
          socket: data.socket,
          chipset: data.chipset,
          form_factor: data.form_factor,
        },
        full: data,
      });
    } catch (err) {
      console.warn(`⚠ Skipping ${filePath}: ${(err as Error).message}`);
    }
  }

  // Parse all component YAML files
  const components: { summary: Record<string, unknown>; full: Record<string, unknown> }[] = [];
  for (const filePath of componentFiles) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const data = yaml.load(raw) as Record<string, unknown>;
      if (!data || typeof data !== "object") {
        console.warn(`⚠ Skipping ${filePath}: not a valid YAML object`);
        continue;
      }
      components.push({
        summary: {
          id: data.id,
          type: data.type,
          manufacturer: data.manufacturer,
          model: data.model,
          specs: extractSpecs(data),
        },
        full: data,
      });
    } catch (err) {
      console.warn(`⚠ Skipping ${filePath}: ${(err as Error).message}`);
    }
  }

  // Sort by id for deterministic output
  motherboards.sort((a, b) =>
    String(a.summary.id).localeCompare(String(b.summary.id))
  );
  components.sort((a, b) =>
    String(a.summary.id).localeCompare(String(b.summary.id))
  );

  // Write data-manifest.json (sorted keys for determinism)
  const manifest = sortKeys({
    motherboards: motherboards.map((m) => m.summary),
    components: components.map((c) => c.summary),
  });
  fs.writeFileSync(
    path.join(PROJECT_ROOT, "data-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n"
  );
  console.log(`✓ data-manifest.json (${motherboards.length} boards, ${components.length} components)`);

  // Write individual motherboard JSON files
  const mbOutDir = path.join(PUBLIC_DATA_DIR, "motherboards");
  ensureDir(mbOutDir);
  for (const mb of motherboards) {
    const sorted = sortKeys(mb.full);
    const outPath = path.join(mbOutDir, `${mb.summary.id}.json`);
    fs.writeFileSync(outPath, JSON.stringify(sorted, null, 2) + "\n");
  }
  console.log(`✓ public/data/motherboards/ (${motherboards.length} files)`);

  // Write individual component JSON files
  const compOutDir = path.join(PUBLIC_DATA_DIR, "components");
  ensureDir(compOutDir);
  for (const comp of components) {
    const sorted = sortKeys(comp.full);
    const outPath = path.join(compOutDir, `${comp.summary.id}.json`);
    fs.writeFileSync(outPath, JSON.stringify(sorted, null, 2) + "\n");
  }
  console.log(`✓ public/data/components/ (${components.length} files)`);

  console.log("\n✓ Manifest generation complete.");
}

main();
