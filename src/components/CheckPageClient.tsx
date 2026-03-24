"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import SlotChecker from "./SlotChecker";
import { fetchMotherboardSummaryById } from "@/lib/supabase-queries";
import type { DataManifest, MotherboardSummary } from "@/lib/types";

interface CheckPageClientProps {
  manifest: DataManifest;
  boardId?: string | null;
}

export default function CheckPageClient({
  manifest,
  boardId,
}: CheckPageClientProps) {
  const [boardSummary, setBoardSummary] = useState<MotherboardSummary | null>(
    null
  );
  const [boardNotFound, setBoardNotFound] = useState(false);
  const [loading, setLoading] = useState(!!boardId);

  useEffect(() => {
    if (!boardId) return;

    let cancelled = false;

    async function fetchSummary() {
      setLoading(true);
      setBoardNotFound(false);
      try {
        const result = await fetchMotherboardSummaryById(boardId!);
        if (!cancelled) {
          if (result) {
            setBoardSummary(result);
          } else {
            setBoardNotFound(true);
          }
        }
      } catch {
        if (!cancelled) {
          setBoardNotFound(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchSummary();
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  if (boardNotFound && !loading) {
    return (
      <div
        className="rounded-lg border border-red-700/50 bg-red-900/20 px-6 py-8 text-center"
        role="alert"
      >
        <p className="text-lg font-semibold text-red-300">
          Motherboard not found.
        </p>
        <p className="mt-2 text-sm text-zinc-400">
          The board ID &quot;{boardId}&quot; does not match any motherboard in
          our database.
        </p>
        <Link
          href="/search"
          className="mt-4 inline-block rounded bg-zinc-700 px-4 py-2 text-sm text-zinc-100 transition-colors hover:bg-zinc-600"
        >
          Browse Motherboards
        </Link>
      </div>
    );
  }

  return (
    <>
      {boardId && boardSummary && (
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-50">
            {boardSummary.manufacturer} {boardSummary.model}
          </h1>
          <Link
            href="/search"
            className="mt-2 inline-block text-sm text-zinc-400 transition-colors hover:text-zinc-50"
          >
            Change Motherboard
          </Link>
        </div>
      )}

      {boardId && loading && !boardSummary && (
        <div className="mb-6">
          <div className="h-8 w-64 animate-pulse rounded bg-zinc-800" />
        </div>
      )}

      {!boardId && (
        <h1 className="text-3xl font-bold tracking-tight text-zinc-50 mb-6">
          Slot Checker
        </h1>
      )}

      <SlotChecker manifest={manifest} boardId={boardId} />
    </>
  );
}
