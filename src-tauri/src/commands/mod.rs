use crate::AppState;
use crate::db::{Group, Phrase, TextExpansion, ProcessRule, Setting};
use tauri::AppHandle;
use tauri::Manager;
use std::sync::MutexGuard;

fn lock_db<'a>(state: &'a tauri::State<'_, AppState>) -> Result<MutexGuard<'a, crate::db::Database>, String> {
    state.db.lock().map_err(|e| e.to_string())
}

// ==================== Groups ====================

#[tauri::command]
pub fn get_groups(state: tauri::State<'_, AppState>) -> Result<Vec<Group>, String> {
    let db = lock_db(&state)?;
    db.get_groups().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_group(state: tauri::State<'_, AppState>, name: String, icon: String) -> Result<Group, String> {
    let db = lock_db(&state)?;
    db.create_group(&name, &icon).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_group(state: tauri::State<'_, AppState>, id: String, name: String, icon: String) -> Result<(), String> {
    let db = lock_db(&state)?;
    db.update_group(&id, &name, &icon).map_err(|e| e.to_string())
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
pub fn get_phrases_by_group(state: tauri::State<'_, AppState>, group_id: String) -> Result<Vec<Phrase>, String> {
    let db = lock_db(&state)?;
    db.get_phrases_by_group(&group_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_phrases(state: tauri::State<'_, AppState>, query: String) -> Result<Vec<Phrase>, String> {
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
) -> Result<Phrase, String> {
    let db = lock_db(&state)?;
    db.create_phrase(
        &group_id, &title, &content, &content_type,
        image_data.as_deref(), hotkey.as_deref(), abbreviation.as_deref(),
    ).map_err(|e| e.to_string())
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
) -> Result<(), String> {
    let db = lock_db(&state)?;
    db.update_phrase(
        &id, &title, &content, &content_type,
        image_data.as_deref(), hotkey.as_deref(), abbreviation.as_deref(), &group_id,
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_phrase(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let db = lock_db(&state)?;
    db.delete_phrase(&id).map_err(|e| e.to_string())
}

// ==================== Clipboard / Paste ====================

#[tauri::command]
pub fn paste_phrase(app: AppHandle, state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
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
        app.clipboard().write_text(phrase.content.clone()).map_err(|e| e.to_string())?;
    }

    // Small delay then paste
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(80));
        simulate_paste();
    });

    Ok(())
}

#[tauri::command]
pub fn copy_phrase_to_clipboard(app: AppHandle, state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
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
        app.clipboard().write_text(phrase.content).map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn copy_image_to_clipboard(app: &AppHandle, base64_data: &str) -> Result<(), String> {
    use base64::Engine;
    use base64::engine::general_purpose::STANDARD;

    let normalized = base64_data
        .split_once(',')
        .map(|(_, data)| data)
        .unwrap_or(base64_data);

    let bytes = STANDARD.decode(normalized)
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
    let keys = vec![EventType::KeyPress(Key::MetaLeft), EventType::KeyPress(Key::KeyV), EventType::KeyRelease(Key::KeyV), EventType::KeyRelease(Key::MetaLeft)];

    #[cfg(not(target_os = "macos"))]
    let keys = vec![EventType::KeyPress(Key::ControlLeft), EventType::KeyPress(Key::KeyV), EventType::KeyRelease(Key::KeyV), EventType::KeyRelease(Key::ControlLeft)];

    for event in keys {
        if let Err(e) = simulate(&event) {
            log::warn!("Failed to simulate key: {:?}", e);
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
}

// ==================== Text Expansions ====================

#[tauri::command]
pub fn get_text_expansions(state: tauri::State<'_, AppState>) -> Result<Vec<TextExpansion>, String> {
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
    db.create_text_expansion(&abbreviation, &expanded_text).map_err(|e| e.to_string())
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
    db.update_text_expansion(&id, &abbreviation, &expanded_text, enabled).map_err(|e| e.to_string())
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
    db.set_process_rule(&process_name, &group_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_process_rule(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let db = lock_db(&state)?;
    db.delete_process_rule(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_active_process_name() -> Result<String, String> {
    crate::platform::get_active_process_name().ok_or_else(|| "Could not get active process".to_string())
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
pub fn update_setting(state: tauri::State<'_, AppState>, key: String, value: String) -> Result<(), String> {
    let db = lock_db(&state)?;
    db.update_setting(&key, &value).map_err(|e| e.to_string())
}

// ==================== Import / Export ====================

#[tauri::command]
pub fn export_data(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let db = lock_db(&state)?;
    db.export_all().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_data(state: tauri::State<'_, AppState>, data: serde_json::Value) -> Result<(), String> {
    let db = lock_db(&state)?;
    db.import_data(&data).map_err(|e| e.to_string())
}
