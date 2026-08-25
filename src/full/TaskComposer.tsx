import { useCallback, useEffect, useRef, useState } from "react";
import Calendar from "../components/Calendar";
import FolderPicker from "../components/FolderPicker";
import { CalendarIcon, PlusIcon } from "../components/icons";
import { createTask } from "../lib/db";
import { formatDue } from "../lib/date";
import type { Folder, FolderScope } from "../lib/types";

interface Props {
  folders: Folder[];
  /** The sidebar selection, which seeds the folder a new task lands in. */
  scope: FolderScope;
}

/**
 * Inline "add a task" composer for the full window, so tasks can be created
 * from home without opening the quick-add overlay. Writes go through the same
 * `createTask`, which broadcasts `tasks-changed`, so the list refreshes itself.
 */
export default function TaskComposer({ folders, scope }: Props) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<string | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  // Explicit folder choice for this one task. Null means "follow the sidebar",
  // so switching folders re-targets the composer without extra clicks.
  const [folder, setFolder] = useState<number | null>(null);
  const [folderTouched, setFolderTouched] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scopeFolder = typeof scope === "number" ? scope : null;
  const target = folderTouched ? folder : scopeFolder;

  // A new sidebar selection overrides a stale per-task override.
  useEffect(() => {
    setFolderTouched(false);
    setFolder(null);
  }, [scope]);

  // Close the date popover on outside click / Escape.
  useEffect(() => {
    if (!calOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setCalOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCalOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [calOpen]);

  const add = useCallback(async () => {
    const t = title.trim();
    if (!t) {
      inputRef.current?.focus();
      return;
    }
    try {
      await createTask({ title: t, dueDate: due, folderId: target });
    } catch (err) {
      console.error("Failed to save task:", err);
      return;
    }
    setTitle("");
    setDue(null);
    setCalOpen(false);
    inputRef.current?.focus();
  }, [title, due, target]);

  // `.surface` sets backdrop-blur, which makes the form its own stacking
  // context — the folder popover nested inside it can't out-stack the task
  // list on its own, so the whole composer is lifted above the list instead.
  return (
    <div ref={wrapRef} className="relative z-20">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
        className="surface flex items-center gap-2 rounded-xl p-2 pl-3.5 transition-colors focus-within:border-neutral-500 dark:focus-within:border-neutral-400"
      >
        <PlusIcon className="shrink-0 text-[18px] text-neutral-400" />
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task…"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] font-medium tracking-tight text-neutral-900 outline-none placeholder:font-normal placeholder:text-neutral-400 dark:text-neutral-50"
        />

        <FolderPicker
          folders={folders}
          value={target}
          onChange={(id) => {
            setFolder(id);
            setFolderTouched(true);
          }}
        />

        <button
          type="button"
          onClick={() => setCalOpen((v) => !v)}
          className={[
            "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
            due
              ? "accent-soft"
              : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800",
          ].join(" ")}
        >
          <CalendarIcon className="text-[15px]" />
          <span className="hidden sm:inline">{due ? formatDue(due) : "Date"}</span>
        </button>

        <button
          type="submit"
          disabled={!title.trim()}
          className="accent accent-hover inline-flex shrink-0 items-center gap-1.5 rounded-md px-4 py-2 text-[13px] font-medium transition-colors disabled:from-neutral-200 disabled:to-neutral-200 disabled:text-neutral-400 disabled:shadow-none disabled:ring-0 dark:disabled:from-neutral-800 dark:disabled:to-neutral-800 dark:disabled:text-neutral-600"
        >
          Add
        </button>
      </form>

      {calOpen && (
        <div className="pop-in absolute right-0 z-20 mt-2 w-[280px]">
          <Calendar
            value={due}
            onChange={(v) => {
              setDue(v);
              setCalOpen(false);
              inputRef.current?.focus();
            }}
          />
        </div>
      )}
    </div>
  );
}
