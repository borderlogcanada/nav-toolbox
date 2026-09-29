# Nav Toolbox

Nav Toolbox is a Fedora/Linux desktop command library. It has a compact launcher for quick copying and a full window for organizing commands. The interface uses pale blue glass in light mode and navy glass in dark mode.

## Current features

- Tauri v2 desktop windows, system tray menu, and global shortcut (default `Ctrl+Space`)
- SQLite storage in the app data directory, with seeded developer commands and categories
- Fuzzy search by title, command, description, tags, and category
- Favorites, recent commands, editing, new commands, new categories, and JSON backup
- Clipboard copy as the primary action; optional Run in a terminal, off by default
- Light, dark, and system themes; autostart; close popup after copy
- Keyboard: `Ctrl+K` focuses search, arrows select search results, `Enter` copies the selected command, `I` opens details, `Alt+1` through `Alt+7` copy launcher rows, `Esc` closes overlays

The browser preview stores changes in local storage. The packaged desktop app uses SQLite. No account or network connection is needed to use the packaged app; fonts are bundled locally.

## Fedora development setup

Install Node.js 20.19+ or 22.12+, Rust, and the Tauri Linux libraries. The Fedora dependency names below follow the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/):

```bash
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file libappindicator-gtk3-devel librsvg2-devel libxdo-devel
sudo dnf group install "c-development"
```

Install Rust with [rustup](https://rustup.rs/) and restart your shell. Then:

```bash
cd nav-toolbox
npm install
npm run desktop:dev
```

To preview only the React interface in a browser:

```bash
npm run dev
```

Open `http://127.0.0.1:1420/` for the manager and `http://127.0.0.1:1420/?view=popup` for the launcher. Browser preview does not provide a real tray, global shortcut, or native command execution.

## Build and package

```bash
npm run build
npm run desktop:build
```

The Tauri configuration targets AppImage and RPM. Output goes to `src-tauri/target/release/bundle/appimage/` and `src-tauri/target/release/bundle/rpm/`. The RPM provides the Fedora application launcher entry. You can also build one format at a time:

```bash
npm run tauri build -- --bundles rpm
npm run tauri build -- --bundles appimage
```

## Tray behavior on Linux

The tray menu contains **Open Launcher**, **Open Manager**, **Settings**, and **Quit**. Tauri does not emit its tray click event on Linux, so opening the launcher from the menu or global shortcut is the dependable path. The popup is centered near the top of the screen because desktop environments do not expose a consistent panel anchor to Tauri. `Ctrl+Space` may already be assigned by an input method or desktop environment; change it in Settings if registration fails.

## Run behavior

Run is disabled initially. Enabling it adds Run controls and requires confirmation for every command. Commands matching `sudo`, `rm`, `dd`, `mkfs`, `chmod`, `chown`, and similar system utilities get an extra warning in the confirmation text. The Rust backend accepts only saved commands while Run is enabled. Run opens a supported terminal (`gnome-terminal`, `kgx`, `konsole`, `xfce4-terminal`, or `x-terminal-emulator`) and executes the command there. The command still runs with the user's normal privileges and any terminal prompt remains visible.

## Data and backups

SQLite is created under Tauri's per-app data directory as `nav-toolbox.db`. The database has `commands`, `categories`, `related_commands`, and `settings` tables. Export JSON in Settings before major changes. Import replaces the current command catalog and settings after confirmation.

## Project layout

```text
src/App.tsx             React manager and launcher UI
src/styles.css          light and dark glass themes
src/lib/data.ts         native and browser-preview data adapter
src/lib/native.ts       clipboard, shortcut, autostart, dialogs
src/data/seed.json      initial categories and commands
src-tauri/src/db.rs     SQLite schema and persistence
src-tauri/src/lib.rs    tray, windows, native commands, terminal launch
src-tauri/icons/        app and tray icon assets
```

## Verification status

`npm run build` passes and both layouts were inspected in Chrome. A native build could not be run in the initial project environment because Cargo/Rust and WebKitGTK development libraries were not installed there. Run `npm run desktop:dev` after completing the Fedora setup above to verify the tray and native integrations on your desktop.

Browser preview screenshots are in [`docs/screenshots/`](docs/screenshots/).
