"use client";

import { useState } from "react";
import { FiSearch } from "react-icons/fi";

type FilterOption = string | { value: string; label: string };

interface FilterConfig {
  label: string;
  value: string | null;
  options: FilterOption[];
  onChange: (value: string) => void;
}

interface FilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  filters: FilterConfig[];
}

export default function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filters,
}: FilterBarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="space-y-3">
      {/* Search input */}
      <div className="relative">
        <FiSearch
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
          aria-hidden="true"
        />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Mobile filter toggle (below sm breakpoint) */}
      {filters.length > 0 && (
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
      )}

      {/* Filter dropdowns: desktop always visible, mobile collapsible */}
      {filters.length > 0 && (
        <div
          className={`flex-col gap-3 sm:flex sm:flex-row ${
            filtersOpen ? "flex" : "hidden sm:flex"
          }`}
        >
          {filters.map((filter) => (
            <select
              key={filter.label}
              value={filter.value ?? ""}
              onChange={(e) => filter.onChange(e.target.value)}
              aria-label={`Filter by ${filter.label.toLowerCase()}`}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:w-auto"
            >
              <option value="">All {filter.label}</option>
              {filter.options.map((opt) => {
                const val = typeof opt === "string" ? opt : opt.value;
                const lbl = typeof opt === "string" ? opt : opt.label;
                return (
                  <option key={val} value={val}>
                    {lbl}
                  </option>
                );
              })}
            </select>
          ))}
        </div>
      )}
    </div>
  );
}
