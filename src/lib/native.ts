import { isTauri, invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { enable, disable } from "@tauri-apps/plugin-autostart";
import {
  register,
  unregister,
  isRegistered,
} from "@tauri-apps/plugin-global-shortcut";
import { save, open } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { Snapshot } from "../types";

export async function copyText(value: string) {
  if (isTauri()) await writeText(value);
  else await navigator.clipboard.writeText(value);
}
export async function setAutostart(value: boolean) {
  if (isTauri()) {
    if (value) await enable();
    else await disable();
  }
}
export async function setShortcut(previous: string | null, next: string) {
  if (!isTauri()) return;
  if (!previous && (await isRegistered(next))) return;
  if (previous && (await isRegistered(previous))) await unregister(previous);
  try {
    await register(next, (event) => {
      if (event.state === "Pressed") void invoke("toggle_popup");
    });
  } catch (error) {
    if (previous)
      await register(previous, (event) => {
        if (event.state === "Pressed") void invoke("toggle_popup");
      });
    throw error;
  }
}
export async function showPopup() {
  if (isTauri()) await invoke("show_popup");
  else window.location.href = "?view=popup";
}
export async function showMain() {
  if (isTauri()) await invoke("show_main");
  else window.location.href = "/";
}
export async function hidePopup() {
  if (isTauri()) await invoke("hide_popup");
}
export async function runCommand(id: string) {
  if (isTauri()) await invoke("run_in_terminal", { id });
}
export async function exportJson(snapshot: Snapshot) {
  const content = JSON.stringify(
    { format: "nav-toolbox-v1", ...snapshot },
    null,
    2,
  );
  if (isTauri()) {
    const path = await save({
      defaultPath: "nav-toolbox-backup.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (path) await writeTextFile(path, content);
  } else {
    const url = URL.createObjectURL(
      new Blob([content], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "nav-toolbox-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  }
}
export async function chooseImport(): Promise<Snapshot | null> {
  let content: string | undefined;
  if (isTauri()) {
    const path = await open({
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (typeof path === "string") content = await readTextFile(path);
  } else {
    content = await new Promise<string | undefined>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (file && file.size > 5_000_000) {
          resolve("__too_large__");
          return;
        }
        resolve(file ? await file.text() : undefined);
      };
      input.click();
    });
  }
  if (!content) return null;
  if (content.length > 5_000_000) throw new Error("Backup exceeds 5 MB");
  const parsed: unknown = JSON.parse(content);
  if (!isSnapshot(parsed)) throw new Error("Invalid Nav Toolbox backup");
  return parsed as Snapshot;
}

export function isSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  if (
    !Array.isArray(data.categories) ||
    !Array.isArray(data.commands) ||
    !data.settings ||
    typeof data.settings !== "object"
  )
    return false;
  if (
    data.categories.length < 1 ||
    data.categories.length > 1000 ||
    data.commands.length > 10000
  )
    return false;
  const settings = data.settings as Record<string, unknown>;
  if (
    !["light", "dark", "system"].includes(String(settings.theme)) ||
    typeof settings.shortcut !== "string" ||
    settings.shortcut.length > 100 ||
    !settings.shortcut.trim() ||
    typeof settings.startOnLogin !== "boolean" ||
    typeof settings.showRun !== "boolean" ||
    typeof settings.closeAfterCopy !== "boolean"
  )
    return false;
  const categories = new Set<string>();
  for (const item of data.categories) {
    if (!item || typeof item !== "object") return false;
    const c = item as Record<string, unknown>;
    if (
      typeof c.id !== "string" ||
      !c.id ||
      c.id.length > 120 ||
      categories.has(c.id) ||
      typeof c.name !== "string" ||
      !c.name ||
      c.name.length > 120 ||
      typeof c.icon !== "string" ||
      c.icon.length > 80 ||
      typeof c.color !== "string" ||
      c.color.length > 40
    )
      return false;
    categories.add(c.id);
  }
  const ids = new Set<string>();
  for (const item of data.commands) {
    if (!item || typeof item !== "object") return false;
    const c = item as Record<string, unknown>;
    if (
      typeof c.id !== "string" ||
      !c.id ||
      c.id.length > 120 ||
      ids.has(c.id) ||
      typeof c.title !== "string" ||
      !c.title.trim() ||
      c.title.length > 200 ||
      typeof c.command !== "string" ||
      !c.command.trim() ||
      c.command.length > 4096 ||
      c.command.includes("\0") ||
      typeof c.descriptionShort !== "string" ||
      c.descriptionShort.length > 500 ||
      typeof c.descriptionLong !== "string" ||
      c.descriptionLong.length > 10000 ||
      typeof c.categoryId !== "string" ||
      !categories.has(c.categoryId) ||
      !Array.isArray(c.tags) ||
      c.tags.length > 32 ||
      c.tags.some(
        (tag: unknown) => typeof tag !== "string" || tag.length > 80,
      ) ||
      typeof c.isFavorite !== "boolean" ||
      (c.isEnabled !== undefined && typeof c.isEnabled !== "boolean") ||
      typeof c.runCount !== "number" ||
      !Number.isSafeInteger(c.runCount) ||
      c.runCount < 0 ||
      (c.lastUsedAt !== null &&
        c.lastUsedAt !== undefined &&
        typeof c.lastUsedAt !== "string")
    )
      return false;
    ids.add(c.id);
  }
  return true;
}
