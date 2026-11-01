const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const syncFs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const vm = require("node:vm");

let workspaceRoot = "";
let settings = {};
let commands = [];
let values = new Map();
const cfg = { get: (key, fallback) => settings[key] ?? fallback, update: async (key, value) => { settings[key] = value; } };
const vscode = {
  ConfigurationTarget: { Workspace: 2 }, ProgressLocation: { Notification: 1 }, TreeItemCollapsibleState: { Collapsed: 1, None: 0 },
  workspace: { getConfiguration: () => cfg, get workspaceFolders() { return [{ uri: { fsPath: workspaceRoot } }]; } },
  window: { withProgress: async (_options, callback) => callback(), showQuickPick: async (items) => items.find((item) => !item.skipExistingWork), showInformationMessage() {}, showWarningMessage() {} },
  commands: { executeCommand: async (name) => { commands.push(name); } },
};
const originalLoad = Module._load;
let setup, roots, server, doctor;
try {
  Module._load = function (request, ...args) { return request === "vscode" ? vscode : originalLoad.call(this, request, ...args); };
  setup = require("../src/setup/setup-service");
  roots = require("../src/core/mojigoto-context");
  server = require("../src/preview/server-service");
  doctor = require("../src/debug/doctor");
} finally { Module._load = originalLoad; }
const context = {
  globalState: { get: (key, fallback) => values.get(key) ?? fallback, update: async (key, value) => values.set(key, value) },
  asAbsolutePath: (relative) => path.resolve(__dirname, "..", relative),
};
async function fixture(t) {
  const tempRoot = path.resolve(__dirname, "..", ".review-baseline", "test-temp");
  await fs.mkdir(tempRoot, { recursive: true });
  workspaceRoot = await fs.mkdtemp(path.join(tempRoot, "setup-stream-"));
  settings = {}; commands = []; values = new Map();
  t.after(async () => { assert.ok(workspaceRoot.startsWith(tempRoot + path.sep)); await fs.rm(workspaceRoot, { recursive: true, force: true }); });
  const originalSymlink = fs.symlink;
  fs.symlink = async () => { throw Object.assign(new Error("streaming filesystem"), { code: "EISDIR" }); };
  t.after(() => { fs.symlink = originalSymlink; });
}
function assertRoot(root) {
  assert.equal(settings.manuscriptRoot, root);
  assert.equal(roots.getResolvedManuscriptRoot(), root);
  assert.equal(server.resolveVerticalDevPath(context).manuscriptRoot, root);
  assert.ok(syncFs.existsSync(root));
  assert.equal(values.get("mojigoto.firstRunSetupDone"), true);
  assert.ok(commands.includes("mojigoto.refreshWorkTree"));
  assert.ok(commands.includes("mojigoto.serverRestart"));
}

test("ストリーミング先の既存作品を初回セットアップで選択し監視対象まで直接参照する", async (t) => {
  await fixture(t);
  const manuscript = path.join(workspaceRoot, "サンプル作品", "原稿");
  await fs.mkdir(manuscript, { recursive: true });
  await fs.writeFile(path.join(manuscript, "sample.txt"), "保持");
  assert.equal(syncFs.existsSync(path.join(workspaceRoot, "_WORK")), false);
  const result = await setup.applyInitialSetup(context, { mode: "multi", workRoot: workspaceRoot, selectExistingWork: true });
  assert.equal(syncFs.statSync(path.join(workspaceRoot, "_WORK")).isDirectory(), true);
  assertRoot(manuscript);
  assert.equal(result.linkedToView, true);
  assert.equal(await fs.readFile(path.join(manuscript, "sample.txt"), "utf8"), "保持");
});
test("ストリーミング先で新規作品をセットアップしてもjunctionエラーにならない", async (t) => {
  await fixture(t);
  const result = await setup.applyInitialSetup(context, { mode: "multi", workRoot: workspaceRoot, createWorkNow: true, work: { title: "新作品" } });
  assertRoot(path.join(workspaceRoot, "新作品", "manuscript"));
  assert.equal(result.createdWork, true);
});
test("SingleからMulti移行後も直接参照を_WORKへ上書きせず原稿を保持する", async (t) => {
  await fixture(t);
  await fs.mkdir(path.join(workspaceRoot, "manuscript"));
  await fs.writeFile(path.join(workspaceRoot, "manuscript", "old.txt"), "移行する原稿");
  const result = await setup.applyInitialSetup(context, { mode: "multi", workRoot: workspaceRoot, migrateSingleToMulti: true, migrationWorkName: "移行作品" });
  const root = path.join(workspaceRoot, "移行作品", "manuscript");
  assertRoot(root);
  assert.equal(result.linkedToView, true);
  assert.equal(await fs.readFile(path.join(root, "old.txt"), "utf8"), "移行する原稿");
});

