"use client";

import type { DataManifest } from "../lib/types";

interface BoardSelectorProps {
  boards: DataManifest["motherboards"];
  selectedBoardId: string | null;
  onSelectBoard: (boardId: string) => void;
}

export default function BoardSelector({
  boards,
  selectedBoardId,
  onSelectBoard,
}: BoardSelectorProps) {
  return (
    <div role="tablist" aria-label="Motherboard selection" className="flex flex-wrap gap-2">
      {boards.map((board) => {
        const isSelected = board.id === selectedBoardId;
        return (
          <button
            key={board.id}
            role="tab"
            type="button"
            aria-selected={isSelected}
            tabIndex={0}
            onClick={() => onSelectBoard(board.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectBoard(board.id);
              }
            }}
            className={`rounded-lg border px-4 py-3 text-left transition-colors outline-none ${
              isSelected
                ? "border-blue-500 bg-zinc-800 ring-1 ring-blue-500"
                : "border-zinc-700 bg-zinc-900 hover:border-zinc-500 hover:bg-zinc-800"
            } focus:border-blue-500 focus:ring-1 focus:ring-blue-500`}
          >
            <div className="text-sm font-semibold text-zinc-100">
              {board.manufacturer} {board.model}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-400">
              <span>{board.chipset}</span>
              <span>{board.socket}</span>
              <span>{board.form_factor}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
