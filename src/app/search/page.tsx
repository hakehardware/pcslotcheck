import SearchPageClient from "@/components/SearchPageClient";

export default function SearchPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-zinc-50">
        Browse Motherboards
      </h1>
      <SearchPageClient />
    </div>
  );
}
