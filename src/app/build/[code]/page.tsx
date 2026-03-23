export default async function SharedBuildPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-50">
        Shared Build
      </h1>
      <p className="mt-4 text-zinc-400">
        Viewing a shared build configuration. Build code:{" "}
        <code className="rounded bg-zinc-800 px-2 py-0.5 text-sm text-zinc-300">
          {code}
        </code>
      </p>
    </div>
  );
}
