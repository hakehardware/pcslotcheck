"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ComponentSummary } from "@/lib/types";
import type { ViewMode } from "@/lib/view-mode";
import {
  VIEW_MODE_STORAGE_KEYS,
  getViewMode,
  setViewMode,
  getComponentSpecLabels,
  paginateItems,
} from "@/lib/view-mode";
import { getThumbnailIcon } from "@/lib/thumbnail";
import {
  COMPONENT_TYPE_META,
  COMPONENT_SPEC_COLUMNS,
} from "@/lib/component-type-meta";
import ViewModeToggle from "./ViewModeToggle";
import FilterBar from "./FilterBar";
import PaginationControls from "./PaginationControls";
import CompactCard from "./CompactCard";
import FullCard from "./FullCard";

const PAGE_SIZE = 20;
const STORAGE_KEY = VIEW_MODE_STORAGE_KEYS.components;

function getSpecValue(specs: Record<string, unknown>, key: string): string {
  const val = specs[key];
  if (val == null) return "-";
  return String(val);
}

interface ComponentBrowseClientProps {
  components: ComponentSummary[];
}

export default function ComponentBrowseClient({
  components,
}: ComponentBrowseClientProps) {
  const router = useRouter();

  // -- View mode state (initialized from localStorage) --
  const [viewMode, setViewModeState] = useState<ViewMode>("full");
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [manufacturer, setManufacturer] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize viewMode from localStorage on mount
  useEffect(() => {
    setViewModeState(getViewMode(STORAGE_KEY));
  }, []);

  // Persist viewMode to localStorage on change
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    setViewMode(STORAGE_KEY, mode);
  }, []);

  // -- Debounce searchInput -> search (300ms) --
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

  // -- Derive filter options from props --
  const manufacturerOptions = useMemo(
    () => [...new Set(components.map((c) => c.manufacturer))].sort(),
    [components]
  );

  const typeOptions = useMemo(
    () =>
      Object.entries(COMPONENT_TYPE_META).map(([key, meta]) => ({
        key,
        label: meta.label,
      })),
    []
  );

  // -- Client-side filtering --
  const filteredComponents = useMemo(() => {
    let result = components;

    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.manufacturer.toLowerCase().includes(lower) ||
          c.model.toLowerCase().includes(lower) ||
          c.type.toLowerCase().includes(lower)
      );
    }

    if (typeFilter) {
      result = result.filter((c) => c.type === typeFilter);
    }

    if (manufacturer) {
      result = result.filter((c) => c.manufacturer === manufacturer);
    }

    return result;
  }, [components, search, typeFilter, manufacturer]);

  // -- Pagination --
  const { rows, totalPages } = useMemo(
    () => paginateItems(filteredComponents, page, PAGE_SIZE),
    [filteredComponents, page]
  );

  // Reset page when filters change and current page is out of range
  useEffect(() => {
    const maxPage = Math.max(
      1,
      Math.ceil(filteredComponents.length / PAGE_SIZE)
    );
    if (page > maxPage) {
      setPage(1);
    }
  }, [filteredComponents.length, page]);

  // -- Filter change handlers --
  const handleTypeChange = useCallback((value: string) => {
    setTypeFilter(value || null);
    setPage(1);
  }, []);

  const handleManufacturerChange = useCallback((value: string) => {
    setManufacturer(value || null);
    setPage(1);
  }, []);

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

  // -- Type-specific spec columns for table view --
  const visibleSpecColumns = useMemo(() => {
    if (typeFilter && COMPONENT_SPEC_COLUMNS[typeFilter]) {
      return COMPONENT_SPEC_COLUMNS[typeFilter];
    }
    return [] as { key: string; label: string }[];
  }, [typeFilter]);

  const getTypeLabel = (type: string) =>
    COMPONENT_TYPE_META[type]?.label ?? type;

  const TypeIcon = ({ type }: { type: string }) => {
    const meta = COMPONENT_TYPE_META[type];
    if (!meta) return null;
    const Icon = meta.icon;
    return <Icon className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />;
  };

  // -- Render --
  return (
    <div className="space-y-4">
      {/* Controls row: FilterBar + ViewModeToggle */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <FilterBar
            searchValue={searchInput}
            onSearchChange={setSearchInput}
            searchPlaceholder="Search components..."
            filters={[
              {
                label: "Types",
                value: typeFilter,
                options: typeOptions.map((t) => ({
                  value: t.key,
                  label: t.label,
                })),
                onChange: handleTypeChange,
              },
              {
                label: "Manufacturers",
                value: manufacturer,
                options: manufacturerOptions,
                onChange: handleManufacturerChange,
              },
            ]}
          />
        </div>
        <ViewModeToggle value={viewMode} onChange={handleViewModeChange} />
      </div>

      {/* Empty state */}
      {filteredComponents.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-500">
          No components found matching your filters.
        </p>
      )}

      {/* Table view mode */}
      {filteredComponents.length > 0 && viewMode === "table" && (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 text-left text-xs text-zinc-400">
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Manufacturer</th>
                  <th className="px-3 py-2 font-medium">Model</th>
                  {visibleSpecColumns.map((col) => (
                    <th key={col.key} className="px-3 py-2 font-medium">
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
                    className="cursor-pointer border-b border-zinc-800 transition-colors outline-none hover:bg-zinc-800/60 focus:bg-zinc-800/60"
                  >
                    <td className="px-3 py-2 text-zinc-100">
                      <span className="inline-flex items-center gap-1.5">
                        <TypeIcon type={comp.type} />
                        {getTypeLabel(comp.type)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-zinc-100">
                      {comp.manufacturer}
                    </td>
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

          {/* Mobile card list */}
          <ul role="list" className="space-y-2 sm:hidden">
            {rows.map((comp) => {
              const specCols = COMPONENT_SPEC_COLUMNS[comp.type] ?? [];
              return (
                <li
                  key={comp.id}
                  tabIndex={0}
                  role="listitem"
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

      {/* Compact view mode */}
      {filteredComponents.length > 0 && viewMode === "compact" && (
        <div className="space-y-2">
          {rows.map((comp) => (
            <CompactCard
              key={comp.id}
              icon={getThumbnailIcon(comp.type)}
              title={`${comp.manufacturer} ${comp.model}`}
              specs={getComponentSpecLabels(comp)}
              onClick={() => navigateToComponent(comp.id)}
            />
          ))}
        </div>
      )}

      {/* Full view mode */}
      {filteredComponents.length > 0 && viewMode === "full" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((comp) => (
            <FullCard
              key={comp.id}
              icon={getThumbnailIcon(comp.type)}
              title={`${comp.manufacturer} ${comp.model}`}
              specs={getComponentSpecLabels(comp)}
              onClick={() => navigateToComponent(comp.id)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {filteredComponents.length > 0 && (
        <PaginationControls
          page={page}
          totalPages={totalPages}
          totalCount={filteredComponents.length}
          entityLabel="component"
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
