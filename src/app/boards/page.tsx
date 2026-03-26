import type { Metadata } from "next";
import type { DataManifest } from "@/lib/types";
import BoardBrowseClient from "@/components/BoardBrowseClient";
import manifest from "../../../data-manifest.json";

export const metadata: Metadata = {
  title: "Browse Motherboards",
};

export default function BoardsPage() {
  const data = manifest as DataManifest;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-zinc-100">
        Browse Motherboards
      </h1>
      <BoardBrowseClient boards={data.motherboards} />
    </div>
  );
}
