import ComponentTable from "@/components/ComponentTable";

export default function ComponentsPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-zinc-50">
        Browse Components
      </h1>
      <ComponentTable />
    </div>
  );
}
