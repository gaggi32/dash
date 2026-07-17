import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import Calendar from "../components/Calendar";
import {
  CalendarIcon,
  HomeIcon,
  ArrowRightIcon,
  CheckIcon,
} from "../components/icons";
import { createTask } from "../lib/db";
import { formatDue } from "../lib/date";

// Default (collapsed) and expanded sizes. Must match the `quick` window size in
// tauri.conf.json so the first paint isn't resized. Expanded fits the calendar.
// The window is transparent and sized to the card *plus* the `p-7` margin around
// it, so the card's drop shadow has room to fall off instead of being clipped
// hard at the window edge.
const COMPACT = new LogicalSize(440, 204);
const EXPANDED = new LogicalSize(440, 512);

export default function QuickAdd() {
  const win = getCurrentWindow();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<string | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  // Bumped each time the window is shown so the entrance fade replays.
  const [appear, setAppear] = useState(0);
  // Bumped on each save to flash a brief "Added ✓" confirmation.
  const [added, setAdded] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const focusInput = () =>
    requestAnimationFrame(() => inputRef.current?.focus());

  const reset = useCallback(() => {
    setTitle("");
    setDue(null);
    setCalOpen(false);
  }, []);

  const hide = useCallback(async () => {
    setCalOpen(false);
    await win.setSize(COMPACT);
    await win.hide();
  }, [win]);

  // Auto-focus on first mount.
  useEffect(() => {
    focusInput();
  }, []);

  // Rust emits `quick-focus` each time it shows the window via the hotkey/tray.
  // Reset the form, replay the entrance animation, and refocus the input.
  useEffect(() => {
    const un = listen("quick-focus", () => {
      reset();
      setAppear((n) => n + 1);
      focusInput();
    });
    return () => {
      un.then((f) => f());
    };
  }, [reset]);

  // Escape hides the window (does not quit the app).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        void hide();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hide]);

  // Grow/shrink the window to fit the calendar, then re-center.
  useEffect(() => {
    void (async () => {
      await win.setSize(calOpen ? EXPANDED : COMPACT);
      await win.center();
    })();
  }, [calOpen, win]);

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
      await createTask({ title: t, dueDate: due });
    } catch (err) {
      console.error("Failed to save task:", err);
      return;
    }
    // Keep the window open so several tasks can be captured in a row; just
    // clear the form, confirm the save, and refocus. Esc / click-away dismiss.
    reset();
    setAdded((n) => n + 1);
    focusInput();
  }, [title, due, reset]);

  const goHome = useCallback(async () => {
    await invoke("open_main");
    await hide();
  }, [hide]);

  return (
    <div className="flex h-screen w-screen items-start justify-center p-7">
      <div
        key={appear}
        className="appear surface w-full overflow-hidden rounded-2xl bg-gradient-to-b from-white to-blue-50/70 shadow-xl shadow-neutral-950/10 backdrop-blur-md dark:from-neutral-900 dark:to-blue-950/50 dark:shadow-black/40"
      >
        <form
          className="relative p-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing?"
            autoFocus
            className="w-full rounded-lg border border-neutral-200 bg-white/70 px-4 py-3 text-[15px] font-medium tracking-tight text-neutral-900 outline-none ring-1 ring-inset ring-white/60 transition-colors placeholder:font-normal placeholder:text-neutral-400 focus:border-blue-500 focus:bg-white focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-800/70 dark:text-neutral-50 dark:ring-white/5 dark:focus:border-blue-500"
          />

          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCalOpen((v) => !v)}
              className={[
                "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
                due
                  ? "accent-soft"
                  : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800",
              ].join(" ")}
            >
              <CalendarIcon className="text-[15px]" />
              {due ? formatDue(due) : "Add date"}
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
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
              >
                <HomeIcon className="text-[15px]" />
                Home
              </button>
              <button
                type="submit"
                disabled={!title.trim()}
                className="accent accent-hover group inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[13px] font-medium transition-colors disabled:from-neutral-200 disabled:to-neutral-200 disabled:text-neutral-400 disabled:shadow-none disabled:ring-0 dark:disabled:from-neutral-800 dark:disabled:to-neutral-800 dark:disabled:text-neutral-600"
              >
                Add
                <ArrowRightIcon className="text-[15px] transition-transform group-enabled:group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>

          {calOpen && (
            <div className="pop-in mt-2.5">
              <Calendar
                value={due}
                onChange={(v) => {
                  setDue(v);
                  setCalOpen(false);
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
