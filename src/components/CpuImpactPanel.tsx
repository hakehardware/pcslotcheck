import { IoCheckmarkCircle, IoWarning, IoCloseCircle } from "react-icons/io5";
import type { CpuImpactResult, SlotImpact } from "../lib/cpu-utils";

interface CpuImpactPanelProps {
  impact: CpuImpactResult;
}

function SlotImpactItem({ slot }: { slot: SlotImpact }) {
  const parts: string[] = [];

  if (slot.hasGenDowngrade) {
    parts.push(`Gen${slot.baseGen} to Gen${slot.effectiveGen}`);
  }
  if (slot.hasLaneReduction) {
    parts.push(`x${slot.baseLanes} to x${slot.effectiveLanes}`);
  }

  return (
    <div className="flex items-start gap-2 rounded-md border border-orange-700/50 bg-orange-900/20 px-3 py-2">
      <IoWarning
        className="mt-0.5 shrink-0 text-orange-400"
        aria-hidden="true"
      />
      <span className="text-sm text-orange-200">
        {slot.slotLabel}: {parts.join(", ")}
      </span>
    </div>
  );
}

export default function CpuImpactPanel({ impact }: CpuImpactPanelProps) {
  const affectedSlots = impact.slotImpacts.filter(
    (s) => s.hasGenDowngrade || s.hasLaneReduction
  );

  return (
    <div
      className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-900 p-4"
      role="region"
      aria-label="CPU impact summary"
    >
      {/* Socket compatibility — always first */}
      {impact.socketMatch ? (
        <div className="flex items-start gap-2 rounded-md border border-green-700/50 bg-green-900/20 px-3 py-2">
          <IoCheckmarkCircle
            className="mt-0.5 shrink-0 text-green-400"
            aria-hidden="true"
          />
          <span className="text-sm text-green-200">
            Socket compatible ({impact.cpuSocket})
          </span>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-md border border-red-700/50 bg-red-900/20 px-3 py-2">
          <IoCloseCircle
            className="mt-0.5 shrink-0 text-red-400"
            aria-hidden="true"
          />
          <span className="text-sm text-red-200">
            Socket mismatch: CPU is {impact.cpuSocket}, motherboard is{" "}
            {impact.motherboardSocket}
          </span>
        </div>
      )}

      {/* Per-slot impacts */}
      {affectedSlots.map((slot) => (
        <SlotImpactItem key={slot.slotId} slot={slot} />
      ))}

      {/* No downgrades message — only when socket matches and no impacts */}
      {impact.socketMatch && affectedSlots.length === 0 && (
        <div className="flex items-start gap-2 rounded-md border border-green-700/50 bg-green-900/20 px-3 py-2">
          <IoCheckmarkCircle
            className="mt-0.5 shrink-0 text-green-400"
            aria-hidden="true"
          />
          <span className="text-sm text-green-200">
            No slot downgrades detected
          </span>
        </div>
      )}
    </div>
  );
}
