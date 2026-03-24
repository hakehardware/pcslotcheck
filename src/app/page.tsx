import Link from "next/link";
import {
  GITHUB_ISSUES_URL,
  GITHUB_CONTRIBUTING_URL,
} from "@/lib/github-links";

export default function Home() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-8 px-6 py-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-zinc-50">
        PCSlotCheck
      </h1>
      <p className="max-w-lg text-lg text-zinc-400">
        Open-source PC component slot compatibility checker. Select a
        motherboard, assign components to slots, and catch placement mistakes
        before you build.
      </p>
      <a
        href="https://www.youtube.com/@hakehardware"
        target="_blank"
        rel="noopener noreferrer"
        className="text-zinc-400 transition-colors hover:text-zinc-50"
      >
        Watch Hake Hardware on YouTube
      </a>
      <Link
        href="/check"
        className="rounded-lg bg-zinc-50 px-6 py-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
      >
        Open Slot Checker
      </Link>

      <section
        aria-label="Contribute"
        className="mt-4 w-full max-w-lg rounded-lg border border-zinc-800 px-6 py-6"
      >
        <h2 className="text-lg font-semibold text-zinc-50">
          Community-Driven — We Need Your Help
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          PCSlotCheck grows through contributions. You can help by adding
          motherboard data, component data, or reporting issues.
        </p>
        <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <a
            href={GITHUB_ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-zinc-400 underline transition-colors hover:text-zinc-50"
          >
            Report an Issue (opens in new tab)
          </a>
          <a
            href={GITHUB_CONTRIBUTING_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-zinc-400 underline transition-colors hover:text-zinc-50"
          >
            Contributing Guide (opens in new tab)
          </a>
        </div>
      </section>
    </div>
  );
}
