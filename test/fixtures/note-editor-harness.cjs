const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const clone = (value) => JSON.parse(JSON.stringify(value));
const viewRoot = path.resolve(__dirname, "../../src/views");

// Load the real host and moved modules. Replace only VS Code and I/O boundaries.
function createNoteEditorHarness(config = {}) {
  const events = [], panels = [], jobs = new Map(), settings = { ...config.settings };
  let counter = 0, settingListener;
  let data = clone(config.note || { id: "note", title: "テスト", storageRevision: "initial", groups: [
    { id: "g", title: "大分類", images: [], items: [{ id: "i", kind: "entry", heading: "項目", body: "本文" }] },
  ] });
  const record = (name, ...args) => events.push([name, ...args]);
  const timers = {
    setTimeout(callback) { const id = ++counter; jobs.set(id, callback); return id; },
    clearTimeout(id) { jobs.delete(id); },
  };
  const vscode = { ViewColumn: { One: 1, Active: 1, Beside: 2 }, Uri: { file: (file) => ({ fsPath: file }) },
    workspace: { getConfiguration: () => ({ get: (key, fallback) => Object.hasOwn(settings, key) ? settings[key] : fallback }),
      onDidChangeConfiguration(callback) { settingListener = callback; return { dispose() { record("settingsDisposed"); } }; } },
    window: {
      async showWarningMessage(...args) { record("confirm", ...args); return config.confirm ? config.confirm(...args) : args[2]; },
      async showQuickPick(...args) { record("pick", ...args); return config.pick ? config.pick(...args) : args[0][0]; },
      async showInputBox(...args) { record("input", ...args); return config.input ? config.input(...args) : "テンプレート"; },
      showInformationMessage(...args) { record("info", ...args); },
      async showSaveDialog(options) { record("saveDialog", options); return config.saveUri; },
      async showOpenDialog(options) { record("openDialog", options); return config.imageUris; },
      createWebviewPanel() {
        const disposers = [];
        const panel = { viewColumn: 1, onDidChangeViewState() {}, onDidDispose(callback) { disposers.push(callback); },
          reveal(...args) { record("reveal", ...args); }, dispose() { if (panel.disposed) return; panel.disposed = true; record("dispose"); disposers.forEach((fn) => fn()); },
          webview: { cspSource: "https://local.test", asWebviewUri: (uri) => `https://local.test/${path.basename(uri.fsPath)}`,
            onDidReceiveMessage(callback) { panel.receive = callback; }, postMessage(message) { record("post", message); config.onPost?.(message); return Promise.resolve(true); } },
        }; panels.push(panel); return panel;
      },
    }, commands: { async executeCommand(...args) { record("command", ...args); return config.deleted === true; } },
  };
  const noteStore = {
    async readNoteFile(...args) { record("read", ...args); return config.read ? config.read(...args) : clone(data); },
    async saveNoteFile(file, value) { record("write", file, clone(value)); if (config.write) await config.write(file, value);
      data = { ...clone(value), storageRevision: `saved-${++counter}` }; return clone(data); },
    async searchNotesByType(...args) { record("search", ...args); if (config.searchError) throw config.searchError; return []; },
    async resolveRelatedNoteTarget() { return config.relatedTarget || null; },
    ...config.noteStore,
  };
  const display = Object.fromEntries(["attach", "editorReady", "accept", "captureDraft", "setDirty", "detach", "closeByPath", "closeUnderFolder"].map((name) => [name, (...args) => record(name, ...args.slice(1))]));
  display.open = (_panel, mode) => { record("openDisplay", mode); return true; };
  const mocks = {
    vscode,
    "fs/promises": { async access() {}, async mkdir() {}, async copyFile(...args) { record("copyFile", ...args); }, async unlink(...args) { record("unlink", ...args); }, async writeFile(...args) { record("writeFile", ...args); } },
    "shared/restored-webviews": { withRestoredWebviews: (_api, _kind, run) => run(), webviewFileKey: (file) => file, registerRestorableWebview() {} },
    "shared/webview-panel-icon": { setWebviewPanelThemeIcon() {} },
    "note-display-webview": { NoteDisplayManager: function () { return display; } },
    "../core/path-utils": { ...require("../../src/core/path-utils"), getNonce: () => "fixed-nonce" },
    "../core/mojigoto-context": { isSingleMode: () => false },
    "../core/mojigoto-paths": { getMojigotoDirForSingle: () => "/single/.mojigoto", getMojigotoDirForWork: (dir) => config.assetsRoot || path.join(dir, ".mojigoto") },
    "../work/work-settings": { getCurrentWorkDisplayName: () => "作品", getCurrentWorkTitleFromSettings: () => "作品", getWorkSettingsForDirectory: () => ({ title: "作品" }) },
    "../data/note-store": noteStore,
    "../data/note-image-references": { async removeUnreferencedImage(...args) { record("removeImage", ...args); } },
    "../data/user-note-templates": Object.fromEntries(["saveUserTemplate", "saveUserGroupTemplate", "listUserTemplates", "deleteUserTemplateById"].map((name) => [name, async (...args) => { record(name, ...args); return name === "listUserTemplates" ? [{ templateId: "tpl", label: "名前" }] : true; }])),
    "../data/note-templates": { async getTemplateItems(...args) { record("templates", ...args); return []; } },
    "../data/webview-save-settings": { async updateWebviewSaveSetting(...args) { record("setting", ...args); return { cancelled: false }; } },
    "../data/concept-memo-store": {
      async createConceptMemoFromNoteItem(...args) { record("createConcept", ...args); return { memo: { id: "memo", title: "メモ", source: { syncFingerprint: "fingerprint" } } }; },
      async updateConceptMemoSourceStatus(...args) { record("sourceStatus", ...args); },
      async updateConceptMemoSourceAutoSync(...args) { record("sourceSync", ...args); },
      async markConceptMemosMissingByNotePath(...args) { record("missing", ...args); },
      async readConceptMemos() { return { memos: [] }; },
      ...config.conceptStore,
    },
    "concept-memo-webview": { async notifyConceptMemoUpdated(...args) { record("notifyConcept", ...args); }, async openConceptMemoWebview(_ctx, _tree, options) { record("openConcept", options); } },
    "../export/export-service": { async exportTreeItem(...args) { record("export", ...args); } },
    "../export/export-utils": { async resolveExportDirForTarget() { return "/exports"; } },
    "../backup/structured-data-backup": { async createStructuredBackup(...args) { record("backup", ...args); }, async openStructuredBackupHistory(options) { record("history", options.targetType); if (config.restore) await options.onRestored(); } },
    "address-book-webview": { async openAddressBook(_ctx, options) { record("openAddress", options); } },
    "address-book-session": { createAddressBookSession() { return { async handle(message) { record("addressHandle", message.type); return message.type === "addressBook.load"; }, async exportBook() { return { people: [], calls: [] }; } }; } },
    "../import/note-import-commands": Object.fromEntries(["runNoteImportFlow", "runNoteItemAppendImportFlow", "runNoteItemReplaceImportFlow", "runPartialReplaceImportFlow"].map((name) => [name, async (...args) => { record(name, ...args); return config.importResult || { cancelled: true }; }])),
    "note-partial-import-webview": { async openNotePartialImportWebview(_ctx, _tree, options) { record("partial", options); harness.partial = options; } },
    "note-copy-webview": { async openNoteCopyWebview(_ctx, _tree, options) { record("copy", options); } },
  };
  const mapped = new Map();
  for (const [name, value] of Object.entries(mocks)) mapped.set(name === "vscode" || name === "fs/promises" ? name : path.resolve(viewRoot, name), value);
  const cache = new Map();
  function load(filename, source) {
    if (cache.has(filename)) return cache.get(filename);
    const nativeRequire = createRequire(filename), module = { exports: {} }; cache.set(filename, module.exports);
    class FixedDate extends Date {
      constructor(...args) { super(...(args.length ? args : ["2026-10-22T00:00:00Z"])); }
      static now() { return 1792627200000; }
    }
    const math = Object.create(Math); math.random = () => 0.25;
    const context = vm.createContext({ module, __dirname: path.dirname(filename), console, ...timers,
      ...(config.deterministic ? { Date: FixedDate, Math: math } : {}),
      require(name) {
        const resolved = name.startsWith(".") ? path.resolve(path.dirname(filename), name) : name;
        if (mapped.has(resolved)) return mapped.get(resolved);
        if (["note-webview/editor-view", "note-webview/host-actions", "note-webview/image-actions", "note-webview/item-operations", "../data/address-book-store"].some((part) => resolved === path.resolve(viewRoot, part))) return load(resolved + ".js");
        return nativeRequire(name);
      },
    });
    vm.runInContext(source || fs.readFileSync(filename, "utf8"), context, { filename }); cache.set(filename, module.exports); return module.exports;
  }
  const host = load(path.join(viewRoot, "note-webview.js"), config.source);
  const harness = { host, events, panels, jobs, settings, noteStore,
    async open(options = {}) { await host.openNoteWebview({ subscriptions: [] }, { refresh() { record("refresh"); } }, { filePath: "/work/.mojigoto/plots/note.json", type: "plot", workDir: "/work", workName: "作品", ...options }); return panels.at(-1); },
    get data() { return clone(data); },
    async tick() { const pending = [...jobs.values()]; jobs.clear(); pending.forEach((fn) => fn()); await new Promise(setImmediate); },
    changeSetting(key, value) { settings[key] = value; settingListener({ affectsConfiguration: (name) => name === `mojigoto.${key}` }); },
  };
  return harness;
}

module.exports = { createNoteEditorHarness };
