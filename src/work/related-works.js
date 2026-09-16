const path = require("path");

const {
  getSettingsPathForWork,
  listWorkDirectories,
} = require("../core/mojigoto-paths");
const { makeId } = require("../core/path-utils");
const {
  readSettingsFile,
  writeSettingsFile,
} = require("../data/settings-store");

function normalizeWorkIds(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map((id) => String(id || "").trim())
    .filter((id) => {
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

async function ensureWorkIdentity(work) {
  if (!work?.fsPath) return null;
  const settingsPath = getSettingsPathForWork(work.fsPath);
  const settings = await readSettingsFile(settingsPath, work);
  if (settings.workId) return { work, settings, settingsPath };

  const saved = await writeSettingsFile(settingsPath, {
    ...settings,
    folderName: settings.folderName || work.name || path.basename(work.fsPath),
    workId: makeId("work"),
  });
  return { work, settings: saved, settingsPath };
}

async function getRelatedWorkOptions(currentWork) {
  if (!currentWork?.fsPath) return [];
  const options = [];
  for (const work of listWorkDirectories()) {
    if (path.resolve(work.fsPath) === path.resolve(currentWork.fsPath)) continue;
    const entry = await ensureWorkIdentity(work);
    if (!entry?.settings?.workId) continue;
    options.push({
      id: entry.settings.workId,
      title: entry.settings.title || work.title || work.name,
      folderName: entry.settings.folderName || work.name,
      fsPath: work.fsPath,
    });
  }
  return options;
}

async function syncRelatedWorks(currentWork, selectedWorkIds) {
  if (!currentWork?.fsPath) return { workId: "", relatedWorkIds: [] };
  const currentEntry = await ensureWorkIdentity(currentWork);
  if (!currentEntry) return { workId: "", relatedWorkIds: [] };

  const selected = new Set(normalizeWorkIds(selectedWorkIds));
  const availableIds = new Set();
  for (const work of listWorkDirectories()) {
    if (path.resolve(work.fsPath) === path.resolve(currentWork.fsPath)) continue;
    const peer = await ensureWorkIdentity(work);
    if (!peer?.settings?.workId) continue;
    availableIds.add(peer.settings.workId);

    const peerRelations = new Set(normalizeWorkIds(peer.settings.relatedWorkIds));
    const shouldRelate = selected.has(peer.settings.workId);
    const isRelated = peerRelations.has(currentEntry.settings.workId);
    if (shouldRelate === isRelated) continue;

    if (shouldRelate) peerRelations.add(currentEntry.settings.workId);
    else peerRelations.delete(currentEntry.settings.workId);
    await writeSettingsFile(peer.settingsPath, {
      ...peer.settings,
      relatedWorkIds: [...peerRelations],
    });
  }

  const retainedUnavailable = normalizeWorkIds(
    currentEntry.settings.relatedWorkIds,
  ).filter((id) => !availableIds.has(id));
  const nextRelatedWorkIds = normalizeWorkIds([
    ...retainedUnavailable,
    ...selected,
  ]).filter((id) => id !== currentEntry.settings.workId);
  const saved = await writeSettingsFile(currentEntry.settingsPath, {
    ...currentEntry.settings,
    relatedWorkIds: nextRelatedWorkIds,
  });
  return {
    workId: saved.workId,
    relatedWorkIds: saved.relatedWorkIds,
  };
}

async function linkWorksBidirectionally(firstWork, secondWork) {
  const first = await ensureWorkIdentity(firstWork);
  const second = await ensureWorkIdentity(secondWork);
  if (!first || !second || first.settings.workId === second.settings.workId) {
    return false;
  }

  const firstRelations = normalizeWorkIds([
    ...(first.settings.relatedWorkIds || []),
    second.settings.workId,
  ]);
  const secondRelations = normalizeWorkIds([
    ...(second.settings.relatedWorkIds || []),
    first.settings.workId,
  ]);
  await writeSettingsFile(first.settingsPath, {
    ...first.settings,
    relatedWorkIds: firstRelations,
  });
  await writeSettingsFile(second.settingsPath, {
    ...second.settings,
    relatedWorkIds: secondRelations,
  });
  return true;
}

module.exports = {
  normalizeWorkIds,
  ensureWorkIdentity,
  getRelatedWorkOptions,
  syncRelatedWorks,
  linkWorksBidirectionally,
};
