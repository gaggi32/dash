use std::path::PathBuf;
use std::str::FromStr;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt;
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

    tauri::Builder::default()
        // single-instance MUST be the first plugin registered.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // A second launch just surfaces the existing instance.
            show_main(app);
        }))
        .plugin(sql)
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_quick(app);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![AUTOSTART_FLAG]),
        ))
        .invoke_handler(tauri::generate_handler![
            hide_quick,
            open_main,
            update_shortcut,
            suspend_shortcut,
            db_url,
            private_db_url,
            sharing_supported,
            is_linked,
            set_linked
        ])
        .on_window_event(|window, event| match event {
            // Click outside / focus loss hides the quick window instantly.
            WindowEvent::Focused(false) if window.label() == QUICK_LABEL => {
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

            // Register the default global shortcut immediately so it works
            // before any webview has finished loading. A user-customised
            // accelerator is re-applied from the frontend on launch.
            if let Err(e) = handle.global_shortcut().register(default_shortcut()) {
                eprintln!("Failed to register default global shortcut: {e}");
            }

            build_tray(handle)?;

            // If autostart is on, re-register it so the login entry always points
            // at THIS executable. This heals a stale path left behind by a dev
            // build (which would open a console and fail to reach the dev server).
            let autostart = app.autolaunch();
            if autostart.is_enabled().unwrap_or(false) {
                let _ = autostart.enable();
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
