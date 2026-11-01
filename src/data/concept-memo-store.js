const fs = require("fs/promises");
const path = require("path");
const { storageRevision, writeStructuredFile } = require("./structured-file-write");
const {
  createSyncConflictError,
  hasSyncConflict,
  noteMemoPayload,
  notePayloadFromConcept,
  syncFingerprint,
} = require("./concept-sync");

function getNowIsoString() {
  return new Date().toISOString();
}

function createDefaultConceptMemoFolders() {
  return [
    { id: "writing", name: "執筆メモ", order: 0 },
    { id: "note-item", name: "項目メモ", order: 1 },
    { id: "dialogue", name: "台詞", order: 2 },
    { id: "review", name: "要確認", order: 3 },
  ];
}

function createEmptyConceptMemos() {
  return {
    version: 1,
    updatedAt: getNowIsoString(),
    memos: [],
    folders: createDefaultConceptMemoFolders(),
    commonTodoItems: [],
    autoSyncToNoteItemDefault: false,
  };
}

function normalizeMemoFolderIds(memo = {}) {
  const source = Array.isArray(memo?.folderIds)
    ? memo.folderIds
    : [memo?.folderId];
  return source
    .map((folderId) => String(folderId || "").trim())
    .filter(Boolean)
    .filter((folderId, index, values) => values.indexOf(folderId) === index);
}

function normalizeConceptMemos(data) {
  const folders = Array.isArray(data?.folders)
    ? data.folders
        .map((folder, index) => ({
          id: String(folder?.id || "").trim(),
          name: String(folder?.name || "").trim(),
          order: Number.isFinite(Number(folder?.order)) ? Number(folder.order) : index,
        }))
        .filter((folder) => folder.id && folder.name)
    : createDefaultConceptMemoFolders();

  return {
    version: Number(data?.version || 1),
    updatedAt: data?.updatedAt || new Date().toISOString(),
    memos: Array.isArray(data?.memos)
      ? data.memos.map((memo) => {
          const folderIds = normalizeMemoFolderIds(memo);
          return {
            ...memo,
            folderIds,
            folderId: folderIds[0] || "",
            ...(memo?.source && typeof memo.source === "object"
              ? {
                  source: {
                    ...memo.source,
                    ...(typeof memo.source.autoSyncToNoteItemOverride === "boolean"
                      ? { autoSyncToNoteItemOverride: memo.source.autoSyncToNoteItemOverride }
                      : {}),
                  },
                }
              : {}),
          };
        })
      : [],
    folders,
    commonTodoItems: Array.isArray(data?.commonTodoItems)
      ? data.commonTodoItems
      : [],
    autoSyncToNoteItemDefault: Boolean(data?.autoSyncToNoteItemDefault),
  };
}

async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function readConceptMemos(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return { ...normalizeConceptMemos(JSON.parse(raw)), storageRevision: storageRevision(raw) };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { ...createEmptyConceptMemos(), storageRevision: "missing" };
    }
    throw error;
  }
}

async function writeConceptMemos(filePath, data) {
  const nextData = normalizeConceptMemos({
    ...data,
    updatedAt: getNowIsoString(),
  });

  await ensureParentDir(filePath);
  return writeStructuredFile(filePath, nextData, data?.storageRevision);
}

