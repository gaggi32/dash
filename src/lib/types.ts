/** A to-do item. `dueDate` is a local calendar date string `YYYY-MM-DD` or null. */
export interface Task {
  id: number;
  title: string;
  dueDate: string | null;
  completed: boolean;
  /** Folder this task is filed under, or null for unfiled. */
  folderId: number | null;
  /** SQLite `datetime('now')` UTC timestamps, e.g. "2026-06-29 14:03:11". */
  createdAt: string;
  updatedAt: string;
}

export interface NewTask {
  title: string;
  dueDate?: string | null;
  folderId?: number | null;
}

/** A named bucket for tasks — "School", "Work" — listed in the sidebar. */
export interface Folder {
  id: number;
  name: string;
  createdAt: string;
}

export type Filter = "all" | "active" | "nextWeek" | "completed";
export type SortKey = "created" | "due";

/**
 * Which sidebar row is selected: every task, only unfiled ones, or one folder
 * by id. Kept as a bare union rather than an object so it compares with `===`.
 */
export type FolderScope = "all" | "unfiled" | number;

/** Per-row task counts backing the sidebar badges. */
export interface FolderCounts {
  all: number;
  unfiled: number;
  byFolder: Record<number, number>;
}
