import Link from "next/link";

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
      <Link
        href="/check"
        className="rounded-lg bg-zinc-50 px-6 py-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
      >
        Open Slot Checker
      </Link>
    </div>
  );
}
