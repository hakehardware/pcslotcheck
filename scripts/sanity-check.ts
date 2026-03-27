import * as yaml from "js-yaml";
import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.resolve(__dirname, "..", "data");

/** Reasonable value ranges. */
const MAX_PCIE_GEN = 5;
const MAX_LANE_COUNT = 16;
const MAX_TDP_W = 1000;
const MAX_CAPACITY_GB = 65536; // 64 TB

/** Valid GPU interface lane values. */
export const VALID_GPU_LANES = new Set([1, 4, 8, 16]);

/** Valid power connector types. */
export const VALID_POWER_CONNECTOR_TYPES = new Set([
  "6-pin",
  "8-pin",
  "12-pin",
  "16-pin/12VHPWR",
  "16-pin/12V-2x6",
]);

/** Known NVIDIA board partners (including NVIDIA itself for founders/reference). */
export const NVIDIA_BOARD_PARTNERS = new Set([
  "NVIDIA",
  "ASUS",
  "MSI",
  "EVGA",
  "Gigabyte",
  "Zotac",
  "PNY",
  "Palit",
  "Gainward",
  "Inno3D",
  "Colorful",
  "Galax",
  "KFA2",
  "Manli",
]);

/** Expected schema versions per data type. */
export const EXPECTED_SCHEMA_VERSIONS: Record<string, string> = {
  gpu: "2.0",
  nvme: "1.1",
  motherboard: "2.0",
  ram: "1.0",
  "sata-ssd": "2.0",
  "sata-hdd": "2.0",
};

export interface SanityViolation {
  file: string;
  field: string;
  message: string;
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
  violations: SanityViolation[],
  file: string,
  field: string,
  value: unknown,
  maxAllowed: number
): void {
  if (typeof value !== "number") return;
  if (value > maxAllowed) {
    violations.push({
      file,
      field,
      message: `${field} = ${value} exceeds max allowed ${maxAllowed}`,
    });
  }
}

/** Check motherboard data for out-of-range values and PCIe position validity. */
export function checkMotherboard(
  violations: SanityViolation[],
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

    // Validate PCIe slot position uniqueness and contiguity (Req 9.7)
    const positions = pcieSlots
      .map((s) => (s as Record<string, unknown>).position)
      .filter((p): p is number => typeof p === "number");

    if (positions.length > 0) {
      const sorted = [...positions].sort((a, b) => a - b);
      const unique = new Set(positions);

      if (unique.size !== positions.length) {
        violations.push({
          file,
          field: "pcie_slots.position",
          message: `PCIe slot positions are not unique: [${positions.join(", ")}]`,
        });
      }

      if (sorted[0] !== 1) {
        violations.push({
          file,
          field: "pcie_slots.position",
          message: `PCIe slot positions must start at 1, but starts at ${sorted[0]}`,
        });
      }

      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] !== sorted[i - 1] + 1) {
          violations.push({
            file,
            field: "pcie_slots.position",
            message: `PCIe slot positions have a gap: [${sorted.join(", ")}]`,
          });
          break;
        }
      }
    }
  }
}

