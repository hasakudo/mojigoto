const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const Module = require("node:module");
const test = require("node:test");
const vscode = {
  window: {
    async showQuickPick(choices) { return choices[0]?.action === "create" ? choices[1] : choices.find((choice) => choice.value === "restore"); },
    async showWarningMessage() { return "復元する"; }, showInformationMessage() {},
  }, workspace: {}, commands: {}, Uri: { file: (value) => ({ fsPath: value }) },
};
const originalLoad = Module._load;
Module._load = function(request, parent, main) { return request === "vscode" ? vscode : originalLoad(request, parent, main); };
const { createStructuredBackup, openStructuredBackupHistory, listStructuredBackups } = require("../src/backup/structured-data-backup");
Module._load = originalLoad;

test("保持1件でも復元候補を読み込んで復元でき、直前の版を残す", async t => {
  vscode.workspace.getConfiguration = () => ({ get: (key, fallback) => key === "backupMaxPerFile" ? 1 : fallback });
  t.after(() => { delete vscode.workspace.getConfiguration; });
  for (const type of ["note", "conceptMemo"]) {
    const f = await fixture(t, type);
    assert.equal(await openStructuredBackupHistory({ filePath: f.filePath, targetType: type, label: type }), true);
    assert.equal(await fs.readFile(f.filePath, "utf8"), f.original);
    const listing = await listStructuredBackups(f.filePath, type);
    assert.equal(listing.entries.length, 1);
    assert.equal(listing.entries[0].reason, "before-restore");
    const snapshot = JSON.parse(await fs.readFile(path.join(listing.context.snapshotsRoot, listing.entries[0].snapshotFile), "utf8"));
    assert.equal(snapshot.content, f.current);
  }
});

async function fixture(t, targetType = "note") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mojigoto-restore-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const filePath = path.join(root, ".mojigoto", targetType === "note" ? "plots/note.json" : "concept-memos.json");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const original = targetType === "note" ? '{"title":"復元するノート","groups":[]}' : '{"memos":[{"id":"memo","title":"復元する構想"}]}';
  const current = targetType === "note" ? '{"title":"現在のノート","groups":[]}' : '{"memos":[]}';
  await fs.writeFile(filePath, original);
  const backup = await createStructuredBackup({ filePath, targetType });
  await fs.writeFile(filePath, current);
  return { filePath, targetType, original, current, backup, label: targetType };
}

test("VS Codeのノート・構想メモを復元し、現在の内容を退避する", async (t) => {
  for (const type of ["note", "conceptMemo"]) {
    const f = await fixture(t, type);
    assert.equal(await openStructuredBackupHistory(f), true);
    assert.equal(await fs.readFile(f.filePath, "utf8"), f.original);
    const listing = await listStructuredBackups(f.filePath, type);
    const before = listing.entries.find((entry) => entry.reason === "before-restore");
    const snapshot = JSON.parse(await fs.readFile(path.join(listing.context.snapshotsRoot, before.snapshotFile), "utf8"));
    assert.equal(snapshot.content, f.current);
  }
});

test("VS Code復元のrename失敗は元ファイルと復元前退避を保持する", async (t) => {
  const f = await fixture(t);
  const rename = fs.rename;
  fs.rename = async (source, target) => {
    if (target === f.filePath) throw Object.assign(new Error("blocked"), { code: "EPERM" });
    return rename(source, target);
  };
  try { await assert.rejects(openStructuredBackupHistory(f), { code: "EPERM" }); }
  finally { fs.rename = rename; }
  assert.equal(await fs.readFile(f.filePath, "utf8"), f.current);
  assert.equal((await listStructuredBackups(f.filePath, "note")).entries.some((entry) => entry.reason === "before-restore"), true);
  assert.equal((await fs.readdir(path.dirname(f.filePath))).some((name) => name.includes(".new-")), false);
});

test("VS Code復元の退避中に外部変更されたノートを上書きしない", async (t) => {
  const f = await fixture(t);
  const rename = fs.rename;
  const external = '{"title":"他端末の変更","groups":[]}';
  fs.rename = async (source, target) => {
    const result = await rename(source, target);
    if (target === f.backup.context.indexPath) await fs.writeFile(f.filePath, external);
    return result;
  };
  try { await assert.rejects(openStructuredBackupHistory(f), { code: "conflict" }); }
  finally { fs.rename = rename; }
  assert.equal(await fs.readFile(f.filePath, "utf8"), external);
});

test("VS Codeで破損したバックアップを復元しない", async (t) => {
  const f = await fixture(t);
  const snapshotPath = path.join(f.backup.context.snapshotsRoot, f.backup.entry.snapshotFile);
  const snapshot = JSON.parse(await fs.readFile(snapshotPath, "utf8"));
  snapshot.content = "{壊れた内容";
  await fs.writeFile(snapshotPath, JSON.stringify(snapshot));
  await assert.rejects(openStructuredBackupHistory(f), /検証できません/);
  assert.equal(await fs.readFile(f.filePath, "utf8"), f.current);
});

test("スナップショット作成中の別端末の索引変更を上書きしない", async (t) => {
  const f = await fixture(t);
  const externalIndex = JSON.stringify({ schemaVersion: 1, snapshots: [], custom: "他端末の索引" });
  const rename = fs.rename;
  fs.rename = async (source, target) => {
    const result = await rename(source, target);
    if (target.startsWith(f.backup.context.snapshotsRoot + path.sep)) await fs.writeFile(f.backup.context.indexPath, externalIndex);
    return result;
  };
  try { await assert.rejects(createStructuredBackup({ filePath: f.filePath, targetType: "note" }), { code: "conflict" }); }
  finally { fs.rename = rename; }
  assert.equal(await fs.readFile(f.backup.context.indexPath, "utf8"), externalIndex);
});
