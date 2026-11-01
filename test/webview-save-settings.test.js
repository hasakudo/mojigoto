const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const syncFs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const structured = require("../src/data/structured-file-write");

function fixture({ decision = "すべてONにする", directory = "", write = structured.writeStructuredFile, fileSystem = fs, multiRoot = "" } = {}) {
  const values = { webviewAutoSaveEnabled: true, noteMemoAutoSyncEnabled: false, conceptMemoAutoSyncEnabled: false };
  const flags = new Map(), changes = [], prompts = [], listeners = [], notified = [];
  const context = { subscriptions: [], workspaceState: { get: (key, fallback) => flags.get(key) ?? fallback, update: async (key, value) => flags.set(key, value) } };
  const vscode = {
    ConfigurationTarget: { Workspace: 2 },
    workspace: {
      getConfiguration: () => ({ get: (key, fallback) => values[key] ?? fallback, update: async (key, value, target) => {
        values[key] = value; changes.push({ key, value, target });
        listeners.forEach((listener) => listener({ affectsConfiguration: (name) => name === `mojigoto.${key}` }));
      } }),
      onDidChangeConfiguration: (listener) => { listeners.push(listener); return { dispose() {} }; },
    },
    window: { showInformationMessage: async (message, options) => {
      if (!options?.modal) return;
      prompts.push({ message, noteEnabled: values.noteMemoAutoSyncEnabled, conceptEnabled: values.conceptMemoAutoSyncEnabled });
      return typeof decision === "function" ? decision() : decision;
    }, showErrorMessage: (message) => assert.fail(message) },
  };
  const memoModule = { exports: {} };
  const migrationModule = { exports: {} };
  const resolveMemoDependency = (name) => {
      if (name === "./memo-auto-sync-migration") return migrationModule.exports;
      if (name === "vscode") return vscode;
      if (name === "fs/promises") return fileSystem;
      if (name === "./structured-file-write") return { ...structured, writeStructuredFile: write };
      if (name === "../core/mojigoto-context") return { isSingleMode: () => !multiRoot, getWorkRoot: () => multiRoot };
      if (name === "../core/mojigoto-paths") return { getMojigotoDirForSingle: () => directory, listWorkDirectories: () => [] };
      if (name === "../views/note-webview") return { notifyNoteUpdated: async (file) => notified.push(file) };
      if (name === "../views/concept-memo-webview") return { notifyConceptMemoUpdated: async (file) => notified.push(file) };
      return require(name);
    };
  vm.runInNewContext(syncFs.readFileSync(path.join(__dirname, "../src/data/memo-auto-sync-migration.js"), "utf8"), {
    module: migrationModule, require: resolveMemoDependency,
  });
  vm.runInNewContext(syncFs.readFileSync(path.join(__dirname, "../src/data/memo-auto-sync-settings.js"), "utf8"), {
    module: memoModule, require: resolveMemoDependency,
  });
  const module = { exports: {} };
  vm.runInNewContext(syncFs.readFileSync(path.join(__dirname, "../src/data/webview-save-settings.js"), "utf8"), {
    module,
    require: (name) => name === "vscode" ? vscode : memoModule.exports,
  });
  return { ...module.exports, ...memoModule.exports, context, values, flags, changes, prompts, notified };
}

async function project(t) {
  const root = path.resolve(".review-baseline/test-temp");
  await fs.mkdir(root, { recursive: true });
  const directory = await fs.mkdtemp(path.join(root, "save-settings-"));
  t.after(async () => { assert.ok(directory.startsWith(root + path.sep)); await fs.rm(directory, { recursive: true, force: true }); });
  await fs.mkdir(path.join(directory, "plots"));
  return directory;
}

test("Dashboardの共通自動保存をWorkspace設定へ保存し、未知の設定や不正値を更新しない", async () => {
  const f = fixture();
  const result = await f.updateWebviewSaveSetting(f.context, "webviewAutoSaveEnabled", false);
  assert.equal(result.settings.webviewAutoSaveEnabled, false);
  assert.equal(f.changes[0].target, 2);
  assert.equal(f.prompts.length, 0);
  for (const [key, value] of [["workRoot", true], ["noteMemoAutoSyncEnabled", "false"]]) {
    await assert.rejects(f.updateWebviewSaveSetting(f.context, key, value), /設定を確認/);
  }
  assert.equal(f.changes.length, 1);
});

