import { BsMotherboard } from "react-icons/bs";
import { FiBox } from "react-icons/fi";
import { COMPONENT_TYPE_META } from "@/lib/component-type-meta";
import type { IconType } from "react-icons";

/**
 * Returns the appropriate react-icon for a given entity type.
 * - "motherboard" -> BsMotherboard
 * - Known component types -> icon from COMPONENT_TYPE_META
 * - Unknown types -> FiBox fallback
 */
export function getThumbnailIcon(entityType: string): IconType {
  if (entityType === "motherboard") return BsMotherboard;
  return COMPONENT_TYPE_META[entityType]?.icon ?? FiBox;
}
