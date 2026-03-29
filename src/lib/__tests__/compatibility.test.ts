// Property tests for the compatibility module.
// Tests checkCompatibility, matchesSearch, and filterComponentsForSlot.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  checkCompatibility,
  matchesSearch,
  filterComponentsForSlot,
  SLOT_TYPE_TO_COMPONENT_TYPES,
} from "../compatibility";
import type {
  ComponentSummary,
  MotherboardSummary,
  Motherboard,
  SlotPosition,
} from "../types";

// ---------------------------------------------------------------------------
// Shared arbitraries
// ---------------------------------------------------------------------------

const slotTypes: SlotPosition["slot_type"][] = [
  "pcie",
  "m2",
  "dimm",
  "cpu",
  "sata_group",
];

/** Arbitrary for a minimal Motherboard with configurable socket, memory type, and m2 slots */
function arbMotherboard(overrides?: {
  socket?: string;
  memoryType?: "DDR4" | "DDR5";
  m2Slots?: Motherboard["m2_slots"];
}): fc.Arbitrary<Motherboard> {
  return fc
    .record({
      socket: overrides?.socket
        ? fc.constant(overrides.socket)
        : fc.constantFrom("LGA1700", "LGA1851", "AM5", "AM4"),
      memoryType: overrides?.memoryType
        ? fc.constant(overrides.memoryType)
        : fc.constantFrom("DDR4" as const, "DDR5" as const),
    })
    .map(({ socket, memoryType }) => ({
      id: "test-board",
      manufacturer: "Test",
      model: "Test Board",
      chipset: "Z790",
      socket,
      form_factor: "ATX",
      memory: {
        type: memoryType,
        max_speed_mhz: 5600,
        base_speed_mhz: 4800,
        max_capacity_gb: 128,
        ecc_support: false,
        channels: 2,
        slots: [],
        recommended_population: { two_dimm: [] },
      },
      m2_slots: overrides?.m2Slots ?? [],
      pcie_slots: [],
      sata_ports: [],
      sources: [],
      schema_version: "1.0",
    }));
}

/** Arbitrary GPU ComponentSummary */
const arbGpuComponent: fc.Arbitrary<ComponentSummary> = fc
  .record({
    id: fc.string({ minLength: 1, maxLength: 30 }),
    manufacturer: fc.constantFrom("NVIDIA", "AMD", "Intel", "ASUS", "MSI"),
    model: fc.string({ minLength: 1, maxLength: 40 }),
  })
  .map(({ id, manufacturer, model }) => ({
    id,
    type: "gpu",
    manufacturer,
    model,
    specs: { chip_manufacturer: manufacturer },
  }));

/** Arbitrary SATA ComponentSummary (sata_ssd, sata_hdd, or sata_drive) */
const arbSataComponent: fc.Arbitrary<ComponentSummary> = fc
  .record({
    id: fc.string({ minLength: 1, maxLength: 30 }),
    type: fc.constantFrom("sata_ssd", "sata_hdd", "sata_drive"),
    manufacturer: fc.constantFrom("Samsung", "WD", "Seagate", "Crucial"),
    model: fc.string({ minLength: 1, maxLength: 40 }),
  })
  .map(({ id, type, manufacturer, model }) => ({
    id,
    type,
    manufacturer,
    model,
    specs: { capacity_gb: 1000 },
  }));

/** Arbitrary NVMe ComponentSummary with a specific protocol */
function arbNvmeComponent(
  protocol?: "NVMe" | "SATA",
): fc.Arbitrary<ComponentSummary> {
  return fc
    .record({
      id: fc.string({ minLength: 1, maxLength: 30 }),
      manufacturer: fc.constantFrom("Samsung", "WD", "Crucial", "Corsair"),
      model: fc.string({ minLength: 1, maxLength: 40 }),
      protocol: protocol
        ? fc.constant(protocol)
        : fc.constantFrom("NVMe", "SATA"),
    })
    .map(({ id, manufacturer, model, protocol: proto }) => ({
      id,
      type: "nvme",
      manufacturer,
      model,
      specs: { "interface.protocol": proto, capacity_gb: 2000 },
    }));
}

