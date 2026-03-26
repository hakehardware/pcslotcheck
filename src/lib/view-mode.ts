import { COMPONENT_SPEC_COLUMNS } from "@/lib/component-type-meta";
import type { ComponentSummary, MotherboardSummary } from "@/lib/types";

// -- View Mode types and constants --

export type ViewMode = "table" | "compact" | "full";

const VALID_VIEW_MODES: ViewMode[] = ["table", "compact", "full"];

export const VIEW_MODE_STORAGE_KEYS = {
  boards: "boards-view-mode",
  components: "components-view-mode",
} as const;

export const DEFAULT_VIEW_MODE: ViewMode = "full";

/**
 * Reads a persisted ViewMode from localStorage.
 * Returns DEFAULT_VIEW_MODE if the key is missing, the value is invalid,
 * or localStorage is unavailable (e.g. private browsing).
 */
export function getViewMode(key: string): ViewMode {
  try {
    const stored = localStorage.getItem(key);
    if (stored && VALID_VIEW_MODES.includes(stored as ViewMode)) {
      return stored as ViewMode;
    }
  } catch {
    // localStorage unavailable — fall through
  }
  return DEFAULT_VIEW_MODE;
}

/**
 * Persists a ViewMode to localStorage. Silently fails if localStorage
 * is unavailable.
 */
export function setViewMode(key: string, mode: ViewMode): void {
  try {
    localStorage.setItem(key, mode);
  } catch {
    // localStorage unavailable — ignore
  }
}

// -- Spec label helpers --

/**
 * Maps a ComponentSummary into display-ready "Label: value" strings
 * using the COMPONENT_SPEC_COLUMNS definition for its type.
 * Filters out columns whose value is null or undefined.
 */
export function getComponentSpecLabels(comp: ComponentSummary): string[] {
  const columns = COMPONENT_SPEC_COLUMNS[comp.type] ?? [];
  return columns
    .map((col) => {
      const val = comp.specs[col.key];
      return val != null ? `${col.label}: ${val}` : null;
    })
    .filter((v): v is string => v !== null);
}

/**
 * Returns the three key spec values for a motherboard:
 * chipset, socket, and form_factor.
 */
export function getBoardSpecLabels(board: MotherboardSummary): string[] {
  return [board.chipset, board.socket, board.form_factor];
}

// -- Pagination helper --

/**
 * Slices a list of items for the given 1-based page number and page size.
 * Returns the rows for that page and the total number of pages.
 */
export function paginateItems<T>(
  items: T[],
  page: number,
  pageSize: number
): { rows: T[]; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const clampedPage = Math.max(1, Math.min(page, totalPages));
  const start = (clampedPage - 1) * pageSize;
  const rows = items.slice(start, start + pageSize);
  return { rows, totalPages };
}
