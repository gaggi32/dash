# Dash

A small to-do app for Windows and macOS that lives in your tray. Press a hotkey
from anywhere, type the task, press Enter, and press Esc to get back to what
you were doing.

Your tasks stay on your own computer. No account, no cloud, no tracking.

## Download

Get the newest version from the
[releases page](https://github.com/gaggi32/dash/releases/latest):

| System | File |
| --- | --- |
| Windows 10 / 11 (64-bit) | `Dash-<version>-x64-setup.exe` |
| macOS 11+ on Apple Silicon (M1 and later) | `Dash-<version>-arm64.dmg` |
| macOS 11+ on Intel | `Dash-<version>-x64.dmg` |

Each file has a `.sha256` next to it if you want to check your download
(`Get-FileHash .\file.exe` on Windows, `shasum -a 256 file.dmg` on a Mac).

### The first time you open it

Dash is not signed with a paid Microsoft or Apple certificate yet, so each
system asks once:

- **Windows:** "Windows protected your PC" → **More info** → **Run anyway**.
  The installer then asks whether to install for just you (no admin rights) or
  for everyone on the computer.
- **macOS:** open the `.dmg`, drag Dash into Applications and open it. When
  macOS says it cannot check the app, go to **System Settings → Privacy &
  Security**, scroll down and click **Open Anyway**.

Dash runs in the tray (the menu bar on a Mac). When you open it by hand, the
main window shows too.

## Using it

| Where | What |
| --- | --- |
| Anywhere | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Space</kbd> (<kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>Space</kbd> on a Mac) opens the quick-add box. Press it again to close it. |
| Quick-add box | Type the task; <kbd>Enter</kbd> saves it and clears the box for the next one. The calendar button adds a due date, the folder button files it, the notes button adds notes and files (drop or paste them too). <kbd>Esc</kbd> or a click elsewhere closes it. |
| Tray icon | Left-click opens the quick-add box. Right-click: **Open** (main window) and **Quit**. |
| Main window | All / Active / Done; sort by newest or due date, or "Next week" for what is due in the next 7 days; folders on the left; edit a task in place; notes and attachments in the side panel. |

Closing the main window keeps Dash running in the tray, so the hotkey keeps
working. Use **Quit** in the tray menu to stop it.

### Settings

- **Global hotkey**: click it and press the keys you want (it needs at least
  one modifier such as Ctrl or Alt).
- **Launch at login**: starts Dash quietly in the tray.
- **Stay on top of fullscreen apps**: keeps the quick-add box above games and
  fullscreen video.
- **Share with other Windows accounts**: see "Privacy and security" below.
- **Check for updates**: once a day Dash asks GitHub for the newest version
  number and shows a small notice if there is one. **Check now** does it on
  demand. **Install** downloads the new version from GitHub, checks it is
  signed by Dash's release key, installs it and restarts; your tasks stay.
  **Download** opens the release page if you'd rather install it yourself.

## Your data

| What | Where |
| --- | --- |
| Tasks and folders | `dash.db` (SQLite) in the app folder |
| Attached files | `attachments` in the same folder (copies, so moving or deleting the original does not break them) |
| Settings (hotkey, switches) | the app's web storage, kept by the system next to the app folder |

The app folder is `%APPDATA%\com.dash.quickcapture` on Windows and
`~/Library/Application Support/com.dash.quickcapture` on macOS.

To back up your tasks, copy `dash.db` and `attachments` while Dash is not
running.

## Privacy and security

- Everything stays on your computer. Dash has no account, no server and no
  telemetry.
- The only network requests are the update check, which asks `api.github.com`
  for the version number of the newest Dash release (you can turn it off in
  Settings), and, when you press Install, the download of that release from
  `github.com`. An update not signed with Dash's release key is refused.
- The windows only show Dash's own pages: a strict content security policy is
  set, and navigating anywhere else is blocked.
- Attached files are copied into the app folder under a cleaned-up name and
  open in your system's default app, the same as double-clicking them.
- **Sharing with other Windows accounts** moves your task list to
  `C:\Users\Public\Dash`. Every account on that computer can read and change
  files there. That is the point of the feature, but it also means anyone who
  can sign in to the PC, and any program they run, can read and change your
  tasks and attached files. Only turn it on if you trust every account on the
  computer.

## Uninstall

- **Windows:** Settings → Apps → Installed apps → Dash → Uninstall.
- **macOS:** quit Dash from the menu bar and move it from Applications to the
  Bin.

Turn off **Launch at login** before you uninstall. Your tasks stay in the app
folder above; delete that folder too if you want them gone.

## Building it yourself

You need [Node.js](https://nodejs.org) 20+, [Rust](https://rustup.rs) and the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your
system.

```bash
npm install
npm run tauri:dev     # run it
npm test              # tests
npm run tauri:build   # installer in src-tauri/target/release/bundle/
```

On Windows, if a build fails with `LNK1104: cannot open file "msvcrt.lib"`, use
`run-dev.cmd` / `run-build.cmd`: they pick a Visual Studio install that has the
C++ tools.

Linux may build from source but is untested, and there are no Linux downloads.

More detail for contributors is in [CLAUDE.md](CLAUDE.md).
