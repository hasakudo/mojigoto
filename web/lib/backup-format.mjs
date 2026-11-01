export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_INDEX_FILE = "index.json";
export const BACKUP_FOLDER = "backups";
export const BACKUP_SNAPSHOT_FOLDER = "snapshots";
export const BACKUP_AUTO_INTERVAL_MS = 30 * 60 * 1000;
export const BACKUP_RETENTION_DAYS = 90;
export const BACKUP_MAX_PER_FILE = 50;
const BACKUP_TARGET_TYPES = new Set(["manuscript", "note", "conceptMemo"]);

export function normalizeBackupSummary(value, targetType) {
  const keys = targetType === "note" ? ["groups", "dividers", "items"]
    : targetType === "conceptMemo" ? ["memos"] : [];
  if (!keys.length || !value || keys.some((key) => !Number.isSafeInteger(value[key]) || value[key] < 0)) return null;
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}

export function summarizeBackupContent(content, targetType) {
  if (!["note", "conceptMemo"].includes(targetType)) return null;
  try {
    const value = JSON.parse(String(content ?? "").replace(/^\uFEFF/, ""));
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const isObject = (entry) => entry && typeof entry === "object" && !Array.isArray(entry);
    if (targetType === "conceptMemo") {
      return Array.isArray(value.memos) ? { memos: value.memos.filter(isObject).length } : null;
    }
    if (!Array.isArray(value.groups)) {
      return Array.isArray(value.sections) ? { groups: 1, dividers: 0, items: value.sections.filter(isObject).length } : null;
    }
    const groups = value.groups.filter(isObject);
    const items = groups.flatMap((group) => Array.isArray(group.items) ? group.items.filter(isObject) : []);
    return { groups: groups.length, dividers: items.filter((item) => item.kind === "divider").length,
      items: items.filter((item) => item.kind !== "divider").length };
  } catch {
    return null;
  }
}

export function backupContentLabel(entry) {
  const summary = normalizeBackupSummary(entry.contentSummary, entry.targetType);
  const number = (value) => value.toLocaleString("ja-JP");
  if (entry.targetType === "note") return summary
    ? `大分類 ${number(summary.groups)}・区分 ${number(summary.dividers)}・項目 ${number(summary.items)}`
    : "ノート（件数未記録）";
  if (entry.targetType === "conceptMemo") return summary
    ? `作品全体のメモ ${number(summary.memos)}件` : "構想メモ全体（件数未記録）";
  return `${number(Math.max(0, Number(entry.characters) || 0))}文字`;
}

export function normalizeBackupPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

export function emptyBackupIndex() {
  return { schemaVersion: BACKUP_SCHEMA_VERSION, updatedAt: "", snapshots: [] };
}

export function normalizeBackupTargetType(value) {
  return BACKUP_TARGET_TYPES.has(value) ? value : "manuscript";
}

export function normalizeBackupIndex(value) {
  const source = value && typeof value === "object" ? value : {};
  const snapshots = Array.isArray(source.snapshots) ? source.snapshots : [];
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    updatedAt: String(source.updatedAt || ""),
    snapshots: snapshots.map((entry) => ({
      id: String(entry?.id || ""),
      targetType: normalizeBackupTargetType(entry?.targetType),
      relativePath: normalizeBackupPath(entry?.relativePath),
      fileName: String(entry?.fileName || ""),
      createdAt: String(entry?.createdAt || ""),
      source: entry?.source === "vscode" ? "vscode" : "web",
      reason: ["manual", "automatic", "before-restore", "before-import"].includes(entry?.reason) ? entry.reason : "manual",
      protected: entry?.protected === true,
      contentHash: String(entry?.contentHash || ""),
      characters: Math.max(0, Number(entry?.characters || 0)),
      ...(normalizeBackupSummary(entry?.contentSummary, entry?.targetType)
        ? { contentSummary: normalizeBackupSummary(entry.contentSummary, entry.targetType) } : {}),
      snapshotFile: String(entry?.snapshotFile || ""),
    })).filter((entry) => entry.id && entry.relativePath && entry.snapshotFile),
  };
}

