"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { MotherboardSummary } from "@/lib/types";
import type { ViewMode } from "@/lib/view-mode";
import {
  VIEW_MODE_STORAGE_KEYS,
  getViewMode,
  setViewMode,
  getBoardSpecLabels,
  paginateItems,
} from "@/lib/view-mode";
import { getThumbnailIcon } from "@/lib/thumbnail";
import ViewModeToggle from "./ViewModeToggle";
import FilterBar from "./FilterBar";
import PaginationControls from "./PaginationControls";
import CompactCard from "./CompactCard";
import FullCard from "./FullCard";

const PAGE_SIZE = 20;
const STORAGE_KEY = VIEW_MODE_STORAGE_KEYS.boards;

interface BoardBrowseClientProps {
  boards: MotherboardSummary[];
}

export default function BoardBrowseClient({ boards }: BoardBrowseClientProps) {
  const router = useRouter();

  // -- View mode state (initialized from localStorage) --
  const [viewMode, setViewModeState] = useState<ViewMode>("full");
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [manufacturer, setManufacturer] = useState<string | null>(null);
  const [chipset, setChipset] = useState<string | null>(null);

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
    () => [...new Set(boards.map((b) => b.manufacturer))].sort(),
    [boards]
  );

  const chipsetOptions = useMemo(
    () => [...new Set(boards.map((b) => b.chipset))].sort(),
    [boards]
  );

  // -- Client-side filtering --
  const filteredBoards = useMemo(() => {
    let result = boards;

    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(
        (b) =>
          b.manufacturer.toLowerCase().includes(lower) ||
          b.model.toLowerCase().includes(lower)
      );
    }

    if (manufacturer) {
      result = result.filter((b) => b.manufacturer === manufacturer);
    }

    if (chipset) {
      result = result.filter((b) => b.chipset === chipset);
    }

    return result;
  }, [boards, search, manufacturer, chipset]);

  // -- Pagination --
  const { rows, totalPages } = useMemo(
    () => paginateItems(filteredBoards, page, PAGE_SIZE),
    [filteredBoards, page]
  );

  // Reset page when filters change and current page is out of range
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredBoards.length / PAGE_SIZE));
    if (page > maxPage) {
      setPage(1);
    }
  }, [filteredBoards.length, page]);

  // -- Filter change handlers --
  const handleManufacturerChange = useCallback((value: string) => {
    setManufacturer(value || null);
    setPage(1);
  }, []);

  const handleChipsetChange = useCallback((value: string) => {
    setChipset(value || null);
    setPage(1);
  }, []);

  const navigateToBoard = useCallback(
    (id: string) => {
      router.push(`/boards/${id}`);
    },
    [router]
  );

  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent, id: string) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        navigateToBoard(id);
      }
    },
    [navigateToBoard]
  );

  const BoardIcon = getThumbnailIcon("motherboard");

  // -- Render --
  return (
    <div className="space-y-4">
      {/* Controls row: FilterBar + ViewModeToggle */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <FilterBar
            searchValue={searchInput}
            onSearchChange={setSearchInput}
            searchPlaceholder="Search motherboards..."
            filters={[
              {
                label: "Manufacturers",
                value: manufacturer,
                options: manufacturerOptions,
                onChange: handleManufacturerChange,
              },
              {
                label: "Chipsets",
                value: chipset,
                options: chipsetOptions,
                onChange: handleChipsetChange,
              },
            ]}
          />
        </div>
        <ViewModeToggle value={viewMode} onChange={handleViewModeChange} />
      </div>

      {/* Empty state */}
      {filteredBoards.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-500">
          No motherboards found matching your filters.
        </p>
      )}

      {/* Table view mode */}
      {filteredBoards.length > 0 && viewMode === "table" && (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 text-left text-xs text-zinc-400">
                  <th className="px-3 py-2 font-medium">Manufacturer</th>
                  <th className="px-3 py-2 font-medium">Model</th>
                  <th className="px-3 py-2 font-medium">Chipset</th>
                  <th className="px-3 py-2 font-medium">Socket</th>
                  <th className="px-3 py-2 font-medium">Form Factor</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((board) => (
                  <tr
                    key={board.id}
                    tabIndex={0}
                    role="row"
                    onClick={() => navigateToBoard(board.id)}
                    onKeyDown={(e) => handleRowKeyDown(e, board.id)}
                    className="cursor-pointer border-b border-zinc-800 transition-colors outline-none hover:bg-zinc-800/60 focus:bg-zinc-800/60"
                  >
                    <td className="px-3 py-2 text-zinc-100">{board.manufacturer}</td>
                    <td className="px-3 py-2 text-zinc-100">{board.model}</td>
                    <td className="px-3 py-2 text-zinc-400">{board.chipset}</td>
                    <td className="px-3 py-2 text-zinc-400">{board.socket}</td>
                    <td className="px-3 py-2 text-zinc-400">{board.form_factor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <ul role="list" className="space-y-2 sm:hidden">
            {rows.map((board) => (
              <li
                key={board.id}
                tabIndex={0}
                role="listitem"
                onClick={() => navigateToBoard(board.id)}
                onKeyDown={(e) => handleRowKeyDown(e, board.id)}
                className="cursor-pointer rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 transition-colors outline-none hover:border-zinc-500 hover:bg-zinc-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <div className="text-sm font-semibold text-zinc-100">
                  {board.manufacturer} {board.model}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-400">
                  <span>{board.chipset}</span>
                  <span>{board.socket}</span>
                  <span>{board.form_factor}</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Compact view mode */}
      {filteredBoards.length > 0 && viewMode === "compact" && (
        <div className="space-y-2">
          {rows.map((board) => (
            <CompactCard
              key={board.id}
              icon={BoardIcon}
              title={`${board.manufacturer} ${board.model}`}
              specs={getBoardSpecLabels(board)}
              onClick={() => navigateToBoard(board.id)}
            />
          ))}
        </div>
      )}

      {/* Full view mode */}
      {filteredBoards.length > 0 && viewMode === "full" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((board) => (
            <FullCard
              key={board.id}
              icon={BoardIcon}
              title={`${board.manufacturer} ${board.model}`}
              specs={getBoardSpecLabels(board)}
              onClick={() => navigateToBoard(board.id)}
              action={
                <Link
                  href={`/check?board=${board.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Select
                </Link>
              }
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {filteredBoards.length > 0 && (
        <PaginationControls
          page={page}
          totalPages={totalPages}
          totalCount={filteredBoards.length}
          entityLabel="motherboard"
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
