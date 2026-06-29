import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";

/**
 * Cross-window data sync.
 *
 * Every write to the DB broadcasts `tasks-changed` to ALL webviews (including
 * the sender). Each window re-queries on receipt, so the quick-add window and
 * the full window stay consistent without any shared in-memory state.
 */
const CHANNEL = "tasks-changed";

export function notifyChange(): Promise<void> {
  return emit(CHANNEL);
}

export function onTasksChanged(cb: () => void): Promise<UnlistenFn> {
  return listen(CHANNEL, () => cb());
}
