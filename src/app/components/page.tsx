import ComponentTable from "@/components/ComponentTable";
import manifest from "../../../data-manifest.json";
import type { DataManifest } from "@/lib/types";

const typedManifest = manifest as DataManifest;

export default function ComponentsPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-zinc-50">
        Browse Components
      </h1>
      <ComponentTable components={typedManifest.components} />
    </div>
  );
}
