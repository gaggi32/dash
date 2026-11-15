use std::path::PathBuf;
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use serde::Serialize;
use serde_json::Value as Json;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    WindowEvent,
};
#[cfg(not(debug_assertions))]
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};
use tauri_plugin_sql::{Migration, MigrationKind};

/// Flag we pass to ourselves in the autostart registration. When Windows/macOS
/// launches Dash at login it runs `Dash --hidden`, so we can stay in the tray
/// instead of popping the main window in the user's face.
const AUTOSTART_FLAG: &str = "--hidden";

const QUICK_LABEL: &str = "quick";
const MAIN_LABEL: &str = "main";

/// Where a newer version is downloaded. Fixed here: the UI never names a URL.
const DOWNLOAD_PAGE: &str = "https://github.com/gaggi32/dash/releases/latest";
/// The update check reads this (no token, so the repo has to be public).
const LATEST_RELEASE: &str = "https://api.github.com/repos/gaggi32/dash/releases/latest";

/// One HTTP client for the process; used only by the update check.
struct Http(reqwest::Client);

/// Shared flag for the fullscreen-topmost watchdog (see [`spawn_topmost_watch`]).
struct TopmostWatch(Arc<AtomicBool>);

/// While true, losing focus doesn't hide the quick-add window. The native file
/// picker takes focus from it, and without this the window would vanish (taking
/// the half-written task with it) the moment the picker opened.
struct HoldQuick(Arc<AtomicBool>);

/// Connection string for this account's private database. Resolved by
/// tauri-plugin-sql against the per-user app data dir.
const LOCAL_DB_URL: &str = "sqlite:dash.db";

/// Marker file in the app config dir. Its mere presence means "this account is
/// linked to the shared database" — cheaper than taking on a JSON dependency
/// just to persist one boolean.
const LINK_MARKER: &str = "linked";

/// Directory holding the shared database, on platforms with a location every
/// local account can write to without elevation. `None` means account linking
/// is unavailable and the Settings toggle stays hidden.
fn shared_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        // %PUBLIC% is C:\Users\Public, which grants Modify to every local
        // account by default — no installer ACL work, no elevation prompt.
        std::env::var_os("PUBLIC").map(|p| PathBuf::from(p).join("Dash"))
    }
    #[cfg(target_os = "macos")]
    {
        Some(PathBuf::from("/Users/Shared/Dash"))
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        None
    }
}

fn shared_db_url() -> Option<String> {
    shared_dir().map(|d| format!("sqlite:{}", d.join("dash.db").display()))
}

fn marker_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|d| d.join(LINK_MARKER))
        .map_err(|e| e.to_string())
}

fn linked(app: &AppHandle) -> bool {
    marker_path(app).map(|p| p.exists()).unwrap_or(false)
}

/// Default hotkey: ⌘⇧Space on macOS, Ctrl⇧Space everywhere else.
fn default_shortcut() -> Shortcut {
    #[cfg(target_os = "macos")]
    let mods = Modifiers::SUPER | Modifiers::SHIFT;
    #[cfg(not(target_os = "macos"))]
    let mods = Modifiers::CONTROL | Modifiers::SHIFT;
    Shortcut::new(Some(mods), Code::Space)
}

// ---- Windows ---------------------------------------------------------------
//
// Both windows are built here rather than declared in tauri.conf.json, so each
// gets a navigation guard: the webviews can only ever show the app's own pages,
// and window.open / target=_blank open nothing.

/// The app's own pages only. In dev that is the Vite server; in a build it is
/// Tauri's asset protocol (tauri://localhost on macOS, http(s)://tauri.localhost
/// on Windows).
fn is_app_url(url: &Url) -> bool {
    match url.scheme() {
        "tauri" => true,
        "http" | "https" => match url.host_str() {
            Some("tauri.localhost") => true,
            Some("localhost") => cfg!(debug_assertions) && url.port() == Some(1420),
            _ => false,
        },
        _ => false,
    }
}

