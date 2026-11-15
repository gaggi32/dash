//! Persisted preferences.
//!
//! Everything lives in one JSON file inside the per-user app config directory
//! (`%APPDATA%\com.dash.quickcapture` on Windows, `~/Library/Application
//! Support/...` on macOS, `~/.config/...` on Linux). Every field carries a
//! default, so a missing, older or unreadable file still loads.
//!
//! ## Why not localStorage
//!
//! Up to 0.4.x the preferences lived in the webview's localStorage. WebView2
//! keeps that in a LevelDB log that is only closed cleanly when the webview
//! shuts down, and a tray app is usually killed instead (a PC restart does it):
//! at the next start Chromium finds a checksum mismatch and drops the latest
//! writes, so a toggle flipped since the last clean exit came back off. This
//! file is written whole and renamed into place, and Rust applies the hotkey and
//! the topmost watchdog from it at startup, before any webview has loaded.
//! [`Patch`] carries the old values over once (see `adopt_settings`).

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value as Json};
use tauri::{AppHandle, Manager};

const FILE: &str = "settings.json";

/// Default hotkey: ⌘⇧Space on macOS, Ctrl⇧Space everywhere else.
pub const DEFAULT_HOTKEY: &str = "CommandOrControl+Shift+Space";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// Tauri accelerator that toggles the quick-add window.
    pub hotkey: String,
    /// Keep re-asserting topmost on the quick-add window, so a fullscreen game
    /// or video that reclaims it does not leave the panel buried. Off by
    /// default: it is a niche need and (very marginally) busier.
    pub stay_on_top_fullscreen: bool,
    /// Ask GitHub once a day whether a newer release is out.
    pub check_updates: bool,
    /// The release whose notice the user dismissed with "Not now"; a later one
    /// shows it again. Empty when none was.
    pub dismissed_update: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            hotkey: DEFAULT_HOTKEY.into(),
            stay_on_top_fullscreen: false,
            check_updates: true,
            dismissed_update: String::new(),
        }
    }
}

/// Some of the fields above, as the webview sends them: a change from one
/// switch, or the values carried over from localStorage. A partial update keeps
/// one panel from writing back another's stale copy of the rest.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Patch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hotkey: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stay_on_top_fullscreen: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub check_updates: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dismissed_update: Option<String>,
}

impl Patch {
    pub fn apply_to(&self, settings: &mut Settings) {
        if let Some(v) = &self.hotkey {
            settings.hotkey = v.clone();
        }
        if let Some(v) = self.stay_on_top_fullscreen {
            settings.stay_on_top_fullscreen = v;
        }
        if let Some(v) = self.check_updates {
            settings.check_updates = v;
        }
        if let Some(v) = &self.dismissed_update {
            settings.dismissed_update = v.clone();
        }
    }

    /// Only the fields `file` does not mention. A value the file already holds
    /// was written by this version and is newer than anything in localStorage,
    /// so the carry-over never replaces it.
    pub fn missing_from(&self, file: &Map<String, Json>) -> Patch {
        let Ok(Json::Object(mut fields)) = serde_json::to_value(self) else {
            return Patch::default();
        };
        fields.retain(|k, _| !file.contains_key(k));
        serde_json::from_value(Json::Object(fields)).unwrap_or_default()
    }

    pub fn is_empty(&self) -> bool {
        *self == Patch::default()
    }
}

fn path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|d| d.join(FILE))
        .map_err(|e| format!("No config directory available: {e}"))
}

/// The file as a bare JSON object: empty when it is missing or unreadable.
pub fn read_raw(app: &AppHandle) -> Map<String, Json> {
    let Ok(p) = path(app) else {
        return Map::new();
    };
    let Ok(raw) = std::fs::read_to_string(&p) else {
        return Map::new();
    };
    match serde_json::from_str(&raw) {
        Ok(Json::Object(fields)) => fields,
        Ok(_) => Map::new(),
        Err(e) => {
            eprintln!("settings.json is not readable ({e}); starting from defaults");
            Map::new()
        }
    }
}

/// Settings from the file's fields, with a default for anything missing — a
/// corrupt or truncated file should not stop the app from starting.
fn parse(fields: Map<String, Json>) -> Settings {
    let mut settings: Settings = serde_json::from_value(Json::Object(fields)).unwrap_or_else(|e| {
        eprintln!("settings.json does not fit ({e}); starting from defaults");
        Settings::default()
    });
    settings.hotkey = settings.hotkey.trim().to_owned();
    if settings.hotkey.is_empty() {
        settings.hotkey = DEFAULT_HOTKEY.into();
    }
    settings.dismissed_update = settings.dismissed_update.trim().to_owned();
    settings
}

