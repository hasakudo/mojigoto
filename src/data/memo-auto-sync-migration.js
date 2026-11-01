const fs = require("fs/promises");
const path = require("path");
const { storageRevision, writeStructuredFile } = require("./structured-file-write");
const { isSingleMode, getWorkRoot } = require("../core/mojigoto-context");
const {
  getMojigotoDirForSingle,
  getMojigotoDirForWork,
  listWorkDirectories,
} = require("../core/mojigoto-paths");

async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return { ...JSON.parse(raw), storageRevision: storageRevision(raw) };
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJson(filePath, data) {
  await writeStructuredFile(filePath, data, data.storageRevision);
}

async function listJsonFiles(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => path.join(dirPath, entry.name));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function getMojigotoDirs() {
  if (isSingleMode()) {
    const dir = getMojigotoDirForSingle();
    return dir ? [dir] : [];
  }
  return listWorkDirectories()
    .map((work) => getMojigotoDirForWork(work.fsPath))
    .filter(Boolean);
}

async function keepExistingMemosDisabled(settingKey, assertActive = () => {}) {
  assertActive();
  if (!isSingleMode()) {
    const workRoot = getWorkRoot();
    if (workRoot) await fs.readdir(workRoot);
  }
  let updated = 0;
  assertActive();
  for (const mojigotoDir of getMojigotoDirs()) {
    assertActive();
    if (settingKey === "noteMemoAutoSyncEnabled") {
      const notePaths = [
        ...(await listJsonFiles(path.join(mojigotoDir, "plots"))),
        ...(await listJsonFiles(path.join(mojigotoDir, "references"))),
      ];
      for (const notePath of notePaths) {
        assertActive();
        const note = await readJson(notePath);
        assertActive();
        let changed = false;
        for (const group of Array.isArray(note?.groups) ? note.groups : []) {
          for (const item of Array.isArray(group?.items) ? group.items : []) {
            const memo = item?.memo;
            if (
              !memo ||
              memo.autoSyncToConceptMemo === true ||
              typeof memo.autoSyncToConceptMemoOverride === "boolean"
            ) {
              continue;
            }
            memo.autoSyncToConceptMemoOverride = false;
            changed = true;
            updated += 1;
          }
        }
        if (changed) {
          await writeJson(notePath, note);
          assertActive();
          await Promise.resolve(require("../views/note-webview").notifyNoteUpdated(notePath)).catch(() => undefined);
        }
      }
      continue;
    }

    const conceptPath = path.join(mojigotoDir, "concept-memos.json");
    const data = await readJson(conceptPath);
    assertActive();
    let changed = false;
    for (const memo of Array.isArray(data?.memos) ? data.memos : []) {
      const source = memo?.source;
      if (
        String(source?.kind || "") !== "noteItem" ||
        source.autoSyncToNoteItem === true ||
        typeof source.autoSyncToNoteItemOverride === "boolean"
      ) {
        continue;
      }
      source.autoSyncToNoteItemOverride = false;
      changed = true;
      updated += 1;
    }
    if (changed) {
      await writeJson(conceptPath, data);
      assertActive();
      await Promise.resolve(require("../views/concept-memo-webview").notifyConceptMemoUpdated(conceptPath)).catch(() => undefined);
    }
  }
  return updated;
}

module.exports = { keepExistingMemosDisabled };
