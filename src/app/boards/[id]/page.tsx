export default async function BoardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-50">
        Board: {id}
      </h1>
      <p className="mt-4 text-zinc-400">
        Detailed slot layout and specifications for this motherboard.
      </p>
    </div>
  );
}
