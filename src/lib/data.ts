import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@tauri-apps/api/core";
import seed from "../data/seed.json";
import expansion from "../data/catalog-v2.json";
import {
  defaultSettings,
  type Category,
  type Command,
  type Settings,
  type Snapshot,
} from "../types";

const key = "nav-toolbox-preview-v1";
const catalogVersionKey = "nav-toolbox-preview-catalog-version";
const catalog: {
  categories: Category[];
  commands: (Partial<Command> & Pick<Command, "id">)[];
} = {
  categories: [...seed.categories, ...expansion.categories],
  commands: [...seed.commands, ...expansion.commands],
};
const initial = (): Snapshot => ({
  categories: catalog.categories,
  commands: catalog.commands.map((c) => ({
    ...c,
    isEnabled: c.isEnabled ?? true,
    runCount: 0,
    lastUsedAt: null,
  })) as Command[],
  settings: defaultSettings,
});
function readPreview(): Snapshot {
  try {
    const value = localStorage.getItem(key);
    if (!value) {
      localStorage.setItem(catalogVersionKey, "2");
      return initial();
    }
    const data = JSON.parse(value) as Snapshot;
    if (localStorage.getItem(catalogVersionKey) !== "2") {
      const known = new Set(data.commands.map((c) => c.id));
      for (const item of expansion.commands)
        if (!known.has(item.id))
          data.commands.push({
            ...item,
            isEnabled: false,
            runCount: 0,
            lastUsedAt: null,
          } as Command);
      for (const category of expansion.categories)
        if (!data.categories.some((c) => c.id === category.id))
          data.categories.push(category);
      localStorage.setItem(key, JSON.stringify(data));
      localStorage.setItem(catalogVersionKey, "2");
    }
    data.commands = data.commands.map((c) => ({
      ...c,
      isEnabled: c.isEnabled ?? true,
    }));
    return data;
  } catch {
    return initial();
  }
}
function writePreview(data: Snapshot) {
  localStorage.setItem(key, JSON.stringify(data));
  localStorage.setItem(catalogVersionKey, "2");
}
export const native = isTauri();
export async function loadSnapshot(): Promise<Snapshot> {
  return native ? invoke<Snapshot>("load_snapshot") : readPreview();
}
export async function saveCommand(command: Command): Promise<Snapshot> {
  if (native) {
    await invoke("save_command", { command });
    return loadSnapshot();
  }
  const data = readPreview();
  const index = data.commands.findIndex((c) => c.id === command.id);
  if (index < 0) data.commands.push(command);
  else data.commands[index] = command;
  writePreview(data);
  return data;
}
export async function setCategoryEnabled(
  categoryId: string,
  enabled: boolean,
): Promise<Snapshot> {
  if (native) {
    await invoke("set_category_enabled", { categoryId, enabled });
    return loadSnapshot();
  }
  const data = readPreview();
  data.commands = data.commands.map((c) =>
    c.categoryId === categoryId ? { ...c, isEnabled: enabled } : c,
  );
  writePreview(data);
  return data;
}
export async function deleteCommand(id: string): Promise<Snapshot> {
  if (native) {
    await invoke("delete_command", { id });
    return loadSnapshot();
  }
  const data = readPreview();
  data.commands = data.commands.filter((c) => c.id !== id);
  writePreview(data);
  return data;
}
export async function saveCategory(category: Category): Promise<Snapshot> {
  if (native) {
    await invoke("save_category", { category });
    return loadSnapshot();
  }
  const data = readPreview();
  const index = data.categories.findIndex((c) => c.id === category.id);
  if (index < 0) data.categories.push(category);
  else data.categories[index] = category;
  writePreview(data);
  return data;
}
export async function saveSettings(settings: Settings): Promise<Snapshot> {
  if (native) {
    await invoke("save_settings", { settings });
    return loadSnapshot();
  }
  const data = readPreview();
  data.settings = settings;
  writePreview(data);
  return data;
}
export async function markUsed(id: string): Promise<Snapshot> {
  if (native) {
    await invoke("mark_used", { id });
    return loadSnapshot();
  }
  const data = readPreview();
  const item = data.commands.find((c) => c.id === id);
  if (item) {
    item.runCount++;
    item.lastUsedAt = new Date().toISOString();
  }
  writePreview(data);
  return data;
}
export async function importSnapshot(snapshot: Snapshot): Promise<Snapshot> {
  if (native) {
    await invoke("import_snapshot", { snapshot });
    return loadSnapshot();
  }
  const imported = {
    ...snapshot,
    settings: { ...snapshot.settings, showRun: false, startOnLogin: false },
    commands: snapshot.commands.map((command) => ({
      ...command,
      isEnabled: command.isEnabled ?? true,
    })),
  };
  writePreview(imported);
  return imported;
}