test("初回ONの確認中は既定をOFFに保ち、確認取消では設定も個別メモも変更しない", async (t) => {
  const directory = await project(t), file = path.join(directory, "plots", "note.json");
  const raw = JSON.stringify({ groups: [{ items: [{ memo: { text: "未反映", autoSyncToConceptMemoOverride: false } }] }] });
  await fs.writeFile(file, raw);
  const cancelled = fixture({ directory, decision: () => undefined });
  const result = await cancelled.updateWebviewSaveSetting(cancelled.context, "noteMemoAutoSyncEnabled", true);
  assert.equal(result.cancelled, true);
  assert.equal(cancelled.prompts[0].noteEnabled, false);
  assert.equal(cancelled.changes.length, 0);
  assert.equal(await fs.readFile(file, "utf8"), raw);
});

test("ON/OFFの既定変更は個別指定とメモ本文を書き換えず、確認済みなら再質問しない", async (t) => {
  const directory = await project(t), file = path.join(directory, "plots", "note.json");
  const raw = JSON.stringify({ groups: [{ items: [{ memo: { text: "内容", autoSyncToConceptMemoOverride: false } }] }] });
  await fs.writeFile(file, raw);
  const f = fixture({ directory });
  f.registerMemoAutoSyncSettings(f.context);
  await f.updateWebviewSaveSetting(f.context, "noteMemoAutoSyncEnabled", true);
  await f.updateWebviewSaveSetting(f.context, "noteMemoAutoSyncEnabled", false);
  await f.updateWebviewSaveSetting(f.context, "noteMemoAutoSyncEnabled", true);
  assert.equal(f.prompts.length, 1);
  assert.equal(f.prompts[0].noteEnabled, false);
  assert.equal(await fs.readFile(file, "utf8"), raw);
});

test("既存OFFを選んだ場合だけ未指定のメモを個別OFFにし、既存の個別指定と未知項目を保持する", async (t) => {
  const directory = await project(t), file = path.join(directory, "plots", "note.json");
  await fs.writeFile(file, JSON.stringify({ custom: "保持", groups: [{ items: [
    { memo: { text: "未指定", unknown: 12 } },
    { memo: { text: "個別ON", autoSyncToConceptMemoOverride: true } },
    { memo: { text: "個別OFF", autoSyncToConceptMemoOverride: false } },
    { memo: { text: "旧ON", autoSyncToConceptMemo: true } },
  ] }] }));
  const f = fixture({ directory, decision: "既存はOFFのまま" });
  await f.updateWebviewSaveSetting(f.context, "noteMemoAutoSyncEnabled", true);
  const saved = JSON.parse(await fs.readFile(file, "utf8"));
  assert.equal(saved.custom, "保持");
  assert.equal(saved.groups[0].items[0].memo.autoSyncToConceptMemoOverride, false);
  assert.equal(saved.groups[0].items[0].memo.unknown, 12);
  assert.equal(saved.groups[0].items[1].memo.autoSyncToConceptMemoOverride, true);
  assert.equal(saved.groups[0].items[2].memo.autoSyncToConceptMemoOverride, false);
  assert.equal(saved.groups[0].items[3].memo.autoSyncToConceptMemoOverride, undefined);
  assert.equal(f.values.noteMemoAutoSyncEnabled, true);
  assert.equal(f.notified[0], file);
});

