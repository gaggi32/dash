import { invoke } from "@tauri-apps/api/core";

/**
 * Update check. Rust asks GitHub for the newest published release of Dash and
 * returns only its version; installing is always the user's own download from
 * the releases page. Nothing else leaves the computer.
 */
export interface UpdateInfo {
  current: string;
  latest: string | null;
  newer: boolean;
}

const ENABLED_KEY = "dash.checkUpdates";
const LAST_KEY = "dash.lastUpdateCheck";
const DISMISSED_KEY = "dash.dismissedUpdate";

/** At most one automatic check a day. */
export const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the check simply runs again next launch */
  }
}

/** On unless the user switched it off. */
export function getCheckUpdates(): boolean {
  return read(ENABLED_KEY) !== "0";
}

export function setCheckUpdates(enabled: boolean): void {
  write(ENABLED_KEY, enabled ? "1" : "0");
}

/** Whether an automatic check is due, given the last one (ms since epoch, or null). */
export function autoCheckDue(now: number, last: number | null): boolean {
  if (last === null || !Number.isFinite(last)) return true;
  // A clock set backwards should not block checks for days.
  if (last > now) return true;
  return now - last >= AUTO_CHECK_INTERVAL_MS;
}

export function checkUpdate(): Promise<UpdateInfo> {
  return invoke<UpdateInfo>("check_update");
}

export function appVersion(): Promise<string> {
  return invoke<string>("app_version");
}

export function openDownloadPage(): Promise<void> {
  return invoke<void>("open_download_page");
}

/**
 * The launch-time check: runs only when enabled and due, never throws, and
 * returns the newer version worth telling the user about (or null).
 */
export async function autoCheck(now = Date.now()): Promise<string | null> {
  if (!getCheckUpdates()) return null;
  const last = Number(read(LAST_KEY));
  if (!autoCheckDue(now, read(LAST_KEY) === null ? null : last)) return null;
  try {
    const info = await checkUpdate();
    write(LAST_KEY, String(now));
    if (!info.newer || !info.latest) return null;
    if (read(DISMISSED_KEY) === info.latest) return null;
    return info.latest;
  } catch {
    // Offline, or no public release yet: say nothing, try again next launch.
    return null;
  }
}

/** Hide the notice for this version; a later version shows it again. */
export function dismissUpdate(version: string): void {
  write(DISMISSED_KEY, version);
}