/** Check NVMe component data for out-of-range values. */
export function checkNvme(
  violations: SanityViolation[],
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

/** Check GPU component data for out-of-range values and field validity. */
export function checkGpu(
  violations: SanityViolation[],
  file: string,
  data: Record<string, unknown>
): void {
  const iface = data.interface as Record<string, unknown> | undefined;
  if (iface) {
    checkValue(violations, file, "interface.pcie_gen", iface.pcie_gen, MAX_PCIE_GEN);
    checkValue(violations, file, "interface.lanes", iface.lanes, MAX_LANE_COUNT);

    // Validate interface.lanes is one of {1, 4, 8, 16} (Req 8.2)
    if (typeof iface.lanes === "number" && !VALID_GPU_LANES.has(iface.lanes)) {
      violations.push({
        file,
        field: "interface.lanes",
        message: `interface.lanes = ${iface.lanes} is not a valid PCIe width (must be 1, 4, 8, or 16)`,
      });
    }
  }

  const power = data.power as Record<string, unknown> | undefined;
  if (power) {
    checkValue(violations, file, "power.tdp_w", power.tdp_w, MAX_TDP_W);

    // Validate power_connectors has at least one entry (Req 8.5)
    const connectors = power.power_connectors;
    if (Array.isArray(connectors)) {
      // Validate each connector entry (Req 8.6)
      for (let i = 0; i < connectors.length; i++) {
        const c = connectors[i] as Record<string, unknown>;
        if (typeof c.type !== "string" || !VALID_POWER_CONNECTOR_TYPES.has(c.type)) {
          violations.push({
            file,
            field: `power.power_connectors[${i}].type`,
            message: `power.power_connectors[${i}].type = "${c.type}" is not a valid connector type`,
          });
        }
        if (typeof c.count !== "number" || c.count < 1 || !Number.isInteger(c.count)) {
          violations.push({
            file,
            field: `power.power_connectors[${i}].count`,
            message: `power.power_connectors[${i}].count = ${c.count} must be a positive integer`,
          });
        }
      }
    } else {
      violations.push({
        file,
        field: "power.power_connectors",
        message: "power.power_connectors is missing or not an array",
      });
    }
  }

  // Validate physical.slots_occupied is 1–4 (Req 8.1)
  const physical = data.physical as Record<string, unknown> | undefined;
  if (physical) {
    const slotsOccupied = physical.slots_occupied;
    if (typeof slotsOccupied === "number") {
      if (slotsOccupied < 1 || slotsOccupied > 4 || !Number.isInteger(slotsOccupied)) {
        violations.push({
          file,
          field: "physical.slots_occupied",
          message: `physical.slots_occupied = ${slotsOccupied} is out of range (must be 1–4)`,
        });
      }
    }
  }

  // Validate chip_manufacturer is a non-empty string (Req 8.3)
  const chipMfr = data.chip_manufacturer;
  if (typeof chipMfr !== "string" || chipMfr.trim().length === 0) {
    violations.push({
      file,
      field: "chip_manufacturer",
      message: "chip_manufacturer must be a non-empty string",
    });
  }

  // Validate NVIDIA board partner list (Req 8.4)
  if (typeof chipMfr === "string" && chipMfr === "NVIDIA") {
    const manufacturer = data.manufacturer;
    if (typeof manufacturer === "string" && !NVIDIA_BOARD_PARTNERS.has(manufacturer)) {
      violations.push({
        file,
        field: "manufacturer",
        message: `manufacturer "${manufacturer}" is not a known NVIDIA board partner`,
      });
    }
  }
}

/** Check SATA component data for out-of-range values. */
export function checkSata(
  violations: SanityViolation[],
  file: string,
  data: Record<string, unknown>
): void {
  checkValue(violations, file, "capacity_gb", data.capacity_gb, MAX_CAPACITY_GB);
}

/** Validate schema_version matches expected version for the data type (Req 7.3). */
export function checkSchemaVersion(
  violations: SanityViolation[],
  file: string,
  data: Record<string, unknown>,
  dataType: string
): void {
  const expected = EXPECTED_SCHEMA_VERSIONS[dataType];
  if (!expected) return;

  const actual = data.schema_version;
  if (actual !== expected) {
    violations.push({
      file,
      field: "schema_version",
      message: `schema_version = "${actual}" does not match expected "${expected}" for ${dataType}`,
    });
  }
}

/** Determine the data type from the file path. */
export function getDataType(
  filePath: string,
  dataDir: string = DATA_DIR
): "motherboard" | "nvme" | "gpu" | "ram" | "sata-ssd" | "sata-hdd" | null {
  const rel = path.relative(dataDir, filePath).replace(/\\/g, "/");

  if (rel.startsWith("motherboards/")) return "motherboard";

  const componentMatch = rel.match(/^components\/(sata-ssd|sata-hdd|nvme|gpu|ram)\//);
  if (componentMatch) return componentMatch[1] as "nvme" | "gpu" | "ram" | "sata-ssd" | "sata-hdd";

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

  const violations: SanityViolation[] = [];

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

    // Schema version check applies to all types
    checkSchemaVersion(violations, relPath, record, dataType);

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
      case "sata-ssd":
      case "sata-hdd":
        checkSata(violations, relPath, record);
        break;
      case "ram":
        // No range checks for RAM currently
        break;
    }
  }

  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`✗ ${v.file}: ${v.message}`);
    }
    process.exit(1);
  }

  console.log(`✓ All ${files.length} file(s) passed sanity checks.`);
  process.exit(0);
}

// Only run main when executed directly (not when imported by tests)
if (require.main === module) {
  main();
}
