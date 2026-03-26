"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { FiSearch, FiChevronUp, FiChevronDown } from "react-icons/fi";
import type { ComponentSummary } from "@/lib/types";
import {
  COMPONENT_TYPE_META,
  COMPONENT_SPEC_COLUMNS,
} from "@/lib/component-type-meta";

interface ComponentTableProps {
  components: ComponentSummary[];
}

type SortField = "type" | "manufacturer" | "model";
type SortDir = "ascending" | "descending";

function getSpecValue(specs: Record<string, unknown>, key: string): string {
  const val = specs[key];
  if (val == null) return "-";
  return String(val);
}

export default function ComponentTable({ components }: ComponentTableProps) {
  const router = useRouter();

  // --- State ---
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [manufacturerFilter, setManufacturerFilter] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>("type");
  const [sortDir, setSortDir] = useState<SortDir>("ascending");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Debounce search input (300ms) ---
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // --- Derive filter options from data ---
  const typeOptions = useMemo(() => {
    const types = new Set(components.map((c) => c.type));
    return Array.from(types).sort();
  }, [components]);

  const manufacturerOptions = useMemo(() => {
    const mfrs = new Set(components.map((c) => c.manufacturer));
    return Array.from(mfrs).sort();
  }, [components]);

  // --- Filter + sort ---
  const filtered = useMemo(() => {
    const lowerSearch = search.toLowerCase();
    let result = components;

    if (search) {
      result = result.filter(
        (c) =>
          c.manufacturer.toLowerCase().includes(lowerSearch) ||
          c.model.toLowerCase().includes(lowerSearch) ||
          c.type.toLowerCase().includes(lowerSearch)
      );
    }

    if (typeFilter) {
      result = result.filter((c) => c.type === typeFilter);
    }

    if (manufacturerFilter) {
      result = result.filter((c) => c.manufacturer === manufacturerFilter);
    }

    // Sort
    const dir = sortDir === "ascending" ? 1 : -1;
    result = [...result].sort((a, b) => {
      const aVal = a[sortField].toLowerCase();
      const bVal = b[sortField].toLowerCase();
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      return 0;
    });

    return result;
  }, [components, search, typeFilter, manufacturerFilter, sortField, sortDir]);

  // --- Handlers ---
  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "ascending" ? "descending" : "ascending"));
      } else {
        setSortField(field);
        setSortDir("ascending");
      }
    },
    [sortField]
  );

  const navigateToComponent = useCallback(
    (id: string) => {
      router.push(`/components/${id}`);
    },
    [router]
  );

  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent, id: string) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        navigateToComponent(id);
      }
    },
    [navigateToComponent]
  );

  // --- Determine which spec columns to show ---
  const visibleSpecColumns = useMemo(() => {
    if (typeFilter && COMPONENT_SPEC_COLUMNS[typeFilter]) {
      return COMPONENT_SPEC_COLUMNS[typeFilter];
    }
    // When showing all types, show no type-specific spec columns
    // (they vary too much across types)
    return [] as { key: string; label: string }[];
  }, [typeFilter]);

  const renderSortHeader = (field: SortField, label: string) => {
    const isActive = sortField === field;
    return (
      <th
        role="columnheader"
        aria-sort={isActive ? sortDir : undefined}
        className="cursor-pointer select-none px-3 py-2 font-medium transition-colors hover:text-zinc-200"
        onClick={() => handleSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {isActive &&
            (sortDir === "ascending" ? (
              <FiChevronUp className="h-3 w-3" />
            ) : (
              <FiChevronDown className="h-3 w-3" />
            ))}
        </span>
      </th>
    );
  };

  const getTypeLabel = (type: string) =>
    COMPONENT_TYPE_META[type]?.label ?? type;

  const TypeIcon = ({ type }: { type: string }) => {
    const meta = COMPONENT_TYPE_META[type];
    if (!meta) return null;
    const Icon = meta.icon;
    return <Icon className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />;
  };

  // --- Empty manifest ---
  if (components.length === 0) {
    return (
      <div className="space-y-4">
        <p className="py-8 text-center text-sm text-zinc-500">
          No components are available. The data manifest is empty.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* --- Search + Filters --- */}
      <div className="space-y-3">
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search components..."
            aria-label="Search components"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by component type"
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:w-auto"
          >
            <option value="">All Types</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {getTypeLabel(t)}
              </option>
            ))}
          </select>

          <select
            value={manufacturerFilter}
            onChange={(e) => setManufacturerFilter(e.target.value)}
            aria-label="Filter by manufacturer"
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:w-auto"
          >
            <option value="">All Manufacturers</option>
            {manufacturerOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* --- Count --- */}
      <div className="text-sm text-zinc-400">
        {filtered.length} component{filtered.length !== 1 ? "s" : ""} found
      </div>

      {/* --- No filter matches --- */}
      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-500">
          No components match your current filters. Try adjusting your search or filter criteria.
        </p>
      )}

      {/* --- Desktop table (>=768px) --- */}
      {filtered.length > 0 && (
        <>
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 text-left text-xs text-zinc-400">
                  {renderSortHeader("type", "Type")}
                  {renderSortHeader("manufacturer", "Manufacturer")}
                  {renderSortHeader("model", "Model")}
                  {visibleSpecColumns.map((col) => (
                    <th
                      key={col.key}
                      role="columnheader"
                      className="px-3 py-2 font-medium"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((comp) => (
                  <tr
                    key={comp.id}
                    tabIndex={0}
                    role="row"
                    onClick={() => navigateToComponent(comp.id)}
                    onKeyDown={(e) => handleRowKeyDown(e, comp.id)}
                    className="cursor-pointer border-b border-zinc-800 transition-colors outline-none hover:bg-zinc-800/60 focus:bg-zinc-800/60 focus:ring-1 focus:ring-blue-500"
                  >
                    <td className="px-3 py-2 text-zinc-100">
                      <span className="inline-flex items-center gap-1.5">
                        <TypeIcon type={comp.type} />
                        {getTypeLabel(comp.type)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-zinc-100">{comp.manufacturer}</td>
                    <td className="px-3 py-2 text-zinc-100">{comp.model}</td>
                    {visibleSpecColumns.map((col) => (
                      <td key={col.key} className="px-3 py-2 text-zinc-400">
                        {getSpecValue(comp.specs, col.key)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* --- Mobile card layout (<768px) --- */}
          <ul role="list" className="space-y-2 md:hidden">
            {filtered.map((comp) => {
              const specCols = COMPONENT_SPEC_COLUMNS[comp.type] ?? [];
              return (
                <li
                  key={comp.id}
                  role="listitem"
                  tabIndex={0}
                  onClick={() => navigateToComponent(comp.id)}
                  onKeyDown={(e) => handleRowKeyDown(e, comp.id)}
                  className="cursor-pointer rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 transition-colors outline-none hover:border-zinc-500 hover:bg-zinc-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                    <TypeIcon type={comp.type} />
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
                      {getTypeLabel(comp.type)}
                    </span>
                    <span>
                      {comp.manufacturer} {comp.model}
                    </span>
                  </div>
                  {specCols.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-400">
                      {specCols.map((col) => (
                        <span key={col.key}>
                          {col.label}: {getSpecValue(comp.specs, col.key)}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
