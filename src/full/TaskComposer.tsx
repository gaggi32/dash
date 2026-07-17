import { useCallback, useEffect, useRef, useState } from "react";
import Calendar from "../components/Calendar";
import { CalendarIcon, PlusIcon } from "../components/icons";
import { createTask } from "../lib/db";
import { formatDue } from "../lib/date";

/**
 * Inline "add a task" composer for the full window, so tasks can be created
 * from home without opening the quick-add overlay. Writes go through the same
 * `createTask`, which broadcasts `tasks-changed`, so the list refreshes itself.
 */
export default function TaskComposer() {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<string | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      await createTask({ title: t, dueDate: due });
    } catch (err) {
      console.error("Failed to save task:", err);
      return;
    }
    setTitle("");
    setDue(null);
    setCalOpen(false);
    inputRef.current?.focus();
  }, [title, due]);

  return (
    <div ref={wrapRef} className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
        className="surface flex items-center gap-2 rounded-xl p-2 pl-3.5 transition-colors focus-within:border-blue-500 dark:focus-within:border-blue-500"
      >
        <PlusIcon className="shrink-0 text-[18px] text-neutral-400" />
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task…"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] font-medium tracking-tight text-neutral-900 outline-none placeholder:font-normal placeholder:text-neutral-400 dark:text-neutral-50"
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
