"use client";

import { useMemo } from "react";
import { IoWarning } from "react-icons/io5";

interface YamlPreviewPanelProps {
  yamlString: string;
  isValid: boolean;
}

/** Simple CSS-based YAML syntax highlighting. */
function highlightYaml(yaml: string): React.ReactNode[] {
  return yaml.split("\n").map((line, i) => {
    // Comment lines
    if (line.trimStart().startsWith("#")) {
      return (
        <span key={i} className="text-zinc-500">
          {line}
          {"\n"}
        </span>
      );
    }

    // Key: value lines
    const match = line.match(/^(\s*)([\w][\w.-]*)(:)(.*)/);
    if (match) {
      const [, indent, key, colon, rest] = match;
      return (
        <span key={i}>
          {indent}
          <span className="text-blue-400">{key}</span>
          <span className="text-zinc-400">{colon}</span>
          <span className="text-emerald-300">{rest}</span>
          {"\n"}
        </span>
      );
    }

    // Array item lines (- value)
    const arrayMatch = line.match(/^(\s*)(- )(.*)/);
    if (arrayMatch) {
      const [, indent, dash, rest] = arrayMatch;
      return (
        <span key={i}>
          {indent}
          <span className="text-zinc-400">{dash}</span>
          <span className="text-emerald-300">{rest}</span>
          {"\n"}
        </span>
      );
    }

    // Fallback
    return (
      <span key={i} className="text-zinc-300">
        {line}
        {"\n"}
      </span>
    );
  });
}

export default function YamlPreviewPanel({
  yamlString,
  isValid,
}: YamlPreviewPanelProps) {
  const highlighted = useMemo(() => highlightYaml(yamlString), [yamlString]);

  return (
    <div
      className={[
        "flex flex-col rounded-lg border bg-zinc-900",
        isValid ? "border-zinc-700" : "border-yellow-600",
      ].join(" ")}
    >
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <span className="text-sm font-medium text-zinc-300">YAML Preview</span>
        {!isValid && (
          <span className="flex items-center gap-1 text-xs text-yellow-400">
            <IoWarning aria-hidden="true" className="h-3.5 w-3.5" />
            Not yet valid
          </span>
        )}
      </div>

      <pre className="overflow-auto p-4 text-sm leading-relaxed font-mono">
        {yamlString ? highlighted : (
          <span className="text-zinc-500">
            YAML output will appear here as you fill out the form.
          </span>
        )}
      </pre>
    </div>
  );
}
