import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const read = (name) =>
  JSON.parse(fs.readFileSync(`src/data/${name}.json`, "utf8"));
const seed = read("seed"),
  v2 = read("catalog-v2"),
  v3 = read("catalog-v3");
const settings = {
  theme: "system",
  shortcut: "Control+Space",
  showRun: false,
  startOnLogin: false,
  closeAfterCopy: true,
};
const key = "nav-toolbox-preview-v1",
  versionKey = "nav-toolbox-preview-catalog-version";
const javascript = ts.transpileModule(
  fs.readFileSync("src/lib/data.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  },
).outputText;
function adapter(initialData, version) {
  const storage = new Map(
    initialData
      ? [
          [key, JSON.stringify(initialData)],
          [versionKey, String(version)],
        ]
      : [],
  );
  const exports = {};
  vm.runInNewContext(javascript, {
    exports,
    localStorage: {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, v),
    },
    require: (name) => {
      if (name === "@tauri-apps/api/core")
        return {
          isTauri: () => false,
          invoke: () => {
            throw new Error("Unexpected native call");
          },
        };
      if (name.endsWith("seed.json")) return seed;
      if (name.endsWith("catalog-v2.json")) return v2;
      if (name.endsWith("catalog-v3.json")) return v3;
      if (name === "../types") return { defaultSettings: settings };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return exports;
}
const current = {
  categories: [...seed.categories, ...v2.categories],
  commands: [...seed.commands, ...v2.commands].map((c) => ({
    ...c,
    isEnabled: c.isEnabled ?? true,
    runCount: 0,
    lastUsedAt: null,
  })),
  settings,
};
current.commands[0].title = "My edited command";
const removed = v2.commands[0].id;
current.commands = current.commands.filter((c) => c.id !== removed);
const upgraded = adapter(current, 2);
let data = await upgraded.loadSnapshot();
assert.equal(data.commands[0].title, "My edited command");
assert.ok(
  !data.commands.some((c) => c.id === removed),
  "Must preserve earlier deletions",
);
assert.equal(
  data.commands.filter((c) => c.introducedIn === 3).length,
  v3.commands.length,
);
assert.ok(
  data.commands.filter((c) => c.introducedIn === 3).every((c) => !c.isEnabled),
);
await upgraded.deleteCommand(v3.commands[0].id);
data = await upgraded.loadSnapshot();
assert.ok(
  !data.commands.some((c) => c.id === v3.commands[0].id),
  "Must not restore deleted basics on reload",
);
const fresh = await adapter().loadSnapshot();
assert.equal(
  fresh.commands.length,
  seed.commands.length + v2.commands.length + v3.commands.length,
);
const legacy = await adapter(
  { categories: seed.categories, commands: seed.commands, settings },
  1,
).loadSnapshot();
assert.equal(legacy.commands.length, fresh.commands.length);
const imported = await upgraded.importSnapshot({
  categories: seed.categories,
  commands: seed.commands,
  settings: { ...settings, showRun: true, startOnLogin: true },
});
assert.equal(imported.settings.showRun, false);
assert.equal(imported.settings.startOnLogin, false);
assert.equal(
  (await upgraded.loadSnapshot()).commands.length,
  seed.commands.length,
  "Import must stay an exact catalog replacement",
);
console.log(
  "Fresh catalog, v1/v2 upgrades, edit/deletion preservation, and import behavior passed",
);
