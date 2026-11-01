const MANUSCRIPT_NAMES = ["manuscript", "原稿"];

function byJapaneseName(a, b) {
  return String(a.name || "").localeCompare(String(b.name || ""), "ja", {
    numeric: true,
    sensitivity: "base",
  });
}

export function isManuscriptFile(item) {
  return Boolean(item?.file) && /\.(txt|md)$/i.test(String(item.name || ""));
}

export function findMojigotoFolder(items) {
  return items.find((item) => item?.folder && item.name === ".mojigoto") || null;
}

export function findManuscriptFolder(items) {
  return items.find((item) => item?.folder && MANUSCRIPT_NAMES.includes(item.name)) || null;
}

export function findNamedFile(items, name) {
  return items.find((item) => item?.file && item.name === name) || null;
}

export function sortDriveItems(items) {
  return [...items].sort((a, b) => {
    if (Boolean(a.folder) !== Boolean(b.folder)) return a.folder ? -1 : 1;
    return byJapaneseName(a, b);
  });
}

export function safeDriveItemSnapshot(item) {
  if (!item?.id) return null;
  const snapshot = {};
  for (const key of ["id", "name", "size", "lastModifiedDateTime", "eTag", "cTag", "version", "mimeType"]) {
    if (item[key] !== undefined) snapshot[key] = item[key];
  }
  if (item.folder) snapshot.folder = {};
  if (item.file) snapshot.file = item.file?.mimeType ? { mimeType: item.file.mimeType } : {};
  if (Array.isArray(item.parents)) snapshot.parents = item.parents.map(String);
  if (item.parentReference) {
    snapshot.parentReference = Object.fromEntries(
      ["id", "driveId"].filter((key) => item.parentReference[key]).map((key) => [key, item.parentReference[key]]),
    );
  }
  return snapshot;
}

export function createWorkCatalogSnapshot(works = []) {
  const itemKeys = ["folder", "mojigoto", "manuscript", "settingsFile", "metricsFile", "conceptFile"];
  return works.filter((work) => work?.id).map((work) => {
    const snapshot = {
      id: work.id,
      name: work.name,
      title: work.title,
      status: work.status,
      settingsPending: false,
      updatedAt: work.updatedAt || "",
      manuscriptUpdatedAt: work.manuscriptUpdatedAt || "",
      contentUpdatedAt: work.contentUpdatedAt || "",
      sharedMetrics: work.sharedMetrics ? { ...work.sharedMetrics } : null,
      metrics: work.metrics ? { ...work.metrics } : (work.sharedMetrics ? { ...work.sharedMetrics } : null),
    };
    for (const key of itemKeys) snapshot[key] = safeDriveItemSnapshot(work[key]);
    snapshot.mojigotoChildren = (work.mojigotoChildren || []).map(safeDriveItemSnapshot).filter(Boolean);
    return snapshot;
  });
}

export async function inspectWork(provider, folder) {
  const children = await provider.listChildren(folder.id);
  const mojigoto = findMojigotoFolder(children);
  const manuscript = findManuscriptFolder(children);
  if (!mojigoto && !manuscript) return null;

  let settings = {};
  let workFile = null;
  let mojigotoChildren = [];
  if (mojigoto) {
    mojigotoChildren = await provider.listChildren(mojigoto.id);
    workFile = findNamedFile(mojigotoChildren, "work.json") || findNamedFile(mojigotoChildren, "singleWork.json");
    if (workFile) {
      try {
        settings = JSON.parse(await provider.readText(workFile));
      } catch {}
    }
  }

  return {
    id: folder.id,
    name: folder.name,
    title: String(settings.title || "").trim() || folder.name,
    status: String(settings.status || ""),
    folder,
    mojigoto,
    manuscript,
    settingsFile: workFile || null,
    mojigotoChildren,
    updatedAt: folder.lastModifiedDateTime || "",
  };
}

