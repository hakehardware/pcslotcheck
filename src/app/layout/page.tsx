import { Suspense } from "react";
import Link from "next/link";
import BoardLayout from "@/components/BoardLayout";
import manifest from "../../../data-manifest.json";
import type { DataManifest } from "@/lib/types";

export default async function LayoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const boardParam =
    typeof params.board === "string" ? params.board : undefined;

  const checkHref = boardParam ? `/check?board=${boardParam}` : "/check";

  return (
    <>
      {/* Mobile gate: visible below md breakpoint */}
      <div className="block md:hidden px-4 py-12 text-center">
        <p className="text-zinc-300 mb-4">
          This view works best on a larger screen. Use the slot checker for
          mobile-friendly compatibility checking.
        </p>
        <Link href={checkHref} className="text-blue-400 underline hover:text-blue-300">
          Go to Slot Checker
        </Link>
      </div>

      {/* Board layout: visible at md and above */}
      <div className="hidden md:block mx-auto max-w-7xl px-4 sm:px-6 py-8">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-12" role="status">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200" />
              <span className="ml-3 text-sm text-zinc-400">Loading...</span>
            </div>
          }
        >
          <BoardLayout
            manifest={manifest as DataManifest}
            boardId={boardParam}
          />
        </Suspense>
      </div>
    </>
  );
}
