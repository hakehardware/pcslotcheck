"use client";

import type { Component, SlotPosition } from "@/lib/types";
import { computeComponentFootprint } from "@/lib/physical-conflict-engine";
import { IoClose } from "react-icons/io5";

interface ComponentOverlayProps {
  componentId: string;
  component: Component;
  slotPosition: SlotPosition;
  boardWidthMm: number;
  boardHeightMm: number;
  onRemove: (slotId: string) => void;
}

function getModelName(component: Component): string {
  return component.model;
}

function getComponentStyle(component: Component): {
  bg: string;
  border: string;
} {
  switch (component.type) {
    case "gpu":
      return { bg: "bg-blue-500/30", border: "border-blue-400" };
    case "nvme":
      return { bg: "bg-purple-500/30", border: "border-purple-400" };
    case "ram":
      return { bg: "bg-emerald-500/30", border: "border-emerald-400" };
    case "cpu":
      return { bg: "bg-cyan-500/30", border: "border-cyan-400" };
    default:
      // sata_ssd, sata_hdd, sata_drive, and any other type
      return { bg: "bg-amber-500/30", border: "border-amber-400" };
  }
}

export default function ComponentOverlay({
  component,
  slotPosition,
  boardWidthMm,
  boardHeightMm,
  onRemove,
}: ComponentOverlayProps) {
  const footprint = computeComponentFootprint(
    component,
    slotPosition,
    boardWidthMm,
    boardHeightMm,
  );

  const { bg, border } = getComponentStyle(component);
  const modelName = getModelName(component);

  return (
    <div
      className={`absolute ${bg} ${border} flex items-center justify-center overflow-hidden rounded border p-0.5`}
      style={{
        left: `${footprint.x}%`,
        top: `${footprint.y}%`,
        width: `${footprint.w}%`,
        height: `${footprint.h}%`,
      }}
    >
      <span className="truncate text-[0.5rem] leading-tight font-medium text-white">
        {modelName}
      </span>

      <button
        type="button"
        onClick={() => onRemove(slotPosition.slot_id)}
        aria-label={`Remove ${modelName} from ${slotPosition.slot_id}`}
        className="absolute top-0 right-0 flex h-3.5 w-3.5 cursor-pointer items-center justify-center rounded-bl bg-black/50 text-white hover:bg-red-600/80 focus:bg-red-600/80 focus:outline-none focus:ring-1 focus:ring-white"
      >
        <IoClose className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}
