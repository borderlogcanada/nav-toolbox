import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '@tauri-apps/api/core';
import seed from '../data/seed.json';
import { defaultSettings, type Category, type Command, type Settings, type Snapshot } from '../types';

const key = 'nav-toolbox-preview-v1';
const initial = (): Snapshot => ({ categories: seed.categories as Category[], commands: seed.commands.map(c => ({ ...c, runCount: 0, lastUsedAt: null })) as Command[], settings: defaultSettings });
function readPreview(): Snapshot { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as Snapshot : initial(); } catch { return initial(); } }
function writePreview(data: Snapshot) { localStorage.setItem(key, JSON.stringify(data)); }
export const native = isTauri();
export async function loadSnapshot(): Promise<Snapshot> { return native ? invoke<Snapshot>('load_snapshot') : readPreview(); }
export async function saveCommand(command: Command): Promise<Snapshot> {
  if (native) { await invoke('save_command', { command }); return loadSnapshot(); }
  const data = readPreview(); const index = data.commands.findIndex(c => c.id === command.id);
  if (index < 0) data.commands.push(command); else data.commands[index] = command;
  writePreview(data); return data;
}
export async function deleteCommand(id: string): Promise<Snapshot> {
  if (native) { await invoke('delete_command', { id }); return loadSnapshot(); }
  const data = readPreview(); data.commands = data.commands.filter(c => c.id !== id); writePreview(data); return data;
}
export async function saveCategory(category: Category): Promise<Snapshot> {
  if (native) { await invoke('save_category', { category }); return loadSnapshot(); }
  const data = readPreview(); const index = data.categories.findIndex(c => c.id === category.id);
  if (index < 0) data.categories.push(category); else data.categories[index] = category;
  writePreview(data); return data;
}
export async function saveSettings(settings: Settings): Promise<Snapshot> {
  if (native) { await invoke('save_settings', { settings }); return loadSnapshot(); }
  const data = readPreview(); data.settings = settings; writePreview(data); return data;
}
export async function markUsed(id: string): Promise<Snapshot> {
  if (native) { await invoke('mark_used', { id }); return loadSnapshot(); }
  const data = readPreview(); const item = data.commands.find(c => c.id === id);
  if (item) { item.runCount++; item.lastUsedAt = new Date().toISOString(); } writePreview(data); return data;
}
export async function importSnapshot(snapshot: Snapshot): Promise<Snapshot> {
  if (native) { await invoke('import_snapshot', { snapshot }); return loadSnapshot(); }
  writePreview(snapshot); return snapshot;
}
