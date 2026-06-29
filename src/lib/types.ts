/** A to-do item. `dueDate` is a local calendar date string `YYYY-MM-DD` or null. */
export interface Task {
  id: number;
  title: string;
  dueDate: string | null;
  completed: boolean;
  /** SQLite `datetime('now')` UTC timestamps, e.g. "2026-06-29 14:03:11". */
  createdAt: string;
  updatedAt: string;
}

export interface NewTask {
  title: string;
  dueDate?: string | null;
}

export type Filter = "all" | "active" | "completed";
export type SortKey = "created" | "due";
