"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { IoClose } from "react-icons/io5";
import { SLOT_CATEGORY_TO_COMPONENT_TYPE } from "../lib/ui-types";
import type { SlotCategory } from "../lib/ui-types";
import { SPEC_DISPLAY_KEYS, searchComponents } from "../lib/component-search";
import { GITHUB_ISSUES_URL } from "../lib/github-links";
import type { DataManifest } from "../lib/types";

interface ComponentPickerProps {
  slotCategory: SlotCategory;
  manifestComponents: DataManifest["components"];
  onSelect: (componentId: string) => void;
  onClose: () => void;
  /** CPU-only: filter components to this socket */
  motherboardSocket?: string;
  /** Show selected-component card when set */
  selectedComponentId?: string | null;
  /** Callback when user clicks remove on the selected-component card */
  onRemove?: () => void;
}

const SEARCH_PLACEHOLDERS: Record<SlotCategory, string> = {
  cpu: "Search CPUs...",
  m2: "Search NVMe drives...",
  pcie: "Search GPUs...",
  memory: "Search RAM...",
  sata: "Search SATA drives...",
};

const CATEGORY_DISPLAY_NAMES: Record<SlotCategory, string> = {
  cpu: "CPU",
  m2: "NVMe drive",
  pcie: "GPU",
  memory: "RAM",
  sata: "SATA drive",
};

function formatSpecValue(key: string, value: unknown): string {
  if (value == null) return "\u2014";
  if (key.includes("capacity") && typeof value === "number") return `${value} GB`;
  if (key.includes("tdp_w") && typeof value === "number") return `${value}W`;
  if (key.includes("speed_mhz") && typeof value === "number") return `${value} MHz`;
  if (key.includes("length_mm") && typeof value === "number") return `${value} mm`;
  if (key.includes("pcie_gen") && typeof value === "number") return `Gen ${value}`;
  if (key.includes("cpu_gen") && typeof value === "number") return `Gen ${value}`;
  return String(value);
}

