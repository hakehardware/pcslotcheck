import { FiCpu, FiMonitor, FiHardDrive, FiServer, FiDisc } from "react-icons/fi";
import type { IconType } from "react-icons";

export interface ComponentTypeMeta {
  label: string;
  icon: IconType;
}

export const COMPONENT_TYPE_META: Record<string, ComponentTypeMeta> = {
  cpu:        { label: "CPU",        icon: FiCpu },
  gpu:        { label: "GPU",        icon: FiMonitor },
  nvme:       { label: "NVMe",       icon: FiHardDrive },
  ram:        { label: "RAM",        icon: FiServer },
  sata_drive: { label: "SATA Drive", icon: FiDisc },
};

/** Spec column definitions per component type for the table view. */
export const COMPONENT_SPEC_COLUMNS: Record<string, { key: string; label: string }[]> = {
  cpu: [
    { key: "socket", label: "Socket" },
    { key: "microarchitecture", label: "Microarch" },
    { key: "pcie_config.cpu_gen", label: "PCIe Gen" },
  ],
  gpu: [
    { key: "interface.pcie_gen", label: "PCIe Gen" },
    { key: "power.tdp_w", label: "TDP (W)" },
    { key: "physical.length_mm", label: "Length (mm)" },
  ],
  nvme: [
    { key: "interface.protocol", label: "Protocol" },
    { key: "interface.pcie_gen", label: "PCIe Gen" },
    { key: "capacity_gb", label: "Capacity (GB)" },
  ],
  ram: [
    { key: "interface.type", label: "DDR Type" },
    { key: "interface.speed_mhz", label: "Speed (MHz)" },
    { key: "capacity.total_gb", label: "Total (GB)" },
  ],
  sata_drive: [
    { key: "form_factor", label: "Form Factor" },
    { key: "capacity_gb", label: "Capacity (GB)" },
  ],
};
