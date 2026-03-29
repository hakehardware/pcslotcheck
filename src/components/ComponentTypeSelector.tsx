"use client";

import type { ComponentTypeKey } from "@/lib/form-helpers";
import type { IconType } from "react-icons";
import { BsMotherboard, BsMemory, BsNvme, BsGpuCard, BsDeviceHdd, BsDeviceSsd } from "react-icons/bs";
import { FiCpu } from "react-icons/fi";

interface ComponentTypeSelectorProps {
  selected: ComponentTypeKey | null;
  onSelect: (type: ComponentTypeKey) => void;
}

const COMPONENT_TYPES: {
  key: ComponentTypeKey;
  label: string;
  Icon: IconType;
}[] = [
  { key: "motherboard", label: "Motherboard", Icon: BsMotherboard },
  { key: "cpu", label: "CPU", Icon: FiCpu },
  { key: "gpu", label: "GPU", Icon: BsGpuCard },
  { key: "nvme", label: "NVMe", Icon: BsNvme },
  { key: "ram", label: "RAM", Icon: BsMemory },
  { key: "sata_ssd", label: "SATA SSD", Icon: BsDeviceSsd },
  { key: "sata_hdd", label: "SATA HDD", Icon: BsDeviceHdd },
];

export default function ComponentTypeSelector({
  selected,
  onSelect,
}: ComponentTypeSelectorProps) {
  return (
    <div role="radiogroup" aria-label="Component type" className="flex flex-wrap gap-3">
      {COMPONENT_TYPES.map(({ key, label, Icon }) => {
        const isSelected = selected === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(key)}
            className={[
              "flex flex-col items-center gap-2 rounded-lg border px-5 py-3 text-sm font-medium transition-colors",
              "outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-zinc-900",
              isSelected
                ? "border-blue-500 bg-zinc-800 text-zinc-50"
                : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200",
            ].join(" ")}
          >
            <Icon aria-hidden="true" className="h-6 w-6" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
