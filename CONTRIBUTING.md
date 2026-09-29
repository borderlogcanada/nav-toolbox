# Contributing

Thanks for helping improve Nav Toolbox. Open an issue before a large change so contributors can agree on scope. Small bug fixes and command corrections can go directly to a pull request.

## Local checks

```bash
npm ci
npm run check:catalog
npm run build
npm run format:check
```

For native changes, install the [Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/) and run `cargo check --manifest-path src-tauri/Cargo.toml`. Test tray, shortcut, import/export, and Run behavior on a Linux desktop session before proposing a release.

## Command catalog

Add commands to `src/data/catalog-v2.json` with unique IDs, a real category, a short explanation, and `isEnabled: false`. Use `<placeholder>` for values people must supply. Do not add credentials, personal hostnames, or commands that irreversibly modify disks or delete files. Prefer official documentation when checking command syntax.

## Pull requests

Describe the user-facing change, the Linux distribution and desktop environment used for testing, and any limitations. Add screenshots for visible UI changes. Never include private backup files, credentials, database files, or local environment files.
