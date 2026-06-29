use std::str::FromStr;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WindowEvent,
};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};
use tauri_plugin_sql::{Migration, MigrationKind};

const QUICK_LABEL: &str = "quick";
const MAIN_LABEL: &str = "main";

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

// ---- App entry -------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
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
    }];

    tauri::Builder::default()
        // single-instance MUST be the first plugin registered.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // A second launch just surfaces the existing instance.
            show_main(app);
        }))
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:dash.db", migrations)
                .build(),
        )
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
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            hide_quick,
            open_main,
            update_shortcut,
            suspend_shortcut
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
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Dash");
}
