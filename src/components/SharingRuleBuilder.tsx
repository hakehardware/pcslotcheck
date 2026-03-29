"use client";

import type { SharingRule, SharingTrigger, DeviceFilter } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SharingRuleBuilderProps {
  rules: SharingRule[] | null;
  onChange: (rules: SharingRule[] | null) => void;
  availableSlotIds: string[];
}

/* ------------------------------------------------------------------ */
/*  Shared CSS classes (matching FormEngine)                           */
/* ------------------------------------------------------------------ */

const INPUT_CLS =
  "rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";
const LABEL_CLS = "text-sm font-medium text-zinc-300";
const ADD_BTN_CLS =
  "self-start rounded-md border border-dashed border-zinc-600 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-300";
const REMOVE_BTN_CLS =
  "rounded px-2 py-1 text-xs text-red-400 hover:bg-red-400/10 hover:text-red-300";
const ITEM_CLS = "relative rounded-md border border-zinc-700/50 bg-zinc-800/50 p-3";

/* ------------------------------------------------------------------ */
/*  Toggle Switch (same as FormEngine)                                 */
/* ------------------------------------------------------------------ */

function ToggleSwitch({
  checked,
  onChange: onToggle,
  label,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onToggle(!checked)}
      className={[
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
        checked ? "bg-blue-600" : "bg-zinc-600",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}


/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function createDefaultRule(): SharingRule {
  return {
    type: "disables",
    targets: [],
    trigger: { slot_ids: [], logic: "any_populated" },
    device_filter: undefined,
    direction: undefined,
    degraded_lanes: undefined,
  };
}

function updateRule(
  rules: SharingRule[],
  index: number,
  patch: Partial<SharingRule>,
): SharingRule[] {
  return rules.map((r, i) => (i === index ? { ...r, ...patch } : r));
}

/* ------------------------------------------------------------------ */
/*  Sub-forms                                                          */
/* ------------------------------------------------------------------ */

function TriggerSubForm({
  trigger,
  onChange,
  availableSlotIds,
}: {
  trigger: SharingTrigger | undefined;
  onChange: (t: SharingTrigger | undefined) => void;
  availableSlotIds: string[];
}) {
  const current: SharingTrigger = trigger ?? {
    slot_ids: [],
    logic: "any_populated",
  };

  return (
    <fieldset className="rounded-lg border border-zinc-700 p-3">
      <legend className="px-2 text-xs font-medium text-zinc-400">
        Trigger
      </legend>
      <div className="mt-2 flex flex-col gap-3">
        {/* Slot IDs multi-select */}
        <div className="flex flex-col gap-1">
          <label className={LABEL_CLS}>Slot IDs</label>
          <div className="flex flex-wrap gap-2">
            {availableSlotIds.map((sid) => {
              const selected = current.slot_ids.includes(sid);
              return (
                <button
                  key={sid}
                  type="button"
                  onClick={() => {
                    const next = selected
                      ? current.slot_ids.filter((s) => s !== sid)
                      : [...current.slot_ids, sid];
                    onChange({ ...current, slot_ids: next });
                  }}
                  className={[
                    "rounded-md border px-2 py-1 text-xs transition-colors",
                    selected
                      ? "border-blue-500 bg-blue-500/20 text-blue-300"
                      : "border-zinc-600 bg-zinc-800 text-zinc-400 hover:border-zinc-500",
                  ].join(" ")}
                >
                  {sid}
                </button>
              );
            })}
          </div>
          {availableSlotIds.length === 0 && (
            <p className="text-xs text-zinc-500">
              No slot IDs available. Define slots in the form first.
            </p>
          )}
        </div>

        {/* Logic dropdown */}
        <div className="flex flex-col gap-1">
          <label className={LABEL_CLS}>Logic</label>
          <select
            value={current.logic}
            onChange={(e) =>
              onChange({
                ...current,
                logic: e.target.value as SharingTrigger["logic"],
              })
            }
            className={INPUT_CLS}
          >
            <option value="and">and</option>
            <option value="or">or</option>
            <option value="any_populated">any_populated</option>
          </select>
        </div>
      </div>
    </fieldset>
  );
}

function DeviceFilterSubForm({
  filter,
  onChange,
}: {
  filter: DeviceFilter | undefined;
  onChange: (f: DeviceFilter | undefined) => void;
}) {
  const current: DeviceFilter = filter ?? {};
  const hasValues =
    current.protocol !== undefined ||
    current.pcie_gen !== undefined ||
    current.form_factor !== undefined;

  return (
    <fieldset className="rounded-lg border border-zinc-700 p-3">
      <legend className="flex items-center gap-2 px-2 text-xs font-medium text-zinc-400">
        Device Filter
        <span className="text-xs text-zinc-500">(optional)</span>
      </legend>
      <div className="mt-2 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={LABEL_CLS}>Protocol</label>
          <select
            value={current.protocol ?? ""}
            onChange={(e) => {
              const val = e.target.value || undefined;
              onChange({
                ...current,
                protocol: val as DeviceFilter["protocol"],
              });
            }}
            className={INPUT_CLS}
          >
            <option value="">-- None --</option>
            <option value="NVMe">NVMe</option>
            <option value="SATA">SATA</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={LABEL_CLS}>PCIe Gen</label>
          <input
            type="number"
            value={current.pcie_gen ?? ""}
            min={1}
            max={5}
            onChange={(e) => {
              const raw = e.target.value;
              onChange({
                ...current,
                pcie_gen: raw === "" ? undefined : parseInt(raw, 10),
              });
            }}
            className={INPUT_CLS}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={LABEL_CLS}>Form Factor</label>
          <input
            type="text"
            value={current.form_factor ?? ""}
            onChange={(e) =>
              onChange({
                ...current,
                form_factor: e.target.value || undefined,
              })
            }
            placeholder="e.g. 2280"
            className={INPUT_CLS}
          />
        </div>

        {hasValues && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className={REMOVE_BTN_CLS + " self-start"}
          >
            Clear Filter
          </button>
        )}
      </div>
    </fieldset>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function SharingRuleBuilder({
  rules,
  onChange,
  availableSlotIds,
}: SharingRuleBuilderProps) {
  const enabled = rules !== null;
  const ruleList = rules ?? [];

  const handleToggle = (on: boolean) => {
    onChange(on ? [] : null);
  };

  const handleAddRule = () => {
    onChange([...ruleList, createDefaultRule()]);
  };

  const handleRemoveRule = (index: number) => {
    const updated = [...ruleList];
    updated.splice(index, 1);
    onChange(updated);
  };

  const handleUpdateRule = (index: number, patch: Partial<SharingRule>) => {
    onChange(updateRule(ruleList, index, patch));
  };

  return (
    <fieldset className="rounded-lg border border-zinc-700 p-4">
      <legend className="flex items-center gap-3 px-2 text-sm font-medium text-zinc-300">
        <ToggleSwitch
          checked={enabled}
          onChange={handleToggle}
          label="Enable Sharing Rules"
        />
        <span>Sharing Rules</span>
        <span className="text-xs text-zinc-500">(optional)</span>
      </legend>

      {enabled && (
        <div className="mt-3 flex flex-col gap-3">
          {ruleList.map((rule, idx) => (
            <div key={idx} className={ITEM_CLS}>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-400">
                  Rule #{idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveRule(idx)}
                  className={REMOVE_BTN_CLS}
                  aria-label={`Remove rule ${idx + 1}`}
                >
                  Remove
                </button>
              </div>

              <div className="flex flex-col gap-4">
                {/* Type */}
                <div className="flex flex-col gap-1">
                  <label className={LABEL_CLS}>
                    Type <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={rule.type}
                    onChange={(e) =>
                      handleUpdateRule(idx, {
                        type: e.target.value as SharingRule["type"],
                      })
                    }
                    className={INPUT_CLS}
                  >
                    <option value="disables">disables</option>
                    <option value="bandwidth_split">bandwidth_split</option>
                  </select>
                </div>

                {/* Targets */}
                <div className="flex flex-col gap-1">
                  <label className={LABEL_CLS}>Targets</label>
                  <input
                    type="text"
                    value={(rule.targets ?? []).join(", ")}
                    onChange={(e) => {
                      const val = e.target.value;
                      const targets = val
                        ? val.split(",").map((s) => s.trim()).filter(Boolean)
                        : [];
                      handleUpdateRule(idx, { targets });
                    }}
                    placeholder="Comma-separated slot IDs"
                    className={INPUT_CLS}
                  />
                  <p className="text-xs text-zinc-500">
                    Comma-separated list of target slot IDs
                  </p>
                </div>

                {/* Trigger */}
                <TriggerSubForm
                  trigger={rule.trigger}
                  onChange={(t) => handleUpdateRule(idx, { trigger: t })}
                  availableSlotIds={availableSlotIds}
                />

                {/* Device Filter */}
                <DeviceFilterSubForm
                  filter={rule.device_filter}
                  onChange={(f) => handleUpdateRule(idx, { device_filter: f })}
                />

                {/* Direction */}
                <div className="flex flex-col gap-1">
                  <label className={LABEL_CLS}>Direction</label>
                  <select
                    value={rule.direction ?? ""}
                    onChange={(e) =>
                      handleUpdateRule(idx, {
                        direction:
                          (e.target.value as SharingRule["direction"]) ||
                          undefined,
                      })
                    }
                    className={INPUT_CLS}
                  >
                    <option value="">-- None --</option>
                    <option value="m2_to_pcie">m2_to_pcie</option>
                    <option value="pcie_to_m2">pcie_to_m2</option>
                    <option value="m2_to_sata">m2_to_sata</option>
                    <option value="sata_to_pcie">sata_to_pcie</option>
                  </select>
                </div>

                {/* Degraded Lanes */}
                <div className="flex flex-col gap-1">
                  <label className={LABEL_CLS}>Degraded Lanes</label>
                  <input
                    type="number"
                    value={rule.degraded_lanes ?? ""}
                    min={0}
                    onChange={(e) => {
                      const raw = e.target.value;
                      handleUpdateRule(idx, {
                        degraded_lanes:
                          raw === "" ? undefined : parseInt(raw, 10),
                      });
                    }}
                    className={INPUT_CLS}
                  />
                </div>
              </div>
            </div>
          ))}

          <button type="button" onClick={handleAddRule} className={ADD_BTN_CLS}>
            + Add Rule
          </button>
        </div>
      )}
    </fieldset>
  );
}
