/// Get cursor position in screen coordinates
pub fn get_cursor_position() -> Option<(i32, i32)> {
    #[cfg(target_os = "windows")]
    {
        windows_cursor_pos()
    }
    #[cfg(target_os = "macos")]
    {
        macos_cursor_pos()
    }
    #[cfg(target_os = "linux")]
    {
        linux_cursor_pos()
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        None
    }
}

/// Get the name of the currently active/foreground process
pub fn get_active_process_name() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        windows_active_process()
    }
    #[cfg(target_os = "macos")]
    {
        macos_active_process()
    }
    #[cfg(target_os = "linux")]
    {
        linux_active_process()
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        None
    }
}

pub fn is_autostart_enabled() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        return windows_autostart_enabled();
    }
    #[cfg(target_os = "macos")]
    {
        return macos_autostart_enabled();
    }
    #[cfg(target_os = "linux")]
    {
        return linux_autostart_enabled();
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Err("Unsupported platform".to_string())
    }
}

pub fn set_autostart_enabled(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        return windows_set_autostart(enabled);
    }
    #[cfg(target_os = "macos")]
    {
        return macos_set_autostart(enabled);
    }
    #[cfg(target_os = "linux")]
    {
        return linux_set_autostart(enabled);
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Err("Unsupported platform".to_string())
    }
}

fn current_exe_string() -> Result<String, String> {
    std::env::current_exe()
        .map_err(|e| e.to_string())
        .map(|path| path.to_string_lossy().to_string())
}

// ==================== Windows ====================
#[cfg(target_os = "windows")]
fn windows_cursor_pos() -> Option<(i32, i32)> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

    unsafe {
        let mut point = POINT::default();
        if GetCursorPos(&mut point).is_ok() {
            Some((point.x, point.y))
        } else {
            None
        }
    }
}

#[cfg(target_os = "windows")]
fn windows_active_process() -> Option<String> {
    use windows::core::PWSTR;
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId};
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows::Win32::Foundation::CloseHandle;

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_invalid() {
            return None;
        }

        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));

        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
        if let Ok(handle) = process {
            let mut name_buf = [0u16; 260];
            let mut name_len = name_buf.len() as u32;
            let len = windows::Win32::System::Threading::QueryFullProcessImageNameW(
                handle,
                windows::Win32::System::Threading::PROCESS_NAME_WIN32,
                PWSTR(name_buf.as_mut_ptr()),
                &mut name_len,
            );
            let _ = CloseHandle(handle);

            if len.is_ok() {
                let path = String::from_utf16_lossy(&name_buf[..name_len as usize]);
                if let Some(name) = std::path::Path::new(&path).file_name() {
                    return Some(name.to_string_lossy().to_string());
                }
            }
        }

        // Fallback: use window title
        let mut title_buf = [0u16; 256];
        let len = GetWindowTextW(hwnd, &mut title_buf);
        if len > 0 {
            Some(String::from_utf16_lossy(&title_buf[..len as usize]))
        } else {
            None
        }
    }
}

#[cfg(target_os = "windows")]
fn windows_run_key() -> Result<winreg::RegKey, String> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};
    use winreg::RegKey;

    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(
            "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
            KEY_READ | KEY_WRITE,
        )
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
fn windows_startup_cmd_path() -> Result<std::path::PathBuf, String> {
    let appdata = std::env::var("APPDATA").map_err(|e| e.to_string())?;
    Ok(std::path::PathBuf::from(appdata)
        .join("Microsoft")
        .join("Windows")
        .join("Start Menu")
        .join("Programs")
        .join("Startup")
        .join("QuickSend.cmd"))
}

#[cfg(target_os = "windows")]
fn windows_autostart_enabled() -> Result<bool, String> {
    let registry_enabled = windows_run_key()
        .ok()
        .and_then(|key| key.get_value::<String, _>("QuickSend").ok())
        .map(|value| value.contains("quicksend.exe"))
        .unwrap_or(false);

    let startup_enabled = windows_startup_cmd_path()?.exists();
    Ok(registry_enabled || startup_enabled)
}

