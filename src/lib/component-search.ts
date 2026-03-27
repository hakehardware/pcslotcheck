import type { DataManifest } from "./types";

/** Filter manifest components to CPUs matching the given socket. */
export function filterCompatibleCPUs(
  manifestComponents: DataManifest["components"],
  motherboardSocket: string
): DataManifest["components"] {
  return manifestComponents.filter(
    (c) => c.type === "cpu" && c.specs.socket === motherboardSocket
  );
}

/** Key specs to display per component type */
export const SPEC_DISPLAY_KEYS: Record<string, { key: string; label: string }[]> = {
  nvme: [
    { key: "capacity_gb", label: "Capacity" },
    { key: "interface.pcie_gen", label: "PCIe Gen" },
    { key: "interface.protocol", label: "Protocol" },
  ],
  gpu: [
    { key: "power.tdp_w", label: "TDP" },
    { key: "interface.pcie_gen", label: "PCIe Gen" },
    { key: "physical.length_mm", label: "Length" },
  ],
  ram: [
    { key: "interface.type", label: "Type" },
    { key: "interface.speed_mhz", label: "Speed" },
    { key: "capacity.total_gb", label: "Capacity" },
  ],
  sata_ssd: [
    { key: "capacity_gb", label: "Capacity" },
    { key: "form_factor", label: "Form Factor" },
    { key: "drive_type", label: "Drive Type" },
  ],
  sata_hdd: [
    { key: "capacity_gb", label: "Capacity" },
    { key: "form_factor", label: "Form Factor" },
    { key: "drive_type", label: "Drive Type" },
  ],
  cpu: [
    { key: "socket", label: "Socket" },
    { key: "microarchitecture", label: "Arch" },
    { key: "pcie_config.cpu_gen", label: "PCIe Gen" },
  ],
};

export interface MatchResult {
  /** Filtered and ranked components, capped at `limit` */
  items: DataManifest["components"];
  /** Total number of components matching the query (before cap) */
  totalMatches: number;
}

/**
 * Filters and ranks components against a search query.
 * Matches against manufacturer, model, and type-specific spec fields
 * determined by SPEC_DISPLAY_KEYS.
 *
 * @param components - The pre-filtered compatible component list
 * @param query - The raw search string from the user
 * @param limit - Maximum results to return (default 5)
 * @returns MatchResult with capped items and total match count
 */
export function searchComponents(
  components: DataManifest["components"],
  query: string,
  limit: number = 5
): MatchResult {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);

  // Empty/whitespace-only query: return first `limit` components
  if (tokens.length === 0) {
    return {
      items: components.slice(0, limit),
      totalMatches: components.length,
    };
  }

  const matched: { component: DataManifest["components"][number]; score: number }[] = [];

  for (const component of components) {
    // Build searchable string from manufacturer, model, and relevant spec values
    const parts: string[] = [component.manufacturer, component.model];

    const displayKeys = SPEC_DISPLAY_KEYS[component.type];
    if (displayKeys) {
      for (const { key } of displayKeys) {
        const value = component.specs[key];
        if (value != null) {
          parts.push(String(value));
        }
      }
    }

    const searchable = parts.join(" ").toLowerCase();

    // Check that every token is a substring of the searchable string
    const allMatch = tokens.every((token) => searchable.includes(token));
    if (!allMatch) continue;

    // Score: count tokens matching manufacturer + model string
    const nameString = `${component.manufacturer} ${component.model}`.toLowerCase();
    const score = tokens.filter((token) => nameString.includes(token)).length;

    matched.push({ component, score });
  }

  // Sort by score descending, then alphabetically by manufacturer+model
  matched.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const nameA = `${a.component.manufacturer} ${a.component.model}`.toLowerCase();
    const nameB = `${b.component.manufacturer} ${b.component.model}`.toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return {
    items: matched.slice(0, limit).map((m) => m.component),
    totalMatches: matched.length,
  };
}
