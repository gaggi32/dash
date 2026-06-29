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
        className="flex items-center gap-2 rounded-2xl border border-black/5 bg-white/70 p-2 pl-3.5 shadow-sm backdrop-blur transition-colors focus-within:border-indigo-400/40 focus-within:ring-4 focus-within:ring-indigo-500/10 dark:border-white/10 dark:bg-white/5"
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
            "inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-all",
            due
              ? "bg-indigo-500/10 text-indigo-600 ring-1 ring-indigo-500/20 dark:bg-indigo-400/15 dark:text-indigo-300"
              : "text-neutral-500 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10",
          ].join(" ")}
        >
          <CalendarIcon className="text-[15px]" />
          <span className="hidden sm:inline">{due ? formatDue(due) : "Date"}</span>
        </button>

        <button
          type="submit"
          disabled={!title.trim()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 px-4 py-2 text-[13px] font-semibold text-white shadow-md shadow-indigo-500/25 transition-all enabled:hover:-translate-y-px disabled:from-neutral-300 disabled:to-neutral-300 disabled:text-neutral-500 disabled:shadow-none dark:disabled:from-white/10 dark:disabled:to-white/10 dark:disabled:text-neutral-500"
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
