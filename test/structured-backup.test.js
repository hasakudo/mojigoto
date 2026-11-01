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
      workspace: {},
      commands: {},
      Uri: { file: (value) => ({ fsPath: value }) },
    };
  }
  return originalLoad(request, parent, isMain);
};

const {
  createStructuredBackup,
  listStructuredBackups,
  resolveStructuredBackupContext,
} = require("../src/backup/structured-data-backup");
Module._load = originalLoad;

async function makeWork(root, name) {
  const mojigoto = path.join(root, name, ".mojigoto");
  await fs.mkdir(path.join(mojigoto, "plots"), { recursive: true });
  const note = path.join(mojigoto, "plots", "人物.json");
  const concept = path.join(mojigoto, "concept-memos.json");
  await fs.writeFile(note, "{\"title\":\"人物\"}\n", "utf8");
  await fs.writeFile(concept, "{\"memos\":[]}\n", "utf8");
  return { mojigoto, note, concept };
}

test("SingleとMulti相当の作品パスでノート・構想メモ履歴を分離する", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mojigoto-backup-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const single = await makeWork(root, "single");
  const multi = await makeWork(path.join(root, "multi-root"), "work-a");

  for (const work of [single, multi]) {
    await createStructuredBackup({ filePath: work.note, targetType: "note", reason: "manual" });
    await createStructuredBackup({ filePath: work.concept, targetType: "conceptMemo", reason: "manual" });
    const notes = await listStructuredBackups(work.note, "note");
    const concepts = await listStructuredBackups(work.concept, "conceptMemo");
    assert.equal(notes.entries.length, 1);
    assert.equal(notes.entries[0].relativePath, "plots/人物.json");
    assert.equal(concepts.entries.length, 1);
    assert.equal(concepts.entries[0].relativePath, "concept-memos.json");
    assert.equal(resolveStructuredBackupContext(work.note, "note").backupRoot, path.join(work.mojigoto, "backups"));
  }
});

test("index.jsonが破損してもスナップショットからノート履歴を再構築する", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mojigoto-backup-rebuild-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const work = await makeWork(root, "work");
  await createStructuredBackup({ filePath: work.note, targetType: "note", reason: "manual" });
  const indexPath = path.join(work.mojigoto, "backups", "index.json");
  await fs.writeFile(indexPath, "{broken", "utf8");
  const rebuilt = await listStructuredBackups(work.note, "note");
  assert.equal(rebuilt.entries.length, 1);
  const savedIndex = JSON.parse(await fs.readFile(indexPath, "utf8"));
  assert.equal(savedIndex.snapshots[0].targetType, "note");
});
