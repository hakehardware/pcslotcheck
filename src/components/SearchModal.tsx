"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type {
  SlotPosition,
  Motherboard,
  MotherboardSummary,
  ComponentSummary,
  DataManifest,
} from "@/lib/types";
import {
  matchesSearch,
  filterComponentsForSlot,
  type AnnotatedComponent,
} from "@/lib/compatibility";

// --- Types ---

export type SearchModalMode =
  | { kind: "board" }
  | {
      kind: "component";
      slotId: string;
      slotType: SlotPosition["slot_type"];
      motherboard: Motherboard;
    };

export interface SearchModalProps {
  mode: SearchModalMode;
  manifest: DataManifest;
  onSelect: (item: MotherboardSummary | ComponentSummary) => void;
  onClose: () => void;
}

// --- Heading helpers ---

const SLOT_TYPE_LABELS: Record<SlotPosition["slot_type"], string> = {
  pcie: "GPU",
  m2: "NVMe",
  dimm: "RAM",
  cpu: "CPU",
  sata_group: "SATA Drive",
};

export function getModalHeading(mode: SearchModalMode): string {
  if (mode.kind === "board") return "Select Motherboard";
  const typeLabel = SLOT_TYPE_LABELS[mode.slotType] ?? mode.slotType;
  return `Select ${typeLabel} for ${mode.slotId}`;
}

// --- Result item rendering helpers ---

/** Render type-specific spec details for a component result. */
export function getComponentSpecText(comp: ComponentSummary): string {
  switch (comp.type) {
    case "gpu":
      return String(comp.specs["chip_manufacturer"] ?? "");
    case "nvme":
    case "sata_ssd":
    case "sata_hdd":
    case "sata_drive":
      return comp.specs["capacity_gb"] ? `${comp.specs["capacity_gb"]} GB` : "";
    case "ram": {
      const totalGb = comp.specs["capacity.total_gb"];
      const ifaceType = comp.specs["interface.type"];
      const parts: string[] = [];
      if (ifaceType) parts.push(String(ifaceType));
      if (totalGb) parts.push(`${totalGb} GB`);
      return parts.join(" ");
    }
    case "cpu":
      return String(comp.specs["socket"] ?? "");
    default:
      return "";
  }
}

// --- Motherboard result item ---

function MotherboardResultItem({
  mb,
  isHighlighted,
  onSelect,
  onMouseEnter,
}: {
  mb: MotherboardSummary;
  isHighlighted: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={isHighlighted}
      data-testid={`result-${mb.id}`}
      className={`w-full cursor-pointer px-3 py-2 text-left text-sm transition-colors ${
        isHighlighted ? "bg-blue-600/30 text-white" : "text-zinc-200 hover:bg-zinc-700/50"
      }`}
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
    >
      <span className="font-medium">{mb.manufacturer} {mb.model}</span>
      <span className="ml-2 text-xs text-zinc-400">
        {mb.chipset} | {mb.socket} | {mb.form_factor}
      </span>
    </button>
  );
}

// --- Component result item ---

function ComponentResultItem({
  comp,
  isHighlighted,
  onSelect,
  onMouseEnter,
}: {
  comp: AnnotatedComponent;
  isHighlighted: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
}) {
  const specText = getComponentSpecText(comp);
  const isSelectable = comp.compatible;

  return (
    <button
      type="button"
      role="option"
      aria-selected={isHighlighted}
      aria-disabled={!isSelectable}
      data-testid={`result-${comp.id}`}
      data-compatible={comp.compatible}
      className={`w-full px-3 py-2 text-left text-sm transition-colors ${
        !isSelectable
          ? "cursor-not-allowed opacity-50"
          : isHighlighted
            ? "cursor-pointer bg-blue-600/30 text-white"
            : "cursor-pointer text-zinc-200 hover:bg-zinc-700/50"
      }`}
      onClick={() => {
        if (isSelectable) onSelect();
      }}
      onMouseEnter={onMouseEnter}
    >
      <span className={isSelectable ? "font-medium" : ""}>
        {comp.manufacturer} {comp.model}
      </span>
      {specText && (
        <span className="ml-2 text-xs text-zinc-400">{specText}</span>
      )}
      {!isSelectable && comp.reason && (
        <span className="ml-2 text-xs text-red-400">{comp.reason}</span>
      )}
    </button>
  );
}

