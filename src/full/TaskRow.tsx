import { useState } from "react";
import Calendar from "../components/Calendar";
import { CalendarIcon, CheckIcon, TrashIcon } from "../components/icons";
import { formatDue, isOverdue } from "../lib/date";
import type { Task } from "../lib/types";

interface Props {
  task: Task;
  onToggle: (completed: boolean) => void;
  onSave: (fields: { title: string; dueDate: string | null }) => void;
  onDelete: () => void;
}

export default function TaskRow({ task, onToggle, onSave, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [due, setDue] = useState<string | null>(task.dueDate);
  const [calOpen, setCalOpen] = useState(false);

  const beginEdit = () => {
    setTitle(task.title);
    setDue(task.dueDate);
    setEditing(true);
  };

  const commit = () => {
    const t = title.trim();
    if (!t) return;
    onSave({ title: t, dueDate: due });
    setEditing(false);
    setCalOpen(false);
  };

  const cancel = () => {
    setEditing(false);
    setCalOpen(false);
  };

  if (editing) {
    return (
      <li className="rounded-2xl border border-indigo-400/40 bg-white p-3.5 shadow-md shadow-indigo-500/10 ring-4 ring-indigo-500/10 dark:bg-neutral-800">
        <input
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
          className="w-full rounded-xl bg-black/[0.04] px-3 py-2 font-medium outline-none focus:ring-2 focus:ring-indigo-500/30 dark:bg-white/10"
        />
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setCalOpen((v) => !v)}
            className={[
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
              due
                ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"
                : "text-neutral-500 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10",
            ].join(" ")}
          >
            <CalendarIcon className="text-[15px]" />
            {due ? formatDue(due) : "No date"}
          </button>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={cancel}
              className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commit}
              className="rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 px-4 py-1.5 text-[13px] font-semibold text-white shadow-md shadow-indigo-500/25 transition-transform hover:-translate-y-px"
            >
              Save
            </button>
          </div>
        </div>
        {calOpen && (
          <div className="pop-in mt-2.5 max-w-[280px]">
            <Calendar
              value={due}
              onChange={(v) => {
                setDue(v);
                setCalOpen(false);
              }}
            />
          </div>
        )}
      </li>
    );
  }

  const overdue = !task.completed && isOverdue(task.dueDate);

  return (
    <li className="group flex items-center gap-3 rounded-2xl border border-black/5 bg-white/70 p-3.5 shadow-sm backdrop-blur transition-all hover:border-black/10 hover:shadow-md dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/[0.08]">
      <button
        type="button"
        onClick={() => onToggle(!task.completed)}
        title={task.completed ? "Mark active" : "Mark done"}
        className={[
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all",
          task.completed
            ? "border-transparent bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-sm shadow-indigo-500/30"
            : "border-black/20 text-transparent hover:border-indigo-400 dark:border-white/25",
        ].join(" ")}
      >
        <CheckIcon className="text-[13px]" strokeWidth={3} />
      </button>

      <button
        type="button"
        onClick={beginEdit}
        className="min-w-0 flex-1 text-left"
        title="Click to edit"
      >
        <span
          className={[
            "block truncate font-medium tracking-tight transition-colors",
            task.completed
              ? "text-neutral-400 line-through dark:text-neutral-500"
              : "text-neutral-800 dark:text-neutral-100",
          ].join(" ")}
        >
          {task.title}
        </span>
        {task.dueDate && (
          <span
            className={[
              "mt-0.5 inline-flex items-center gap-1 text-xs font-medium",
              overdue
                ? "text-rose-500"
                : "text-neutral-400 dark:text-neutral-500",
            ].join(" ")}
          >
            <CalendarIcon className="text-[12px]" />
            {formatDue(task.dueDate)}
            {overdue && " · overdue"}
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={onDelete}
        title="Delete task"
        className="shrink-0 rounded-lg p-2 text-neutral-400 opacity-0 transition-all hover:bg-rose-500/10 hover:text-rose-500 focus:opacity-100 group-hover:opacity-100"
      >
        <TrashIcon className="text-[16px]" />
      </button>
    </li>
  );
}
