import { BsMotherboard } from "react-icons/bs";
import MetadataBadge from "./MetadataBadge";

interface BoardCardContentProps {
  manufacturer: string;
  model: string;
  chipset: string;
  socket: string;
  formFactor: string;
}

export default function BoardCardContent({
  manufacturer,
  model,
  chipset,
  socket,
  formFactor,
}: BoardCardContentProps) {
  return (
    <div className="flex items-center gap-3">
      <BsMotherboard
        size={24}
        className="text-zinc-500 flex-shrink-0"
        aria-hidden="true"
      />
      <div>
        <div className="text-sm font-medium text-zinc-100">
          {manufacturer} {model}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-1">
          <MetadataBadge label={chipset} />
          <MetadataBadge label={socket} />
          <MetadataBadge label={formFactor} />
        </div>
      </div>
    </div>
  );
}
