const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const originalLoad = Module._load;
Module._load = function mockVscode(request, parent, isMain) {
  if (request === "vscode") {
    return {
      window: {},
      workspace: { getWorkspaceFolder: () => null, workspaceFolders: [] },
      commands: {},
      Uri: { file: (value) => ({ fsPath: value }) },
    };
  }
  return originalLoad(request, parent, isMain);
};

const { findMovedBackupSourcePath, rewriteBackupPaths, writeJsonAtomic } = require("../src/backup/manuscript-backup");
Module._load = originalLoad;

test("内容が一致する一意な旧パスだけを移動元として選ぶ", () => {
  const context = {
    relativePath: "03. kokoro.txt",
    fileName: "03. kokoro.txt",
    document: { getText: () => "現在と同じ本文" },
  };
  const contentHash = require("../src/backup/backup-format").hashBackupContent(context.document.getText());
  const index = { snapshots: [
    { targetType: "manuscript", relativePath: context.relativePath, fileName: context.fileName, contentHash: "new-backup-after-move" },
    { targetType: "manuscript", relativePath: "原稿/夏目 漱石/03. kokoro.txt", fileName: context.fileName, contentHash },
    { targetType: "manuscript", relativePath: "原稿/夏目 漱石/03. kokoro.txt", fileName: context.fileName, contentHash: "older" },
  ] };
  assert.equal(findMovedBackupSourcePath(index, context), "原稿/夏目 漱石/03. kokoro.txt");
  index.snapshots.push({ targetType: "manuscript", relativePath: "別/03. kokoro.txt", fileName: context.fileName, contentHash });
  assert.equal(findMovedBackupSourcePath(index, context), "");
});

test("旧パスの索引と全スナップショットを現在パスへ書き換える", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mojigoto-backup-path-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const snapshotsRoot = path.join(root, "snapshots");
  const indexPath = path.join(root, "index.json");
  await fs.mkdir(snapshotsRoot, { recursive: true });
  const oldPath = "原稿/夏目 漱石/03. kokoro.txt";
  const entries = ["one", "two"].map((id) => ({
    id,
    targetType: "manuscript",
    relativePath: oldPath,
    fileName: "03. kokoro.txt",
    snapshotFile: `${id}.json`,
  }));
  for (const entry of entries) {
    await fs.writeFile(path.join(snapshotsRoot, entry.snapshotFile), JSON.stringify({ ...entry, content: entry.id }), "utf8");
  }
  const index = { schemaVersion: 1, updatedAt: "", snapshots: entries };
  const migrated = await rewriteBackupPaths({ snapshotsRoot, indexPath }, index, oldPath, "03. kokoro.txt");
  assert.equal(migrated, 2);
  const savedIndex = JSON.parse(await fs.readFile(indexPath, "utf8"));
  assert.deepEqual(savedIndex.snapshots.map((entry) => entry.relativePath), ["03. kokoro.txt", "03. kokoro.txt"]);
  for (const entry of entries) {
    const snapshot = JSON.parse(await fs.readFile(path.join(snapshotsRoot, entry.snapshotFile), "utf8"));
    assert.equal(snapshot.relativePath, "03. kokoro.txt");
    assert.equal(snapshot.fileName, "03. kokoro.txt");
  }
});

test("既存JSONへのrenameが拒否された場合は元ファイルを保持して停止する", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mojigoto-backup-onedrive-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const target = path.join(root, "snapshot.json");
  await fs.writeFile(target, "{\"old\":true}\n", "utf8");
  const originalRename = require("node:fs").promises.rename;
  require("node:fs").promises.rename = async (source, destination) => {
    if (destination === target) {
      const error = new Error("operation not permitted");
      error.code = "EPERM";
      throw error;
    }
    return originalRename(source, destination);
  };
  t.after(() => { require("node:fs").promises.rename = originalRename; });
  await assert.rejects(writeJsonAtomic(target, { migrated: true }), { code: "EPERM" });
  assert.deepEqual(JSON.parse(await fs.readFile(target, "utf8")), { old: true });
  assert.deepEqual((await fs.readdir(root)).filter((name) => name.includes(".new-")), []);
});
