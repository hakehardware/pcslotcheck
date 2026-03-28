import { IoInformationCircleOutline } from "react-icons/io5";

export default function DataDisclaimer() {
  return (
    <div
      role="note"
      className="border border-zinc-700 bg-zinc-800/50 rounded-lg px-4 py-3 text-zinc-400 text-sm"
    >
      <IoInformationCircleOutline
        className="mr-1.5 inline-block align-text-bottom text-base"
        aria-hidden="true"
      />
      PCSlotCheck data is community-contributed and may not be 100% accurate.
      Always cross-reference with your motherboard manual or manufacturer
      specifications.
    </div>
  );
}
