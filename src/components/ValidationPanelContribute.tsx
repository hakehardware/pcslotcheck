"use client";

import type { ValidationError } from "@/lib/validation-engine-contribute";
import { IoCheckmarkCircle, IoWarning, IoCloseCircle } from "react-icons/io5";

interface ValidationPanelProps {
  errors: ValidationError[];
  isValid: boolean;
}

export default function ValidationPanelContribute({
  errors,
  isValid,
}: ValidationPanelProps) {
  if (isValid) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-700 bg-zinc-900 px-4 py-3">
        <IoCheckmarkCircle aria-hidden="true" className="h-5 w-5 shrink-0 text-green-400" />
        <span className="text-sm font-medium text-green-300">
          All validation checks passed
        </span>
      </div>
    );
  }

  const errorCount = errors.filter((e) => e.severity === "error").length;
  const warningCount = errors.filter((e) => e.severity === "warning").length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 text-xs text-zinc-400">
        {errorCount > 0 && (
          <span className="flex items-center gap-1">
            <IoCloseCircle aria-hidden="true" className="h-4 w-4 text-red-400" />
            {errorCount} {errorCount === 1 ? "error" : "errors"}
          </span>
        )}
        {warningCount > 0 && (
          <span className="flex items-center gap-1">
            <IoWarning aria-hidden="true" className="h-4 w-4 text-yellow-400" />
            {warningCount} {warningCount === 1 ? "warning" : "warnings"}
          </span>
        )}
      </div>

      <ul
        role="list"
        className="max-h-64 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900"
      >
        {errors.map((err, i) => (
          <li
            key={`${err.path}-${i}`}
            className="flex items-start gap-2 border-b border-zinc-800 px-3 py-2 last:border-b-0"
          >
            {err.severity === "error" ? (
              <IoCloseCircle
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-red-400"
              />
            ) : (
              <IoWarning
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400"
              />
            )}
            <div className="min-w-0">
              <span className="block text-xs font-mono text-zinc-400">
                {err.path}
              </span>
              <span className="block text-sm text-zinc-200">
                {err.message}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
