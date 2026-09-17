import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarIcon, FolderIcon, NotesIcon, XIcon } from "../components/icons";
import { formatDue, isOverdue } from "../lib/date";
import type { Folder, Task } from "../lib/types";

interface Props {
  task: Task;
  folders: Folder[];
  onSave: (notes: string) => Promise<void>;
  onClose: () => void;
}

type Status = "idle" | "saving" | "saved" | "error";

/** Pause in typing before a draft is written. */
const SAVE_DELAY_MS = 500;

/**
 * How long after this panel's own last write an incoming value is still
 * distrusted. A reload that started before the write committed can land after
 * it and would otherwise roll the text back under the cursor.
 */
const ADOPT_GRACE_MS = 1500;

/**
 * Right-hand sidebar for writing a task's notes. Mounted per task (App keys it
 * by id) and autosaves: a short pause in typing writes the draft, and closing
 * or switching tasks flushes whatever is still pending.
 */
export default function NotesPanel({ task, folders, onSave, onClose }: Props) {
  const [draft, setDraft] = useState(task.notes);
  const [status, setStatus] = useState<Status>("idle");
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Refs rather than state so the debounce timer and the unmount flush always
  // see current values without re-subscribing.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  /** What the database holds as far as this panel knows; null after a failed write, forcing a retry. */
  const savedRef = useRef<string | null>(task.notes);
  const timer = useRef<number | undefined>(undefined);
  const inFlight = useRef(0);
  const lastLocal = useRef(0);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;

    const value = draftRef.current;
    if (value === savedRef.current) {
      // Typed and then undone back to what's stored: nothing to write.
      if (inFlight.current === 0) setStatus((s) => (s === "saving" ? "saved" : s));
      return;
    }

    savedRef.current = value;
    inFlight.current++;
    onSaveRef
      .current(value)
      .then(() => {
        if (--inFlight.current === 0 && timer.current === undefined) {
          setStatus("saved");
        }
      })
      .catch((err) => {
        inFlight.current--;
        savedRef.current = null;
        console.error("Failed to save notes:", err);
        setStatus("error");
      })
      .finally(() => {
        lastLocal.current = Date.now();
      });
  }, []);

  // Closing the panel, switching tasks, or the task leaving the list all
  // unmount this component — none of them may drop unsaved text.
  useEffect(() => flush, [flush]);

  // Open with the caret at the end, ready to keep writing.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  // Pick up edits made elsewhere (a linked account on the shared database), but
  // only while this panel has nothing of its own pending — local typing wins.
  useEffect(() => {
    if (task.notes === savedRef.current) return;
    const idle =
      timer.current === undefined &&
      inFlight.current === 0 &&
      draftRef.current === savedRef.current &&
      Date.now() - lastLocal.current > ADOPT_GRACE_MS;
    if (!idle) return;
    savedRef.current = task.notes;
    setDraft(task.notes);
  }, [task.notes]);

  const change = (value: string) => {
    setDraft(value);
    draftRef.current = value;
    lastLocal.current = Date.now();
    setStatus("saving");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
  };

  const overdue = !task.completed && isOverdue(task.dueDate);
  const folderName =
    task.folderId === null
      ? null
      : (folders.find((f) => f.id === task.folderId)?.name ?? null);

  return (
    <aside
      aria-label="Task notes"
      // Escape is handled here, not on window, so it closes the notes without
      // also cancelling a task row that happens to be in edit mode.
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        onClose();
      }}
      className={[
        "slide-in-right flex w-80 shrink-0 flex-col border-l border-neutral-200/80 bg-white/50 xl:w-96 dark:border-neutral-800/80 dark:bg-neutral-900/40",
        // Below `lg` there isn't room beside the list, so the panel lifts out of
        // the row and overlays it from the right, like the folder drawer does.
        "max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:max-w-[calc(100%-3rem)]",
        "max-lg:bg-neutral-50 max-lg:shadow-xl max-lg:dark:bg-neutral-950",
      ].join(" ")}
    >
      <header className="flex items-center gap-2 px-4 pb-3 pt-6">
        <NotesIcon className="text-[16px] text-neutral-400" />
        <h2 className="text-[15px] font-semibold tracking-tight">Notes</h2>
        <button
          type="button"
          onClick={onClose}
          title="Close notes"
          className="ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[18px] text-neutral-500 transition-colors hover:bg-neutral-200/70 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
        >
          <XIcon />
        </button>
      </header>

      <div className="px-4 pb-3">
        <p
          className={[
            "line-clamp-3 break-words font-medium leading-snug tracking-tight",
            task.completed
              ? "text-neutral-400 line-through dark:text-neutral-500"
              : "text-neutral-800 dark:text-neutral-100",
          ].join(" ")}
        >
          {task.title}
        </p>
        {(task.dueDate || folderName) && (
          <p className="mt-1 flex items-center gap-2.5 text-xs font-medium">
            {task.dueDate && (
              <span
                className={[
                  "inline-flex shrink-0 items-center gap-1",
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
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
        <textarea
          ref={textRef}
          value={draft}
          onChange={(e) => change(e.target.value)}
          onBlur={flush}
          placeholder="Add details, links, or anything worth remembering…"
          className="surface tidy-scroll min-h-0 flex-1 resize-none rounded-xl px-3.5 py-3 text-[14px] leading-relaxed text-neutral-800 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-500 dark:text-neutral-100 dark:focus:border-neutral-400"
        />
        <p className="mt-2 flex items-center justify-between px-1 text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
          <span className={status === "error" ? "text-red-600 dark:text-red-400" : ""}>
            {status === "saving"
              ? "Saving…"
              : status === "saved"
                ? "Saved"
                : status === "error"
                  ? "Couldn't save — keep typing to retry"
                  : "Saves as you type"}
          </span>
          <span>Esc to close</span>
        </p>
      </div>
    </aside>
  );
}
