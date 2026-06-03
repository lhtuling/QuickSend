use crate::db::{Group, Phrase, ProcessRule, Setting, TextExpansion};
use crate::input::{normalize_hotkey, POPUP_HOTKEY_SETTING};
use crate::AppState;
use serde::Serialize;
use std::sync::MutexGuard;
use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

fn lock_db<'a>(
    state: &'a tauri::State<'_, AppState>,
) -> Result<MutexGuard<'a, crate::db::Database>, String> {
    state.db.lock().map_err(|e| e.to_string())
}

#[derive(Debug, Serialize)]
pub struct LanguagePack {
    id: String,
    name: Option<String>,
    translations: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct I18nContext {
    system_locale: String,
    language_dir: String,
    languages: Vec<LanguagePack>,
}

// ==================== Groups ====================

#[tauri::command]
pub fn get_groups(state: tauri::State<'_, AppState>) -> Result<Vec<Group>, String> {
    let db = lock_db(&state)?;
    db.get_groups().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_group(
    state: tauri::State<'_, AppState>,
    name: String,
    icon: String,
) -> Result<Group, String> {
    let db = lock_db(&state)?;
    db.create_group(&name, &icon).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_group(
    state: tauri::State<'_, AppState>,
    id: String,
    name: String,
    icon: String,
) -> Result<(), String> {
    let db = lock_db(&state)?;
    db.update_group(&id, &name, &icon)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_group(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let db = lock_db(&state)?;
    db.delete_group(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reorder_groups(state: tauri::State<'_, AppState>, ids: Vec<String>) -> Result<(), String> {
    let db = lock_db(&state)?;
    db.reorder_groups(&ids).map_err(|e| e.to_string())
}

// ==================== Phrases ====================

#[tauri::command]
pub fn get_phrases(state: tauri::State<'_, AppState>) -> Result<Vec<Phrase>, String> {
    let db = lock_db(&state)?;
    db.get_phrases().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_phrases_by_group(
    state: tauri::State<'_, AppState>,
    group_id: String,
) -> Result<Vec<Phrase>, String> {
    let db = lock_db(&state)?;
    db.get_phrases_by_group(&group_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_phrases(
    state: tauri::State<'_, AppState>,
    query: String,
) -> Result<Vec<Phrase>, String> {
    let db = lock_db(&state)?;
    db.search_phrases(&query).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_phrase(
    state: tauri::State<'_, AppState>,
    group_id: String,
    title: String,
    content: String,
    content_type: String,
    image_data: Option<String>,
    hotkey: Option<String>,
    abbreviation: Option<String>,
    tags: Option<String>,
) -> Result<Phrase, String> {
    let db = lock_db(&state)?;
    db.create_phrase(
        &group_id,
        &title,
        &content,
        &content_type,
        image_data.as_deref(),
        hotkey.as_deref(),
        abbreviation.as_deref(),
        tags.as_deref(),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_phrase(
    state: tauri::State<'_, AppState>,
    id: String,
    group_id: String,
    title: String,
    content: String,
    content_type: String,
    image_data: Option<String>,
    hotkey: Option<String>,
    abbreviation: Option<String>,
    tags: Option<String>,
) -> Result<(), String> {
    let db = lock_db(&state)?;
    db.update_phrase(
        &id,
        &title,
        &content,
        &content_type,
        image_data.as_deref(),
        hotkey.as_deref(),
        abbreviation.as_deref(),
        tags.as_deref(),
        &group_id,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_phrase(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let db = lock_db(&state)?;
    db.delete_phrase(&id).map_err(|e| e.to_string())
}

// ==================== Clipboard / Paste ====================

#[tauri::command]
pub fn paste_phrase(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    paste_phrase_internal(&app, &state, &id)
}

pub fn paste_phrase_internal(app: &AppHandle, state: &AppState, id: &str) -> Result<(), String> {
    let phrase = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_phrase_by_id(id).map_err(|e| e.to_string())?
    };

    // Hide before touching the clipboard, especially for images which may take a moment.
    if let Some(win) = app.get_webview_window("popup") {
        let _ = win.hide();
    }

    if phrase.content_type == "image" {
        if let Some(img_data) = phrase.image_data.as_deref() {
            copy_image_to_clipboard(app, img_data)?;
        }
    } else {
        // Copy text to clipboard
        use tauri_plugin_clipboard_manager::ClipboardExt;
        app.clipboard()
            .write_text(phrase.content.clone())
            .map_err(|e| e.to_string())?;
    }

    // Small delay then paste
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(80));
        simulate_paste();
    });

    record_phrase_usage_internal(state, id);

    Ok(())
}

#[tauri::command]
pub fn paste_text_content(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    text: String,
    phrase_id: Option<String>,
) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("popup") {
        let _ = win.hide();
    }

    use tauri_plugin_clipboard_manager::ClipboardExt;
    app.clipboard()
        .write_text(text)
        .map_err(|e| e.to_string())?;

    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(80));
        simulate_paste();
    });

    if let Some(id) = phrase_id.as_deref() {
        let app_state: &AppState = &state;
        record_phrase_usage_internal(app_state, id);
    }

    Ok(())
}

#[tauri::command]
pub fn record_phrase_usage(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let db = lock_db(&state)?;
    db.record_phrase_usage(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_phrase_favorite(
    state: tauri::State<'_, AppState>,
    id: String,
    favorite: bool,
) -> Result<(), String> {
    let db = lock_db(&state)?;
    db.update_phrase_favorite(&id, favorite)
        .map_err(|e| e.to_string())
}

pub fn record_phrase_usage_internal(state: &AppState, id: &str) {
    if let Ok(db) = state.db.lock() {
        if let Err(err) = db.record_phrase_usage(id) {
            log::warn!("Failed to record phrase usage: {}", err);
        }
    }
}

#[tauri::command]
pub fn copy_phrase_to_clipboard(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let phrase = {
        let db = lock_db(&state)?;
        db.get_phrase_by_id(&id).map_err(|e| e.to_string())?
    };

    if let Some(win) = app.get_webview_window("popup") {
        let _ = win.hide();
    }

    if phrase.content_type == "image" {
        if let Some(img_data) = phrase.image_data.as_deref() {
            copy_image_to_clipboard(&app, img_data)?;
        }
    } else {
        use tauri_plugin_clipboard_manager::ClipboardExt;
        app.clipboard()
            .write_text(phrase.content)
            .map_err(|e| e.to_string())?;
    }

    {
        let db = lock_db(&state)?;
        db.record_phrase_usage(&id).map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn copy_image_to_clipboard(app: &AppHandle, base64_data: &str) -> Result<(), String> {
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;

    let normalized = base64_data
        .split_once(',')
        .map(|(_, data)| data)
        .unwrap_or(base64_data);

    let bytes = STANDARD
        .decode(normalized)
        .map_err(|e| format!("Failed to decode image: {}", e))?;
    let image = tauri::image::Image::from_bytes(&bytes)
        .map_err(|e| format!("Failed to read image: {}", e))?;

    use tauri_plugin_clipboard_manager::ClipboardExt;
    app.clipboard()
        .write_image(&image)
        .map_err(|e| e.to_string())
}

pub fn simulate_paste() {
    use rdev::{simulate, EventType, Key};

    #[cfg(target_os = "macos")]
    let keys = vec![
        EventType::KeyPress(Key::MetaLeft),
        EventType::KeyPress(Key::KeyV),
        EventType::KeyRelease(Key::KeyV),
        EventType::KeyRelease(Key::MetaLeft),
    ];

    #[cfg(not(target_os = "macos"))]
    let keys = vec![
        EventType::KeyPress(Key::ControlLeft),
        EventType::KeyPress(Key::KeyV),
        EventType::KeyRelease(Key::KeyV),
        EventType::KeyRelease(Key::ControlLeft),
    ];

    for event in keys {
        if let Err(e) = simulate(&event) {
            log::warn!("Failed to simulate key: {:?}", e);
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
}

// ==================== Text Expansions ====================

#[tauri::command]
pub fn get_text_expansions(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<TextExpansion>, String> {
    let db = lock_db(&state)?;
    db.get_text_expansions().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_text_expansion(
    state: tauri::State<'_, AppState>,
    abbreviation: String,
    expanded_text: String,
) -> Result<TextExpansion, String> {
    let db = lock_db(&state)?;
    db.create_text_expansion(&abbreviation, &expanded_text)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_text_expansion(
    state: tauri::State<'_, AppState>,
    id: String,
    abbreviation: String,
    expanded_text: String,
    enabled: bool,
) -> Result<(), String> {
    let db = lock_db(&state)?;
    db.update_text_expansion(&id, &abbreviation, &expanded_text, enabled)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_text_expansion(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let db = lock_db(&state)?;
    db.delete_text_expansion(&id).map_err(|e| e.to_string())
}

// ==================== Process Rules ====================

#[tauri::command]
pub fn get_process_rules(state: tauri::State<'_, AppState>) -> Result<Vec<ProcessRule>, String> {
    let db = lock_db(&state)?;
    db.get_process_rules().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_process_rule(
    state: tauri::State<'_, AppState>,
    process_name: String,
    group_id: String,
) -> Result<ProcessRule, String> {
    let db = lock_db(&state)?;
    db.set_process_rule(&process_name, &group_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_process_rule(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let db = lock_db(&state)?;
    db.delete_process_rule(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_active_process_name() -> Result<String, String> {
    crate::platform::get_active_process_name()
        .ok_or_else(|| "Could not get active process".to_string())
}

#[tauri::command]
pub fn get_autostart_enabled() -> Result<bool, String> {
    crate::platform::is_autostart_enabled()
}

#[tauri::command]
pub fn set_autostart_enabled(enabled: bool) -> Result<bool, String> {
    crate::platform::set_autostart_enabled(enabled)?;
    crate::platform::is_autostart_enabled()
}

// ==================== Settings ====================

#[tauri::command]
pub fn get_settings(state: tauri::State<'_, AppState>) -> Result<Vec<Setting>, String> {
    let db = lock_db(&state)?;
    db.get_settings().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_setting(
    state: tauri::State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), String> {
    let db = lock_db(&state)?;
    db.update_setting(&key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_popup_hotkey(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    hotkey: String,
) -> Result<String, String> {
    let normalized = normalize_popup_hotkey(&hotkey)?;
    validate_global_hotkey_available(&app, &normalized)?;

    let db = lock_db(&state)?;
    db.update_setting(POPUP_HOTKEY_SETTING, &normalized)
        .map_err(|e| e.to_string())?;

    Ok(normalized)
}

fn normalize_popup_hotkey(hotkey: &str) -> Result<String, String> {
    let normalized = normalize_hotkey(hotkey);
    let parts = normalized
        .split('+')
        .filter(|part| !part.trim().is_empty())
        .collect::<Vec<_>>();

    if parts.len() < 2
        || !parts[..parts.len() - 1]
            .iter()
            .any(|part| matches!(*part, "Ctrl" | "Alt" | "Shift" | "Meta"))
    {
        return Err("Shortcut must include at least one modifier key.".to_string());
    }

    global_shortcut_accelerator(&normalized)
        .parse::<tauri_plugin_global_shortcut::Shortcut>()
        .map_err(|e| e.to_string())?;

    Ok(normalized)
}

fn validate_global_hotkey_available(app: &AppHandle, hotkey: &str) -> Result<(), String> {
    let accelerator = global_shortcut_accelerator(hotkey);

    app.global_shortcut().register(accelerator.as_str()).map_err(|e| {
        format!(
            "Shortcut is already used by the system or another app: {}",
            e
        )
    })?;

    app.global_shortcut().unregister(accelerator.as_str()).map_err(|e| {
        format!(
            "Shortcut was registered for validation but could not be released: {}",
            e
        )
    })?;

    Ok(())
}

fn global_shortcut_accelerator(hotkey: &str) -> String {
    hotkey
        .split('+')
        .map(|part| if part == "Meta" { "Super" } else { part })
        .collect::<Vec<_>>()
        .join("+")
}

#[tauri::command]
pub fn get_i18n_context() -> Result<I18nContext, String> {
    let language_dir = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("quicksend")
        .join("languages");
    std::fs::create_dir_all(&language_dir).map_err(|e| e.to_string())?;

    Ok(I18nContext {
        system_locale: system_locale(),
        language_dir: language_dir.to_string_lossy().to_string(),
        languages: read_language_packs(&language_dir),
    })
}

// ==================== Import / Export ====================

#[tauri::command]
pub fn export_data(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let db = lock_db(&state)?;
    db.export_all().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_data(
    state: tauri::State<'_, AppState>,
    data: serde_json::Value,
) -> Result<(), String> {
    let db = lock_db(&state)?;
    db.import_data(&data).map_err(|e| e.to_string())
}

fn read_language_packs(language_dir: &std::path::Path) -> Vec<LanguagePack> {
    let Ok(entries) = std::fs::read_dir(language_dir) else {
        return Vec::new();
    };

    entries
        .filter_map(Result::ok)
        .filter(|entry| entry.path().extension().and_then(|value| value.to_str()) == Some("json"))
        .filter_map(|entry| {
            let text = std::fs::read_to_string(entry.path()).ok()?;
            let value = serde_json::from_str::<serde_json::Value>(&text).ok()?;
            let object = value.as_object()?;
            let translations = object
                .get("translations")
                .and_then(|item| item.as_object())
                .cloned()
                .or_else(|| {
                    let mut flat = object.clone();
                    flat.remove("id");
                    flat.remove("name");
                    Some(flat)
                })?;

            let id = object
                .get("id")
                .and_then(|item| item.as_str())
                .map(str::to_string)
                .or_else(|| {
                    entry
                        .path()
                        .file_stem()
                        .and_then(|item| item.to_str())
                        .map(str::to_string)
                })?;
            let name = object
                .get("name")
                .and_then(|item| item.as_str())
                .map(str::to_string);

            Some(LanguagePack {
                id,
                name,
                translations,
            })
        })
        .collect()
}

#[cfg(target_os = "windows")]
fn system_locale() -> String {
    use windows::Win32::Globalization::GetUserDefaultLocaleName;

    let mut buffer = [0u16; 85];
    let len = unsafe { GetUserDefaultLocaleName(&mut buffer) };
    if len > 0 {
        String::from_utf16_lossy(&buffer[..len as usize - 1])
    } else {
        "zh-CN".to_string()
    }
}

#[cfg(not(target_os = "windows"))]
fn system_locale() -> String {
    std::env::var("LANG")
        .ok()
        .and_then(|value| value.split('.').next().map(|item| item.replace('_', "-")))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "zh-CN".to_string())
}
