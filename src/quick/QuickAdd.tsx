import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  currentMonitor,
  getCurrentWindow,
  LogicalSize,
  PhysicalPosition,
} from "@tauri-apps/api/window";
import {
  AttachmentBar,
  fileIntakeProps,
  useAttachmentDraft,
} from "../components/Attachments";
import Calendar from "../components/Calendar";
import { FolderSelect, folderLabel } from "../components/FolderPicker";
import {
  CalendarIcon,
  FolderIcon,
  HomeIcon,
  ArrowRightIcon,
  CheckIcon,
  NotesIcon,
} from "../components/icons";
import { createTask, listFolders, reopen } from "../lib/db";
import { onDbChanged, onTasksChanged } from "../lib/events";
import { formatDue } from "../lib/date";
import type { Folder } from "../lib/types";

/** Which inline panel is open below the composer, if any. */
type Panel = "date" | "folder" | null;

// Collapsed size must match the `quick` window in tauri.conf.json so the first
// paint isn't resized. The others are tall enough for the panel they open.
const COMPACT = new LogicalSize(460, 168);

function sizeFor(panel: Panel, notesOpen: boolean): LogicalSize {
  let h = 168;
  if (panel === "date") h = 476;
  else if (panel === "folder") h = 396;
  // Notes box plus the attach row beneath it.
  if (notesOpen) h += 124;
  return new LogicalSize(460, h);
}