function createConceptMemoDraft(overrides = {}) {
  const now = getNowIsoString();
  const folderIds = normalizeMemoFolderIds(overrides);

  return {
    id: `memo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    type: "text",
    title: "",
    body: "",
    listItems: [],
    todoItems: [],
    tags: [],
    folderIds,
    folderId: folderIds[0] || "",
    isPinned: false,
    isArchived: false,
    showInDashboard: false,
    createdAt: now,
    updatedAt: now,
    order: 0,
    source: null,
    ...overrides,
    folderIds,
    folderId: folderIds[0] || "",
  };
}

function isSameNoteItemSource(memo, input = {}) {
  const source = memo?.source || {};
  return (
    String(source?.kind || "") === "noteItem" &&
    String(source?.notePath || "") === String(input?.notePath || "") &&
    String(source?.groupId || "") === String(input?.groupId || "") &&
    String(source?.itemId || "") === String(input?.itemId || "")
  );
}

function normalizeMemoTags(tags) {
  return Array.isArray(tags)
    ? tags.map((tag) => String(tag || "").trim()).filter(Boolean)
    : [];
}

async function createConceptMemoFromNoteItem(filePath, input = {}) {
  const data = await readConceptMemos(filePath);
  const now = getNowIsoString();
  const memos = Array.isArray(data.memos) ? [...data.memos] : [];
  const noteItemFolderId = Array.isArray(data.folders) &&
    data.folders.some((folder) => folder?.id === "note-item")
    ? "note-item"
    : "";

  // A matching item address can belong to an older, detached memo. Prefer
  // the note's current reverse link, and never revive cleared/missing copies.
  const isActive = (memo) => !["cleared", "missing"].includes(memo?.source?.status);
  const linkedIndex = memos.findIndex((memo) =>
    isActive(memo) && (Array.isArray(input?.linkedConceptMemoIds)
        && input.linkedConceptMemoIds.includes(memo.id)
        && memo.source?.kind === "noteItem"
        && String(memo.source.itemId || "") === String(input?.itemId || "")),
  );
  const hasLinkedIds = Array.isArray(input?.linkedConceptMemoIds) && input.linkedConceptMemoIds.length > 0;
  const existingIndex = hasLinkedIds ? linkedIndex
    : memos.findIndex((memo) => isActive(memo) && isSameNoteItemSource(memo, input));

  if (existingIndex >= 0) {
    const current = memos[existingIndex] || {};

    const memoBody = String(input?.memoBody || "");
    const memoType = String(input?.memoType || "text") === "list" ? "list" : "text";
    const incomingPayload = noteMemoPayload({ type: memoType, body: memoBody, tags: input?.memoTags });
    const incomingFingerprint = String(input?.syncFingerprint || "") || syncFingerprint(incomingPayload);
    const currentFingerprint = syncFingerprint(notePayloadFromConcept(current));
    const baseline = String(input?.baseSyncFingerprint || current?.source?.syncFingerprint || "");
    if (input?.forceOverwrite !== true && hasSyncConflict(currentFingerprint, incomingFingerprint, baseline, input?.requireSyncBaseline)) {
      throw createSyncConflictError();
    }
    const currentFolderIds = normalizeMemoFolderIds(current);
    const folderIds = currentFolderIds.length
      ? currentFolderIds
      : [noteItemFolderId].filter(Boolean);
    const updatedMemo = {
      ...current,
      folderIds,
      folderId: folderIds[0] || "",
      type: memoType,
      title: String(input?.heading || "").trim() || "無題メモ",
      ...(memoType === "list"
        ? {
            listItems: memoBody
              .split(/\r?\n/)
              .map((text, index) => ({
                id: `li_${Date.now()}_${index}`,
                text: text.trim(),
                checked: false,
              }))
              .filter((item) => item.text),
          }
        : { body: memoBody }),
      tags: normalizeMemoTags(input?.memoTags),
      updatedAt: now,
      source: {
        kind: "noteItem",
        notePath: String(input?.notePath || ""),
        noteType: String(input?.noteType || ""),
        noteTitle: String(input?.noteTitle || ""),
        groupId: String(input?.groupId || ""),
        groupTitle: String(input?.groupTitle || ""),
        itemId: String(input?.itemId || ""),
        itemHeading: String(input?.heading || ""),
        autoSyncToConceptMemo: Boolean(input?.autoSyncToConceptMemo),
        syncFingerprint: incomingFingerprint,
        ...(typeof current?.source?.autoSyncToNoteItem === "boolean"
          ? { autoSyncToNoteItem: current.source.autoSyncToNoteItem }
          : data?.autoSyncToNoteItemDefault
            ? { autoSyncToNoteItem: true }
            : {}),
        ...(typeof current?.source?.autoSyncToNoteItemOverride === "boolean"
          ? { autoSyncToNoteItemOverride: current.source.autoSyncToNoteItemOverride }
          : {}),
        status: "active",
      },
    };

    memos[existingIndex] = updatedMemo;

    const nextData = await writeConceptMemos(filePath, {
      ...data,
      memos,
    });

    return {
      memo: updatedMemo,
      data: nextData,
      mode: "updated",
    };
  }

  const nextOrder =
    memos.reduce((max, memo) => {
      const value = Number(memo?.order || 0);
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, 0) + 1;

  const memoBody = String(input?.memoBody || "");
  const memoType = String(input?.memoType || "text") === "list" ? "list" : "text";
  const incomingPayload = noteMemoPayload({ type: memoType, body: memoBody, tags: input?.memoTags });
  const incomingFingerprint = String(input?.syncFingerprint || "") || syncFingerprint(incomingPayload);
  const createdMemo = createConceptMemoDraft({
    folderIds: [noteItemFolderId].filter(Boolean),
    folderId: noteItemFolderId,
    type: memoType,
    title: String(input?.heading || "").trim() || "無題メモ",
    body: memoType === "text" ? memoBody : "",
    listItems:
      memoType === "list"
        ? memoBody
            .split(/\r?\n/)
            .map((text, index) => ({
              id: `li_${Date.now()}_${index}`,
              text: text.trim(),
              checked: false,
            }))
            .filter((item) => item.text)
        : [],
    tags: normalizeMemoTags(input?.memoTags),
    createdAt: now,
    updatedAt: now,
    order: nextOrder,
    source: {
      kind: "noteItem",
      notePath: String(input?.notePath || ""),
      noteType: String(input?.noteType || ""),
      noteTitle: String(input?.noteTitle || ""),
      groupId: String(input?.groupId || ""),
      groupTitle: String(input?.groupTitle || ""),
      itemId: String(input?.itemId || ""),
      itemHeading: String(input?.heading || ""),
      autoSyncToConceptMemo: Boolean(input?.autoSyncToConceptMemo),
      syncFingerprint: incomingFingerprint,
      ...(data?.autoSyncToNoteItemDefault
        ? { autoSyncToNoteItem: true }
        : {}),
      status: "active",
    },
  });

  const nextData = await writeConceptMemos(filePath, {
    ...data,
    memos: [...memos, createdMemo],
  });

  return {
    memo: createdMemo,
    data: nextData,
    mode: "created",
  };
}

async function updateConceptMemoSourceStatus(filePath, memoId, status) {
  const data = await readConceptMemos(filePath);
  const memos = Array.isArray(data.memos) ? [...data.memos] : [];

  const index = memos.findIndex(
    (memo) => String(memo?.id || "") === String(memoId || ""),
  );
  if (index < 0) {
    return {
      updated: false,
      data,
    };
  }

  const current = memos[index] || {};
  memos[index] = {
    ...current,
    updatedAt: getNowIsoString(),
    source: {
      ...(current?.source || {}),
      status: String(status || "active"),
    },
  };

  const nextData = await writeConceptMemos(filePath, {
    ...data,
    memos,
  });

  return {
    updated: true,
    data: nextData,
    memo: memos[index],
  };
}

async function updateConceptMemoSourceAutoSync(filePath, input = {}) {
  const data = await readConceptMemos(filePath);
  const memos = Array.isArray(data.memos) ? [...data.memos] : [];
  const enabled = Boolean(input?.autoSyncToConceptMemo);
  const now = getNowIsoString();
  let updatedCount = 0;

  for (let index = 0; index < memos.length; index++) {
    const memo = memos[index] || {};
    if (!isSameNoteItemSource(memo, input)) {
      continue;
    }

    const source = memo.source || {};
    if (Boolean(source.autoSyncToConceptMemo) === enabled) {
      continue;
    }

    memos[index] = {
      ...memo,
      updatedAt: now,
      source: {
        ...source,
        autoSyncToConceptMemo: enabled,
      },
    };
    updatedCount++;
  }

  if (!updatedCount) {
    return { updated: 0, data };
  }

  const nextData = await writeConceptMemos(filePath, {
    ...data,
    memos,
  });

  return { updated: updatedCount, data: nextData };
}

async function markConceptMemosMissingByNotePath(filePath, notePath) {
  if (!filePath || !notePath) {
    return { updated: 0 };
  }

  const data = await readConceptMemos(filePath);
  const memos = Array.isArray(data.memos) ? [...data.memos] : [];

  let updatedCount = 0;
  const now = getNowIsoString();

  for (let i = 0; i < memos.length; i++) {
    const memo = memos[i] || {};
    const source = memo?.source || {};

    if (
      source.kind === "noteItem" &&
      String(source.notePath || "") === String(notePath)
    ) {
      memos[i] = {
        ...memo,
        updatedAt: now,
        source: {
          ...source,
          status: "missing",
        },
      };
      updatedCount++;
    }
  }

  if (!updatedCount) {
    return { updated: 0 };
  }

  const nextData = await writeConceptMemos(filePath, {
    ...data,
    memos,
  });

  return {
    updated: updatedCount,
    data: nextData,
  };
}

module.exports = {
  getNowIsoString,
  createEmptyConceptMemos,
  normalizeMemoFolderIds,
  normalizeConceptMemos,
  readConceptMemos,
  writeConceptMemos,
  createConceptMemoDraft,
  createConceptMemoFromNoteItem,
  updateConceptMemoSourceStatus,
  updateConceptMemoSourceAutoSync,
  markConceptMemosMissingByNotePath,
};
