"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { FiSearch } from "react-icons/fi";
import {
  fetchComponentPage,
  fetchComponentFilterOptions,
} from "@/lib/supabase-queries";
import type { ComponentSummary } from "@/lib/types";
import {
  COMPONENT_TYPE_META,
  COMPONENT_SPEC_COLUMNS,
} from "@/lib/component-type-meta";

const PAGE_SIZE = 20;

function getSpecValue(specs: Record<string, unknown>, key: string): string {
  const val = specs[key];
  if (val == null) return "-";
  return String(val);
}

interface ComponentTableProps {
  /** When provided, operates in static client-side mode (no Supabase fetching). */
  components?: ComponentSummary[];
}

export default function ComponentTable({ components }: ComponentTableProps = {}) {
  const router = useRouter();

  // Determine mode: static (props-driven) vs dynamic (Supabase-fetching)
  const isStaticMode = components !== undefined;

  // --- State (mirrors MotherboardTable pattern) ---
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [manufacturerFilter, setManufacturerFilter] = useState<string | null>(null);
  const [rows, setRows] = useState<ComponentSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(!isStaticMode);
  const [error, setError] = useState<string | null>(null);
  const [manufacturerOptions, setManufacturerOptions] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>("type");
  const [sortDirection, setSortDirection] = useState<"ascending" | "descending">("ascending");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Static mode: derive rows from props ---
  useEffect(() => {
    if (!isStaticMode) return;
    let filtered = [...components!];

    // Apply search filter
    if (search) {
      const lower = search.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.manufacturer.toLowerCase().includes(lower) ||
          c.model.toLowerCase().includes(lower) ||
          c.type.toLowerCase().includes(lower)
      );
    }

    // Apply type filter
    if (typeFilter) {
      filtered = filtered.filter((c) => c.type === typeFilter);
    }

    // Apply manufacturer filter
    if (manufacturerFilter) {
      filtered = filtered.filter((c) => c.manufacturer === manufacturerFilter);
    }

    // Apply sort
    filtered.sort((a, b) => {
      const aVal = sortColumn === "type" ? a.type : sortColumn === "manufacturer" ? a.manufacturer : a.model;
      const bVal = sortColumn === "type" ? b.type : sortColumn === "manufacturer" ? b.manufacturer : b.model;
      const cmp = aVal.toLowerCase().localeCompare(bVal.toLowerCase());
      return sortDirection === "ascending" ? cmp : -cmp;
    });

    setRows(filtered);
    setTotalCount(filtered.length);
  }, [isStaticMode, components, search, typeFilter, manufacturerFilter, sortColumn, sortDirection]);

  // --- Static mode: derive manufacturer options from props ---
  useEffect(() => {
    if (!isStaticMode) return;
    const mfrs = [...new Set(components!.map((c) => c.manufacturer))].sort();
    setManufacturerOptions(mfrs);
  }, [isStaticMode, components]);

  // --- Dynamic mode: Fetch filter options on mount ---
  useEffect(() => {
    if (isStaticMode) return;
    fetchComponentFilterOptions()
      .then((opts) => setManufacturerOptions(opts.manufacturers))
      .catch((err) => {
        console.warn("Failed to load component filter options:", err);
      });
  }, [isStaticMode]);

  // --- Dynamic mode: Fetch page data when page/search/typeFilter/manufacturerFilter change ---
  useEffect(() => {
    if (isStaticMode) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchComponentPage({
      page,
      pageSize: PAGE_SIZE,
      type: typeFilter || null,
      manufacturer: manufacturerFilter || null,
      search: search || null,
    })
      .then((result) => {
        if (!cancelled) {
          setRows(result.rows);
          setTotalCount(result.totalCount);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to fetch components");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isStaticMode, page, search, typeFilter, manufacturerFilter]);

  // --- Page-out-of-range: reset to page 1 ---
  useEffect(() => {
    if (!loading && rows.length === 0 && totalCount > 0) {
      setPage(1);
    }
  }, [loading, rows.length, totalCount]);

  // --- Debounce searchInput -> search (300ms) ---
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // --- Filter change handlers ---
  const handleTypeChange = useCallback((value: string) => {
    setTypeFilter(value || null);
    setPage(1);
  }, []);

  const handleManufacturerChange = useCallback((value: string) => {
    setManufacturerFilter(value || null);
    setPage(1);
  }, []);

  // --- Sort handler (static mode) ---
  const handleSort = useCallback((column: string) => {
    setSortColumn((prev) => {
      if (prev === column) {
        setSortDirection((d) => (d === "ascending" ? "descending" : "ascending"));
        return prev;
      }
      setSortDirection("ascending");
      return column;
    });
  }, []);

  // --- Retry handler ---
  const handleRetry = useCallback(() => {
    setError(null);
    setLoading(true);
    fetchComponentPage({
      page,
      pageSize: PAGE_SIZE,
      type: typeFilter || null,
      manufacturer: manufacturerFilter || null,
      search: search || null,
    })
      .then((result) => {
        setRows(result.rows);
        setTotalCount(result.totalCount);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to fetch components");
      })
      .finally(() => setLoading(false));
  }, [page, typeFilter, manufacturerFilter, search]);

  // --- Navigation handlers ---
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

  // --- Type-specific spec columns ---
  const visibleSpecColumns = useMemo(() => {
    if (typeFilter && COMPONENT_SPEC_COLUMNS[typeFilter]) {
      return COMPONENT_SPEC_COLUMNS[typeFilter];
    }
    return [] as { key: string; label: string }[];
  }, [typeFilter]);

  // --- Type dropdown options from static COMPONENT_TYPE_META ---
  const typeOptions = useMemo(
    () => Object.entries(COMPONENT_TYPE_META).map(([key, meta]) => ({ key, label: meta.label })),
    []
  );

  const hasActiveFilters = !!(search || typeFilter || manufacturerFilter);
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const getTypeLabel = (type: string) =>
    COMPONENT_TYPE_META[type]?.label ?? type;

  const TypeIcon = ({ type }: { type: string }) => {
    const meta = COMPONENT_TYPE_META[type];
    if (!meta) return null;
    const Icon = meta.icon;
    return <Icon className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />;
  };

  // --- RENDER ---
  return (
    <div className="space-y-4">
      {/* --- Search + Filters --- */}
      <div className="space-y-3">
        {/* Search input -- always visible */}
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

        {/* Mobile: toggle button for filters (below 640px) */}
        <button
          type="button"
          onClick={() => setFiltersOpen((prev) => !prev)}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-500 sm:hidden"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z"
            />
          </svg>
          Filters
        </button>

        {/* Filter dropdowns -- desktop: always visible; mobile: collapsible */}
        <div
          className={`flex-col gap-3 sm:flex sm:flex-row ${filtersOpen ? "flex" : "hidden sm:flex"}`}
        >
          <select
            value={typeFilter ?? ""}
            onChange={(e) => handleTypeChange(e.target.value)}
            aria-label="Filter by component type"
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:w-auto"
          >
            <option value="">All Types</option>
            {typeOptions.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>

          <select
            value={manufacturerFilter ?? ""}
            onChange={(e) => handleManufacturerChange(e.target.value)}
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

      {/* --- Loading state --- */}
      {loading && (
        <div className="flex items-center justify-center py-12" role="status">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200" />
          <span className="ml-3 text-sm text-zinc-400">Loading components...</span>
        </div>
      )}

      {/* --- Error state --- */}
      {error && !loading && (
        <div
          className="rounded-lg border border-red-700/50 bg-red-900/20 px-4 py-3 text-sm text-red-300"
          role="alert"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="mt-2 rounded bg-red-800 px-3 py-1 text-xs text-red-100 hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* --- Empty state: no components at all --- */}
      {!loading && !error && totalCount === 0 && !hasActiveFilters && (
        <p className="py-8 text-center text-sm text-zinc-500">
          No components are available.
        </p>
      )}

      {/* --- Empty state: no filter matches --- */}
      {!loading && !error && totalCount === 0 && hasActiveFilters && (
        <p className="py-8 text-center text-sm text-zinc-500">
          No components match your current filters. Try adjusting your search or filter criteria.
        </p>
      )}

      {/* --- Table/list rendering --- */}
      {!loading && !error && rows.length > 0 && (
        <>
          {/* Desktop table (>=768px) */}
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 text-left text-xs text-zinc-400">
                  {[
                    { key: "type", label: "Type" },
                    { key: "manufacturer", label: "Manufacturer" },
                    { key: "model", label: "Model" },
                  ].map((col) => (
                    <th
                      key={col.key}
                      role="columnheader"
                      className="px-3 py-2 font-medium cursor-pointer select-none"
                      onClick={() => isStaticMode && handleSort(col.key)}
                      aria-sort={sortColumn === col.key ? sortDirection : undefined}
                    >
                      {col.label}
                    </th>
                  ))}
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
                {rows.map((comp) => (
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

          {/* Mobile card layout (<768px) */}
          <ul role="list" className="space-y-2 md:hidden">
            {rows.map((comp) => {
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

      {/* --- Pagination controls --- */}
      {!loading && !error && totalCount > 0 && (
        <div className="flex items-center justify-between border-t border-zinc-800 pt-3 text-sm text-zinc-400">
          <span>
            {totalCount} component{totalCount !== 1 ? "s" : ""} found
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded border border-zinc-700 px-3 py-1 text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-zinc-700 px-3 py-1 text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
