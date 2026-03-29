import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import type { ComponentTypeKey } from "./form-helpers";
import { toKebabCase, SCHEMA_VERSIONS } from "./form-helpers";

// Constants duplicated from scripts/sanity-check.ts to avoid importing
// the Node-only script (which uses fs/path) into the client bundle.

/** Reasonable value ranges. */
const MAX_PCIE_GEN = 5;
const MAX_LANE_COUNT = 16;
const MAX_TDP_W = 1000;
const MAX_CAPACITY_GB = 65536;

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

export interface ValidationError {
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidateResult {
  errors: ValidationError[];
  isValid: boolean;
}

/**
 * Run full validation: ajv schema + sanity checks + id field check.
 */
export function validateFormData(
  data: Record<string, unknown>,
  componentType: ComponentTypeKey,
  schema: object,
): ValidateResult {
  const errors: ValidationError[] = [];

  try {
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);

    const validate = ajv.compile(schema);
    const valid = validate(data);

    if (!valid && validate.errors) {
      errors.push(...mapAjvErrors(validate.errors));
    }
  } catch {
    errors.push({
      path: "",
      message: "Internal validation error -- please report this issue.",
      severity: "error",
    });
    return { errors, isValid: false };
  }

  const idError = validateIdField(data);
  if (idError) {
    errors.push(idError);
  }

  const sanityErrors = runSanityChecks(data, componentType);
  errors.push(...sanityErrors);

  const hasErrors = errors.some((e) => e.severity === "error");
  return { errors, isValid: !hasErrors };
}

/**
 * Map ajv ErrorObject[] to human-readable ValidationError[].
 */
function mapAjvErrors(ajvErrors: ErrorObject[]): ValidationError[] {
  return ajvErrors.map((err) => {
    const path = err.instancePath || "/";
    let message: string;

    switch (err.keyword) {
      case "required":
        message = `Missing required field: ${err.params.missingProperty}`;
        break;
      case "type":
        message = `Expected type "${err.params.type}"`;
        break;
      case "enum":
        message = `Must be one of: ${(err.params.allowedValues as unknown[]).join(", ")}`;
        break;
      case "const":
        message = `Must be "${err.params.allowedValue}"`;
        break;
      case "minimum":
        message = `Must be >= ${err.params.limit}`;
        break;
      case "maximum":
        message = `Must be <= ${err.params.limit}`;
        break;
      case "exclusiveMinimum":
        message = `Must be > ${err.params.limit}`;
        break;
      case "minItems":
        message = `Must have at least ${err.params.limit} item(s)`;
        break;
      case "additionalProperties":
        message = `Unknown field: ${err.params.additionalProperty}`;
        break;
      case "format":
        message = `Invalid format: expected ${err.params.format}`;
        break;
      case "oneOf":
        message = "Must match exactly one of the allowed schemas";
        break;
      default:
        message = err.message || "Validation error";
        break;
    }

    return { path, message, severity: "error" as const };
  });
}

/**
 * Validate that id matches kebab-case of manufacturer + model.
 */
export function validateIdField(
  data: Record<string, unknown>,
): ValidationError | null {
  const manufacturer = data.manufacturer;
  const model = data.model;
  const id = data.id;

  if (typeof manufacturer !== "string" || typeof model !== "string") {
    return null;
  }
  if (manufacturer.trim() === "" || model.trim() === "") {
    return null;
  }
  if (typeof id !== "string") {
    return null;
  }

  const expected = toKebabCase(manufacturer + " " + model);
  if (id !== expected) {
    return {
      path: "/id",
      message: `id "${id}" does not match expected "${expected}" (kebab-case of manufacturer + model)`,
      severity: "error",
    };
  }

  return null;
}


/**
 * Run sanity checks only (reuses logic from scripts/sanity-check.ts).
 * Returns ValidationError[] with appropriate severity.
 */
export function runSanityChecks(
  data: Record<string, unknown>,
  componentType: ComponentTypeKey,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Schema version check
  checkSchemaVersion(errors, data, componentType);

  switch (componentType) {
    case "motherboard":
      checkMotherboardSanity(errors, data);
      break;
    case "gpu":
      checkGpuSanity(errors, data);
      break;
    case "nvme":
      checkNvmeSanity(errors, data);
      break;
    case "sata_ssd":
    case "sata_hdd":
      checkSataSanity(errors, data);
      break;
    case "ram":
      checkRamSanity(errors, data);
      break;
    case "cpu":
      // No specific sanity checks for CPU currently
      break;
  }

  return errors;
}

