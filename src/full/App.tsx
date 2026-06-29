import { useCallback, useEffect, useState } from "react";
import { deleteTask, listTasks, setCompleted, updateTask } from "../lib/db";
import { onTasksChanged } from "../lib/events";
import { applySavedHotkey } from "../lib/shortcut";
import type { Filter, SortKey, Task } from "../lib/types";
import { ChevronLeft, SettingsIcon } from "../components/icons";
import Settings from "./Settings";
import SortMenu from "./SortMenu";
import TaskComposer from "./TaskComposer";
import TaskRow from "./TaskRow";

type View = "home" | "settings";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Done" },
];

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortKey>("created");
  const [view, setView] = useState<View>("home");

  const reload = useCallback(() => {
    listTasks(filter, sort)
      .then(setTasks)
      .catch((e) => console.error("listTasks failed:", e));
  }, [filter, sort]);

  // Re-apply a customised hotkey once on launch.
  useEffect(() => {
    void applySavedHotkey();
  }, []);

  // Reload whenever the filter/sort changes.
  useEffect(reload, [reload]);

  // Live updates: any window writing to the DB broadcasts `tasks-changed`.
  useEffect(() => {
    const un = onTasksChanged(reload);
    return () => {
      un.then((f) => f());
    };
  }, [reload]);

  const activeCount = tasks.filter((t) => !t.completed).length;

  return (
    <div className="relative h-screen overflow-hidden bg-slate-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {/* Ambient, slowly drifting colour blobs — the "liquid" backdrop. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="drift absolute -left-24 -top-28 h-80 w-80 rounded-full bg-indigo-400/25 blur-3xl dark:bg-indigo-500/15" />
        <div className="drift-slow absolute -right-24 top-10 h-80 w-80 rounded-full bg-purple-400/20 blur-3xl dark:bg-purple-500/15" />
        <div className="drift absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-sky-300/20 blur-3xl dark:bg-sky-500/10" />
      </div>

      <div className="relative mx-auto flex h-full max-w-2xl flex-col">
        {view === "settings" ? (
          <SettingsView key="settings" onBack={() => setView("home")} />
        ) : (
          <div key="home" className="rise-in flex min-h-0 flex-1 flex-col">
            <header className="flex items-center gap-3 px-6 pb-3 pt-6">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">
                D
              </div>
              <div className="leading-tight">
                <h1 className="text-lg font-semibold tracking-tight">Dash</h1>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {activeCount === 0
                    ? "All clear"
                    : `${activeCount} task${activeCount === 1 ? "" : "s"} to go`}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setView("settings")}
                className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-xl text-[18px] text-neutral-500 transition-all hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10"
                title="Settings"
              >
                <SettingsIcon />
              </button>
            </header>

            <div className="flex items-center gap-2 px-6 pb-3">
              <div className="flex rounded-xl border border-black/5 bg-white/70 p-1 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={[
                      "rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-all",
                      filter === f.key
                        ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/25"
                        : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200",
                    ].join(" ")}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="ml-auto">
                <SortMenu value={sort} onChange={setSort} />
              </div>
            </div>

            <div className="px-6 pb-3">
              <TaskComposer />
            </div>

            <main className="tidy-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-1">
              {tasks.length === 0 ? (
                <EmptyState filter={filter} />
              ) : (
                <ul className="space-y-2.5">
                  {tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      onToggle={(completed) =>
                        void setCompleted(task.id, completed)
                      }
                      onSave={(fields) => void updateTask(task.id, fields)}
                      onDelete={() => void deleteTask(task.id)}
                    />
                  ))}
                </ul>
              )}
            </main>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsView({ onBack }: { onBack: () => void }) {
  // Esc returns to the task list, like a back gesture.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  return (
    <div className="rise-in flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 px-6 pb-3 pt-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[18px] text-neutral-500 transition-all hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10"
          title="Back"
        >
          <ChevronLeft />
        </button>
        <div className="leading-tight">
          <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Hotkey &amp; startup
          </p>
        </div>
      </header>

      <main className="tidy-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-2">
        <Settings />
      </main>
    </div>
  );
}

function EmptyState({ filter }: { filter: Filter }) {
  const copy =
    filter === "completed"
      ? { title: "Nothing finished yet", sub: "Completed tasks will collect here." }
      : filter === "active"
        ? { title: "You're all caught up", sub: "No active tasks — enjoy the calm." }
        : {
            title: "A clean slate",
            sub: "Add one above, or press your global hotkey anywhere to capture a task in a flash.",
          };

  return (
    <div className="mt-20 flex flex-col items-center text-center">
      <div className="relative mb-5 flex h-20 w-20 items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-400/30 to-purple-500/30 blur-xl" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-white/60 bg-white/70 text-2xl shadow-lg backdrop-blur dark:border-white/10 dark:bg-white/5">
          ✨
        </div>
      </div>
      <h2 className="text-base font-semibold tracking-tight">{copy.title}</h2>
      <p className="mt-1 max-w-xs text-sm text-neutral-500 dark:text-neutral-400">
        {copy.sub}
      </p>
    </div>
  );
}
