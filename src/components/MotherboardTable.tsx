"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { fetchMotherboardPage, fetchFilterOptions } from "../lib/supabase-queries";
import type { MotherboardSummary, FilterOptions } from "../lib/types";

const PAGE_SIZE = 10;

interface MotherboardTableProps {
  selectedBoardId: string | null;
  onSelectBoard: (boardId: string) => void;
}

export default function MotherboardTable({
  selectedBoardId,
  onSelectBoard,
}: MotherboardTableProps) {
  // --- 3.1: State ---
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [manufacturer, setManufacturer] = useState<string | null>(null);
  const [chipset, setChipset] = useState<string | null>(null);
  const [rows, setRows] = useState<MotherboardSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    manufacturers: [],
    chipsets: [],
  });
  const [filtersOpen, setFiltersOpen] = useState(false);

  // --- 3.3: Search debounce ref ---
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- 3.2: Fetch filter options on mount ---
  useEffect(() => {
    fetchFilterOptions()
      .then(setFilterOptions)
      .catch((err) => {
        console.warn("Failed to load filter options:", err);
      });
  }, []);

  // --- 3.2: Fetch page data when page/search/manufacturer/chipset change ---
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchMotherboardPage({
      page,
      pageSize: PAGE_SIZE,
      manufacturer,
      chipset,
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
          setError(err instanceof Error ? err.message : "Failed to fetch motherboards");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, search, manufacturer, chipset]);

  // --- 3.3: Debounce searchInput → search ---
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

  // --- 3.4: Filter change handlers ---
  const handleManufacturerChange = useCallback(
    (value: string) => {
      setManufacturer(value || null);
      setPage(1);
    },
    []
  );

  const handleChipsetChange = useCallback(
    (value: string) => {
      setChipset(value || null);
      setPage(1);
    },
    []
  );

  // --- 3.8: Retry handler ---
  const handleRetry = useCallback(() => {
    setError(null);
    setLoading(true);
    fetchMotherboardPage({
      page,
      pageSize: PAGE_SIZE,
      manufacturer,
      chipset,
      search: search || null,
    })
      .then((result) => {
        setRows(result.rows);
        setTotalCount(result.totalCount);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to fetch motherboards");
      })
      .finally(() => setLoading(false));
  }, [page, manufacturer, chipset, search]);

  // Row interaction handler
  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent, boardId: string) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelectBoard(boardId);
      }
    },
    [onSelectBoard]
  );

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // --- RENDER ---
  return (
    <div className="space-y-4">
      {/* --- 3.5: FilterBar --- */}
      <div className="space-y-3">
        {/* Search input — always visible */}
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search motherboards..."
          aria-label="Search motherboards"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />

        {/* Mobile: toggle button for filters */}
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

        {/* Filter dropdowns — desktop: always visible row; mobile: collapsible */}
        <div
          className={`flex-col gap-3 sm:flex sm:flex-row ${filtersOpen ? "flex" : "hidden sm:flex"}`}
        >
          <select
            value={manufacturer ?? ""}
            onChange={(e) => handleManufacturerChange(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:w-auto"
          >
            <option value="">All Manufacturers</option>
            {filterOptions.manufacturers.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={chipset ?? ""}
            onChange={(e) => handleChipsetChange(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:w-auto"
          >
            <option value="">All Chipsets</option>
            {filterOptions.chipsets.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* --- 3.8: Loading state --- */}
      {loading && (
        <div className="flex items-center justify-center py-12" role="status">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200" />
          <span className="ml-3 text-sm text-zinc-400">Loading motherboards...</span>
        </div>
      )}

      {/* --- 3.8: Error state --- */}
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

      {/* --- 3.8: Empty state --- */}
      {!loading && !error && rows.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-500">
          No motherboards found matching your filters.
        </p>
      )}

      {/* --- 3.6: Table/list rendering --- */}
      {!loading && !error && rows.length > 0 && (
        <>
          {/* Desktop table (≥640px) */}
          <div className="hidden sm:block">
            <table role="table" className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 text-left text-xs text-zinc-400">
                  <th role="columnheader" className="px-3 py-2 font-medium">
                    Manufacturer
                  </th>
                  <th role="columnheader" className="px-3 py-2 font-medium">
                    Model
                  </th>
                  <th role="columnheader" className="px-3 py-2 font-medium">
                    Chipset
                  </th>
                  <th role="columnheader" className="px-3 py-2 font-medium">
                    Socket
                  </th>
                  <th role="columnheader" className="px-3 py-2 font-medium">
                    Form Factor
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isSelected = row.id === selectedBoardId;
                  return (
                    <tr
                      key={row.id}
                      role="row"
                      tabIndex={0}
                      onClick={() => onSelectBoard(row.id)}
                      onKeyDown={(e) => handleRowKeyDown(e, row.id)}
                      className={`cursor-pointer border-b border-zinc-800 transition-colors outline-none ${
                        isSelected
                          ? "border-blue-500 bg-zinc-800 ring-1 ring-blue-500"
                          : "hover:bg-zinc-800/60 focus:bg-zinc-800/60"
                      }`}
                    >
                      <td className="px-3 py-2 text-zinc-100">{row.manufacturer}</td>
                      <td className="px-3 py-2 text-zinc-100">{row.model}</td>
                      <td className="px-3 py-2 text-zinc-400">{row.chipset}</td>
                      <td className="px-3 py-2 text-zinc-400">{row.socket}</td>
                      <td className="px-3 py-2 text-zinc-400">{row.form_factor}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile list (<640px) */}
          <ul role="list" className="space-y-2 sm:hidden">
            {rows.map((row) => {
              const isSelected = row.id === selectedBoardId;
              return (
                <li
                  key={row.id}
                  role="listitem"
                  tabIndex={0}
                  onClick={() => onSelectBoard(row.id)}
                  onKeyDown={(e) => handleRowKeyDown(e, row.id)}
                  className={`cursor-pointer rounded-lg border px-4 py-3 transition-colors outline-none ${
                    isSelected
                      ? "border-blue-500 bg-zinc-800 ring-1 ring-blue-500"
                      : "border-zinc-700 bg-zinc-900 hover:border-zinc-500 hover:bg-zinc-800"
                  } focus:border-blue-500 focus:ring-1 focus:ring-blue-500`}
                >
                  <div className="text-sm font-semibold text-zinc-100">
                    {row.manufacturer} {row.model}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-400">
                    <span>{row.chipset}</span>
                    <span>{row.socket}</span>
                    <span>{row.form_factor}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* --- 3.7: PaginationControls --- */}
      {!loading && !error && totalCount > 0 && (
        <div className="flex items-center justify-between border-t border-zinc-800 pt-3 text-sm text-zinc-400">
          <span>
            {totalCount} motherboard{totalCount !== 1 ? "s" : ""} found
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