test("構想から項目の既定は出典付きメモだけを扱い、個別ONとリンクのないメモを保持する", async (t) => {
  const directory = await project(t), file = path.join(directory, "concept-memos.json");
  await fs.writeFile(file, JSON.stringify({ memos: [
    { text: "出典なし" },
    { text: "未指定", source: { kind: "noteItem", future: true } },
    { text: "個別ON", source: { kind: "noteItem", autoSyncToNoteItemOverride: true } },
  ] }));
  const f = fixture({ directory, decision: "既存はOFFのまま" });
  await f.updateWebviewSaveSetting(f.context, "conceptMemoAutoSyncEnabled", true);
  const saved = JSON.parse(await fs.readFile(file, "utf8"));
  assert.equal(saved.memos[0].source, undefined);
  assert.equal(saved.memos[1].source.autoSyncToNoteItemOverride, false);
  assert.equal(saved.memos[1].source.future, true);
  assert.equal(saved.memos[2].source.autoSyncToNoteItemOverride, true);
});

test("既存メモの競合と壊れたJSONでは上書きせず、既定をONにしない", async (t) => {
  const directory = await project(t), file = path.join(directory, "plots", "note.json");
  await fs.writeFile(file, JSON.stringify({ groups: [{ items: [{ memo: { text: "最初" } }] }] }));
  const external = JSON.stringify({ groups: [{ items: [{ memo: { text: "別端末" } }] }] });
  const f = fixture({ directory, decision: "既存はOFFのまま", write: async (...args) => {
    await fs.writeFile(file, external);
    return structured.writeStructuredFile(...args);
  } });
  await assert.rejects(f.updateWebviewSaveSetting(f.context, "noteMemoAutoSyncEnabled", true), /読み込み後に更新/);
  assert.equal(await fs.readFile(file, "utf8"), external);
  assert.equal(f.values.noteMemoAutoSyncEnabled, false);
  await fs.writeFile(file, "{broken");
  const broken = fixture({ directory, decision: "既存はOFFのまま" });
  await assert.rejects(broken.updateWebviewSaveSetting(broken.context, "noteMemoAutoSyncEnabled", true));
  assert.equal(await fs.readFile(file, "utf8"), "{broken");
  assert.equal(broken.values.noteMemoAutoSyncEnabled, false);
});

test("続けて届いたON/OFFは確認の終了後に順番に適用する", async () => {
  let accept;
  const f = fixture({ decision: () => new Promise((resolve) => { accept = resolve; }) });
  const on = f.updateWebviewSaveSetting(f.context, "noteMemoAutoSyncEnabled", true);
  const off = f.updateWebviewSaveSetting(f.context, "noteMemoAutoSyncEnabled", false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.values.noteMemoAutoSyncEnabled, false);
  accept("すべてONにする");
  await Promise.all([on, off]);
  assert.equal(f.changes[0].value, true);
  assert.equal(f.changes[1].value, false);
});

test("既存メモの列挙に失敗した場合は空扱いでONにせず、内容を保持する", async (t) => {
  const directory = await project(t), file = path.join(directory, "plots", "note.json");
  const raw = JSON.stringify({ groups: [{ items: [{ memo: { text: "保持" } }] }] });
  await fs.writeFile(file, raw);
  for (const multiRoot of ["", directory]) {
    const f = fixture({ directory, multiRoot, decision: "既存はOFFのまま", fileSystem: {
      ...fs, readdir: async () => { throw Object.assign(new Error("読み込みできません"), { code: "EIO" }); },
    } });
    await assert.rejects(f.updateWebviewSaveSetting(f.context, "noteMemoAutoSyncEnabled", true), /読み込みできません/);
    assert.equal(f.values.noteMemoAutoSyncEnabled, false);
  }
  assert.equal(await fs.readFile(file, "utf8"), raw);
});

