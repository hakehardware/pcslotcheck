import type { ComponentTypeKey } from "./form-helpers";
import type { ValidationError } from "./validation-engine-contribute";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface StepDef {
  label: string;
  fields: string[];
  optional?: boolean;
  isReview?: boolean;
  isCanvas?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Step configuration per component type                              */
/* ------------------------------------------------------------------ */

export const WIZARD_STEPS: Record<ComponentTypeKey, StepDef[]> = {
  motherboard: [
    {
      label: "Board Details",
      fields: [
        "manufacturer",
        "model",
        "id",
        "chipset",
        "socket",
        "form_factor",
        "length_mm",
        "width_mm",
        "schema_version",
      ],
    },
    { label: "Memory", fields: ["memory"] },
    { label: "M.2 Slots", fields: ["m2_slots"] },
    { label: "PCIe Slots", fields: ["pcie_slots"] },
    { label: "SATA & Sources", fields: ["sata_ports", "sources"] },
    {
      label: "Slot Positions",
      fields: ["slot_positions"],
      optional: true,
      isCanvas: true,
    },
    { label: "Review & Download", fields: [], isReview: true },
  ],
  gpu: [
    {
      label: "Component Details",
      fields: [
        "id", "type", "chip_manufacturer", "manufacturer", "model",
        "schema_version", "interface", "physical", "power",
      ],
    },
    { label: "Review & Download", fields: [], isReview: true },
  ],
  cpu: [
    {
      label: "Component Details",
      fields: [
        "id", "type", "manufacturer", "model", "socket",
        "microarchitecture", "architecture", "pcie_config",
        "cores", "threads", "tdp_w", "schema_version",
      ],
    },
    { label: "Review & Download", fields: [], isReview: true },
  ],
  nvme: [
    {
      label: "Component Details",
      fields: [
        "id", "type", "manufacturer", "model", "interface",
        "form_factor", "capacity_gb", "capacity_variant_note",
        "schema_version",
      ],
    },
    { label: "Review & Download", fields: [], isReview: true },
  ],
  ram: [
    {
      label: "Component Details",
      fields: [
        "id", "type", "manufacturer", "model", "interface",
        "capacity", "schema_version",
      ],
    },
    { label: "Review & Download", fields: [], isReview: true },
  ],
  sata_ssd: [
    {
      label: "Component Details",
      fields: [
        "id", "type", "manufacturer", "model", "form_factor",
        "capacity_gb", "interface", "drive_type", "schema_version",
      ],
    },
    { label: "Review & Download", fields: [], isReview: true },
  ],
  sata_hdd: [
    {
      label: "Component Details",
      fields: [
        "id", "type", "manufacturer", "model", "form_factor",
        "capacity_gb", "interface", "drive_type", "schema_version",
      ],
    },
    { label: "Review & Download", fields: [], isReview: true },
  ],
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Filter validation errors to those relevant to a specific step.
 * Review steps (empty fields) return all errors unfiltered.
 */
export function getStepErrors(
  errors: ValidationError[],
  step: StepDef,
): ValidationError[] {
  if (step.fields.length === 0) return errors;
  return errors.filter((err) =>
    step.fields.some(
      (field) =>
        err.path === `/${field}` ||
        err.path.startsWith(`/${field}/`) ||
        err.path === field ||
        err.path.startsWith(`${field}.`) ||
        err.path.startsWith(`${field}[`),
    ),
  );
}

/**
 * Return an array of error counts (errors only, not warnings) per step.
 */
export function getStepErrorCounts(
  errors: ValidationError[],
  steps: StepDef[],
): number[] {
  return steps.map(
    (step) =>
      getStepErrors(errors, step).filter((e) => e.severity === "error").length,
  );
}