async function listChildrenMany(provider, folders) {
  const unique = [...new Map(
    folders.filter((folder) => folder?.id).map((folder) => [String(folder.id), folder]),
  ).values()];
  if (!unique.length) return new Map();
  if (typeof provider.listChildrenBatch === "function") {
    return provider.listChildrenBatch(unique.map((folder) => folder.id));
  }
  const settled = await Promise.allSettled(unique.map((folder) => provider.listChildren(folder.id)));
  return new Map(unique.map((folder, index) => [
    String(folder.id),
    settled[index].status === "fulfilled" ? settled[index].value : [],
  ]));
}

function createWork(folder, children, mojigotoChildren = [], settings = {}) {
  const mojigoto = findMojigotoFolder(children);
  const manuscript = findManuscriptFolder(children);
  const workFile = findNamedFile(mojigotoChildren, "work.json") || findNamedFile(mojigotoChildren, "singleWork.json");
  const metricsFile = findNamedFile(mojigotoChildren, "work-metrics.json");
  const conceptFile = findNamedFile(mojigotoChildren, "concept-memos.json");
  return {
    id: folder.id,
    name: folder.name,
    title: String(settings.title || "").trim() || folder.name,
    status: String(settings.status || ""),
    folder,
    mojigoto,
    manuscript,
    settingsFile: workFile || null,
    settingsPending: Boolean(workFile),
    metricsFile: metricsFile || null,
    conceptFile: conceptFile || null,
    sharedMetrics: null,
    mojigotoChildren,
    manuscriptUpdatedAt: "",
    contentUpdatedAt: newestDate([
      workFile?.lastModifiedDateTime,
      conceptFile?.lastModifiedDateTime,
    ]) || folder.lastModifiedDateTime || "",
    updatedAt: folder.lastModifiedDateTime || "",
  };
}

// OneDrive Personal cTag changes when any descendant content or metadata changes.
// Folder eTag/date alone cannot establish this. Require complete, same-drive snapshots.
function sameFolderContentTag(before, after) {
  const drive = String(after?.parentReference?.driveId || "");
  const tag = String(after?.cTag || "").trim();
  return Boolean(before?.folder && after?.folder && before.id === after.id && drive
    && drive === String(before.parentReference?.driveId || "") && tag && tag === String(before.cTag || "").trim());
}
function managementSnapshotIssue(work) {
  if (!work) return "no-cache";
  if (!work.mojigoto?.folder || work.mojigoto.name !== ".mojigoto") return "management-folder";
  if (!work.settingsFile?.id || !Array.isArray(work.mojigotoChildren)) return "settings-snapshot";
  if (work.mojigoto.parentReference?.id !== work.id) return "management-parent";
  const settings = findNamedFile(work.mojigotoChildren, "work.json") || findNamedFile(work.mojigotoChildren, "singleWork.json");
  if (settings?.id !== work.settingsFile.id) return "settings-snapshot";
  const drive = String(work.folder?.parentReference?.driveId || "");
  if (!drive) return "work-drive";
  if (work.manuscript && (!work.manuscript.folder || work.manuscript.parentReference?.id !== work.id
    || work.manuscript.parentReference?.driveId !== drive)) return "manuscript-location";
  if (drive !== String(work.mojigoto.parentReference?.driveId || "")) return "management-drive";
  if (work.mojigotoChildren.some(item => !item?.id || item.parentReference?.id !== work.mojigoto.id
    || item.parentReference?.driveId !== drive)) return "child-location";
  return "none";
}
function hasReusableManagementSnapshot(work) {
  return managementSnapshotIssue(work) === "none";
}

// Counts and fixed reason codes only; never log names, IDs or tag values.
function folderTagDiagnostics(provider, folders, known, management = false) {
  const reasons = new Map();
  let cachedFolders = 0, currentTags = 0, cachedTags = 0, matchingTags = 0, matchingDrives = 0;
  for (const folder of folders) {
    const saved = known.get(String(folder.id)), before = management ? saved?.mojigoto : saved?.folder;
    const after = management ? folder.metadata : folder;
    if (saved) cachedFolders++;
    const currentTag = String(after?.cTag || "").trim(), cachedTag = String(before?.cTag || "").trim();
    if (currentTag) currentTags++;
    if (cachedTag) cachedTags++;
    if (currentTag && currentTag === cachedTag) matchingTags++;
    if (after?.parentReference?.driveId && after.parentReference.driveId === before?.parentReference?.driveId) matchingDrives++;
    const reason = managementSnapshotIssue(saved);
    if (reason !== "none") reasons.set(reason, (reasons.get(reason) || 0) + 1);
  }
  return { tagCacheEnabled: Boolean(provider.supportsFolderContentTags), cachedFolders, currentTags, cachedTags, matchingTags, matchingDrives,
    snapshotIssues: [...reasons].sort(([a], [b]) => a.localeCompare(b)).map(([reason, count]) => reason + ":" + count).join(",") || "none" };
}