fn build_main(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    WebviewWindowBuilder::new(app, MAIN_LABEL, WebviewUrl::App("index.html".into()))
        .title("Dash")
        .inner_size(900.0, 640.0)
        .min_inner_size(640.0, 360.0)
        .resizable(true)
        .center()
        .visible(false)
        // Lets the notes panel take HTML5 file drops instead of the OS handler.
        .disable_drag_drop_handler()
        .on_navigation(|url| is_app_url(url))
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .build()
}

fn build_quick(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    WebviewWindowBuilder::new(app, QUICK_LABEL, WebviewUrl::App("quick.html".into()))
        .title("Quick Add")
        .inner_size(460.0, 168.0)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .center()
        .visible(false)
        .shadow(false)
        .disable_drag_drop_handler()
        .on_navigation(|url| is_app_url(url))
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .build()
}

/// Toggle the borderless quick-add window: show+center+focus, or hide.
fn toggle_quick(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(QUICK_LABEL) {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            let _ = win.center();
            let _ = win.show();
            let _ = win.set_focus();
            // Tell the frontend to reset + focus the text input.
            let _ = win.emit("quick-focus", ());
        }
    }
}

/// Show and focus the full window (it exists but starts hidden).
fn show_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(MAIN_LABEL) {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

// ---- Attachments -----------------------------------------------------------
//
// Files attached to a task's notes are copied into the app's own storage rather
// than referenced by path, so they survive the original being moved or deleted
// and are reachable from every linked account. Layout: `<root>/<id>/<name>`,
// where the id is unique and the name is kept so the default app opens a file
// that still looks like what the user attached.

const ATTACHMENTS_DIR: &str = "attachments";

fn private_attachments_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join(ATTACHMENTS_DIR))
        .map_err(|e| e.to_string())
}

fn shared_attachments_dir() -> Option<PathBuf> {
    shared_dir().map(|d| d.join(ATTACHMENTS_DIR))
}

/// Where new attachments go: beside the shared database while linked.
fn attachments_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if linked(app) {
        if let Some(dir) = shared_attachments_dir() {
            return Ok(dir);
        }
    }
    private_attachments_dir(app)
}

/// Every place an attachment might live, current location first, so a file
/// saved before linking (or after unlinking) is still found.
fn attachment_roots(app: &AppHandle) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(d) = attachments_dir(app) {
        roots.push(d);
    }
    if let Ok(d) = private_attachments_dir(app) {
        roots.push(d);
    }
    if let Some(d) = shared_attachments_dir() {
        roots.push(d);
    }
    roots.dedup();
    roots
}

/// Strips anything a file name can't carry on Windows (and path separators on
/// every platform), so a hostile or odd name can never escape its folder.
fn sanitize_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let cleaned: String = cleaned.trim().trim_matches('.').chars().take(120).collect();
    if cleaned.is_empty() {
        "file".to_string()
    } else {
        cleaned
    }
}

fn valid_attachment_id(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_digit() || c == '-')
}

