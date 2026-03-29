"use client";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SourceEntry {
  type: string;
  url: string;
}

interface SourcesSubFormProps {
  sources: SourceEntry[];
  onChange: (sources: SourceEntry[]) => void;
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
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function SourcesSubForm({
  sources,
  onChange,
}: SourcesSubFormProps) {
  const handleAdd = () => {
    onChange([...sources, { type: "", url: "" }]);
  };

  const handleRemove = (index: number) => {
    const updated = [...sources];
    updated.splice(index, 1);
    onChange(updated);
  };

  const handleUpdate = (index: number, patch: Partial<SourceEntry>) => {
    onChange(sources.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  return (
    <fieldset className="rounded-lg border border-zinc-700 p-4">
      <legend className="px-2 text-sm font-medium text-zinc-300">
        Sources <span className="text-red-400">*</span>
        <span className="ml-2 text-xs text-zinc-500">
          ({sources.length} item{sources.length !== 1 ? "s" : ""})
        </span>
      </legend>

      <div className="mt-3 flex flex-col gap-3">
        {sources.map((entry, idx) => (
          <div key={idx} className={ITEM_CLS}>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">
                Source #{idx + 1}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(idx)}
                className={REMOVE_BTN_CLS}
                aria-label={`Remove source ${idx + 1}`}
              >
                Remove
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {/* Type (free text) */}
              <div className="flex flex-col gap-1">
                <label className={LABEL_CLS}>Type</label>
                <input
                  type="text"
                  value={entry.type}
                  onChange={(e) =>
                    handleUpdate(idx, { type: e.target.value })
                  }
                  placeholder="e.g. manual, product_page, spec_sheet"
                  className={INPUT_CLS}
                />
              </div>

              {/* URL */}
              <div className="flex flex-col gap-1">
                <label className={LABEL_CLS}>
                  URL <span className="text-red-400">*</span>
                </label>
                <input
                  type="url"
                  value={entry.url}
                  onChange={(e) =>
                    handleUpdate(idx, { url: e.target.value })
                  }
                  placeholder="https://..."
                  className={INPUT_CLS}
                  aria-required
                />
              </div>
            </div>
          </div>
        ))}

        <button type="button" onClick={handleAdd} className={ADD_BTN_CLS}>
          + Add Source
        </button>
      </div>
    </fieldset>
  );
}
