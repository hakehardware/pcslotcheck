"use client";

import { useState, useEffect, useCallback } from "react";
import { DragDropProvider, DragOverlay } from "@dnd-kit/react";
import Link from "next/link";
import BoardSelector from "./BoardSelector";
import BoardView from "./BoardView";
import LayoutSidebar from "./LayoutSidebar";
import {
  fetchMotherboardFromSupabase,
  fetchComponentFromSupabase,
} from "@/lib/supabase-queries";
import {
  computeAllConflicts,
  getCompatibleSlotTypes,
  sharingRuleToVisualState,
} from "@/lib/physical-conflict-engine";
import type { VisualState, ConflictResult } from "@/lib/physical-conflict-engine";
import { getBoardDimensions } from "@/lib/board-dimensions";
import { resolveSharingRules } from "@/lib/ui-helpers";
import type { DataManifest, Motherboard, Component, ComponentSummary } from "@/lib/types";

const DRAG_OVERLAY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  gpu:  { bg: "bg-blue-500/20",    border: "border-blue-400/60",    text: "text-blue-300" },
  nvme: { bg: "bg-purple-500/20",  border: "border-purple-400/60",  text: "text-purple-300" },
  ram:  { bg: "bg-emerald-500/20", border: "border-emerald-400/60", text: "text-emerald-300" },
  cpu:  { bg: "bg-cyan-500/20",    border: "border-cyan-400/60",    text: "text-cyan-300" },
};

const TYPE_LABELS: Record<string, string> = {
  gpu: "GPU",
  nvme: "NVMe",
  ram: "RAM",
  cpu: "CPU",
};

function findComponentInManifest(
  manifest: DataManifest,
  id: string | number
): ComponentSummary | undefined {
  return manifest.components.find((c) => c.id === String(id));
}

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

  // Fetch motherboard data when selectedBoardId changes
  useEffect(() => {
    if (!selectedBoardId) {
      setMotherboard(null);
      setAssignments({});
      setLoadedComponents({});
      setConflicts([]);
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
  if (motherboard) {
    const { disabledSlots, bandwidthWarnings } = resolveSharingRules(
      motherboard,
      assignments
    );

    for (const slotId of disabledSlots) {
      const sharingState = sharingRuleToVisualState("disables");
      // Sharing-rule "blocked" overrides physical states except existing "blocked"
      if (visualStates[slotId] !== "blocked") {
        visualStates[slotId] = sharingState;
        conflictMessages[slotId] = "Disabled by sharing rule";
      }
    }

    for (const [slotId, effect] of bandwidthWarnings) {
      const sharingState = sharingRuleToVisualState("bandwidth_split");
      // Only apply if not already in a more severe state
      if (
        visualStates[slotId] !== "blocked" &&
        visualStates[slotId] !== "covered"
      ) {
        visualStates[slotId] = sharingState;
        conflictMessages[slotId] = effect;
      }
    }
  }

  const handleSelectBoard = useCallback((id: string) => {
    setSelectedBoardId(id);
  }, []);

  const handleKeyboardSelect = useCallback(
    async (componentId: string) => {
      // Keyboard select is handled by LayoutSidebar (Task 8)
      // This callback will be wired up when LayoutSidebar is implemented
      void componentId;
    },
    []
  );

  // Used by ComponentOverlay remove button (wired in Task 7)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleRemoveComponent = useCallback((slotId: string) => {
    setAssignments((prev) => {
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
  }, []);

  // onDragEnd handler for DragDropProvider
  const handleDragEnd = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (event: any) => {
      if (event.canceled) return;

      const source = event.operation?.source ?? event.source;
      const target = event.operation?.target ?? event.target;
      if (!source || !target) return;

      const componentId = String(source.id);
      const componentType = source.data?.type as string | undefined;
      const slotId = String(target.id);

      if (!componentType) return;

      // Validate compatibility: check if the component type can go in this slot
      const compatibleTypes = getCompatibleSlotTypes(
        componentType as Component["type"]
      );
      const slotPosition = motherboard?.slot_positions?.find(
        (sp) => sp.slot_id === slotId
      );
      if (!slotPosition || !compatibleTypes.includes(slotPosition.slot_type)) {
        return;
      }

      // Update assignments
      setAssignments((prev) => ({
        ...prev,
        [slotId]: componentId,
      }));

      // Fetch component data if not already loaded
      if (!loadedComponents[componentId] && componentType) {
        fetchComponentFromSupabase(componentId, componentType).then(
          (component) => {
            if (component) {
              setLoadedComponents((prev) => ({
                ...prev,
                [componentId]: component,
              }));
            }
          }
        );
      }
    },
    [motherboard, loadedComponents]
  );

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

  // No board selected: show board selector
  if (!selectedBoardId || !motherboard) {
    return (
      <div>
        <h1 className="mb-6 text-3xl font-bold tracking-tight text-zinc-50">
          Interactive Board Layout
        </h1>
        <p className="mb-4 text-sm text-zinc-400">
          Select a motherboard to view its physical layout.
        </p>
        <BoardSelector
          boards={manifest.motherboards}
          selectedBoardId={selectedBoardId}
          onSelectBoard={handleSelectBoard}
        />
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
    <DragDropProvider onDragEnd={handleDragEnd}>
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-50">
            {motherboard.manufacturer} {motherboard.model}
          </h1>
          <Link
            href={`/check?board=${motherboard.id}`}
            className="text-sm text-zinc-400 transition-colors hover:text-zinc-50"
          >
            Switch to Slot Checker
          </Link>
        </div>

        <div className="flex gap-6">
          <div className="flex-1">
            <BoardView
              motherboard={motherboard}
              slotPositions={motherboard.slot_positions}
              assignments={assignments}
              loadedComponents={loadedComponents}
              visualStates={visualStates}
              conflictMessages={conflictMessages}
              boardWidthMm={dims.widthMm}
              boardHeightMm={dims.heightMm}
            />
          </div>
          <div className="w-72 shrink-0">
            <LayoutSidebar
              manifest={manifest}
              motherboard={motherboard}
              onKeyboardSelect={handleKeyboardSelect}
            />
          </div>
        </div>
      </div>

      <DragOverlay>
        {(source) => {
          if (!source) return null;
          const componentType = (source.data?.type as string) ?? "";
          const colors = DRAG_OVERLAY_COLORS[componentType] ?? DRAG_OVERLAY_COLORS.gpu;
          const typeLabel = TYPE_LABELS[componentType] ?? componentType;
          const match = findComponentInManifest(manifest, source.id);
          const label = match
            ? `${match.manufacturer} ${match.model}`
            : String(source.id);

          return (
            <div
              className={`w-[200px] rounded-lg border px-3 py-2 shadow-lg backdrop-blur-sm ${colors.bg} ${colors.border}`}
            >
              <p className={`text-xs font-medium uppercase tracking-wide ${colors.text}`}>
                {typeLabel}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-zinc-100 truncate">
                {label}
              </p>
            </div>
          );
        }}
      </DragOverlay>
    </DragDropProvider>
  );
}
