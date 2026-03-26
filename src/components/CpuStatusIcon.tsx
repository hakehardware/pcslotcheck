import { IoCheckmarkCircle, IoWarning, IoCloseCircle } from "react-icons/io5";

interface CpuStatusIconProps {
  status: "compatible" | "warning" | "error";
}

const statusConfig = {
  compatible: {
    Icon: IoCheckmarkCircle,
    className: "text-green-400",
    ariaLabel: "CPU fully compatible",
  },
  warning: {
    Icon: IoWarning,
    className: "text-orange-400",
    ariaLabel: "CPU compatible with slot downgrades",
  },
  error: {
    Icon: IoCloseCircle,
    className: "text-red-400",
    ariaLabel: "CPU socket incompatible",
  },
} as const;

export default function CpuStatusIcon({ status }: CpuStatusIconProps) {
  const { Icon, className, ariaLabel } = statusConfig[status];
  return <Icon className={className} aria-label={ariaLabel} />;
}
