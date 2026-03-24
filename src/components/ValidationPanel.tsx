import type { ValidationResult, Severity } from "../lib/types";

interface ValidationPanelProps {
  results: ValidationResult[];
}

export const severityStyles: Record<Severity, string> = {
  error: "bg-red-900/30 border-red-700 text-red-200",
  warning: "bg-amber-900/30 border-amber-700 text-amber-200",
  info: "bg-blue-900/30 border-blue-700 text-blue-200",
};

const severityIcons: Record<Severity, string> = {
  error: "✕",
  warning: "⚠",
  info: "ℹ",
};

export default function ValidationPanel({ results }: ValidationPanelProps) {
  if (results.length === 0) {
    return null;
  }

  return (
    <div aria-live="polite" role="status">
      <ul aria-label="Validation results" className="flex flex-col gap-2">
        {results.map((result, index) => (
          <li
            key={`${result.slotId}-${result.componentId}-${result.severity}-${index}`}
            className={`flex items-start gap-2 px-3 py-2 rounded border text-sm ${severityStyles[result.severity]}`}
          >
            <span aria-hidden="true" className="shrink-0 mt-0.5">
              {severityIcons[result.severity]}
            </span>
            <span className="sr-only">{result.severity}:</span>
            <span>{result.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
