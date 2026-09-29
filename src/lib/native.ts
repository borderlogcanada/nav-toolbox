import { isTauri, invoke } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { enable, disable } from '@tauri-apps/plugin-autostart';
import { register, unregister, isRegistered } from '@tauri-apps/plugin-global-shortcut';
import { save, open } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { Snapshot } from '../types';

export async function copyText(value: string) { if (isTauri()) await writeText(value); else await navigator.clipboard.writeText(value); }
export async function setAutostart(value: boolean) { if (isTauri()) { if (value) await enable(); else await disable(); } }
export async function setShortcut(previous: string | null, next: string) {
  if (!isTauri()) return;
  if (!previous && await isRegistered(next)) return;
  if (previous && await isRegistered(previous)) await unregister(previous);
  try { await register(next, event => { if (event.state === 'Pressed') void invoke('toggle_popup'); }); }
  catch (error) { if (previous) await register(previous, event => { if (event.state === 'Pressed') void invoke('toggle_popup'); }); throw error; }
}
export async function showPopup() { if (isTauri()) await invoke('show_popup'); else window.location.href = '?view=popup'; }
export async function showMain() { if (isTauri()) await invoke('show_main'); else window.location.href = '/'; }
export async function hidePopup() { if (isTauri()) await invoke('hide_popup'); }
export async function runCommand(command: string) { if (isTauri()) await invoke('run_in_terminal', { command }); }
export async function exportJson(snapshot: Snapshot) {
  const content = JSON.stringify({ format: 'nav-toolbox-v1', ...snapshot }, null, 2);
  if (isTauri()) { const path = await save({ defaultPath: 'nav-toolbox-backup.json', filters: [{ name: 'JSON', extensions: ['json'] }] }); if (path) await writeTextFile(path, content); }
  else { const url = URL.createObjectURL(new Blob([content], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'nav-toolbox-backup.json'; a.click(); URL.revokeObjectURL(url); }
}
export async function chooseImport(): Promise<Snapshot | null> {
  let content: string | undefined;
  if (isTauri()) { const path = await open({ multiple: false, filters: [{ name: 'JSON', extensions: ['json'] }] }); if (typeof path === 'string') content = await readTextFile(path); }
  else { content = await new Promise<string | undefined>(resolve => { const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json'; input.onchange = async () => resolve(input.files?.[0] ? await input.files[0].text() : undefined); input.click(); }); }
  if (!content) return null;
  const parsed: unknown = JSON.parse(content);
  if (!parsed || typeof parsed !== 'object' || !('categories' in parsed) || !('commands' in parsed) || !('settings' in parsed) || !Array.isArray(parsed.categories) || !Array.isArray(parsed.commands) || !parsed.settings || typeof parsed.settings !== 'object' || !('theme' in parsed.settings) || !('shortcut' in parsed.settings)) throw new Error('Invalid Nav Toolbox backup');
  return parsed as Snapshot;
}
