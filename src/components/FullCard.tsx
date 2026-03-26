import type { IconType } from "react-icons";
import MetadataBadge from "./MetadataBadge";

interface FullCardProps {
  icon: IconType;
  title: string;
  specs: string[];
  onClick?: () => void;
  action?: React.ReactNode;
}

export default function FullCard({
  icon: Icon,
  title,
  specs,
  onClick,
  action,
}: FullCardProps) {
  const isClickable = !!onClick;

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!onClick) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  }

  return (
    <div
      className={[
        "flex flex-col border border-zinc-700 rounded-lg p-4 min-h-[200px]",
        isClickable
          ? "cursor-pointer hover:border-zinc-500 hover:bg-zinc-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          : "",
        "outline-none",
      ].join(" ")}
      {...(isClickable
        ? {
            tabIndex: 0,
            role: "button",
            onClick,
            onKeyDown: handleKeyDown,
          }
        : {})}
    >
      <div className="flex items-center justify-center bg-zinc-800/50 rounded-lg p-4 mb-3">
        <Icon size={32} className="text-zinc-500" aria-hidden="true" />
      </div>
      <div className="text-sm font-medium text-zinc-100">{title}</div>
      {specs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {specs.map((spec) => (
            <MetadataBadge key={spec} label={spec} />
          ))}
        </div>
      )}
      {action && <div className="mt-auto pt-3">{action}</div>}
    </div>
  );
}
