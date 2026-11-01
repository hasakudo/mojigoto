const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { replaceJunction, switchManuscriptRoot } = require("../src/work/manuscript-switch");

function harness({ realDirectory = false, failure = "" } = {}) {
  const linkPath = path.resolve("test_multi_folder（取り込み 2026-10-12T07-37-33-352Z）", "_WORK", "manuscript");
  const targetPath = path.resolve("test_multi_folder（取り込み 2026-10-12T07-37-33-352Z）", "サンプル作品", "原稿");
  const entries = new Map([[linkPath, realDirectory ? "directory" : "old-target"]]);
  const updates = [], operations = [];
  const error = (code) => Object.assign(new Error(code), { code });
  const fileSystem = {
    stat: async () => ({ isDirectory: () => true }),
    lstat: async (name) => { if (!entries.has(name)) throw error("ENOENT"); return { isSymbolicLink: () => entries.get(name) !== "directory" }; },
    symlink: async (target, name) => { operations.push("symlink"); if (failure === "create") throw error("EISDIR"); entries.set(name, target); },
    rename: async (from, to) => { operations.push("rename"); if (failure === "rename" && from.includes(".new-")) throw error("EIO"); entries.set(to, entries.get(from)); entries.delete(from); },
    unlink: async (name) => { assert.notEqual(entries.get(name), "directory"); entries.delete(name); },
  };
  return { linkPath, targetPath, entries, updates, operations, fileSystem, updateRoot: async (root) => updates.push(root) };
}

test("junctionを作れない保存先でも日本語・取り込み日時を含む原稿へ直接切り替える", async () => {
  const h = harness({ failure: "create" });
  const result = await switchManuscriptRoot(h);
  assert.equal(result.mode, "direct");
  assert.equal(h.updates[0], h.targetPath);
  assert.equal(h.entries.get(h.linkPath), "old-target");
});
test("取り込まれた_WORKの実フォルダを削除せず直接参照する", async () => {
  const h = harness({ realDirectory: true });
  await switchManuscriptRoot(h);
  assert.equal(h.entries.get(h.linkPath), "directory");
  assert.equal(h.operations.length, 0);
  assert.equal(h.updates[0], h.targetPath);
});
test("junctionの置換途中で失敗したら以前のリンクを復元する", async () => {
  const h = harness({ failure: "rename" });
  await assert.rejects(replaceJunction(h.linkPath, h.targetPath, h.fileSystem), /EIO/);
  assert.equal(h.entries.get(h.linkPath), "old-target");
  assert.equal(h.entries.size, 1);
});
test("直接参照へ移行した後の作品切り替えはリンクを作らない", async () => {
  const h = harness();
  await switchManuscriptRoot({ ...h, configuredRoot: path.resolve("別作品", "原稿") });
  assert.equal(h.operations.length, 0);
  assert.equal(h.updates[0], h.targetPath);
});
test("リンク作成に成功したら既存方式を維持する", async () => {
  const h = harness();
  await switchManuscriptRoot(h);
  assert.equal(h.entries.get(h.linkPath), h.targetPath);
  assert.equal(h.entries.size, 1);
  assert.equal(h.updates[0], h.linkPath);
});
test("実ファイルシステムで取り込み名を含むjunctionの作成・置換を確認する", async (t) => {
  const tempRoot = path.resolve(__dirname, "..", ".review-baseline", "test-temp");
  await fs.mkdir(tempRoot, { recursive: true });
  const base = await fs.mkdtemp(path.join(tempRoot, "junction-"));
  t.after(async () => { assert.ok(base.startsWith(tempRoot + path.sep)); await fs.rm(base, { recursive: true, force: true }); });
  const first = path.join(base, "作品（取り込み 2026-10-12T07-37-33-352Z）", "原稿");
  const second = path.join(base, "次の作品", "原稿");
  const link = path.join(base, "manuscript");
  await fs.mkdir(first, { recursive: true });
  await fs.mkdir(second, { recursive: true });
  await fs.writeFile(path.join(first, "元の原稿.txt"), "保持");
  await replaceJunction(link, first);
  await replaceJunction(link, second);
  assert.equal(await fs.realpath(link), await fs.realpath(second));
  assert.equal(await fs.readFile(path.join(first, "元の原稿.txt"), "utf8"), "保持");
});
test("作品切替コマンドはjunction失敗後もMultiを維持して選んだ作品を参照する", async (t) => {
  const tempRoot = path.resolve(__dirname, "..", ".review-baseline", "test-temp");
  await fs.mkdir(tempRoot, { recursive: true });
  const base = await fs.mkdtemp(path.join(tempRoot, "switch-command-"));
  t.after(async () => { assert.ok(base.startsWith(tempRoot + path.sep)); await fs.rm(base, { recursive: true, force: true }); });
  const manuscript = path.join(base, "サンプル作品", "原稿");
  await fs.mkdir(manuscript, { recursive: true });
  await fs.writeFile(path.join(manuscript, "原稿.txt"), "保持");
  const settings = { mode: "multi", workRoot: base, manuscriptRoot: path.join(base, "_WORK", "manuscript") };
  const cfg = { get: (key, fallback) => settings[key] ?? fallback, update: async (key, value) => { settings[key] = value; } };
  const values = new Map();
  const vscode = {
    ConfigurationTarget: { Workspace: 2 }, ProgressLocation: { Notification: 1 },
    workspace: { getConfiguration: () => cfg, textDocuments: [] },
    window: { withProgress: async (_options, callback) => callback(), showQuickPick: async (items) => items[0],
      showInformationMessage() {}, showWarningMessage() {}, showErrorMessage: (message) => assert.fail(message) },
    commands: { executeCommand: async () => {} },
  };
  const Module = require("node:module");
  const originalLoad = Module._load;
  let service;
  try {
    Module._load = function (request, ...args) { return request === "vscode" ? vscode : originalLoad.call(this, request, ...args); };
    service = require("../src/work/work-switch-service");
  } finally { Module._load = originalLoad; }
  const originalSymlink = fs.symlink;
  let attempts = 0;
  fs.symlink = async () => { attempts++; throw Object.assign(new Error("unsupported"), { code: "EISDIR" }); };
  try {
    await assert.rejects(fs.stat(path.join(base, "_WORK")), { code: "ENOENT" });
    const context = { globalState: { update: async (key, value) => values.set(key, value) } };
    assert.equal(await service.switchWorkImpl(context), true);
    assert.equal((await fs.stat(path.join(base, "_WORK"))).isDirectory(), true);
    assert.equal(settings.manuscriptRoot, manuscript);
    assert.equal(settings.workRoot, base);
    assert.equal(settings.mode, "multi");
    assert.equal(values.get("mojigoto.currentWorkName"), "サンプル作品");
    assert.equal(await service.switchWorkImpl(context), true);
    assert.equal(attempts, 1);
  } finally { fs.symlink = originalSymlink; }
  assert.equal(await fs.readFile(path.join(manuscript, "原稿.txt"), "utf8"), "保持");
});
