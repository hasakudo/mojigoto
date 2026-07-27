const fs = require("fs/promises");
const path = require("path");

function getNowIsoString() {
  return new Date().toISOString();
}

function createEmptyWritingMemos() {
  return {
    version: 1,
    updatedAt: getNowIsoString(),
    memos: [],
  };
}

function normalizeWritingMemo(memo = {}) {
  const now = getNowIsoString();
  const status = String(memo?.status || "active").trim();

  return {
    id:
      String(memo?.id || "").trim() ||
      `wm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    filePath: String(memo?.filePath || "").trim(),
    fileName: String(memo?.fileName || "").trim(),
    startLine: Number.isFinite(Number(memo?.startLine))
      ? Number(memo.startLine)
      : 0,
    startCharacter: Number.isFinite(Number(memo?.startCharacter))
      ? Number(memo.startCharacter)
      : 0,
    endLine: Number.isFinite(Number(memo?.endLine)) ? Number(memo.endLine) : 0,
    endCharacter: Number.isFinite(Number(memo?.endCharacter))
      ? Number(memo.endCharacter)
      : 0,
    excerpt: String(memo?.excerpt || ""),
    body: String(memo?.body || ""),
    status:
      status === "done" || status === "hold" || status === "active"
        ? status
        : "active",
    isArchived: Boolean(memo?.isArchived),
    tags: Array.isArray(memo?.tags)
      ? memo.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
      : [],
    createdAt: String(memo?.createdAt || now),
    updatedAt: String(memo?.updatedAt || now),
  };
}

function normalizeWritingMemos(data) {
  return {
    version: Number(data?.version || 1),
    updatedAt: data?.updatedAt || getNowIsoString(),
    memos: Array.isArray(data?.memos)
      ? data.memos.map((memo) => normalizeWritingMemo(memo))
      : [],
  };
}

async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function readWritingMemos(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return normalizeWritingMemos(JSON.parse(raw));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return createEmptyWritingMemos();
    }
    throw error;
  }
}

async function writeWritingMemos(filePath, data) {
  const nextData = normalizeWritingMemos({
    ...data,
    updatedAt: getNowIsoString(),
  });

  await ensureParentDir(filePath);
  await fs.writeFile(filePath, JSON.stringify(nextData, null, 2), "utf8");
  return nextData;
}

function createWritingMemoDraft(input = {}) {
  const now = getNowIsoString();
  const filePath = String(input?.filePath || "").trim();

  return normalizeWritingMemo({
    id: `wm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    filePath,
    fileName:
      String(input?.fileName || "").trim() ||
      (filePath ? path.basename(filePath) : ""),
    startLine: Number(input?.startLine || 0),
    startCharacter: Number(input?.startCharacter || 0),
    endLine: Number(input?.endLine || 0),
    endCharacter: Number(input?.endCharacter || 0),
    excerpt: String(input?.excerpt || ""),
    body: String(input?.body || ""),
    status: String(input?.status || "active"),
    tags: Array.isArray(input?.tags) ? input.tags : [],
    createdAt: now,
    updatedAt: now,
  });
}

module.exports = {
  getNowIsoString,
  createEmptyWritingMemos,
  normalizeWritingMemo,
  normalizeWritingMemos,
  readWritingMemos,
  writeWritingMemos,
  createWritingMemoDraft,
};