test("ノートの既定メニューは設定変更を要求し、設定表示の更新で編集モデルを変更しない", () => {
  const { getEventsScript } = require("../src/views/note-webview/script-events");
  const script = getEventsScript(), calls = [], statuses = [], initial = { noteMemoAutoSyncDefault: false };
  let receive;
  const button = { disabled: false, setAttribute(name, value) { this[name] = value; } };
  const draft = { groups: [{ items: [{ memo: { text: "保存前の入力" } }] }] };
  const context = vm.createContext({ initial, state: draft, autoSaveBadgeEl: {},
    vscode: { postMessage: (message) => calls.push(message) }, setMoreMenuOpen() {}, renderGroups() {},
    window: { addEventListener: (name, callback) => { if (name === "message") receive = callback; } },
    handleNoteShortcut() {}, setStatus: (...args) => statuses.push(args),
    document: { getElementById: () => button, body: { style: { setProperty() {} } } },
  });
  vm.runInContext(script.slice(script.indexOf("function handleMenuAction"), script.indexOf("function registerMessageEvents")), context);
  context.handleMenuAction("toggleMemoAutoSyncDefault", button);
  assert.equal(calls[0].type, "updateNoteMemoAutoSyncDefault");
  assert.equal(calls[0].enabled, true);
  assert.equal(button.disabled, true);
  context.applyNoteUiSettings({ fontScale: 1, autoSaveEnabled: false, noteMemoAutoSyncDefault: true });
  assert.equal(button["aria-pressed"], "true");
  assert.match(button.textContent, /既定.*ON/);
  assert.equal(draft.groups[0].items[0].memo.text, "保存前の入力");
  vm.runInContext(script.slice(script.indexOf("function registerMessageEvents"), script.indexOf("function registerDomEvents")), context);
  context.registerMessageEvents();
  receive({ data: { type: "noteMemoAutoSyncDefaultResult", error: "更新失敗", payload: { noteMemoAutoSyncDefault: false, autoSaveEnabled: true } } });
  assert.equal(button.disabled, false);
  assert.match(button.textContent, /既定.*OFF/);
  assert.equal(statuses[0][1], true);
  assert.equal(statuses[0][2], true);
});

test("Dashboardは確定値を受け取ってチェックを戻し、エラーを後続の成功で消さない", () => {
  const { makeStatsScript } = require("../src/stats/stats-html/stats-html-script");
  const script = makeStatsScript();
  assert.doesNotThrow(() => new vm.Script(script));
  const calls = [], input = { checked: false, dataset: { saveSetting: "webviewAutoSaveEnabled" }, addEventListener(_name, callback) { this.change = callback; } };
  const nodes = {
    saveSettingsNotice: { hidden: true, dataset: {}, setAttribute() {} }, saveSettingsStatus: {},
    saveSettingsNoticeClose: { addEventListener(_name, callback) { this.click = callback; } },
  };
  const context = vm.createContext({ document: { querySelectorAll: () => [input], getElementById: (id) => nodes[id] }, vscode: { postMessage: (message) => calls.push(message) } });
  vm.runInContext(script.slice(script.indexOf("let saveSettingsPending"), script.indexOf("function bindStatsActions")), context);
  const messageStart = script.indexOf('if (msg.type === "webviewSaveSettingsChanged"');
  vm.runInContext("function onMessage(msg) {" + script.slice(messageStart, script.indexOf('if (msg.type === "saveProgressShareImage.result")', messageStart)) + "}", context);
  context.bindRetentionActions();
  input.change();
  assert.equal(input.disabled, true);
  assert.equal(calls[0].enabled, false);
  context.onMessage({ type: "webviewSaveSettingResult", settings: { webviewAutoSaveEnabled: true }, error: "設定保存失敗" });
  assert.equal(input.checked, true);
  assert.equal(input.disabled, false);
  assert.equal(nodes.saveSettingsStatus.textContent, "設定保存失敗");
  context.onMessage({ type: "webviewSaveSettingResult", settings: { webviewAutoSaveEnabled: false } });
  assert.equal(nodes.saveSettingsStatus.textContent, "設定保存失敗");
  nodes.saveSettingsNoticeClose.click();
  assert.equal(nodes.saveSettingsNotice.hidden, true);
});

