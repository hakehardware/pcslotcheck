interface AttributeBadgeProps {
  label: string;
  colorClass: string;
}

export default function AttributeBadge({ label, colorClass }: AttributeBadgeProps) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${colorClass}`}>
      {label}
    </span>
  );
}
