use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, time::Duration};
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub color: String,
    #[serde(default)]
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Command {
    pub id: String,
    pub title: String,
    pub command: String,
    pub description_short: String,
    pub description_long: String,
    pub category_id: String,
    pub tags: Vec<String>,
    pub is_favorite: bool,
    #[serde(default = "default_enabled")]
    pub is_enabled: bool,
    #[serde(default)]
    pub run_count: i64,
    #[serde(default)]
    pub last_used_at: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

fn default_enabled() -> bool { true }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub theme: String,
    pub shortcut: String,
    pub start_on_login: bool,
    pub show_run: bool,
    pub close_after_copy: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self { theme: "system".into(), shortcut: "Control+Space".into(), start_on_login: false, show_run: false, close_after_copy: true }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub categories: Vec<Category>,
    pub commands: Vec<Command>,
    pub settings: Settings,
}

fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("nav-toolbox.db"))
}

fn connect(app: &tauri::AppHandle) -> Result<Connection, String> {
    let db = Connection::open(database_path(app)?).map_err(|e| e.to_string())?;
    db.busy_timeout(Duration::from_secs(5)).map_err(|e| e.to_string())?;
    db.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL, color TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, title TEXT NOT NULL, command TEXT NOT NULL, description_short TEXT NOT NULL DEFAULT '', description_long TEXT NOT NULL DEFAULT '', category_id TEXT NOT NULL REFERENCES categories(id), tags TEXT NOT NULL DEFAULT '[]', is_favorite INTEGER NOT NULL DEFAULT 0, is_enabled INTEGER NOT NULL DEFAULT 1, run_count INTEGER NOT NULL DEFAULT 0, last_used_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS related_commands (id INTEGER PRIMARY KEY, command_id TEXT NOT NULL REFERENCES commands(id) ON DELETE CASCADE, related_command_id TEXT NOT NULL REFERENCES commands(id) ON DELETE CASCADE, UNIQUE(command_id,related_command_id));
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);")
        .map_err(|e| e.to_string())?;
    let mut columns = db.prepare("PRAGMA table_info(commands)").map_err(|e| e.to_string())?;
    let has_enabled = columns.query_map([], |r| r.get::<_, String>(1)).map_err(|e| e.to_string())?
        .any(|name| name.map(|value| value == "is_enabled").unwrap_or(false));
    drop(columns);
    if !has_enabled { db.execute("ALTER TABLE commands ADD COLUMN is_enabled INTEGER NOT NULL DEFAULT 1", []).map_err(|e| e.to_string())?; }
    let count: i64 = db.query_row("SELECT COUNT(*) FROM categories", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    if count == 0 {
        let seed: serde_json::Value = serde_json::from_str(include_str!("../../src/data/seed.json")).map_err(|e| e.to_string())?;
        let categories: Vec<Category> = serde_json::from_value(seed["categories"].clone()).map_err(|e| e.to_string())?;
        let commands: Vec<Command> = serde_json::from_value(seed["commands"].clone()).map_err(|e| e.to_string())?;
        for (index, category) in categories.iter().enumerate() { insert_category(&db, category, index as i64)?; }
        for command in &commands { insert_command(&db, command)?; }
    }
    let current_version: Option<i64> = db.query_row("SELECT value FROM settings WHERE key='catalog_version'", [], |r| r.get::<_, String>(0))
        .optional().map_err(|e| e.to_string())?.and_then(|value| value.parse().ok());
    for (version, source) in [(2, include_str!("../../src/data/catalog-v2.json")), (3, include_str!("../../src/data/catalog-v3.json"))] {
        if current_version.unwrap_or(1) >= version { continue; }
        let expansion: serde_json::Value = serde_json::from_str(source).map_err(|e| e.to_string())?;
        let categories: Vec<Category> = serde_json::from_value(expansion["categories"].clone()).map_err(|e| e.to_string())?;
        let commands: Vec<Command> = serde_json::from_value(expansion["commands"].clone()).map_err(|e| e.to_string())?;
        let order: i64 = db.query_row("SELECT COALESCE(MAX(sort_order),0) FROM categories", [], |r| r.get(0)).map_err(|e| e.to_string())?;
        db.execute_batch("BEGIN IMMEDIATE").map_err(|e| e.to_string())?;
        let seed_result = (|| {
            for (index, category) in categories.iter().enumerate() { insert_category_if_missing(&db, category, order + index as i64 + 1)?; }
            for command in &commands { insert_command_if_missing(&db, command)?; }
            db.execute("INSERT INTO settings(key,value) VALUES ('catalog_version',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [version.to_string()]).map_err(|e| e.to_string())?;
            Ok::<(), String>(())
        })();
        if let Err(error) = seed_result { let _ = db.execute_batch("ROLLBACK"); return Err(error); }
        db.execute_batch("COMMIT").map_err(|e| e.to_string())?;
    }
    Ok(db)
}

fn insert_category(db: &Connection, item: &Category, order: i64) -> Result<(), String> {
    validate_category(item)?;
    db.execute("INSERT INTO categories(id,name,icon,color,sort_order) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(id) DO UPDATE SET name=excluded.name,icon=excluded.icon,color=excluded.color,sort_order=excluded.sort_order", params![item.id, item.name, item.icon, item.color, order]).map_err(|e| e.to_string())?;
    Ok(())
}
fn validate_category(item: &Category) -> Result<(), String> {
    if item.id.trim().is_empty() || item.id.len() > 120 || item.name.trim().is_empty() || item.name.len() > 120 || item.icon.len() > 80 || item.color.len() > 40 {
        return Err("Invalid category fields".into());
    }
    Ok(())
}
fn insert_category_if_missing(db: &Connection, item: &Category, order: i64) -> Result<(), String> {
    validate_category(item)?;
    db.execute("INSERT OR IGNORE INTO categories(id,name,icon,color,sort_order) VALUES (?1,?2,?3,?4,?5)", params![item.id, item.name, item.icon, item.color, order]).map_err(|e| e.to_string())?;
    Ok(())
}
fn insert_command(db: &Connection, item: &Command) -> Result<(), String> {
    validate_command(item)?;
    let tags = serde_json::to_string(&item.tags).map_err(|e| e.to_string())?;
    db.execute("INSERT INTO commands(id,title,command,description_short,description_long,category_id,tags,is_favorite,is_enabled,run_count,last_used_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11) ON CONFLICT(id) DO UPDATE SET title=excluded.title,command=excluded.command,description_short=excluded.description_short,description_long=excluded.description_long,category_id=excluded.category_id,tags=excluded.tags,is_favorite=excluded.is_favorite,is_enabled=excluded.is_enabled,run_count=excluded.run_count,last_used_at=excluded.last_used_at,updated_at=CURRENT_TIMESTAMP", params![item.id,item.title,item.command,item.description_short,item.description_long,item.category_id,tags,item.is_favorite,item.is_enabled,item.run_count,item.last_used_at]).map_err(|e| e.to_string())?;
    Ok(())
}
fn validate_command(item: &Command) -> Result<(), String> {
    if item.id.trim().is_empty() || item.id.len() > 120 || item.title.trim().is_empty() || item.title.len() > 200 || item.command.trim().is_empty() || item.command.len() > 4096 || item.command.contains('\0') || item.description_short.len() > 500 || item.description_long.len() > 10000 || item.category_id.trim().is_empty() || item.category_id.len() > 120 || item.tags.len() > 32 || item.tags.iter().any(|tag| tag.len() > 80) || item.run_count < 0 {
        return Err("Invalid command fields".into());
    }
    Ok(())
}
fn insert_command_if_missing(db: &Connection, item: &Command) -> Result<(), String> {
    validate_command(item)?;
    let tags = serde_json::to_string(&item.tags).map_err(|e| e.to_string())?;
    db.execute("INSERT OR IGNORE INTO commands(id,title,command,description_short,description_long,category_id,tags,is_favorite,is_enabled,run_count,last_used_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)", params![item.id,item.title,item.command,item.description_short,item.description_long,item.category_id,tags,item.is_favorite,item.is_enabled,item.run_count,item.last_used_at]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn load(app: &tauri::AppHandle) -> Result<Snapshot, String> {
    let db = connect(app)?;
    let mut category_stmt = db.prepare("SELECT id,name,icon,color,sort_order FROM categories ORDER BY sort_order,name").map_err(|e| e.to_string())?;
    let categories = category_stmt.query_map([], |r| Ok(Category { id: r.get(0)?, name: r.get(1)?, icon: r.get(2)?, color: r.get(3)?, sort_order: r.get(4)? })).map_err(|e| e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())?;
    let mut command_stmt = db.prepare("SELECT id,title,command,description_short,description_long,category_id,tags,is_favorite,is_enabled,run_count,last_used_at,created_at,updated_at FROM commands ORDER BY title COLLATE NOCASE").map_err(|e| e.to_string())?;
    let commands = command_stmt.query_map([], |r| { let tags: String = r.get(6)?; Ok(Command { id: r.get(0)?, title: r.get(1)?, command: r.get(2)?, description_short: r.get(3)?, description_long: r.get(4)?, category_id: r.get(5)?, tags: serde_json::from_str(&tags).unwrap_or_default(), is_favorite: r.get(7)?, is_enabled: r.get(8)?, run_count: r.get(9)?, last_used_at: r.get(10)?, created_at: r.get(11)?, updated_at: r.get(12)? }) }).map_err(|e| e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())?;
    let value: Option<String> = db.query_row("SELECT value FROM settings WHERE key='preferences'", [], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
    let settings = value.and_then(|v| serde_json::from_str(&v).ok()).unwrap_or_default();
    Ok(Snapshot { categories, commands, settings })
}

pub fn save_command(app: &tauri::AppHandle, command: Command) -> Result<(), String> { insert_command(&connect(app)?, &command) }
pub fn set_category_enabled(app: &tauri::AppHandle, category_id: &str, enabled: bool) -> Result<(), String> {
    connect(app)?.execute("UPDATE commands SET is_enabled=?1,updated_at=CURRENT_TIMESTAMP WHERE category_id=?2", params![enabled, category_id]).map_err(|e| e.to_string())?;
    Ok(())
}
pub fn delete_command(app: &tauri::AppHandle, id: &str) -> Result<(), String> { connect(app)?.execute("DELETE FROM commands WHERE id=?1", [id]).map_err(|e| e.to_string())?; Ok(()) }
pub fn save_category(app: &tauri::AppHandle, category: Category) -> Result<(), String> { let db = connect(app)?; let order: i64 = db.query_row("SELECT COALESCE(MAX(sort_order),0)+1 FROM categories", [], |r| r.get(0)).map_err(|e| e.to_string())?; insert_category(&db, &category, order) }
pub fn save_settings(app: &tauri::AppHandle, settings: Settings) -> Result<(), String> { validate_settings(&settings)?; let value = serde_json::to_string(&settings).map_err(|e| e.to_string())?; connect(app)?.execute("INSERT INTO settings(key,value) VALUES ('preferences',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [value]).map_err(|e| e.to_string())?; Ok(()) }
pub fn mark_used(app: &tauri::AppHandle, id: &str) -> Result<(), String> { connect(app)?.execute("UPDATE commands SET run_count=run_count+1,last_used_at=CURRENT_TIMESTAMP WHERE id=?1", [id]).map_err(|e| e.to_string())?; Ok(()) }
pub fn import(app: &tauri::AppHandle, snapshot: Snapshot) -> Result<(), String> {
    if snapshot.categories.is_empty() || snapshot.categories.len() > 1000 || snapshot.commands.len() > 10000 { return Err("Backup is empty or too large".into()); }
    validate_settings(&snapshot.settings)?;
    let mut db = connect(app)?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    tx.execute_batch("DELETE FROM related_commands; DELETE FROM commands; DELETE FROM categories;").map_err(|e| e.to_string())?;
    for (index, category) in snapshot.categories.iter().enumerate() { insert_category(&tx, category, index as i64)?; }
    for command in &snapshot.commands { insert_command(&tx, command)?; }
    let mut imported_settings = snapshot.settings;
    imported_settings.show_run = false;
    imported_settings.start_on_login = false;
    let value = serde_json::to_string(&imported_settings).map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO settings(key,value) VALUES ('preferences',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [value]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}
fn validate_settings(settings: &Settings) -> Result<(), String> {
    if !matches!(settings.theme.as_str(), "system" | "light" | "dark") || settings.shortcut.len() > 100 || settings.shortcut.trim().is_empty() { return Err("Invalid settings".into()); }
    Ok(())
}
