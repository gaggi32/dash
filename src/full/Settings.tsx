import { useEffect, useRef, useState } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import {
  acceleratorToKeys,
  DEFAULT_HOTKEY,
  eventToChord,
  getHotkey,
  resumeHotkey,
  setHotkey,
  suspendHotkey,
} from "../lib/shortcut";
import { KeyboardIcon } from "../components/icons";

export default function Settings() {
  const [hotkey, setHotkeyValue] = useState(getHotkey());
  const [recording, setRecording] = useState(false);
  // Live preview of keys held while recording (modifiers, then the final key).
  const [preview, setPreview] = useState<string>("");
  const [status, setStatus] = useState<string | null>(null);
  const [autostart, setAutostart] = useState(false);
  const recorderRef = useRef<HTMLButtonElement>(null);
  // Tracks whether a recording is in progress so we can restore the previous
  // hotkey if the panel closes mid-record (but never after a real commit).
  const recordingRef = useRef(false);

  useEffect(() => {
    isEnabled()
      .then(setAutostart)
      .catch((e) => console.error("autostart isEnabled failed:", e));

    // Safety net: if Settings unmounts while still listening, give the old
    // hotkey back so the user is never left without a working shortcut.
    return () => {
      if (recordingRef.current) void resumeHotkey();
    };
  }, []);

  const flash = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(null), 2200);
  };

  // Commit a new binding (re-registers the global shortcut as a side effect).
  const apply = async (accelerator: string) => {
    recordingRef.current = false;
    try {
      await setHotkey(accelerator);
      setHotkeyValue(accelerator);
      flash("Saved");
    } catch (err) {
      flash(`Couldn't bind: ${String(err)}`);
      void resumeHotkey();
    }
  };

  // Abort recording without changing the binding; restore the old shortcut.
  const cancelRecording = () => {
    recordingRef.current = false;
    setRecording(false);
    setPreview("");
    void resumeHotkey();
  };

  // While recording, intercept every keydown and translate it to an accelerator.
  useEffect(() => {
    if (!recording) return;

    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        cancelRecording();
        return;
      }

      const chord = eventToChord(e);
      setPreview(chord.accelerator);

      // Only commit once it's a real, modifier-backed shortcut.
      if (chord.complete && chord.hasModifier) {
        setRecording(false);
        setPreview("");
        void apply(chord.accelerator);
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording]);

  const startRecording = async () => {
    setPreview("");
    // Free the OS-level shortcut first so we can capture ANY combo — including
    // the one that's currently bound — without the OS swallowing it.
    await suspendHotkey();
    recordingRef.current = true;
    setRecording(true);
    recorderRef.current?.focus();
  };

  const toggleAutostart = async (next: boolean) => {
    try {
      if (next) await enable();
      else await disable();
      setAutostart(next);
    } catch (err) {
      console.error("autostart toggle failed:", err);
    }
  };

  const keys = acceleratorToKeys(
    recording ? preview || "…" : hotkey,
  );

  return (
    <div className="space-y-5 rounded-2xl border border-black/5 bg-white/70 p-5 text-sm shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="font-semibold tracking-tight">Global hotkey</label>
          {status && (
            <span className="text-xs font-medium text-indigo-600 dark:text-indigo-300">
              {status}
            </span>
          )}
        </div>

        <button
          ref={recorderRef}
          type="button"
          onClick={() => (recording ? cancelRecording() : void startRecording())}
          onBlur={() => {
            if (recording) cancelRecording();
          }}
          className={[
            "group flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all",
            recording
              ? "border-indigo-400/60 bg-indigo-500/5 ring-4 ring-indigo-500/10"
              : "border-black/5 bg-black/[0.025] hover:border-black/10 hover:bg-black/[0.04] dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]",
          ].join(" ")}
        >
          <KeyboardIcon
            className={[
              "text-[20px] transition-colors",
              recording
                ? "text-indigo-500"
                : "text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-300",
            ].join(" ")}
          />

          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            {recording && !preview ? (
              <span className="text-[13px] text-neutral-500 dark:text-neutral-400">
                Press your shortcut…
              </span>
            ) : (
              keys.map((k, i) => (
                <kbd
                  key={`${k}-${i}`}
                  className="min-w-[26px] rounded-md border border-black/10 bg-white px-2 py-1 text-center font-sans text-[12px] font-semibold text-neutral-700 shadow-sm dark:border-white/10 dark:bg-neutral-800 dark:text-neutral-200"
                >
                  {k}
                </kbd>
              ))
            )}
          </div>

          <span
            className={[
              "shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors",
              recording
                ? "bg-indigo-500 text-white"
                : "bg-black/5 text-neutral-500 group-hover:bg-black/10 dark:bg-white/10 dark:text-neutral-300",
            ].join(" ")}
          >
            {recording ? "Listening" : "Rebind"}
          </span>
        </button>

        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {recording
              ? "Hold modifiers + a key. Esc to cancel."
              : "Click, then press the keys you want."}
          </p>
          {hotkey !== DEFAULT_HOTKEY && !recording && (
            <button
              type="button"
              onClick={() => void apply(DEFAULT_HOTKEY)}
              className="text-xs font-medium text-neutral-500 hover:text-indigo-600 dark:hover:text-indigo-400"
            >
              Reset to default
            </button>
          )}
        </div>
      </div>

      <div className="h-px bg-black/5 dark:bg-white/10" />

      <label className="flex cursor-pointer items-center gap-3">
        <span className="relative inline-flex">
          <input
            type="checkbox"
            checked={autostart}
            onChange={(e) => void toggleAutostart(e.target.checked)}
            className="peer sr-only"
          />
          <span className="h-6 w-10 rounded-full bg-black/15 transition-colors peer-checked:bg-indigo-500 dark:bg-white/15" />
          <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
        </span>
        <span>
          <span className="block font-medium">Launch at login</span>
          <span className="block text-xs text-neutral-500 dark:text-neutral-400">
            Starts hidden in the tray, ready for your hotkey.
          </span>
        </span>
      </label>
    </div>
  );
}
