# Security

Please report a security issue privately through GitHub's **Report a vulnerability** feature once the public repository is available. Until then, contact the repository owner privately. Avoid posting exploit details in a public issue.

Nav Toolbox stores commands locally. Exported JSON backups may contain private hostnames, paths, or secrets that a user put into commands, so keep backups private. The optional Run action is disabled by default, requires a confirmation in the UI, and executes the saved command in a visible terminal with the user's privileges. Review every command before enabling Run or importing a backup.

The packaged app does not need a Nav Toolbox server or account. The browser preview stores data in browser local storage; the desktop app stores it in SQLite under the app data directory.
