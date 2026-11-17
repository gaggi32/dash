# Dash

Tauri v2 desktop app for Windows and macOS: a tray to-do list with a global
hotkey quick-add window, notes and attachments, on a local SQLite file. It
talks to the network only for the update check (GitHub). Sibling apps with the
same shape: `C:\dev\flashcards`, `C:\dev\lingo`.

## Commands
- `npm install` once.
- `npm run tauri:dev` runs the app (Vite on :1420 + Rust debug build). On
  Windows use `run-dev.cmd` if linking fails with LNK1104.
- `npm test` Vitest (pure modules in `src/lib`).
- `npm run typecheck` tsc.
- `cargo test --manifest-path src-tauri/Cargo.toml` Rust unit tests (needs
  `dist/` to exist; `mkdir dist` if missing).
- `npm run tauri:build` local installer in `src-tauri/target/release/bundle/`.
- Icon: `npx tauri icon app-icon.png`, then delete everything in
  `src-tauri/icons/` except the five files `tauri.conf.json` lists.

## Testing without touching real data
The installed app and `tauri dev` share the identifier
`com.dash.quickcapture`: a dev run while Dash is running exits at once (single
instance), and otherwise uses the real `dash.db`. Run dev builds under another
identifier: `npx tauri dev --config '{"identifier":"com.dash.quickcapture.dev"}'`
(the default hotkey stays with the installed app if it is running).
WebView2 debugging: set
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9334` and read
`http://localhost:9334/json`. Never drive the GUI while Michele may be using
the PC.

## Layout
- `src-tauri/src/lib.rs` windows (built in Rust behind a navigation guard),
  tray, hotkey, attachments, account linking, update check, every command.
- `src-tauri/src/settings.rs` `settings.json` (hotkey, switches), written
  tmp + rename; `src/lib/settings.ts` its commands and the one-time carry-over
  from localStorage. Never keep a user setting in localStorage: WebView2 drops
  recent writes when the tray app is killed at a restart.
- `src/lib/db.ts` all SQL (tauri-plugin-sql); `link.ts` the one-time merge
  into the shared database; `updates.ts` the update check schedule.
- `src/quick/` the hotkey window; `src/full/` the main window.
- `CHANGELOG.md` bundled with `?raw` (`src/lib/releases.ts`), parsed by
  `src/lib/changelog.ts` for the main window's "What's new" card
  (`src/full/WhatsNew.tsx`), shown once after an update; `lastSeenVersion` in
  `settings.json` remembers what was seen.

## Conventions
- Data stays in `tauri-plugin-sql` (not a Rust-owned rusqlite like
  Flashcards): the windows load only bundled code under a strict CSP with no
  remote content and no HTML injection, so the SQL permission is not reachable
  by anyone but the app's own code. Account linking also needs two databases
  open by connection string. Revisit if the UI ever renders remote or HTML
  content.
- User text only goes into SQL as a bound `$n` parameter.
- The UI never names a URL or a file path for Rust: links go through
  `open_download_page` (fixed URL), files through the attachment commands
  (sanitised names, numeric ids).
- Schema changes: add the next `Migration` in `lib.rs`. Never edit a shipped one.
- Do not change the identifier (`com.dash.quickcapture`, the data folder name)
  or set `bundle.publisher` (NSIS finds the old install via
  `Software\<publisher>\<product>`) without a carry-over like Flashcards'.
- Version lives in three places: `package.json`, `src-tauri/tauri.conf.json`,
  `src-tauri/Cargo.toml`. The release job refuses a tag that does not match all
  three.
- The repo is public (since 2026-11-17; recreated that day so no pre-rewrite
  commits remain). The update check reads
  `api.github.com/repos/gaggi32/dash/releases/latest` without a token, and the
  in-app updater (`install_update`, main window only) reads
  `releases/latest/download/latest.json`, so both need the repo public.

## Releasing
Every release first adds its section to `CHANGELOG.md`:
`## [X.Y.Z] — YYYY-MM-DD`, then `### Added / Changed / Fixed / Removed`, one
line per change a user would notice (not internal names), checked against
`git log --no-merges <last tag>..HEAD`. That section is the GitHub release
notes and the in-app "What's new" card; the release job refuses a tag without
one, and `npm test` fails when `package.json`'s version has none.
Then bump the three versions, commit, tag `vX.Y.Z`, push the tag.
`.github/workflows/release.yml` tests, builds Windows x64 + macOS arm64/x64,
signs each build for the updater, uploads installers, `.sha256`, `.sig` and
`latest.json` to a draft release and publishes it in the `release` environment
(deployment tags `v*`). macOS runners sometimes never start: rerun the failed
jobs.
Updater key: `C:\Users\miche\.tauri\dash-updater.key` and `.password` (never in
the repo or the vault), stored as repo secrets `TAURI_SIGNING_PRIVATE_KEY` /
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; the public key is
`plugins.updater.pubkey` in `tauri.conf.json`. Without the secrets the build
fails. Builds signed with another key are refused by installed apps, so losing
it means everyone installs by hand once more.

After it is published, point the 404canvas download page (404canvas.ch/projects/dash) at it: `C:\devĄcanvas\privateelease-dash.json` (version, the three asset URLs, SHA-256 from the release's `.sha256` files), commit "release: Dash vX.Y.Z", push.

## Only Michele can do
- Keep the repo public (the update check and the updater read its releases
  without a token).
- Keep a backup of the updater key and its password (a password manager), and
  set the two repo secrets from them.
- Code signing certificates (Apple Developer ID, Windows signing) if wanted.
