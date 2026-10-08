use std::{sync::Mutex, time::{Duration, Instant}};
use tauri::{menu::{Menu, MenuItem}, tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent}, Emitter, Manager, PhysicalPosition, PhysicalSize};

#[derive(Default)]
pub struct PopupState { last_blur: Mutex<Option<Instant>> }

pub fn show_main(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(popup) = app.get_webview_window("popup") { let _ = popup.hide(); }
    let window = app.get_webview_window("main").ok_or("Manager unavailable")?;
    window.show().map_err(|e| e.to_string())?;
    window.unminimize().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}

pub fn show_settings(app: &tauri::AppHandle) -> Result<(), String> {
    show_main(app)?;
    app.emit_to("main", "open-settings", ()).map_err(|e| e.to_string())
}

fn place(bounds: (i32, i32, u32, u32), size: (u32, u32), margin: i32, anchor: Option<(f64, f64)>) -> (i32, i32) {
    let (left, top, width, height) = bounds;
    let max_x = (left + width as i32 - size.0 as i32 - margin).max(left + margin);
    let max_y = (top + height as i32 - size.1 as i32 - margin).max(top + margin);
    let (x, y) = match anchor {
        Some((x, y)) => {
            let below = y as i32 + margin;
            let y = if below > max_y { y as i32 - size.1 as i32 - margin } else { below };
            (x as i32 - size.0 as i32 / 2, y)
        },
        None => (max_x, top + margin),
    };
    (x.clamp(left + margin, max_x), y.clamp(top + margin, max_y))
}

pub fn show_popup(app: &tauri::AppHandle, anchor: Option<(f64, f64)>) -> Result<(), String> {
    let window = app.get_webview_window("popup").ok_or("Launcher unavailable")?;
    let monitor = match anchor {
        Some((x, y)) if !(x == -1.0 && y == -1.0) => window.monitor_from_point(x, y).ok().flatten(),
        _ => None,
    }.or_else(|| window.current_monitor().ok().flatten())
     .or_else(|| window.primary_monitor().ok().flatten());
    if let Some(monitor) = monitor {
        let area = monitor.work_area();
        let scale = monitor.scale_factor();
        let margin = (12.0 * scale).round() as i32;
        let width = ((500.0 * scale).round() as u32).min(area.size.width.saturating_sub((margin * 2) as u32)).max(1);
        let height = ((660.0 * scale).round() as u32).min(area.size.height.saturating_sub((margin * 2) as u32)).max(1);
        let usable_anchor = anchor.filter(|(x, y)| {
            *x >= monitor.position().x as f64 && *x < (monitor.position().x + monitor.size().width as i32) as f64
            && *y >= monitor.position().y as f64 && *y < (monitor.position().y + monitor.size().height as i32) as f64
            && !(*x == -1.0 && *y == -1.0)
        });
        let (x, y) = place((area.position.x, area.position.y, area.size.width, area.size.height), (width, height), margin, usable_anchor);
        if let Err(error) = window.set_size(PhysicalSize::new(width, height)) { eprintln!("Launcher size: {error}"); }
        if let Err(error) = window.set_position(PhysicalPosition::new(x, y)) { eprintln!("Launcher placement: {error}"); }
    }
    window.show().map_err(|e| e.to_string())?;
    window.unminimize().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    window.emit("launcher-opened", ()).map_err(|e| e.to_string())
}

pub fn toggle_popup(app: &tauri::AppHandle, anchor: Option<(f64, f64)>, from_tray: bool) -> Result<(), String> {
    let window = app.get_webview_window("popup").ok_or("Launcher unavailable")?;
    if window.is_visible().map_err(|e| e.to_string())? {
        return window.hide().map_err(|e| e.to_string());
    }
    // A tray click can blur/hide the popup before its activation event arrives.
    // Avoid reopening it when the same click was meant to dismiss it.
    if from_tray {
        if let Some(state) = app.try_state::<PopupState>() {
            if state.last_blur.lock().map_err(|e| e.to_string())?.is_some_and(|time| time.elapsed() < Duration::from_millis(180)) { return Ok(()); }
        }
    }
    show_popup(app, anchor)
}

pub fn blurred(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<PopupState>() {
        if let Ok(mut time) = state.last_blur.lock() { *time = Some(Instant::now()); }
    }
    if let Some(window) = app.get_webview_window("popup") { let _ = window.hide(); }
}

pub fn setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let launcher = MenuItem::with_id(app, "launcher", "Open Launcher", true, None::<&str>)?;
    let manager = MenuItem::with_id(app, "manager", "Open Manager", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&launcher, &manager, &settings, &quit])?;
    TrayIconBuilder::with_id("nav-toolbox")
        .icon(app.default_window_icon().ok_or("App icon unavailable")?.clone())
        .tooltip("Nav Toolbox")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let result = match event.id.as_ref() {
                "launcher" => show_popup(app, None),
                "manager" => show_main(app),
                "settings" => show_settings(app),
                "quit" => { app.exit(0); Ok(()) },
                _ => Ok(()),
            };
            if let Err(error) = result { eprintln!("Nav Toolbox tray: {error}"); }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, position, .. } = event {
                if let Err(error) = toggle_popup(tray.app_handle(), Some((position.x, position.y)), true) { eprintln!("Nav Toolbox launcher: {error}"); }
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::place;
    #[test]
    fn anchors_below_top_bar_and_constrains_right_edge() {
        assert_eq!(place((0, 32, 1920, 1000), (500, 660), 12, Some((1900.0, 16.0))), (1408, 44));
    }
    #[test]
    fn bottom_panel_opens_above_icon() {
        assert_eq!(place((0, 0, 1920, 1040), (500, 660), 12, Some((900.0, 1060.0))), (650, 368));
    }
    #[test]
    fn shortcut_uses_top_right_of_negative_origin_monitor() {
        assert_eq!(place((-1920, 32, 1920, 1000), (500, 660), 12, None), (-512, 44));
    }
}
