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
      <li className="surface rounded-xl border-blue-400/70 p-3.5 ring-blue-500/10 dark:border-blue-500/50">
        <input
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
          className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 font-medium outline-none transition-colors focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:focus:border-blue-500"
        />
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setCalOpen((v) => !v)}
            className={[
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
              due
                ? "accent-soft"
                : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800",
            ].join(" ")}
          >
            <CalendarIcon className="text-[15px]" />
            {due ? formatDue(due) : "No date"}
          </button>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={cancel}
              className="rounded-md px-3 py-1.5 text-[13px] font-medium text-neutral-500 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commit}
              className="accent accent-hover rounded-md px-4 py-1.5 text-[13px] font-medium transition-colors"
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
    <li className="surface group flex items-center gap-3 rounded-xl p-3.5 transition-colors hover:border-blue-400/60 dark:hover:border-blue-500/40">
      <button
        type="button"
        onClick={() => onToggle(!task.completed)}
        title={task.completed ? "Mark active" : "Mark done"}
        className={[
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          task.completed
            ? "accent border-transparent"
            : "border-neutral-300 text-transparent hover:border-blue-500 dark:border-neutral-600 dark:hover:border-blue-500",
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
                ? "text-red-600 dark:text-red-400"
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
        className="shrink-0 rounded-md p-2 text-neutral-400 opacity-0 transition-colors hover:bg-neutral-100 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-neutral-800 dark:hover:text-red-400"
      >
        <TrashIcon className="text-[16px]" />
      </button>
    </li>
  );
}
