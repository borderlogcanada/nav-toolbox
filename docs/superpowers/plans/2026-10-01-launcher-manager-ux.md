# Launcher and Manager UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Nav Toolbox's launcher a dependable one-click, searchable copy palette and make the manager fill its native window, while preserving its existing light and dark glass design.

**Architecture:** Keep the existing Tauri popup and manager windows, SQLite snapshot, and React app. Separate launcher list derivation into a pure helper. First test the current Linux tray backend without an attached menu; if it cannot reliably deliver activation, enable the supported StatusNotifier/KSNI backend. Use Tauri's positioner from Rust to place the popup. If Fedora testing shows that the tray activation or placement is unsupported, keep the shortcut and working tray-menu entry and document the limitation.

**Tech Stack:** Tauri v2, Rust, React, TypeScript, Fuse.js, SQLite, Vitest, `tray-icon` KSNI backend, `tauri-plugin-positioner`.

---

## File map

- `src-tauri/Cargo.toml` and generated `src-tauri/Cargo.lock`: add Tauri positioner support and, if the initial backend test fails, select the KSNI backend.
- `src-tauri/src/lib.rs`: register native plugins, delegate tray setup, and route shortcut actions.
- `src-tauri/src/tray.rs` (new): own tray menu, icon event routing, popup placement, and show/toggle logic.
- `src-tauri/tauri.conf.json`: remove popup centering and preserve the frameless popup/native manager window.
- `src/lib/launcher.ts` (new): derive enabled launcher results, applying category/search filters and recent/favorite ranking.
- `src/lib/launcher.test.ts` (new): test result count, visibility, ranking, category filtering, and fuzzy matching.
- `package.json` and `package-lock.json`: add the test script and Vitest.
- `src/App.tsx`: use the pure launcher selector, keep details on demand, add close and category-overflow controls, and expose every enabled result.
- `src/styles.css`: tune popup scrolling and responsive size; remove the full-window inset card while keeping glass styling in internal panes.
- `README.md`: document the verified Linux tray backend, shortcut fallback, launcher behavior, and Fedora test steps.

### Task 1: Verify one-click Linux tray and popup placement

**Files:**

- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/tray.rs`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Record the current Fedora desktop session and reproduce existing behavior**

Run from the project root:

```bash
printf 'Desktop=%s\nSession=%s\n' "$XDG_CURRENT_DESKTOP" "$XDG_SESSION_TYPE"
npm run desktop:dev
```

Expected: Tauri opens the app; one left click currently shows the tray menu and/or launcher, and the global shortcut still opens the launcher. Record the observed behavior for comparison after the backend change.

- [ ] **Step 2: Test the stock tray backend without an attached menu**

Temporarily remove `.menu(&menu)` and the menu construction from `TrayIconBuilder` in `src-tauri/src/lib.rs`. Keep the left-release event handler and log each received tray event with `eprintln!("Nav Toolbox tray event: {event:?}")`. Build and run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
npm run desktop:dev
```

Expected: the icon remains visible in the Fedora top bar and one click produces a left-release event. If both pass, restore the menu and verify one click still opens the popup while right click opens the menu. Keep the stock backend only if both interactions work together. If the icon disappears, the event never arrives, or restoring the menu makes it open on left click, continue to Step 3 and use KSNI.

- [ ] **Step 3: Select KSNI if the stock backend fails and add positioner support**

Resolve Tauri's tray-icon version:

```bash
cargo tree --manifest-path src-tauri/Cargo.toml -i tray-icon
```

Expected: one `tray-icon` version used by Tauri. If Step 2 failed, add that same compatible version under Linux dependencies with `default-features = false` and `features = ["ksni"]`; keep Tauri's tray feature. For Tauri 2.12 the tray dependency is `0.25`; use the version reported by Cargo if the repository resolves a later compatible line. Add `tauri-plugin-positioner` under normal dependencies because the Rust setup module uses it on desktop platforms:

```toml
[dependencies]
tauri-plugin-positioner = { version = "2", features = ["tray-icon"] }

[target.'cfg(target_os = "linux")'.dependencies]
tray-icon = { version = "0.25", default-features = false, features = ["ksni"] }
```

- [ ] **Step 4: Confirm Cargo selected KSNI when enabled**

Run:

```bash
cargo tree --manifest-path src-tauri/Cargo.toml -e features -i tray-icon
```

Expected after KSNI is enabled: the resolved feature list includes `ksni`; the tray-icon feature resolution selects KSNI even though Tauri also requests `libappindicator`. If Cargo reports more than one tray-icon version, align the direct dependency with Tauri's exact resolved compatible version before continuing. If Step 2 passed, confirm no direct tray-icon dependency was added.

