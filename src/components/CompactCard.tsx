import type { IconType } from "react-icons";
import MetadataBadge from "./MetadataBadge";

interface CompactCardProps {
  icon: IconType;
  title: string;
  specs: string[];
  onClick?: () => void;
  action?: React.ReactNode;
  role?: string;
  ariaSelected?: boolean;
}

export default function CompactCard({
  icon: Icon,
  title,
  specs,
  onClick,
  action,
  role,
  ariaSelected,
}: CompactCardProps) {
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
        "flex items-center gap-3 border border-zinc-700 rounded-lg p-3",
        isClickable
          ? "cursor-pointer hover:border-zinc-500 hover:bg-zinc-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          : "",
        "outline-none",
      ].join(" ")}
      {...(isClickable
        ? {
            tabIndex: role === "option" ? -1 : 0,
            role: role ?? "button",
            onClick,
            onKeyDown: handleKeyDown,
          }
        : role
          ? { role }
          : {})}
      {...(ariaSelected !== undefined
        ? { "aria-selected": ariaSelected }
        : {})}
    >
      <div className="flex items-center justify-center w-10 h-10 flex-shrink-0">
        <Icon size={24} className="text-zinc-500" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-zinc-100">{title}</div>
        {specs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {specs.map((spec) => (
              <MetadataBadge key={spec} label={spec} />
            ))}
          </div>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