#[cfg(target_os = "windows")]
fn windows_set_autostart(enabled: bool) -> Result<(), String> {
    let exe = current_exe_string()?;
    let cmd_path = windows_startup_cmd_path()?;

    let run_key = windows_run_key()?;
    let _ = run_key.delete_value("QuickSend");

    if cmd_path.exists() {
        let _ = std::fs::remove_file(&cmd_path);
    }

    if !enabled {
        return Ok(());
    }

    run_key
        .set_value("QuickSend", &format!("\"{}\" --hidden", exe))
        .map_err(|e| e.to_string())?;

    if let Some(parent) = cmd_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(
        &cmd_path,
        format!("@echo off\r\nstart \"\" \"{}\" --hidden\r\n", exe),
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

// ==================== macOS ====================
#[cfg(target_os = "macos")]
fn macos_cursor_pos() -> Option<(i32, i32)> {
    unsafe {
        use cocoa::appkit::NSEvent;
        use cocoa::base::nil;
        use objc::runtime::Object;
        use objc::{class, msg_send, sel, sel_impl};

        let event = NSEvent::mouseLocation(nil);
        let screen: *mut Object = msg_send![class!(NSScreen), mainScreen];
        if screen == nil {
            return Some((event.x as i32, event.y as i32));
        }
        // macOS uses flipped Y coordinates.
        let frame = cocoa::appkit::NSScreen::frame(screen);
        Some((event.x as i32, (frame.size.height - event.y) as i32))
    }
}

#[cfg(target_os = "macos")]
fn macos_active_process() -> Option<String> {
    unsafe {
        use cocoa::appkit::NSApp;
        use cocoa::base::nil;
        use objc::{msg_send, sel, sel_impl, class};
        use objc::runtime::Object;

        let workspace: *mut Object = msg_send![class!(NSWorkspace), sharedWorkspace];
        let app: *mut Object = msg_send![workspace, frontmostApplication];
        if app == nil {
            return None;
        }
        let name: *mut Object = msg_send![app, localizedName];
        if name == nil {
            return None;
        }
        let cstr: *const std::os::raw::c_char = msg_send![name, UTF8String];
        if cstr.is_null() {
            return None;
        }
        Some(std::ffi::CStr::from_ptr(cstr).to_string_lossy().to_string())
    }
}

#[cfg(target_os = "macos")]
fn macos_launch_agent_path() -> Result<std::path::PathBuf, String> {
    dirs::home_dir()
        .map(|home| {
            home.join("Library")
                .join("LaunchAgents")
                .join("com.quicksend.autostart.plist")
        })
        .ok_or_else(|| "Could not find home directory".to_string())
}

#[cfg(target_os = "macos")]
fn macos_autostart_enabled() -> Result<bool, String> {
    Ok(macos_launch_agent_path()?.exists())
}

#[cfg(target_os = "macos")]
fn macos_set_autostart(enabled: bool) -> Result<(), String> {
    let path = macos_launch_agent_path()?;
    if path.exists() {
        let _ = std::fs::remove_file(&path);
    }
    if !enabled {
        return Ok(());
    }

    let exe = current_exe_string()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let plist = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.quicksend.autostart</string>
  <key>ProgramArguments</key>
  <array>
    <string>{}</string>
    <string>--hidden</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
"#,
        escape_xml(&exe)
    );
    std::fs::write(path, plist).map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

// ==================== Linux ====================
#[cfg(target_os = "linux")]
fn linux_cursor_pos() -> Option<(i32, i32)> {
    // Try xdotool
    std::process::Command::new("xdotool")
        .arg("getmouselocation")
        .output()
        .ok()
        .and_then(|output| {
            let stdout = String::from_utf8_lossy(&output.stdout);
            // Output like: x:123 y:456 screen:0 window:12345
            let mut x = None;
            let mut y = None;
            for part in stdout.split_whitespace() {
                if let Some(val) = part.strip_prefix("x:") {
                    x = val.parse::<i32>().ok();
                }
                if let Some(val) = part.strip_prefix("y:") {
                    y = val.parse::<i32>().ok();
                }
            }
            match (x, y) {
                (Some(x), Some(y)) => Some((x, y)),
                _ => None,
            }
        })
}

#[cfg(target_os = "linux")]
fn linux_active_process() -> Option<String> {
    // Try xdotool to get active window PID, then read /proc/PID/comm
    let pid_output = std::process::Command::new("xdotool")
        .args(["getactivewindow", "getwindowpid"])
        .output()
        .ok()?;

    let pid_str = String::from_utf8_lossy(&pid_output.stdout).trim().to_string();
    let pid = pid_str.parse::<u32>().ok()?;

    let comm = std::fs::read_to_string(format!("/proc/{}/comm", pid)).ok()?;
    Some(comm.trim().to_string())
}

#[cfg(target_os = "linux")]
fn linux_autostart_path() -> Result<std::path::PathBuf, String> {
    dirs::config_dir()
        .map(|dir| dir.join("autostart").join("quicksend.desktop"))
        .ok_or_else(|| "Could not find config directory".to_string())
}

#[cfg(target_os = "linux")]
fn linux_autostart_enabled() -> Result<bool, String> {
    Ok(linux_autostart_path()?.exists())
}

#[cfg(target_os = "linux")]
fn linux_set_autostart(enabled: bool) -> Result<(), String> {
    let path = linux_autostart_path()?;
    if path.exists() {
        let _ = std::fs::remove_file(&path);
    }
    if !enabled {
        return Ok(());
    }

    let exe = current_exe_string()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let desktop = format!(
        "[Desktop Entry]\nType=Application\nName=QuickSend\nExec=\"{}\" --hidden\nTerminal=false\nX-GNOME-Autostart-enabled=true\n",
        exe.replace('"', "\\\"")
    );
    std::fs::write(path, desktop).map_err(|e| e.to_string())
}
