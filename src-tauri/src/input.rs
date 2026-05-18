use crate::{commands, AppState};
use rdev::{listen, simulate, Event, EventType, Key};
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;

pub fn start_global_input_listener(app: AppHandle) {
    let _ = std::thread::Builder::new()
        .name("quicksend-input-listener".to_string())
        .spawn(move || {
            let mut tracker = InputTracker::new(app);
            if let Err(err) = listen(move |event| tracker.handle(event)) {
                log::error!("Global input listener stopped: {:?}", err);
            }
        });
}

struct InputTracker {
    app: AppHandle,
    ctrl: bool,
    alt: bool,
    shift: bool,
    meta: bool,
    popup_chord_opened: bool,
    typed: String,
    last_popup_toggle: Instant,
    last_hotkey_trigger: Instant,
}

impl InputTracker {
    fn new(app: AppHandle) -> Self {
        Self {
            app,
            ctrl: false,
            alt: false,
            shift: false,
            meta: false,
            popup_chord_opened: false,
            typed: String::new(),
            last_popup_toggle: Instant::now() - Duration::from_secs(5),
            last_hotkey_trigger: Instant::now() - Duration::from_secs(5),
        }
    }

    fn handle(&mut self, event: Event) {
        match event.event_type {
            EventType::KeyPress(key) => self.handle_key_press(key, event.name),
            EventType::KeyRelease(key) => self.handle_key_release(key),
            _ => {}
        }
    }

    fn handle_key_press(&mut self, key: Key, name: Option<String>) {
        self.set_modifier(key, true);

        if self.ctrl && self.alt && matches!(key, Key::KeyQ) && !self.popup_chord_opened {
            self.popup_chord_opened = true;
            self.toggle_popup();
            return;
        }

        if is_modifier(key) {
            return;
        }

        if self.handle_phrase_hotkey(key) {
            self.typed.clear();
            return;
        }

        self.record_typed_key(key, name);
    }

    fn handle_key_release(&mut self, key: Key) {
        let was_alt = self.alt && matches!(key, Key::Alt | Key::AltGr);
        let was_popup_chord = self.popup_chord_opened;
        self.set_modifier(key, false);

        if was_alt && !self.ctrl && !was_popup_chord {
            self.try_text_expansion();
        }

        if !self.ctrl || !self.alt {
            self.popup_chord_opened = false;
        }
    }

    fn set_modifier(&mut self, key: Key, pressed: bool) {
        match key {
            Key::ControlLeft | Key::ControlRight => self.ctrl = pressed,
            Key::Alt | Key::AltGr => self.alt = pressed,
            Key::ShiftLeft | Key::ShiftRight => self.shift = pressed,
            Key::MetaLeft | Key::MetaRight => self.meta = pressed,
            _ => {}
        }
    }

    fn toggle_popup(&mut self) {
        if self.last_popup_toggle.elapsed() < Duration::from_millis(350) {
            return;
        }
        self.last_popup_toggle = Instant::now();

        if let Err(err) = crate::toggle_popup(self.app.clone()) {
            log::warn!("Failed to toggle popup: {}", err);
        }
    }

    fn record_typed_key(&mut self, key: Key, name: Option<String>) {
        if matches!(key, Key::Backspace) {
            self.typed.pop();
            return;
        }

        if matches!(key, Key::Return | Key::Escape | Key::Tab) {
            self.typed.clear();
            return;
        }

        if self.ctrl || self.alt || self.meta {
            return;
        }

        if let Some(value) = name {
            if value.chars().count() == 1 && !value.chars().all(char::is_control) {
                self.typed.push_str(&value);
                if self.typed.chars().count() > 128 {
                    self.typed = self.typed.chars().rev().take(128).collect::<String>().chars().rev().collect();
                }
            }
        }
    }