/** Arbitrary RAM ComponentSummary with a specific interface type */
function arbRamComponent(
  interfaceType?: "DDR4" | "DDR5",
): fc.Arbitrary<ComponentSummary> {
  return fc
    .record({
      id: fc.string({ minLength: 1, maxLength: 30 }),
      manufacturer: fc.constantFrom("Corsair", "G.Skill", "Kingston"),
      model: fc.string({ minLength: 1, maxLength: 40 }),
      ramType: interfaceType
        ? fc.constant(interfaceType)
        : fc.constantFrom("DDR4", "DDR5"),
    })
    .map(({ id, manufacturer, model, ramType }) => ({
      id,
      type: "ram",
      manufacturer,
      model,
      specs: { "interface.type": ramType, "capacity.total_gb": 32 },
    }));
}

/** Arbitrary CPU ComponentSummary with a specific socket */
function arbCpuComponent(socket?: string): fc.Arbitrary<ComponentSummary> {
  return fc
    .record({
      id: fc.string({ minLength: 1, maxLength: 30 }),
      manufacturer: fc.constantFrom("Intel", "AMD"),
      model: fc.string({ minLength: 1, maxLength: 40 }),
      socket: socket
        ? fc.constant(socket)
        : fc.constantFrom("LGA1700", "LGA1851", "AM5", "AM4"),
    })
    .map(({ id, manufacturer, model, socket: s }) => ({
      id,
      type: "cpu",
      manufacturer,
      model,
      specs: { socket: s },
    }));
}

/** Arbitrary M2 slot definition */
const arbM2Slot: fc.Arbitrary<Motherboard["m2_slots"][number]> = fc
  .record({
    id: fc.string({ minLength: 1, maxLength: 10 }),
    iface: fc.constantFrom(
      "PCIe" as const,
      "SATA" as const,
      "PCIe_or_SATA" as const,
    ),
    supportsSata: fc.boolean(),
  })
  .map(({ id, iface, supportsSata }) => ({
    id,
    label: `M2_${id}`,
    interface: iface,
    gen: 4,
    lanes: 4,
    form_factors: ["2280"],
    source: "CPU" as const,
    supports_sata: supportsSata,
    heatsink_included: false,
    sharing: null,
  }));

/** Arbitrary component with a type that does NOT belong to a given slot */
function arbIncompatibleTypeComponent(
  slotType: SlotPosition["slot_type"],
): fc.Arbitrary<ComponentSummary> {
  const allowed = SLOT_TYPE_TO_COMPONENT_TYPES[slotType];
  const allTypes = [
    "gpu",
    "nvme",
    "ram",
    "cpu",
    "sata_ssd",
    "sata_hdd",
    "sata_drive",
  ];
  const incompatible = allTypes.filter((t) => !allowed.includes(t));
  return fc
    .record({
      id: fc.string({ minLength: 1, maxLength: 30 }),
      type: fc.constantFrom(...incompatible),
      manufacturer: fc.constant("Test"),
      model: fc.constant("Incompatible"),
    })
    .map(({ id, type, manufacturer, model }) => ({
      id,
      type,
      manufacturer,
      model,
      specs: {},
    }));
}

/** Arbitrary MotherboardSummary */
const arbMotherboardSummary: fc.Arbitrary<MotherboardSummary> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 30 }),
  manufacturer: fc.constantFrom("ASUS", "MSI", "Gigabyte", "ASRock"),
  model: fc.string({ minLength: 1, maxLength: 40 }),
  chipset: fc.constantFrom("Z790", "B650", "X670E", "Z890"),
  socket: fc.constantFrom("LGA1700", "LGA1851", "AM5"),
  form_factor: fc.constantFrom("ATX", "mATX", "ITX"),
});


