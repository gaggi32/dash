import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { MissedRelease } from "./changelog";
import { getSettings, saveSettings } from "./settings";

/**
 * Update check. Rust asks GitHub for the newest published release of Dash and
 * returns only versions and notes (what is new in each release since the
 * running one). Installing is
 * either in the app (installUpdate: Tauri's updater downloads the release,
 * checks it is signed with Dash's release key, installs it and restarts) or
 * the user's own download from the releases page. Nothing else leaves the computer.
 */
export interface UpdateInfo {
  current: string;
  latest: string | null;
  newer: boolean;
  /**
   * Every release the update brings, newest first, each with its notes (its
   * CHANGELOG.md section); read with missedEntries. Empty when not newer.
   */
  missed: MissedRelease[];
}

/** A newer release worth telling the user about. */
export interface FoundUpdate {
  version: string;
  /** The releases it brings, as in {@link UpdateInfo}. */
  missed: MissedRelease[];
}

/**
 * When the last automatic check ran. Bookkeeping, not a preference, so it stays
 * in localStorage: if WebView2 drops it, the only effect is one extra check.
 * The switch and the dismissed version are settings (see settings.ts).
 */
const LAST_KEY = "dash.lastUpdateCheck";

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

export async function setCheckUpdates(enabled: boolean): Promise<void> {
  await saveSettings({ checkUpdates: enabled });
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

/**
 * Download, check the signature, install and restart. `onProgress` gets the
 * percent downloaded, or -1 while the size is unknown. Only returns on a
 * failure: on success the app restarts.
 */
export async function installUpdate(onProgress: (pct: number) => void): Promise<void> {
  const off = await listen<number>("update-progress", (e) => onProgress(e.payload));
  try {
    await invoke<void>("install_update");
  } finally {
    off();
  }
}

/** The install button's text: null before it is pressed, then the progress. */
export function installLabel(version: string, progress: number | null): string {
  if (progress === null) return `Install ${version}`;
  if (progress < 0) return "Downloading…";
  if (progress >= 100) return "Installing…";
  return `Downloading ${Math.round(progress)}%`;
}

export function openDownloadPage(): Promise<void> {
  return invoke<void>("open_download_page");
}

/**
 * The launch-time check: runs only when enabled and due, never throws, and
 * returns the newer release worth telling the user about (or null).
 */
export async function autoCheck(now = Date.now()): Promise<FoundUpdate | null> {
  try {
    const settings = await getSettings();
    if (!settings.checkUpdates) return null;
    const last = Number(read(LAST_KEY));
    if (!autoCheckDue(now, read(LAST_KEY) === null ? null : last)) return null;
    const info = await checkUpdate();
    write(LAST_KEY, String(now));
    if (!info.newer || !info.latest) return null;
    if (settings.dismissedUpdate === info.latest) return null;
    return { version: info.latest, missed: info.missed };
  } catch {
    // Offline, or no public release yet (or the settings unreachable): say
    // nothing, try again next launch.
    return null;
  }
}

/** Hide the notice for this version; a later version shows it again. */
export async function dismissUpdate(version: string): Promise<void> {
  try {
    await saveSettings({ dismissedUpdate: version });
  } catch (err) {
    console.error("Failed to save the dismissed update:", err);
  }
}