// Use cached identities only to schedule fresh GETs; cached contents are not adopted.
function managementPrefetchTarget(saved, folder) {
  const drive = folder?.parentReference?.driveId;
  const metadata = saved?.mojigoto;
  return drive && saved?.folder?.parentReference?.driveId === drive && saved.id === folder.id
    && metadata?.folder && metadata.name === ".mojigoto" && metadata.parentReference?.id === folder.id
    && metadata.parentReference?.driveId === drive ? metadata : null;
}
function acceptsPrefetchedManagement(target, folder, metadata, items) {
  return metadata?.folder && metadata.name === ".mojigoto" && target?.id === metadata.id
    && metadata.parentReference?.id === folder.id && metadata.parentReference?.driveId === target.parentReference?.driveId
    && Array.isArray(items) && items.every(item => item?.id && item.parentReference?.id === metadata.id
      && item.parentReference?.driveId === metadata.parentReference.driveId);
}

export async function discoverWorks(provider, rootFolder, { onSkeletons, settingsCache, metricsCache, measure, readDocuments = true, cachedWorks = [], reportReferenceDiscovery, reportIncomplete } = {}) {
  const finishRoot = measure?.("作品検出・ルート一覧");
  const rootChildren = await provider.listChildren(rootFolder.id);
  finishRoot?.({ items: rootChildren.length });
  const rootManuscript = findManuscriptFolder(rootChildren);
  // `_WORK` is VS Code MultiモードのView連携専用フォルダであり、作品ではない。
  // Single用フォルダと同居している場合も子作品として誤検出しないよう除外する。
  const folders = rootChildren.filter((item) => {
    if (!item?.folder || String(item.id) === String(rootManuscript?.id || "")) return false;
    const name = String(item.name || "");
    return !name.startsWith(".") && name.toUpperCase() !== "_WORK";
  });
  const known = new Map(cachedWorks.filter(work => work?.id && work.folder?.id === work.id
    && work.mojigoto?.id && work.settingsFile?.id).map(work => [String(work.id), work]));
  const tagCache = readDocuments && provider.supportsFolderContentTags;
  const cached = readDocuments ? new Map(folders.flatMap(folder => {
    const saved = known.get(String(folder.id));
    return tagCache && hasReusableManagementSnapshot(saved) && sameFolderContentTag(saved.folder, folder)
      ? [[String(folder.id), saved]] : [];
  })) : known;
  const unknown = folders.filter(folder => !cached.has(String(folder.id)));
  let expanded = new Map();
  if (!readDocuments && typeof provider.inspectReferenceFolders === "function" && unknown.length) {
    try { expanded = await provider.inspectReferenceFolders(unknown); } catch { /* Ordinary discovery remains available. */ }
  }
  const fallback = unknown.filter(folder => !expanded.has(String(folder.id)));
  const finishChildren = measure?.("作品検出・子フォルダ一覧");
  const prefetchTargets = new Map();
  if (readDocuments && typeof provider.listChildrenBatchSettled === "function") {
    for (const folder of fallback) {
      if (String(folder.cTag || "").trim()) continue;
      const target = managementPrefetchTarget(known.get(String(folder.id)), folder);
      if (target) prefetchTargets.set(String(folder.id), target);
    }
  }
  let childListings, earlyListings = new Map();
  if (prefetchTargets.size) {
    // Interleave each work and its previous management folder within the 20-row batches.
    const targets = fallback.flatMap(folder => [folder, prefetchTargets.get(String(folder.id))].filter(Boolean));
    try { earlyListings = await provider.listChildrenBatchSettled(targets.map(folder => folder.id)); }
    catch (error) { if (error?.status === 429) throw error; }
    const retry = fallback.filter(folder => {
      const items = earlyListings.get(String(folder.id));
      if (items?.status === 429) throw items;
      return !Array.isArray(items);
    });
    // Retry current work folders in bounded batches, never a serial waterfall
    // or an unbounded burst of individual requests after a batch failure.
    const retried = await listChildrenMany(provider, retry);
    childListings = new Map(fallback.map(folder => {
      const items = earlyListings.get(String(folder.id));
      return [String(folder.id), Array.isArray(items) ? items : retried.get(String(folder.id)) || []];
    }));
  } else childListings = await listChildrenMany(provider, fallback);
  finishChildren?.({ folders: folders.length, requestedFolders: fallback.length, prefetchedFolders: prefetchTargets.size, reusedFolders: folders.filter(folder => cached.has(String(folder.id))).length,
    ...(readDocuments ? folderTagDiagnostics(provider, folders, known) : {}) });
  const childWorks = folders
    .map((folder) => {
      const saved = cached.get(String(folder.id));
      const direct = expanded.get(String(folder.id));
      return { folder, cached: saved, direct, children: saved
        ? [saved.mojigoto, saved.manuscript].filter(Boolean) : direct ? [direct.mojigoto] : childListings.get(String(folder.id)) || [] };
    })
    // Single作品直下の manuscript / 原稿 は作品そのものではない。
    // その配下に「原稿」という章フォルダがあっても、Multi作品として誤検出しない。
    .filter(({ folder }) => String(folder.id) !== String(rootManuscript?.id || ""))
    .filter(({ children }) => findMojigotoFolder(children) || findManuscriptFolder(children));
  // Multi用ルートでは子作品だけを返し、親フォルダの重複表示を防ぐ。
  // 子作品がないときだけ、選択フォルダ自体をSingle作品として調べる。
  const candidates = childWorks.length
    ? childWorks
    : (findMojigotoFolder(rootChildren) || findManuscriptFolder(rootChildren)
      ? [{ folder: rootFolder, children: rootChildren }]
      : []);
  if (!candidates.length) return [];

  const reusedManagement = new Map();
  if (tagCache) for (const candidate of candidates) {
    if (candidate.cached || candidate.direct) continue;
    const saved = known.get(String(candidate.folder.id)), metadata = findMojigotoFolder(candidate.children);
    if (hasReusableManagementSnapshot(saved) && sameFolderContentTag(saved.mojigoto, metadata)) {
      reusedManagement.set(String(candidate.folder.id), saved.mojigotoChildren);
    }
  }
  const prefetchedManagement = new Map();
  for (const candidate of candidates) {
    if (candidate.cached || candidate.direct || reusedManagement.has(String(candidate.folder.id))) continue;
    const target = prefetchTargets.get(String(candidate.folder.id)), metadata = findMojigotoFolder(candidate.children);
    const items = target && earlyListings.get(String(target.id));
    if (target?.id === metadata?.id && items?.status === 429) throw items;
    if (acceptsPrefetchedManagement(target, candidate.folder, metadata, items)) prefetchedManagement.set(String(metadata.id), items);
  }
  const mojigotoFolders = candidates.filter(candidate => !candidate.cached && !candidate.direct
    && !reusedManagement.has(String(candidate.folder.id))).map(({ children }) => findMojigotoFolder(children))
    .filter(folder => folder && !prefetchedManagement.has(String(folder.id)));
  const finishMetadata = measure?.("作品検出・管理フォルダ一覧");
  const metadataListings = new Map([...prefetchedManagement, ...await listChildrenMany(provider, mojigotoFolders)]);
  finishMetadata?.({ folders: mojigotoFolders.length, prefetchedFolders: prefetchedManagement.size,
    reusedFolders: reusedManagement.size + (tagCache ? cached.size : 0),
    ...(readDocuments ? folderTagDiagnostics(provider, candidates.map(candidate => ({ id: candidate.folder.id, metadata: findMojigotoFolder(candidate.children) })), known, true) : {}) });
  const skeletons = candidates.map(({ folder, children, cached: saved, direct }) => {
    if (saved) {
      if (readDocuments) return createWork(folder, structuredClone(children), structuredClone(saved.mojigotoChildren));
      return { ...saved, folder, name: folder.name, title: saved.title || folder.name };
    }
    const mojigoto = findMojigotoFolder(children);
    const reused = reusedManagement.get(String(folder.id));
    return createWork(folder, children, direct ? direct.children : reused ? structuredClone(reused)
      : mojigoto ? metadataListings.get(String(mojigoto.id)) || [] : []);
  });
  if (!readDocuments) reportReferenceDiscovery?.({
    cachedWorks: childWorks.filter(candidate => candidate.cached).length,
    expandedFolders: expanded.size, fallbackFolders: fallback.length, managementFolders: mojigotoFolders.length,
  });
  onSkeletons?.([...skeletons]);
  if (!readDocuments) return skeletons;

  const finishDocuments = measure?.("作品検出・設定と共有集計");
  const works = await Promise.all(skeletons.map(async (work) => {
    const readCachedJson = async (item, cache) => {
      if (!item) return null;
      const cacheKey = workMetricFileKey(item);
      const cached = cacheKey ? cache?.get(cacheKey) : null;
      if (cached && typeof cached === "object" && !Array.isArray(cached)) return cached;
      try {
        const value = JSON.parse(await provider.readText(item));
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid document");
        if (cacheKey && cache) cache.set(cacheKey, value);
        return value;
      } catch {
        reportIncomplete?.();
        return null;
      }
    };
    const [settings, sharedMetrics] = await Promise.all([
      readCachedJson(work.settingsFile, settingsCache),
      readCachedJson(work.metricsFile, metricsCache),
    ]);
    const validMetrics = sharedMetrics
      && Number(sharedMetrics.schemaVersion) === 1
      && Number.isFinite(Number(sharedMetrics.totalChars))
      && Number.isFinite(Number(sharedMetrics.noteCount));
    const totalChars = validMetrics ? Number(sharedMetrics.totalChars) : 0;
    const noteCount = validMetrics ? Number(sharedMetrics.noteCount) : 0;
    const manuscriptUpdatedAt = validMetrics && totalChars > 0 ? String(sharedMetrics.manuscriptUpdatedAt || "") : "";
    const notesUpdatedAt = validMetrics && noteCount > 0 ? String(sharedMetrics.notesUpdatedAt || "") : "";
    const legacyContentUpdatedAt = validMetrics && !manuscriptUpdatedAt && !notesUpdatedAt
      && (totalChars > 0 || noteCount > 0) ? String(sharedMetrics.updatedAt || "")
      : "";
    const contentUpdatedAt = newestDate([
      manuscriptUpdatedAt,
      notesUpdatedAt,
      legacyContentUpdatedAt,
      work.settingsFile?.lastModifiedDateTime,
      work.conceptFile?.lastModifiedDateTime,
    ]) || work.updatedAt || "";
    return {
      ...work,
      title: String(settings?.title || "").trim() || work.name,
      status: String(settings?.status || ""),
      settingsPending: false,
      manuscriptUpdatedAt,
      contentUpdatedAt,
      sharedMetrics: validMetrics ? {
        totalChars,
        noteCount,
        updatedAt: contentUpdatedAt,
        manuscriptUpdatedAt,
        notesUpdatedAt,
        countMode: String(sharedMetrics.countMode || "default"),
        source: "vscode",
      } : null,
    };
  }));
  finishDocuments?.({ works: works.length });
  return works.sort((a, b) => a.title.localeCompare(b.title, "ja", { numeric: true }));
}

