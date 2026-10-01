# Launcher and Manager UX Design

## Problem

The installed Nav Toolbox app works, but the Fedora GNOME interaction does not match its quick-launch purpose. Clicking the tray icon can show the native menu instead of the custom launcher. The launcher opens centered in the screen without an obvious close button, and it only renders seven commands. The manager's content is inset inside its native window, so it reads as a framed card rather than a full desktop application.

The user selected the search-first launcher layout and asked to preserve the existing light and dark glassmorphism design.

## Goals

- Make the launcher the fastest way to find and copy enabled commands.
- Make the app's close, hide, and reopen behavior obvious and consistent.
- Show all enabled commands in the launcher without requiring the manager.
- Make the manager use the full native window while retaining its current visual language.
- Verify behavior in a real Fedora desktop session before publishing updated packages.

## Non-goals

- Replacing Tauri with a GNOME Shell extension.
- Redesigning the existing app brand, colors, command catalog, SQLite schema, or settings model.
- Making hidden library commands appear in the launcher automatically. The existing enable/disable choices remain authoritative; the launcher lists every enabled command and the manager's Command Library controls which commands are enabled.
- Enabling command execution by default.

## Approved interaction and appearance

### Launcher

- Preserve the existing pale blue/white glass light theme and matching navy glass dark theme, including the blue terminal mark, rounded controls, icons, and restrained glow.
- Keep the current compact search-first composition: app header, search field, category filters, command results, optional selected-command preview, and settings/manager actions.
- Add a visible close button to the header. Escape and focus leaving the launcher also close it. Copy may close the launcher according to the existing `closeAfterCopy` preference.
- Remove the fixed seven-row truncation. Render the complete filtered set of enabled commands in the existing scroll area. Keep recent and favorite commands first in the unfiltered All view, without removing the remaining enabled commands.
- Keep category filters available in the launcher. Categories beyond the first visible chips must be reachable through an in-launcher overflow/category chooser instead of forcing users into the manager to filter.
- Selecting a command only highlights it. Details remain collapsed until the user activates the info control or presses `I`. `Enter` and the copy action copy the selected command immediately. Arrow keys move through the visible result set; `Ctrl+K` focuses search; `Alt+1` through `Alt+7` continue to copy the first seven rows.
- Keep the current size class unless the screen's available work area requires a smaller height. Place the launcher below/near the tray icon and constrain it to the available screen area. If the global shortcut opens it without a recent tray position, use a predictable top-screen position rather than the screen center.

### Tray and popup behavior

- Desired behavior: one tray click toggles the custom launcher. Keep `Ctrl+Space` as a reliable opening path and retain access to Open Manager, Settings, and Quit.
- First implementation task is a Fedora GNOME feasibility spike. Tauri documents that Linux does not support disabling the tray menu on left click, so changing `show_menu_on_left_click` alone is not considered a solution. Test the stock backend's menu-less click path and icon visibility, then evaluate a compatible StatusNotifier/KSNI integration if needed. Do not claim one-click support until it has been verified on the installed Fedora session.
- If one-click is unavailable with a maintainable Linux backend, preserve the tray menu and add/retain a clear Open Launcher entry; the global shortcut and desktop app entry remain available. Report that limitation in the README and test the fallback rather than silently shipping a broken tray interaction.
- Use Tauri's positioner support for tray-relative placement where it works. Forward tray events as required by the positioner and use constrained placement so the popup remains on screen. Verify actual placement on Fedora because desktop environment and display server behavior can vary.

### Full manager

- Use the entire native window client area for the app surface. Remove the outer page padding, fixed viewport-height inset, maximum-width shell, and outer rounded border/shadow that create the framed-card effect.
- Keep the glass treatment inside the actual workspace: sidebar, command list, details panel, dialogs, and controls.
- Preserve the three-column category/list/details layout, global search, library visibility controls, and existing native title bar/window controls. Ensure the workspace and its panes scroll internally and adapt when the window is resized.

## Architecture and data flow

- Continue using the existing Tauri `popup` and `main` windows; no new web server or database is needed.
- Keep command filtering, fuzzy search, keyboard navigation, copy, details, and visibility state in the existing React app. Remove the launcher-only seven-item slice while preserving recent/favorite ordering.
- Keep SQLite as source of truth. The popup reads the current snapshot, records copied usage as it does now, and displays enabled commands. Category/command enablement remains managed through existing persistence functions.
- Implement tray creation and popup show/hide/placement in the Rust/Tauri layer. Use a narrowly scoped dependency and permission for the positioner if the feasibility check confirms it is compatible. Keep the frontend capability limited to the commands needed by each window.
- Do not add global shell execution or broaden the Tauri shell capability. Copy remains primary and command Run remains opt-in with the current Rust validation and confirmation flow.

## Failure handling and compatibility

- A tray backend that cannot deliver a reliable one-click action must not prevent opening the launcher through the global shortcut, app entry, or tray menu.
- If tray-relative placement is unavailable, place the launcher in a stable top-screen position and keep its close button visible.
- Errors while showing, hiding, or positioning a window should be logged and surfaced in development; they must not terminate the app.
- Preserve platform-native close controls for the manager. Closing the launcher hides it without quitting the background tray app. Quit remains an explicit tray/menu action.

## Validation

- Frontend checks: `npm run build`, `npm run format:check`, catalog checks, and migration checks.
- Add targeted automated coverage for enabled-command listing with more than seven entries, recent/favorite ordering without truncation, search/category filtering, selected-row details on demand, and keyboard/copy behavior.
- Build a Fedora RPM and manually test in GNOME: left-click behavior, right-click/menu behavior, shortcut behavior, popup position near the top bar, screen-edge constraint, close button/Escape/outside focus, copy/close preference, and app persistence after closing the popup.
- Manually test the manager at common and constrained window sizes: it fills the window, panes remain reachable, scrolling stays inside panes, and native close/minimize controls work.
- Do not publish a replacement package until the target Fedora interactive checks pass. A successful package build alone is not evidence that tray integration works.

## Technical references

- [Tauri System Tray](https://v2.tauri.app/learn/system-tray/): tray menu behavior and the Linux limitation for disabling the menu on left click.
- [Tauri Positioner plugin](https://v2.tauri.app/plugin/positioner/): tray-relative positions, event forwarding, constrained placement, and Linux platform support.
- [Tauri Positioner JavaScript API](https://v2.tauri.app/reference/javascript/positioner/): tray-bottom positions such as `TrayBottomCenter` and `moveWindowConstrained`.
