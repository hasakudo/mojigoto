const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { getAddressBookScript } = require("../../src/views/note-webview/script-address-book");
const { escapeHtml } = require("../../src/core/path-utils");

class AddressElement {
  constructor() { this.handlers = {}; this.dataset = {}; this.value = ""; this.checked = true; this.hidden = false; this.style = {}; this.isConnected = true; this.children = []; }
  addEventListener(type, fn) { this.handlers[type] = fn; }
  querySelectorAll(selector) {
    const attribute = /^\[data-([^\]]+)\]$/.exec(selector)?.[1];
    const key = attribute?.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return this.children.filter(child => Object.hasOwn(child.dataset, key));
  }
  set innerHTML(html) {
    this.html = html;
    this.children = [...html.matchAll(/<(?:input|button)\b([^>]*)>/g)].map(([, attrs]) => {
      const child = new AddressElement();
      for (const [, attr, value] of attrs.matchAll(/data-([a-z-]+)="([^"]*)"/g)) child.dataset[attr.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
      child.value = attrs.match(/\bvalue="([^"]*)"/)?.[1] || ""; child.checked = /\bchecked\b/.test(attrs);
      return child;
    });
  }
  get innerHTML() { return this.html || ""; }
  getBoundingClientRect() { return { left: 20, top: 50, bottom: 80, width: 200, height: 30 }; }
  contains(target) { return this === target || this.children.includes(target); }
}

function createAddressClientHarness({ standalone = false, script } = {}) {
  const nodes = {}, messages = [], timers = new Map(); let serial = 0;
  const node = name => nodes[name] || (nodes[name] = new AddressElement());
  const context = vm.createContext({ makeId: () => "person-" + (++serial), esc: escapeHtml, addressVisibleIds: new Set(), isAddressBookOpen: false,
    document: { getElementById: node, addEventListener() {} }, window: { innerWidth: 800, innerHeight: 600, addEventListener() {} },
    vscode: { postMessage: value => messages.push(structuredClone(value)) }, setStatus: message => { node("addressStatusEl").textContent = message; },
    setTimeout(fn) { timers.set(++serial, fn); return serial; }, clearTimeout(id) { timers.delete(id); },
    ...Object.fromEntries(["addressBookPanel", "closeAddressBookBtn", "addressCandidateSearch", "addressCandidateSelect", "addressAddBtn", "addressSourceReference", "addressSourcePlot", "addressKindGroup", "addressKindDivider", "addressKindItem", "addressDividerNameSource", "addressCandidateCount", "addressCountEl", "addressStatusEl", "addressFocusSelect", "addressVisibleOptionsEl", "addressShowAllBtn", "addressTermManagerList", "addressMatrixRoot", "addressPreviewBtn", "addressPreviewPanel", "closeAddressPreviewBtn", "addressPreviewRoot", "addressTermPicker", "addressExportHtmlBtn", "addressExportCsvBtn"].map(name => [name, node(name)])),
  });
  node("addressSourcePlot").checked = false; node("addressPreviewPanel").hidden = true; node("addressDividerNameSource").value = "value";
  vm.runInContext(script || getAddressBookScript({ standalone }), context);
  const run = code => vm.runInContext(code, context);
  run("registerAddressBookEvents()");
  return { context, nodes, messages, timers, node, run,
    load(book, candidates = []) {
      run("requestAddressBookLoad()");
      this.receive({ type: "addressBookLoaded", requestId: messages.at(-1).requestId, book, candidates });
    },
    receive(message) { context.message = message; return run("handleAddressBookMessage(message)"); },
    state() { return JSON.parse(run("JSON.stringify(workAddressBookState)")); },
    tick() { const jobs = [...timers.values()]; timers.clear(); jobs.forEach(fn => fn()); },
  };
}

