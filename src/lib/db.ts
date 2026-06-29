import Database from "@tauri-apps/plugin-sql";
import { notifyChange } from "./events";
import type { Filter, NewTask, SortKey, Task } from "./types";

/** Shape of a row as returned by tauri-plugin-sql (snake_case, completed as 0/1). */
interface TaskRow {
  id: number;
  title: string;
  due_date: string | null;
  completed: number;
  created_at: string;
  updated_at: string;
}

// The DB file lives in the app's data dir; the schema is created by the Rust
// migration registered in src-tauri/src/lib.rs. Both windows call Database.load
// with the same connection string and get the same underlying SQLite file.
let _db: Promise<Database> | null = null;
function db(): Promise<Database> {
  if (!_db) _db = Database.load("sqlite:dash.db");
  return _db;
}

function toTask(r: TaskRow): Task {
  return {
    id: r.id,
    title: r.title,
    dueDate: r.due_date,
    completed: !!r.completed,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function createTask(input: NewTask): Promise<number> {
  const d = await db();
  const res = await d.execute(
    "INSERT INTO tasks (title, due_date) VALUES ($1, $2)",
    [input.title.trim(), input.dueDate ?? null],
  );
  await notifyChange();
  return Number(res.lastInsertId);
}

export async function listTasks(filter: Filter, sort: SortKey): Promise<Task[]> {
  const d = await db();

  const where =
    filter === "active"
      ? "WHERE completed = 0"
      : filter === "completed"
        ? "WHERE completed = 1"
        : "";

  // For "due" sort, tasks without a due date sink to the bottom, then by date
  // ascending. SQLite sorts the boolean `due_date IS NULL` (0 before 1).
  const order =
    sort === "due"
      ? "ORDER BY due_date IS NULL, due_date ASC, created_at DESC"
      : "ORDER BY created_at DESC, id DESC";

  const rows = await d.select<TaskRow[]>(
    `SELECT * FROM tasks ${where} ${order}`,
  );
  return rows.map(toTask);
}

export async function updateTask(
  id: number,
  fields: { title?: string; dueDate?: string | null },
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
  if (sets.length === 0) return;

  sets.push("updated_at = datetime('now')");
  args.push(id);
  await d.execute(
    `UPDATE tasks SET ${sets.join(", ")} WHERE id = $${args.length}`,
    args,
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
