/** Which category a slot belongs to */
export type SlotCategory = "memory" | "m2" | "pcie" | "sata" | "cpu";

/** Badge display info */
export interface BadgeInfo {
  label: string;
  colorClass: string;
}

/** A normalized slot entry for rendering */
export interface SlotEntry {
  id: string;
  label: string;
  category: SlotCategory;
  badges: BadgeInfo[];
}

/** A group of slots under one category header */
export interface SlotGroup {
  category: SlotCategory;
  displayName: string;
  slots: SlotEntry[];
}

/** Slot category → compatible component type mapping */
export const SLOT_CATEGORY_TO_COMPONENT_TYPE: Record<SlotCategory, string> = {
  memory: "ram",
  m2: "nvme",
  pcie: "gpu",
  sata: "sata_drive",
  cpu: "cpu",
};
