const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const Module = require("node:module");
const test = require("node:test");
const values = new Map();
const workspace = { workspaceFolders: [], getConfiguration: () => ({ get: (key, fallback) => values.has(key) ? values.get(key) : fallback }) };
const vscode = { workspace, window: {}, commands: {}, Uri: { file: fsPath => ({ fsPath, scheme: "file" }) } };
const originalLoad = Module._load;
Module._load = function(request, parent, main) { return request === "vscode" ? vscode : originalLoad(request, parent, main); };
const { readBackupSettings } = require("../src/backup/backup-settings");
const manuscript = require("../src/backup/manuscript-backup");
const structured = require("../src/backup/structured-data-backup");
Module._load = originalLoad;

async function fixture(t) {
  values.clear();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mojigoto-backup-settings-"));
  await fs.mkdir(path.join(root, ".mojigoto", "plots"), { recursive: true });
  await fs.mkdir(path.join(root, "原稿"));
  values.set("manuscriptRoot", path.join(root, "原稿"));
  workspace.workspaceFolders = [{ uri: vscode.Uri.file(root) }];
  t.after(async () => { values.clear(); workspace.workspaceFolders = []; await fs.rm(root, { recursive: true, force: true }); });
  const filePath = path.join(root, "原稿", "本文.txt");
  await fs.writeFile(filePath, "原稿");
  const document = { uri: { ...vscode.Uri.file(filePath), toString: () => filePath }, getText: () => "原稿" };
  return { root, document, note: path.join(root, ".mojigoto", "plots", "note.json"), concept: path.join(root, ".mojigoto", "concept-memos.json") };
}

test("初期値は自動OFF・保持50件で、明示した間隔と1～50件を読む", () => {
  values.clear();
  assert.deepEqual(readBackupSettings(), { intervalMinutes: 0, maxPerFile: 50 });
  values.set("backupIntervalMinutes", 30);
  for (const limit of [1, 10, 50]) {
    values.set("backupMaxPerFile", limit);
    assert.deepEqual(readBackupSettings(), { intervalMinutes: 30, maxPerFile: limit });
  }
  for (const limit of [0, -1, 51, 1.5, "5", NaN, Infinity]) {
    values.set("backupMaxPerFile", limit);
    assert.equal(readBackupSettings().maxPerFile, 50);
  }
  values.clear();
});

test("原稿・ノート・構想メモの初期自動OFFでも手動作成できる", async t => {
  const f = await fixture(t);
  await manuscript.maybeCreateAutomaticBackup(f.document);
  for (const [filePath, targetType, content] of [[f.note, "note", '{"groups":[]}'], [f.concept, "conceptMemo", '{"memos":[]}']]) {
    await fs.writeFile(filePath, content);
    const disabled = await structured.createStructuredBackup({ filePath, targetType, reason: "automatic" });
    assert.equal(disabled.disabled, true);
    assert.equal((await structured.listStructuredBackups(filePath, targetType)).entries.length, 0);
    await structured.createStructuredBackup({ filePath, targetType, reason: "manual" });
  }
  assert.equal((await manuscript.listManuscriptBackups(f.document)).entries.length, 0);
  await manuscript.createManuscriptBackup(f.document);
  assert.equal((await manuscript.listManuscriptBackups(f.document)).entries.length, 1);
  values.set("backupIntervalMinutes", 30);
  f.document.getText = () => "変更した原稿";
  await manuscript.maybeCreateAutomaticBackup(f.document);
  assert.equal((await manuscript.listManuscriptBackups(f.document)).entries.some(entry => entry.reason === "automatic"), true);
});

test("原稿は設定した1件まで整理し、他の原稿の履歴は分離する", async t => {
  const f = await fixture(t);
  values.set("backupMaxPerFile", 1);
  const first = await manuscript.createManuscriptBackup(f.document);
  f.document.getText = () => "次の版";
  await manuscript.createManuscriptBackup(f.document);
  const listing = await manuscript.listManuscriptBackups(f.document);
  assert.equal(listing.entries.length, 1);
  assert.equal((await manuscript.readSnapshot(listing.context, listing.entries[0])).content, "次の版");
  await assert.rejects(fs.access(path.join(first.context.snapshotsRoot, first.entry.snapshotFile)), { code: "ENOENT" });
  const otherPath = path.join(f.root, "原稿", "別の原稿.txt");
  await fs.writeFile(otherPath, "別原稿");
  const other = { uri: { ...vscode.Uri.file(otherPath), toString: () => otherPath }, getText: () => "別原稿" };
  await manuscript.createManuscriptBackup(other);
  assert.equal((await manuscript.listManuscriptBackups(f.document)).entries.length, 1);
  assert.equal((await manuscript.listManuscriptBackups(other)).entries.length, 1);
});

test("ノート・構想メモは設定変更だけでは削除せず、新規作成時に保護以外を整理する", async t => {
  const f = await fixture(t);
  values.set("backupMaxPerFile", 2);
  for (const [filePath, targetType] of [[f.note, "note"], [f.concept, "conceptMemo"]]) {
    const content = version => JSON.stringify(targetType === "note" ? { title: version, groups: [] } : { memos: [{ title: version }] });
    await fs.writeFile(filePath, content("保護する版"));
    const first = await structured.createStructuredBackup({ filePath, targetType });
    const indexPath = first.context.indexPath;
    const index = JSON.parse(await fs.readFile(indexPath, "utf8"));
    index.snapshots.find(entry => entry.id === first.entry.id).protected = true;
    await fs.writeFile(indexPath, JSON.stringify(index));
    for (const version of ["前の版", "次の版"]) {
      await fs.writeFile(filePath, content(version));
      await structured.createStructuredBackup({ filePath, targetType });
    }
    assert.equal((await structured.listStructuredBackups(filePath, targetType)).entries.length, 3);
    values.set("backupMaxPerFile", 1);
    assert.equal((await structured.listStructuredBackups(filePath, targetType)).entries.length, 3);
    await fs.writeFile(filePath, content("最新"));
    await structured.createStructuredBackup({ filePath, targetType });
    const listing = await structured.listStructuredBackups(filePath, targetType);
    assert.equal(listing.entries.length, 2);
    assert.equal(listing.entries.some(entry => entry.id === first.entry.id && entry.protected), true);
    values.set("backupMaxPerFile", 2);
  }
});