- [ ] **Step 5: Move tray lifecycle and event handling to `tray.rs`**

Create `src-tauri/src/tray.rs` with a `pub fn setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>>` entry point. Move the existing menu labels and IDs (`Open Launcher`, `Open Manager`, `Settings`, `Quit`) into it. Forward every tray event to `tauri_plugin_positioner::on_tray_event`; on left-button release toggle the popup. Do not set `.show_menu_on_left_click(true)` on Linux; KSNI routes activation and context-menu events separately. Keep tray setup errors returnable instead of calling `expect`.

In `lib.rs`, add `mod tray;`, register the positioner plugin, and replace the inline `TrayIconBuilder` block with `tray::setup(app)?;`. Keep `show_popup`, `hide_popup`, `toggle_popup`, `show_main`, and the existing data commands registered.

- [ ] **Step 6: Position before showing the popup**

Use `tauri_plugin_positioner::WindowExt` in `tray.rs`. On a tray activation, call `move_window_constrained(Position::TrayBottomCenter)` before show/focus. On the global shortcut and frontend `show_popup` command, use `Position::TopRight` when no tray activation supplied a position. Ensure `TrayIconEvent` is passed to the positioner for all event variants before the left-click match.

- [ ] **Step 7: Remove centered startup from the popup configuration**

In `src-tauri/tauri.conf.json`, remove `"center": true` from the `popup` window. Retain its 500×660 logical size, frameless appearance, always-on-top behavior, and skip-taskbar setting. The positioner chooses the location when it opens.

- [ ] **Step 8: Build and verify the Linux activation path**

Run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
npm run desktop:dev
```

Expected: Cargo check passes; on Fedora GNOME, left click opens the custom launcher without first showing the native menu, a second click toggles it closed, the shortcut opens it, and the popup appears below the tray icon within the visible screen. When KSNI is selected, verify right-click still exposes Manager, Settings, and Quit. When the stock no-menu backend passes, confirm Manager and Settings remain available in the launcher and Quit remains available from the manager.

If the icon disappears or activation fails, record `XDG_SESSION_TYPE` and the application logs, then verify the selected KSNI configuration against the resolved tray-icon version before changing other UI behavior. Keep the shortcut and a working native menu entry; do not ship a menu-less icon that cannot reopen the app.

### Task 2: Add tested launcher result selection

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/launcher.ts`
- Create: `src/lib/launcher.test.ts`

- [ ] **Step 1: Add Vitest and the focused test command**

Run:

```bash
npm install --save-dev vitest
```

Add this script to `package.json`:

```json
"test:launcher": "vitest run src/lib/launcher.test.ts"
```

Extend `format:check` to include `src/lib/launcher.ts` and `src/lib/launcher.test.ts` once those files are created.

- [ ] **Step 2: Write failing selector tests**

Create `src/lib/launcher.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getLauncherCommands } from "./launcher";
import type { Command } from "../types";

const makeCommand = (overrides: Partial<Command> = {}): Command => ({
  id: "cmd",
  title: "command",
  command: "printf hello",
  descriptionShort: "Print hello",
  descriptionLong: "Print hello to the terminal.",
  categoryId: "linux",
  tags: [],
  isFavorite: false,
  isEnabled: true,
  runCount: 0,
  lastUsedAt: null,
  ...overrides,
});

describe("getLauncherCommands", () => {
  it("returns every enabled result instead of capping the list", () => {
    const commands = Array.from({ length: 12 }, (_, index) =>
      makeCommand({ id: `cmd-${index}`, title: `command ${index}` }),
    );
    expect(getLauncherCommands(commands, "all", "")).toHaveLength(12);
  });

  it("omits hidden commands and filters by category", () => {
    const commands = [
      makeCommand({ id: "visible", categoryId: "git" }),
      makeCommand({ id: "hidden", categoryId: "git", isEnabled: false }),
      makeCommand({ id: "other", categoryId: "docker" }),
    ];
    expect(
      getLauncherCommands(commands, "git", "").map((item) => item.id),
    ).toEqual(["visible"]);
  });

  it("ranks recent commands, then favorites, without duplicates", () => {
    const commands = [
      makeCommand({ id: "normal" }),
      makeCommand({ id: "favorite", isFavorite: true }),
      makeCommand({
        id: "recent",
        isFavorite: true,
        lastUsedAt: "2026-09-30T10:00:00Z",
      }),
    ];
    expect(
      getLauncherCommands(commands, "all", "").map((item) => item.id),
    ).toEqual(["recent", "favorite", "normal"]);
  });

  it("searches command text and descriptions", () => {
    const commands = [
      makeCommand({
        id: "match",
        command: "journalctl -xe",
        descriptionShort: "Inspect logs",
      }),
      makeCommand({
        id: "other",
        command: "df -h",
        descriptionShort: "Disk space",
      }),
    ];
    expect(
      getLauncherCommands(commands, "all", "journalctl").map((item) => item.id),
    ).toContain("match");
    expect(
      getLauncherCommands(commands, "all", "Inspect").map((item) => item.id),
    ).toContain("match");
  });
});
```

