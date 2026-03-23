import * as yaml from "js-yaml";
import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.resolve(__dirname, "..", "data");

/** Reasonable value ranges. */
const MAX_PCIE_GEN = 5;
const MAX_LANE_COUNT = 16;
const MAX_TDP_W = 1000;
const MAX_CAPACITY_GB = 65536; // 64 TB

interface Violation {
  file: string;
  field: string;
  value: number;
  maxAllowed: number;
}

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

/** Check a single numeric value and push a violation if out of range. */
function checkValue(
  violations: Violation[],
  file: string,
  field: string,
  value: unknown,
  maxAllowed: number
): void {
  if (typeof value !== "number") return;
  if (value > maxAllowed) {
    violations.push({ file, field, value, maxAllowed });
  }
}

/** Check motherboard data for out-of-range values. */
function checkMotherboard(
  violations: Violation[],
  file: string,
  data: Record<string, unknown>
): void {
  const m2Slots = data.m2_slots;
  if (Array.isArray(m2Slots)) {
    for (const slot of m2Slots) {
      const s = slot as Record<string, unknown>;
      const id = typeof s.id === "string" ? s.id : "unknown";
      checkValue(violations, file, `m2_slots[${id}].gen`, s.gen, MAX_PCIE_GEN);
      checkValue(violations, file, `m2_slots[${id}].lanes`, s.lanes, MAX_LANE_COUNT);
    }
  }

  const pcieSlots = data.pcie_slots;
  if (Array.isArray(pcieSlots)) {
    for (const slot of pcieSlots) {
      const s = slot as Record<string, unknown>;
      const id = typeof s.id === "string" ? s.id : "unknown";
      checkValue(violations, file, `pcie_slots[${id}].gen`, s.gen, MAX_PCIE_GEN);
      checkValue(
        violations,
        file,
        `pcie_slots[${id}].electrical_lanes`,
        s.electrical_lanes,
        MAX_LANE_COUNT
      );
    }
  }
}

/** Check NVMe component data for out-of-range values. */
function checkNvme(
  violations: Violation[],
  file: string,
  data: Record<string, unknown>
): void {
  const iface = data.interface as Record<string, unknown> | undefined;
  if (iface) {
    if (iface.pcie_gen != null) {
      checkValue(violations, file, "interface.pcie_gen", iface.pcie_gen, MAX_PCIE_GEN);
    }
    if (iface.lanes != null) {
      checkValue(violations, file, "interface.lanes", iface.lanes, MAX_LANE_COUNT);
    }
  }
  checkValue(violations, file, "capacity_gb", data.capacity_gb, MAX_CAPACITY_GB);
}

/** Check GPU component data for out-of-range values. */
function checkGpu(
  violations: Violation[],
  file: string,
  data: Record<string, unknown>
): void {
  const iface = data.interface as Record<string, unknown> | undefined;
  if (iface) {
    checkValue(violations, file, "interface.pcie_gen", iface.pcie_gen, MAX_PCIE_GEN);
    checkValue(violations, file, "interface.lanes", iface.lanes, MAX_LANE_COUNT);
  }
  const power = data.power as Record<string, unknown> | undefined;
  if (power) {
    checkValue(violations, file, "power.tdp_w", power.tdp_w, MAX_TDP_W);
  }
}

/** Check SATA component data for out-of-range values. */
function checkSata(
  violations: Violation[],
  file: string,
  data: Record<string, unknown>
): void {
  checkValue(violations, file, "capacity_gb", data.capacity_gb, MAX_CAPACITY_GB);
}

/** Determine the data type from the file path. */
function getDataType(filePath: string): "motherboard" | "nvme" | "gpu" | "ram" | "sata" | null {
  const rel = path.relative(DATA_DIR, filePath).replace(/\\/g, "/");

  if (rel.startsWith("motherboards/")) return "motherboard";

  const componentMatch = rel.match(/^components\/(nvme|gpu|ram|sata)\//);
  if (componentMatch) return componentMatch[1] as "nvme" | "gpu" | "ram" | "sata";

  return null;
}

function main(): void {
  const files = [
    ...collectYamlFiles(path.join(DATA_DIR, "motherboards")),
    ...collectYamlFiles(path.join(DATA_DIR, "components")),
  ];

  if (files.length === 0) {
    console.log("⚠ No YAML files found to sanity-check.");
    process.exit(0);
  }

  const violations: Violation[] = [];

  for (const filePath of files) {
    const dataType = getDataType(filePath);
    if (!dataType) continue;

    let data: unknown;
    try {
      data = yaml.load(fs.readFileSync(filePath, "utf-8"));
    } catch (err) {
      console.error(`✗ ${filePath}: YAML parse error — ${(err as Error).message}`);
      continue;
    }

    const record = data as Record<string, unknown>;
    const relPath = path.relative(path.resolve(DATA_DIR, ".."), filePath).replace(/\\/g, "/");

    switch (dataType) {
      case "motherboard":
        checkMotherboard(violations, relPath, record);
        break;
      case "nvme":
        checkNvme(violations, relPath, record);
        break;
      case "gpu":
        checkGpu(violations, relPath, record);
        break;
      case "sata":
        checkSata(violations, relPath, record);
        break;
      case "ram":
        // No range checks for RAM currently
        break;
    }
  }

  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`✗ ${v.file}: ${v.field} = ${v.value} (max allowed: ${v.maxAllowed})`);
    }
    process.exit(1);
  }

  console.log(`✓ All ${files.length} file(s) passed sanity checks.`);
  process.exit(0);
}

main();
