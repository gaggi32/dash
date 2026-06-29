import { invoke } from "@tauri-apps/api/core";

/**
 * Global hotkey configuration.
 *
 * The default accelerator is registered in Rust at startup so the shortcut
 * works immediately (even before any webview has loaded). The user can change
 * it from the full window; we persist the choice in localStorage and re-apply
 * it on launch via `applySavedHotkey()`.
 *
 * Accelerator format is Tauri's: e.g. "CommandOrControl+Shift+Space",
 * "Alt+N", "Super+T". `CommandOrControl` maps to ⌘ on macOS, Ctrl elsewhere.
 */
export const DEFAULT_HOTKEY = "CommandOrControl+Shift+Space";
const STORAGE_KEY = "dash.hotkey";

export function getHotkey(): string {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_HOTKEY;
}

export async function setHotkey(accelerator: string): Promise<void> {
  // Throws (rejects) if Rust fails to parse/register — caller surfaces it.
  await invoke("update_shortcut", { accelerator });
  localStorage.setItem(STORAGE_KEY, accelerator);
}

/**
 * Release all global shortcuts so the webview can capture raw keystrokes while
 * recording a new binding (the OS otherwise swallows the registered combo).
 */
export async function suspendHotkey(): Promise<void> {
  try {
    await invoke("suspend_shortcut");
  } catch (err) {
    console.error("Failed to suspend global shortcut:", err);
  }
}

/** Re-register the currently saved hotkey (used to cancel/abort a recording). */
export async function resumeHotkey(): Promise<void> {
  try {
    await invoke("update_shortcut", { accelerator: getHotkey() });
  } catch (err) {
    console.error("Failed to resume global shortcut:", err);
  }
}

/** Re-register a previously customised hotkey. Safe to call on every launch. */
export async function applySavedHotkey(): Promise<void> {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && saved !== DEFAULT_HOTKEY) {
    try {
      await invoke("update_shortcut", { accelerator: saved });
    } catch (err) {
      console.error("Failed to re-apply saved hotkey:", err);
    }
  }
}

// ---- Keystroke recording ----------------------------------------------------

const IS_MAC =
  typeof navigator !== "undefined" &&
  /mac/i.test(navigator.platform || navigator.userAgent);

/** Maps a KeyboardEvent.code to the key name Tauri's accelerator parser wants. */
function codeToTauriKey(e: KeyboardEvent): string | null {
  const code = e.code;

  if (/^Key[A-Z]$/.test(code)) return code.slice(3); // KeyN -> N
  if (/^Digit[0-9]$/.test(code)) return code.slice(5); // Digit4 -> 4
  if (/^Numpad[0-9]$/.test(code)) return code; // Numpad accelerators keep their name
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code; // F1..F24

  const map: Record<string, string> = {
    Space: "Space",
    Enter: "Enter",
    NumpadEnter: "Enter",
    Tab: "Tab",
    Backspace: "Backspace",
    Delete: "Delete",
    Insert: "Insert",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backquote: "`",
  };
  return map[code] ?? null;
}

export interface Chord {
  /** Tauri accelerator string, e.g. "CommandOrControl+Shift+Space". */
  accelerator: string;
  /** True once a non-modifier key is part of the chord (i.e. it's usable). */
  complete: boolean;
  /** True when at least one modifier is held (global shortcuts want one). */
  hasModifier: boolean;
}

/**
 * Translate a raw keydown into a Tauri accelerator. While the user is only
 * holding modifiers, `complete` is false and `accelerator` is just the held
 * modifiers (for live preview). Once they add a real key, it's complete.
 */
export function eventToChord(e: KeyboardEvent): Chord {
  const mods: string[] = [];

  // Primary modifier is portable: ⌘ on macOS, Ctrl elsewhere.
  if (IS_MAC ? e.metaKey : e.ctrlKey) mods.push("CommandOrControl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  // The "other" platform-specific super key (literal Ctrl on mac, Win/Super elsewhere).
  if (IS_MAC ? e.ctrlKey : e.metaKey) mods.push(IS_MAC ? "Control" : "Super");

  const key = codeToTauriKey(e);
  const hasModifier = mods.length > 0;

  if (!key) {
    return { accelerator: mods.join("+"), complete: false, hasModifier };
  }
  return {
    accelerator: [...mods, key].join("+"),
    complete: true,
    hasModifier,
  };
}

/** Split an accelerator into display tokens with platform-friendly symbols. */
export function acceleratorToKeys(accelerator: string): string[] {
  const symbols: Record<string, string> = {
    CommandOrControl: IS_MAC ? "⌘" : "Ctrl",
    CmdOrCtrl: IS_MAC ? "⌘" : "Ctrl",
    Command: "⌘",
    Cmd: "⌘",
    Control: IS_MAC ? "⌃" : "Ctrl",
    Ctrl: IS_MAC ? "⌃" : "Ctrl",
    Alt: IS_MAC ? "⌥" : "Alt",
    Option: "⌥",
    Shift: IS_MAC ? "⇧" : "Shift",
    Super: IS_MAC ? "⌘" : "Win",
    Up: "↑",
    Down: "↓",
    Left: "←",
    Right: "→",
  };
  return accelerator
    .split("+")
    .filter(Boolean)
    .map((tok) => symbols[tok] ?? tok);
}
