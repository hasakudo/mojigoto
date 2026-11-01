const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mojigoto-warehouse-"));
const workspaceRoot = path.join(fixture, "works");
const externalRoot = path.join(fixture, "external", "書き出し");
fs.mkdirSync(workspaceRoot, { recursive: true });
fs.mkdirSync(externalRoot, { recursive: true });
let settings;
let picked;
let configListener;
const watchers = [];
const updates = [];
const messages = [];
const cfg = {
  get: (key, fallback) => settings[key] ?? fallback,
  update: async (key, value) => { updates.push([key, value]); settings[key] = value; },
};
const disposable = () => ({ dispose() {} });
const vscode = {
  TreeItem: class { constructor(label, collapsibleState) { Object.assign(this, { label, collapsibleState }); } },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class { constructor(id) { this.id = id; } },
  EventEmitter: class { event = () => disposable(); fire() {} },
  RelativePattern: class { constructor(base, pattern) { Object.assign(this, { base, pattern }); } },
  Uri: { file: (fsPath) => ({ fsPath }) },
  ConfigurationTarget: { Workspace: 2 },
  commands: { executeCommand: async () => {} },
  window: {
    showInformationMessage: async (message, options, action) => { messages.push(message); return action; },
    showWarningMessage: async () => undefined,
    showOpenDialog: async () => picked ? [{ fsPath: picked }] : undefined,
    showErrorMessage: (message) => { throw new Error(message); },
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: workspaceRoot } }],
    getConfiguration: () => cfg,
    onDidChangeConfiguration: (listener) => { configListener = listener; return disposable(); },
    onDidCreateFiles: disposable, onDidDeleteFiles: disposable,
    onDidRenameFiles: disposable, onDidSaveTextDocument: disposable,
    createFileSystemWatcher(pattern, ignoreCreate, ignoreChange, ignoreDelete) {
      const watcher = {
        pattern, ignoreCreate, ignoreChange, ignoreDelete, disposed: false,
        onDidCreate(listener) { this.create = listener; return disposable(); },
        onDidDelete(listener) { this.delete = listener; return disposable(); },
        dispose() { this.disposed = true; },
      };
      watchers.push(watcher);
      return watcher;
    },
  },
};
const stubs = {
  "../core/mojigoto-context": {
    isSingleMode: () => settings.mode === "single",
    getResolvedManuscriptRoot: () => settings.manuscriptRoot,
    getWorkRoot: () => settings.workRoot,
    getCurrentWorkName: () => settings.currentWork || "作品A",
  },
  "../core/mojigoto-paths": { listWorkDirectories: () => [], listManuscriptChildren: () => [] },
  "../data/note-store": { listNotesWithMeta: () => [] },
  "../core/mojigoto-trash": {},
  "../data/settings-store": { WORK_STATUS_OPTIONS: [], normalizeWorkStatus: (value) => value || "" },
  "../work/work-settings": {
    getCurrentWorkDisplayName: () => settings.currentWork || "作品A",
    getCurrentWorkFolderName: () => settings.currentWork || "作品A",
  },
};
const originalLoad = Module._load;
let Provider, registerTreeRefreshWatchers, exportsApi;
try {
  Module._load = function (request, parent, isMain) {
    if (request === "vscode") return vscode;
    if (stubs[request]) return stubs[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  Provider = require("../src/tree/work-tree-provider").MojigotoWorkTreeProvider;
  ({ registerTreeRefreshWatchers } = require("../src/tree/work-tree-watchers"));
  exportsApi = require("../src/export/export-utils");
} finally { Module._load = originalLoad; }
const context = () => ({ subscriptions: [], globalState: { get: (_key, fallback) => fallback, update: async () => {} } });
const provider = () => new Provider(context());
const tick = () => new Promise((resolve) => setTimeout(resolve, 180));
const changeConfig = (key) => configListener({ affectsConfiguration: (name) => name === `mojigoto.${key}` });
test.beforeEach(() => {
  settings = { mode: "single", workRoot: workspaceRoot, manuscriptRoot: path.join(workspaceRoot, "作品A", "manuscript"), exportRoot: externalRoot };
  updates.length = messages.length = watchers.length = 0;
  picked = undefined;
});
test.after(() => fs.rmSync(fixture, { recursive: true, force: true }));

for (const mode of ["single", "multi"]) {
  test(`${mode}: 外部ExportRootを倉庫に表示し、作品切替でも同じ場所を使う`, async () => {
    settings.mode = mode;
    const tree = provider();
    const root = (await tree.getChildren()).find((item) => item.kind === "warehouseRoot");
    assert.equal(root.fsPath, externalRoot);
    assert.equal(root.tooltip, externalRoot);
    settings.currentWork = "作品B";
    settings.manuscriptRoot = path.join(workspaceRoot, "作品B", "manuscript");
    assert.equal((await tree.getChildren()).find((item) => item.kind === "warehouseRoot").fsPath, externalRoot);
  });
}

test("従来の直下の倉庫も表示する", () => {
  settings.exportRoot = path.join(workspaceRoot, "書き出し");
  fs.mkdirSync(settings.exportRoot, { recursive: true });
  assert.equal(provider().createWarehouseRootItem().fsPath, settings.exportRoot);
});

test("未設定・不在・通常ファイル・作品ルート自体は倉庫に表示しない", () => {
  const file = path.join(fixture, "not-a-folder.txt");
  fs.writeFileSync(file, "text");
  for (const root of ["", path.join(fixture, "missing"), file, workspaceRoot]) {
    settings.exportRoot = root;
    assert.deepEqual(provider().getWarehouseRootItems(), []);
  }
  settings.workRoot = externalRoot;
  settings.exportRoot = externalRoot;
  assert.deepEqual(provider().getWarehouseRootItems(), []);
});

test("倉庫の子階層・並び順・ファイルを開くパスが外部を参照する", async () => {
  const out = path.join(externalRoot, "作品A");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(externalRoot, "2.pdf"), "pdf");
  fs.writeFileSync(path.join(externalRoot, "10.txt"), "text");
  const file = path.join(out, "原稿.html");
  fs.writeFileSync(file, "html");
  const tree = provider();
  const root = tree.createWarehouseRootItem();
  const children = await tree.getChildren(root);
  assert.deepEqual(children.map((item) => item.label), ["作品A", "2.pdf", "10.txt"]);
  const [item] = await tree.getChildren(children[0]);
  assert.equal(item.kind, "warehouseFile");
  assert.equal(item.iconPath.id, "file-code");
  assert.equal(item.command.command, "vscode.open");
  assert.equal(item.command.arguments[0].fsPath, file);
  assert.equal(tree.getParent(item), children[0]);
  // Reveal must not enumerate a large warehouse when looking for another path.
  const getChildren = tree.getChildren.bind(tree);
  tree.getChildren = async (parent) => parent ? getChildren(parent) : [root];
  assert.equal((await tree.findItemByFsPath(file)).fsPath, file);
  tree.getWarehouseChildren = () => { throw new Error("unrelated warehouse was traversed"); };
  assert.equal(await tree.findItemByFsPath(path.join(workspaceRoot, "another.txt")), null);
});

test("外部フォルダでの追加・名前変更・削除を再取得できる", () => {
  const tree = provider();
  const root = tree.createWarehouseRootItem();
  const before = path.join(externalRoot, "追加.txt");
  const after = path.join(externalRoot, "変更.txt");
  fs.writeFileSync(before, "text");
  assert.ok(tree.getWarehouseChildren(root).some((item) => item.fsPath === before));
  fs.renameSync(before, after);
  assert.ok(tree.getWarehouseChildren(root).some((item) => item.fsPath === after));
  fs.unlinkSync(after);
  assert.ok(!tree.getWarehouseChildren(root).some((item) => item.fsPath === after));
});

test("倉庫内の祖先へ戻るリンクを展開し続けない", () => {
  const nested = path.join(fixture, "cycle-warehouse", "nested");
  fs.mkdirSync(nested, { recursive: true });
  const rootPath = path.dirname(nested);
  const link = path.join(nested, "back");
  fs.symlinkSync(rootPath, link, process.platform === "win32" ? "junction" : "dir");
  settings.exportRoot = rootPath;
  const tree = provider();
  const [folder] = tree.getWarehouseChildren(tree.createWarehouseRootItem());
  const [back] = tree.getWarehouseChildren(folder);
  assert.deepEqual(tree.getWarehouseChildren(back), []);
});

test("外部ExportRootを選んでも同名の作品を除外せず、作品別に書き出す", async () => {
  settings.exportRoot = "";
  picked = externalRoot;
  assert.equal(await exportsApi.getOrPickExportRoot(context()), externalRoot);
  assert.deepEqual(updates, [["exportRoot", externalRoot]]);
  assert.ok(messages.some((message) => message.includes("倉庫に追加")));
  assert.equal(await exportsApi.ensureWorkExportBaseDir(context()), path.join(externalRoot, "作品A"));
  assert.ok(fs.statSync(path.join(externalRoot, "作品A")).isDirectory());
});

test("直下のExportRootは引き続き作品一覧から除外する", async () => {
  settings.exportRoot = "";
  picked = path.join(workspaceRoot, "出力");
  await exportsApi.getOrPickExportRoot(context());
  assert.deepEqual(settings.workExclude, ["出力"]);
});

test("外部監視は追加・削除の連続イベントをまとめて更新する", async () => {
  const ctx = context();
  let refreshes = 0;
  registerTreeRefreshWatchers(ctx, { refresh() { refreshes += 1; } });
  try {
    const [watcher] = watchers;
    assert.equal(watcher.pattern.base.fsPath, externalRoot);
    assert.equal(watcher.pattern.pattern, "**/*");
    assert.equal(watcher.ignoreCreate, false);
    assert.equal(watcher.ignoreDelete, false);
    watcher.create(); watcher.delete(); watcher.create();
    assert.equal(refreshes, 0);
    await tick();
    assert.equal(refreshes, 1);
  } finally { ctx.subscriptions.forEach((item) => item.dispose()); }
});

test("設定変更で監視を付け替え、旧イベント・保留更新・終了後の更新を止める", async () => {
  const ctx = context();
  let refreshes = 0;
  registerTreeRefreshWatchers(ctx, { refresh() { refreshes += 1; } });
  const old = watchers[0];
  old.create();
  settings.exportRoot = path.join(fixture, "new-root-not-yet-created");
  changeConfig("exportRoot");
  const next = watchers[1];
  assert.ok(old.disposed);
  assert.equal(next.pattern.base.fsPath, settings.exportRoot);
  old.create();
  await tick();
  assert.equal(refreshes, 1);
  next.create();
  ctx.subscriptions.forEach((item) => item.dispose());
  next.create();
  await tick();
  assert.ok(next.disposed);
  assert.equal(refreshes, 1);
});

test("未設定・禁止ルートでは外部監視を作らない", () => {
  for (const root of ["", workspaceRoot]) {
    settings.exportRoot = root;
    const ctx = context();
    registerTreeRefreshWatchers(ctx, { refresh() {} });
    assert.equal(watchers.length, 0);
    ctx.subscriptions.forEach((item) => item.dispose());
  }
});
