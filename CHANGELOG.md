# Changelog

All notable changes to Dash. Versions from 0.4.0 on match the GitHub releases.

## [1.2.1] — 2026-11-17
### Changed
- The "What's new" card and the update notes are easier to read: coloured New, Improved and Fixed labels, a bullet per change, and older versions folded to one line each.
### Fixed
- The Settings cog turns one tooth when you point at it and no longer jumps when the mouse leaves.

## [1.2.0] — 2026-11-17
### Added
- The Settings cog turns when you point at it.
### Changed
- Before you install an update, its notes list every version you would get, not only the newest.

## [1.1.0] — 2026-11-17
### Added
- Settings and the update notice show what is new in an update before you install it.

## [1.0.0] — 2026-11-17
### Added
- The quick-add panel keeps what you typed but did not add when it closes, and shows it again next time. Adding a task still empties it. Switch off in Settings ("Keep unsent text in the quick-add panel") to start empty every time.
### Changed
- Dash is 1.0: its first stable version.

## [0.5.0] — 2026-11-17
### Added
- Install updates from inside Dash: "Install" in the update notice or in Settings downloads the new version, checks it is signed by Dash, installs it and restarts. Your tasks stay. (This version itself is the last one to install by hand.)
### Changed
- Dash's code is public on GitHub, so the update check now finds new versions.

## [0.4.2] — 2026-11-16
### Added
- "What's new": after an update, the main window shows what changed since the version you had.
### Changed
- The release pages on GitHub list the changes from this changelog.

## [0.4.1] — 2026-11-16
### Fixed
- Windows: the quick-add panel no longer freezes on its first frame when it opens over the main window.

## [0.4.0] — 2026-11-16
### Added
- Attach files to a task's notes: pick them, drop them in or paste them.
- Update check once a day, with a switch and "Check now" in Settings and a small notice when a new version is out.
- The main window opens on the folder you had open last.
- Downloads for Windows (x64) and macOS (Apple Silicon and Intel, macOS 11 or later), each with a SHA-256 checksum.
### Changed
- Leaving the "Next week" view goes back to Active instead of All.
- The windows only ever show Dash's own pages.
### Fixed
- Notes typed in the main window's composer are saved with the new task instead of being lost.
- The hotkey, "Stay on top of fullscreen apps" and the update switch no longer reset themselves after a PC restart.
- "Next week" covers the whole of next week, not just the next 7 days.

## [0.3.2] — 2026-09-21
### Added
- Add notes while creating a task, in the quick-add window and in the main window.

## [0.3.1] — 2026-09-18
### Added
- Notes on tasks: a sidebar on the right that saves as you type; the first line shows under the task title.
- "Stay on top of fullscreen apps" for the quick-add window.
- In a narrow window the folders slide in from a menu button.
### Changed
- The list opens on Active tasks.
### Fixed
- A task deleted while accounts are linked no longer comes back after linking again.

## [0.3.0] — 2026-08-25
### Added
- Folders: file tasks into named folders, browse them from a sidebar, pick one in the composer or on each task, and move several tasks at once with multi-select. Deleting a folder asks first and keeps its tasks.
- Account linking in Settings: the accounts on this computer share one task list; this account's tasks are merged in the first time.
- A "Next week" view in the sort menu.
### Changed
- New app icon and a neutral graphite look, light and dark.
- The calendar starts weeks on Monday, and tasks are sorted by due date by default.
- The quick-add window is frosted glass again, with its fluid entrance.

## [0.2.0] — 2026-07-17
### Added
- The installer can install Dash for everyone on this computer.
### Changed
- Started at login, Dash stays in the tray instead of opening its window.
- New icons throughout.
### Fixed
- Start at login keeps pointing at the current copy of Dash.

## [0.1.0] — 2026-06-29
### Added
- First release: a to-do list in the tray, a global hotkey that opens a quick-add window from anywhere, due dates, and a main window to filter, sort, edit and complete tasks.
