import { describe, it, expect } from "vitest";
import * as yaml from "js-yaml";
import * as fs from "node:fs";
import * as path from "node:path";
import { validateAssignments } from "../../src/lib/validation-engine";
import type {
  Motherboard,
  GPUComponent,
  Component,
} from "../../src/lib/types";

const ROOT = path.resolve(__dirname, "..", "..");

function loadYaml<T = unknown>(relPath: string): T {
  const raw = fs.readFileSync(path.join(ROOT, relPath), "utf-8");
  return yaml.load(raw) as T;
}

// --- 1. GPU seed data checks ---

describe("GPU seed data: nvidia-rtx-4070-ti-super.yaml", () => {
  const gpu = loadYaml<Record<string, unknown>>(
    "data/components/gpu/nvidia-rtx-4070-ti-super.yaml"
  );

  it('has chip_manufacturer "NVIDIA"', () => {
    expect(gpu.chip_manufacturer).toBe("NVIDIA");
  });

  it("has slots_occupied 2", () => {
    expect((gpu.physical as Record<string, unknown>).slots_occupied).toBe(2);
  });

  it('has schema_version "2.0"', () => {
    expect(gpu.schema_version).toBe("2.0");
  });

  it("has power_connectors with one 16-pin/12VHPWR entry", () => {
    const power = gpu.power as Record<string, unknown>;
    const connectors = power.power_connectors as Array<Record<string, unknown>>;
    expect(connectors).toEqual([{ type: "16-pin/12VHPWR", count: 1 }]);
  });
});


// --- 2. ASUS motherboard seed data checks ---

describe("ASUS motherboard seed data: asus-rog-strix-z890-f-gaming-wifi.yaml", () => {
  const board = loadYaml<Record<string, unknown>>(
    "data/motherboards/asus/asus-rog-strix-z890-f-gaming-wifi.yaml"
  );

  it('has schema_version "2.0"', () => {
    expect(board.schema_version).toBe("2.0");
  });

  it("has position on each PCIe slot", () => {
    const slots = board.pcie_slots as Array<Record<string, unknown>>;
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.position).toBeDefined();
      expect(typeof slot.position).toBe("number");
      expect(slot.position).toBeGreaterThanOrEqual(1);
    }
  });
});

// --- 3. MSI motherboard seed data checks ---

describe("MSI motherboard seed data: msi-mag-x870-tomahawk-wifi.yaml", () => {
  const board = loadYaml<Record<string, unknown>>(
    "data/motherboards/msi/msi-mag-x870-tomahawk-wifi.yaml"
  );

  it('has schema_version "2.0"', () => {
    expect(board.schema_version).toBe("2.0");
  });

  it("has position on each PCIe slot", () => {
    const slots = board.pcie_slots as Array<Record<string, unknown>>;
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.position).toBeDefined();
      expect(typeof slot.position).toBe("number");
      expect(slot.position).toBeGreaterThanOrEqual(1);
    }
  });
});

// --- 4. NVMe seed data schema version checks ---

describe("NVMe seed data schema versions", () => {
  it('samsung-990-pro-2tb.yaml has schema_version "1.1"', () => {
    const nvme = loadYaml<Record<string, unknown>>(
      "data/components/nvme/samsung-990-pro-2tb.yaml"
    );
    expect(nvme.schema_version).toBe("1.1");
  });

  it('wd-black-sn770-1tb.yaml has schema_version "1.1"', () => {
    const nvme = loadYaml<Record<string, unknown>>(
      "data/components/nvme/wd-black-sn770-1tb.yaml"
    );
    expect(nvme.schema_version).toBe("1.1");
  });
});

// --- 5. Integration: validateAssignments with real data (valid GPU assignment) ---

describe("Integration: validateAssignments with real motherboard + GPU data", () => {
  const boardData = loadYaml<Motherboard>(
    "data/motherboards/asus/asus-rog-strix-z890-f-gaming-wifi.yaml"
  );
  const gpuData = loadYaml<GPUComponent>(
    "data/components/gpu/nvidia-rtx-4070-ti-super.yaml"
  );

  it("produces no errors for RTX 4070 Ti SUPER in ASUS pcie_1 (Gen5 x16)", () => {
    const assignments: Record<string, string> = {
      pcie_1: gpuData.id,
    };
    const components: Record<string, Component> = {
      [gpuData.id]: gpuData,
    };

    const results = validateAssignments(boardData, assignments, components);
    const errors = results.filter((r) => r.severity === "error");
    expect(errors).toHaveLength(0);
  });
});

// --- 6. Integration: gen mismatch info (Gen4 GPU in Gen5 slot) ---

describe("Integration: gen mismatch info for Gen4 GPU in Gen5 slot", () => {
  const boardData = loadYaml<Motherboard>(
    "data/motherboards/asus/asus-rog-strix-z890-f-gaming-wifi.yaml"
  );
  const gpuData = loadYaml<GPUComponent>(
    "data/components/gpu/nvidia-rtx-4070-ti-super.yaml"
  );

  it("produces an info result for Gen4 GPU in Gen5 pcie_1 slot", () => {
    // The RTX 4070 Ti SUPER is Gen4, ASUS pcie_1 is Gen5 → info
    const assignments: Record<string, string> = {
      pcie_1: gpuData.id,
    };
    const components: Record<string, Component> = {
      [gpuData.id]: gpuData,
    };

    const results = validateAssignments(boardData, assignments, components);
    const infos = results.filter((r) => r.severity === "info");
    expect(infos.length).toBeGreaterThanOrEqual(1);
    expect(infos[0].message).toContain("Gen4");
    expect(infos[0].message).toContain("Gen5");
  });
});