/// Decodes the `%XX` escapes the frontend uses to smuggle a UTF-8 file name
/// through an ASCII-only header.
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
            if let Ok(v) = u8::from_str_radix(hex, 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

static ATTACHMENT_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Stores one file. The bytes arrive as the raw request body (no base64 round
/// trip) and the URL-encoded name in the `x-name` header. Returns `(id, name, size)`.
#[tauri::command]
fn save_attachment(
    app: AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<(String, String, u64), String> {
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else {
        return Err("Expected the file contents as a raw body.".to_string());
    };
    let raw_name = request
        .headers()
        .get("x-name")
        .and_then(|v| v.to_str().ok())
        .map(percent_decode)
        .unwrap_or_default();
    let name = sanitize_file_name(&raw_name);

    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let id = format!("{millis}-{}", ATTACHMENT_SEQ.fetch_add(1, Ordering::Relaxed));

    let dir = attachments_dir(&app)?.join(&id);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Couldn't create {}: {e}", dir.display()))?;
    std::fs::write(dir.join(&name), data).map_err(|e| format!("Couldn't save the file: {e}"))?;
    Ok((id, name, data.len() as u64))
}

fn find_attachment(app: &AppHandle, id: &str, name: &str) -> Result<PathBuf, String> {
    if !valid_attachment_id(id) {
        return Err("Invalid attachment id.".to_string());
    }
    let name = sanitize_file_name(name);
    attachment_roots(app)
        .into_iter()
        .map(|r| r.join(id).join(&name))
        .find(|p| p.is_file())
        .ok_or_else(|| "That file is no longer available.".to_string())
}

/// Opens an attachment with the system's default application.
#[tauri::command]
fn open_attachment(app: AppHandle, id: String, name: String) -> Result<(), String> {
    let path = find_attachment(&app, &id, &name)?;

    #[cfg(target_os = "windows")]
    let mut cmd = std::process::Command::new("explorer");
    #[cfg(target_os = "macos")]
    let mut cmd = std::process::Command::new("open");
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let mut cmd = std::process::Command::new("xdg-open");

    cmd.arg(&path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Couldn't open the file: {e}"))
}

/// Removes a stored attachment. Missing files are fine: the goal is "gone".
#[tauri::command]
fn delete_attachment(app: AppHandle, id: String) -> Result<(), String> {
    if !valid_attachment_id(&id) {
        return Err("Invalid attachment id.".to_string());
    }
    for root in attachment_roots(&app) {
        let dir = root.join(&id);
        if dir.is_dir() {
            std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Copies this account's attachments into the shared folder when linking, to go
/// with the tasks the frontend merges in. Existing ids are left alone.
fn merge_attachments_into_shared(app: &AppHandle) -> Result<(), String> {
    let (Ok(from), Some(to)) = (private_attachments_dir(app), shared_attachments_dir()) else {
        return Ok(());
    };
    let Ok(entries) = std::fs::read_dir(&from) else {
        return Ok(());
    };
    for entry in entries.flatten() {
        let target = to.join(entry.file_name());
        if target.exists() || !entry.path().is_dir() {
            continue;
        }
        std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
        for file in std::fs::read_dir(entry.path()).map_err(|e| e.to_string())?.flatten() {
            if file.path().is_file() {
                std::fs::copy(file.path(), target.join(file.file_name()))
                    .map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

/// Keep the quick window open while a native dialog (the file picker) has focus.
#[tauri::command]
fn hold_quick(app: AppHandle, hold: bool) {
    app.state::<HoldQuick>().0.store(hold, Ordering::Relaxed);
}

// ---- IPC commands callable from the frontend -------------------------------

#[tauri::command]
fn hide_quick(app: AppHandle) {
    if let Some(win) = app.get_webview_window(QUICK_LABEL) {
        let _ = win.hide();
    }
}

#[tauri::command]
fn open_main(app: AppHandle) {
    show_main(&app);
}

/// Connection string the frontend should open: the shared database when this
/// account is linked, otherwise its own private one.
#[tauri::command]
fn db_url(app: AppHandle) -> String {
    if linked(&app) {
        shared_db_url().unwrap_or_else(|| LOCAL_DB_URL.to_string())
    } else {
        LOCAL_DB_URL.to_string()
    }
}

/// This account's private database, regardless of link state. The frontend
/// opens it alongside the shared one to merge existing tasks in on first link.
#[tauri::command]
fn private_db_url() -> String {
    LOCAL_DB_URL.to_string()
}

/// Whether this platform has a shared location at all.
#[tauri::command]
fn sharing_supported() -> bool {
    shared_db_url().is_some()
}

#[tauri::command]
fn is_linked(app: AppHandle) -> bool {
    linked(&app)
}

/// Link or unlink this account, returning the connection string to use next.
/// The shared directory is created here rather than at startup so accounts that
/// never opt in leave nothing behind in the public folder.
#[tauri::command]
fn set_linked(app: AppHandle, enabled: bool) -> Result<String, String> {
    let marker = marker_path(&app)?;

    if enabled {
        let dir = shared_dir()
            .ok_or_else(|| "Account linking isn't supported on this platform.".to_string())?;
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Couldn't create {}: {e}", dir.display()))?;
        if let Some(parent) = marker.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(&marker, b"").map_err(|e| e.to_string())?;
        merge_attachments_into_shared(&app)?;
    } else if marker.exists() {
        std::fs::remove_file(&marker).map_err(|e| e.to_string())?;
    }

    Ok(db_url(app))
}

/// Re-register the global shortcut at runtime (used by the Settings panel).
#[tauri::command]
fn update_shortcut(app: AppHandle, accelerator: String) -> Result<(), String> {
    let shortcut = Shortcut::from_str(&accelerator)
        .map_err(|_| format!("Could not parse accelerator '{accelerator}'"))?;
    let gs = app.global_shortcut();
    gs.unregister_all().map_err(|e| e.to_string())?;
    gs.register(shortcut).map_err(|e| e.to_string())?;
    Ok(())
}

/// Temporarily release ALL global shortcuts so the webview can capture raw
/// keystrokes while the user is recording a new binding. Without this, the OS
/// swallows the currently-registered combo and the recorder never "sees" it.
/// The frontend re-registers (via `update_shortcut`) when recording finishes.
#[tauri::command]
fn suspend_shortcut(app: AppHandle) -> Result<(), String> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| e.to_string())
}

/// Toggle the fullscreen-topmost watchdog. `alwaysOnTop` in tauri.conf.json
/// asserts HWND_TOPMOST once, but a fullscreen game or video regularly steals
/// it back when it (re)gains focus, and Windows treats a maximized borderless
/// app as fullscreen the same way. Re-asserting on an interval — the same
/// trick overlay apps like Discord's use — makes the panel come back on top
/// within a beat instead of staying buried until the other app loses focus.
#[tauri::command]
fn set_topmost_watch(app: AppHandle, enabled: bool) -> Result<(), String> {
    app.state::<TopmostWatch>().0.store(enabled, Ordering::Relaxed);
    if enabled {
        if let Some(win) = app.get_webview_window(QUICK_LABEL) {
            win.set_always_on_top(true).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Background loop backing [`set_topmost_watch`]. Sleeps between checks so it
/// costs nothing while the setting is off.
fn spawn_topmost_watch(app: AppHandle, flag: Arc<AtomicBool>) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(750));
        if flag.load(Ordering::Relaxed) {
            if let Some(win) = app.get_webview_window(QUICK_LABEL) {
                let _ = win.set_always_on_top(true);
            }
        }
    });
}

// ---- Updates ---------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateInfo {
    current: String,
    latest: Option<String>,
    newer: bool,
}

fn parse_version(v: &str) -> Option<(u64, u64, u64)> {
    let mut it = v.trim().trim_start_matches('v').split('.').map(|p| p.parse::<u64>().ok());
    Some((it.next()??, it.next()??, it.next()??))
}

/// The version in a GitHub release answer ("tag_name": "v1.2.3" gives "1.2.3").
fn release_version(body: &Json) -> Option<String> {
    let tag = body.get("tag_name")?.as_str()?.trim();
    let v = tag.strip_prefix('v').unwrap_or(tag);
    (v.len() <= 20 && parse_version(v).is_some()).then(|| v.to_string())
}

fn is_newer(latest: &str, current: &str) -> bool {
    match (parse_version(latest), parse_version(current)) {
        (Some(l), Some(c)) => l > c,
        _ => false,
    }
}

/// Ask GitHub for the newest published release. Only its version is read;
/// installing is always the user's own download.
#[tauri::command]
async fn check_update(app: AppHandle) -> Result<UpdateInfo, String> {
    let current = app.package_info().version.to_string();
    let http = app.state::<Http>().0.clone();
    let res = http
        .get(LATEST_RELEASE)
        .header("Accept", "application/vnd.github+json")
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|_| "Could not reach GitHub".to_string())?;
    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("GitHub shows no public release yet".into());
    }
    if !res.status().is_success() {
        return Err(format!("GitHub answered {}", res.status()));
    }
    let body: Json = res.json().await.map_err(|_| "Unexpected answer".to_string())?;
    let latest = release_version(&body);
    let newer = latest.as_deref().map_or(false, |l| is_newer(l, &current));
    Ok(UpdateInfo { current, latest, newer })
}

#[tauri::command]
fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
fn open_download_page(app: AppHandle) -> Result<(), String> {
    app.opener()
        .open_url(DOWNLOAD_PAGE, None::<&str>)
        .map_err(|e| e.to_string())
}

// ---- Tray ------------------------------------------------------------------

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open_i = MenuItem::with_id(app, "open", "Open", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_i, &quit_i])?;

    TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Dash")
        .menu(&menu)
        // Menu only on right-click; left-click toggles the quick-add window.
        // (Older Tauri 2.0.x named this `menu_on_left_click`.)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_quick(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

// ---- Schema ----------------------------------------------------------------

fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_tasks_table",
            sql: "CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                due_date TEXT,
                completed INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_folders_table",
            // No REFERENCES clause: SQLite leaves foreign keys off by default,
            // so the app clears folder_id itself when a folder is deleted.
            sql: "CREATE TABLE IF NOT EXISTS folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            ALTER TABLE tasks ADD COLUMN folder_id INTEGER;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_task_notes",
            // NOT NULL with an empty default so existing rows (and the frontend)
            // never have to tell "no notes" and NULL apart.
            sql: "ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT '';",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_task_attachments",
            // A JSON array of { id, name, size }; the files themselves live on
            // disk (see the Attachments section above).
            sql: "ALTER TABLE tasks ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]';",
            kind: MigrationKind::Up,
        },
    ]
}

// ---- App entry -------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Both the private and the shared database need the same schema, and
    // tauri-plugin-sql keys migrations by connection string, so this runs twice.
    let sql = {
        let mut builder =
            tauri_plugin_sql::Builder::default().add_migrations(LOCAL_DB_URL, migrations());
        if let Some(shared) = shared_db_url() {
            builder = builder.add_migrations(&shared, migrations());
        }
        builder.build()
    };

    let builder = tauri::Builder::default()
        // single-instance MUST be the first plugin registered.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // A second launch just surfaces the existing instance.
            show_main(app);
        }))
        .plugin(sql)
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_quick(app);
                    }
                })
                .build(),
        );

    // Release builds only. The login entry is one per app name, not per
    // identifier, so a dev build that could touch it would point the real
    // install's entry at a debug exe — which opens a console at every login,
    // or does nothing once that exe is gone.
    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_autostart::init(
        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        Some(vec![AUTOSTART_FLAG]),
    ));

    builder
        .manage(TopmostWatch(Arc::new(AtomicBool::new(false))))
        .manage(HoldQuick(Arc::new(AtomicBool::new(false))))
        .invoke_handler(tauri::generate_handler![
            save_attachment,
            open_attachment,
            delete_attachment,
            hold_quick,
            hide_quick,
            open_main,
            update_shortcut,
            suspend_shortcut,
            set_topmost_watch,
            db_url,
            private_db_url,
            sharing_supported,
            is_linked,
            set_linked,
            check_update,
            app_version,
            open_download_page
        ])
        .on_window_event(|window, event| match event {
            // Click outside / focus loss hides the quick window instantly.
            WindowEvent::Focused(false)
                if window.label() == QUICK_LABEL
                    && !window.state::<HoldQuick>().0.load(Ordering::Relaxed) =>
            {
                let _ = window.hide();
            }
            // Closing the full window hides it to the tray instead of quitting.
            WindowEvent::CloseRequested { api, .. } if window.label() == MAIN_LABEL => {
                api.prevent_close();
                let _ = window.hide();
            }
            _ => {}
        })
        .setup(|app| {
            // On macOS, run as a menu-bar (Accessory) app: no Dock icon.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let handle = app.handle();

            app.manage(Http(
                reqwest::Client::builder()
                    .user_agent(concat!("Dash/", env!("CARGO_PKG_VERSION")))
                    .https_only(true)
                    .build()?,
            ));

            // Windows first: the hotkey and tray below may show them at once.
            build_main(handle)?;
            build_quick(handle)?;

            // Register the default global shortcut immediately so it works
            // before any webview has finished loading. A user-customised
            // accelerator is re-applied from the frontend on launch.
            if let Err(e) = handle.global_shortcut().register(default_shortcut()) {
                eprintln!("Failed to register default global shortcut: {e}");
            }

            build_tray(handle)?;

            let watch_flag = app.state::<TopmostWatch>().0.clone();
            spawn_topmost_watch(handle.clone(), watch_flag);

            // If autostart is on, re-register it so the login entry always points
            // at THIS executable, following the install if it moves (and healing
            // one left on a dev build by an older version).
            #[cfg(not(debug_assertions))]
            {
                let autostart = app.autolaunch();
                if autostart.is_enabled().unwrap_or(false) {
                    let _ = autostart.enable();
                }
            }

            // Launched at login (`--hidden`) → stay in the tray. Any other launch
            // (double-clicking the app) → show the main window so it's obvious
            // Dash actually started.
            let launched_hidden = std::env::args().any(|a| a == AUTOSTART_FLAG);
            if !launched_hidden {
                show_main(handle);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Dash");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_names_cannot_escape_their_folder() {
        assert_eq!(sanitize_file_name("../../evil.exe"), "_.._evil.exe");
        assert_eq!(sanitize_file_name("a\\b/c:d*e?f\"g<h>i|j"), "a_b_c_d_e_f_g_h_i_j");
        assert_eq!(sanitize_file_name("tab\there"), "tab_here");
        assert_eq!(sanitize_file_name("  ...  "), "file");
        assert_eq!(sanitize_file_name(""), "file");
        assert_eq!(sanitize_file_name("..hidden.."), "hidden");
        assert_eq!(sanitize_file_name(&"x".repeat(500)).len(), 120);
        assert_eq!(sanitize_file_name("Grüße 2026.pdf"), "Grüße 2026.pdf");
    }

    #[test]
    fn percent_escapes_decode_to_utf8() {
        assert_eq!(percent_decode("Gr%C3%BC%C3%9Fe.txt"), "Grüße.txt");
        assert_eq!(percent_decode("a%20b"), "a b");
        // Broken escapes are kept as typed rather than dropped.
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("%zz"), "%zz");
        assert_eq!(percent_decode("%2"), "%2");
    }

    #[test]
    fn attachment_ids_are_digits_and_dashes_only() {
        assert!(valid_attachment_id("1731500000000-0"));
        assert!(!valid_attachment_id(""));
        assert!(!valid_attachment_id(".."));
        assert!(!valid_attachment_id("1/../2"));
        assert!(!valid_attachment_id("C:\\x"));
    }

    #[test]
    fn webviews_only_show_the_apps_own_pages() {
        assert!(is_app_url(&Url::parse("tauri://localhost/index.html").unwrap()));
        assert!(is_app_url(&Url::parse("http://tauri.localhost/quick.html").unwrap()));
        assert!(is_app_url(&Url::parse("https://tauri.localhost/").unwrap()));
        assert!(!is_app_url(&Url::parse("https://evil.example/").unwrap()));
        assert!(!is_app_url(&Url::parse("file:///C:/Windows/win.ini").unwrap()));
        assert!(!is_app_url(&Url::parse("http://localhost:8080/").unwrap()));
        assert!(!is_app_url(&Url::parse("javascript:alert(1)").unwrap()));
    }

    #[test]
    fn versions_compare_numerically() {
        assert_eq!(parse_version("v0.4.0"), Some((0, 4, 0)));
        assert_eq!(parse_version("1.2"), None);
        assert_eq!(parse_version("1.2.x"), None);
        assert!(is_newer("0.10.0", "0.9.9"));
        assert!(is_newer("1.0.0", "0.99.99"));
        assert!(!is_newer("0.4.0", "0.4.0"));
        assert!(!is_newer("0.3.9", "0.4.0"));
        assert!(!is_newer("garbage", "0.4.0"));
    }

    #[test]
    fn release_tags_are_read_strictly() {
        let v = |j: &str| release_version(&serde_json::from_str(j).unwrap());
        assert_eq!(v(r#"{"tag_name":"v0.4.1"}"#).as_deref(), Some("0.4.1"));
        assert_eq!(v(r#"{"tag_name":"0.5.0"}"#).as_deref(), Some("0.5.0"));
        assert_eq!(v(r#"{"tag_name":"nightly"}"#), None);
        assert_eq!(v(r#"{"name":"v1.0.0"}"#), None);
        assert_eq!(v(r#"{"tag_name":5}"#), None);
    }
}
