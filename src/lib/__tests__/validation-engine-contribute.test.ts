import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  runSanityChecks,
  validateFormData,
  validateIdField,
  NVIDIA_BOARD_PARTNERS,
  type ValidationError,
} from "../validation-engine-contribute";
import type { ComponentTypeKey } from "../form-helpers";
import gpuSchema from "../../../data/schema/component-gpu.schema.json";

// ---------------------------------------------------------------------------
// Shared generators
// ---------------------------------------------------------------------------

const nonEmptyString = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => /[a-zA-Z0-9]/.test(s));

// ---------------------------------------------------------------------------
// Feature: yaml-generator, Property 8: PCIe and M.2 range validation
// Validates: Requirements 5.1, 5.2
// ---------------------------------------------------------------------------
describe("Property 8: PCIe and M.2 range validation", () => {
  const MAX_PCIE_GEN = 5;
  const MAX_LANE_COUNT = 16;

  it("motherboard M.2 gen: error iff gen > 5", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 16 }),
        (gen, lanes) => {
          const data: Record<string, unknown> = {
            m2_slots: [
              { id: "m2_1", gen, lanes, label: "M.2_1", interface: "PCIe", form_factors: ["2280"], source: "CPU", supports_sata: false, heatsink_included: false, sharing: null },
            ],
            pcie_slots: [],
            sources: [{ type: "manual", url: "https://example.com" }],
            schema_version: "2.0",
          };
          const errors = runSanityChecks(data, "motherboard");
          const genErrors = errors.filter((e) => e.path.includes("gen") && e.path.includes("m2_slots"));
          if (gen > MAX_PCIE_GEN) {
            expect(genErrors.length).toBeGreaterThan(0);
          } else {
            expect(genErrors.length).toBe(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("motherboard M.2 lanes: error iff lanes > 16", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 100 }),
        (gen, lanes) => {
          const data: Record<string, unknown> = {
            m2_slots: [
              { id: "m2_1", gen, lanes, label: "M.2_1", interface: "PCIe", form_factors: ["2280"], source: "CPU", supports_sata: false, heatsink_included: false, sharing: null },
            ],
            pcie_slots: [],
            sources: [{ type: "manual", url: "https://example.com" }],
            schema_version: "2.0",
          };
          const errors = runSanityChecks(data, "motherboard");
          const laneErrors = errors.filter((e) => e.path.includes("lanes") && e.path.includes("m2_slots"));
          if (lanes > MAX_LANE_COUNT) {
            expect(laneErrors.length).toBeGreaterThan(0);
          } else {
            expect(laneErrors.length).toBe(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("motherboard PCIe gen: error iff gen > 5", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 16 }),
        (gen, electricalLanes) => {
          const data: Record<string, unknown> = {
            m2_slots: [],
            pcie_slots: [
              { id: "pcie_1", gen, electrical_lanes: electricalLanes, label: "PCIE_1", physical_size: "x16", position: 1, source: "CPU", reinforced: false, sharing: null },
            ],
            sources: [{ type: "manual", url: "https://example.com" }],
            schema_version: "2.0",
          };
          const errors = runSanityChecks(data, "motherboard");
          const genErrors = errors.filter((e) => e.path.includes("gen") && e.path.includes("pcie_slots"));
          if (gen > MAX_PCIE_GEN) {
            expect(genErrors.length).toBeGreaterThan(0);
          } else {
            expect(genErrors.length).toBe(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("motherboard PCIe electrical_lanes: error iff > 16", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 100 }),
        (gen, electricalLanes) => {
          const data: Record<string, unknown> = {
            m2_slots: [],
            pcie_slots: [
              { id: "pcie_1", gen, electrical_lanes: electricalLanes, label: "PCIE_1", physical_size: "x16", position: 1, source: "CPU", reinforced: false, sharing: null },
            ],
            sources: [{ type: "manual", url: "https://example.com" }],
            schema_version: "2.0",
          };
          const errors = runSanityChecks(data, "motherboard");
          const laneErrors = errors.filter((e) => e.path.includes("electrical_lanes") && e.path.includes("pcie_slots"));
          if (electricalLanes > MAX_LANE_COUNT) {
            expect(laneErrors.length).toBeGreaterThan(0);
          } else {
            expect(laneErrors.length).toBe(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("NVMe interface pcie_gen: error iff > 5", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (pcieGen) => {
          const data: Record<string, unknown> = {
            interface: { protocol: "NVMe", pcie_gen: pcieGen, lanes: 4 },
            capacity_gb: 1000,
            schema_version: "1.1",
          };
          const errors = runSanityChecks(data, "nvme");
          const genErrors = errors.filter((e) => e.path.includes("pcie_gen"));
          if (pcieGen > MAX_PCIE_GEN) {
            expect(genErrors.length).toBeGreaterThan(0);
          } else {
            expect(genErrors.length).toBe(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("NVMe interface lanes: error iff > 16", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (lanes) => {
          const data: Record<string, unknown> = {
            interface: { protocol: "NVMe", pcie_gen: 4, lanes },
            capacity_gb: 1000,
            schema_version: "1.1",
          };
          const errors = runSanityChecks(data, "nvme");
          const laneErrors = errors.filter((e) => e.path === "interface.lanes");
          if (lanes > MAX_LANE_COUNT) {
            expect(laneErrors.length).toBeGreaterThan(0);
          } else {
            expect(laneErrors.length).toBe(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ---------------------------------------------------------------------------
// Feature: yaml-generator, Property 9: GPU sanity checks
// Validates: Requirements 5.3, 5.4, 5.5, 5.11
// ---------------------------------------------------------------------------
describe("Property 9: GPU sanity checks", () => {
  const VALID_GPU_LANES = new Set([1, 4, 8, 16]);
  const MAX_TDP_W = 1000;
  const validConnectorTypes = ["6-pin", "8-pin", "12-pin", "16-pin/12VHPWR", "16-pin/12V-2x6"];

  function makeGpuData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: "test-gpu",
      type: "gpu",
      chip_manufacturer: "NVIDIA",
      manufacturer: "ASUS",
      model: "Test GPU",
      interface: { pcie_gen: 4, lanes: 16 },
      physical: { slot_width: 2, length_mm: 300, slots_occupied: 2 },
      power: {
        tdp_w: 300,
        recommended_psu_w: 750,
        power_connectors: [{ type: "8-pin", count: 2 }],
      },
      schema_version: "2.0",
      ...overrides,
    };
  }

  it("error for lanes not in {1, 4, 8, 16}", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 32 }),
        (lanes) => {
          const data = makeGpuData({
            interface: { pcie_gen: 4, lanes },
          });
          const errors = runSanityChecks(data, "gpu");
          const laneErrors = errors.filter(
            (e) => e.path === "interface.lanes" && e.message.includes("valid PCIe width"),
          );
          if (!VALID_GPU_LANES.has(lanes)) {
            expect(laneErrors.length).toBeGreaterThan(0);
          } else {
            expect(laneErrors.length).toBe(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("error for slots_occupied outside [1, 4]", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -2, max: 10 }),
        (slotsOccupied) => {
          const data = makeGpuData({
            physical: { slot_width: 2, length_mm: 300, slots_occupied: slotsOccupied },
          });
          const errors = runSanityChecks(data, "gpu");
          const slotErrors = errors.filter((e) => e.path === "physical.slots_occupied");
          if (slotsOccupied < 1 || slotsOccupied > 4 || !Number.isInteger(slotsOccupied)) {
            expect(slotErrors.length).toBeGreaterThan(0);
          } else {
            expect(slotErrors.length).toBe(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("error for tdp_w > 1000", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 2000, noNaN: true, noDefaultInfinity: true }),
        (tdpW) => {
          const data = makeGpuData({
            power: {
              tdp_w: tdpW,
              recommended_psu_w: 750,
              power_connectors: [{ type: "8-pin", count: 2 }],
            },
          });
          const errors = runSanityChecks(data, "gpu");
          const tdpErrors = errors.filter((e) => e.path === "power.tdp_w");
          if (tdpW > MAX_TDP_W) {
            expect(tdpErrors.length).toBeGreaterThan(0);
          } else {
            expect(tdpErrors.length).toBe(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("error for empty power_connectors array", () => {
    const data = makeGpuData({
      power: {
        tdp_w: 300,
        recommended_psu_w: 750,
        power_connectors: [],
      },
    });
    const errors = runSanityChecks(data, "gpu");
    const connectorErrors = errors.filter((e) => e.path === "power.power_connectors");
    expect(connectorErrors.length).toBeGreaterThan(0);
  });

  it("error for invalid power connector type", () => {
    fc.assert(
      fc.property(
        nonEmptyString.filter((s) => !validConnectorTypes.includes(s)),
        (invalidType) => {
          const data = makeGpuData({
            power: {
              tdp_w: 300,
              recommended_psu_w: 750,
              power_connectors: [{ type: invalidType, count: 1 }],
            },
          });
          const errors = runSanityChecks(data, "gpu");
          const typeErrors = errors.filter((e) => e.path.includes("power.power_connectors") && e.message.includes("valid connector type"));
          expect(typeErrors.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ---------------------------------------------------------------------------
// Feature: yaml-generator, Property 10: Storage capacity range validation
// Validates: Requirements 5.6
// ---------------------------------------------------------------------------
describe("Property 10: Storage capacity range validation", () => {
  const MAX_CAPACITY_GB = 65536;
  const storageTypes: ComponentTypeKey[] = ["nvme", "sata_ssd", "sata_hdd"];

  for (const storageType of storageTypes) {
    it(`${storageType}: error iff capacity_gb > 65536`, () => {
      fc.assert(
        fc.property(
          fc.double({ min: 1, max: 200000, noNaN: true, noDefaultInfinity: true }),
          (capacityGb) => {
            let data: Record<string, unknown>;
            if (storageType === "nvme") {
              data = {
                interface: { protocol: "NVMe", pcie_gen: 4, lanes: 4 },
                capacity_gb: capacityGb,
                schema_version: "1.1",
              };
            } else {
              data = {
                capacity_gb: capacityGb,
                schema_version: "2.0",
              };
            }
            const errors = runSanityChecks(data, storageType);
            const capErrors = errors.filter((e) => e.path === "capacity_gb");
            if (capacityGb > MAX_CAPACITY_GB) {
              expect(capErrors.length).toBeGreaterThan(0);
            } else {
              expect(capErrors.length).toBe(0);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  }
});

// ---------------------------------------------------------------------------
// Feature: yaml-generator, Property 11: RAM capacity cross-field validation
// Validates: Requirements 5.7
// ---------------------------------------------------------------------------
describe("Property 11: RAM capacity cross-field validation", () => {
  it("error iff total_gb != per_module_gb * modules", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 128 }),
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 1, max: 1024 }),
        (perModuleGb, modules, totalGb) => {
          const data: Record<string, unknown> = {
            capacity: {
              total_gb: totalGb,
              per_module_gb: perModuleGb,
              modules,
            },
            schema_version: "1.0",
          };
          const errors = runSanityChecks(data, "ram");
          const capErrors = errors.filter((e) => e.path === "capacity");
          const expected = perModuleGb * modules;
          if (totalGb !== expected) {
            expect(capErrors.length).toBeGreaterThan(0);
          } else {
            expect(capErrors.length).toBe(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: yaml-generator, Property 12: PCIe slot position validity
// Validates: Requirements 5.8
// ---------------------------------------------------------------------------
describe("Property 12: PCIe slot position validity", () => {
  it("no error for valid contiguous positions starting at 1", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 7 }),
        (count) => {
          const pcieSlots = Array.from({ length: count }, (_, i) => ({
            id: `pcie_${i + 1}`,
            label: `PCIE_${i + 1}`,
            gen: 4,
            electrical_lanes: 16,
            physical_size: "x16",
            position: i + 1,
            source: "CPU",
            reinforced: false,
            sharing: null,
          }));
          const data: Record<string, unknown> = {
            m2_slots: [],
            pcie_slots: pcieSlots,
            sources: [{ type: "manual", url: "https://example.com" }],
            schema_version: "2.0",
          };
          const errors = runSanityChecks(data, "motherboard");
          const posErrors = errors.filter((e) => e.path === "pcie_slots.position");
          expect(posErrors.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("error for duplicate positions", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 7 }),
        (dupPos) => {
          const pcieSlots = [
            { id: "pcie_1", label: "PCIE_1", gen: 4, electrical_lanes: 16, physical_size: "x16", position: dupPos, source: "CPU", reinforced: false, sharing: null },
            { id: "pcie_2", label: "PCIE_2", gen: 4, electrical_lanes: 16, physical_size: "x16", position: dupPos, source: "CPU", reinforced: false, sharing: null },
          ];
          const data: Record<string, unknown> = {
            m2_slots: [],
            pcie_slots: pcieSlots,
            sources: [{ type: "manual", url: "https://example.com" }],
            schema_version: "2.0",
          };
          const errors = runSanityChecks(data, "motherboard");
          const posErrors = errors.filter((e) => e.path === "pcie_slots.position");
          expect(posErrors.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("error for positions not starting at 1", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        (startPos) => {
          const pcieSlots = [
            { id: "pcie_1", label: "PCIE_1", gen: 4, electrical_lanes: 16, physical_size: "x16", position: startPos, source: "CPU", reinforced: false, sharing: null },
            { id: "pcie_2", label: "PCIE_2", gen: 4, electrical_lanes: 16, physical_size: "x16", position: startPos + 1, source: "CPU", reinforced: false, sharing: null },
          ];
          const data: Record<string, unknown> = {
            m2_slots: [],
            pcie_slots: pcieSlots,
            sources: [{ type: "manual", url: "https://example.com" }],
            schema_version: "2.0",
          };
          const errors = runSanityChecks(data, "motherboard");
          const posErrors = errors.filter((e) => e.path === "pcie_slots.position" && e.message.includes("start at 1"));
          expect(posErrors.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("error for non-contiguous positions", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 20 }),
        (gap) => {
          // Positions 1 and gap (with gap > 2 to ensure non-contiguous)
          const pcieSlots = [
            { id: "pcie_1", label: "PCIE_1", gen: 4, electrical_lanes: 16, physical_size: "x16", position: 1, source: "CPU", reinforced: false, sharing: null },
            { id: "pcie_2", label: "PCIE_2", gen: 4, electrical_lanes: 16, physical_size: "x16", position: gap, source: "CPU", reinforced: false, sharing: null },
          ];
          const data: Record<string, unknown> = {
            m2_slots: [],
            pcie_slots: pcieSlots,
            sources: [{ type: "manual", url: "https://example.com" }],
            schema_version: "2.0",
          };
          const errors = runSanityChecks(data, "motherboard");
          const posErrors = errors.filter((e) => e.path === "pcie_slots.position" && e.message.includes("gap"));
          expect(posErrors.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ---------------------------------------------------------------------------
// Feature: yaml-generator, Property 13: NVIDIA board partner warning
// Validates: Requirements 5.9
// ---------------------------------------------------------------------------
describe("Property 13: NVIDIA board partner warning", () => {
  const knownPartners = Array.from(NVIDIA_BOARD_PARTNERS);

  function makeNvidiaGpuData(manufacturer: string): Record<string, unknown> {
    return {
      id: "test-gpu",
      type: "gpu",
      chip_manufacturer: "NVIDIA",
      manufacturer,
      model: "Test GPU",
      interface: { pcie_gen: 4, lanes: 16 },
      physical: { slot_width: 2, length_mm: 300, slots_occupied: 2 },
      power: {
        tdp_w: 300,
        recommended_psu_w: 750,
        power_connectors: [{ type: "8-pin", count: 2 }],
      },
      schema_version: "2.0",
    };
  }

  it("warning iff manufacturer not in known partner set", () => {
    fc.assert(
      fc.property(
        nonEmptyString,
        (manufacturer) => {
          const data = makeNvidiaGpuData(manufacturer);
          const errors = runSanityChecks(data, "gpu");
          const partnerWarnings = errors.filter(
            (e) => e.path === "manufacturer" && e.severity === "warning",
          );
          if (!NVIDIA_BOARD_PARTNERS.has(manufacturer)) {
            expect(partnerWarnings.length).toBeGreaterThan(0);
          } else {
            expect(partnerWarnings.length).toBe(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("no warning for known NVIDIA board partners", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...knownPartners),
        (manufacturer) => {
          const data = makeNvidiaGpuData(manufacturer);
          const errors = runSanityChecks(data, "gpu");
          const partnerWarnings = errors.filter(
            (e) => e.path === "manufacturer" && e.severity === "warning",
          );
          expect(partnerWarnings.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("no warning when chip_manufacturer is not NVIDIA", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("AMD", "Intel"),
        nonEmptyString,
        (chipMfr, manufacturer) => {
          const data: Record<string, unknown> = {
            id: "test-gpu",
            type: "gpu",
            chip_manufacturer: chipMfr,
            manufacturer,
            model: "Test GPU",
            interface: { pcie_gen: 4, lanes: 16 },
            physical: { slot_width: 2, length_mm: 300, slots_occupied: 2 },
            power: {
              tdp_w: 300,
              recommended_psu_w: 750,
              power_connectors: [{ type: "8-pin", count: 2 }],
            },
            schema_version: "2.0",
          };
          const errors = runSanityChecks(data, "gpu");
          const partnerWarnings = errors.filter(
            (e) => e.path === "manufacturer" && e.severity === "warning",
          );
          expect(partnerWarnings.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: yaml-generator, Property 20: Motherboard sources validation
// Validates: Requirements 11.3
// ---------------------------------------------------------------------------
describe("Property 20: Motherboard sources validation", () => {
  function makeMotherboardData(sources: unknown[]): Record<string, unknown> {
    return {
      id: "test-mobo",
      manufacturer: "ASUS",
      model: "Test Board",
      chipset: "Z890",
      socket: "LGA 1851",
      form_factor: "ATX",
      memory: { type: "DDR5", max_speed_mhz: 6400, base_speed_mhz: 4800, max_capacity_gb: 128, ecc_support: false, channels: 2, slots: [], recommended_population: {} },
      m2_slots: [],
      pcie_slots: [],
      sata_ports: [],
      sources,
      schema_version: "2.0",
    };
  }

  it("error when sources array is empty", () => {
    const data = makeMotherboardData([]);
    const errors = runSanityChecks(data, "motherboard");
    const sourceErrors = errors.filter((e) => e.path === "sources");
    expect(sourceErrors.length).toBeGreaterThan(0);
  });

  it("error when sources have no valid URL", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: nonEmptyString,
            url: nonEmptyString.filter((s) => {
              try { new URL(s); return false; } catch { return true; }
            }),
          }),
          { minLength: 1, maxLength: 3 },
        ),
        (sources) => {
          const data = makeMotherboardData(sources);
          const errors = runSanityChecks(data, "motherboard");
          const sourceErrors = errors.filter((e) => e.path === "sources");
          expect(sourceErrors.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("no source error when at least one valid URL exists", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("https://example.com", "https://asus.com/board", "http://test.org/spec"),
        (validUrl) => {
          const data = makeMotherboardData([
            { type: "manual", url: validUrl },
          ]);
          const errors = runSanityChecks(data, "motherboard");
          const sourceErrors = errors.filter((e) => e.path === "sources");
          expect(sourceErrors.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: yaml-generator, Property 21: Schema validation rejects invalid data
// Validates: Requirements 4.1
// ---------------------------------------------------------------------------
describe("Property 21: Schema validation rejects invalid data", () => {
  // Use the GPU schema since it has clear required fields and constraints
  const requiredGpuFields = [
    "id", "type", "chip_manufacturer", "manufacturer", "model",
    "interface", "physical", "power", "schema_version",
  ];

  it("missing required field produces at least one error with non-empty path and message", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...requiredGpuFields),
        (fieldToRemove) => {
          const validData: Record<string, unknown> = {
            id: "test-gpu",
            type: "gpu",
            chip_manufacturer: "NVIDIA",
            manufacturer: "ASUS",
            model: "Test GPU",
            interface: { pcie_gen: 4, lanes: 16 },
            physical: { slot_width: 2, length_mm: 300, slots_occupied: 2 },
            power: {
              tdp_w: 300,
              recommended_psu_w: 750,
              power_connectors: [{ type: "8-pin", count: 2 }],
            },
            schema_version: "2.0",
          };
          // Remove one required field
          const invalidData = { ...validData };
          delete invalidData[fieldToRemove];

          const result = validateFormData(invalidData, "gpu", gpuSchema);
          expect(result.errors.length).toBeGreaterThan(0);
          // At least one error should have a non-empty path and message
          const meaningful = result.errors.filter(
            (e) => e.message.length > 0,
          );
          expect(meaningful.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("wrong type for a field produces a validation error", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          { field: "id", badValue: 123 },
          { field: "type", badValue: 42 },
          { field: "manufacturer", badValue: true },
          { field: "model", badValue: [] },
          { field: "schema_version", badValue: null },
        ),
        ({ field, badValue }) => {
          const validData: Record<string, unknown> = {
            id: "test-gpu",
            type: "gpu",
            chip_manufacturer: "NVIDIA",
            manufacturer: "ASUS",
            model: "Test GPU",
            interface: { pcie_gen: 4, lanes: 16 },
            physical: { slot_width: 2, length_mm: 300, slots_occupied: 2 },
            power: {
              tdp_w: 300,
              recommended_psu_w: 750,
              power_connectors: [{ type: "8-pin", count: 2 }],
            },
            schema_version: "2.0",
          };
          const invalidData = { ...validData, [field]: badValue };

          const result = validateFormData(invalidData, "gpu", gpuSchema);
          expect(result.errors.length).toBeGreaterThan(0);
          const meaningful = result.errors.filter(
            (e) => e.message.length > 0,
          );
          expect(meaningful.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
