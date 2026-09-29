mod db;

use tauri::{menu::{Menu, MenuItem}, tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent}, Emitter, Manager};

fn show_window(app: &tauri::AppHandle, label: &str) -> Result<(), String> {
    let window = app.get_webview_window(label).ok_or_else(|| format!("Window {label} is unavailable"))?;
    window.show().map_err(|e| e.to_string())?;
    window.unminimize().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
fn show_popup(app: tauri::AppHandle) -> Result<(), String> { show_window(&app, "popup") }

#[tauri::command]
fn hide_popup(app: tauri::AppHandle) -> Result<(), String> {
    app.get_webview_window("popup").ok_or("Popup unavailable")?.hide().map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_popup(app: tauri::AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("popup").ok_or("Popup unavailable")?;
    if window.is_visible().map_err(|e| e.to_string())? { window.hide().map_err(|e| e.to_string()) } else { show_window(&app, "popup") }
}

#[tauri::command]
fn show_main(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(popup) = app.get_webview_window("popup") { let _ = popup.hide(); }
    show_window(&app, "main")
}

#[tauri::command]
fn load_snapshot(app: tauri::AppHandle) -> Result<db::Snapshot, String> { db::load(&app) }
#[tauri::command]
fn save_command(app: tauri::AppHandle, command: db::Command) -> Result<(), String> { db::save_command(&app, command) }
#[tauri::command]
fn set_category_enabled(app: tauri::AppHandle, category_id: String, enabled: bool) -> Result<(), String> { db::set_category_enabled(&app, &category_id, enabled) }
#[tauri::command]
fn delete_command(app: tauri::AppHandle, id: String) -> Result<(), String> { db::delete_command(&app, &id) }
#[tauri::command]
fn save_category(app: tauri::AppHandle, category: db::Category) -> Result<(), String> { db::save_category(&app, category) }
#[tauri::command]
fn save_settings(app: tauri::AppHandle, settings: db::Settings) -> Result<(), String> { db::save_settings(&app, settings) }
#[tauri::command]
fn mark_used(app: tauri::AppHandle, id: String) -> Result<(), String> { db::mark_used(&app, &id) }
#[tauri::command]
fn import_snapshot(app: tauri::AppHandle, snapshot: db::Snapshot) -> Result<(), String> { db::import(&app, snapshot) }

#[tauri::command]
fn run_in_terminal(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let snapshot = db::load(&app)?;
    if !snapshot.settings.show_run { return Err("Run is disabled in settings".into()); }
    let item = snapshot.commands.iter().find(|item| item.id == id && item.is_enabled).ok_or("Enabled command not found")?;
    if item.tags.iter().any(|tag| tag == "current-shell") { return Err("Copy this command into your current terminal".into()); }
    let command = &item.command;
    if command.trim().is_empty() || command.contains('\0') || (command.contains('<') && command.contains('>')) || command.contains("\"\"") { return Err("Edit command placeholders before running".into()); }
    let script = format!("{command}; printf '\\n[Nav Toolbox] Command finished.\\n'; exec bash");
    let terminals = ["gnome-terminal", "kgx", "konsole", "xfce4-terminal", "x-terminal-emulator"];
    for terminal in terminals {
        let mut process = std::process::Command::new(terminal);
        if terminal == "xfce4-terminal" { process.arg("--command").arg(format!("bash -lc '{}'", script.replace('\'', "'\\''"))); }
        else if terminal == "konsole" || terminal == "x-terminal-emulator" { process.arg("-e").arg("bash").arg("-lc").arg(&script); }
        else { process.arg("--").arg("bash").arg("-lc").arg(&script); }
        if process.spawn().is_ok() { return Ok(()); }
    }
    Err("No supported terminal found. Install GNOME Terminal, Console, Konsole, or Xfce Terminal.".into())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .setup(|app| {
            let open_launcher = MenuItem::with_id(app, "launcher", "Open Launcher", true, None::<&str>)?;
            let open_manager = MenuItem::with_id(app, "manager", "Open Manager", true, None::<&str>)?;
            let open_settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_launcher, &open_manager, &open_settings, &quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("App icon").clone())
                .tooltip("Nav Toolbox")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "launcher" => { let _ = show_window(app, "popup"); },
                    "manager" => { let _ = show_window(app, "main"); },
                    "settings" => { let _ = show_window(app, "main"); let _ = app.emit("open-settings", ()); },
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        let _ = show_window(app, "popup");
                    }
                })
                .build(app)?;
            if std::env::args().any(|arg| arg == "--hidden") {
                if let Some(window) = app.get_webview_window("main") { let _ = window.hide(); }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event { api.prevent_close(); let _ = window.hide(); }
            }
            if window.label() == "popup" {
                if let tauri::WindowEvent::Focused(false) = event { let _ = window.hide(); }
                if let tauri::WindowEvent::CloseRequested { api, .. } = event { api.prevent_close(); let _ = window.hide(); }
            }
        })
        .invoke_handler(tauri::generate_handler![show_popup, hide_popup, toggle_popup, show_main, load_snapshot, save_command, set_category_enabled, delete_command, save_category, save_settings, mark_used, import_snapshot, run_in_terminal])
        .run(tauri::generate_context!())
        .expect("error while running Nav Toolbox");
}
