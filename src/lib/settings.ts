import { invoke } from "@tauri-apps/api/core";

/**
 * Preferences, owned by Rust (see src-tauri/src/settings.rs).
 *
 * They live in a JSON file Rust writes atomically and applies itself at
 * startup. Up to 0.4.x they lived in localStorage, which WebView2 loses the
 * latest writes of whenever the app is killed rather than closed (a PC restart
 * does it), so toggles kept coming back off. {@link adoptLegacySettings} moves
 * the old values across once.
 */
export interface Settings {
  /** Tauri accelerator that toggles the quick-add window. */
  hotkey: string;
  /** Keep the quick-add panel above fullscreen games and video. */
  stayOnTopFullscreen: boolean;
  /** Ask GitHub once a day whether a newer release is out. */
  checkUpdates: boolean;
  /** Release whose notice was dismissed with "Not now"; empty when none. */
  dismissedUpdate: string;
  /** Folder the main window last showed: "all", "unfiled" or a folder id. */
  lastScope: string;
}

/** Index signature so `invoke` accepts it inside its argument record. */
export type SettingsPatch = Partial<Settings> & Record<string, unknown>;

/** Change only the named fields; resolves with the settings as saved. */
export function saveSettings(patch: SettingsPatch): Promise<Settings> {
  return invoke<Settings>("save_settings", { patch });
}

export async function getSettings(): Promise<Settings> {
  // The carry-over first, so nothing reads the defaults it is about to replace.
  await adoptLegacySettings();
  return invoke<Settings>("get_settings");
}

// ---- One-time carry-over from localStorage ----------------------------------

/** The keys 0.4.x wrote, by the field each one became. */
export const LEGACY_KEYS = {
  hotkey: "dash.hotkey",
  stayOnTopFullscreen: "dash.stayOnTopFullscreen",
  checkUpdates: "dash.checkUpdates",
  dismissedUpdate: "dash.dismissedUpdate",
} as const;

/** Read the old values the way 0.4.x wrote them; anything else is skipped. */
export function legacyFromStorage(read: (key: string) => string | null): SettingsPatch {
  const flag = (v: string | null) => (v === "1" ? true : v === "0" ? false : undefined);
  const text = (v: string | null) => v?.trim() || undefined;
  const patch: SettingsPatch = {
    hotkey: text(read(LEGACY_KEYS.hotkey)),
    stayOnTopFullscreen: flag(read(LEGACY_KEYS.stayOnTopFullscreen)),
    checkUpdates: flag(read(LEGACY_KEYS.checkUpdates)),
    dismissedUpdate: text(read(LEGACY_KEYS.dismissedUpdate)),
  };
  for (const k of Object.keys(patch)) {
    if (patch[k] === undefined) delete patch[k];
  }
  return patch;
}

let adopting: Promise<void> | null = null;

/**
 * Hand whatever localStorage still holds to Rust, which keeps only the fields
 * its file does not have yet, then remove the old keys. Runs once per window;
 * safe to call on every launch, and a no-op once the keys are gone. A failure
 * leaves the keys in place for the next launch.
 */
export function adoptLegacySettings(): Promise<void> {
  adopting ??= (async () => {
    try {
      const present = Object.values(LEGACY_KEYS).filter(
        (k) => localStorage.getItem(k) !== null,
      );
      if (present.length === 0) return;
      const legacy = legacyFromStorage((key) => localStorage.getItem(key));
      if (Object.keys(legacy).length > 0) {
        await invoke<Settings>("adopt_settings", { legacy });
      }
      // Also the keys the file already had a value for: they are stale now.
      for (const k of present) localStorage.removeItem(k);
    } catch (err) {
      console.error("Failed to carry settings over from localStorage:", err);
    }
  })();
  return adopting;
}
