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
const COMPACT = new LogicalSize(440, 168);
const EXPANDED = new LogicalSize(440, 476);

export default function QuickAdd() {
  const win = getCurrentWindow();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<string | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  // Bumped each time the window is shown so the liquid entrance replays.
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
    <div className="flex h-screen w-screen items-start justify-center p-2.5">
      <div
        key={appear}
        className="liquid-in w-full overflow-hidden rounded-[24px] border border-white/60 bg-white/80 shadow-[0_24px_60px_-12px_rgba(31,38,135,0.35)] ring-1 ring-black/5 backdrop-blur-2xl dark:border-white/10 dark:bg-neutral-900/75 dark:ring-white/5"
      >
        {/* Subtle top sheen so the glass reads as a real surface. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/20" />

        <form
          className="rise-in relative p-3.5"
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
            className="w-full rounded-2xl border border-black/5 bg-black/[0.035] px-4 py-3 text-[15px] font-medium tracking-tight text-neutral-900 outline-none transition-all placeholder:font-normal placeholder:text-neutral-400 focus:border-indigo-400/40 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-white/5 dark:bg-white/[0.06] dark:text-neutral-50 dark:focus:bg-white/[0.09] dark:focus:ring-indigo-400/15"
          />

          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCalOpen((v) => !v)}
              className={[
                "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-all",
                due
                  ? "bg-indigo-500/10 text-indigo-600 ring-1 ring-indigo-500/20 dark:bg-indigo-400/15 dark:text-indigo-300"
                  : "text-neutral-500 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10",
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
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium text-neutral-500 transition-colors hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10"
              >
                <HomeIcon className="text-[15px]" />
                Home
              </button>
              <button
                type="submit"
                disabled={!title.trim()}
                className="group inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 px-4 py-2 text-[13px] font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40 enabled:hover:-translate-y-px disabled:from-neutral-300 disabled:to-neutral-300 disabled:text-neutral-500 disabled:shadow-none dark:disabled:from-white/10 dark:disabled:to-white/10 dark:disabled:text-neutral-500"
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
