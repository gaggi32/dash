import { useCallback, useEffect, useState } from "react";
import { deleteTask, listTasks, setCompleted, updateTask } from "../lib/db";
import { onTasksChanged } from "../lib/events";
import { applySavedHotkey } from "../lib/shortcut";
import type { Filter, SortKey, Task } from "../lib/types";
import {
  ArchiveIcon,
  CheckCheckIcon,
  ChevronLeft,
  InboxIcon,
  SettingsIcon,
} from "../components/icons";
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
    <div className="app-bg h-screen overflow-hidden text-neutral-900 dark:text-neutral-100">
      <div className="mx-auto flex h-full max-w-2xl flex-col">
        {view === "settings" ? (
          <SettingsView key="settings" onBack={() => setView("home")} />
        ) : (
          <div key="home" className="flex min-h-0 flex-1 flex-col">
            <header className="flex items-center gap-3 px-6 pb-3 pt-6">
              <div className="accent flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold">
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
                className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg text-[18px] text-neutral-500 transition-colors hover:bg-neutral-200/70 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                title="Settings"
              >
                <SettingsIcon />
              </button>
            </header>

            <div className="flex items-center gap-2 px-6 pb-3">
              <div className="surface flex rounded-lg p-0.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={[
                      "rounded-[6px] px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                      filter === f.key
                        ? "accent"
                        : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100",
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
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 px-6 pb-3 pt-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[18px] text-neutral-500 transition-colors hover:bg-neutral-200/70 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
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
      ? {
          title: "Nothing finished yet",
          sub: "Completed tasks will collect here.",
          Icon: ArchiveIcon,
        }
      : filter === "active"
        ? {
            title: "You're all caught up",
            sub: "No active tasks — enjoy the calm.",
            Icon: CheckCheckIcon,
          }
        : {
            title: "A clean slate",
            sub: "Add one above, or press your global hotkey anywhere to capture a task in a flash.",
            Icon: InboxIcon,
          };

  return (
    <div className="mt-20 flex flex-col items-center text-center">
      <div className="accent-soft mb-4 flex h-11 w-11 items-center justify-center rounded-lg text-xl">
        <copy.Icon />
      </div>
      <h2 className="text-base font-semibold tracking-tight">{copy.title}</h2>
      <p className="mt-1 max-w-xs text-sm text-neutral-500 dark:text-neutral-400">
        {copy.sub}
      </p>
    </div>
  );
}