test("Singleの構想・画像・履歴・執筆記録も作品へ移し、共通データと未知ファイルは保持する", async (t) => {
  await fixture(t);
  const source = path.join(workspaceRoot, ".mojigoto");
  await fs.mkdir(path.join(source, "backups", "snapshots"), { recursive: true });
  await fs.mkdir(path.join(source, "note-images"), { recursive: true });
  await fs.mkdir(path.join(source, "templates", "plot"), { recursive: true });
  const files = {
    "singleWork.json": '{"title":"旧作品","customSetting":{"keep":true}}',
    "concept-memos.json": '{"memos":[{"id":"memo","body":"保持する構想"}]}',
    "backups/index.json": '{"snapshots":[{"id":"history"}]}',
    "backups/snapshots/history.json": '{"content":"保持する履歴"}',
    "note-images/image.png": "画像相当の内容",
    "web-writing-events.json": '{"events":[{"id":"web_keep"}]}',
    "common-todos.json": '{"todos":[{"id":"common"}]}',
    "templates/plot/common.json": '{"title":"共通テンプレート"}',
    "unknown.json": '{"keep":"未知のデータ"}',
  };
  for (const [relative, raw] of Object.entries(files)) await fs.writeFile(path.join(source, relative), raw);
  await setup.applyInitialSetup(context, { mode: "multi", workRoot: workspaceRoot, migrateSingleToMulti: true, migrationWorkName: "移行作品" });
  const target = path.join(workspaceRoot, "移行作品", ".mojigoto");
  for (const relative of ["concept-memos.json", "backups/index.json", "backups/snapshots/history.json", "note-images/image.png", "web-writing-events.json"]) {
    assert.equal(await fs.readFile(path.join(target, relative), "utf8"), files[relative]);
    assert.equal(syncFs.existsSync(path.join(source, relative)), false);
  }
  for (const relative of ["common-todos.json", "templates/plot/common.json", "unknown.json"]) assert.equal(await fs.readFile(path.join(source, relative), "utf8"), files[relative]);
  assert.equal(JSON.parse(await fs.readFile(path.join(target, "work.json"), "utf8")).customSetting.keep, true);
  assert.equal(syncFs.existsSync(path.join(source, "singleWork.json")), false);
});

test("共通データがなければSingleの元の管理フォルダを空にして整理する", async (t) => {
  await fixture(t);
  const source = path.join(workspaceRoot, ".mojigoto");
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, "singleWork.json"), '{"title":"旧作品"}');
  await fs.writeFile(path.join(source, "concept-memos.json"), '{"memos":[]}');
  await setup.applyInitialSetup(context, { mode: "multi", workRoot: workspaceRoot, migrateSingleToMulti: true, migrationWorkName: "移行作品" });
  assert.equal(syncFs.existsSync(source), false);
  assert.equal(syncFs.existsSync(path.join(workspaceRoot, "移行作品", ".mojigoto", "concept-memos.json")), true);
});

test("Single設定が壊れている場合は元データを保持して移行前に停止する", async (t) => {
  await fixture(t);
  const source = path.join(workspaceRoot, ".mojigoto");
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, "singleWork.json"), "{broken");
  await assert.rejects(setup.migrateSingleToMultiWork(context, { wsPath: workspaceRoot, workRoot: workspaceRoot, workName: "移行作品" }), /元のデータを保持/);
  assert.equal(await fs.readFile(path.join(source, "singleWork.json"), "utf8"), "{broken");
  assert.equal(syncFs.existsSync(path.join(workspaceRoot, "移行作品")), false);
});

test("移行先に途中で作られたデータがある場合は両方を保持して停止する", async (t) => {
  await fixture(t);
  const from = path.join(workspaceRoot, "source.json");
  const to = path.join(workspaceRoot, "target.json");
  await fs.writeFile(from, "移行元のデータ");
  await fs.writeFile(to, "移行先のデータ");
  const source = syncFs.readFileSync(path.resolve(__dirname, "../src/setup/setup-service.js"), "utf8");
  const ctx = vm.createContext({ fsp: fs, path, ensureDir: (dir) => fs.mkdir(dir, { recursive: true }) });
  for (const name of ["existsPath", "movePathIfExists"]) {
    const start = source.indexOf(`async function ${name}(`);
    const end = /\r?\n}\r?\n/.exec(source.slice(start));
    vm.runInContext(source.slice(start, start + end.index + end[0].length), ctx);
  }
  await assert.rejects(ctx.movePathIfExists(from, to), /上書きせず停止/);
  assert.equal(await fs.readFile(from, "utf8"), "移行元のデータ");
  assert.equal(await fs.readFile(to, "utf8"), "移行先のデータ");
});

