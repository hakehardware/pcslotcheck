"use client";

import type { DataManifest } from "../lib/types";
import BoardCardContent from "./BoardCardContent";

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
            <BoardCardContent
              manufacturer={board.manufacturer}
              model={board.model}
              chipset={board.chipset}
              socket={board.socket}
              formFactor={board.form_factor}
            />
          </button>
        );
      })}
    </div>
  );
}
