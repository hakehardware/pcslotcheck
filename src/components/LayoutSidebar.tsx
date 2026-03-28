"use client";

import { useMemo, useCallback } from "react";
import { useDraggable } from "@dnd-kit/react";
import type { DataManifest, Motherboard, ComponentSummary } from "@/lib/types";

interface LayoutSidebarProps {
  manifest: DataManifest;
  motherboard: Motherboard;
  onKeyboardSelect: (componentId: string) => void;
}

const COMPONENT_GROUPS = ["gpu", "nvme", "ram", "cpu", "sata_ssd", "sata_hdd", "sata_drive"] as const;

const GROUP_LABELS: Record<string, string> = {
  gpu: "GPU",
  nvme: "NVMe",
  ram: "RAM",
  cpu: "CPU",
  sata_ssd: "SATA SSD",
  sata_hdd: "SATA HDD",
  sata_drive: "SATA Drive",
};

function filterComponents(
  components: ComponentSummary[],
  motherboard: Motherboard
): Record<string, ComponentSummary[]> {
  const grouped: Record<string, ComponentSummary[]> = {
    gpu: [],
    nvme: [],
    ram: [],
    cpu: [],
    sata_ssd: [],
    sata_hdd: [],
    sata_drive: [],
  };

  for (const component of components) {
    const type = component.type;

    if (type === "gpu") {
      grouped.gpu.push(component);
    } else if (type === "nvme") {
      grouped.nvme.push(component);
    } else if (type === "ram") {
      const interfaceType = (component.specs["interface.type"] ?? component.specs.interface_type) as string | undefined;
      if (interfaceType && interfaceType === motherboard.memory.type) {
        grouped.ram.push(component);
      }
    } else if (type === "cpu") {
      const socket = component.specs.socket as string | undefined;
      if (socket && socket === motherboard.socket) {
        grouped.cpu.push(component);
      }
    } else if (type === "sata_ssd") {
      grouped.sata_ssd.push(component);
    } else if (type === "sata_hdd") {
      grouped.sata_hdd.push(component);
    } else if (type === "sata_drive") {
      grouped.sata_drive.push(component);
    }
  }

  return grouped;
}

interface DraggableItemProps {
  component: ComponentSummary;
  onKeyboardSelect: (componentId: string) => void;
}

function DraggableItem({ component, onKeyboardSelect }: DraggableItemProps) {
  const { ref, isDragging } = useDraggable({
    id: component.id,
    data: { type: component.type },
  });

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onKeyboardSelect(component.id);
      }
    },
    [component.id, onKeyboardSelect]
  );

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={`cursor-grab rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-750 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        isDragging ? "opacity-50" : ""
      }`}
      aria-label={`${component.manufacturer} ${component.model}`}
    >
      {component.manufacturer} {component.model}
    </div>
  );
}

export default function LayoutSidebar({
  manifest,
  motherboard,
  onKeyboardSelect,
}: LayoutSidebarProps) {
  const grouped = useMemo(
    () => filterComponents(manifest.components, motherboard),
    [manifest.components, motherboard]
  );

  return (
    <aside
      className="overflow-y-auto max-h-[calc(100vh-200px)]"
      aria-label="Components"
    >
      <h2 className="mb-4 text-lg font-semibold text-zinc-50">Components</h2>

      {COMPONENT_GROUPS.map((type) => {
        const items = grouped[type];
        return (
          <details key={type} className="mb-2" open>
            <summary className="cursor-pointer select-none rounded px-2 py-1.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800">
              {GROUP_LABELS[type]} ({items.length})
            </summary>
            <div className="mt-1 flex flex-col gap-1 pl-2">
              {items.length === 0 ? (
                <p className="px-3 py-2 text-xs text-zinc-500">
                  No compatible components
                </p>
              ) : (
                items.map((component) => (
                  <DraggableItem
                    key={component.id}
                    component={component}
                    onKeyboardSelect={onKeyboardSelect}
                  />
                ))
              )}
            </div>
          </details>
        );
      })}
    </aside>
  );
}
