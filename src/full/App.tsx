import { useCallback, useEffect, useRef, useState } from "react";
import {
  countTasks,
  createFolder,
  deleteFolder,
  deleteTask,
  listFolders,
  listTasks,
  moveTasks,
  renameFolder,
  reopen,
  setCompleted,
  updateTask,
} from "../lib/db";
import { onDbChanged, onTasksChanged } from "../lib/events";
import { isLinked } from "../lib/link";
import { applySavedHotkey } from "../lib/shortcut";
import type {
  Filter,
  Folder,
  FolderCounts,
  FolderScope,
  SortKey,
  Task,
} from "../lib/types";
import DashMark from "../components/DashMark";
import {
  ArchiveIcon,
  CalendarIcon,
  CheckCheckIcon,
  CheckSquareIcon,
  ChevronLeft,
  FolderIcon,
  InboxIcon,
  SettingsIcon,
  XIcon,
} from "../components/icons";
import FolderList from "./FolderList";
import SelectionBar from "./SelectionBar";
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

const NO_COUNTS: FolderCounts = { all: 0, unfiled: 0, byFolder: {} };

/** How often a linked account re-reads the shared file. See the poll effect. */
const POLL_MS = 3000;

/**
 * Keeps the previous value when the new one is deep-equal, so the poll below
 * doesn't re-render the list (blowing away hover and edit state) on every tick
 * when nothing has actually changed.
 */