export default function QuickAdd() {
  const win = getCurrentWindow();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<string | null>(null);
  const [folder, setFolder] = useState<number | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [panel, setPanel] = useState<Panel>(null);
  const [notes, setNotes] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const files = useAttachmentDraft();
  // Bumped each time the window is shown so the liquid entrance replays.
  const [appear, setAppear] = useState(0);
  // Bumped on each save to flash a brief "Added ✓" confirmation.
  const [added, setAdded] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // Original top edge, remembered only when expanding had to lift the window
  // off the bottom of the screen so collapsing can put it back.
  const liftedFrom = useRef<number | null>(null);

  const focusInput = () =>
    requestAnimationFrame(() => inputRef.current?.focus());

  const loadFolders = useCallback(() => {
    listFolders()
      .then(setFolders)
      .catch((err) => console.error("Failed to load folders:", err));
  }, []);

  const reset = useCallback(() => {
    setTitle("");
    setDue(null);
    setFolder(null);
    setPanel(null);
    setNotes("");
    setNotesOpen(false);
    // Files the user attached but never saved a task for shouldn't pile up.
    files.reset(true);
  }, [files.reset]);

  const hide = useCallback(async () => {
    setPanel(null);
    await win.setSize(COMPACT);
    await win.hide();
  }, [win]);

  // Auto-focus on first mount.
  useEffect(() => {
    focusInput();
    loadFolders();
  }, [loadFolders]);

  // Rust emits `quick-focus` each time it shows the window via the hotkey/tray.
  // Reset the form, replay the entrance animation, and refocus the input.
  useEffect(() => {
    const un = listen("quick-focus", () => {
      reset();
      loadFolders();
      setAppear((n) => n + 1);
      focusInput();
    });
    return () => {
      un.then((f) => f());
    };
  }, [reset, loadFolders]);

  // Folders created in the main window should show up here too.
  useEffect(() => {
    const un = onTasksChanged(loadFolders);
    return () => {
      un.then((f) => f());
    };
  }, [loadFolders]);

  // Account linking toggled: this window's handle points at the old file.
  useEffect(() => {
    const un = onDbChanged(() => {
      reopen();
      setFolder(null);
      loadFolders();
    });
    return () => {
      un.then((f) => f());
    };
  }, [loadFolders]);

  // Escape closes an open panel first, then hides the window (never quits).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (panel) setPanel(null);
      else void hide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hide, panel]);

  // Grow/shrink the window to fit the open panel. The window is anchored by its
  // top-left corner, so resizing alone unfolds the panel downwards; re-centring
  // afterwards (as this used to) grew it up and down at once and made the whole
  // panel jump. The position is only touched when the taller panel would run off
  // the bottom of the screen — then it lifts just enough to fit, and drops back
  // to where it was once the panel closes.
  useEffect(() => {
    void (async () => {
      const size = sizeFor(panel, notesOpen);

      if (panel || notesOpen) {
        const pos = await win.outerPosition();
        await win.setSize(size);
        const mon = await currentMonitor();
        if (!mon) return;
        const workTop = mon.workArea.position.y;
        const workBottom = workTop + mon.workArea.size.height;
        const overflow = pos.y + size.height * mon.scaleFactor - workBottom;
        if (overflow > 0) {
          if (liftedFrom.current === null) liftedFrom.current = pos.y;
          const y = Math.max(workTop, pos.y - Math.ceil(overflow));
          await win.setPosition(new PhysicalPosition(pos.x, y));
        }
        return;
      }

      await win.setSize(size);
      const y = liftedFrom.current;
      if (y === null) return;
      liftedFrom.current = null;
      const pos = await win.outerPosition();
      await win.setPosition(new PhysicalPosition(pos.x, y));
    })();
  }, [panel, notesOpen, win]);

  // Hide the confirmation again a moment after it appears.
  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(0), 1200);
    return () => clearTimeout(t);
  }, [added]);

  const send = useCallback(async () => {
    const t = title.trim();
    if (!t) {
      focusInput();
      return;
    }
    try {
      await createTask({
        title: t,
        dueDate: due,
        folderId: folder,
        notes: notes.trim(),
        attachments: files.items,
      });
    } catch (err) {
      console.error("Failed to save task:", err);
      return;
    }
    // Keep the window open so several tasks can be captured in a row; just
    // clear the form, confirm the save, and refocus. Esc / click-away dismiss.
    // The folder sticks so a run of tasks all land in the same place.
    setTitle("");
    setDue(null);
    setPanel(null);
    setNotes("");
    setNotesOpen(false);
    files.reset(false);
    setAdded((n) => n + 1);
    focusInput();
  }, [title, due, folder, notes, files.items, files.reset]);

  const goHome = useCallback(async () => {
    await invoke("open_main");
    await hide();
  }, [hide]);

  const toggle = (next: Panel) => setPanel((p) => (p === next ? null : next));

  return (
    <div className="flex h-screen w-screen items-start justify-center p-2.5">
      <div
        key={appear}
        className="liquid-in w-full overflow-hidden rounded-[24px] border border-white/60 bg-white/80 shadow-[0_24px_60px_-12px_rgba(23,23,23,0.30)] ring-1 ring-black/5 backdrop-blur-2xl dark:border-white/10 dark:bg-neutral-900/75 dark:ring-white/5"
      >
        {/* Subtle top sheen so the glass reads as a real surface. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/20" />

        <form
          className="rise-in relative p-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          {...fileIntakeProps((f) => {
            setNotesOpen(true);
            void files.add(f);
          })}
        >
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing?"
            autoFocus
            className="w-full rounded-2xl border border-black/5 bg-black/[0.035] px-4 py-3 text-[15px] font-medium tracking-tight text-neutral-900 outline-none transition-all placeholder:font-normal placeholder:text-neutral-400 focus:border-neutral-400/50 focus:bg-white focus:ring-4 focus:ring-neutral-900/[0.06] dark:border-white/5 dark:bg-white/[0.06] dark:text-neutral-50 dark:focus:bg-white/[0.09] dark:focus:ring-white/10"
          />

          <div className="mt-2.5 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => toggle("date")}
              className={[
                "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-all",
                due
                  ? "bg-neutral-900/[0.06] text-neutral-700 ring-1 ring-neutral-900/10 dark:bg-white/10 dark:text-neutral-200 dark:ring-white/15"
                  : "text-neutral-500 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10",
              ].join(" ")}
            >
              <CalendarIcon className="text-[15px]" />
              {due ? formatDue(due) : "Add date"}
            </button>

            <button
              type="button"
              onClick={() => toggle("folder")}
              className={[
                "inline-flex max-w-[130px] items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-all",
                folder !== null
                  ? "bg-neutral-900/[0.06] text-neutral-700 ring-1 ring-neutral-900/10 dark:bg-white/10 dark:text-neutral-200 dark:ring-white/15"
                  : "text-neutral-500 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10",
              ].join(" ")}
            >
              <FolderIcon className="shrink-0 text-[15px]" />
              <span className="truncate">
                {folder === null ? "Folder" : folderLabel(folders, folder)}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setNotesOpen((v) => !v)}
              className={[
                "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-all",
                notesOpen || notes.trim() || files.items.length > 0
                  ? "bg-neutral-900/[0.06] text-neutral-700 ring-1 ring-neutral-900/10 dark:bg-white/10 dark:text-neutral-200 dark:ring-white/15"
                  : "text-neutral-500 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10",
              ].join(" ")}
            >
              <NotesIcon className="text-[15px]" />
              Notes
            </button>

            {added > 0 && (
              <span
                key={added}
                className="confirm-pop inline-flex items-center gap-1 text-[13px] font-medium text-emerald-600 dark:text-emerald-400"
              >
                <CheckIcon className="text-[14px]" strokeWidth={2.5} />
                Added
              </span>
            )}

            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void goHome()}
                title="Open full app"
                className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[13px] font-medium text-neutral-500 transition-colors hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10"
              >
                <HomeIcon className="text-[15px]" />
              </button>
              <button
                type="submit"
                disabled={!title.trim() || files.busy}
                className="group inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-neutral-700 to-neutral-900 px-4 py-2 text-[13px] font-semibold text-white shadow-lg shadow-neutral-900/25 transition-all hover:shadow-neutral-900/40 enabled:hover:-translate-y-px disabled:from-neutral-300 disabled:to-neutral-300 disabled:text-neutral-500 disabled:shadow-none dark:from-neutral-500 dark:to-neutral-700 dark:shadow-black/40 dark:disabled:from-white/10 dark:disabled:to-white/10 dark:disabled:text-neutral-500"
              >
                Add
                <ArrowRightIcon className="text-[15px] transition-transform group-enabled:group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>

          {notesOpen && (
            <>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes..."
                className="mt-2.5 w-full resize-none rounded-xl border border-black/5 bg-black/[0.035] px-4 py-3 text-[14px] text-neutral-900 outline-none transition-all placeholder:text-neutral-400 focus:border-neutral-400/50 focus:bg-white focus:ring-4 focus:ring-neutral-900/[0.06] dark:border-white/5 dark:bg-white/[0.06] dark:text-neutral-50 dark:focus:bg-white/[0.09] dark:focus:ring-white/10"
                rows={3}
              />
              <AttachmentBar
                className="mt-2"
                items={files.items}
                busy={files.busy}
                error={files.error}
                onFiles={(f) => void files.add(f)}
                onRemove={files.remove}
                holdQuick
              />
            </>
          )}

          {panel === "date" && (
            <div className="pop-in mt-2.5">
              <Calendar
                value={due}
                onChange={(v) => {
                  setDue(v);
                  setPanel(null);
                  focusInput();
                }}
              />
            </div>
          )}

          {panel === "folder" && (
            <div className="pop-in mt-2.5">
              <FolderSelect
                folders={folders}
                value={folder}
                onChange={(id) => {
                  setFolder(id);
                  setPanel(null);
                  focusInput();
                }}
              />
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