export async function hashBackupContent(value) {
  const text = String(value ?? "");
  if (globalThis.crypto?.subtle) {
    const data = new TextEncoder().encode(text);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  let hash = 2166136261;
  for (const character of text) hash = Math.imul(hash ^ character.codePointAt(0), 16777619);
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function createBackupId(createdAt = new Date().toISOString(), suffix = "") {
  const stamp = String(createdAt).replace(/\D/g, "").slice(0, 17);
  const tail = String(suffix || Math.random().toString(36).slice(2, 8)).replace(/[^a-z0-9]/gi, "").slice(0, 12);
  return `${stamp}-${tail || "snapshot"}`;
}

export function createBackupSnapshot({ id, targetType = "manuscript", relativePath, fileName, createdAt, source, reason, content, contentHash }) {
  const normalizedContent = String(content ?? "");
  const contentSummary = summarizeBackupContent(normalizedContent, targetType);
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    id: String(id),
    targetType: normalizeBackupTargetType(targetType),
    relativePath: normalizeBackupPath(relativePath),
    fileName: String(fileName || ""),
    createdAt: String(createdAt),
    source: source === "vscode" ? "vscode" : "web",
    reason: ["automatic", "before-restore", "before-import"].includes(reason) ? reason : "manual",
    protected: false,
    contentHash: String(contentHash || ""),
    characters: [...normalizedContent].length,
    ...(contentSummary ? { contentSummary } : {}),
    content: normalizedContent,
  };
}

export function backupIndexEntry(snapshot) {
  return {
    id: snapshot.id,
    targetType: normalizeBackupTargetType(snapshot.targetType),
    relativePath: snapshot.relativePath,
    fileName: snapshot.fileName,
    createdAt: snapshot.createdAt,
    source: snapshot.source,
    reason: snapshot.reason,
    protected: snapshot.protected === true,
    contentHash: snapshot.contentHash,
    characters: snapshot.characters,
    ...(normalizeBackupSummary(snapshot.contentSummary, snapshot.targetType)
      ? { contentSummary: normalizeBackupSummary(snapshot.contentSummary, snapshot.targetType) } : {}),
    snapshotFile: `${snapshot.id}.json`,
  };
}

export async function rebuildBackupIndex(snapshotValues, updatedAt = new Date().toISOString()) {
  const snapshots = [];
  for (const snapshot of Array.isArray(snapshotValues) ? snapshotValues : []) {
    if (!snapshot || typeof snapshot !== "object") continue;
    if (!String(snapshot.id || "") || !normalizeBackupPath(snapshot.relativePath) || !String(snapshot.createdAt || "")) continue;
    const normalized = createBackupSnapshot({
      ...snapshot,
      targetType: snapshot.targetType,
      content: snapshot.content,
    });
    normalized.protected = snapshot.protected === true;
    if (!normalized.contentHash) normalized.contentHash = await hashBackupContent(normalized.content);
    snapshots.push(backupIndexEntry(normalized));
  }
  snapshots.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return { schemaVersion: BACKUP_SCHEMA_VERSION, updatedAt: String(updatedAt || ""), snapshots };
}

export function planBackupRetention(indexValue, {
  now = Date.now(),
  retentionDays = BACKUP_RETENTION_DAYS,
  maxPerFile = BACKUP_MAX_PER_FILE,
} = {}) {
  const index = normalizeBackupIndex(indexValue);
  const cutoff = Number(now) - Math.max(0, Number(retentionDays) || 0) * 24 * 60 * 60 * 1000;
  const removed = [];
  const retained = [];
  const perFileCounts = new Map();
  const ordered = [...index.snapshots].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  for (const entry of ordered) {
    if (entry.protected) {
      retained.push(entry);
      continue;
    }
    const created = Date.parse(entry.createdAt);
    const expiredAutomatic = entry.reason === "automatic" && Number.isFinite(created) && created < cutoff;
    const retentionKey = `${entry.targetType}:${entry.relativePath}`;
    const count = perFileCounts.get(retentionKey) || 0;
    if (expiredAutomatic || count >= Math.max(1, Number(maxPerFile) || BACKUP_MAX_PER_FILE)) {
      removed.push(entry);
      continue;
    }
    perFileCounts.set(retentionKey, count + 1);
    retained.push(entry);
  }
  return {
    index: { ...index, snapshots: retained },
    removed,
  };
}