function keepIfSame<T>(prev: T, next: T): T {
  return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [counts, setCounts] = useState<FolderCounts>(NO_COUNTS);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortKey>("due");
  const [scope, setScope] = useState<FolderScope>("all");
  const [view, setView] = useState<View>("home");
  const [linked, setLinked] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const lastSelectedIndex = useRef<number | null>(null);

  const reload = useCallback(async () => {
    try {
      const [t, f, c] = await Promise.all([
        listTasks(filter, sort, scope),
        listFolders(),
        // Badges always count what's still to do, whatever the active filter.
        countTasks("active"),
      ]);
      setTasks((prev) => keepIfSame(prev, t));
      setFolders((prev) => keepIfSame(prev, f));
      setCounts((prev) => keepIfSame(prev, c));
    } catch (err) {
      console.error("Failed to load tasks:", err);
    }
  }, [filter, sort, scope]);

  // Re-apply a customised hotkey once on launch.
  useEffect(() => {
    void applySavedHotkey();
    void isLinked()
      .then(setLinked)
      .catch(() => setLinked(false));
  }, []);

  // Reload whenever the filter, sort or selected folder changes.
  useEffect(() => {
    void reload();
  }, [reload]);

  // Live updates inside this app process: any window writing to the DB
  // broadcasts `tasks-changed`.
  useEffect(() => {
    const un = onTasksChanged(() => void reload());
    return () => {
      un.then((f) => f());
    };
  }, [reload]);

  // Linking was switched on or off in Settings, so the cached handle is now
  // pointing at the wrong file.
  useEffect(() => {
    const un = onDbChanged(() => {
      reopen();
      void isLinked()
        .then(setLinked)
        .catch(() => setLinked(false));
      void reload();
    });
    return () => {
      un.then((f) => f());
    };
  }, [reload]);

  // While linked, the other Windows account writes to the shared file from its
  // own process in its own session, where Tauri events can't reach. Polling is
  // the only way to notice. A window focus forces an extra refresh so switching
  // back to Dash always shows current data straight away.
  useEffect(() => {
    if (!linked) return;
    const id = setInterval(() => void reload(), POLL_MS);
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [linked, reload]);

  const removeFolder = async (id: number) => {
    await deleteFolder(id);
    // Don't strand the view on a folder that no longer exists.
    if (scope === id) setScope("all");
  };

  // Drop any selected id that no longer appears in the list — e.g. it was
  // deleted elsewhere, or filtered out by a scope/filter change.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const live = new Set(tasks.map((t) => t.id));
      const next = new Set<number>();
      for (const id of prev) if (live.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }, [tasks]);

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
    lastSelectedIndex.current = null;
  };

  // Supports shift-click range selection, using each task's position in the
  // currently rendered (filtered/sorted) list.
  const toggleSelect = (id: number, index: number, e: React.MouseEvent) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (e.shiftKey && lastSelectedIndex.current !== null) {
        const [start, end] = [lastSelectedIndex.current, index].sort((a, b) => a - b);
        for (let i = start; i <= end; i++) next.add(tasks[i].id);
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    lastSelectedIndex.current = index;
  };

  const moveSelected = async (folderId: number | null) => {
    await moveTasks([...selectedIds], folderId);
    setSelectedIds(new Set());
  };

  const selectAll = () => {
    setSelectedIds(new Set(tasks.map((t) => t.id)));
    lastSelectedIndex.current = tasks.length - 1;
  };

  return (
    <div className="app-bg h-screen overflow-hidden text-neutral-900 dark:text-neutral-100">
      <div className="mx-auto flex h-full max-w-5xl">
        {view === "settings" ? (
          <SettingsView key="settings" onBack={() => setView("home")} />
        ) : (
          <>
            <FolderList
              folders={folders}
              counts={counts}
              scope={scope}
              onSelect={setScope}
              onCreate={(name) => void createFolder(name)}
              onRename={(id, name) => void renameFolder(id, name)}
              onDelete={(id) => void removeFolder(id)}
            />

            <div key="home" className="flex min-h-0 flex-1 flex-col">
              <header className="flex items-center gap-3 px-6 pb-3 pt-6">
                <DashMark className="h-9 w-9 drop-shadow-sm" />
                <div className="leading-tight">
                  <h1 className="text-lg font-semibold tracking-tight">Dash</h1>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {counts.all === 0
                      ? "All clear"
                      : `${counts.all} task${counts.all === 1 ? "" : "s"} to go`}
                    {linked ? " · shared" : ""}
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

                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                    title={selectMode ? "Cancel selection" : "Select tasks"}
                    className={[
                      "inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                      selectMode
                        ? "accent"
                        : "text-neutral-500 hover:bg-neutral-200/70 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100",
                    ].join(" ")}
                  >
                    {selectMode ? (
                      <XIcon className="text-[15px]" />
                    ) : (
                      <CheckSquareIcon className="text-[15px]" />
                    )}
                  </button>
                  <SortMenu
                    value={filter === "nextWeek" ? "nextWeek" : sort}
                    onChange={(v) => {
                      if (v === "nextWeek") {
                        setFilter("nextWeek");
                      } else {
                        setSort(v);
                        if (filter === "nextWeek") setFilter("all");
                      }
                    }}
                  />
                </div>
              </div>

              <div className="px-6 pb-3">
                <TaskComposer folders={folders} scope={scope} />
              </div>

              {selectMode && (
                <div className="px-6">
                  <SelectionBar
                    count={selectedIds.size}
                    total={tasks.length}
                    folders={folders}
                    onMove={(folderId) => void moveSelected(folderId)}
                    onSelectAll={selectAll}
                    onClear={() =>
                      selectedIds.size > 0
                        ? setSelectedIds(new Set())
                        : exitSelectMode()
                    }
                  />
                </div>
              )}

              <main className="tidy-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-1">
                {tasks.length === 0 ? (
                  <EmptyState filter={filter} scope={scope} />
                ) : (
                  <ul className="space-y-2.5">
                    {tasks.map((task, index) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        folders={folders}
                        selectable={selectMode}
                        selected={selectedIds.has(task.id)}
                        onSelectToggle={(e) => toggleSelect(task.id, index, e)}
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
          </>
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
    <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
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
            Hotkey, startup &amp; sharing
          </p>
        </div>
      </header>

      <main className="tidy-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-2">
        <Settings />
      </main>
    </div>
  );
}

function EmptyState({ filter, scope }: { filter: Filter; scope: FolderScope }) {
  const copy =
    scope !== "all" && filter === "all"
      ? {
          title: scope === "unfiled" ? "Nothing unfiled" : "This folder is empty",
          sub:
            scope === "unfiled"
              ? "Tasks you haven't filed into a folder collect here."
              : "Add a task above and it lands straight in this folder.",
          Icon: scope === "unfiled" ? InboxIcon : FolderIcon,
        }
      : filter === "completed"
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
          : filter === "nextWeek"
            ? {
                title: "Nothing due soon",
                sub: "Tasks due in the next 7 days will show up here.",
                Icon: CalendarIcon,
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
