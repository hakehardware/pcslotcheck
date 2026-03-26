import { promises as fs } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { FiArrowLeft } from "react-icons/fi";
import type {
  Component,
  CPUComponent,
  GPUComponent,
  NVMeComponent,
  RAMComponent,
  SATAComponent,
} from "@/lib/types";

function dash(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

const TYPE_LABELS: Record<string, string> = {
  cpu: "CPU",
  gpu: "GPU",
  nvme: "NVMe",
  ram: "RAM",
  sata_drive: "SATA Drive",
};

function CPUDetails({ component }: { component: CPUComponent }) {
  return (
    <>
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-zinc-50">Processor Details</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-zinc-500">Socket</dt>
            <dd className="text-zinc-200">{dash(component.socket)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Microarchitecture</dt>
            <dd className="text-zinc-200">{dash(component.microarchitecture)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Architecture</dt>
            <dd className="text-zinc-200">{dash(component.architecture)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Cores</dt>
            <dd className="text-zinc-200">{dash(component.cores)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Threads</dt>
            <dd className="text-zinc-200">{dash(component.threads)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">TDP</dt>
            <dd className="text-zinc-200">
              {component.tdp_w != null ? `${component.tdp_w} W` : "-"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-zinc-50">PCIe Configuration</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-zinc-500">CPU PCIe Gen</dt>
            <dd className="text-zinc-200">{dash(component.pcie_config?.cpu_gen)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">CPU Lanes</dt>
            <dd className="text-zinc-200">{dash(component.pcie_config?.cpu_lanes)}</dd>
          </div>
        </dl>
      </section>
    </>
  );
}

function GPUDetails({ component }: { component: GPUComponent }) {
  return (
    <>
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-zinc-50">PCIe Interface</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-zinc-500">PCIe Gen</dt>
            <dd className="text-zinc-200">{dash(component.interface?.pcie_gen)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Lanes</dt>
            <dd className="text-zinc-200">{dash(component.interface?.lanes)}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-zinc-50">Physical Dimensions</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-zinc-500">Length</dt>
            <dd className="text-zinc-200">
              {component.physical?.length_mm != null ? `${component.physical.length_mm} mm` : "-"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Width</dt>
            <dd className="text-zinc-200">
              {component.physical?.slot_width != null ? `${component.physical.slot_width}-slot` : "-"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-zinc-50">Power Requirements</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-zinc-500">TDP</dt>
            <dd className="text-zinc-200">
              {component.power?.tdp_w != null ? `${component.power.tdp_w} W` : "-"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Power Connectors</dt>
            <dd className="text-zinc-200">
              {component.power?.power_connectors?.length
                ? component.power.power_connectors
                    .map((c) => `${c.count}x ${c.type}`)
                    .join(", ")
                : "-"}
            </dd>
          </div>
        </dl>
      </section>
    </>
  );
}

function NVMeDetails({ component }: { component: NVMeComponent }) {
  return (
    <>
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-zinc-50">Interface</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-zinc-500">Protocol</dt>
            <dd className="text-zinc-200">{dash(component.interface?.protocol)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">PCIe Gen</dt>
            <dd className="text-zinc-200">{dash(component.interface?.pcie_gen)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Lanes</dt>
            <dd className="text-zinc-200">{dash(component.interface?.lanes)}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-zinc-50">Storage</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-zinc-500">Form Factor</dt>
            <dd className="text-zinc-200">{dash(component.form_factor)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Capacity</dt>
            <dd className="text-zinc-200">
              {component.capacity_gb != null ? `${component.capacity_gb} GB` : "-"}
            </dd>
          </div>
        </dl>
      </section>
    </>
  );
}

function RAMDetails({ component }: { component: RAMComponent }) {
  return (
    <>
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-zinc-50">Memory Interface</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-zinc-500">Type</dt>
            <dd className="text-zinc-200">{dash(component.interface?.type)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Speed</dt>
            <dd className="text-zinc-200">
              {component.interface?.speed_mhz != null
                ? `${component.interface.speed_mhz} MHz`
                : "-"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Base Speed</dt>
            <dd className="text-zinc-200">
              {component.interface?.base_speed_mhz != null
                ? `${component.interface.base_speed_mhz} MHz`
                : "-"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-zinc-50">Capacity</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-zinc-500">Modules</dt>
            <dd className="text-zinc-200">{dash(component.capacity?.modules)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Per Module</dt>
            <dd className="text-zinc-200">
              {component.capacity?.per_module_gb != null
                ? `${component.capacity.per_module_gb} GB`
                : "-"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Total Capacity</dt>
            <dd className="text-zinc-200">
              {component.capacity?.total_gb != null
                ? `${component.capacity.total_gb} GB`
                : "-"}
            </dd>
          </div>
        </dl>
      </section>
    </>
  );
}

function SATADetails({ component }: { component: SATAComponent }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold text-zinc-50">Drive Details</h2>
      <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-zinc-500">Form Factor</dt>
          <dd className="text-zinc-200">{dash(component.form_factor)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Capacity</dt>
          <dd className="text-zinc-200">
            {component.capacity_gb != null ? `${component.capacity_gb} GB` : "-"}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Interface</dt>
          <dd className="text-zinc-200">{dash(component.interface)}</dd>
        </div>
      </dl>
    </section>
  );
}

function TypeSpecificDetails({ component }: { component: Component }) {
  switch (component.type) {
    case "cpu":
      return <CPUDetails component={component} />;
    case "gpu":
      return <GPUDetails component={component} />;
    case "nvme":
      return <NVMeDetails component={component} />;
    case "ram":
      return <RAMDetails component={component} />;
    case "sata_drive":
      return <SATADetails component={component} />;
    default:
      return null;
  }
}

export default async function ComponentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let component: Component | null = null;
  try {
    const filePath = path.join(
      process.cwd(),
      "public",
      "data",
      "components",
      `${id}.json`
    );
    const raw = await fs.readFile(filePath, "utf-8");
    component = JSON.parse(raw) as Component;
  } catch {
    component = null;
  }

  if (!component) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-lg text-zinc-400">Component not found.</p>
        <Link
          href="/components"
          className="mt-4 inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-zinc-50"
        >
          <FiArrowLeft className="h-4 w-4" />
          Back to Components
        </Link>
      </div>
    );
  }

  const typeLabel = TYPE_LABELS[component.type] ?? component.type;

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      {/* Back link */}
      <div className="mb-8">
        <Link
          href="/components"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-zinc-50"
        >
          <FiArrowLeft className="h-4 w-4" />
          Back to Components
        </Link>
      </div>

      {/* h1: Component name */}
      <h1 className="text-3xl font-bold tracking-tight text-zinc-50">
        {dash(component.manufacturer)} {dash(component.model)}
      </h1>

      {/* Common fields */}
      <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-zinc-500">Manufacturer</dt>
          <dd className="text-zinc-200">{dash(component.manufacturer)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Model</dt>
          <dd className="text-zinc-200">{dash(component.model)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Type</dt>
          <dd className="text-zinc-200">{typeLabel}</dd>
        </div>
      </dl>

      {/* Type-specific sections */}
      <TypeSpecificDetails component={component} />
    </div>
  );
}
