import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";

/**
 * Cross-window data sync.
 *
 * Every write to the DB broadcasts `tasks-changed` to ALL webviews (including
 * the sender). Each window re-queries on receipt, so the quick-add window and
 * the full window stay consistent without any shared in-memory state.
 *
 * These events travel inside ONE running app process only. When two Windows
 * accounts are linked to the same database they are separate processes in
 * separate sessions, so nothing here reaches across — App.tsx polls instead.
 */
const CHANNEL = "tasks-changed";

/** Fired when the account is linked/unlinked and the open DB handle is stale. */
const DB_CHANNEL = "db-changed";

export function notifyChange(): Promise<void> {
  return emit(CHANNEL);
}

export function onTasksChanged(cb: () => void): Promise<UnlistenFn> {
  return listen(CHANNEL, () => cb());
}

export function notifyDbChanged(): Promise<void> {
  return emit(DB_CHANNEL);
}

export function onDbChanged(cb: () => void): Promise<UnlistenFn> {
  return listen(DB_CHANNEL, () => cb());
}
