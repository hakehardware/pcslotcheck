"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import MotherboardTable from "./MotherboardTable";
import SlotList from "./SlotList";
import ComponentPicker from "./ComponentPicker";
import ValidationPanel from "./ValidationPanel";
import ShareButton from "./ShareButton";
import { resolveSharingRules } from "../lib/ui-helpers";
import { validateAssignments } from "../lib/validation-engine";
import { encode, decode } from "../lib/sharing";
import { fetchMotherboardFromSupabase, fetchComponentFromSupabase } from "../lib/supabase-queries";
import type {
  DataManifest,
  Motherboard,
  Component,
  ValidationResult,
} from "../lib/types";
import type { SlotCategory } from "../lib/ui-types";

interface SlotCheckerProps {
  manifest: DataManifest;
}

/**
 * Determines which SlotCategory a given slot ID belongs to on a motherboard.
 */
function getSlotCategory(
  motherboard: Motherboard,
  slotId: string
): SlotCategory | null {
  if (motherboard.memory.slots.some((s) => s.id === slotId)) return "memory";
  if (motherboard.m2_slots.some((s) => s.id === slotId)) return "m2";
  if (motherboard.pcie_slots.some((s) => s.id === slotId)) return "pcie";
  if (motherboard.sata_ports.some((s) => s.id === slotId)) return "sata";
  return null;
}

