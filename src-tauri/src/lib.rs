mod db;

mod tray;
use tauri::Manager;

#[tauri::command]
fn show_popup(app: tauri::AppHandle) -> Result<(), String> { tray::show_popup(&app, None) }
#[tauri::command]
fn hide_popup(app: tauri::AppHandle) -> Result<(), String> {
    app.get_webview_window("popup").ok_or("Popup unavailable")?.hide().map_err(|e| e.to_string())
}
#[tauri::command]
fn toggle_popup(app: tauri::AppHandle) -> Result<(), String> { tray::toggle_popup(&app, None, false) }
#[tauri::command]
fn show_main(app: tauri::AppHandle) -> Result<(), String> { tray::show_main(&app) }
#[tauri::command]
fn show_settings(app: tauri::AppHandle) -> Result<(), String> { tray::show_settings(&app) }

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
    // Wayland does not permit positioning standalone toplevels. Prefer XWayland
    // for this app's anchored launcher; fall back to native Wayland when absent.
    #[cfg(target_os = "linux")]
    if std::env::var_os("GDK_BACKEND").is_none() && std::env::var_os("WAYLAND_DISPLAY").is_some() && std::env::var_os("DISPLAY").is_some() {
        std::env::set_var("GDK_BACKEND", "x11,wayland");
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            if !args.iter().any(|arg| arg == "--hidden") {
                if let Err(error) = tray::show_main(app) { eprintln!("Nav Toolbox reopen: {error}"); }
            }
        }))
        .manage(tray::PopupState::default())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .setup(|app| {
            let tray_available = match tray::setup(app) {
                Ok(()) => true,
                Err(error) => { eprintln!("Nav Toolbox tray unavailable: {error}"); false },
            };
            if tray_available && std::env::args().any(|arg| arg == "--hidden") {
                if let Some(window) = app.get_webview_window("main") { let _ = window.hide(); }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event { api.prevent_close(); let _ = window.hide(); }
            }
            if window.label() == "popup" {
                if let tauri::WindowEvent::Focused(false) = event { tray::blurred(window.app_handle()); }
                if let tauri::WindowEvent::CloseRequested { api, .. } = event { api.prevent_close(); let _ = window.hide(); }
            }
        })
        .invoke_handler(tauri::generate_handler![show_popup, hide_popup, toggle_popup, show_main, show_settings, load_snapshot, save_command, set_category_enabled, delete_command, save_category, save_settings, mark_used, import_snapshot, run_in_terminal])
        .run(tauri::generate_context!())
        .expect("error while running Nav Toolbox");
}
