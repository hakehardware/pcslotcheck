"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { fetchMotherboardPage } from "../lib/supabase-queries";
import type { MotherboardSummary } from "../lib/types";

interface SearchBarProps {
  placeholder?: string;
}

export default function SearchBar({
  placeholder = "Search motherboards...",
}: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MotherboardSummary[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced fetch
  const fetchResults = useCallback((searchQuery: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (searchQuery.length < 1) {
      setResults([]);
      setIsOpen(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(() => {
      fetchMotherboardPage({ search: searchQuery, page: 1, pageSize: 5 })
        .then((result) => {
          setResults(result.rows);
          setIsOpen(true);
          setActiveIndex(-1);
        })
        .catch((err) => {
          console.warn("SearchBar: failed to fetch results", err);
          setResults([]);
          setIsOpen(false);
        })
        .finally(() => {
          setLoading(false);
        });
    }, 300);
  }, []);

  // Trigger fetch when query changes
  useEffect(() => {
    fetchResults(query);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchResults]);

  // Click outside handler
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectBoard = useCallback(
    (id: string) => {
      setIsOpen(false);
      setActiveIndex(-1);
      router.push(`/check?board=${id}`);
    },
    [router]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen && e.key !== "ArrowDown") return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (!isOpen && results.length > 0) {
            setIsOpen(true);
            setActiveIndex(0);
          } else {
            setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < results.length) {
            selectBoard(results[activeIndex].id);
          }
          break;
        case "Escape":
          e.preventDefault();
          setIsOpen(false);
          setActiveIndex(-1);
          inputRef.current?.focus();
          break;
      }
    },
    [isOpen, results, activeIndex, selectBoard]
  );

  const activeDescendant =
    activeIndex >= 0 && activeIndex < results.length
      ? `search-option-${results[activeIndex].id}`
      : undefined;

  const showNoResults =
    query.length >= 1 && !loading && results.length === 0 && isOpen;

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        role="combobox"
        aria-label="Search motherboards"
        aria-expanded={isOpen}
        aria-controls="search-results-listbox"
        aria-activedescendant={activeDescendant}
        aria-autocomplete="list"
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />

      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200" />
        </div>
      )}

      {isOpen && results.length > 0 && (
        <ul
          id="search-results-listbox"
          role="listbox"
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-lg"
        >
          {results.map((board, index) => (
            <li
              key={board.id}
              id={`search-option-${board.id}`}
              role="option"
              aria-selected={index === activeIndex}
              onClick={() => selectBoard(board.id)}
              onMouseEnter={() => setActiveIndex(index)}
              className={`cursor-pointer px-4 py-3 text-sm transition-colors ${
                index === activeIndex
                  ? "bg-zinc-800 text-zinc-50"
                  : "text-zinc-300 hover:bg-zinc-800/60"
              }`}
            >
              <div className="font-medium text-zinc-100">
                {board.manufacturer} {board.model}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-zinc-400">
                <span>{board.chipset}</span>
                <span>{board.socket}</span>
                <span>{board.form_factor}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showNoResults && (
        <div
          id="search-results-listbox"
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-500 shadow-lg"
        >
          No motherboards found
        </div>
      )}
    </div>
  );
}