// -- Schema version check --

function checkSchemaVersion(
  errors: ValidationError[],
  data: Record<string, unknown>,
  componentType: ComponentTypeKey,
): void {
  const expected = SCHEMA_VERSIONS[componentType];
  if (!expected) return;

  const actual = data.schema_version;
  if (actual !== expected) {
    errors.push({
      path: "schema_version",
      message: `schema_version "${actual}" does not match expected "${expected}" for ${componentType}`,
      severity: "error",
    });
  }
}

// -- Motherboard sanity checks --

function checkMotherboardSanity(
  errors: ValidationError[],
  data: Record<string, unknown>,
): void {
  // M.2 slots: gen and lanes range
  const m2Slots = data.m2_slots;
  if (Array.isArray(m2Slots)) {
    for (const slot of m2Slots) {
      const s = slot as Record<string, unknown>;
      const id = typeof s.id === "string" ? s.id : "unknown";
      checkRange(errors, `m2_slots[${id}].gen`, s.gen, MAX_PCIE_GEN);
      checkRange(errors, `m2_slots[${id}].lanes`, s.lanes, MAX_LANE_COUNT);
    }
  }

  // PCIe slots: gen and lanes range
  const pcieSlots = data.pcie_slots;
  if (Array.isArray(pcieSlots)) {
    for (const slot of pcieSlots) {
      const s = slot as Record<string, unknown>;
      const id = typeof s.id === "string" ? s.id : "unknown";
      checkRange(errors, `pcie_slots[${id}].gen`, s.gen, MAX_PCIE_GEN);
      checkRange(
        errors,
        `pcie_slots[${id}].electrical_lanes`,
        s.electrical_lanes,
        MAX_LANE_COUNT,
      );
    }

    // PCIe slot position validity: unique, contiguous, start at 1
    const positions = pcieSlots
      .map((s) => (s as Record<string, unknown>).position)
      .filter((p): p is number => typeof p === "number");

    if (positions.length > 0) {
      const sorted = [...positions].sort((a, b) => a - b);
      const unique = new Set(positions);

      if (unique.size !== positions.length) {
        errors.push({
          path: "pcie_slots.position",
          message: `PCIe slot positions are not unique: [${positions.join(", ")}]`,
          severity: "error",
        });
      }

      if (sorted[0] !== 1) {
        errors.push({
          path: "pcie_slots.position",
          message: `PCIe slot positions must start at 1, but starts at ${sorted[0]}`,
          severity: "error",
        });
      }

      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] !== sorted[i - 1] + 1) {
          errors.push({
            path: "pcie_slots.position",
            message: `PCIe slot positions have a gap: [${sorted.join(", ")}]`,
            severity: "error",
          });
          break;
        }
      }
    }
  }

  // Sources: at least one with valid URL
  const sources = data.sources;
  if (Array.isArray(sources)) {
    if (sources.length === 0) {
      errors.push({
        path: "sources",
        message: "Motherboard must have at least one source",
        severity: "error",
      });
    } else {
      const hasValidUrl = sources.some((src) => {
        const s = src as Record<string, unknown>;
        return typeof s.url === "string" && isValidUrl(s.url);
      });
      if (!hasValidUrl) {
        errors.push({
          path: "sources",
          message: "Motherboard must have at least one source with a valid URL",
          severity: "error",
        });
      }
    }
  }
}

// -- GPU sanity checks --