// Candidate discovery needs folder/file identities, not the work list's settings and metrics bodies.
export function discoverReferenceWorks(provider, rootFolder, { cachedWorks = [], reportReferenceDiscovery } = {}) {
  return discoverWorks(provider, rootFolder, { readDocuments: false, cachedWorks, reportReferenceDiscovery });
}

function newestDate(values) {
  return values.filter(Boolean).sort().at(-1) || "";
}

async function collectFilesForWorks(provider, roots, accept) {
  const files = Array.from({ length: roots.length }, () => []);
  let queue = roots
    .map((folder, workIndex) => ({ folder, workIndex }))
    .filter(({ folder }) => folder?.id);
  while (queue.length) {
    const listings = await listChildrenMany(provider, queue.map(({ folder }) => folder));
    const next = [];
    for (const { folder, workIndex } of queue) {
      const children = listings.get(String(folder.id)) || [];
      files[workIndex].push(...children.filter((item) => item?.file && accept(item)));
      next.push(...children.filter((item) => item?.folder).map((child) => ({ folder: child, workIndex })));
    }
    queue = next;
  }
  return files;
}

export async function collectWorkIndexes(provider, works) {
  const manuscriptFiles = await collectFilesForWorks(provider, works.map((work) => work.manuscript), isManuscriptFile);
  const noteRoots = [];
  const noteRootOwners = [];
  works.forEach((work, workIndex) => {
    const metadata = Array.isArray(work.mojigotoChildren) ? work.mojigotoChildren : [];
    metadata
      .filter((item) => item?.folder && ["plots", "references"].includes(item.name))
      .forEach((folder) => {
        noteRoots.push(folder);
        noteRootOwners.push(workIndex);
      });
  });
  const noteGroups = await collectFilesForWorks(provider, noteRoots, (item) => /\.json$/i.test(item.name));
  const noteFiles = Array.from({ length: works.length }, () => []);
  noteGroups.forEach((group, index) => noteFiles[noteRootOwners[index]].push(...group));

  return works.map((work, index) => ({
    manuscriptFiles: manuscriptFiles[index],
    noteFiles: noteFiles[index],
    updatedAt: newestDate([
      work.settingsFile?.lastModifiedDateTime,
      work.conceptFile?.lastModifiedDateTime,
      ...manuscriptFiles[index].map((item) => item.lastModifiedDateTime),
      ...noteFiles[index].map((item) => item.lastModifiedDateTime),
    ]) || work.updatedAt || "",
  }));
}