export default function SlotChecker({ manifest }: SlotCheckerProps) {
  // Core state
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [motherboard, setMotherboard] = useState<Motherboard | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [loadedComponents, setLoadedComponents] = useState<
    Record<string, Component>
  >({});
  const [validationResults, setValidationResults] = useState<
    ValidationResult[]
  >([]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);

  // Picker state
  const [pickerSlotId, setPickerSlotId] = useState<string | null>(null);
  const [pickerCategory, setPickerCategory] = useState<SlotCategory | null>(
    null
  );

  // Data caches (persist across renders, survive board switches)
  const boardCache = useRef<Map<string, Motherboard>>(new Map());
  const componentCache = useRef<Map<string, Component>>(new Map());

  // URL state management — read ?build= param on mount
  const searchParams = useSearchParams();
  const hasRestoredUrl = useRef(false);

  // Restore state from URL on mount
  useEffect(() => {
    if (hasRestoredUrl.current) return;
    hasRestoredUrl.current = true;

    const buildParam = searchParams.get("build");
    if (!buildParam) return;

    const decoded = decode(buildParam);
    if (!decoded) return;

    // Validate that the motherboardId exists in the manifest
    const boardExists = manifest.motherboards.some(
      (b) => b.id === decoded.motherboardId
    );
    if (!boardExists) return;

    setSelectedBoardId(decoded.motherboardId);
    setAssignments(decoded.assignments);

    // Fetch the board data
    const fetchRestoredBoard = async (boardId: string) => {
      setBoardLoading(true);
      setBoardError(null);
      try {
        const board = await fetchMotherboardFromSupabase(boardId);
        if (!board) throw new Error("Motherboard not found");
        boardCache.current.set(boardId, board);
        setMotherboard(board);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load motherboard data";
        setBoardError(message);
        setMotherboard(null);
      } finally {
        setBoardLoading(false);
      }
    };

    fetchRestoredBoard(decoded.motherboardId);
  }, [searchParams, manifest.motherboards]);

  // Sync state to URL on changes
  useEffect(() => {
    if (!selectedBoardId) return;
    // Skip URL sync until initial restoration is complete
    if (!hasRestoredUrl.current) return;

    const encoded = encode(selectedBoardId, assignments);
    const url = new URL(window.location.href);
    url.searchParams.set("build", encoded);
    window.history.replaceState({}, "", url.toString());
  }, [selectedBoardId, assignments]);

  // Derived sharing state — recomputed on assignment or motherboard changes
  const { disabledSlots, bandwidthWarnings } = useMemo(() => {
    if (!motherboard) {
      return {
        disabledSlots: new Set<string>(),
        bandwidthWarnings: new Map<string, string>(),
      };
    }
    return resolveSharingRules(motherboard, assignments);
  }, [motherboard, assignments]);

  // Run validation on every assignment change
  useEffect(() => {
    if (!motherboard) {
      setValidationResults([]);
      return;
    }
    const results = validateAssignments(motherboard, assignments, loadedComponents);
    setValidationResults(results);
  }, [motherboard, assignments, loadedComponents]);

  // Fetch motherboard JSON
  const fetchBoard = useCallback(
    async (boardId: string) => {
      // Check cache first
      const cached = boardCache.current.get(boardId);
      if (cached) {
        setMotherboard(cached);
        setBoardLoading(false);
        return;
      }

      setBoardLoading(true);
      setBoardError(null);

      try {
        const board = await fetchMotherboardFromSupabase(boardId);
        if (!board) throw new Error("Motherboard not found");
        boardCache.current.set(boardId, board);
        setMotherboard(board);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load motherboard data";
        setBoardError(message);
        setMotherboard(null);
      } finally {
        setBoardLoading(false);
      }
    },
    []
  );

  // Handle board selection
  const handleSelectBoard = useCallback(
    (boardId: string) => {
      if (boardId === selectedBoardId) return;
      setSelectedBoardId(boardId);
      // Clear assignments on board switch (Property 8)
      setAssignments({});
      setValidationResults([]);
      setPickerSlotId(null);
      setPickerCategory(null);
      fetchBoard(boardId);
    },
    [selectedBoardId, fetchBoard]
  );

  // Retry loading the current board
  const handleRetry = useCallback(() => {
    if (selectedBoardId) {
      // Clear cache entry so we re-fetch
      boardCache.current.delete(selectedBoardId);
      fetchBoard(selectedBoardId);
    }
  }, [selectedBoardId, fetchBoard]);

  // Fetch a component JSON on demand
  const fetchComponent = useCallback(async (componentId: string) => {
    const cached = componentCache.current.get(componentId);
    if (cached) {
      setLoadedComponents((prev) => ({ ...prev, [componentId]: cached }));
      return;
    }

    try {
      const manifestEntry = manifest.components.find((c) => c.id === componentId);
      const compType = manifestEntry?.type ?? "";
      const comp = await fetchComponentFromSupabase(componentId, compType);
      if (!comp) return; // silently skip — validation will run without it
      componentCache.current.set(componentId, comp);
      setLoadedComponents((prev) => ({ ...prev, [componentId]: comp }));
    } catch {
      // Component fetch failure is non-fatal
    }
  }, [manifest.components]);

  // Open the component picker for a slot
  const handleAssign = useCallback(
    (slotId: string) => {
      if (!motherboard) return;
      const category = getSlotCategory(motherboard, slotId);
      if (!category) return;
      setPickerSlotId(slotId);
      setPickerCategory(category);
    },
    [motherboard]
  );

  // Handle component selection from picker
  const handleComponentSelect = useCallback(
    (componentId: string) => {
      if (!pickerSlotId) return;
      setAssignments((prev) => ({ ...prev, [pickerSlotId]: componentId }));
      // Fetch full component data if not already loaded
      if (!loadedComponents[componentId] && !componentCache.current.has(componentId)) {
        fetchComponent(componentId);
      } else if (componentCache.current.has(componentId) && !loadedComponents[componentId]) {
        setLoadedComponents((prev) => ({
          ...prev,
          [componentId]: componentCache.current.get(componentId)!,
        }));
      }
      setPickerSlotId(null);
      setPickerCategory(null);
    },
    [pickerSlotId, loadedComponents, fetchComponent]
  );

  // Remove an assignment
  const handleRemove = useCallback((slotId: string) => {
    setAssignments((prev) => {
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
  }, []);

  // Close the picker
  const handleClosePicker = useCallback(() => {
    setPickerSlotId(null);
    setPickerCategory(null);
  }, []);

  return (
    <div className="space-y-6">
      {/* Board Selector */}
      <section aria-label="Motherboard selection">
        <h2 className="mb-3 text-lg font-semibold text-zinc-100">
          Select Motherboard
        </h2>
        <MotherboardTable
          selectedBoardId={selectedBoardId}
          onSelectBoard={handleSelectBoard}
        />
      </section>

      {/* Loading state */}
      {boardLoading && (
        <div className="flex items-center justify-center py-12" role="status">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200" />
          <span className="ml-3 text-sm text-zinc-400">
            Loading motherboard data…
          </span>
        </div>
      )}

      {/* Error state */}
      {boardError && !boardLoading && (
        <div
          className="rounded-lg border border-red-700/50 bg-red-900/20 px-4 py-3 text-sm text-red-300"
          role="alert"
        >
          <p>{boardError}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="mt-2 rounded bg-red-800 px-3 py-1 text-xs text-red-100 hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* Slot list + validation (only when board is loaded) */}
      {motherboard && !boardLoading && !boardError && (
        <>
          <SlotList
            motherboard={motherboard}
            assignments={assignments}
            loadedComponents={loadedComponents}
            disabledSlots={disabledSlots}
            bandwidthWarnings={bandwidthWarnings}
            onAssign={handleAssign}
            onRemove={handleRemove}
          />

          {/* Component Picker overlay */}
          {pickerSlotId && pickerCategory && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="w-full max-w-md">
                <ComponentPicker
                  slotCategory={pickerCategory}
                  manifestComponents={manifest.components}
                  onSelect={handleComponentSelect}
                  onClose={handleClosePicker}
                />
              </div>
            </div>
          )}

          {/* Validation Panel */}
          {validationResults.length > 0 && (
            <section aria-label="Validation results">
              <h2 className="mb-3 text-lg font-semibold text-zinc-100">
                Validation
              </h2>
              <ValidationPanel results={validationResults} />
            </section>
          )}

          {/* Share Button */}
          <div className="flex justify-end">
            <ShareButton disabled={!selectedBoardId} />
          </div>
        </>
      )}

      {/* Empty state — no board selected */}
      {!selectedBoardId && !boardLoading && (
        <p className="py-8 text-center text-sm text-zinc-500">
          Select a motherboard above to begin checking slot compatibility.
        </p>
      )}
    </div>
  );
}
