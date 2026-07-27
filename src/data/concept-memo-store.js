const fs = require("fs/promises");
const path = require("path");

function getNowIsoString() {
  return new Date().toISOString();
}

function createEmptyConceptMemos() {
  return {
    version: 1,
    updatedAt: getNowIsoString(),
    memos: [],
  };
}

function normalizeConceptMemos(data) {
  return {
    version: Number(data?.version || 1),
    updatedAt: data?.updatedAt || new Date().toISOString(),
    memos: Array.isArray(data?.memos) ? data.memos : [],
  };
}

async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function readConceptMemos(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return normalizeConceptMemos(JSON.parse(raw));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return createEmptyConceptMemos();
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
  await fs.writeFile(filePath, JSON.stringify(nextData, null, 2), "utf8");
  return nextData;
}

function createConceptMemoDraft(overrides = {}) {
  const now = getNowIsoString();

  return {
    id: `memo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    type: "text",
    title: "",
    body: "",
    listItems: [],
    todoItems: [],
    tags: [],
    isPinned: false,
    isArchived: false,
    showInDashboard: false,
    createdAt: now,
    updatedAt: now,
    order: 0,
    source: null,
    ...overrides,
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

  const existingIndex = memos.findIndex((memo) =>
    isSameNoteItemSource(memo, input),
  );

  if (existingIndex >= 0) {
    const current = memos[existingIndex] || {};

    const updatedMemo = {
      ...current,
      title: String(input?.heading || "").trim() || "無題メモ",
      body: String(input?.memoBody || ""),
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

  const createdMemo = createConceptMemoDraft({
    title: String(input?.heading || "").trim() || "無題メモ",
    body: String(input?.memoBody || ""),
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
  normalizeConceptMemos,
  readConceptMemos,
  writeConceptMemos,
  createConceptMemoDraft,
  createConceptMemoFromNoteItem,
  updateConceptMemoSourceStatus,
  markConceptMemosMissingByNotePath,
};