test("workRootを変える移行で共通TODOを移し、既存の共通TODOへの上書きは事前に停止する", async (t) => {
  await fixture(t);
  const source = path.join(workspaceRoot, ".mojigoto");
  const workRoot = path.join(workspaceRoot, "Multi用");
  await fs.mkdir(source);
  await fs.mkdir(path.join(workRoot, ".mojigoto"), { recursive: true });
  await fs.writeFile(path.join(source, "singleWork.json"), '{"title":"旧作品"}');
  await fs.writeFile(path.join(source, "common-todos.json"), "旧TODO");
  await fs.writeFile(path.join(workRoot, ".mojigoto", "common-todos.json"), "既存TODO");
  await assert.rejects(setup.migrateSingleToMultiWork(context, { wsPath: workspaceRoot, workRoot, workName: "移行作品" }), /両方の内容を保持/);
  assert.equal(syncFs.existsSync(path.join(workRoot, "移行作品")), false);
  assert.equal(await fs.readFile(path.join(workRoot, ".mojigoto", "common-todos.json"), "utf8"), "既存TODO");
  await fs.unlink(path.join(workRoot, ".mojigoto", "common-todos.json"));
  await setup.migrateSingleToMultiWork(context, { wsPath: workspaceRoot, workRoot, workName: "移行作品" });
  assert.equal(await fs.readFile(path.join(workRoot, ".mojigoto", "common-todos.json"), "utf8"), "旧TODO");
});
test("初回セットアップで既存の_WORK実フォルダを削除しない", async (t) => {
  await fixture(t);
  const original = path.join(workspaceRoot, "_WORK", "manuscript");
  const actual = path.join(workspaceRoot, "作品", "原稿");
  await fs.mkdir(original, { recursive: true });
  await fs.writeFile(path.join(original, "keep.txt"), "削除しない");
  await fs.mkdir(actual, { recursive: true });
  await setup.applyInitialSetup(context, { mode: "multi", workRoot: workspaceRoot, selectExistingWork: true });
  assertRoot(actual);
  assert.equal(await fs.readFile(path.join(original, "keep.txt"), "utf8"), "削除しない");
});
test("直接参照した作品のView原稿と設定は実原稿フォルダへ追従する", async (t) => {
  await fixture(t);
  const manuscript = path.join(workspaceRoot, "作品", "原稿");
  await fs.mkdir(manuscript, { recursive: true });
  await setup.applyInitialSetup(context, { mode: "multi", workRoot: workspaceRoot, selectExistingWork: true });
  const source = syncFs.readFileSync(path.resolve(__dirname, "../src/tree/work-tree-provider.js"), "utf8");
  const methods = ["resolveCurrentViewWork", "getCurrentViewSections"].map((name) => {
    const start = source.indexOf(`  ${name}() {`);
    const end = /\r?\n  }/.exec(source.slice(start));
    return source.slice(start, start + end.index + end[0].length);
  }).join("\n");
  const sandbox = {
    fs: syncFs, path, vscode, getResolvedManuscriptRoot: roots.getResolvedManuscriptRoot,
    getWorkRoot: roots.getWorkRoot, getCurrentWorkName: () => values.get("mojigoto.currentWorkName"),
    normalizeComparablePath: (value) => path.resolve(value).toLowerCase(), MOJIGOTO_ICONS: {},
    MojigotoTreeItem: class { constructor(_label, _state, properties) { Object.assign(this, properties); } },
    getTrashDirForWork: (work) => path.join(work, ".mojigoto", "trash"),
  };
  vm.createContext(sandbox);
  vm.runInContext(`class Provider { ${methods} }; provider = new Provider();`, sandbox);
  const provider = sandbox.provider;
  provider.context = context;
  provider._upsertTreeItem = (_label, _state, properties) => properties;
  provider.createConceptMemosItem = () => ({});
  const items = provider.getCurrentViewSections();
  assert.equal(items[0].fsPath, manuscript);
  assert.equal(items[0].workDir, path.dirname(manuscript));
  assert.equal(items.find((item) => item.kind === "settingsEntry").fsPath, path.dirname(manuscript));
});
test("自己診断と修復は有効な直接参照を異常扱いせず_WORKへ戻さない", async (t) => {
  await fixture(t);
  const manuscript = path.join(workspaceRoot, "作品", "原稿");
  await fs.mkdir(manuscript, { recursive: true });
  await setup.applyInitialSetup(context, { mode: "multi", workRoot: workspaceRoot, selectExistingWork: true });
  const report = await doctor.buildDoctorReport(context);
  assert.ok(report.checks.some((check) => check.title === "View原稿（直接参照）" && check.level === "ok"));
  assert.ok(!report.repairPlanLines.some((line) => line.includes("_WORK/manuscript")));
  await doctor.repairFromReport(context, report);
  assert.equal(settings.manuscriptRoot, manuscript);
  assert.equal(syncFs.existsSync(path.join(workspaceRoot, "_WORK", "manuscript")), false);
});
