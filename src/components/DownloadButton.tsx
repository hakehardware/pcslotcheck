"use client";

import { useCallback } from "react";
import { IoDownloadOutline } from "react-icons/io5";

interface DownloadButtonProps {
  yamlString: string;
  filename: string;
  disabled: boolean;
}

export default function DownloadButton({
  yamlString,
  filename,
  disabled,
}: DownloadButtonProps) {
  const handleDownload = useCallback(() => {
    if (disabled || !yamlString) return;

    try {
      const blob = new Blob([yamlString], { type: "text/yaml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab via data URI
      const encoded = encodeURIComponent(yamlString);
      window.open(`data:text/yaml;charset=utf-8,${encoded}`, "_blank");
    }
  }, [yamlString, filename, disabled]);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={handleDownload}
        className={[
          "flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
          "outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-zinc-900",
          disabled
            ? "cursor-not-allowed border border-zinc-700 bg-zinc-800 text-zinc-500"
            : "bg-blue-600 text-zinc-50 hover:bg-blue-500",
        ].join(" ")}
      >
        <IoDownloadOutline aria-hidden="true" className="h-4 w-4" />
        Download {filename}
      </button>
      {disabled && (
        <p className="text-xs text-zinc-500">
          Resolve all validation errors before downloading.
        </p>
      )}
    </div>
  );
}
