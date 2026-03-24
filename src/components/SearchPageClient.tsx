"use client";

import { useRouter } from "next/navigation";
import MotherboardTable from "./MotherboardTable";

export default function SearchPageClient() {
  const router = useRouter();

  return (
    <MotherboardTable
      selectedBoardId={null}
      onSelectBoard={(id) => router.push(`/check?board=${id}`)}
    />
  );
}
