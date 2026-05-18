mod commands;
mod db;
mod input;
mod platform;

use db::Database;
use std::io::Write;
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, Runtime,
};

pub struct AppState {
    pub db: Mutex<Database>,
    pub text_expansion_active: AtomicBool,
}

const SINGLE_INSTANCE_ADDR: &str = "127.0.0.1:48273";

fn claim_single_instance() -> Option<TcpListener> {
    match TcpListener::bind(SINGLE_INSTANCE_ADDR) {
        Ok(listener) => Some(listener),
        Err(_) => {
            if let Ok(mut stream) = TcpStream::connect(SINGLE_INSTANCE_ADDR) {
                let _ = stream.write_all(b"show\n");
            }
            None
        }
    }
}

fn start_single_instance_server(listener: TcpListener, app: AppHandle) {
    let _ = std::thread::Builder::new()
        .name("quicksend-single-instance".to_string())
        .spawn(move || {
            for stream in listener.incoming() {
                match stream {
                    Ok(_) => {
                        let app = app.clone();
                        let window_app = app.clone();
                        let _ = app.run_on_main_thread(move || {
                            let _ = show_settings_window(&window_app);
                        });
                    }
                    Err(err) => {
                        log::warn!("Single instance listener error: {}", err);
                        break;
                    }
                }
            }
        });
}

fn build_system_tray(app: &AppHandle) -> tauri::Result<()> {
    let show_settings = MenuItemBuilder::with_id("settings", "设置").build(app)?;
    let toggle_expansion = MenuItemBuilder::with_id("toggle_expansion", "切换文本扩展").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show_settings)
        .item(&toggle_expansion)
        .separator()
        .item(&quit)
        .build()?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .tooltip("QuickSend - 快速粘贴短语")
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "settings" => {
                let _ = show_settings_window(app);
            }
            "toggle_expansion" => {
                if let Some(state) = app.try_state::<AppState>() {
                    let current = state.text_expansion_active.load(Ordering::Relaxed);
                    state.text_expansion_active.store(!current, Ordering::Relaxed);
                    log::info!(
                        "Text expansion: {}",
                        if !current { "enabled" } else { "disabled" }
                    );
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                let _ = show_settings_window(app);
            }
        })
        .build(app)?;

    Ok(())
}

fn show_settings_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window("settings") {
        win.show()?;
        win.set_focus()?;
        return Ok(());
    }

    open_settings_window(app)
}

fn open_settings_window(app: &AppHandle) -> tauri::Result<()> {
    use tauri::WebviewUrl;

    let _win = tauri::WebviewWindowBuilder::new(
        app,
        "settings",
        WebviewUrl::App("index.html#/settings".into()),
    )
    .title("QuickSend 设置")
    .inner_size(980.0, 700.0)
    .min_inner_size(780.0, 560.0)
    .center()
    .build()?;

    Ok(())
}

#[tauri::command]
fn toggle_popup(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("popup") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            show_popup_at_cursor(&app, &win);
        }
    } else {
        create_popup_window(&app)?;
    }
    Ok(())
}

fn create_popup_window(app: &AppHandle) -> Result<(), String> {
    use tauri::WebviewUrl;

    let win = tauri::WebviewWindowBuilder::new(
        app,
        "popup",
        WebviewUrl::App("index.html#/popup".into()),
    )
    .title("QuickSend")
    .inner_size(420.0, 520.0)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .focused(true)
    .visible(false)
    .build()
    .map_err(|e| e.to_string())?;

    show_popup_at_cursor(app, &win);
    Ok(())
}

fn show_popup_at_cursor<R: Runtime>(app: &AppHandle, win: &tauri::WebviewWindow<R>) {
    use tauri::PhysicalPosition;

    let pos = match platform::get_cursor_position() {
        Some((x, y)) => {
            let popup_w = 420.0;
            let popup_h = 520.0;
            let mut px = x as f64 - popup_w / 2.0;
            let mut py = y as f64 - popup_h - 12.0;
            if px < 0.0 {
                px = 10.0;
            }
            if py < 0.0 {
                py = y as f64 + 18.0;
            }
            PhysicalPosition::new(px as i32, py as i32)
        }
        None => {
            let _ = win.center();
            return;
        }
    };

    let _ = win.set_position(tauri::Position::Physical(pos));
    let _ = win.show();
    let _ = win.set_focus();
    app.emit("popup-opened", ()).ok();
}

#[tauri::command]
fn hide_popup(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("popup") {
        let _ = win.hide();
    }
    Ok(())
}

pub fn run() {
    env_logger::init();

    let Some(instance_listener) = claim_single_instance() else {
        return;
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .setup(move |app| {
            let app_handle = app.handle().clone();

            let db_path = dirs::data_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join("quicksend");

            std::fs::create_dir_all(&db_path).ok();

            let db = Database::new(db_path.join("quicksend.db"))
                .expect("Failed to initialize database");

            app.manage(AppState {
                db: Mutex::new(db),
                text_expansion_active: AtomicBool::new(true),
            });

            let start_hidden = std::env::args().any(|arg| arg == "--hidden" || arg == "--minimized");

            if let Ok(listener) = instance_listener.try_clone() {
                start_single_instance_server(listener, app_handle.clone());
            }

            build_system_tray(&app_handle)?;
            input::start_global_input_listener(app_handle.clone());
            if !start_hidden {
                let _ = show_settings_window(&app_handle);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            toggle_popup,
            hide_popup,
            commands::get_groups,
            commands::create_group,
            commands::update_group,
            commands::delete_group,
            commands::reorder_groups,
            commands::get_phrases,
            commands::get_phrases_by_group,
            commands::search_phrases,
            commands::create_phrase,
            commands::update_phrase,
            commands::delete_phrase,
            commands::paste_phrase,
            commands::copy_phrase_to_clipboard,
            commands::get_text_expansions,
            commands::create_text_expansion,
            commands::update_text_expansion,
            commands::delete_text_expansion,
            commands::get_process_rules,
            commands::set_process_rule,
            commands::delete_process_rule,
            commands::get_active_process_name,
            commands::get_autostart_enabled,
            commands::set_autostart_enabled,
            commands::get_settings,
            commands::update_setting,
            commands::export_data,
            commands::import_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
