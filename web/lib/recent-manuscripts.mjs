import { safeDriveItemSnapshot } from "./work-discovery.mjs";

export function normalizeRecentManuscripts(entries, scope) {
  if (!Array.isArray(entries) || !scope?.cloudKind || !scope.rootId || !scope.workId) return [];
  const valid = entries.filter((entry) => entry?.cloudKind === scope.cloudKind
    && entry.rootId === scope.rootId && entry.workId === scope.workId
    && entry.item?.id && !entry.item.folder && entry.folder?.id
    && typeof entry.editedAt === "string" && Number.isFinite(Date.parse(entry.editedAt))
    && Array.isArray(entry.trail) && entry.trail.every((folder) => folder?.id)
    && (entry.trail.length ? entry.trail.at(-1).id === entry.folder.id : entry.folder.id === scope.manuscriptId))
    .sort((a, b) => Date.parse(b.editedAt) - Date.parse(a.editedAt));
  const seen = new Set();
  return valid.filter((entry) => {
    if (seen.has(entry.item.id)) return false;
    seen.add(entry.item.id);
    return true;
  }).slice(0, 5).map((entry) => ({
    cloudKind: entry.cloudKind, rootId: entry.rootId, workId: entry.workId,
    item: safeDriveItemSnapshot(entry.item), folder: safeDriveItemSnapshot(entry.folder),
    trail: entry.trail.map(safeDriveItemSnapshot), editedAt: entry.editedAt,
  }));
}

export function updateRecentManuscripts(entries, entry, scope) {
  return normalizeRecentManuscripts([entry, ...(Array.isArray(entries) ? entries : [])], scope);
}

export function manuscriptParentMatches(item, folder) {
  const parent = item?.parentReference?.id || item?.parents?.[0];
  if (!parent) return true;
  return [folder?.id, folder?.path_lower, folder?.path_display?.toLowerCase()].filter(Boolean).includes(parent);
}
