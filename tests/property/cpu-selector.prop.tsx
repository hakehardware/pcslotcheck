// Property tests for CPU selector filtering logic.
// Feature: cpu-component-support, Property 6: CPU selector filters by socket.

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { filterCompatibleCPUs } from "../../src/components/CPUSelector";
import type { DataManifest } from "../../src/lib/types";

// -- Generators ---------------------------------------------------------------

const CPU_SOCKETS = ["AM5", "LGA 1700", "LGA 1851"] as const;
const MICROARCHITECTURES = ["Zen 4", "Zen 5", "Alder Lake", "Raptor Lake", "Arrow Lake"] as const;
const MANUFACTURERS = ["AMD", "Intel"] as const;

type ManifestComponent = DataManifest["components"][number];

/** Generates a manifest-style CPU component entry with a given socket. */
function arbManifestCPU(socket?: string): fc.Arbitrary<ManifestComponent> {
  return fc
    .record({
      idSuffix: fc.stringMatching(/^[a-z][a-z0-9]{1,8}$/).filter((s) => s.length >= 2),
      manufacturer: fc.constantFrom(...MANUFACTURERS),
      model: fc.constantFrom("Ryzen 7 9700X", "Core i7-14700K", "Ryzen 9 9950X", "Core i5-12400F"),
      socket: socket ? fc.constant(socket) : fc.constantFrom(...CPU_SOCKETS),
      microarchitecture: fc.constantFrom(...MICROARCHITECTURES),
      cpuGen: fc.integer({ min: 3, max: 5 }),
    })
    .map(({ idSuffix, manufacturer, model, socket, microarchitecture, cpuGen }) => ({
      id: `${manufacturer.toLowerCase()}-${model.toLowerCase().replace(/\s+/g, "-")}-${idSuffix}`,
      type: "cpu",
      manufacturer,
      model,
      specs: {
        socket,
        microarchitecture,
        "pcie_config.cpu_gen": cpuGen,
      },
    }));
}

/** Generates a manifest-style non-CPU component (nvme, gpu, ram, sata_drive). */
function arbManifestNonCPU(): fc.Arbitrary<ManifestComponent> {
  return fc
    .record({
      idSuffix: fc.stringMatching(/^[a-z][a-z0-9]{1,8}$/).filter((s) => s.length >= 2),
      type: fc.constantFrom("nvme", "gpu", "ram", "sata_drive"),
      manufacturer: fc.constantFrom("Samsung", "Corsair", "NVIDIA", "WD"),
      model: fc.constantFrom("990 Pro", "Vengeance DDR5", "RTX 4070", "SN850X"),
    })
    .map(({ idSuffix, type, manufacturer, model }) => ({
      id: `${manufacturer.toLowerCase()}-${model.toLowerCase().replace(/\s+/g, "-")}-${idSuffix}`,
      type,
      manufacturer,
      model,
      specs: {},
    }));
}

// ---------------------------------------------------------------------------
// Property 6: CPU selector filters by socket
// **Validates: Requirements 7.2**
//
// For any list of CPU components and any motherboard socket string, filtering
// the list to CPUs whose socket matches the motherboard socket should produce
// a list where every entry has a matching socket and no compatible CPU from
// the original list is excluded.
// ---------------------------------------------------------------------------

describe("Property 6: CPU selector filters by socket", () => {
  it("filtered list contains only CPUs with matching sockets", () => {
    fc.assert(
      fc.property(
        fc.array(arbManifestCPU(), { minLength: 0, maxLength: 20 }),
        fc.array(arbManifestNonCPU(), { minLength: 0, maxLength: 10 }),
        fc.constantFrom(...CPU_SOCKETS),
        (cpuComponents, nonCpuComponents, targetSocket) => {
          const allComponents = [...cpuComponents, ...nonCpuComponents];
          const filtered = filterCompatibleCPUs(allComponents, targetSocket);

          // Every result must be a CPU with matching socket
          for (const entry of filtered) {
            expect(entry.type).toBe("cpu");
            expect(entry.specs.socket).toBe(targetSocket);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("no compatible CPU from the original list is excluded", () => {
    fc.assert(
      fc.property(
        fc.array(arbManifestCPU(), { minLength: 0, maxLength: 20 }),
        fc.array(arbManifestNonCPU(), { minLength: 0, maxLength: 10 }),
        fc.constantFrom(...CPU_SOCKETS),
        (cpuComponents, nonCpuComponents, targetSocket) => {
          const allComponents = [...cpuComponents, ...nonCpuComponents];
          const filtered = filterCompatibleCPUs(allComponents, targetSocket);
          const filteredIds = new Set(filtered.map((c) => c.id));

          // Every CPU in the original list with matching socket must appear in filtered
          for (const comp of allComponents) {
            if (comp.type === "cpu" && comp.specs.socket === targetSocket) {
              expect(filteredIds.has(comp.id)).toBe(true);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("non-CPU components are never included in filtered results", () => {
    fc.assert(
      fc.property(
        fc.array(arbManifestCPU(), { minLength: 0, maxLength: 10 }),
        fc.array(arbManifestNonCPU(), { minLength: 1, maxLength: 10 }),
        fc.constantFrom(...CPU_SOCKETS),
        (cpuComponents, nonCpuComponents, targetSocket) => {
          const allComponents = [...cpuComponents, ...nonCpuComponents];
          const filtered = filterCompatibleCPUs(allComponents, targetSocket);
          const nonCpuIds = new Set(nonCpuComponents.map((c) => c.id));

          for (const entry of filtered) {
            expect(nonCpuIds.has(entry.id)).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("filtered count equals the number of matching CPUs in the input", () => {
    fc.assert(
      fc.property(
        fc.array(arbManifestCPU(), { minLength: 0, maxLength: 20 }),
        fc.array(arbManifestNonCPU(), { minLength: 0, maxLength: 10 }),
        fc.constantFrom(...CPU_SOCKETS),
        (cpuComponents, nonCpuComponents, targetSocket) => {
          const allComponents = [...cpuComponents, ...nonCpuComponents];
          const filtered = filterCompatibleCPUs(allComponents, targetSocket);

          const expectedCount = allComponents.filter(
            (c) => c.type === "cpu" && c.specs.socket === targetSocket
          ).length;

          expect(filtered.length).toBe(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });
});
