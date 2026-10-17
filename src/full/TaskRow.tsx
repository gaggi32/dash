import { useEffect, useState } from "react";
import Calendar from "../components/Calendar";
import { FolderSelect, folderLabel } from "../components/FolderPicker";
import {
  CalendarIcon,
  CheckIcon,
  FolderIcon,
  NotesIcon,
  PaperclipIcon,
  TrashIcon,
} from "../components/icons";
import { formatDue, isOverdue } from "../lib/date";
import type { Folder, Task } from "../lib/types";

interface Props {
  task: Task;
  folders: Folder[];
  /** True while the list is in multi-select mode — swaps the row's click target to selection. */
  selectable: boolean;
  selected: boolean;
  onSelectToggle: (e: React.MouseEvent) => void;
  onToggle: (completed: boolean) => void;
  onSave: (fields: {
    title: string;
    dueDate: string | null;
    folderId: number | null;
  }) => void;
  onDelete: () => void;
  /** True while this task's notes are open in the sidebar. */
  notesOpen: boolean;
  onToggleNotes: () => void;
}

/** Which inline panel the editor has open below its controls, if any. */
type Panel = "date" | "folder" | null;

export default function TaskRow({
  task,
  folders,
  selectable,
  selected,
  onSelectToggle,
  onToggle,
  onSave,
  onDelete,
  notesOpen,
  onToggleNotes,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [due, setDue] = useState<string | null>(task.dueDate);
  const [folder, setFolder] = useState<number | null>(task.folderId);
  // Panels render inline rather than as popovers: the task list scrolls, and an
  // overlay would be clipped for rows near its bottom edge.
  const [panel, setPanel] = useState<Panel>(null);

  const beginEdit = () => {
    setTitle(task.title);
    setDue(task.dueDate);
    setFolder(task.folderId);
    setEditing(true);
  };

  const commit = () => {
    const t = title.trim();
    if (!t) return;
    onSave({ title: t, dueDate: due, folderId: folder });
    setEditing(false);
    setPanel(null);
  };

  const cancel = () => {
    setEditing(false);
    setPanel(null);
  };

  // Escape leaves edit mode from anywhere in the window, not just while the
  // title input holds focus — clicking the date button (or anywhere outside the
  // row) used to strand the row in edit mode with no keyboard way out. An open
  // panel swallows the first Escape so it can close on its own.
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (panel) setPanel(null);
      else cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, panel]);

  const toggle = (next: Panel) => setPanel((p) => (p === next ? null : next));

  // First non-blank line, shown as a one-line preview under the title.
  const notePreview = task.notes.trim().split("\n", 1)[0];

  if (editing) {
    return (
      <li className="surface rounded-xl border-neutral-400/80 p-3.5 ring-neutral-900/5 dark:border-neutral-500/60">
        <input
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
          className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 font-medium outline-none transition-colors focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:focus:border-neutral-400"
        />
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => toggle("date")}
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

          <button
            type="button"
            onClick={() => toggle("folder")}
            className={[
              "inline-flex max-w-[160px] items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
              folder !== null
                ? "accent-soft"
                : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800",
            ].join(" ")}
          >
            <FolderIcon className="shrink-0 text-[15px]" />
            <span className="truncate">{folderLabel(folders, folder)}</span>
          </button>

          {/* Notes save on their own as they're typed, so this opens the
              sidebar without touching the pending title/date/folder edit. */}
          <button
            type="button"
            onClick={onToggleNotes}
            className={[
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
              notePreview || notesOpen
                ? "accent-soft"
                : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800",
            ].join(" ")}
          >
            <NotesIcon className="text-[15px]" />
            {notePreview ? "Notes" : "Add notes"}
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

        {panel === "date" && (
          <div className="pop-in mt-2.5 max-w-[280px]">
            <Calendar
              value={due}
              onChange={(v) => {
                setDue(v);
                setPanel(null);
              }}
            />
          </div>
        )}

        {panel === "folder" && (
          <div className="pop-in mt-2.5 max-w-[280px]">
            <FolderSelect
              folders={folders}
              value={folder}
              onChange={(id) => {
                setFolder(id);
                setPanel(null);
              }}
            />
          </div>
        )}
      </li>
    );
  }

  const overdue = !task.completed && isOverdue(task.dueDate);
  const folderName =
    task.folderId === null
      ? null
      : (folders.find((f) => f.id === task.folderId)?.name ?? null);

  return (
    <li
      className={[
        "surface group flex items-center gap-3 rounded-xl p-3.5 transition-colors",
        notesOpen
          ? "border-neutral-400/80 dark:border-neutral-500/60"
          : "hover:border-neutral-400/70 dark:hover:border-neutral-500/50",
      ].join(" ")}
    >
      {selectable && (
        <button
          type="button"
          onClick={onSelectToggle}
          title={selected ? "Deselect" : "Select"}
          className={[
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
            selected
              ? "accent border-transparent"
              : "border-neutral-300 text-transparent hover:border-neutral-500 dark:border-neutral-600 dark:hover:border-neutral-400",
          ].join(" ")}
        >
          <CheckIcon className="text-[13px]" strokeWidth={3} />
        </button>
      )}

      <button
        type="button"
        onClick={() => onToggle(!task.completed)}
        title={task.completed ? "Mark active" : "Mark done"}
        className={[
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          task.completed
            ? "accent border-transparent"
            : "border-neutral-300 text-transparent hover:border-neutral-500 dark:border-neutral-600 dark:hover:border-neutral-400",
        ].join(" ")}
      >
        <CheckIcon className="text-[13px]" strokeWidth={3} />
      </button>

      <button
        type="button"
        onClick={(e) => (selectable ? onSelectToggle(e) : beginEdit())}
        className="min-w-0 flex-1 text-left"
        title={selectable ? "Click to select" : "Click to edit"}
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
        {(task.dueDate || folderName || notePreview || task.attachments.length > 0) && (
          <span className="mt-0.5 flex items-center gap-2.5 text-xs font-medium">
            {task.dueDate && (
              <span
                className={[
                  "inline-flex items-center gap-1",
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
            {folderName && (
              <span className="inline-flex min-w-0 items-center gap-1 text-neutral-400 dark:text-neutral-500">
                <FolderIcon className="shrink-0 text-[12px]" />
                <span className="truncate">{folderName}</span>
              </span>
            )}
            {notePreview && (
              <span className="inline-flex min-w-0 items-center gap-1 text-neutral-400 dark:text-neutral-500">
                <NotesIcon className="shrink-0 text-[12px]" />
                <span className="truncate">{notePreview}</span>
              </span>
            )}
            {task.attachments.length > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1 text-neutral-400 dark:text-neutral-500">
                <PaperclipIcon className="text-[12px]" />
                {task.attachments.length}
              </span>
            )}
          </span>
        )}
      </button>

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={onToggleNotes}
          title={notesOpen ? "Close notes" : notePreview ? "Open notes" : "Add notes"}
          aria-pressed={notesOpen}
          className={[
            "rounded-md p-2 transition-colors",
            notesOpen
              ? "accent-soft"
              : "text-neutral-400 opacity-0 hover:bg-neutral-100 hover:text-neutral-900 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-neutral-800 dark:hover:text-neutral-100",
          ].join(" ")}
        >
          <NotesIcon className="text-[16px]" />
        </button>

        <button
          type="button"
          onClick={onDelete}
          title="Delete task"
          className="rounded-md p-2 text-neutral-400 opacity-0 transition-colors hover:bg-neutral-100 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-neutral-800 dark:hover:text-red-400"
        >
          <TrashIcon className="text-[16px]" />
        </button>
      </div>
    </li>
  );
}