// ---------------------------------------------------------------------------
// Feature: click-to-assign-interaction, Property 6: GPU and SATA always-compatible rules
// **Validates: Requirements 5.1, 5.5**
// ---------------------------------------------------------------------------

describe("Property 6: GPU and SATA always-compatible rules", () => {
  it("any GPU component is compatible with a PCIe slot", () => {
    fc.assert(
      fc.property(arbGpuComponent, arbMotherboard(), (gpu, motherboard) => {
        const result = checkCompatibility(gpu, "pcie", motherboard);
        expect(result.compatible).toBe(true);
        expect(result.reason).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it("any SATA component is compatible with a sata_group slot", () => {
    fc.assert(
      fc.property(
        arbSataComponent,
        arbMotherboard(),
        (sata, motherboard) => {
          const result = checkCompatibility(sata, "sata_group", motherboard);
          expect(result.compatible).toBe(true);
          expect(result.reason).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("a component whose type is not in the slot's compatible set returns incompatible", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...slotTypes),
        arbMotherboard(),
        (slotType, motherboard) => {
          const comp = arbIncompatibleTypeComponent(slotType);
          fc.assert(
            fc.property(comp, (component) => {
              const result = checkCompatibility(
                component,
                slotType,
                motherboard,
              );
              expect(result.compatible).toBe(false);
              expect(result.reason).toBeTruthy();
            }),
            { numRuns: 10 },
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ---------------------------------------------------------------------------
// Feature: click-to-assign-interaction, Property 7: NVMe-to-M.2 protocol compatibility
// **Validates: Requirements 5.2**
// ---------------------------------------------------------------------------

describe("Property 7: NVMe-to-M.2 protocol compatibility", () => {
  it("NVMe protocol + PCIe or PCIe_or_SATA slot interface => compatible", () => {
    fc.assert(
      fc.property(
        arbNvmeComponent("NVMe"),
        fc.constantFrom("PCIe" as const, "PCIe_or_SATA" as const),
        fc.boolean(),
        (nvme, iface, supportsSata) => {
          const slotId = "m2_test";
          const m2Slot = {
            id: slotId,
            label: "M2_test",
            interface: iface,
            gen: 4,
            lanes: 4,
            form_factors: ["2280"],
            source: "CPU" as const,
            supports_sata: supportsSata,
            heatsink_included: false,
            sharing: null,
          };
          const mb: Motherboard = {
            id: "test-board",
            manufacturer: "Test",
            model: "Test Board",
            chipset: "Z790",
            socket: "LGA1700",
            form_factor: "ATX",
            memory: {
              type: "DDR5",
              max_speed_mhz: 5600,
              base_speed_mhz: 4800,
              max_capacity_gb: 128,
              ecc_support: false,
              channels: 2,
              slots: [],
              recommended_population: { two_dimm: [] },
            },
            m2_slots: [m2Slot],
            pcie_slots: [],
            sata_ports: [],
            sources: [],
            schema_version: "1.0",
          };
          const result = checkCompatibility(nvme, "m2", mb, slotId);
          expect(result.compatible).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("NVMe protocol + SATA-only slot interface => incompatible", () => {
    fc.assert(
      fc.property(arbNvmeComponent("NVMe"), (nvme) => {
        const slotId = "m2_test";
        const m2Slot = {
          id: slotId,
          label: "M2_test",
          interface: "SATA" as const,
          gen: 4,
          lanes: 4,
          form_factors: ["2280"],
          source: "CPU" as const,
          supports_sata: true,
          heatsink_included: false,
          sharing: null,
        };
        const mb: Motherboard = {
          id: "test-board",
          manufacturer: "Test",
          model: "Test Board",
          chipset: "Z790",
          socket: "LGA1700",
          form_factor: "ATX",
          memory: {
            type: "DDR5",
            max_speed_mhz: 5600,
            base_speed_mhz: 4800,
            max_capacity_gb: 128,
            ecc_support: false,
            channels: 2,
            slots: [],
            recommended_population: { two_dimm: [] },
          },
          m2_slots: [m2Slot],
          pcie_slots: [],
          sata_ports: [],
          sources: [],
          schema_version: "1.0",
        };
        const result = checkCompatibility(nvme, "m2", mb, slotId);
        expect(result.compatible).toBe(false);
        expect(result.reason).toBeTruthy();
      }),
      { numRuns: 100 },
    );
  });

  it("SATA protocol + SATA slot interface => compatible", () => {
    fc.assert(
      fc.property(arbNvmeComponent("SATA"), (nvme) => {
        const slotId = "m2_test";
        const m2Slot = {
          id: slotId,
          label: "M2_test",
          interface: "SATA" as const,
          gen: 4,
          lanes: 4,
          form_factors: ["2280"],
          source: "CPU" as const,
          supports_sata: true,
          heatsink_included: false,
          sharing: null,
        };
        const mb: Motherboard = {
          id: "test-board",
          manufacturer: "Test",
          model: "Test Board",
          chipset: "Z790",
          socket: "LGA1700",
          form_factor: "ATX",
          memory: {
            type: "DDR5",
            max_speed_mhz: 5600,
            base_speed_mhz: 4800,
            max_capacity_gb: 128,
            ecc_support: false,
            channels: 2,
            slots: [],
            recommended_population: { two_dimm: [] },
          },
          m2_slots: [m2Slot],
          pcie_slots: [],
          sata_ports: [],
          sources: [],
          schema_version: "1.0",
        };
        const result = checkCompatibility(nvme, "m2", mb, slotId);
        expect(result.compatible).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("SATA protocol + PCIe_or_SATA with supports_sata=true => compatible", () => {
    fc.assert(
      fc.property(arbNvmeComponent("SATA"), (nvme) => {
        const slotId = "m2_test";
        const m2Slot = {
          id: slotId,
          label: "M2_test",
          interface: "PCIe_or_SATA" as const,
          gen: 4,
          lanes: 4,
          form_factors: ["2280"],
          source: "CPU" as const,
          supports_sata: true,
          heatsink_included: false,
          sharing: null,
        };
        const mb: Motherboard = {
          id: "test-board",
          manufacturer: "Test",
          model: "Test Board",
          chipset: "Z790",
          socket: "LGA1700",
          form_factor: "ATX",
          memory: {
            type: "DDR5",
            max_speed_mhz: 5600,
            base_speed_mhz: 4800,
            max_capacity_gb: 128,
            ecc_support: false,
            channels: 2,
            slots: [],
            recommended_population: { two_dimm: [] },
          },
          m2_slots: [m2Slot],
          pcie_slots: [],
          sata_ports: [],
          sources: [],
          schema_version: "1.0",
        };
        const result = checkCompatibility(nvme, "m2", mb, slotId);
        expect(result.compatible).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("SATA protocol + PCIe_or_SATA with supports_sata=false => incompatible", () => {
    fc.assert(
      fc.property(arbNvmeComponent("SATA"), (nvme) => {
        const slotId = "m2_test";
        const m2Slot = {
          id: slotId,
          label: "M2_test",
          interface: "PCIe_or_SATA" as const,
          gen: 4,
          lanes: 4,
          form_factors: ["2280"],
          source: "CPU" as const,
          supports_sata: false,
          heatsink_included: false,
          sharing: null,
        };
        const mb: Motherboard = {
          id: "test-board",
          manufacturer: "Test",
          model: "Test Board",
          chipset: "Z790",
          socket: "LGA1700",
          form_factor: "ATX",
          memory: {
            type: "DDR5",
            max_speed_mhz: 5600,
            base_speed_mhz: 4800,
            max_capacity_gb: 128,
            ecc_support: false,
            channels: 2,
            slots: [],
            recommended_population: { two_dimm: [] },
          },
          m2_slots: [m2Slot],
          pcie_slots: [],
          sata_ports: [],
          sources: [],
          schema_version: "1.0",
        };
        const result = checkCompatibility(nvme, "m2", mb, slotId);
        expect(result.compatible).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("SATA protocol + PCIe-only slot interface => incompatible", () => {
    fc.assert(
      fc.property(arbNvmeComponent("SATA"), (nvme) => {
        const slotId = "m2_test";
        const m2Slot = {
          id: slotId,
          label: "M2_test",
          interface: "PCIe" as const,
          gen: 4,
          lanes: 4,
          form_factors: ["2280"],
          source: "CPU" as const,
          supports_sata: false,
          heatsink_included: false,
          sharing: null,
        };
        const mb: Motherboard = {
          id: "test-board",
          manufacturer: "Test",
          model: "Test Board",
          chipset: "Z790",
          socket: "LGA1700",
          form_factor: "ATX",
          memory: {
            type: "DDR5",
            max_speed_mhz: 5600,
            base_speed_mhz: 4800,
            max_capacity_gb: 128,
            ecc_support: false,
            channels: 2,
            slots: [],
            recommended_population: { two_dimm: [] },
          },
          m2_slots: [m2Slot],
          pcie_slots: [],
          sata_ports: [],
          sources: [],
          schema_version: "1.0",
        };
        const result = checkCompatibility(nvme, "m2", mb, slotId);
        expect(result.compatible).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});


// ---------------------------------------------------------------------------
// Feature: click-to-assign-interaction, Property 8: RAM and CPU field-matching compatibility
// **Validates: Requirements 5.3, 5.4**
// ---------------------------------------------------------------------------

describe("Property 8: RAM and CPU field-matching compatibility", () => {
  it("RAM is compatible iff interface.type matches motherboard.memory.type", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("DDR4" as const, "DDR5" as const),
        fc.constantFrom("DDR4" as const, "DDR5" as const),
        (ramType, boardMemType) => {
          const ram: ComponentSummary = {
            id: "ram-test",
            type: "ram",
            manufacturer: "Corsair",
            model: "Vengeance",
            specs: { "interface.type": ramType },
          };
          const mb: Motherboard = {
            id: "test-board",
            manufacturer: "Test",
            model: "Test Board",
            chipset: "Z790",
            socket: "LGA1700",
            form_factor: "ATX",
            memory: {
              type: boardMemType,
              max_speed_mhz: 5600,
              base_speed_mhz: 4800,
              max_capacity_gb: 128,
              ecc_support: false,
              channels: 2,
              slots: [],
              recommended_population: { two_dimm: [] },
            },
            m2_slots: [],
            pcie_slots: [],
            sata_ports: [],
            sources: [],
            schema_version: "1.0",
          };
          const result = checkCompatibility(ram, "dimm", mb);
          if (ramType === boardMemType) {
            expect(result.compatible).toBe(true);
            expect(result.reason).toBeNull();
          } else {
            expect(result.compatible).toBe(false);
            expect(result.reason).toBeTruthy();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("CPU is compatible iff socket matches motherboard.socket", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("LGA1700", "LGA1851", "AM5", "AM4"),
        fc.constantFrom("LGA1700", "LGA1851", "AM5", "AM4"),
        (cpuSocket, boardSocket) => {
          const cpu: ComponentSummary = {
            id: "cpu-test",
            type: "cpu",
            manufacturer: "Intel",
            model: "i7-14700K",
            specs: { socket: cpuSocket },
          };
          const mb: Motherboard = {
            id: "test-board",
            manufacturer: "Test",
            model: "Test Board",
            chipset: "Z790",
            socket: boardSocket,
            form_factor: "ATX",
            memory: {
              type: "DDR5",
              max_speed_mhz: 5600,
              base_speed_mhz: 4800,
              max_capacity_gb: 128,
              ecc_support: false,
              channels: 2,
              slots: [],
              recommended_population: { two_dimm: [] },
            },
            m2_slots: [],
            pcie_slots: [],
            sata_ports: [],
            sources: [],
            schema_version: "1.0",
          };
          const result = checkCompatibility(cpu, "cpu", mb);
          if (cpuSocket === boardSocket) {
            expect(result.compatible).toBe(true);
            expect(result.reason).toBeNull();
          } else {
            expect(result.compatible).toBe(false);
            expect(result.reason).toBeTruthy();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ---------------------------------------------------------------------------
// Feature: click-to-assign-interaction, Property 9: Incompatibility reason is non-empty and descriptive
// **Validates: Requirements 5.6, 4.6**
// ---------------------------------------------------------------------------

describe("Property 9: Incompatibility reason is non-empty and descriptive", () => {
  it("type-mismatch incompatibility reason contains the component type", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...slotTypes),
        arbMotherboard(),
        (slotType, motherboard) => {
          fc.assert(
            fc.property(
              arbIncompatibleTypeComponent(slotType),
              (component) => {
                const result = checkCompatibility(
                  component,
                  slotType,
                  motherboard,
                );
                expect(result.compatible).toBe(false);
                expect(result.reason).toBeTruthy();
                expect(typeof result.reason).toBe("string");
                expect(result.reason!.length).toBeGreaterThan(0);
                // Reason should contain the component type
                expect(result.reason!).toContain(component.type);
              },
            ),
            { numRuns: 5 },
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("RAM type mismatch reason contains both the RAM type and board memory type", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("DDR4" as const, "DDR5" as const),
        (ramType) => {
          const boardMemType = ramType === "DDR4" ? "DDR5" : "DDR4";
          const ram: ComponentSummary = {
            id: "ram-test",
            type: "ram",
            manufacturer: "Corsair",
            model: "Vengeance",
            specs: { "interface.type": ramType },
          };
          const mb: Motherboard = {
            id: "test-board",
            manufacturer: "Test",
            model: "Test Board",
            chipset: "Z790",
            socket: "LGA1700",
            form_factor: "ATX",
            memory: {
              type: boardMemType as "DDR4" | "DDR5",
              max_speed_mhz: 5600,
              base_speed_mhz: 4800,
              max_capacity_gb: 128,
              ecc_support: false,
              channels: 2,
              slots: [],
              recommended_population: { two_dimm: [] },
            },
            m2_slots: [],
            pcie_slots: [],
            sata_ports: [],
            sources: [],
            schema_version: "1.0",
          };
          const result = checkCompatibility(ram, "dimm", mb);
          expect(result.compatible).toBe(false);
          expect(result.reason).toBeTruthy();
          // Reason should contain both the RAM type and the board type
          expect(result.reason!).toContain(ramType);
          expect(result.reason!).toContain(boardMemType);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("CPU socket mismatch reason contains both the CPU socket and board socket", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("LGA1700", "AM5"),
        (cpuSocket) => {
          const boardSocket = cpuSocket === "LGA1700" ? "AM5" : "LGA1700";
          const cpu: ComponentSummary = {
            id: "cpu-test",
            type: "cpu",
            manufacturer: "Intel",
            model: "i7-14700K",
            specs: { socket: cpuSocket },
          };
          const mb: Motherboard = {
            id: "test-board",
            manufacturer: "Test",
            model: "Test Board",
            chipset: "Z790",
            socket: boardSocket,
            form_factor: "ATX",
            memory: {
              type: "DDR5",
              max_speed_mhz: 5600,
              base_speed_mhz: 4800,
              max_capacity_gb: 128,
              ecc_support: false,
              channels: 2,
              slots: [],
              recommended_population: { two_dimm: [] },
            },
            m2_slots: [],
            pcie_slots: [],
            sata_ports: [],
            sources: [],
            schema_version: "1.0",
          };
          const result = checkCompatibility(cpu, "cpu", mb);
          expect(result.compatible).toBe(false);
          expect(result.reason).toBeTruthy();
          expect(result.reason!).toContain(cpuSocket);
          expect(result.reason!).toContain(boardSocket);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("NVMe protocol mismatch reason contains a protocol-related keyword", () => {
    // NVMe protocol on SATA-only slot
    fc.assert(
      fc.property(arbNvmeComponent("NVMe"), (nvme) => {
        const slotId = "m2_test";
        const mb: Motherboard = {
          id: "test-board",
          manufacturer: "Test",
          model: "Test Board",
          chipset: "Z790",
          socket: "LGA1700",
          form_factor: "ATX",
          memory: {
            type: "DDR5",
            max_speed_mhz: 5600,
            base_speed_mhz: 4800,
            max_capacity_gb: 128,
            ecc_support: false,
            channels: 2,
            slots: [],
            recommended_population: { two_dimm: [] },
          },
          m2_slots: [
            {
              id: slotId,
              label: "M2_test",
              interface: "SATA",
              gen: 4,
              lanes: 4,
              form_factors: ["2280"],
              source: "CPU",
              supports_sata: true,
              heatsink_included: false,
              sharing: null,
            },
          ],
          pcie_slots: [],
          sata_ports: [],
          sources: [],
          schema_version: "1.0",
        };
        const result = checkCompatibility(nvme, "m2", mb, slotId);
        expect(result.compatible).toBe(false);
        expect(result.reason).toBeTruthy();
        // Reason should mention NVMe or SATA
        expect(
          result.reason!.includes("NVMe") || result.reason!.includes("SATA"),
        ).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});


// ---------------------------------------------------------------------------
// Feature: click-to-assign-interaction, Property 2: Search filtering returns only matching items
// **Validates: Requirements 1.5, 2.4**
// ---------------------------------------------------------------------------

describe("Property 2: Search filtering returns only matching items", () => {
  it("every item passing matchesSearch contains the lowercased query in at least one searchable field (components)", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 20 }),
            type: fc.constantFrom("gpu", "nvme", "ram", "cpu"),
            manufacturer: fc.stringMatching(/^[a-zA-Z0-9 ]{1,20}$/),
            model: fc.stringMatching(/^[a-zA-Z0-9 \-]{1,20}$/),
          }).map((r) => ({
            ...r,
            specs: {},
          })),
          { minLength: 1, maxLength: 10 },
        ),
        fc.stringMatching(/^[a-z0-9]{1,8}$/),
        (items, query) => {
          const matching = items.filter((item) => matchesSearch(item, query));
          const lowerQuery = query.toLowerCase();

          // Every matching item must contain the query in at least one field
          for (const item of matching) {
            const fields = [item.manufacturer, item.model];
            const hasMatch = fields.some(
              (f) => f != null && f.toLowerCase().includes(lowerQuery),
            );
            expect(hasMatch).toBe(true);
          }

          // No matching item should be excluded
          const nonMatching = items.filter(
            (item) => !matchesSearch(item, query),
          );
          for (const item of nonMatching) {
            const fields = [item.manufacturer, item.model];
            const hasMatch = fields.some(
              (f) => f != null && f.toLowerCase().includes(lowerQuery),
            );
            expect(hasMatch).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("every motherboard passing matchesSearch contains the lowercased query in at least one searchable field", () => {
    fc.assert(
      fc.property(
        fc.array(arbMotherboardSummary, { minLength: 1, maxLength: 10 }),
        fc.stringMatching(/^[a-z0-9]{1,8}$/),
        (items, query) => {
          const matching = items.filter((item) => matchesSearch(item, query));
          const lowerQuery = query.toLowerCase();

          for (const item of matching) {
            const fields = [
              item.manufacturer,
              item.model,
              item.chipset,
              item.socket,
            ];
            const hasMatch = fields.some(
              (f) => f != null && f.toLowerCase().includes(lowerQuery),
            );
            expect(hasMatch).toBe(true);
          }

          const nonMatching = items.filter(
            (item) => !matchesSearch(item, query),
          );
          for (const item of nonMatching) {
            const fields = [
              item.manufacturer,
              item.model,
              item.chipset,
              item.socket,
            ];
            const hasMatch = fields.some(
              (f) => f != null && f.toLowerCase().includes(lowerQuery),
            );
            expect(hasMatch).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("empty query matches all items", () => {
    fc.assert(
      fc.property(
        fc.array(arbMotherboardSummary, { minLength: 0, maxLength: 10 }),
        (items) => {
          for (const item of items) {
            expect(matchesSearch(item, "")).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ---------------------------------------------------------------------------
// Feature: click-to-assign-interaction, Property 3: Compatibility filter ON shows only compatible components
// **Validates: Requirements 4.2**
// ---------------------------------------------------------------------------

describe("Property 3: Compatibility filter ON shows only compatible components", () => {
  it("every component in filterComponentsForSlot(compatibleOnly=true) passes checkCompatibility", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...slotTypes),
        arbMotherboard(),
        fc.array(
          fc.oneof(
            arbGpuComponent,
            arbSataComponent,
            arbNvmeComponent(),
            arbRamComponent(),
            arbCpuComponent(),
          ),
          { minLength: 0, maxLength: 15 },
        ),
        (slotType, motherboard, components) => {
          const result = filterComponentsForSlot(
            components,
            slotType,
            motherboard,
            true,
          );

          // Every returned component must be compatible
          for (const comp of result) {
            expect(comp.compatible).toBe(true);
            expect(comp.reason).toBeNull();
            // Double-check with checkCompatibility
            const check = checkCompatibility(comp, slotType, motherboard);
            expect(check.compatible).toBe(true);
          }

          // No compatible component should be excluded
          const allInCategory = components.filter((c) =>
            (SLOT_TYPE_TO_COMPONENT_TYPES[slotType] ?? []).includes(c.type),
          );
          for (const comp of allInCategory) {
            const check = checkCompatibility(comp, slotType, motherboard);
            if (check.compatible) {
              expect(result.some((r) => r.id === comp.id)).toBe(true);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ---------------------------------------------------------------------------
// Feature: click-to-assign-interaction, Property 4: Compatibility filter OFF shows all components in category
// **Validates: Requirements 4.3**
// ---------------------------------------------------------------------------

describe("Property 4: Compatibility filter OFF shows all components in category", () => {
  it("filterComponentsForSlot(compatibleOnly=false) contains every component whose type is in SLOT_TYPE_TO_COMPONENT_TYPES", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...slotTypes),
        arbMotherboard(),
        fc.array(
          fc.oneof(
            arbGpuComponent,
            arbSataComponent,
            arbNvmeComponent(),
            arbRamComponent(),
            arbCpuComponent(),
          ),
          { minLength: 0, maxLength: 15 },
        ),
        (slotType, motherboard, components) => {
          const result = filterComponentsForSlot(
            components,
            slotType,
            motherboard,
            false,
          );

          const allowedTypes = SLOT_TYPE_TO_COMPONENT_TYPES[slotType] ?? [];

          // Every component in the category should be present
          const categoryComponents = components.filter((c) =>
            allowedTypes.includes(c.type),
          );
          expect(result.length).toBe(categoryComponents.length);

          for (const comp of categoryComponents) {
            expect(result.some((r) => r.id === comp.id)).toBe(true);
          }

          // No component outside the category should be present
          for (const r of result) {
            expect(allowedTypes).toContain(r.type);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
