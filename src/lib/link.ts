import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import { reopen } from "./db";
import { notifyDbChanged } from "./events";

/**
 * Linking Windows accounts.
 *
 * Each Windows account normally gets its own database under its own AppData.
 * Linking points this account at one shared file under %PUBLIC%\Dash instead,
 * which every local account can write to without elevation, and copies this
 * account's existing tasks into it.
 *
 * Rust owns the decision (see `db_url` / `set_linked` in src-tauri/src/lib.rs);
 * this module only handles the one-time data merge.
 */

interface TaskRow {
  title: string;
  due_date: string | null;
  completed: number;
  folder_id: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

interface FolderRow {
  id: number;
  name: string;
}

export function sharingSupported(): Promise<boolean> {
  return invoke<boolean>("sharing_supported");
}

export function isLinked(): Promise<boolean> {
  return invoke<boolean>("is_linked");
}

/**
 * Copy this account's private tasks and folders into the shared database.
 *
 * Idempotent on purpose: a task is skipped when the shared side already holds
 * one with the same title and due date, and a folder name is reused rather than
 * duplicated. Unlinking and re-linking later therefore doesn't pile up copies.
 */
async function mergePrivateInto(sharedUrl: string): Promise<number> {
  const privateUrl = await invoke<string>("private_db_url");
  if (privateUrl === sharedUrl) return 0;

  const from = await Database.load(privateUrl);
  const to = await Database.load(sharedUrl);

  // Fold this account's folders into the shared set, keeping a map from local
  // folder id to shared folder id so the tasks below land in the right place.
  const mine = await from.select<FolderRow[]>("SELECT id, name FROM folders");
  const theirs = await to.select<FolderRow[]>("SELECT id, name FROM folders");
  const byName = new Map(theirs.map((f) => [f.name.trim().toLowerCase(), f.id]));
  const remap = new Map<number, number>();

  for (const f of mine) {
    const key = f.name.trim().toLowerCase();
    let id = byName.get(key);
    if (id === undefined) {
      const res = await to.execute("INSERT INTO folders (name) VALUES ($1)", [
        f.name,
      ]);
      id = Number(res.lastInsertId);
      byName.set(key, id);
    }
    remap.set(f.id, id);
  }

  const tasks = await from.select<TaskRow[]>(
    "SELECT title, due_date, completed, folder_id, notes, created_at, updated_at FROM tasks",
  );

  let copied = 0;
  for (const t of tasks) {
    // `IS` rather than `=` so a NULL due date matches a NULL due date.
    const dupes = await to.select<{ n: number }[]>(
      "SELECT COUNT(*) AS n FROM tasks WHERE title = $1 AND due_date IS $2",
      [t.title, t.due_date],
    );
    if ((dupes[0]?.n ?? 0) > 0) continue;

    await to.execute(
      `INSERT INTO tasks (title, due_date, completed, folder_id, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        t.title,
        t.due_date,
        t.completed,
        t.folder_id === null ? null : (remap.get(t.folder_id) ?? null),
        t.notes,
        t.created_at,
        t.updated_at,
      ],
    );
    copied++;
  }

  return copied;
}

/**
 * Link or unlink this account. Returns how many tasks were copied into the
 * shared database (always 0 when unlinking).
 *
 * Unlinking leaves the shared database untouched and hands this account back
 * its private one, so anything added while linked stays visible to the other
 * account and this account sees its own pre-link tasks again.
 */
export async function setLinked(enabled: boolean): Promise<number> {
  const url = await invoke<string>("set_linked", { enabled });
  let copied = 0;
  if (enabled) copied = await mergePrivateInto(url);

  // Both windows are holding a handle to the old file.
  reopen();
  await notifyDbChanged();
  return copied;
}