// --- Main SearchModal component ---

export default function SearchModal({
  mode,
  manifest,
  onSelect,
  onClose,
}: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [compatibleOnly, setCompatibleOnly] = useState(true);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // --- Compute filtered results ---

  const results = useMemo(() => {
    if (mode.kind === "board") {
      return manifest.motherboards.filter((mb) => matchesSearch(mb, query));
    }
    // Component mode
    const annotated = filterComponentsForSlot(
      manifest.components,
      mode.slotType,
      mode.motherboard,
      compatibleOnly,
      mode.slotId,
    );
    return annotated.filter((c) => matchesSearch(c, query));
  }, [mode, manifest, query, compatibleOnly]);

  // Reset highlight when results change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [results]);

  // --- Selection handler ---

  const handleSelect = useCallback(
    (index: number) => {
      const item = results[index];
      if (!item) return;

      if (mode.kind === "component") {
        const annotated = item as AnnotatedComponent;
        if (!annotated.compatible) return;
      }

      onSelect(item);
    },
    [results, mode, onSelect],
  );

  // --- Keyboard navigation ---

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev < results.length - 1 ? prev + 1 : 0,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : results.length - 1,
          );
          break;
        case "Enter":
          e.preventDefault();
          handleSelect(highlightedIndex);
          break;
      }
    },
    [onClose, results.length, highlightedIndex, handleSelect],
  );

  // Scroll highlighted item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const highlighted = list.children[highlightedIndex] as HTMLElement | undefined;
    if (highlighted?.scrollIntoView) {
      highlighted.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex]);

  // --- Focus trapping ---

  const handleFocusTrap = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const modal = modalRef.current;
      if (!modal) return;

      const focusable = modal.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [],
  );

  const heading = getModalHeading(mode);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onKeyDown={(e) => {
        handleFocusTrap(e);
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        data-testid="search-modal-backdrop"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        data-testid="search-modal"
        className="relative z-10 flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="border-b border-zinc-700 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-100" data-testid="search-modal-heading">
            {heading}
          </h2>
        </div>

        {/* Search input + toggle */}
        <div className="flex items-center gap-3 border-b border-zinc-700 px-4 py-2">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="search-modal-input"
            className="flex-1 rounded border border-zinc-600 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          {mode.kind === "component" && (
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={compatibleOnly}
                onChange={(e) => setCompatibleOnly(e.target.checked)}
                data-testid="compatible-only-toggle"
                className="rounded border-zinc-600"
              />
              Compatible only
            </label>
          )}
        </div>

        {/* Result list */}
        <div
          ref={listRef}
          role="listbox"
          data-testid="search-modal-results"
          className="flex-1 overflow-y-auto"
        >
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-zinc-500">
              No results found
            </div>
          ) : mode.kind === "board" ? (
            (results as MotherboardSummary[]).map((mb, i) => (
              <MotherboardResultItem
                key={mb.id}
                mb={mb}
                isHighlighted={i === highlightedIndex}
                onSelect={() => handleSelect(i)}
                onMouseEnter={() => setHighlightedIndex(i)}
              />
            ))
          ) : (
            (results as AnnotatedComponent[]).map((comp, i) => (
              <ComponentResultItem
                key={comp.id}
                comp={comp}
                isHighlighted={i === highlightedIndex}
                onSelect={() => handleSelect(i)}
                onMouseEnter={() => setHighlightedIndex(i)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
