const fs = require("fs/promises");
const path = require("path");
const { isSingleMode } = require("../core/mojigoto-context");
const {
  getMojigotoDirForSingle,
  getMojigotoDirForWork,
} = require("../core/mojigoto-paths");
const { getTemplateById } = require("./note-templates");
const { makeId } = require("../core/path-utils");

async function ensureDir(dirPath) {
  if (!dirPath) return;
  await fs.mkdir(dirPath, { recursive: true });
}

function slugify(input) {
  const s = String(input || "")
    .trim()
    .toLowerCase();
  if (!s) return "note";
  return (
    s
      .replace(/[^\p{L}\p{N}\-_]+/gu, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "note"
  );
}

function createDefaultItemMemo() {
  return {
    type: "text",
    body: "",
    updatedAt: "",
    tags: [],
    linkedConceptMemoIds: [],
    autoSyncToConceptMemo: false,
    conceptMemoSyncedAt: "",
  };
}

function normalizeNoteOrder(value) {
  if (value === null || value === undefined || value === "") return null;
  const order = Number(value);
  return Number.isFinite(order) ? order : null;
}

function createDefaultEntry() {
  return {
    id: makeId("item"),
    kind: "entry",
    heading: "",
    headingRuby: "",
    body: "",
    memo: createDefaultItemMemo(),
  };
}

function createDefaultDivider() {
  return {
    id: makeId("div"),
    kind: "divider",
    label: "",
    value: "",
  };
}

function createDefaultGroup() {
  return {
    id: makeId("grp"),
    title: "",
    items: [],
    images: [],
  };
}

function createDefaultNote(type, title = "") {
  return {
    schemaVersion: 3,
    id: makeId(type),
    type,
    title: String(title || "").trim(),
    order: null,
    groups: [createDefaultGroup()],
    updatedAt: "",
  };
}

function normalizeGroupsFromLegacy(parsed) {
  if (Array.isArray(parsed?.groups)) {
    return parsed.groups.map((group) => normalizeGroup(group));
  }

  if (Array.isArray(parsed?.sections)) {
    return [
      {
        id: makeId("grp"),
        title: "",
        items: parsed.sections
          .map((sec) =>
            normalizeItem({
              id: sec?.id,
              kind: "entry",
              heading: sec?.heading,
              body: sec?.body,
            }),
          )
          .filter(Boolean),
        images: [],
      },
    ];
  }

  return [createDefaultGroup()];
}

async function resolveNoteBaseDir(type, item) {
  if (isSingleMode()) {
    const base = getMojigotoDirForSingle();
    await ensureDir(base);
    const dir = path.join(base, type === "plot" ? "plots" : "references");
    await ensureDir(dir);
    return dir;
  }

  const workDir = item?.fsPath || "";
  const base = getMojigotoDirForWork(workDir);
  await ensureDir(base);
  const dir = path.join(base, type === "plot" ? "plots" : "references");
  await ensureDir(dir);
  return dir;
}

async function listNoteFiles(type, item) {
  const dir = await resolveNoteBaseDir(type, item);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".json"))
      .map((e) => ({
        name: e.name,
        fsPath: path.join(dir, e.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ja", { numeric: true }));
  } catch {
    return [];
  }
}

async function readNoteFile(filePath, fallbackType = "plot") {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);

  return {
    schemaVersion: 3,
    id: String(parsed?.id || makeId(fallbackType)),
    type: String(parsed?.type || fallbackType),
    title: String(parsed?.title || ""),
    order: normalizeNoteOrder(parsed?.order),
    groups: normalizeGroupsFromLegacy(parsed),
    updatedAt: String(parsed?.updatedAt || ""),
  };
}

async function listNotesWithMeta(type, item) {
  const files = await listNoteFiles(type, item);
  const results = [];

  for (const file of files) {
    const note = await readNoteFile(file.fsPath, type);
    results.push({
      name: file.name,
      fsPath: file.fsPath,
      title:
        String(note?.title || "").trim() || file.name.replace(/\.json$/i, ""),
      type,
      order: note.order,
      updatedAt: String(note?.updatedAt || ""),
    });
  }

  return results.sort((a, b) => {
    const orderA = Number.isFinite(a.order) ? a.order : null;
    const orderB = Number.isFinite(b.order) ? b.order : null;
    if (orderA !== null && orderB !== null && orderA !== orderB) {
      return orderA - orderB;
    }
    if (orderA !== null) return -1;
    if (orderB !== null) return 1;
    return a.title.localeCompare(b.title, "ja", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

async function createNewNote(type, item, title, templateId = "blank") {
  const dir = await resolveNoteBaseDir(type, item);
  const base = slugify(title || (type === "plot" ? "plot" : "reference"));
  let fileName = `${base}.json`;
  let filePath = path.join(dir, fileName);
  let index = 2;

  while (true) {
    try {
      await fs.access(filePath);
      fileName = `${base}-${index}.json`;
      filePath = path.join(dir, fileName);
      index += 1;
    } catch {
      break;
    }
  }

  const note = createDefaultNote(type, title);
  const existingNotes = await listNotesWithMeta(type, item);
  const hasCompleteCustomOrder =
    existingNotes.length > 0 &&
    existingNotes.every((entry) => Number.isFinite(entry.order));
  note.order = hasCompleteCustomOrder
    ? Math.max(
        ...existingNotes.map((entry, index) =>
          Number.isFinite(entry.order) ? entry.order : index,
        ),
      ) + 1
    : existingNotes.length
      ? null
      : 0;
  const template = await getTemplateById(type, templateId);

  if (template) {
    note.groups = cloneTemplateGroups(template.groups);
  }

  note.updatedAt = new Date().toISOString();

  await fs.writeFile(filePath, JSON.stringify(note, null, 2), "utf8");

  return {
    filePath,
    note,
  };
}

function normalizeItem(item) {
  const kind = String(item?.kind || "entry");

  if (kind === "divider") {
    return {
      id: String(item?.id || makeId("div")),
      kind: "divider",
      label: String(item?.label || ""),
      value: String(item?.value || ""),
    };
  }

  return {
    id: String(item?.id || makeId("item")),
    kind: "entry",
    heading: String(item?.heading || ""),
    headingRuby: String(item?.headingRuby || ""),
    body: String(item?.body || ""),
    memo: normalizeItemMemo(item?.memo),
  };
}

function normalizeItemMemo(memo) {
  return {
    type: String(memo?.type || "text") === "list" ? "list" : "text",
    body: String(memo?.body || ""),
    updatedAt: String(memo?.updatedAt || ""),
    tags: Array.isArray(memo?.tags)
      ? memo.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
      : [],
    linkedConceptMemoIds: Array.isArray(memo?.linkedConceptMemoIds)
      ? memo.linkedConceptMemoIds
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      : [],
    autoSyncToConceptMemo: Boolean(memo?.autoSyncToConceptMemo),
    conceptMemoSyncedAt: String(memo?.conceptMemoSyncedAt || ""),
  };
}

function normalizeGroupImages(images) {
  if (!Array.isArray(images)) return [];

  return images
    .map((image) => ({
      id: String(image?.id || makeId("img")),
      name: String(image?.name || image?.fileName || "画像"),
      fileName: String(image?.fileName || ""),
      relativePath: String(image?.relativePath || ""),
      createdAt: String(image?.createdAt || ""),
    }))
    .filter((image) => image.relativePath);
}

function normalizeGroup(group) {
  return {
    id: String(group?.id || makeId("grp")),
    title: String(group?.title || ""),
    items: Array.isArray(group?.items)
      ? group.items.map((item) => normalizeItem(item)).filter(Boolean)
      : [],
    images: normalizeGroupImages(group?.images),
  };
}

function cloneTemplateGroups(templateGroups) {
  if (!Array.isArray(templateGroups) || !templateGroups.length) {
    return [createDefaultGroup()];
  }

  return templateGroups.map((group) => ({
    id: makeId("grp"),
    title: String(group?.title || ""),
    items: Array.isArray(group?.items)
      ? group.items
          .map((item) =>
            normalizeItem({
              ...item,
              id: undefined,
            }),
          )
          .filter(Boolean)
      : [],
    images: [],
  }));
}

async function saveNoteFile(filePath, data) {
  const payload = {
    schemaVersion: 3,
    id: String(data?.id || makeId(data?.type || "note")),
    type: String(data?.type || "plot"),
    title: String(data?.title || "").trim(),
    order: normalizeNoteOrder(data?.order),
    groups:
      Array.isArray(data?.groups) && data.groups.length
        ? data.groups.map((group) => normalizeGroup(group))
        : [createDefaultGroup()],
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

async function moveNoteInOrder(type, item, filePath, direction) {
  const notes = await listNotesWithMeta(type, item);
  const normalizedPath = path.normalize(String(filePath || ""));
  const currentIndex = notes.findIndex(
    (entry) => path.normalize(entry.fsPath) === normalizedPath,
  );
  if (currentIndex < 0) return false;

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= notes.length) return false;

  [notes[currentIndex], notes[targetIndex]] = [
    notes[targetIndex],
    notes[currentIndex],
  ];

  await Promise.all(
    notes.map(async (entry, order) => {
      const raw = await fs.readFile(entry.fsPath, "utf8");
      const parsed = JSON.parse(raw);
      parsed.order = order;
      await fs.writeFile(entry.fsPath, JSON.stringify(parsed, null, 2), "utf8");
    }),
  );

  return true;
}

async function applyConceptMemoToNoteItem(input) {
  const notePath = String(input?.notePath || "").trim();
  const noteType = String(input?.noteType || "plot").trim() || "plot";
  const groupId = String(input?.groupId || "").trim();
  const itemId = String(input?.itemId || "").trim();

  if (!notePath || !groupId || !itemId) {
    throw new Error("反映先のノート情報が不足しています。");
  }

  const note = await readNoteFile(notePath, noteType);
  const groups = Array.isArray(note?.groups) ? note.groups : [];
  const group = groups.find((entry) => String(entry?.id || "") === groupId);

  if (!group) {
    throw new Error("反映先の大分類が見つかりません。");
  }

  const items = Array.isArray(group.items) ? group.items : [];
  const item = items.find((entry) => String(entry?.id || "") === itemId);

  if (!item || String(item?.kind || "entry") !== "entry") {
    throw new Error("反映先の項目が見つかりません。");
  }

  const currentMemo =
    item.memo && typeof item.memo === "object"
      ? normalizeItemMemo(item.memo)
      : createDefaultItemMemo();

  const memoId = String(input?.memoId || "").trim();
  const nextLinkedIds = Array.isArray(currentMemo.linkedConceptMemoIds)
    ? [...currentMemo.linkedConceptMemoIds]
    : [];

  if (memoId && !nextLinkedIds.includes(memoId)) {
    nextLinkedIds.push(memoId);
  }

  item.memo = {
    ...currentMemo,
    type: String(input?.memoType || "text") === "list" ? "list" : "text",
    body: String(input?.memoBody || ""),
    updatedAt: new Date().toISOString(),
    tags: Array.isArray(input?.memoTags)
      ? input.memoTags.map((tag) => String(tag || "").trim()).filter(Boolean)
      : [],
    linkedConceptMemoIds: nextLinkedIds,
  };

  const saved = await saveNoteFile(notePath, {
    ...note,
    groups,
  });

  return {
    note: saved,
    groupId,
    itemId,
  };
}

async function deleteNoteFile(filePath) {
  if (!filePath) return false;

  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  createDefaultItemMemo,
  createDefaultNote,
  createDefaultGroup,
  createDefaultEntry,
  createDefaultDivider,
  resolveNoteBaseDir,
  listNoteFiles,
  listNotesWithMeta,
  readNoteFile,
  createNewNote,
  saveNoteFile,
  moveNoteInOrder,
  deleteNoteFile,
  applyConceptMemoToNoteItem,
};