function checkGpuSanity(
  errors: ValidationError[],
  data: Record<string, unknown>,
): void {
  const iface = data.interface as Record<string, unknown> | undefined;
  if (iface) {
    checkRange(errors, "interface.pcie_gen", iface.pcie_gen, MAX_PCIE_GEN);
    checkRange(errors, "interface.lanes", iface.lanes, MAX_LANE_COUNT);

    // GPU lanes must be in {1, 4, 8, 16}
    if (typeof iface.lanes === "number" && !VALID_GPU_LANES.has(iface.lanes)) {
      errors.push({
        path: "interface.lanes",
        message: `interface.lanes = ${iface.lanes} is not a valid PCIe width (must be 1, 4, 8, or 16)`,
        severity: "error",
      });
    }
  }

  const physical = data.physical as Record<string, unknown> | undefined;
  if (physical) {
    const slotsOccupied = physical.slots_occupied;
    if (typeof slotsOccupied === "number") {
      if (slotsOccupied < 1 || slotsOccupied > 4 || !Number.isInteger(slotsOccupied)) {
        errors.push({
          path: "physical.slots_occupied",
          message: `physical.slots_occupied = ${slotsOccupied} is out of range (must be 1-4)`,
          severity: "error",
        });
      }
    }
  }

  const power = data.power as Record<string, unknown> | undefined;
  if (power) {
    checkRange(errors, "power.tdp_w", power.tdp_w, MAX_TDP_W);

    const connectors = power.power_connectors;
    if (Array.isArray(connectors)) {
      if (connectors.length === 0) {
        errors.push({
          path: "power.power_connectors",
          message: "GPU must have at least one power connector",
          severity: "error",
        });
      }
      for (let i = 0; i < connectors.length; i++) {
        const c = connectors[i] as Record<string, unknown>;
        if (typeof c.type !== "string" || !VALID_POWER_CONNECTOR_TYPES.has(c.type)) {
          errors.push({
            path: `power.power_connectors[${i}].type`,
            message: `power.power_connectors[${i}].type = "${c.type}" is not a valid connector type`,
            severity: "error",
          });
        }
        if (typeof c.count !== "number" || c.count < 1 || !Number.isInteger(c.count)) {
          errors.push({
            path: `power.power_connectors[${i}].count`,
            message: `power.power_connectors[${i}].count = ${c.count} must be a positive integer`,
            severity: "error",
          });
        }
      }
    } else {
      errors.push({
        path: "power.power_connectors",
        message: "power.power_connectors is missing or not an array",
        severity: "error",
      });
    }
  }

  // NVIDIA board partner warning (severity: "warning")
  const chipMfr = data.chip_manufacturer;
  if (typeof chipMfr === "string" && chipMfr === "NVIDIA") {
    const manufacturer = data.manufacturer;
    if (typeof manufacturer === "string" && !NVIDIA_BOARD_PARTNERS.has(manufacturer)) {
      errors.push({
        path: "manufacturer",
        message: `manufacturer "${manufacturer}" is not a known NVIDIA board partner`,
        severity: "warning",
      });
    }
  }
}

// -- NVMe sanity checks --

function checkNvmeSanity(
  errors: ValidationError[],
  data: Record<string, unknown>,
): void {
  const iface = data.interface as Record<string, unknown> | undefined;
  if (iface) {
    if (iface.pcie_gen != null) {
      checkRange(errors, "interface.pcie_gen", iface.pcie_gen, MAX_PCIE_GEN);
    }
    if (iface.lanes != null) {
      checkRange(errors, "interface.lanes", iface.lanes, MAX_LANE_COUNT);
    }
  }
  checkRange(errors, "capacity_gb", data.capacity_gb, MAX_CAPACITY_GB);
}

// -- SATA sanity checks --

function checkSataSanity(
  errors: ValidationError[],
  data: Record<string, unknown>,
): void {
  checkRange(errors, "capacity_gb", data.capacity_gb, MAX_CAPACITY_GB);
}

// -- RAM sanity checks --

function checkRamSanity(
  errors: ValidationError[],
  data: Record<string, unknown>,
): void {
  const capacity = data.capacity as Record<string, unknown> | undefined;
  if (!capacity) return;

  const totalGb = capacity.total_gb;
  const perModuleGb = capacity.per_module_gb;
  const modules = capacity.modules;

  if (
    typeof totalGb === "number" &&
    typeof perModuleGb === "number" &&
    typeof modules === "number" &&
    totalGb !== perModuleGb * modules
  ) {
    errors.push({
      path: "capacity",
      message: `capacity mismatch: total_gb (${totalGb}) does not equal per_module_gb (${perModuleGb}) * modules (${modules})`,
      severity: "error",
    });
  }
}

// -- Helpers --

function checkRange(
  errors: ValidationError[],
  field: string,
  value: unknown,
  maxAllowed: number,
): void {
  if (typeof value !== "number") return;
  if (value > maxAllowed) {
    errors.push({
      path: field,
      message: `${field} = ${value} exceeds max allowed ${maxAllowed}`,
      severity: "error",
    });
  }
}

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
