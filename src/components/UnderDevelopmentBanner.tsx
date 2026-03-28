import { IoConstruct } from "react-icons/io5";

export default function UnderDevelopmentBanner() {
  return (
    <div
      role="status"
      className="bg-amber-600/90 py-1.5 text-center text-sm text-white"
    >
      <IoConstruct className="mr-1.5 inline-block" aria-hidden="true" />
      PCSlotCheck is under active development — data may be incomplete.
    </div>
  );
}
