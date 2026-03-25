"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { IoClose } from "react-icons/io5";
import { FiCpu } from "react-icons/fi";
import { GITHUB_ISSUES_URL } from "../lib/github-links";
import type { DataManifest } from "../lib/types";

interface CPUSelectorProps {
  manifestComponents: DataManifest["components"];
  motherboardSocket: string;
  selectedCpuId: string | null;
  onSelect: (cpuId: string) => void;
  onRemove: () => void;
}

/** Filter manifest components to CPUs matching the given socket. */
export function filterCompatibleCPUs(
  manifestComponents: DataManifest["components"],
  motherboardSocket: string
): DataManifest["components"] {
  return manifestComponents.filter(
    (c) => c.type === "cpu" && c.specs.socket === motherboardSocket
  );
}

export default function CPUSelector({
  manifestComponents,
  motherboardSocket,
  selectedCpuId,
  onSelect,
  onRemove,
}: CPUSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const focusedIndex = useRef(-1);

  const compatibleCPUs = filterCompatibleCPUs(manifestComponents, motherboardSocket);
  const selectedCpu = selectedCpuId
    ? compatibleCPUs.find((c) => c.id === selectedCpuId) ?? null
    : null;

  const focusItem = useCallback((index: number) => {
    const items = listRef.current?.querySelectorAll<HTMLElement>('[role="option"]');
    if (!items || items.length === 0) return;
    const clamped = Math.max(0, Math.min(index, items.length - 1));
    focusedIndex.current = clamped;
    items[clamped].focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusItem(focusedIndex.current + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        focusItem(focusedIndex.current - 1);
      }
    },
    [isOpen, focusItem]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Focus first item when list opens
  useEffect(() => {
    if (isOpen && compatibleCPUs.length > 0) {
      focusItem(0);
    }
  }, [isOpen, compatibleCPUs.length, focusItem]);

  // Show selected CPU
  if (selectedCpu) {
    return (
      <div
        className="rounded-lg border border-zinc-700 bg-zinc-900 p-4"
        role="group"
        aria-label="CPU selection"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FiCpu aria-hidden="true" className="h-4 w-4 text-zinc-400" />
            <h3 className="text-sm font-semibold text-zinc-100">CPU</h3>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-400 hover:bg-zinc-800 hover:text-red-300"
            aria-label={`Remove ${selectedCpu.manufacturer} ${selectedCpu.model}`}
          >
            <IoClose aria-hidden="true" className="h-3.5 w-3.5" />
            Remove
          </button>
        </div>
        <div className="mt-2 rounded border border-zinc-700 bg-zinc-800 px-3 py-2">
          <div className="text-sm font-medium text-zinc-100">
            {selectedCpu.manufacturer} {selectedCpu.model}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-400">
            <span>Architecture: {String(selectedCpu.specs.architecture ?? selectedCpu.specs.microarchitecture ?? "—")}</span>
            <span>PCIe Gen: {selectedCpu.specs["pcie_config.cpu_gen"] != null ? `Gen ${selectedCpu.specs["pcie_config.cpu_gen"]}` : "—"}</span>
          </div>
        </div>
      </div>
    );
  }

  // Show "Select CPU" button or the open list
  return (
    <div
      className="rounded-lg border border-zinc-700 bg-zinc-900 p-4"
      role="group"
      aria-label="CPU selection"
    >
      <div className="flex items-center gap-2">
        <FiCpu aria-hidden="true" className="h-4 w-4 text-zinc-400" />
        <h3 className="text-sm font-semibold text-zinc-100">CPU</h3>
      </div>

      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="mt-3 w-full rounded border border-dashed border-zinc-600 px-3 py-2 text-sm text-zinc-400 hover:border-zinc-400 hover:text-zinc-200"
        >
          Select CPU
        </button>
      ) : (
        <div
          className="mt-3"
          role="dialog"
          aria-label="Select a CPU"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-zinc-400">
              Compatible CPUs ({motherboardSocket})
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              aria-label="Close CPU selector"
            >
              <IoClose aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>

          {compatibleCPUs.length === 0 ? (
            <section aria-label="Contribute" className="py-4 text-center text-sm text-zinc-500">
              <p>No compatible CPUs found for {motherboardSocket}.</p>
              <p className="mt-2">
                Know a compatible CPU?{" "}
                <a
                  href={GITHUB_ISSUES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 underline hover:text-blue-300"
                >
                  Submit it on GitHub (opens in new tab)
                </a>
              </p>
            </section>
          ) : (
            <ul
              ref={listRef}
              role="listbox"
              aria-label="Compatible CPUs"
              className="space-y-2"
            >
              {compatibleCPUs.map((cpu) => (
                <li
                  key={cpu.id}
                  role="option"
                  aria-selected={false}
                  tabIndex={-1}
                  className="cursor-pointer rounded border border-zinc-700 bg-zinc-800 px-3 py-2.5 outline-none hover:border-zinc-500 hover:bg-zinc-750 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  onClick={() => {
                    onSelect(cpu.id);
                    setIsOpen(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(cpu.id);
                      setIsOpen(false);
                    }
                  }}
                >
                  <div className="text-sm font-medium text-zinc-100">
                    {cpu.manufacturer} {cpu.model}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-400">
                    <span>Architecture: {String(cpu.specs.architecture ?? cpu.specs.microarchitecture ?? "—")}</span>
                    <span>PCIe Gen: {cpu.specs["pcie_config.cpu_gen"] != null ? `Gen ${cpu.specs["pcie_config.cpu_gen"]}` : "—"}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