function createAddressHostHarness(config = {}) {
  const events = [], panels = [], serializers = [], commands = new Map();
  const record = (name, ...args) => events.push([name, ...args]);
  const context = { subscriptions: [], globalState: { get: () => config.currentWork || "" } };
  function panel() {
    const disposers = [];
    return { messages: [], onDidDispose(fn) { disposers.push(fn); }, reveal() { record("reveal"); },
      dispose() { if (this.disposed) return; this.disposed = true; record("dispose"); disposers.forEach(fn => fn()); },
      webview: { onDidReceiveMessage(fn) { this.receive = fn; }, postMessage(message) { record("post", message); } },
    };
  }
  const vscode = { Uri: { file: fsPath => ({ fsPath }) }, ViewColumn: { Active: 1 }, StatusBarAlignment: { Right: 2 },
    workspace: { onDidChangeActiveTextEditor() {} }, commands: { registerCommand(name, fn) { commands.set(name, fn); return {}; } },
    window: { activeTextEditor: { document: { uri: { fsPath: config.activePath || "" } } },
      createWebviewPanel(_kind, title, column) { const p = panel(); Object.assign(p, { title, column }); panels.push(p); return p; },
      createStatusBarItem() { return { show() { record("statusShow"); }, hide() { record("statusHide"); } }; },
      onDidChangeActiveTextEditor() { return {}; },
      async showQuickPick(items) { record("pick", items); return config.pick ? config.pick(items) : items[0]; },
      async showWarningMessage(...args) { record("warning", ...args); return config.confirm ? config.confirm(...args) : args[2]; },
      showErrorMessage(message) { record("error", message); },
      async showSaveDialog(options) { record("saveDialog", options); return config.cancelExport ? undefined : { fsPath: "/exports/book.txt" }; },
    },
  };
  const root = path.resolve(__dirname, "../../src/views");
  const mocks = {
    vscode, "fs/promises": { async writeFile(...args) { record("write", ...args); if (config.writeError) throw config.writeError; } },
    "shared/restored-webviews": { withRestoredWebviews: (_vscode, _type, run) => run(), registerRestorableWebview(_api, type, value) { serializers.push(value); record("serializer", type); return {}; } },
    "../core/mojigoto-context": { isSingleMode: () => config.single === true, getWorkspaceRoot: () => config.workspaceRoot || "/workspace" },
    "../core/mojigoto-paths": { listWorkDirectories: () => config.works || [] },
    "../work/work-settings": { getCurrentWorkTitleFromSettings: () => "作品", inferWorkNameFromManuscriptRoot: () => config.inferredWork || "" },
    "../core/path-utils": { escapeHtml, getNonce: () => "fixed" },
    "shared/webview-panel-icon": { setWebviewPanelThemeIcon() {} },
    "../data/address-book-store": { buildAddressBookExport(book, format, title) { record("format", book, format, title); return format + ":" + title; } },
    "address-book-session": { createAddressBookSession(p, workDir, options) {
      record("session", workDir); p.onDidDispose(() => record("sessionDisposed"));
      return { async handle(message) { record("handle", message?.type); return ["requestAddressBook", "saveAddressBook"].includes(message?.type); },
        async exportBook(message) { record("exportBook", message); if (config.exportError) throw config.exportError; return { storageRevision: "saved" }; },
        confirmReload: options.confirmReload,
      };
    } },
  };
  const resolvedMocks = new Map(Object.entries(mocks).map(([key, value]) => [key === "vscode" || key === "fs/promises" ? key : path.resolve(root, key), value]));
  function load(filename, source) {
    const nativeRequire = createRequire(filename), module = { exports: {} };
    const scope = vm.createContext({ module, process, __dirname: path.dirname(filename),
      require(name) {
        const resolved = name.startsWith(".") ? path.resolve(path.dirname(filename), name) : name;
        if (resolvedMocks.has(resolved)) return resolvedMocks.get(resolved);
        if (resolved === path.join(root, "address-book/html")) return load(resolved + ".js");
        return nativeRequire(name);
      },
    });
    vm.runInContext(source || fs.readFileSync(filename, "utf8"), scope, { filename }); return module.exports;
  }
  const host = load(path.join(root, "address-book-webview.js"), config.source);
  return { host, context, events, panels, serializers, commands, panel,
    open: options => host.openAddressBook(context, options), register: () => host.registerAddressBookWebview(context) };
}

module.exports = { createAddressClientHarness, createAddressHostHarness };
