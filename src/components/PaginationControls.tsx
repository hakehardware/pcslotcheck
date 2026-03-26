"use client";

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  totalCount: number;
  entityLabel: string;
  onPageChange: (page: number) => void;
}

export default function PaginationControls({
  page,
  totalPages,
  totalCount,
  entityLabel,
  onPageChange,
}: PaginationControlsProps) {
  const plural = totalCount !== 1 ? `${entityLabel}s` : entityLabel;

  return (
    <div className="flex items-center justify-between border-t border-zinc-800 pt-3 text-sm text-zinc-400">
      <span>
        {totalCount} {plural} found
      </span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded border border-zinc-700 px-3 py-1 text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="rounded border border-zinc-700 px-3 py-1 text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
