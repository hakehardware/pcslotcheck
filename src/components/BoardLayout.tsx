"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { IoTrashOutline, IoRefreshOutline } from "react-icons/io5";
import CaseCanvas from "./CaseCanvas";
import SearchModal from "./SearchModal";
import type { SearchModalMode } from "./SearchModal";
import {
  fetchMotherboardFromSupabase,
  fetchComponentFromSupabase,
} from "@/lib/supabase-queries";
import {
  computeAllConflicts,
  sharingRuleToVisualState,
} from "@/lib/physical-conflict-engine";
import type { VisualState, ConflictResult } from "@/lib/physical-conflict-engine";
import { getBoardDimensions } from "@/lib/board-dimensions";
import { resolveSharingRules } from "@/lib/ui-helpers";
import type {
  DataManifest,
  Motherboard,
  Component,
  SlotPosition,
  MotherboardSummary,
  ComponentSummary,
} from "@/lib/types";

type ModalState = null | { mode: SearchModalMode };

interface BoardLayoutProps {
  manifest: DataManifest;
  boardId?: string | null;
}

export default function BoardLayout({ manifest, boardId }: BoardLayoutProps) {
  const [motherboard, setMotherboard] = useState<Motherboard | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [loadedComponents, setLoadedComponents] = useState<
    Record<string, Component>
  >({});
  const [conflicts, setConflicts] = useState<ConflictResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(
    boardId ?? null
  );
  const [sataDriveAssignments, setSataDriveAssignments] = useState<Record<string, string>>({});
  const [sataDriveComponents, setSataDriveComponents] = useState<Record<string, Component>>({});
  const [modalState, setModalState] = useState<ModalState>(null);

  // Fetch motherboard data when selectedBoardId changes
  useEffect(() => {
    // Close modal on board change
    setModalState(null);

    if (!selectedBoardId) {
      setMotherboard(null);
      setAssignments({});
      setLoadedComponents({});
      setConflicts([]);
      setSataDriveAssignments({});
      setSataDriveComponents({});
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function load() {
      const mb = await fetchMotherboardFromSupabase(selectedBoardId!);
      if (!cancelled) {
        setMotherboard(mb);
        setAssignments({});
        setLoadedComponents({});
        setConflicts([]);
        setSataDriveAssignments({});
        setSataDriveComponents({});
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedBoardId]);

  // Recompute conflicts whenever assignments or loadedComponents change
  useEffect(() => {
    if (!motherboard?.slot_positions) {
      setConflicts([]);
      return;
    }

    const dims = getBoardDimensions(motherboard);
    if (!dims) {
      setConflicts([]);
      return;
    }

    const results = computeAllConflicts(
      motherboard.slot_positions,
      assignments,
      loadedComponents,
      dims.widthMm,
      dims.heightMm
    );
    setConflicts(results);
  }, [assignments, loadedComponents, motherboard]);

  // Compute visual states from conflicts + sharing rules
  const visualStates: Record<string, VisualState> = {};
  const conflictMessages: Record<string, string> = {};

  for (const c of conflicts) {
    visualStates[c.slotId] = c.visualState;
    if (c.message) {
      conflictMessages[c.slotId] = c.message;
    }
  }

  // Merge sharing rule results into visual states
  let disabledSlots = new Set<string>();
  if (motherboard) {
    const sharingResult = resolveSharingRules(motherboard, assignments);
    disabledSlots = sharingResult.disabledSlots;
    const { bandwidthWarnings } = sharingResult;

    for (const slotId of disabledSlots) {
      const sharingState = sharingRuleToVisualState("disables");
      if (visualStates[slotId] !== "blocked") {
        visualStates[slotId] = sharingState;
        conflictMessages[slotId] = "Disabled by sharing rule";
      }
    }

    for (const [slotId, effect] of bandwidthWarnings) {
      const sharingState = sharingRuleToVisualState("bandwidth_split");
      if (
        visualStates[slotId] !== "blocked" &&
        visualStates[slotId] !== "covered"
      ) {
        visualStates[slotId] = sharingState;
        conflictMessages[slotId] = effect;
      }
    }
  }

  // Compute SATA drive bay visual states from sharing rules
  const sataDriveVisualStates: Record<string, VisualState> = {};
  const sataDriveConflictMessages: Record<string, string> = {};
  if (motherboard) {
    for (const port of motherboard.sata_ports) {
      if (disabledSlots.has(port.id)) {
        sataDriveVisualStates[port.id] = "blocked";
        sataDriveConflictMessages[port.id] = "Disabled by sharing rule";
      } else if (sataDriveAssignments[port.id]) {
        sataDriveVisualStates[port.id] = "populated";
      }
    }
  }

  // --- Click handlers ---

  const handleSlotClick = useCallback(
    (slotId: string, slotType: SlotPosition["slot_type"]) => {
      if (!motherboard) return;
      setModalState({
        mode: { kind: "component", slotId, slotType, motherboard },
      });
    },
    [motherboard]
  );

  const handleBayClick = useCallback(
    (portId: string) => {
      if (!motherboard) return;
      setModalState({
        mode: {
          kind: "component",
          slotId: portId,
          slotType: "sata_group",
          motherboard,
        },
      });
    },
    [motherboard]
  );

  const handleEmptyCaseClick = useCallback(() => {
    setModalState({ mode: { kind: "board" } });
  }, []);

  const handleModalClose = useCallback(() => {
    setModalState(null);
  }, []);

  const handleModalSelect = useCallback(
    (item: MotherboardSummary | ComponentSummary) => {
      if (modalState?.mode.kind === "board") {
        // Board selection
        const mb = item as MotherboardSummary;
        setSelectedBoardId(mb.id);
        setModalState(null);
        return;
      }

      if (modalState?.mode.kind === "component") {
        const comp = item as ComponentSummary;
        const { slotId, slotType } = modalState.mode;

        if (slotType === "sata_group") {
          // SATA drive assignment
          setSataDriveAssignments((prev) => ({ ...prev, [slotId]: comp.id }));
          if (!sataDriveComponents[comp.id]) {
            fetchComponentFromSupabase(comp.id, comp.type).then((full) => {
              if (full) {
                setSataDriveComponents((prev) => ({
                  ...prev,
                  [comp.id]: full,
                }));
              }
            });
          }
        } else {
          // Regular slot assignment
          setAssignments((prev) => ({ ...prev, [slotId]: comp.id }));
          if (!loadedComponents[comp.id]) {
            fetchComponentFromSupabase(comp.id, comp.type).then((full) => {
              if (full) {
                setLoadedComponents((prev) => ({
                  ...prev,
                  [comp.id]: full,
                }));
              }
            });
          }
        }

        setModalState(null);
      }
    },
    [modalState, loadedComponents, sataDriveComponents]
  );

  // Used by ComponentOverlay remove button
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleRemoveComponent = useCallback((slotId: string) => {
    setAssignments((prev) => {
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
  }, []);

  // --- Reset handlers ---

  const handleClearComponents = useCallback(() => {
    setAssignments({});
    setSataDriveAssignments({});
    setLoadedComponents({});
    setSataDriveComponents({});
  }, []);

  const handleResetBuild = useCallback(() => {
    setSelectedBoardId(null);
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" role="status">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200" />
        <span className="ml-3 text-sm text-zinc-400">
          Loading motherboard...
        </span>
      </div>
    );
  }

  // No board selected: show empty case with clickable prompt
  if (!selectedBoardId || !motherboard) {
    return (
      <div>
        <h1 className="mb-6 text-3xl font-bold tracking-tight text-zinc-50">
          Interactive Board Layout
        </h1>
        <p className="mb-4 text-sm text-zinc-400">
          Select a motherboard to view its physical layout.
        </p>
        <div
          role="button"
          tabIndex={0}
          data-testid="empty-case-prompt"
          onClick={handleEmptyCaseClick}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleEmptyCaseClick();
          }}
          className="flex h-64 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-zinc-600 bg-zinc-900/50 transition-colors hover:border-zinc-400 hover:bg-zinc-800/50"
        >
          <span className="text-lg text-zinc-400">
            Click to select a motherboard
          </span>
        </div>
        {modalState && (
          <SearchModal
            mode={modalState.mode}
            manifest={manifest}
            onSelect={handleModalSelect}
            onClose={handleModalClose}
          />
        )}
      </div>
    );
  }

  // Board has no slot_positions data
  if (!motherboard.slot_positions || motherboard.slot_positions.length === 0) {
    return (
      <div className="py-12 text-center">
        <h1 className="mb-4 text-2xl font-bold text-zinc-50">
          {motherboard.manufacturer} {motherboard.model}
        </h1>
        <p className="text-zinc-400">
          Layout data not yet available for this board.
        </p>
        <Link
          href={`/check?board=${motherboard.id}`}
          className="mt-4 inline-block text-sm text-blue-400 underline hover:text-blue-300"
        >
          Use Slot Checker instead
        </Link>
      </div>
    );
  }

  // Board dimensions not available
  const dims = getBoardDimensions(motherboard);
  if (!dims) {
    return (
      <div className="py-12 text-center">
        <h1 className="mb-4 text-2xl font-bold text-zinc-50">
          {motherboard.manufacturer} {motherboard.model}
        </h1>
        <p className="text-zinc-400">
          Board dimensions not available for this form factor. Layout data
          requires explicit dimensions.
        </p>
        <Link
          href={`/check?board=${motherboard.id}`}
          className="mt-4 inline-block text-sm text-blue-400 underline hover:text-blue-300"
        >
          Use Slot Checker instead
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-50">
          {motherboard.manufacturer} {motherboard.model}
        </h1>
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid="clear-components-btn"
            onClick={handleClearComponents}
            className="flex items-center gap-1.5 rounded border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:border-zinc-400 hover:text-zinc-100"
          >
            <IoTrashOutline className="h-4 w-4" />
            Clear Components
          </button>
          <button
            type="button"
            data-testid="reset-build-btn"
            onClick={handleResetBuild}
            className="flex items-center gap-1.5 rounded border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:border-zinc-400 hover:text-zinc-100"
          >
            <IoRefreshOutline className="h-4 w-4" />
            Reset Build
          </button>
          <Link
            href={`/check?board=${motherboard.id}`}
            className="text-sm text-zinc-400 transition-colors hover:text-zinc-50"
          >
            Switch to Slot Checker
          </Link>
        </div>
      </div>

      <div className="flex justify-center">
        <div className="hidden md:block">
          <CaseCanvas
            mode="display"
            motherboard={motherboard}
            boardWidthMm={dims.widthMm}
            boardHeightMm={dims.heightMm}
            slotPositions={motherboard.slot_positions}
            assignments={assignments}
            loadedComponents={loadedComponents}
            visualStates={visualStates}
            conflictMessages={conflictMessages}
            sataDriveAssignments={sataDriveAssignments}
            sataDriveComponents={sataDriveComponents}
            sataDriveVisualStates={sataDriveVisualStates}
            sataDriveConflictMessages={sataDriveConflictMessages}
            onSlotClick={handleSlotClick}
            onBayClick={handleBayClick}
          />
        </div>
        <div className="block md:hidden flex-1 py-8 text-center">
          <p className="text-sm text-zinc-400">
            The interactive board layout is available on desktop.
          </p>
          <Link
            href={`/check?board=${motherboard.id}`}
            className="mt-2 inline-block text-sm text-blue-400 underline hover:text-blue-300"
          >
            Use Slot Checker on mobile
          </Link>
        </div>
      </div>

      {modalState && (
        <SearchModal
          mode={modalState.mode}
          manifest={manifest}
          onSelect={handleModalSelect}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}
