import { useEffect, useRef, useState } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import {
  acceleratorToKeys,
  DEFAULT_HOTKEY,
  eventToChord,
  resumeHotkey,
  setHotkey,
  suspendHotkey,
} from "../lib/shortcut";
import { KeyboardIcon, UsersIcon } from "../components/icons";
import { isLinked, setLinked, sharingSupported } from "../lib/link";
import { getSettings, saveSettings } from "../lib/settings";
import {
  appVersion,
  checkUpdate,
  installLabel,
  installUpdate,
  openDownloadPage,
  setCheckUpdates,
} from "../lib/updates";

export default function Settings() {
  // Empty until the saved settings arrive from Rust.
  const [hotkey, setHotkeyValue] = useState("");
  const [recording, setRecording] = useState(false);
  // Live preview of keys held while recording (modifiers, then the final key).
  const [preview, setPreview] = useState<string>("");
  const [status, setStatus] = useState<string | null>(null);
  const [autostart, setAutostart] = useState(false);
  const [stayOnTop, setStayOnTop] = useState(false);
  // Account linking: whether this platform offers it, whether it's on, and a
  // line of feedback after the merge that runs on first link.
  const [sharing, setSharing] = useState(false);
  const [linked, setLinkedState] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkNote, setLinkNote] = useState<string | null>(null);
  const recorderRef = useRef<HTMLButtonElement>(null);
  // Tracks whether a recording is in progress so we can restore the previous
  // hotkey if the panel closes mid-record (but never after a real commit).
  const recordingRef = useRef(false);

  useEffect(() => {
    getSettings()
      .then((s) => {
        // A recording may already have committed a newer binding.
        setHotkeyValue((current) => current || s.hotkey);
        setStayOnTop(s.stayOnTopFullscreen);
      })
      .catch((e) => console.error("Failed to load settings:", e));

    isEnabled()
      .then(setAutostart)
      .catch((e) => console.error("autostart isEnabled failed:", e));

    sharingSupported()
      .then(setSharing)
      .catch(() => setSharing(false));
    isLinked()
      .then(setLinkedState)
      .catch(() => setLinkedState(false));

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

  // Linking copies this account's tasks into the shared database, which can
  // take a moment on a long list, so the toggle stays disabled until it lands.
  const toggleLink = async (next: boolean) => {
    setLinking(true);
    setLinkNote(null);
    try {
      const copied = await setLinked(next);
      setLinkedState(next);
      setLinkNote(
        next
          ? copied > 0
            ? `Shared. Copied ${copied} task${copied === 1 ? "" : "s"} across.`
            : "Shared. Nothing new to copy."
          : "Unshared. Anything added while shared stays with the other account.",
      );
    } catch (err) {
      console.error("Failed to change sharing:", err);
      setLinkNote(`Couldn't change sharing: ${String(err)}`);
    } finally {
      setLinking(false);
    }
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

  const toggleStayOnTop = async (next: boolean) => {
    try {
      const saved = await saveSettings({ stayOnTopFullscreen: next });
      setStayOnTop(saved.stayOnTopFullscreen);
    } catch (err) {
      console.error("stay-on-top toggle failed:", err);
    }
  };

  const keys = acceleratorToKeys(
    recording ? preview || "…" : hotkey,
  );

  return (
    <div className="surface space-y-5 rounded-xl p-5 text-sm">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="font-semibold tracking-tight">Global hotkey</label>
          {status && (
            <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
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
            "group flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
            recording
              ? "accent-soft border-neutral-500 dark:border-neutral-400"
              : "border-neutral-200 bg-gradient-to-b from-neutral-50 to-neutral-100/60 hover:border-neutral-400/70 dark:border-neutral-700 dark:from-neutral-800/50 dark:to-neutral-800/20 dark:hover:border-neutral-500/50",
          ].join(" ")}
        >
          <KeyboardIcon
            className={[
              "text-[20px] transition-colors",
              recording
                ? "text-neutral-700 dark:text-neutral-200"
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
                  className="min-w-[26px] rounded border border-neutral-200 bg-white px-2 py-1 text-center font-sans text-[12px] font-semibold text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
                >
                  {k}
                </kbd>
              ))
            )}
          </div>

          <span
            className={[
              "shrink-0 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
              recording
                ? "accent"
                : "bg-neutral-100 text-neutral-500 group-hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:group-hover:bg-neutral-700",
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
          {hotkey && hotkey !== DEFAULT_HOTKEY && !recording && (
            <button
              type="button"
              onClick={() => void apply(DEFAULT_HOTKEY)}
              className="text-xs font-medium text-neutral-500 underline-offset-2 transition-colors hover:text-neutral-900 hover:underline dark:hover:text-neutral-100"
            >
              Reset to default
            </button>
          )}
        </div>
      </div>

      <div className="h-px bg-neutral-200 dark:bg-neutral-800" />

      <label className="flex cursor-pointer items-center gap-3">
        <span className="relative inline-flex">
          <input
            type="checkbox"
            checked={autostart}
            onChange={(e) => void toggleAutostart(e.target.checked)}
            className="peer sr-only"
          />
          <span className="h-6 w-10 rounded-full bg-neutral-300 ring-1 ring-inset ring-black/[0.06] transition-colors peer-checked:bg-gradient-to-b peer-checked:from-neutral-700 peer-checked:to-neutral-900 dark:bg-neutral-700 dark:ring-white/5 dark:peer-checked:from-neutral-300 dark:peer-checked:to-neutral-500" />
          <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
        </span>
        <span>
          <span className="block font-medium">Launch at login</span>
          <span className="block text-xs text-neutral-500 dark:text-neutral-400">
            Starts hidden in the tray, ready for your hotkey.
          </span>
        </span>
      </label>

      <div className="h-px bg-neutral-200 dark:bg-neutral-800" />

      <label className="flex cursor-pointer items-center gap-3">
        <span className="relative inline-flex">
          <input
            type="checkbox"
            checked={stayOnTop}
            onChange={(e) => void toggleStayOnTop(e.target.checked)}
            className="peer sr-only"
          />
          <span className="h-6 w-10 rounded-full bg-neutral-300 ring-1 ring-inset ring-black/[0.06] transition-colors peer-checked:bg-gradient-to-b peer-checked:from-neutral-700 peer-checked:to-neutral-900 dark:bg-neutral-700 dark:ring-white/5 dark:peer-checked:from-neutral-300 dark:peer-checked:to-neutral-500" />
          <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
        </span>
        <span>
          <span className="block font-medium">Stay on top of fullscreen apps</span>
          <span className="block text-xs text-neutral-500 dark:text-neutral-400">
            Keeps the quick-add panel above games and fullscreen video, even
            when they try to reclaim focus.
          </span>
        </span>
      </label>

      {sharing && (
        <>
          <div className="h-px bg-neutral-200 dark:bg-neutral-800" />

          <div>
            <label className="flex cursor-pointer items-start gap-3">
              <span className="relative mt-0.5 inline-flex">
                <input
                  type="checkbox"
                  checked={linked}
                  disabled={linking}
                  onChange={(e) => void toggleLink(e.target.checked)}
                  className="peer sr-only"
                />
                <span className="h-6 w-10 rounded-full bg-neutral-300 ring-1 ring-inset ring-black/[0.06] transition-colors peer-checked:bg-gradient-to-b peer-checked:from-neutral-700 peer-checked:to-neutral-900 peer-disabled:opacity-50 dark:bg-neutral-700 dark:ring-white/5 dark:peer-checked:from-neutral-300 dark:peer-checked:to-neutral-500" />
                <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-medium">
                  <UsersIcon className="text-[15px] text-neutral-400" />
                  Share with other Windows accounts
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                  Moves this account onto one shared task list in the PC&apos;s
                  Public folder, and copies your current tasks into it. Turn it
                  on in each Windows account you want to share with.
                </span>
              </span>
            </label>

            <p className="mt-2 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
              {linkNote ??
                (linked
                  ? "Changes from the other account appear within a few seconds while both are signed in."
                  : "Your tasks stay private to this Windows account.")}
            </p>
          </div>
        </>
      )}

      <div className="h-px bg-neutral-200 dark:bg-neutral-800" />

      <UpdatesSection />
    </div>
  );
}

/** Version, the daily update check switch, and a manual check. */
function UpdatesSection() {
  const [enabled, setEnabled] = useState(true);
  const [version, setVersion] = useState("");
  const [checking, setChecking] = useState(false);
  /** While an update downloads: percent, or -1 while the size is unknown. */
  const [installing, setInstalling] = useState<number | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [result, setResult] = useState<
    { kind: "newer"; latest: string } | { kind: "current" } | { kind: "error"; message: string } | null
  >(null);

  useEffect(() => {
    appVersion()
      .then(setVersion)
      .catch(() => setVersion(""));
    getSettings()
      .then((s) => setEnabled(s.checkUpdates))
      .catch(() => {});
  }, []);

  const install = async () => {
    setInstalling(-1);
    setInstallError(null);
    try {
      // Restarts the app when it is done, so this only returns on a failure.
      await installUpdate(setInstalling);
    } catch (err) {
      setInstallError(`${String(err)} You can still get it from the download page.`);
      setInstalling(null);
    }
  };

  const checkNow = async () => {
    setChecking(true);
    setResult(null);
    setInstallError(null);
    try {
      const info = await checkUpdate();
      setResult(
        info.newer && info.latest
          ? { kind: "newer", latest: info.latest }
          : { kind: "current" },
      );
    } catch (err) {
      setResult({ kind: "error", message: String(err) });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center gap-3">
        <span className="relative inline-flex">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              const next = e.target.checked;
              setEnabled(next);
              setCheckUpdates(next).catch((err) => {
                console.error("Failed to save the update check switch:", err);
                setEnabled(!next);
              });
            }}
            className="peer sr-only"
          />
          <span className="h-6 w-10 rounded-full bg-neutral-300 ring-1 ring-inset ring-black/[0.06] transition-colors peer-checked:bg-gradient-to-b peer-checked:from-neutral-700 peer-checked:to-neutral-900 dark:bg-neutral-700 dark:ring-white/5 dark:peer-checked:from-neutral-300 dark:peer-checked:to-neutral-500" />
          <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
        </span>
        <span>
          <span className="block font-medium">Check for updates</span>
          <span className="block text-xs text-neutral-500 dark:text-neutral-400">
            Once a day, asks GitHub for the newest version number. Nothing about
            you or your tasks is sent, and nothing is downloaded until you press
            Install.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {version ? `Dash ${version}` : "Dash"}
        </span>
        <button
          type="button"
          onClick={() => void checkNow()}
          disabled={checking}
          className="rounded-md bg-neutral-100 px-2.5 py-1 text-[12px] font-medium text-neutral-600 transition-colors hover:bg-neutral-200 disabled:opacity-50 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
        >
          {checking ? "Checking…" : "Check now"}
        </button>
        {result?.kind === "current" && (
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            You have the newest version.
          </span>
        )}
        {result?.kind === "newer" && (
          <span className="flex flex-wrap items-center gap-2 text-xs text-neutral-700 dark:text-neutral-200">
            Dash {result.latest} is out.
            <button
              type="button"
              onClick={() => void install()}
              disabled={installing !== null}
              className="rounded-md bg-neutral-900 px-2.5 py-1 text-[12px] font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              {installLabel(result.latest, installing)}
            </button>
            <button
              type="button"
              onClick={() => void openDownloadPage()}
              title="The release page on GitHub, to download the installer yourself"
              className="underline underline-offset-2"
            >
              Download page
            </button>
          </span>
        )}
        {installError && (
          <span className="w-full text-xs text-red-600 dark:text-red-400">{installError}</span>
        )}
        {result?.kind === "error" && (
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {result.message}
          </span>
        )}
      </div>
    </div>
  );
}