    fn try_text_expansion(&mut self) {
        if self.typed.is_empty() {
            return;
        }

        let target = {
            let Some(state) = self.app.try_state::<AppState>() else {
                return;
            };
            if !state.text_expansion_active.load(Ordering::Relaxed) {
                return;
            }
            let Ok(db) = state.db.lock() else {
                return;
            };
            let Ok(expansions) = db.get_enabled_expansions() else {
                return;
            };

            expansions
                .into_iter()
                .filter(|item| item.enabled && self.typed.ends_with(&item.abbreviation))
                .max_by_key(|item| item.abbreviation.chars().count())
        };

        let Some(expansion) = target else {
            return;
        };

        self.typed.clear();
        let app = self.app.clone();
        std::thread::spawn(move || {
            let _ = app.clipboard().write_text(expansion.expanded_text);
            std::thread::sleep(Duration::from_millis(40));
            simulate_backspaces(expansion.abbreviation.chars().count());
            std::thread::sleep(Duration::from_millis(20));
            commands::simulate_paste();
        });
    }

    fn handle_phrase_hotkey(&mut self, key: Key) -> bool {
        let Some(combo) = build_hotkey_string(self.ctrl, self.alt, self.shift, self.meta, key) else {
            return false;
        };

        let phrase_id = {
            let Some(state) = self.app.try_state::<AppState>() else {
                return false;
            };
            let Ok(db) = state.db.lock() else {
                return false;
            };
            let Ok(phrases) = db.get_phrases() else {
                return false;
            };

            phrases
                .into_iter()
                .find(|phrase| {
                    phrase
                        .hotkey
                        .as_deref()
                        .map(|hotkey| normalize_hotkey(hotkey) == combo)
                        .unwrap_or(false)
                })
                .map(|phrase| phrase.id)
        };

        let Some(id) = phrase_id else {
            return false;
        };

        if self.last_hotkey_trigger.elapsed() < Duration::from_millis(450) {
            return true;
        }
        self.last_hotkey_trigger = Instant::now();

        let app = self.app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(130));
            release_all_modifiers();
            std::thread::sleep(Duration::from_millis(40));

            if let Some(state) = app.try_state::<AppState>() {
                if let Err(err) = commands::paste_phrase_internal(&app, &state, &id) {
                    log::warn!("Failed to paste phrase from hotkey {}: {}", combo, err);
                }
            }
        });

        true
    }
}

fn release_all_modifiers() {
    for key in [
        Key::ControlLeft,
        Key::ControlRight,
        Key::ShiftLeft,
        Key::ShiftRight,
        Key::Alt,
        Key::AltGr,
        Key::MetaLeft,
        Key::MetaRight,
    ] {
        let _ = simulate(&EventType::KeyRelease(key));
        std::thread::sleep(Duration::from_millis(4));
    }
}

fn simulate_backspaces(count: usize) {
    for _ in 0..count {
        let _ = simulate(&EventType::KeyPress(Key::Backspace));
        std::thread::sleep(Duration::from_millis(6));
        let _ = simulate(&EventType::KeyRelease(Key::Backspace));
        std::thread::sleep(Duration::from_millis(6));
    }
}

fn is_modifier(key: Key) -> bool {
    matches!(
        key,
        Key::ControlLeft
            | Key::ControlRight
            | Key::Alt
            | Key::AltGr
            | Key::ShiftLeft
            | Key::ShiftRight
            | Key::MetaLeft
            | Key::MetaRight
    )
}

fn build_hotkey_string(ctrl: bool, alt: bool, shift: bool, meta: bool, key: Key) -> Option<String> {
    if is_modifier(key) {
        return None;
    }

    let key_label = key_to_label(key)?;
    if !ctrl && !alt && !shift && !meta {
        return None;
    }

    let mut parts = Vec::new();
    if ctrl {
        parts.push("Ctrl".to_string());
    }
    if alt {
        parts.push("Alt".to_string());
    }
    if shift {
        parts.push("Shift".to_string());
    }
    if meta {
        parts.push("Meta".to_string());
    }
    parts.push(key_label);
    Some(parts.join("+"))
}