export default function ComponentPicker({
  slotCategory,
  manifestComponents,
  onSelect,
  onClose,
  motherboardSocket,
  selectedComponentId,
  onRemove,
}: ComponentPickerProps) {
  // Inline mode: component manages its own open/close state
  const isInlineMode = selectedComponentId !== undefined;
  const [isOpen, setIsOpen] = useState(false);

  // Search state
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Refs
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const focusedIndex = useRef(-1);

  // Filter compatible components by type (and socket for CPU)
  const compatibleType = SLOT_CATEGORY_TO_COMPONENT_TYPE[slotCategory];
  const compatibleComponents = manifestComponents.filter((c) => {
    if (c.type !== compatibleType) return false;
    if (slotCategory === "cpu" && motherboardSocket) {
      return c.specs.socket === motherboardSocket;
    }
    return true;
  });

  const specKeys = SPEC_DISPLAY_KEYS[compatibleType] ?? [];

  // Find selected component
  const selectedComponent = selectedComponentId
    ? compatibleComponents.find((c) => c.id === selectedComponentId) ?? null
    : null;

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Search results
  const { items: displayItems, totalMatches } = searchComponents(
    compatibleComponents,
    debouncedQuery,
    5,
  );

  // Determine if picker is effectively open
  const pickerIsOpen = isInlineMode ? isOpen : true;

  // Close handler: in inline mode, close internally; in modal mode, call prop
  const handleClose = useCallback(() => {
    if (isInlineMode) {
      setIsOpen(false);
      setSearchInput("");
      setDebouncedQuery("");
      focusedIndex.current = -1;
    } else {
      onClose();
    }
  }, [isInlineMode, onClose]);

  // Handle component selection
  const handleSelect = useCallback(
    (componentId: string) => {
      onSelect(componentId);
      if (isInlineMode) {
        setIsOpen(false);
        setSearchInput("");
        setDebouncedQuery("");
        focusedIndex.current = -1;
      }
    },
    [onSelect, isInlineMode],
  );

  // Focus a list item by index
  const focusItem = useCallback((index: number) => {
    const items = listRef.current?.querySelectorAll<HTMLElement>('[role="option"]');
    if (!items || items.length === 0) return;
    const clamped = Math.max(0, Math.min(index, items.length - 1));
    focusedIndex.current = clamped;
    items[clamped].focus();
  }, []);

  // Auto-focus search input when picker opens
  useEffect(() => {
    if (pickerIsOpen && compatibleComponents.length > 0) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [pickerIsOpen, compatibleComponents.length]);

  // Keyboard navigation on search input
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (displayItems.length > 0) {
          focusItem(0);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    },
    [displayItems.length, focusItem, handleClose],
  );

  // Keyboard navigation on list items
  const handleItemKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLLIElement>, index: number, componentId: string) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusItem(index + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (index === 0) {
          // Return focus to search input
          focusedIndex.current = -1;
          searchInputRef.current?.focus();
        } else {
          focusItem(index - 1);
        }
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleSelect(componentId);
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    },
    [focusItem, handleSelect, handleClose],
  );

  // --- Render: Selected component card (inline mode only) ---
  if (isInlineMode && selectedComponent) {
    return (
      <div
        className="rounded-lg border border-zinc-700 bg-zinc-900 p-4"
        role="group"
        aria-label={`${CATEGORY_DISPLAY_NAMES[slotCategory]} selection`}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-100">
            {CATEGORY_DISPLAY_NAMES[slotCategory]}
          </h3>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-400 hover:bg-zinc-800 hover:text-red-300"
              aria-label={`Remove ${selectedComponent.manufacturer} ${selectedComponent.model}`}
            >
              <IoClose aria-hidden="true" className="h-3.5 w-3.5" />
              Remove
            </button>
          )}
        </div>
        <div className="mt-2 rounded border border-zinc-700 bg-zinc-800 px-3 py-2">
          <div className="text-sm font-medium text-zinc-100">
            {selectedComponent.manufacturer} {selectedComponent.model}
          </div>
          {specKeys.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-400">
              {specKeys.map(({ key, label }) => {
                const value = selectedComponent.specs[key];
                if (value == null) return null;
                return (
                  <span key={key}>
                    {label}: {formatSpecValue(key, value)}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Render: Collapsed "Select [type]" button (inline mode, no selection) ---
  if (isInlineMode && !pickerIsOpen) {
    return (
      <div
        className="rounded-lg border border-zinc-700 bg-zinc-900 p-4"
        role="group"
        aria-label={`${CATEGORY_DISPLAY_NAMES[slotCategory]} selection`}
      >
        <h3 className="text-sm font-semibold text-zinc-100">
          {CATEGORY_DISPLAY_NAMES[slotCategory]}
        </h3>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="mt-3 w-full rounded border border-dashed border-zinc-600 px-3 py-2 text-sm text-zinc-400 hover:border-zinc-400 hover:text-zinc-200"
        >
          Select {CATEGORY_DISPLAY_NAMES[slotCategory]}
        </button>
      </div>
    );
  }

  // --- Render: Open picker (both inline and modal modes) ---
  return (
    <div
      className="rounded-lg border border-zinc-700 bg-zinc-900 p-4"
      role="dialog"
      aria-label={`Select a component for ${slotCategory} slot`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100">
          {isInlineMode
            ? `Compatible ${CATEGORY_DISPLAY_NAMES[slotCategory]}s${motherboardSocket ? ` (${motherboardSocket})` : ""}`
            : "Select Component"}
        </h3>
        <button
          type="button"
          onClick={handleClose}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          aria-label="Close component picker"
        >
          <IoClose aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      {compatibleComponents.length === 0 ? (
        <section aria-label="Contribute" className="py-4 text-center text-sm text-zinc-500">
          <p>
            {slotCategory === "cpu" && motherboardSocket
              ? `No compatible CPUs found for ${motherboardSocket}.`
              : "No compatible components found for this slot type."}
          </p>
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
        <>
          {/* Search input */}
          <div className="mb-3">
            <input
              ref={searchInputRef}
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={SEARCH_PLACEHOLDERS[slotCategory]}
              aria-label={`Search ${CATEGORY_DISPLAY_NAMES[slotCategory]}s`}
              className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Results */}
          {displayItems.length === 0 && debouncedQuery.trim().length > 0 ? (
            <p className="py-4 text-center text-sm text-zinc-500">
              No matches found
            </p>
          ) : (
            <>
              <ul
                ref={listRef}
                role="listbox"
                aria-label="Compatible components"
                className="space-y-2"
              >
                {displayItems.map((component, index) => (
                  <li
                    key={component.id}
                    role="option"
                    aria-selected={false}
                    tabIndex={-1}
                    className="cursor-pointer rounded border border-zinc-700 bg-zinc-800 px-3 py-2.5 outline-none hover:border-zinc-500 hover:bg-zinc-750 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    onClick={() => handleSelect(component.id)}
                    onKeyDown={(e) => handleItemKeyDown(e, index, component.id)}
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

              {/* Count indicator */}
              {totalMatches > 5 && (
                <p className="mt-2 text-center text-xs text-zinc-500">
                  Showing 5 of {totalMatches} matches
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
