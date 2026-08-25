import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import { daysFromTodayISO, todayISO } from "./date";
import { notifyChange } from "./events";
import type {
  Filter,
  Folder,
  FolderCounts,
  FolderScope,
  NewTask,
  SortKey,
  Task,
} from "./types";

/** Shape of a row as returned by tauri-plugin-sql (snake_case, completed as 0/1). */
interface TaskRow {
  id: number;
  title: string;
  due_date: string | null;
  completed: number;
  folder_id: number | null;
  created_at: string;
  updated_at: string;
}

interface FolderRow {
  id: number;
  name: string;
  created_at: string;
}

/**
 * Which file we open is decided in Rust: this account's private database, or
 * the shared one under %PUBLIC%\Dash when the account is linked. Both windows
 * call Database.load with the same connection string and get the same file.
 */
let _db: Promise<Database> | null = null;

async function open(url: string): Promise<Database> {
  const d = await Database.load(url);
  // When two Windows accounts are linked, two processes hold this file open at
  // once. WAL lets a reader and a writer coexist, and the busy timeout makes
  // the loser of a write race wait rather than throw "database is locked".
  try {
    await d.select("PRAGMA journal_mode=WAL");
    await d.select("PRAGMA busy_timeout=5000");
  } catch (err) {
    console.warn("Could not apply SQLite pragmas:", err);
  }
  return d;
}

function db(): Promise<Database> {
  if (!_db) _db = invoke<string>("db_url").then(open);
  return _db;
}

/** Drop the cached handle so the next query reopens whatever `db_url` now says. */
export function reopen(): void {
  _db = null;
}

function toTask(r: TaskRow): Task {
  return {
    id: r.id,
    title: r.title,
    dueDate: r.due_date,
    completed: !!r.completed,
    folderId: r.folder_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ---- Tasks -----------------------------------------------------------------

export async function createTask(input: NewTask): Promise<number> {
  const d = await db();
  const res = await d.execute(
    "INSERT INTO tasks (title, due_date, folder_id) VALUES ($1, $2, $3)",
    [input.title.trim(), input.dueDate ?? null, input.folderId ?? null],
  );
  await notifyChange();
  return Number(res.lastInsertId);
}

export async function listTasks(
  filter: Filter,
  sort: SortKey,
  scope: FolderScope = "all",
): Promise<Task[]> {
  const d = await db();

  const clauses: string[] = [];
  const args: unknown[] = [];

  if (filter === "active") clauses.push("completed = 0");
  else if (filter === "completed") clauses.push("completed = 1");
  else if (filter === "nextWeek") {
    clauses.push("completed = 0");
    args.push(todayISO());
    clauses.push(`due_date >= $${args.length}`);
    args.push(daysFromTodayISO(7));
    clauses.push(`due_date <= $${args.length}`);
  }

  if (scope === "unfiled") {
    clauses.push("folder_id IS NULL");
  } else if (typeof scope === "number") {
    args.push(scope);
    clauses.push(`folder_id = $${args.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  // For "due" sort, tasks without a due date sink to the bottom, then by date
  // ascending. SQLite sorts the boolean `due_date IS NULL` (0 before 1).
  const order =
    sort === "due"
      ? "ORDER BY due_date IS NULL, due_date ASC, created_at DESC"
      : "ORDER BY created_at DESC, id DESC";

  const rows = await d.select<TaskRow[]>(
    `SELECT * FROM tasks ${where} ${order}`,
    args,
  );
  return rows.map(toTask);
}

export async function updateTask(
  id: number,
  fields: { title?: string; dueDate?: string | null; folderId?: number | null },
): Promise<void> {
  const d = await db();
  const sets: string[] = [];
  const args: unknown[] = [];

  if (fields.title !== undefined) {
    sets.push(`title = $${args.length + 1}`);
    args.push(fields.title.trim());
  }
  if (fields.dueDate !== undefined) {
    sets.push(`due_date = $${args.length + 1}`);
    args.push(fields.dueDate);
  }
  if (fields.folderId !== undefined) {
    sets.push(`folder_id = $${args.length + 1}`);
    args.push(fields.folderId);
  }
  if (sets.length === 0) return;

  sets.push("updated_at = datetime('now')");
  args.push(id);
  await d.execute(
    `UPDATE tasks SET ${sets.join(", ")} WHERE id = $${args.length}`,
    args,
  );
  await notifyChange();
}

/** Bulk re-files any number of tasks into a folder (or unfiles with `null`) in one query. */
export async function moveTasks(
  ids: number[],
  folderId: number | null,
): Promise<void> {
  if (ids.length === 0) return;
  const d = await db();
  const placeholders = ids.map((_, i) => `$${i + 2}`).join(", ");
  await d.execute(
    `UPDATE tasks SET folder_id = $1, updated_at = datetime('now') WHERE id IN (${placeholders})`,
    [folderId, ...ids],
  );
  await notifyChange();
}

export async function setCompleted(id: number, completed: boolean): Promise<void> {
  const d = await db();
  await d.execute(
    "UPDATE tasks SET completed = $1, updated_at = datetime('now') WHERE id = $2",
    [completed ? 1 : 0, id],
  );
  await notifyChange();
}

export async function deleteTask(id: number): Promise<void> {
  const d = await db();
  await d.execute("DELETE FROM tasks WHERE id = $1", [id]);
  await notifyChange();
}

// ---- Folders ---------------------------------------------------------------

export async function listFolders(): Promise<Folder[]> {
  const d = await db();
  const rows = await d.select<FolderRow[]>(
    "SELECT * FROM folders ORDER BY name COLLATE NOCASE ASC",
  );
  return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }));
}

export async function createFolder(name: string): Promise<number> {
  const d = await db();
  const res = await d.execute("INSERT INTO folders (name) VALUES ($1)", [
    name.trim(),
  ]);
  await notifyChange();
  return Number(res.lastInsertId);
}

export async function renameFolder(id: number, name: string): Promise<void> {
  const d = await db();
  await d.execute("UPDATE folders SET name = $1 WHERE id = $2", [
    name.trim(),
    id,
  ]);
  await notifyChange();
}

/** Deletes the folder and unfiles its tasks — deleting a folder never deletes work. */
export async function deleteFolder(id: number): Promise<void> {
  const d = await db();
  await d.execute("UPDATE tasks SET folder_id = NULL WHERE folder_id = $1", [id]);
  await d.execute("DELETE FROM folders WHERE id = $1", [id]);
  await notifyChange();
}

/** One grouped query backing every sidebar badge. */
export async function countTasks(filter: Filter): Promise<FolderCounts> {
  const d = await db();
  const where =
    filter === "active"
      ? "WHERE completed = 0"
      : filter === "completed"
        ? "WHERE completed = 1"
        : filter === "nextWeek"
          ? `WHERE completed = 0 AND due_date >= '${todayISO()}' AND due_date <= '${daysFromTodayISO(7)}'`
          : "";

  const rows = await d.select<{ folder_id: number | null; n: number }[]>(
    `SELECT folder_id, COUNT(*) AS n FROM tasks ${where} GROUP BY folder_id`,
  );

  const counts: FolderCounts = { all: 0, unfiled: 0, byFolder: {} };
  for (const r of rows) {
    counts.all += r.n;
    if (r.folder_id === null) counts.unfiled = r.n;
    else counts.byFolder[r.folder_id] = r.n;
  }
  return counts;
}