- [ ] **Step 3: Run tests and confirm the initial failure**

Run: `npm run test:launcher`

Expected: FAIL because `src/lib/launcher.ts` does not yet export `getLauncherCommands`.

- [ ] **Step 4: Implement the pure selector**

Create `src/lib/launcher.ts` exporting `getLauncherCommands(commands: Command[], categoryId: string, query: string): Command[]`. Start with enabled commands only. Apply Favorites, Recent, category, then Fuse search filtering. For the empty All query, rank recent first (newest timestamp first), then favorites, then remaining commands, ensuring every command appears once. Never slice/cap this result.

- [ ] **Step 5: Run selector tests and the frontend build**

Run:

```bash
npm run test:launcher
npm run build
```

Expected: all four selector tests pass, and TypeScript/Vite build exits successfully.

### Task 3: Fix launcher actions and category navigation

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/lib/launcher.test.ts`

- [ ] **Step 1: Replace inline popup list calculation**

Import `getLauncherCommands` in `App.tsx`. Use its complete result array for the popup instead of `filtered.slice(0, 7)` and the later `.slice(0, 7)` in `popupItems`. Keep the manager's `filtered` list and hidden-command management unchanged.

- [ ] **Step 2: Make row selection independent from opening details**

Change `choose(id)` so popup selection only highlights the row and selects its command; it does not set `detailsOpen`. The popup info action and `I` shortcut open details. In popup mode, the ArrowUp/ArrowDown handler selects the next result and scrolls the selected row into view without opening details.

- [ ] **Step 3: Add a visible close button**

Add an info action to each popup result row; clicking it selects that command and opens its details card. Add a popup-only header button next to Settings with `aria-label="Close launcher"`, `title="Close launcher"`, and the existing Lucide `X` icon. Call `hidePopup()` from the button. Retain Escape and the current close-after-copy preference.

- [ ] **Step 4: Keep category overflow inside the launcher**

Add `categoryPickerOpen` state in `App.tsx`. Make `More` open an in-launcher chooser listing All, Favorites, Recent, and every category with at least one enabled command. Selecting an item sets `activeCategory` and closes the chooser. Do not route the More action to `showMain()`.

- [ ] **Step 5: Keep keyboard shortcuts attached to the complete list**

Keep `Alt+1` through `Alt+7` bound to the first seven items of the uncapped result list; Enter copies the selected command. Give the scroll container and rows stable refs so keyboard navigation scrolls the active row into view.

- [ ] **Step 6: Run tests and confirm catalog data is unchanged**

Run:

```bash
npm run test:launcher
npm run check:catalog
npm run check:migrations
npm run build
```

Expected: selector, catalog, migration, and build checks pass. No seed or SQLite migration file changes.

### Task 4: Polish launcher and full-window manager layouts

**Files:**

- Modify: `src/styles.css`
- Modify: `src/App.tsx`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Make the launcher list use available window height**

Keep `.popup-shell` as a vertical flex layout and `.popup-list` as the only expanding scroll area. Ensure the parent chain has `min-height: 0`. Keep details collapsed by default and category controls visible. Preserve the current theme variables, glass backgrounds, blue highlights, shadows, and rounded controls.

- [ ] **Step 2: Add responsive category overflow and focus states**

Make visible category chips horizontally scroll when necessary. Style the category chooser with existing glass variables. Ensure the close button stays visible at narrow launcher widths, and keyboard focus remains clearly outlined.

- [ ] **Step 3: Make the manager fill the native client area**

Replace `.full-app` outer viewport padding and `.full-shell` fixed 90vh, max-width, rounded border, and outside shadow with a full-height, full-width app surface. Preserve the glass panels on `.sidebar`, `.command-pane`, and `.details-pane`. Keep `min-height: 0` on the workspace and retain internal scrolling. Move the keyboard hint and Preview Launcher action inside the app's bottom area so the content fits within 100vh.

- [ ] **Step 4: Verify light/dark layouts in the browser preview**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:1420/` and `http://127.0.0.1:1420/?view=popup`. Check 1280×840 and 900×620 viewports. Expected: manager fills the viewport, panes scroll internally, launcher displays all enabled rows, selecting does not expand details, and both themes retain the existing product styling.

