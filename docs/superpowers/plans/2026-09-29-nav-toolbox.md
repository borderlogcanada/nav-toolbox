# Nav Toolbox implementation plan

Build a Tauri v2 command launcher in a separate `nav-toolbox` folder. The supplied screenshots and final brief define the approved UI and feature scope.

1. Create Vite, React, TypeScript, Tailwind, Tauri configuration, and icons. Verify `npm run build`.
2. Implement the Rust SQLite store with migrations, seeded categories and commands, CRUD, usage updates, and JSON import/export.
3. Implement a shared React state layer and fuzzy search, with local preview data for browser development.
4. Implement the full three-column management window and compact launcher, including keyboard navigation, details on demand, favorites, editing, and copy.
5. Wire the system tray, popup window, global shortcut, autostart, theme, settings, and opt-in command execution with confirmation.
6. Document Fedora prerequisites and AppImage/RPM build commands. Run all checks available in this environment.

The app uses the Rust backend for native SQLite persistence and execution. The browser preview stores data in local storage to support UI iteration without native dependencies.
