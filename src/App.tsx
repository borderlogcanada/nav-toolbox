import { useEffect, useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";
import {
  Activity,
  Atom,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Clock3,
  Command as CommandIcon,
  Container,
  Database,
  FileText,
  GitBranch,
  Globe,
  HardDrive,
  Hexagon,
  House,
  Info,
  Keyboard,
  LayoutGrid,
  Map,
  Network,
  Play,
  Plus,
  Search,
  Server,
  Settings2,
  Shield,
  ShieldAlert,
  Star,
  Terminal,
  Trash2,
  Triangle,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import {
  defaultSettings,
  type Category,
  type Command,
  type Settings,
  type Snapshot,
} from "./types";
import {
  deleteCommand,
  importSnapshot,
  loadSnapshot,
  markUsed,
  native,
  saveCategory,
  saveCommand,
  saveSettings,
  setCategoryEnabled,
} from "./lib/data";
import {
  chooseImport,
  copyText,
  exportJson,
  hidePopup,
  runCommand,
  setAutostart,
  setShortcut,
  showMain,
  showPopup,
} from "./lib/native";

const iconMap: Record<string, LucideIcon> = {
  container: Container,
  "git-branch": GitBranch,
  terminal: Terminal,
  server: Server,
  "hard-drive": HardDrive,
  "settings-2": Settings2,
  globe: Globe,
  database: Database,
  "file-text": FileText,
  hexagon: Hexagon,
  triangle: Triangle,
  atom: Atom,
  network: Network,
  house: House,
  map: Map,
  box: Box,
  activity: Activity,
  shield: Shield,
  search: Search,
};
const blankCommand = (categoryId = "docker"): Command => ({
  id: crypto.randomUUID(),
  title: "",
  command: "",
  descriptionShort: "",
  descriptionLong: "",
  categoryId,
  tags: [],
  isFavorite: false,
  isEnabled: true,
  runCount: 0,
  lastUsedAt: null,
});
const dangerous = (value: string) =>
  /(^|[;&|\s])(sudo|rm|kill|pkill|dd|mkfs|chmod|chown|shred|wipefs|fdisk|parted|poweroff|reboot|prune|down|restore|reset|upgrade|update)(\s|$)/i.test(
    value,
  );
const isTemplate = (value: string) => /<[^>]+>|""/.test(value);
const runBlockReason = (command: Command) =>
  command.tags.includes("current-shell")
    ? "Copy into your current terminal"
    : isTemplate(command.command)
      ? "Edit placeholders first"
      : !command.isEnabled
        ? "Enable this command first"
        : "";
const displayShortcut = (shortcut: string) =>
  shortcut.replace("Control", "Ctrl").replaceAll("+", " + ");

function CategoryIcon({
  category,
  size = 20,
}: {
  category?: Category;
  size?: number;
}) {
  const Icon = category ? iconMap[category.icon] || CommandIcon : LayoutGrid;
  return (
    <span
      className="category-icon"
      style={{ color: category?.color ?? "var(--accent)" }}
    >
      <Icon size={size} strokeWidth={2.35} />
    </span>
  );
}

export default function App() {
  const popup = new URLSearchParams(location.search).get("view") === "popup";
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [activeCategory, setActiveCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [tab, setTab] = useState<"details" | "examples" | "related">("details");
  const [editor, setEditor] = useState<Command | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newCategory, setNewCategory] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    id: string;
  } | null>(null);
  const [toast, setToast] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const commands = snapshot?.commands ?? [];
  const categories = snapshot?.categories ?? [];
  const settings = snapshot?.settings ?? defaultSettings;
  const enabledCommands = useMemo(
    () => commands.filter((c) => c.isEnabled),
    [commands],
  );
  const selected = commands.find((c) => c.id === selectedId) ?? null;

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  }
  function report(error: unknown) {
    notify(error instanceof Error ? error.message : String(error));
  }
  async function refresh() {
    try {
      const data = await loadSnapshot();
      setSnapshot(data);
      if (!popup && data.commands.length) {
        setSelectedId(
          (data.commands.find((c) => c.id === "docker-up") ?? data.commands[0])
            .id,
        );
        setDetailsOpen(window.innerWidth > 760);
      }
    } catch (error) {
      report(error);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    const sync = () => {
      if (native) void loadSnapshot().then(setSnapshot).catch(report);
    };
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, []);
  useEffect(() => {
    if (!native || popup) return;
    let dispose: (() => void) | undefined;
    void listen("open-settings", () => setSettingsOpen(true)).then(
      (unlisten) => {
        dispose = unlisten;
      },
    );
    return () => dispose?.();
  }, []);
  useEffect(() => {
    if (!snapshot) return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        settings.theme === "system"
          ? media.matches
            ? "dark"
            : "light"
          : settings.theme;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [settings.theme, snapshot]);
  useEffect(() => {
    if (!native || !snapshot || popup) return;
    void setShortcut(null, settings.shortcut).catch(report);
  }, [!!snapshot]);
  const managingVisibility =
    !popup && !["all", "favorites", "recent"].includes(activeCategory);
  const filtered = useMemo(() => {
    let list = managingVisibility ? [...commands] : [...enabledCommands];
    if (activeCategory === "favorites") list = list.filter((c) => c.isFavorite);
    else if (activeCategory === "recent")
      list = list
        .filter((c) => c.lastUsedAt)
        .sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? ""));
    else if (activeCategory !== "all" && activeCategory !== "library")
      list = list.filter((c) => c.categoryId === activeCategory);
    if (query.trim()) {
      const fuse = new Fuse(list, {
        keys: [
          "title",
          "command",
          "descriptionShort",
          "descriptionLong",
          "tags",
          "categoryId",
        ],
        threshold: 0.38,
      });
      list = fuse.search(query.trim()).map((r) => r.item);
    }
    return list;
  }, [commands, enabledCommands, activeCategory, query, managingVisibility]);
  const shown = popup ? filtered.slice(0, 7) : filtered;
  useEffect(() => {
    if (selectedId && !commands.some((c) => c.id === selectedId))
      setSelectedId(null);
  }, [commands, selectedId]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (
        !editor &&
        !settingsOpen &&
        popup &&
        event.altKey &&
        /^[1-7]$/.test(event.key) &&
        popupItems[Number(event.key) - 1]
      ) {
        event.preventDefault();
        void copy(popupItems[Number(event.key) - 1]);
      }
      if (event.key === "Escape") {
        if (editor) setEditor(null);
        else if (settingsOpen) setSettingsOpen(false);
        else if (popup) void hidePopup();
        else setDetailsOpen(false);
      }
      if (editor || settingsOpen) return;
      if (
        event.key.toLowerCase() === "i" &&
        document.activeElement !== searchRef.current
      ) {
        if (selectedId) {
          event.preventDefault();
          setDetailsOpen(true);
        }
      }
      if (
        (event.key === "ArrowDown" || event.key === "ArrowUp") &&
        document.activeElement === searchRef.current &&
        (popup ? popupItems.length : shown.length)
      ) {
        event.preventDefault();
        const items = popup ? popupItems : shown;
        const index = items.findIndex((c) => c.id === selectedId);
        const next =
          event.key === "ArrowDown"
            ? Math.min(index + 1, items.length - 1)
            : Math.max(index - 1, 0);
        setSelectedId(items[next].id);
        setDetailsOpen(true);
      }
      if (
        event.key === "Enter" &&
        selected &&
        !event.shiftKey &&
        !event.ctrlKey
      ) {
        event.preventDefault();
        void copy(selected);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  async function copy(command: Command) {
    try {
      await copyText(command.command);
      setSnapshot(await markUsed(command.id));
      notify("Copied to clipboard");
      if (popup && settings.closeAfterCopy) await hidePopup();
    } catch (error) {
      report(error);
    }
  }
  async function favorite(command: Command) {
    try {
      setSnapshot(
        await saveCommand({ ...command, isFavorite: !command.isFavorite }),
      );
    } catch (error) {
      report(error);
    }
  }
  async function toggleEnabled(command: Command) {
    try {
      setSnapshot(
        await saveCommand({ ...command, isEnabled: !command.isEnabled }),
      );
      notify(command.isEnabled ? "Hidden from launcher" : "Added to launcher");
    } catch (error) {
      report(error);
    }
  }
  async function toggleCategory(categoryId: string) {
    const items = commands.filter((c) => c.categoryId === categoryId);
    const enable = !items.every((c) => c.isEnabled);
    try {
      setSnapshot(await setCategoryEnabled(categoryId, enable));
      notify(
        enable ? "Category added to launcher" : "Category hidden from launcher",
      );
    } catch (error) {
      report(error);
    }
  }
  async function execute(command: Command) {
    if (!settings.showRun) return;
    if (command.tags.includes("current-shell")) {
      notify("Copy this command into your current terminal");
      return;
    }
    if (isTemplate(command.command)) {
      notify("Fill in the placeholders before running this command");
      return;
    }
    const warning = dangerous(command.command)
      ? "This command can modify your system. Review it carefully.\n\n"
      : "";
    if (
      !confirm(
        `${warning}Run this command in a new terminal?\n\n${command.command}`,
      )
    )
      return;
    try {
      await runCommand(command.id);
      setSnapshot(await markUsed(command.id));
      notify("Opened in terminal");
      if (popup) await hidePopup();
    } catch (error) {
      report(error);
    }
  }
  async function updateSettings(next: Settings) {
    try {
      if (next.shortcut !== settings.shortcut)
        await setShortcut(settings.shortcut, next.shortcut);
      if (next.startOnLogin !== settings.startOnLogin)
        await setAutostart(next.startOnLogin);
      setSnapshot(await saveSettings(next));
      notify("Settings saved");
    } catch (error) {
      report(error);
    }
  }
  async function saveEdited() {
    if (!editor) return;
    if (!editor.title.trim() || !editor.command.trim()) {
      notify("Title and command are required");
      return;
    }
    try {
      setSnapshot(
        await saveCommand({
          ...editor,
          title: editor.title.trim(),
          command: editor.command.trim(),
        }),
      );
      setSelectedId(editor.id);
      setEditor(null);
      notify("Command saved");
    } catch (error) {
      report(error);
    }
  }
  async function removeEdited() {
    if (!editor || !confirm(`Delete “${editor.title}”?`)) return;
    try {
      setSnapshot(await deleteCommand(editor.id));
      setEditor(null);
      notify("Command deleted");
    } catch (error) {
      report(error);
    }
  }
  async function createCategory(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const id = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      setSnapshot(
        await saveCategory({
          id,
          name: trimmed,
          icon: "hexagon",
          color: "#5575e8",
        }),
      );
      setActiveCategory(id);
      setNewCategory(false);
      notify("Category added");
    } catch (error) {
      report(error);
    }
  }
  async function importBackup() {
    try {
      const data = await chooseImport();
      if (!data) return;
      if (!confirm("Import this backup and replace your current commands?"))
        return;
      const imported = await importSnapshot(data);
      setSnapshot(imported);
      setSelectedId(null);
      if (native) {
        await setShortcut(settings.shortcut, imported.settings.shortcut);
        await setAutostart(imported.settings.startOnLogin);
      }
      notify("Backup imported");
    } catch (error) {
      report(error);
    }
  }
  const categoryFor = (id: string) => categories.find((c) => c.id === id);
  const choose = (id: string) => {
    setSelectedId(id);
    setDetailsOpen(true);
    setTab("details");
  };
  const recent = [...enabledCommands]
    .filter((c) => c.lastUsedAt)
    .sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? ""));
  const popupItems =
    activeCategory === "all" && !query
      ? [
          ...recent,
          ...enabledCommands.filter(
            (c) => c.isFavorite && !recent.some((r) => r.id === c.id),
          ),
          ...enabledCommands.filter(
            (c) => !recent.some((r) => r.id === c.id) && !c.isFavorite,
          ),
        ].slice(0, 7)
      : shown;
  const contextCommand = contextMenu
    ? commands.find((c) => c.id === contextMenu.id)
    : null;

  if (!snapshot)
    return (
      <div className="loading">
        <BrandMark /> <span>Loading Nav Toolbox…</span>
      </div>
    );
  return (
    <div
      className={popup ? "app popup-app" : "app full-app"}
      onClick={() => contextMenu && setContextMenu(null)}
    >
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <main className={popup ? "shell popup-shell" : "shell full-shell"}>
        <header className="topbar">
          <div className="brand">
            <BrandMark />
            <div>
              <strong>Nav Toolbox</strong>
              <span>
                {popup
                  ? "Quick commands at your fingertips"
                  : "Your command center"}
              </span>
            </div>
          </div>
          {!popup && (
            <SearchBox value={query} onChange={setQuery} inputRef={searchRef} />
          )}
          <div className="top-actions">
            {!popup && (
              <button
                className="icon-button"
                title="Add command"
                onClick={() =>
                  setEditor(
                    blankCommand(
                      activeCategory === "all" ||
                        activeCategory === "favorites" ||
                        activeCategory === "recent"
                        ? "docker"
                        : activeCategory,
                    ),
                  )
                }
              >
                <Plus />
              </button>
            )}
            {popup && (
              <button
                className="icon-button"
                title="Open full window"
                onClick={() => void showMain()}
              >
                <LayoutGrid />
              </button>
            )}
            <button
              className="icon-button"
              title="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 />
            </button>
          </div>
        </header>
        {popup ? (
          <section className="popup-body">
            <SearchBox value={query} onChange={setQuery} inputRef={searchRef} />
            <div className="section-heading">
              <span>
                {query
                  ? "Search results"
                  : activeCategory === "all"
                    ? "Recent & favorites"
                    : activeCategory === "favorites"
                      ? "Favorites"
                      : (categoryFor(activeCategory)?.name ?? "Commands")}
              </span>
              <button className="text-button" onClick={() => void showMain()}>
                See all
              </button>
            </div>
            <div className="popup-list">
              {popupItems.length ? (
                popupItems.map((item, index) => (
                  <div
                    key={item.id}
                    className={`popup-row ${selectedId === item.id ? "selected" : ""}`}
                    onClick={() => choose(item.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        id: item.id,
                      });
                    }}
                  >
                    <CategoryIcon
                      category={categoryFor(item.categoryId)}
                      size={20}
                    />
                    <div className="row-copy">
                      <strong>{item.title}</strong>
                      <small>{item.descriptionShort}</small>
                    </div>
                    <button
                      className="row-action"
                      title="Copy command"
                      onClick={(e) => {
                        e.stopPropagation();
                        void copy(item);
                      }}
                    >
                      <Clipboard size={16} />
                    </button>
                    <kbd>Alt {index + 1}</kbd>
                  </div>
                ))
              ) : (
                <EmptyState />
              )}
            </div>
            {selected && detailsOpen && (
              <div className="popup-preview">
                <div className="preview-header">
                  <CategoryIcon
                    category={categoryFor(selected.categoryId)}
                    size={24}
                  />
                  <div>
                    <strong>{selected.title}</strong>
                    <span>{selected.descriptionShort}</span>
                  </div>
                  <button
                    className="icon-button tiny"
                    onClick={() => setDetailsOpen(false)}
                    title="Collapse details"
                  >
                    <ChevronDown size={17} />
                  </button>
                </div>
                <p>{selected.descriptionLong || selected.descriptionShort}</p>
                <div className="code-line">
                  <code>{selected.command}</code>
                  <button
                    title="Copy command"
                    onClick={() => void copy(selected)}
                  >
                    <Clipboard size={16} />
                  </button>
                </div>
                {settings.showRun && (
                  <button
                    className="subtle-run"
                    onClick={() => void execute(selected)}
                  >
                    <Play size={14} /> Run in terminal
                  </button>
                )}
              </div>
            )}
            <nav className="category-tabs">
              {[
                "all",
                ...categories
                  .filter((category) =>
                    enabledCommands.some(
                      (command) => command.categoryId === category.id,
                    ),
                  )
                  .slice(0, 4)
                  .map((category) => category.id),
              ].map((id) => (
                <button
                  key={id}
                  className={activeCategory === id ? "active" : ""}
                  onClick={() => setActiveCategory(id)}
                >
                  <CategoryIcon category={categoryFor(id)} size={21} />
                  <span>{id === "all" ? "All" : categoryFor(id)?.name}</span>
                </button>
              ))}
              <button onClick={() => void showMain()}>
                <ChevronRight size={22} />
                <span>More</span>
              </button>
            </nav>
          </section>
        ) : (
          <div className="workspace">
            <aside className="sidebar">
              <button
                className={`sidebar-item ${activeCategory === "all" ? "active" : ""}`}
                onClick={() => setActiveCategory("all")}
              >
                <LayoutGrid size={19} /> All Commands{" "}
                <span>{enabledCommands.length}</span>
              </button>
              <button
                className={`sidebar-item ${activeCategory === "favorites" ? "active" : ""}`}
                onClick={() => setActiveCategory("favorites")}
              >
                <Star size={19} className="star-icon" /> Favorites{" "}
                <span>
                  {enabledCommands.filter((c) => c.isFavorite).length}
                </span>
              </button>
              <button
                className={`sidebar-item ${activeCategory === "recent" ? "active" : ""}`}
                onClick={() => setActiveCategory("recent")}
              >
                <Clock3 size={19} /> Recent <span>{recent.length}</span>
              </button>
              <button
                className={`sidebar-item ${activeCategory === "library" ? "active" : ""}`}
                onClick={() => setActiveCategory("library")}
              >
                <Database size={19} /> Command Library{" "}
                <span>{commands.length}</span>
              </button>
              <div className="sidebar-label">Categories</div>
              <div className="sidebar-categories">
                {categories
                  .filter(
                    (category) =>
                      managingVisibility ||
                      enabledCommands.some(
                        (command) => command.categoryId === category.id,
                      ),
                  )
                  .map((category) => (
                    <button
                      className={`sidebar-item ${activeCategory === category.id ? "active" : ""}`}
                      key={category.id}
                      onClick={() => setActiveCategory(category.id)}
                    >
                      <CategoryIcon category={category} size={19} />
                      {category.name}
                      <span>
                        {
                          (managingVisibility
                            ? commands
                            : enabledCommands
                          ).filter((c) => c.categoryId === category.id).length
                        }
                      </span>
                    </button>
                  ))}
              </div>
              <button
                className="sidebar-add"
                onClick={() => setNewCategory(true)}
              >
                <Plus size={19} /> Add category
              </button>
            </aside>
            <section className="command-pane">
              <div className="pane-heading">
                <div>
                  <select
                    className="mobile-category-picker"
                    aria-label="Choose command collection"
                    value={activeCategory}
                    onChange={(event) => setActiveCategory(event.target.value)}
                  >
                    <option value="all">All Commands</option>
                    <option value="favorites">Favorites</option>
                    <option value="recent">Recent</option>
                    <option value="library">Command Library</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  <div className="eyebrow">COMMAND LIBRARY</div>
                  <h1>
                    {activeCategory === "all"
                      ? "All Commands"
                      : activeCategory === "library"
                        ? "Command Library"
                        : activeCategory === "favorites"
                          ? "Favorites"
                          : activeCategory === "recent"
                            ? "Recent"
                            : categoryFor(activeCategory)?.name}
                  </h1>
                  <p>
                    {managingVisibility
                      ? activeCategory === "library"
                        ? `${enabledCommands.length} active of ${commands.length} commands. Enable only what you use.`
                        : `${filtered.filter((command) => command.isEnabled).length} active of ${filtered.length} commands in this category.`
                      : `${filtered.length} ${filtered.length === 1 ? "command" : "commands"} ready to copy`}
                  </p>
                </div>
                <button
                  className="primary-button"
                  onClick={() =>
                    setEditor(
                      blankCommand(
                        activeCategory === "all" ||
                          activeCategory === "library" ||
                          activeCategory === "favorites" ||
                          activeCategory === "recent"
                          ? "docker"
                          : activeCategory,
                      ),
                    )
                  }
                >
                  <Plus size={17} /> New command
                </button>
              </div>
              <div className="command-scroll">
                {activeCategory === "library" && (
                  <div className="library-note">
                    Browse the bundled commands by tool or Linux distribution.
                    Enable a whole group, or turn on individual commands. Only
                    active commands appear in the launcher.
                  </div>
                )}
                {((activeCategory === "all" || activeCategory === "library") &&
                !query
                  ? categories
                      .filter((category) =>
                        filtered.some((c) => c.categoryId === category.id),
                      )
                      .map((category) => ({
                        category,
                        items: filtered.filter(
                          (c) => c.categoryId === category.id,
                        ),
                      }))
                  : [{ category: categoryFor(activeCategory), items: filtered }]
                ).map((group, index) => (
                  <section
                    className="command-group"
                    key={group.category?.id ?? index}
                  >
                    <div className="group-header">
                      <CategoryIcon category={group.category} size={25} />
                      <div>
                        <h2>
                          {group.category?.name ??
                            (activeCategory === "favorites"
                              ? "Favorites"
                              : activeCategory === "recent"
                                ? "Recent"
                                : "Results")}
                        </h2>
                        <span>{group.items.length} commands</span>
                      </div>
                      {managingVisibility &&
                        group.category &&
                        group.items.length > 0 && (
                          <button
                            className="group-toggle"
                            onClick={() =>
                              void toggleCategory(group.category!.id)
                            }
                          >
                            {group.items.every((item) => item.isEnabled)
                              ? "Disable all"
                              : "Enable all"}
                          </button>
                        )}
                    </div>
                    <div className="command-rows">
                      {group.items.map((item) => (
                        <div
                          key={item.id}
                          className={`command-row ${selectedId === item.id ? "selected" : ""} ${!item.isEnabled ? "disabled-command" : ""}`}
                          onClick={() => choose(item.id)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({
                              x: e.clientX,
                              y: e.clientY,
                              id: item.id,
                            });
                          }}
                        >
                          <span
                            className={`status-dot ${item.id === selectedId ? "on" : ""}`}
                          />
                          <div className="row-copy">
                            <strong>{item.title}</strong>
                            <small>{item.descriptionShort}</small>
                          </div>
                          {managingVisibility && (
                            <button
                              className={`visibility-toggle ${item.isEnabled ? "enabled" : ""}`}
                              title={
                                item.isEnabled
                                  ? "Hide from launcher"
                                  : "Show in launcher"
                              }
                              aria-label={`${item.isEnabled ? "Hide" : "Show"} ${item.title} in launcher`}
                              onClick={(e) => {
                                e.stopPropagation();
                                void toggleEnabled(item);
                              }}
                            >
                              {item.isEnabled ? "On" : "Off"}
                            </button>
                          )}
                          <button
                            className={`row-action favorite ${item.isFavorite ? "is-favorite" : ""}`}
                            title={
                              item.isFavorite
                                ? "Remove favorite"
                                : "Add favorite"
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              void favorite(item);
                            }}
                          >
                            <Star
                              size={18}
                              fill={item.isFavorite ? "currentColor" : "none"}
                            />
                          </button>
                          <button
                            className="row-action"
                            title="View details"
                            onClick={(e) => {
                              e.stopPropagation();
                              choose(item.id);
                            }}
                          >
                            <Info size={17} />
                          </button>
                          <button
                            className="row-action"
                            title="Copy command"
                            onClick={(e) => {
                              e.stopPropagation();
                              void copy(item);
                            }}
                          >
                            <Clipboard size={17} />
                          </button>
                          {settings.showRun && (
                            <button
                              className="run-button"
                              disabled={!!runBlockReason(item)}
                              title={runBlockReason(item) || "Run in terminal"}
                              onClick={(e) => {
                                e.stopPropagation();
                                void execute(item);
                              }}
                            >
                              <Play size={17} fill="currentColor" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
                {!filtered.length && <EmptyState />}
              </div>
            </section>
            <aside
              className={`details-pane ${selected && detailsOpen ? "mobile-open" : ""}`}
            >
              <button
                className="mobile-detail-close icon-button tiny"
                onClick={() => setDetailsOpen(false)}
                title="Close details"
                aria-label="Close details"
              >
                <X size={17} />
              </button>
              {selected && detailsOpen ? (
                <>
                  <div className="detail-title">
                    <CategoryIcon
                      category={categoryFor(selected.categoryId)}
                      size={31}
                    />
                    <div>
                      <h2>{selected.title}</h2>
                      <p>{selected.descriptionShort}</p>
                    </div>
                    <button
                      className={`row-action favorite ${selected.isFavorite ? "is-favorite" : ""}`}
                      title="Toggle favorite"
                      onClick={() => void favorite(selected)}
                    >
                      <Star
                        size={19}
                        fill={selected.isFavorite ? "currentColor" : "none"}
                      />
                    </button>
                  </div>
                  <div className="segmented">
                    {(["details", "examples", "related"] as const).map(
                      (value) => (
                        <button
                          key={value}
                          className={tab === value ? "active" : ""}
                          onClick={() => setTab(value)}
                        >
                          {value}
                        </button>
                      ),
                    )}
                  </div>
                  {tab === "details" && (
                    <>
                      <div className="info-card">
                        <Info size={18} />
                        <div>
                          <strong>What this does</strong>
                          <p>
                            {selected.descriptionLong ||
                              selected.descriptionShort}
                          </p>
                        </div>
                      </div>
                      <label className="field-label">Command</label>
                      <div className="code-line">
                        <code>{selected.command}</code>
                        <button
                          title="Copy command"
                          onClick={() => void copy(selected)}
                        >
                          <Clipboard size={17} />
                        </button>
                      </div>
                      <div className="detail-actions">
                        <button
                          className="primary-button"
                          onClick={() => void copy(selected)}
                        >
                          <Clipboard size={16} /> Copy command
                        </button>
                        {settings.showRun && (
                          <button
                            className="secondary-button"
                            disabled={!!runBlockReason(selected)}
                            title={
                              runBlockReason(selected) || "Run in terminal"
                            }
                            onClick={() => void execute(selected)}
                          >
                            <Play size={15} /> Run
                          </button>
                        )}
                      </div>
                      <button
                        className={`detail-visibility ${selected.isEnabled ? "on" : ""}`}
                        onClick={() => void toggleEnabled(selected)}
                      >
                        {selected.isEnabled
                          ? "Shown in launcher"
                          : "Hidden from launcher"}
                        <span>{selected.isEnabled ? "Hide" : "Enable"}</span>
                      </button>
                      <div className="detail-section">
                        <h3>Tags</h3>
                        <div className="tag-list">
                          {selected.tags.length ? (
                            selected.tags.map((tag) => (
                              <span key={tag}>{tag}</span>
                            ))
                          ) : (
                            <span>No tags</span>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                  {tab === "examples" && (
                    <div className="detail-section">
                      <h3>Example usage</h3>
                      <p>
                        Copy the command, open a terminal in the right
                        directory, and paste it. Review it before running.
                      </p>
                      <div className="code-line">
                        <code>{selected.command}</code>
                        <button onClick={() => void copy(selected)}>
                          <Clipboard size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                  {tab === "related" && (
                    <div className="detail-section">
                      <h3>Related commands</h3>
                      {commands
                        .filter(
                          (c) =>
                            c.categoryId === selected.categoryId &&
                            c.id !== selected.id,
                        )
                        .slice(0, 5)
                        .map((c) => (
                          <button
                            key={c.id}
                            className="related-row"
                            onClick={() => choose(c.id)}
                          >
                            <strong>{c.title}</strong>
                            <span>{c.descriptionShort}</span>
                            <ChevronRight size={16} />
                          </button>
                        ))}
                    </div>
                  )}
                  <button
                    className="edit-link"
                    onClick={() => setEditor({ ...selected })}
                  >
                    Edit command <ChevronRight size={16} />
                  </button>
                </>
              ) : (
                <div className="detail-empty">
                  <div>
                    <CommandIcon size={34} />
                  </div>
                  <h2>Know every command</h2>
                  <p>
                    Select a command to see its purpose, tags, and related
                    tools.
                  </p>
                </div>
              )}
            </aside>
          </div>
        )}
      </main>
      {!popup && (
        <div className="desktop-hint">
          <Keyboard size={15} />{" "}
          <span>
            <kbd>Ctrl</kbd> + <kbd>K</kbd> to search
          </span>
          <span className="hint-divider" />{" "}
          <span>
            Click the tray icon or press {displayShortcut(settings.shortcut)}{" "}
            for quick access
          </span>
          <button onClick={() => void showPopup()}>
            Preview launcher <ChevronRight size={14} />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast">
          <Check size={17} />
          {toast}
        </div>
      )}
      {contextMenu && contextCommand && (
        <div
          className="context-menu"
          style={{
            left: Math.min(contextMenu.x, innerWidth - 176),
            top: Math.min(contextMenu.y, innerHeight - 130),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              choose(contextCommand.id);
              setContextMenu(null);
            }}
          >
            <Info size={15} /> View details
          </button>
          <button
            onClick={() => {
              void copy(contextCommand);
              setContextMenu(null);
            }}
          >
            <Clipboard size={15} /> Copy command
          </button>
          <button
            onClick={() => {
              setEditor({ ...contextCommand });
              setContextMenu(null);
            }}
          >
            <Settings2 size={15} /> Edit command
          </button>
        </div>
      )}
      {editor && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditor(null);
          }}
        >
          <div className="modal">
            <div className="modal-heading">
              <div>
                <div className="eyebrow">COMMAND LIBRARY</div>
                <h2>
                  {commands.some((c) => c.id === editor.id)
                    ? "Edit command"
                    : "New command"}
                </h2>
              </div>
              <button className="icon-button" onClick={() => setEditor(null)}>
                <X />
              </button>
            </div>
            <div className="form-grid">
              <label>
                Title
                <input
                  autoFocus
                  value={editor.title}
                  onChange={(e) =>
                    setEditor({ ...editor, title: e.target.value })
                  }
                  placeholder="docker compose up -d"
                />
              </label>
              <label>
                Command
                <input
                  value={editor.command}
                  onChange={(e) =>
                    setEditor({ ...editor, command: e.target.value })
                  }
                  placeholder="Enter shell command"
                />
              </label>
              <label>
                Category
                <select
                  value={editor.categoryId}
                  onChange={(e) =>
                    setEditor({ ...editor, categoryId: e.target.value })
                  }
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Short description
                <input
                  value={editor.descriptionShort}
                  onChange={(e) =>
                    setEditor({ ...editor, descriptionShort: e.target.value })
                  }
                  placeholder="One line summary"
                />
              </label>
              <label>
                Full description
                <textarea
                  rows={4}
                  value={editor.descriptionLong}
                  onChange={(e) =>
                    setEditor({ ...editor, descriptionLong: e.target.value })
                  }
                  placeholder="Explain what it does and when to use it"
                />
              </label>
              <label>
                Tags, separated by commas
                <input
                  value={editor.tags.join(", ")}
                  onChange={(e) =>
                    setEditor({
                      ...editor,
                      tags: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
              <label className="editor-visibility">
                <input
                  type="checkbox"
                  checked={editor.isEnabled}
                  onChange={(e) =>
                    setEditor({ ...editor, isEnabled: e.target.checked })
                  }
                />{" "}
                Show in launcher
              </label>
            </div>
            <div className="modal-actions">
              {commands.some((c) => c.id === editor.id) && (
                <button
                  className="danger-button"
                  onClick={() => void removeEdited()}
                >
                  <Trash2 size={16} /> Delete
                </button>
              )}
              <div className="spacer" />
              <button
                className="secondary-button"
                onClick={() => setEditor(null)}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                onClick={() => void saveEdited()}
              >
                Save command
              </button>
            </div>
          </div>
        </div>
      )}
      {newCategory && (
        <CategoryDialog
          onCancel={() => setNewCategory(false)}
          onSave={(name) => void createCategory(name)}
        />
      )}
      {settingsOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSettingsOpen(false);
          }}
        >
          <div className="modal settings-modal">
            <div className="modal-heading">
              <div>
                <div className="eyebrow">PREFERENCES</div>
                <h2>Settings</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setSettingsOpen(false)}
              >
                <X />
              </button>
            </div>
            <div className="settings-list">
              <label className="setting-row">
                <div>
                  <strong>Appearance</strong>
                  <span>Match your desktop or choose a theme</span>
                </div>
                <select
                  value={settings.theme}
                  onChange={(e) =>
                    void updateSettings({
                      ...settings,
                      theme: e.target.value as Settings["theme"],
                    })
                  }
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label className="setting-row">
                <div>
                  <strong>Global shortcut</strong>
                  <span>Open or close the quick launcher</span>
                </div>
                <select
                  value={settings.shortcut}
                  onChange={(e) =>
                    void updateSettings({
                      ...settings,
                      shortcut: e.target.value,
                    })
                  }
                >
                  <option value="Control+Space">Ctrl + Space</option>
                  <option value="Control+Alt+Space">Ctrl + Alt + Space</option>
                  <option value="Alt+Space">Alt + Space</option>
                  <option value="Control+Shift+Space">
                    Ctrl + Shift + Space
                  </option>
                </select>
              </label>
              <label className="setting-row">
                <div>
                  <strong>Start on login</strong>
                  <span>Keep the launcher ready in the tray</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.startOnLogin}
                  onChange={(e) =>
                    void updateSettings({
                      ...settings,
                      startOnLogin: e.target.checked,
                    })
                  }
                />
              </label>
              <label className="setting-row">
                <div>
                  <strong>Show Run button</strong>
                  <span>Requires confirmation before opening a terminal</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showRun}
                  onChange={(e) =>
                    void updateSettings({
                      ...settings,
                      showRun: e.target.checked,
                    })
                  }
                />
              </label>
              <label className="setting-row">
                <div>
                  <strong>Close after copy</strong>
                  <span>Hide the quick launcher automatically</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.closeAfterCopy}
                  onChange={(e) =>
                    void updateSettings({
                      ...settings,
                      closeAfterCopy: e.target.checked,
                    })
                  }
                />
              </label>
            </div>
            <div className="backup-actions">
              <button
                className="secondary-button"
                onClick={() => void exportJson(snapshot)}
              >
                Export JSON
              </button>
              <button
                className="secondary-button"
                onClick={() => void importBackup()}
              >
                Import JSON
              </button>
            </div>
            <p className="settings-note">
              <ShieldAlert size={15} /> Run is off by default. Review every
              command before running it.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function BrandMark() {
  return (
    <div className="brand-mark">
      <Terminal size={25} strokeWidth={2.8} />
    </div>
  );
}
function SearchBox({
  value,
  onChange,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="search-box">
      <Search size={19} />
      <input
        ref={inputRef}
        aria-label="Search commands"
        placeholder="Search commands, descriptions, or categories…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <kbd>Ctrl K</kbd>
    </div>
  );
}
function EmptyState() {
  return (
    <div className="empty-state">
      <Search size={28} />
      <strong>No commands found</strong>
      <span>Try another search or choose a different category.</span>
    </div>
  );
}
function CategoryDialog({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (value: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="modal small-modal">
        <div className="modal-heading">
          <h2>Add category</h2>
          <button className="icon-button" onClick={onCancel}>
            <X />
          </button>
        </div>
        <label className="form-grid">
          Category name
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave(name);
            }}
          />
        </label>
        <div className="modal-actions">
          <div className="spacer" />
          <button className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary-button" onClick={() => onSave(name)}>
            Add category
          </button>
        </div>
      </div>
    </div>
  );
}