fn normalize_hotkey(input: &str) -> String {
    let mut ctrl = false;
    let mut alt = false;
    let mut shift = false;
    let mut meta = false;
    let mut key = String::new();

    for part in input.split('+').map(|part| normalize_hotkey_part(part.trim())) {
        match part.as_str() {
            "Ctrl" => ctrl = true,
            "Alt" => alt = true,
            "Shift" => shift = true,
            "Meta" => meta = true,
            "" => {}
            _ => key = part,
        }
    }

    let mut parts = Vec::new();
    if ctrl {
        parts.push("Ctrl".to_string());
    }
    if alt {
        parts.push("Alt".to_string());
    }
    if shift {
        parts.push("Shift".to_string());
    }
    if meta {
        parts.push("Meta".to_string());
    }
    if !key.is_empty() {
        parts.push(key);
    }
    parts.join("+")
}

fn normalize_hotkey_part(part: &str) -> String {
    match part.to_ascii_lowercase().as_str() {
        "control" | "ctrl" => "Ctrl".to_string(),
        "alt" | "option" => "Alt".to_string(),
        "shift" => "Shift".to_string(),
        "cmd" | "command" | "meta" | "win" | "windows" | "super" => "Meta".to_string(),
        "return" | "enter" => "Enter".to_string(),
        "esc" | "escape" => "Escape".to_string(),
        "space" => "Space".to_string(),
        "tab" => "Tab".to_string(),
        value => value.to_ascii_uppercase(),
    }
}

fn key_to_label(key: Key) -> Option<String> {
    let label = match key {
        Key::KeyA => "A",
        Key::KeyB => "B",
        Key::KeyC => "C",
        Key::KeyD => "D",
        Key::KeyE => "E",
        Key::KeyF => "F",
        Key::KeyG => "G",
        Key::KeyH => "H",
        Key::KeyI => "I",
        Key::KeyJ => "J",
        Key::KeyK => "K",
        Key::KeyL => "L",
        Key::KeyM => "M",
        Key::KeyN => "N",
        Key::KeyO => "O",
        Key::KeyP => "P",
        Key::KeyQ => "Q",
        Key::KeyR => "R",
        Key::KeyS => "S",
        Key::KeyT => "T",
        Key::KeyU => "U",
        Key::KeyV => "V",
        Key::KeyW => "W",
        Key::KeyX => "X",
        Key::KeyY => "Y",
        Key::KeyZ => "Z",
        Key::Num0 | Key::Kp0 => "0",
        Key::Num1 | Key::Kp1 => "1",
        Key::Num2 | Key::Kp2 => "2",
        Key::Num3 | Key::Kp3 => "3",
        Key::Num4 | Key::Kp4 => "4",
        Key::Num5 | Key::Kp5 => "5",
        Key::Num6 | Key::Kp6 => "6",
        Key::Num7 | Key::Kp7 => "7",
        Key::Num8 | Key::Kp8 => "8",
        Key::Num9 | Key::Kp9 => "9",
        Key::F1 => "F1",
        Key::F2 => "F2",
        Key::F3 => "F3",
        Key::F4 => "F4",
        Key::F5 => "F5",
        Key::F6 => "F6",
        Key::F7 => "F7",
        Key::F8 => "F8",
        Key::F9 => "F9",
        Key::F10 => "F10",
        Key::F11 => "F11",
        Key::F12 => "F12",
        Key::Space => "Space",
        Key::Return | Key::KpReturn => "Enter",
        Key::Tab => "Tab",
        Key::Escape => "Escape",
        Key::Minus | Key::KpMinus => "-",
        Key::Equal => "=",
        Key::SemiColon => ";",
        Key::Quote => "'",
        Key::Comma => ",",
        Key::Dot | Key::KpDelete => ".",
        Key::Slash | Key::KpDivide => "/",
        Key::BackSlash | Key::IntlBackslash => "\\",
        Key::LeftBracket => "[",
        Key::RightBracket => "]",
        Key::BackQuote => "`",
        Key::KpPlus => "+",
        Key::KpMultiply => "*",
        _ => return None,
    };

    Some(label.to_string())
}
