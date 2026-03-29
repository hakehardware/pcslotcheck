"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { SlotPosition, Motherboard } from "@/lib/types";
import type { VisualState } from "@/lib/physical-conflict-engine";
import CaseCanvas from "./CaseCanvas";

interface BoardCanvasEditorProps {
  formData: Record<string, unknown>;
  onChange: (path: string, value: unknown) => void;
}

/** Empty records reused across renders -- no components assigned in edit mode. */
const EMPTY_ASSIGNMENTS: Record<string, string> = {};
const EMPTY_COMPONENTS: Record<string, never> = {};
const EMPTY_VISUAL: Record<string, VisualState> = {};
const EMPTY_MESSAGES: Record<string, string> = {};

/**
 * Default slot dimensions (percentage of board) per slot type.
 * Sized to roughly match real-world proportions.
 */
const DEFAULT_DIMS: Record<SlotPosition["slot_type"], { w: number; h: number }> = {
  cpu: { w: 14, h: 14 },
  dimm: { w: 4, h: 18 },
  pcie: { w: 30, h: 5 },
  m2: { w: 18, h: 4 },
  sata_group: { w: 10, h: 10 },
};

/**
 * Compute a default position for a slot so chips are spread across the board
 * rather than stacked at (0,0). Uses slot type and index to distribute.
 */
function defaultPosition(
  slotType: SlotPosition["slot_type"],
  index: number,
  dims: { w: number; h: number },
): { x: number; y: number } {
  switch (slotType) {
    case "cpu":
      return { x: 25, y: 15 };
    case "dimm":
      // Stack DIMMs vertically on the right side of the board
      return { x: 55 + index * 5, y: 10 };
    case "pcie":
      // Stack PCIe slots vertically in the lower-left area
      return { x: 10, y: 45 + index * 8 };
    case "m2":
      // Place M.2 slots in the middle area
      return { x: 15, y: 30 + index * 7 };
    case "sata_group":
      // SATA group in the bottom-right
      return { x: 75, y: 70 };
    default:
      return { x: 10 + index * 10, y: 10 + index * 10 };
  }
}

/**
 * Build SlotPosition[] from the current form data's defined slots.
 * Merges with any existing slot_positions to preserve user-placed coordinates.
 */
function buildSlotPositions(formData: Record<string, unknown>): SlotPosition[] {
  const existing = (formData.slot_positions as SlotPosition[] | undefined) ?? [];
  const existingMap = new Map(existing.map((sp) => [sp.slot_id, sp]));
  const positions: SlotPosition[] = [];

  let dimmIndex = 0;
  let m2Index = 0;
  let pcieIndex = 0;

  // CPU socket -- always one chip if socket field is present
  const socket = formData.socket as string | undefined;
  if (socket) {
    const id = "cpu_socket";
    const prev = existingMap.get(id);
    if (prev) {
      positions.push(prev);
    } else {
      const dims = DEFAULT_DIMS.cpu;
      const pos = defaultPosition("cpu", 0, dims);
      positions.push({
        slot_type: "cpu",
        slot_id: id,
        x_pct: pos.x,
        y_pct: pos.y,
        width_pct: dims.w,
        height_pct: dims.h,
      });
    }
  }

  // DIMM slots from memory.slots
  const memory = formData.memory as Record<string, unknown> | undefined;
  const memSlots = (memory?.slots as Array<{ id: string }>) ?? [];
  for (const slot of memSlots) {
    if (!slot.id) continue;
    const prev = existingMap.get(slot.id);
    if (prev) {
      positions.push(prev);
    } else {
      const dims = DEFAULT_DIMS.dimm;
      const pos = defaultPosition("dimm", dimmIndex, dims);
      positions.push({
        slot_type: "dimm",
        slot_id: slot.id,
        x_pct: pos.x,
        y_pct: pos.y,
        width_pct: dims.w,
        height_pct: dims.h,
      });
    }
    dimmIndex++;
  }

  // M.2 slots
  const m2Slots = (formData.m2_slots as Array<{ id: string }>) ?? [];
  for (const slot of m2Slots) {
    if (!slot.id) continue;
    const prev = existingMap.get(slot.id);
    if (prev) {
      positions.push(prev);
    } else {
      const dims = DEFAULT_DIMS.m2;
      const pos = defaultPosition("m2", m2Index, dims);
      positions.push({
        slot_type: "m2",
        slot_id: slot.id,
        x_pct: pos.x,
        y_pct: pos.y,
        width_pct: dims.w,
        height_pct: dims.h,
      });
    }
    m2Index++;
  }

  // PCIe slots
  const pcieSlots = (formData.pcie_slots as Array<{ id: string }>) ?? [];
  for (const slot of pcieSlots) {
    if (!slot.id) continue;
    const prev = existingMap.get(slot.id);
    if (prev) {
      positions.push(prev);
    } else {
      const dims = DEFAULT_DIMS.pcie;
      const pos = defaultPosition("pcie", pcieIndex, dims);
      positions.push({
        slot_type: "pcie",
        slot_id: slot.id,
        x_pct: pos.x,
        y_pct: pos.y,
        width_pct: dims.w,
        height_pct: dims.h,
      });
    }
    pcieIndex++;
  }

  // SATA ports -- grouped into one sata_group chip
  const sataPorts = (formData.sata_ports as Array<{ id: string }>) ?? [];
  if (sataPorts.length > 0) {
    const id = "sata_group_1";
    const prev = existingMap.get(id);
    if (prev) {
      positions.push(prev);
    } else {
      const dims = DEFAULT_DIMS.sata_group;
      const pos = defaultPosition("sata_group", 0, dims);
      positions.push({
        slot_type: "sata_group",
        slot_id: id,
        x_pct: pos.x,
        y_pct: pos.y,
        width_pct: dims.w,
        height_pct: dims.h,
      });
    }
  }

  return positions;
}

