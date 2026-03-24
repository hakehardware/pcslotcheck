"use client";

import { useState } from "react";

interface ShareButtonProps {
  disabled: boolean;
}

export default function ShareButton({ disabled }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    if (disabled) return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may fail in insecure contexts; silently ignore
    }
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
        disabled
          ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
          : "bg-zinc-700 text-zinc-100 hover:bg-zinc-600 active:bg-zinc-500"
      }`}
    >
      {copied ? "Copied!" : "Copy Link"}
    </button>
  );
}