test("Dashboardの設定更新は全体再描画せず、案内板の入口では保存設定を開いて初期描画する", async () => {
  const renders = [], posted = [], configListeners = [];
  let receive;
  const api = fixture();
  const disposable = () => ({ dispose() {} });
  const panel = { reveal() {}, onDidDispose() {}, webview: { postMessage: async (message) => posted.push(message), onDidReceiveMessage: (callback) => { receive = callback; } } };
  const vscode = { ViewColumn: { Beside: 2 }, workspace: { onDidChangeConfiguration: (callback) => { configListeners.push(callback); return disposable(); } },
    window: { onDidChangeActiveTextEditor: disposable, onDidChangeVisibleTextEditors: disposable, createWebviewPanel: () => panel } };
  const module = { exports: {} };
  vm.runInNewContext(syncFs.readFileSync(path.join(__dirname, "../src/stats/stats-panel.js"), "utf8"), {
    module, console, require: (name) => {
      if (name === "./dashboard-stats-correction-actions") return require("../src/stats/dashboard-stats-correction-actions");
      if (name === "./dashboard-progress-image-actions") return require("../src/stats/dashboard-progress-image-actions");
      if (name === "./dashboard-writing-memo-actions") return require("../src/stats/dashboard-writing-memo-actions");
      if (name === "./dashboard-writing-memo-operations") return require("../src/stats/dashboard-writing-memo-operations");
      if (name === "./dashboard-writing-memo-navigation") return require("../src/stats/dashboard-writing-memo-navigation");
      if (name === "./dashboard-memo-actions") return require("../src/stats/dashboard-memo-actions");
      if (name === "./dashboard-highlight-actions") return require("../src/stats/dashboard-highlight-actions");
      if (name === "./dashboard-events") return require("../src/stats/dashboard-events");
      if (name === "./dashboard-settings-actions") return require("../src/stats/dashboard-settings-actions");
      if (name === "vscode") return vscode;
      if (name === "fs" || name === "path") return require(name);
      if (name === "../views/shared/restored-webviews") return require("../src/views/shared/restored-webviews");
      if (name === "../data/webview-save-settings") return api;
      if (name === "./stats-html") return { makeStatsHtml: (state) => { renders.push(state); return "HTML"; } };
      if (name === "./stats-utils") return { setStatsRefreshHandler() {} };
      if (name === "../views/shared/webview-panel-icon") return { setWebviewPanelThemeIcon() {} };
      return {};
    },
  });
  const controller = module.exports.createStatsPanelController({ context: api.context, buildStatsState: async () => ({}), getHighlightManager: () => null });
  await controller.open();
  await receive({ type: "updateWebviewSaveSetting", key: "webviewAutoSaveEnabled", enabled: false });
  configListeners[0]({ affectsConfiguration: (key) => key === "mojigoto.webviewAutoSaveEnabled" });
  assert.equal(renders.length, 1);
  assert.equal(posted.find((message) => message.type === "webviewSaveSettingResult").settings.webviewAutoSaveEnabled, false);
  assert.equal(posted.at(-1).type, "webviewSaveSettingsChanged");
  await controller.openSaveSettings();
  assert.equal(renders.at(-1).openSaveSettings, true);
});

test("案内板の保存説明からDashboardの保存設定へ移動できる", async () => {
  let receive, html, disposed = false;
  const calls = [];
  const panel = { dispose: () => { disposed = true; }, webview: { cspSource: "local", set html(value) { html = value; }, onDidReceiveMessage: (callback) => { receive = callback; } } };
  const module = { exports: {} };
  vm.runInNewContext(syncFs.readFileSync(path.join(__dirname, "../src/views/first-run-board-webview.js"), "utf8"), {
    module, require: (name) => name === "vscode"
      ? { ViewColumn: { One: 1 }, window: { createWebviewPanel: () => panel }, commands: { executeCommand: async (...args) => calls.push(args) } }
      : { setWebviewPanelThemeIcon() {} },
  });
  await module.exports.openFirstRunBoardWebview({ subscriptions: [] });
  assert.match(html, /自動保存が初期ON/);
  assert.match(html, /各メモの個別ON／OFF(?:が優先|を優先)/);
  await receive({ command: "openSaveSettings" });
  assert.equal(calls[0][0], "mojigoto.openStats");
  assert.equal(calls[0][1].section, "saveSettings");
  assert.equal(disposed, true);
});
