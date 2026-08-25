import { useEffect, useRef, useState } from "react";
import { FolderSelect } from "../components/FolderPicker";
import { CheckCheckIcon, FolderIcon, XIcon } from "../components/icons";
import type { Folder } from "../lib/types";

interface Props {
  count: number;
  total: number;
  folders: Folder[];
  onMove: (folderId: number | null) => void;
  onSelectAll: () => void;
  onClear: () => void;
}

/** Contextual bar shown while selection mode is active, for bulk re-filing. */
export default function SelectionBar({
  count,
  total,
  folders,
  onMove,
  onSelectAll,
  onClear,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    // Lifted above the task list for the same reason as the composer, but a
    // step below it so the composer's popovers still clear this bar.
    <div className="surface relative z-10 mb-3 flex items-center gap-3 rounded-xl px-4 py-2.5">
      <span className="text-[13px] font-medium text-neutral-600 dark:text-neutral-300">
        {count > 0 ? `${count} selected` : "Select tasks"}
      </span>

      {count < total && (
        <button
          type="button"
          onClick={onSelectAll}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-neutral-200/70 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
        >
          <CheckCheckIcon className="text-[15px]" />
          Select all
        </button>
      )}

      {count > 0 && (
        <div ref={ref} className="relative ml-auto">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="accent accent-hover inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors"
          >
            <FolderIcon className="text-[15px]" />
            Move to folder
          </button>

          {open && (
            <div className="pop-in absolute right-0 z-30 mt-1.5 w-[200px]">
              <FolderSelect
                folders={folders}
                value={undefined}
                onChange={(id) => {
                  onMove(id);
                  setOpen(false);
                }}
              />
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onClear}
        title={count > 0 ? "Clear selection" : "Cancel selection"}
        className={[
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-200/70 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100",
          count === 0 ? "ml-auto" : "",
        ].join(" ")}
      >
        <XIcon className="text-[15px]" />
      </button>
    </div>
  );
}