/**
 * Build a minimal Motherboard object from form data for CaseCanvas consumption.
 */
function buildMinimalMotherboard(formData: Record<string, unknown>): Motherboard {
  return {
    id: (formData.id as string) ?? "new-board",
    manufacturer: (formData.manufacturer as string) ?? "",
    model: (formData.model as string) ?? "",
    chipset: (formData.chipset as string) ?? "",
    socket: (formData.socket as string) ?? "",
    form_factor: (formData.form_factor as string) ?? "",
    memory: (formData.memory as Motherboard["memory"]) ?? {
      type: "DDR5",
      max_speed_mhz: 0,
      base_speed_mhz: 0,
      max_capacity_gb: 0,
      ecc_support: false,
      channels: 0,
      slots: [],
      recommended_population: { two_dimm: [] },
    },
    m2_slots: (formData.m2_slots as Motherboard["m2_slots"]) ?? [],
    pcie_slots: (formData.pcie_slots as Motherboard["pcie_slots"]) ?? [],
    sata_ports: (formData.sata_ports as Motherboard["sata_ports"]) ?? [],
    sources: (formData.sources as Motherboard["sources"]) ?? [],
    schema_version: (formData.schema_version as string) ?? "2.0",
    length_mm: (formData.length_mm as number) ?? 0,
    width_mm: (formData.width_mm as number) ?? 0,
    slot_positions: (formData.slot_positions as SlotPosition[]) ?? [],
  };
}

export default function BoardCanvasEditor({ formData, onChange }: BoardCanvasEditorProps) {
  const [canvasOpen, setCanvasOpen] = useState(false);

  const lengthMm = Number(formData.length_mm) || 0;
  const widthMm = Number(formData.width_mm) || 0;
  const canEnable = lengthMm > 0 && widthMm > 0;

  // Build slot positions from form data
  const slotPositions = useMemo(() => buildSlotPositions(formData), [formData]);

  // Track previous slot positions to detect form-driven slot changes
  const prevPositionsRef = useRef<SlotPosition[]>(slotPositions);

  // Synchronize slot_positions in form data when slots change
  useEffect(() => {
    const prev = prevPositionsRef.current;
    const prevIds = new Set(prev.map((p) => p.slot_id));
    const currIds = new Set(slotPositions.map((p) => p.slot_id));

    // Detect if the set of slot IDs changed (slots added/removed in form)
    const changed =
      prevIds.size !== currIds.size ||
      [...currIds].some((id) => !prevIds.has(id)) ||
      [...prevIds].some((id) => !currIds.has(id));

    if (changed && canvasOpen) {
      onChange("slot_positions", slotPositions);
    }
    prevPositionsRef.current = slotPositions;
  }, [slotPositions, canvasOpen, onChange]);

  const handleOpenCanvas = useCallback(() => {
    setCanvasOpen(true);
    // Write initial slot positions into form data
    const positions = buildSlotPositions(formData);
    onChange("slot_positions", positions);
  }, [formData, onChange]);

  const handlePositionChange = useCallback(
    (slotId: string, x_pct: number, y_pct: number) => {
      const current = (formData.slot_positions as SlotPosition[] | undefined) ?? [];
      const updated = current.map((sp) =>
        sp.slot_id === slotId ? { ...sp, x_pct, y_pct } : sp,
      );
      onChange("slot_positions", updated);
    },
    [formData.slot_positions, onChange],
  );

  const handleSizeChange = useCallback(
    (slotId: string, width_pct: number, height_pct: number) => {
      const current = (formData.slot_positions as SlotPosition[] | undefined) ?? [];
      const updated = current.map((sp) =>
        sp.slot_id === slotId ? { ...sp, width_pct, height_pct } : sp,
      );
      onChange("slot_positions", updated);
    },
    [formData.slot_positions, onChange],
  );

  const motherboard = useMemo(() => buildMinimalMotherboard(formData), [formData]);

  return (
    <div className="mt-4 space-y-3">
      <button
        type="button"
        disabled={!canEnable}
        onClick={handleOpenCanvas}
        data-testid="configure-slot-positions-btn"
        className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
          canEnable
            ? "bg-blue-600 text-white hover:bg-blue-500"
            : "cursor-not-allowed bg-zinc-700 text-zinc-500"
        }`}
      >
        Configure Slot Positions
      </button>

      {canvasOpen && canEnable && (
        <div className="mt-3 overflow-x-auto">
          <CaseCanvas
            mode="edit"
            motherboard={motherboard}
            boardWidthMm={lengthMm}
            boardHeightMm={widthMm}
            slotPositions={slotPositions}
            assignments={EMPTY_ASSIGNMENTS}
            loadedComponents={EMPTY_COMPONENTS}
            visualStates={EMPTY_VISUAL}
            conflictMessages={EMPTY_MESSAGES}
            sataDriveAssignments={EMPTY_ASSIGNMENTS}
            sataDriveComponents={EMPTY_COMPONENTS}
            sataDriveVisualStates={EMPTY_VISUAL}
            sataDriveConflictMessages={EMPTY_MESSAGES}
            onPositionChange={handlePositionChange}
            onSizeChange={handleSizeChange}
          />
        </div>
      )}
    </div>
  );
}