### Task 5: Validate and document the Fedora release

**Files:**

- Modify: `README.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`
- Update: `docs/screenshots/launcher-light.png` only after capturing the updated native launcher.
- Update: `docs/screenshots/manager-light.png` only after capturing the updated native manager.

- [ ] **Step 1: Run repository checks**

Run:

```bash
npm run test:launcher
npm run check:catalog
npm run check:migrations
npm run format:check
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: every command exits zero.

- [ ] **Step 2: Bump app metadata to 0.1.1 and build Linux packages**

Set the app version to `0.1.1` consistently in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` so DNF can upgrade the installed 0.1.0 package. Update the lockfile and build all configured bundles:

```bash
npm install --package-lock-only
npm run desktop:build
```

Expected: Tauri writes RPM, Deb, and AppImage artifacts under `src-tauri/target/release/bundle/`.

- [ ] **Step 3: Install and test the RPM on Fedora GNOME**

Install the built RPM using Fedora's package installer or:

```bash
sudo dnf install './src-tauri/target/release/bundle/rpm/Nav Toolbox-0.1.1-1.x86_64.rpm'
```

Launch Nav Toolbox from Activities and verify:

1. One tray click toggles the custom launcher without opening the menu first.
2. `Ctrl+Space` opens the launcher; the tray menu can reach Open Launcher, Open Manager, Settings, and Quit.
3. The popup appears near the top bar, remains on-screen, and has a working close button, Escape, and focus-lost dismissal.
4. All enabled commands appear in a scrollable list; search, category filters, recent/favorite ordering, Enter copy, row copy, details-on-demand, and close-after-copy work.
5. The manager fills the native client area at 1280×840 and 900×620; panes remain usable after resizing.
6. Closing the popup leaves the tray app running; Quit exits it.

If the tray click fails, record the Fedora journal output for Nav Toolbox and `XDG_SESSION_TYPE`; do not publish a package as one-click capable. Keep the shortcut and working tray-menu entry, and update the README with the verified limitation.

- [ ] **Step 4: Update README with tested compatibility**

Document the selected Linux tray backend, shortcut fallback, popup placement and close controls, installation notes, and only the desktop environments actually tested. Replace screenshots only with captures from the updated native build, not the old browser preview.

- [ ] **Step 5: Run formatting and inspect the release diff**

Run:

```bash
npm run format:check
git diff --check
git status --short
```

Expected: formatting and diff checks pass; changes contain the tray/UI implementation, selector tests, README notes, and new screenshots only if captured.

## Plan self-review

- Task 1 addresses the documented Linux tray constraint before the UI work depends on it.
- Tasks 2–4 cover all enabled commands, recent/favorite ordering, search/category behavior, details-on-demand, close controls, and manager sizing.
- Task 5 covers native Fedora packaging, interactive tray tests, and compatibility documentation.
- Validation covers selector logic, catalog/migration integrity, frontend build, Rust compile, and the actual Fedora desktop; package compilation alone does not count as tray verification.
- No database migration or command execution security expansion is included.

## Implementation record (2026-10-08)

The approved behavior is implemented. The KSNI source returns a zero-size tray rectangle, so the implementation uses its activation coordinates and Tauri monitor work-area bounds directly instead of the positioner plugin. The stock AppIndicator no-menu experiment was replaced with inspection of the resolved backend sources and native activation tests. On Wayland the app prefers available XWayland for controllable placement, while respecting an explicit user backend setting.

The launcher exposes all enabled commands, keeps details on demand, has an explicit close control, and provides categories in its own chooser. The manager uses the full native client area. The remaining lifecycle review added single-instance startup so Activities reopens the manager. Version 0.1.1 is built for Fedora; public portable packages require the Linux packages workflow.

Local verification passed: 4 data tests, 4 browser tests, 3 native placement tests, catalog/migration validation, formatting, frontend production build, and npm audit (zero known vulnerabilities). Native StatusNotifier API activation opened a 500 by 660 launcher at y=44, the second activation closed it, and unknown coordinates used the top-right fallback. The user reported that the updated app was working. New documentation screenshots are explicitly labeled browser previews.
