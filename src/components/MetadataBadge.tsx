interface MetadataBadgeProps {
  label: string;
}

export default function MetadataBadge({ label }: MetadataBadgeProps) {
  return (
    <span className="inline-flex text-xs font-medium px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
      {label}
    </span>
  );
}
