const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { createConceptMemoPanelLifecycle } = require("../../src/views/concept-memo/host-lifecycle");
const clone = (value) => JSON.parse(JSON.stringify(value));

function createConceptHostHarness(config = {}) {
  const events = [], panels = [], bootStates = [], jobs = new Map(); let counter = 0;
  let data = config.data || { storageRevision: "initial", memos: [], folders: [], commonTodoItems: [] };
  let settingListener;
  const settings = { webviewAutoSaveEnabled: true, webviewAutoSaveDelaySeconds: 0.8 };
  const timers = { setTimeout(callback) { const id = ++counter; jobs.set(id, callback); return id; }, clearTimeout(id) { jobs.delete(id); } };
  const record = (kind, ...args) => events.push([kind, ...args]);
  const vscode = { ViewColumn: { Active: 1 }, workspace: {
    getConfiguration: () => ({ get: (key, fallback) => Object.hasOwn(settings, key) ? settings[key] : fallback }),
    onDidChangeConfiguration(callback) { settingListener = callback; return { dispose() { record("settingsDisposed"); } }; },
  }, window: {
    async showWarningMessage(...args) { record("confirm", ...args); return config.confirm ? config.confirm(...args) : args[2]; },
    showErrorMessage(...args) { record("error", ...args); },
    createWebviewPanel() {
      const disposers = []; let disposed = false;
      const panel = { reveal() { record("reveal"); }, onDidDispose(callback) { disposers.push(callback); },
        dispose() { if (disposed) return; disposed = true; record("dispose"); disposers.forEach((callback) => callback()); },
        webview: { onDidReceiveMessage(callback) { panel.receive = callback; }, postMessage(message) {
          if (disposed) throw Error("Webview is disposed");
          record("post", message); return Promise.resolve(true);
        } },
      }; panels.push(panel); return panel;
    },
  }, env: { clipboard: { async writeText(text) { record("clipboard", text); } } } };
  const mocks = {
    vscode,
    "./shared/restored-webviews": { withRestoredWebviews: (_api, _kind, run) => run(), webviewFileKey: (file) => file, registerRestorableWebview(_api, _kind, serializer) { return serializer; } },
    "../core/mojigoto-context": { isSingleMode: () => false },
    "../stats/stats-utils": { async triggerStatsRefresh() { record("stats"); } },
    "../data/concept-memo-store": {
      createEmptyConceptMemos: () => ({ memos: [], folders: [], commonTodoItems: [] }),
      createConceptMemoDraft: (value) => ({ id: "created", ...value }),
      async readConceptMemos() { record("read"); return config.read ? config.read() : clone(data); },
      async writeConceptMemos(_file, value) { record("write", value); if (config.write) await config.write(value);
        data = { ...clone(value), storageRevision: `saved-${++counter}` }; return clone(data); },
    },
    "../data/note-store": { async readNoteFile() { return { groups: [] }; }, async applyConceptMemoToNoteItem(value) { record("apply", value); return { note: { groups: [] } }; }, ...config.noteStore },
    "../data/concept-note-order": { async readConceptNoteIndex() { record("index"); return { notes: [] }; } },
    "../data/common-todo-store": { async readCommonTodoItems() { return []; }, async writeCommonTodoItems(items) { record("todo", items); return items; } },
    "../core/mojigoto-paths": { resolveActualNotePath: (file) => file, getMojigotoDirForSingle: () => "/.mojigoto", getMojigotoDirForWork: () => "/work/.mojigoto" },
    "./concept-memo/concept-memo-html": { getConceptMemoWebviewHtml: (_webview, boot) => { bootStates.push(clone(boot)); return "HTML"; } },
    "./concept-memo/host-lifecycle": { createConceptMemoPanelLifecycle: (panel) => createConceptMemoPanelLifecycle(panel, timers) },
    "./shared/webview-panel-icon": { setWebviewPanelThemeIcon() {} },
    "../ui/mojigoto-icons": { MOJIGOTO_ICONS: {} },
    "../work/work-settings": { getCurrentWorkSettings: () => ({ title: "現在の別作品" }), getWorkSettingsForDirectory: config.workSettings || (() => ({ title: "作品" })) },
    "../backup/structured-data-backup": { async createStructuredBackup(value) { record("backup", value); }, async openStructuredBackupHistory(value) { record("history"); if (config.restore) await value.onRestored(); } },
    "./note-webview": { async notifyNoteUpdated(file) { record("notifyNote", file); }, async openNoteWebview(_context, _tree, options) { record("openNote", options); } },
  };
  const filename = path.resolve(__dirname, "../../src/views/concept-memo-webview.js"), realRequire = createRequire(filename);
  const context = vm.createContext({ module: { exports: {} }, require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : realRequire(name), console,
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });
  vm.runInContext(config.source || fs.readFileSync(filename, "utf8"), context, { filename });
  return { events, panels, bootStates, jobs, settings, host: context.module.exports,
    createPanel() { return vscode.window.createWebviewPanel(); },
    async open(options = {}) { return context.module.exports.openConceptMemoWebview({}, {}, { filePath: "/work/.mojigoto/concept-memos.json", workDir: "/work", workTitle: "作品", ...options }); },
    get data() { return data; },
    async tick() { const tasks = [...jobs.values()]; jobs.clear(); tasks.forEach((task) => task()); await new Promise(setImmediate); },
    async settle() { await new Promise(setImmediate); },
    changeSetting(key, value) { settings[key] = value; settingListener({ affectsConfiguration: (name) => name === `mojigoto.${key}` }); },
  };
}

module.exports = { createConceptHostHarness };
