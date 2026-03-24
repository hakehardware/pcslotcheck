"use client";

import { useEffect, useRef, useCallback } from "react";
import { SLOT_CATEGORY_TO_COMPONENT_TYPE } from "../lib/ui-types";
import { GITHUB_ISSUES_URL } from "../lib/github-links";
import type { DataManifest } from "../lib/types";

interface ComponentPickerProps {
  slotCategory: "memory" | "m2" | "pcie" | "sata";
  manifestComponents: DataManifest["components"];
  onSelect: (componentId: string) => void;
  onClose: () => void;
}

/** Key specs to display per component type */
const SPEC_DISPLAY_KEYS: Record<string, { key: string; label: string }[]> = {
  nvme: [
    { key: "capacity_gb", label: "Capacity" },
    { key: "interface.pcie_gen", label: "PCIe Gen" },
    { key: "interface.protocol", label: "Protocol" },
  ],
  gpu: [
    { key: "power.tdp_w", label: "TDP" },
    { key: "interface.pcie_gen", label: "PCIe Gen" },
    { key: "physical.length_mm", label: "Length" },
  ],
  ram: [
    { key: "interface.type", label: "Type" },
    { key: "interface.speed_mhz", label: "Speed" },
    { key: "capacity.total_gb", label: "Capacity" },
  ],
  sata_drive: [
    { key: "capacity_gb", label: "Capacity" },
    { key: "form_factor", label: "Form Factor" },
  ],
};

function formatSpecValue(key: string, value: unknown): string {
  if (value == null) return "—";
  if (key.includes("capacity") && typeof value === "number") return `${value} GB`;
  if (key.includes("tdp_w") && typeof value === "number") return `${value}W`;
  if (key.includes("speed_mhz") && typeof value === "number") return `${value} MHz`;
  if (key.includes("length_mm") && typeof value === "number") return `${value} mm`;
  if (key.includes("pcie_gen") && typeof value === "number") return `Gen ${value}`;
  return String(value);
}

export default function ComponentPicker({
  slotCategory,
  manifestComponents,
  onSelect,
  onClose,
}: ComponentPickerProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const focusedIndex = useRef(-1);

  const compatibleType = SLOT_CATEGORY_TO_COMPONENT_TYPE[slotCategory];
  const filtered = manifestComponents.filter((c) => c.type === compatibleType);
  const specKeys = SPEC_DISPLAY_KEYS[compatibleType] ?? [];

  const focusItem = useCallback((index: number) => {
    const items = listRef.current?.querySelectorAll<HTMLElement>('[role="option"]');
    if (!items || items.length === 0) return;
    const clamped = Math.max(0, Math.min(index, items.length - 1));
    focusedIndex.current = clamped;
    items[clamped].focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
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
    [onClose, focusItem],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Focus first item on mount
  useEffect(() => {
    if (filtered.length > 0) {
      focusItem(0);
    }
  }, [filtered.length, focusItem]);

  return (
    <div
      className="rounded-lg border border-zinc-700 bg-zinc-900 p-4"
      role="dialog"
      aria-label={`Select a component for ${slotCategory} slot`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100">
          Select Component
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          aria-label="Close component picker"
        >
          ✕
        </button>
      </div>

      {filtered.length === 0 ? (
        <section aria-label="Contribute" className="py-4 text-center text-sm text-zinc-500">
          <p>No compatible components found for this slot type.</p>
          <p className="mt-2">
            Know a compatible component?{" "}
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
          aria-label="Compatible components"
          className="space-y-2"
        >
          {filtered.map((component) => (
            <li
              key={component.id}
              role="option"
              aria-selected={false}
              tabIndex={-1}
              className="cursor-pointer rounded border border-zinc-700 bg-zinc-800 px-3 py-2.5 outline-none hover:border-zinc-500 hover:bg-zinc-750 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              onClick={() => onSelect(component.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(component.id);
                }
              }}
            >
              <div className="text-sm font-medium text-zinc-100">
                {component.manufacturer} {component.model}
              </div>
              {specKeys.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-400">
                  {specKeys.map(({ key, label }) => {
                    const value = component.specs[key];
                    if (value == null) return null;
                    return (
                      <span key={key}>
                        {label}: {formatSpecValue(key, value)}
                      </span>
                    );
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
