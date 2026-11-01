const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { escapeHtml } = require("../../src/core/path-utils");

function loadViewModule(name, mocks = {}, source) {
  const cache = new Map();
  function load(filename, override) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const realRequire = createRequire(filename);
    const context = vm.createContext({ module, require(request) {
      if (Object.hasOwn(mocks, request)) return mocks[request];
      if (/^\.\/note-(?:partial-)?import-/.test(request)) {
        return load(realRequire.resolve(request));
      }
      return realRequire(request);
    } });
    vm.runInContext(override || fs.readFileSync(filename, "utf8"), context, { filename });
    return module.exports;
  }
  return load(path.resolve(__dirname, `../../src/views/${name}.js`), source);
}

function loadPanelForContext(kind, context) {
  const full = kind === "full";
  const base = full ? "note-import" : "note-partial-import";
  const mocks = {
    vscode: context.vscode,
    "fs/promises": context.fs,
    "../data/note-store": context,
    "./shared/webview-panel-icon": { setWebviewPanelThemeIcon: context.setWebviewPanelThemeIcon },
    [`./${base}-html`]: full
      ? { getImportHtml: context.getImportHtml, getImportPanelTitle: context.getImportPanelTitle }
      : { getHtml: context.getHtml, getPanelTitle: context.getPanelTitle },
  };
  if (context.require) mocks["./note-webview"] = context.require();
  return loadViewModule(`${base}-webview`, mocks);
}

// Run the complete host module, capturing I/O without touching user notes.
function createImportHarness(kind, config = {}) {
  const filename = path.resolve(__dirname, `../../src/views/note-${kind === "full" ? "import" : "partial-import"}-webview.js`);
  const events = [];
  const panels = [];
  let note = config.note || { id: "target", order: 3, storageRevision: "revision", groups: [] };
  const record = (type, ...args) => events.push([type, ...args]);
  const vscode = {
    ViewColumn: { Active: 1 },
    Uri: { file: (filePath) => ({ fsPath: filePath }) },
    window: {
      createWebviewPanel(...args) {
        record("panel", ...args);
        let onDispose;
        const panel = {
          disposed: false,
          reveal(...args) { record("reveal", ...args); },
          dispose() { this.disposed = true; record("dispose"); onDispose?.(); },
          onDidDispose(callback) { onDispose = callback; },
          webview: {
            onDidReceiveMessage(callback) { panel.receive = callback; },
            postMessage(message) { record("post", message); },
            set html(value) { record("html", value); panel.html = value; },
          },
        };
        panels.push(panel);
        return panel;
      },
      async showTextDocument(...args) { record("openSource", ...args); },
      async showWarningMessage(...args) {
        record("warning", ...args);
        if (config.confirm) return config.confirm(...args);
        return config.cancel ? undefined : args.at(-1);
      },
      async showInformationMessage(...args) {
        record("information", ...args);
        return config.cancel ? undefined : args.at(-1);
      },
      showErrorMessage(...args) { record("error", ...args); },
    },
  };
  const mocks = {
    vscode,
    "fs/promises": { async readFile(...args) { record("readSource", ...args); if (config.readError) throw Error("read failed"); return config.markdown || "# 分類\n### 項目\n本文"; } },
    "./shared/webview-panel-icon": { setWebviewPanelThemeIcon() {} },
    "../core/path-utils": { escapeHtml, getNonce: () => "note-import-test" },
    "../data/note-store": {
      async readNoteFile(...args) { record("readNote", ...args); return note; },
      async createNewNote(...args) { record("create", ...args); if (config.saveError) throw Error("save failed"); return { filePath: "/created.json" }; },
      async saveNoteFile(...args) { record("save", ...args); if (config.saveError) throw Error("save failed"); note = args[1]; },
    },
    "./note-webview": {
      async openNoteWebview(_context, _tree, options) { record("openNote", options); },
      async notifyNoteUpdated(...args) { record("notify", ...args); },
    },
  };
  if (config.parser) mocks["../import/note-markdown-import"] = config.parser;
  const exports = loadViewModule(path.basename(filename, ".js"), mocks, config.source);
  const open = exports[kind === "full" ? "openNoteImportWebview" : "openNotePartialImportWebview"];
  return {
    events, panels,
    async open(options = {}) {
      return open({}, { refresh() { record("refresh"); } }, options);
    },
    async apply(payload) { record("apply", payload); if (config.saveError) throw Error("apply failed"); return { noteData: note, message: "反映しました", sourceItemId: "source" }; },
  };
}

module.exports = { createImportHarness, loadViewModule, loadPanelForContext };
