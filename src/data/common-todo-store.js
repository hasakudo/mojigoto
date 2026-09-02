const fs = require("fs/promises");
const path = require("path");
const {
  isSingleMode,
  getWorkspaceRoot,
  getWorkRoot,
} = require("../core/mojigoto-context");
const {
  listWorkDirectories,
  getConceptMemosPathForWork,
  getConceptMemosPathForSingle,
} = require("../core/mojigoto-paths");

function getNowIsoString() {
  return new Date().toISOString();
}

function getCommonTodoFilePath() {
  const root = isSingleMode()
    ? getWorkspaceRoot()
    : getWorkRoot() || getWorkspaceRoot();
  return root ? path.join(root, ".mojigoto", "common-todos.json") : "";
}

function normalizeCommonTodoItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item, index) => ({
      id: String(item?.id || `common_todo_${Date.now()}_${index}`),
      text: String(item?.text || "").trim(),
      done: Boolean(item?.done),
      createdAt: String(item?.createdAt || ""),
      updatedAt: String(item?.updatedAt || ""),
    }))
    .filter((item) => item.text);
}

function mergeCommonTodoItems(groups) {
  const merged = [];
  const seenIds = new Set();
  const seenTexts = new Set();

  for (const group of groups) {
    for (const item of normalizeCommonTodoItems(group)) {
      const idKey = String(item.id || "").trim();
      const textKey = item.text.toLocaleLowerCase("ja");
      if ((idKey && seenIds.has(idKey)) || seenTexts.has(textKey)) continue;
      if (idKey) seenIds.add(idKey);
      seenTexts.add(textKey);
      merged.push(item);
    }
  }

  return merged;
}

function getLegacyConceptMemoPaths(extraPaths = []) {
  const paths = new Set(
    (Array.isArray(extraPaths) ? extraPaths : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );

  const singlePath = getConceptMemosPathForSingle();
  if (singlePath) paths.add(singlePath);

  if (!isSingleMode()) {
    for (const work of listWorkDirectories()) {
      const filePath = getConceptMemosPathForWork(work?.fsPath || "");
      if (filePath) paths.add(filePath);
    }
  }

  return [...paths];
}

async function readLegacyCommonTodoGroups(extraPaths = []) {
  const groups = [];

  for (const filePath of getLegacyConceptMemoPaths(extraPaths)) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const data = JSON.parse(raw);
      if (Array.isArray(data?.commonTodoItems)) {
        groups.push(data.commonTodoItems);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") {
        console.warn("[mojigoto] common TODO migration read failed:", filePath, error);
      }
    }
  }

  return groups;
}

async function writeCommonTodoItems(items) {
  const filePath = getCommonTodoFilePath();
  if (!filePath) {
    throw new Error("作品共通TODOの保存先を取得できませんでした。");
  }

  const payload = {
    version: 1,
    updatedAt: getNowIsoString(),
    items: normalizeCommonTodoItems(items),
  };

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  return payload.items;
}

async function readCommonTodoItems(options = {}) {
  const filePath = getCommonTodoFilePath();
  if (!filePath) return [];

  try {
    const raw = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(raw);
    return normalizeCommonTodoItems(data?.items);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const legacyGroups = await readLegacyCommonTodoGroups(
    options?.legacyConceptMemoPaths,
  );
  const migratedItems = mergeCommonTodoItems(legacyGroups);
  await writeCommonTodoItems(migratedItems);
  return migratedItems;
}

module.exports = {
  getCommonTodoFilePath,
  normalizeCommonTodoItems,
  readCommonTodoItems,
  writeCommonTodoItems,
};
