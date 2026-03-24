import { Suspense } from "react";
import SlotChecker from "@/components/SlotChecker";
import manifest from "../../../data-manifest.json";
import type { DataManifest } from "@/lib/types";
import { GITHUB_ISSUES_URL, GITHUB_CONTRIBUTING_URL } from "@/lib/github-links";

export default function SlotCheckerPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-50 mb-6">
        Slot Checker
      </h1>
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12" role="status">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200" />
            <span className="ml-3 text-sm text-zinc-400">Loading…</span>
          </div>
        }
      >
        <SlotChecker manifest={manifest as DataManifest} />
      </Suspense>

      <section
        aria-label="Contribute"
        className="mt-8 border-t border-zinc-800 pt-6 text-center text-sm text-zinc-500"
      >
        <p>
          Find an issue or missing data? Help improve PCSlotCheck —{" "}
          <a
            href={GITHUB_ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-zinc-300"
          >
            report it on GitHub (opens in new tab)
          </a>{" "}
          or{" "}
          <a
            href={GITHUB_CONTRIBUTING_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-zinc-300"
          >
            read the contributing guide (opens in new tab)
          </a>
          .
        </p>
      </section>
    </div>
  );
}
