"use client";

import type { CPUOverride } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CpuOverrideSubFormProps {
  overrides: CPUOverride[] | null;
  onChange: (overrides: CPUOverride[] | null) => void;
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

function createDefaultOverride(): CPUOverride {
  return { microarchitecture: "" };
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function CpuOverrideSubForm({
  overrides,
  onChange,
}: CpuOverrideSubFormProps) {
  const enabled = overrides !== null;
  const items = overrides ?? [];

  const handleToggle = (on: boolean) => {
    onChange(on ? [] : null);
  };

  const handleAdd = () => {
    onChange([...items, createDefaultOverride()]);
  };

  const handleRemove = (index: number) => {
    const updated = [...items];
    updated.splice(index, 1);
    onChange(updated);
  };

  const handleUpdate = (index: number, patch: Partial<CPUOverride>) => {
    onChange(items.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  };

  return (
    <fieldset className="rounded-lg border border-zinc-700 p-4">
      <legend className="flex items-center gap-3 px-2 text-sm font-medium text-zinc-300">
        <ToggleSwitch
          checked={enabled}
          onChange={handleToggle}
          label="Enable CPU Overrides"
        />
        <span>CPU Overrides</span>
        <span className="text-xs text-zinc-500">(optional)</span>
      </legend>

      {enabled && (
        <div className="mt-3 flex flex-col gap-3">
          {items.map((entry, idx) => (
            <div key={idx} className={ITEM_CLS}>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-400">
                  Override #{idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  className={REMOVE_BTN_CLS}
                  aria-label={`Remove override ${idx + 1}`}
                >
                  Remove
                </button>
              </div>

              <div className="flex flex-col gap-4">
                {/* Microarchitecture (required) */}
                <div className="flex flex-col gap-1">
                  <label className={LABEL_CLS}>
                    Microarchitecture <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={entry.microarchitecture}
                    onChange={(e) =>
                      handleUpdate(idx, {
                        microarchitecture: e.target.value,
                      })
                    }
                    placeholder="e.g. Raptor Lake"
                    className={INPUT_CLS}
                    aria-required
                  />
                </div>

                {/* Gen (optional) */}
                <div className="flex flex-col gap-1">
                  <label className={LABEL_CLS}>Gen</label>
                  <input
                    type="number"
                    value={entry.gen ?? ""}
                    min={1}
                    max={5}
                    onChange={(e) => {
                      const raw = e.target.value;
                      handleUpdate(idx, {
                        gen: raw === "" ? undefined : parseInt(raw, 10),
                      });
                    }}
                    className={INPUT_CLS}
                  />
                  <p className="text-xs text-zinc-500">
                    PCIe generation override
                  </p>
                </div>

                {/* Lanes (optional) */}
                <div className="flex flex-col gap-1">
                  <label className={LABEL_CLS}>Lanes</label>
                  <input
                    type="number"
                    value={entry.lanes ?? ""}
                    min={1}
                    max={16}
                    onChange={(e) => {
                      const raw = e.target.value;
                      handleUpdate(idx, {
                        lanes: raw === "" ? undefined : parseInt(raw, 10),
                      });
                    }}
                    className={INPUT_CLS}
                  />
                  <p className="text-xs text-zinc-500">
                    Lane count override
                  </p>
                </div>
              </div>
            </div>
          ))}

          <button type="button" onClick={handleAdd} className={ADD_BTN_CLS}>
            + Add Override
          </button>
        </div>
      )}
    </fieldset>
  );
}
