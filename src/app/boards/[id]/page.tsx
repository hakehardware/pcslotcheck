import { promises as fs } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { FiArrowLeft, FiExternalLink } from "react-icons/fi";
import type { Motherboard } from "@/lib/types";

function dash(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

export default async function BoardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let board: Motherboard | null = null;
  try {
    const filePath = path.join(process.cwd(), "public", "data", "motherboards", `${id}.json`);
    const raw = await fs.readFile(filePath, "utf-8");
    board = JSON.parse(raw) as Motherboard;
  } catch {
    board = null;
  }

  if (!board) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-lg text-zinc-400">Motherboard not found.</p>
        <Link
          href="/boards"
          className="mt-4 inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-zinc-50"
        >
          <FiArrowLeft className="h-4 w-4" />
          Back to Motherboards
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      {/* Back + Slot Checker links */}
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <Link
          href="/boards"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-zinc-50"
        >
          <FiArrowLeft className="h-4 w-4" />
          Back to Motherboards
        </Link>
        <Link
          href={`/check?board=${board.id}`}
          className="inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-zinc-50"
        >
          <FiExternalLink className="h-4 w-4" />
          Open in Slot Checker
        </Link>
      </div>

      {/* h1: Board name */}
      <h1 className="text-3xl font-bold tracking-tight text-zinc-50">
        {dash(board.manufacturer)} {dash(board.model)}
      </h1>

      {/* Top-level fields */}
      <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-zinc-500">Manufacturer</dt>
          <dd className="text-zinc-200">{dash(board.manufacturer)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Model</dt>
          <dd className="text-zinc-200">{dash(board.model)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Chipset</dt>
          <dd className="text-zinc-200">{dash(board.chipset)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Socket</dt>
          <dd className="text-zinc-200">{dash(board.socket)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Form Factor</dt>
          <dd className="text-zinc-200">{dash(board.form_factor)}</dd>
        </div>
      </dl>

      {/* Memory Configuration */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-zinc-50">Memory Configuration</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-zinc-500">Type</dt>
            <dd className="text-zinc-200">{dash(board.memory?.type)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Max Speed</dt>
            <dd className="text-zinc-200">
              {board.memory?.max_speed_mhz != null ? `${board.memory.max_speed_mhz} MHz` : "-"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Max Capacity</dt>
            <dd className="text-zinc-200">
              {board.memory?.max_capacity_gb != null ? `${board.memory.max_capacity_gb} GB` : "-"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Slots</dt>
            <dd className="text-zinc-200">{dash(board.memory?.slots?.length)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">ECC Support</dt>
            <dd className="text-zinc-200">
              {board.memory?.ecc_support != null ? (board.memory.ecc_support ? "Yes" : "No") : "-"}
            </dd>
          </div>
        </dl>
      </section>

      {/* M.2 Slots */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-zinc-50">M.2 Slots</h2>
        {board.m2_slots && board.m2_slots.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500">
                  <th className="pb-2 pr-4 font-medium">Label</th>
                  <th className="pb-2 pr-4 font-medium">Interface</th>
                  <th className="pb-2 pr-4 font-medium">Gen</th>
                  <th className="pb-2 pr-4 font-medium">Lanes</th>
                  <th className="pb-2 pr-4 font-medium">Form Factors</th>
                  <th className="pb-2 pr-4 font-medium">Source</th>
                  <th className="pb-2 font-medium">SATA Support</th>
                </tr>
              </thead>
              <tbody>
                {board.m2_slots.map((slot) => (
                  <tr key={slot.id} className="border-b border-zinc-800/50">
                    <td className="py-2 pr-4 text-zinc-200">{dash(slot.label)}</td>
                    <td className="py-2 pr-4 text-zinc-200">{dash(slot.interface)}</td>
                    <td className="py-2 pr-4 text-zinc-200">{dash(slot.gen)}</td>
                    <td className="py-2 pr-4 text-zinc-200">{dash(slot.lanes)}</td>
                    <td className="py-2 pr-4 text-zinc-200">
                      {slot.form_factors?.length ? slot.form_factors.join(", ") : "-"}
                    </td>
                    <td className="py-2 pr-4 text-zinc-200">{dash(slot.source)}</td>
                    <td className="py-2 text-zinc-200">
                      {slot.supports_sata != null ? (slot.supports_sata ? "Yes" : "No") : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">No M.2 slots.</p>
        )}
      </section>

      {/* PCIe Slots */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-zinc-50">PCIe Slots</h2>
        {board.pcie_slots && board.pcie_slots.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500">
                  <th className="pb-2 pr-4 font-medium">Label</th>
                  <th className="pb-2 pr-4 font-medium">Gen</th>
                  <th className="pb-2 pr-4 font-medium">Electrical Lanes</th>
                  <th className="pb-2 pr-4 font-medium">Physical Size</th>
                  <th className="pb-2 pr-4 font-medium">Position</th>
                  <th className="pb-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {board.pcie_slots.map((slot) => (
                  <tr key={slot.id} className="border-b border-zinc-800/50">
                    <td className="py-2 pr-4 text-zinc-200">{dash(slot.label)}</td>
                    <td className="py-2 pr-4 text-zinc-200">{dash(slot.gen)}</td>
                    <td className="py-2 pr-4 text-zinc-200">{dash(slot.electrical_lanes)}</td>
                    <td className="py-2 pr-4 text-zinc-200">{dash(slot.physical_size)}</td>
                    <td className="py-2 pr-4 text-zinc-200">{dash(slot.position)}</td>
                    <td className="py-2 text-zinc-200">{dash(slot.source)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">No PCIe slots.</p>
        )}
      </section>

      {/* SATA Ports */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-zinc-50">SATA Ports</h2>
        {board.sata_ports && board.sata_ports.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500">
                  <th className="pb-2 pr-4 font-medium">Version</th>
                  <th className="pb-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {board.sata_ports.map((port) => (
                  <tr key={port.id} className="border-b border-zinc-800/50">
                    <td className="py-2 pr-4 text-zinc-200">{dash(port.version)}</td>
                    <td className="py-2 text-zinc-200">{dash(port.source)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">No SATA ports.</p>
        )}
      </section>
    </div>
  );
}