pub fn load(app: &AppHandle) -> Settings {
    parse(read_raw(app))
}

pub fn save(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let p = path(app)?;
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("Couldn't create {}: {e}", dir.display()))?;
    }
    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Couldn't encode settings: {e}"))?;
    // Write beside it and rename over it, so a crash mid-write never leaves a
    // half-written file (rename replaces the old one on every platform).
    let tmp = p.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| format!("Couldn't write {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, &p).map_err(|e| format!("Couldn't replace {}: {e}", p.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fields(raw: &str) -> Map<String, Json> {
        match serde_json::from_str(raw).unwrap() {
            Json::Object(f) => f,
            _ => panic!("not an object"),
        }
    }

    #[test]
    fn defaults_match_what_the_app_did_before() {
        let s = Settings::default();
        assert_eq!(s.hotkey, "CommandOrControl+Shift+Space");
        assert!(!s.stay_on_top_fullscreen);
        assert!(s.check_updates);
        assert_eq!(s.dismissed_update, "");
    }

    #[test]
    fn a_missing_or_empty_file_gives_the_defaults() {
        assert_eq!(parse(Map::new()), Settings::default());
        assert_eq!(parse(fields("{}")), Settings::default());
    }

    #[test]
    fn the_file_round_trips_as_camel_case() {
        let s = Settings {
            hotkey: "Alt+N".into(),
            stay_on_top_fullscreen: true,
            check_updates: false,
            dismissed_update: "0.5.0".into(),
        };
        let json = serde_json::to_string_pretty(&s).unwrap();
        for key in ["hotkey", "stayOnTopFullscreen", "checkUpdates", "dismissedUpdate"] {
            assert!(json.contains(key), "{json}");
        }
        assert_eq!(parse(fields(&json)), s);
    }

    #[test]
    fn missing_fields_take_their_defaults_and_unknown_ones_are_ignored() {
        let s = parse(fields(r#"{ "stayOnTopFullscreen": true, "fromTheFuture": 1 }"#));
        assert!(s.stay_on_top_fullscreen);
        assert_eq!(s.hotkey, DEFAULT_HOTKEY);
        assert!(s.check_updates);
    }

    #[test]
    fn a_blank_hotkey_falls_back_to_the_default() {
        assert_eq!(parse(fields(r#"{ "hotkey": "  " }"#)).hotkey, DEFAULT_HOTKEY);
        assert_eq!(parse(fields(r#"{ "hotkey": " Alt+N " }"#)).hotkey, "Alt+N");
    }

    #[test]
    fn a_field_of_the_wrong_type_does_not_stop_the_app() {
        assert_eq!(parse(fields(r#"{ "checkUpdates": "yes" }"#)), Settings::default());
    }

    #[test]
    fn a_patch_changes_only_what_it_names() {
        let mut s = Settings { hotkey: "Alt+N".into(), ..Settings::default() };
        let patch: Patch = serde_json::from_str(r#"{ "stayOnTopFullscreen": true }"#).unwrap();
        patch.apply_to(&mut s);
        assert!(s.stay_on_top_fullscreen);
        assert_eq!(s.hotkey, "Alt+N");
        assert!(s.check_updates);
    }

    #[test]
    fn the_carry_over_fills_only_what_the_file_lacks() {
        let legacy = Patch {
            hotkey: Some("Alt+N".into()),
            stay_on_top_fullscreen: Some(true),
            check_updates: Some(false),
            dismissed_update: None,
        };

        // No file yet: everything localStorage had comes across.
        assert_eq!(legacy.missing_from(&Map::new()), legacy);

        // The file already has a hotkey and the switch: those stay as they are.
        let file = fields(r#"{ "hotkey": "Alt+M", "stayOnTopFullscreen": false }"#);
        let adopted = legacy.missing_from(&file);
        assert_eq!(
            adopted,
            Patch { check_updates: Some(false), ..Patch::default() }
        );
        let mut s = parse(file);
        adopted.apply_to(&mut s);
        assert_eq!(s.hotkey, "Alt+M");
        assert!(!s.stay_on_top_fullscreen);
        assert!(!s.check_updates);

        // A full file (what every save writes) takes nothing.
        let full = fields(&serde_json::to_string(&Settings::default()).unwrap());
        assert!(legacy.missing_from(&full).is_empty());
    }
}