export async function collectWorkIndex(provider, work) {
  if (!Array.isArray(work.mojigotoChildren) && work.mojigoto?.id) {
    work = { ...work, mojigotoChildren: await provider.listChildren(work.mojigoto.id) };
  }
  return (await collectWorkIndexes(provider, [work]))[0];
}

export function workMetricFileKey(item) {
  const id = String(item?.id || "").trim();
  if (!id) return "";
  return [id, item?.eTag || "", item?.lastModifiedDateTime || "", item?.size || 0].join("|");
}

export function workMetricSummaryKey(work) {
  const manuscriptTag = String(work?.manuscript?.cTag || "").trim();
  const metadataTag = String(work?.mojigoto?.cTag || "").trim();
  // cTag is OneDrive's descendant-content version. eTag/modifiedTime alone is
  // not enough because some providers do not update a folder when a child changes.
  if (!manuscriptTag && !metadataTag) return "";
  return [
    "v3-content-date",
    work?.id || "",
    manuscriptTag,
    metadataTag,
    work?.settingsFile?.cTag || work?.settingsFile?.eTag || "",
  ].join("|");
}

export async function collectWorkMetrics(provider, work, preparedIndex = null, { characterCounts } = {}) {
  const index = preparedIndex || await collectWorkIndex(provider, work);
  const counts = await Promise.allSettled(index.manuscriptFiles.map(async (item) => {
    const cacheKey = workMetricFileKey(item);
    const cached = cacheKey ? Number(characterCounts?.get(cacheKey)) : Number.NaN;
    if (Number.isFinite(cached)) return cached;
    const content = await provider.readText(item);
    const count = [...String(content || "").replace(/[\s\r\n]/g, "")].length;
    if (cacheKey && characterCounts) characterCounts.set(cacheKey, count);
    return count;
  }));
  const totalChars = counts.reduce((total, result) => result.status === "fulfilled" ? total + result.value : total, 0);
  return {
    totalChars,
    noteCount: index.noteFiles.length,
    updatedAt: index.updatedAt,
  };
}
