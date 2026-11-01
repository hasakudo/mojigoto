const KINDS = new Set(["manuscript-list", "manuscript-file", "notes-list", "note-editor", "concept-list", "concept-editor", "settings"]);
const EDITOR_KINDS = new Set(["manuscript-file", "note-editor", "concept-editor"]);

export function isRecentEditorRoute(route) {
  return EDITOR_KINDS.has(route?.kind);
}

export function isRecentViewEntry(entry) {
  const route = entry?.route;
  if (!["oneDrive", "googleDrive", "dropbox"].includes(entry?.cloudKind) || !entry?.root?.id
    || !KINDS.has(route?.kind) || !route?.workId || route?.work?.id !== route.workId) return false;
  if (["manuscript-file", "note-editor"].includes(route.kind) && !route.item?.id) return false;
  if (route.kind === "concept-editor" && !route.memoId) return false;
  return true;
}

export function recentViewKey(entry) {
  const route = entry?.route;
  return JSON.stringify([entry?.cloudKind, entry?.root?.id, route?.workId, route?.kind,
    route?.noteType || "", route?.folder?.id || "", route?.item?.id || "", route?.memoId || ""]);
}

export function normalizeRecentViews(entries, cloudKind = "", limit = 5) {
  if (!Array.isArray(entries)) return [];
  const seen = new Set();
  return entries.filter((entry) => {
    if (!isRecentViewEntry(entry) || !isRecentEditorRoute(entry.route)) return false;
    if (cloudKind && entry.cloudKind !== cloudKind) return false;
    const key = recentViewKey(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

export function updateRecentViews(entries, entry) {
  if (!isRecentEditorRoute(entry?.route)) return normalizeRecentViews(entries);
  return normalizeRecentViews([entry, ...normalizeRecentViews(entries)
    .filter((candidate) => recentViewKey(candidate) !== recentViewKey(entry))]);
}

export function recentViewsForWork(entries, cloudKind, rootId, workId) {
  return normalizeWorkRecentViews((Array.isArray(entries) ? entries : []).filter((entry) =>
    entry?.cloudKind === cloudKind && entry?.root?.id === rootId && entry?.route?.workId === workId), cloudKind);
}

export function normalizeWorkRecentViews(entries, cloudKind = "") {
  const valid = normalizeRecentViews(entries, cloudKind, Infinity);
  const pinned = valid.filter((entry) => entry.pinned === true).slice(0, 2);
  const pinnedKeys = new Set(pinned.map(recentViewKey));
  const recent = valid.filter((entry) => !pinnedKeys.has(recentViewKey(entry)))
    .map((entry) => entry.pinned === true ? { ...entry, pinned: false } : entry)
    .sort((a, b) => String(b.openedAt || "").localeCompare(String(a.openedAt || ""))).slice(0, 5);
  return [...pinned, ...recent];
}

export function updateWorkRecentViews(entries, entry) {
  const current = normalizeWorkRecentViews(entries);
  if (!isRecentViewEntry(entry) || !isRecentEditorRoute(entry.route)) return current;
  const key = recentViewKey(entry);
  const previous = current.find((candidate) => recentViewKey(candidate) === key);
  return normalizeWorkRecentViews([{ ...entry, pinned: previous?.pinned === true },
    ...current.filter((candidate) => recentViewKey(candidate) !== key)]);
}

export function setWorkRecentViewPinned(entries, key, pinned) {
  const current = normalizeWorkRecentViews(entries);
  const target = current.find((entry) => recentViewKey(entry) === key);
  if (!target) return current;
  if (pinned && !target.pinned && current.filter((entry) => entry.pinned).length >= 2) {
    throw new Error("ピン留めは作品ごとに2件までです。先にどちらかのピン留めを解除してください。");
  }
  return normalizeWorkRecentViews(current.map((entry) => recentViewKey(entry) === key ? { ...entry, pinned: Boolean(pinned) } : entry));
}

export function recentViewLabel(entry) {
  const route = entry.route;
  const destination = route.kind.startsWith("manuscript") ? "原稿"
    : route.kind.startsWith("note") ? (route.noteType === "reference" ? "資料" : "プロット")
    : route.kind.startsWith("concept") ? "構想メモ" : "作品設定";
  const title = route.kind === "note-editor" ? route.noteTitle || "ノート（タイトル未取得）"
    : route.item?.name || route.memoTitle || "";
  return [destination, title].filter(Boolean).join(" / ");
}

export function recentViewLocationLabel(entry, cloudName, currentRoot = null) {
  const root = currentRoot?.id === entry?.root?.id && String(currentRoot?.name || "").trim()
    ? currentRoot : entry?.root;
  const folderName = String(root?.name || "").trim();
  return `${cloudName} / ${folderName || "フォルダ名未取得"}`;
}

export function homeRecentViews(recent, workHistories) {
  const saved = workHistories.flatMap((entries) => normalizeWorkRecentViews(entries));
  const pinnedKeys = new Set(saved.filter((entry) => entry.pinned).map(recentViewKey));
  const unique = new Map();
  for (const entry of [...normalizeRecentViews(saved, "", Infinity), ...normalizeRecentViews(recent, "", Infinity)]) {
    const key = recentViewKey(entry);
    const previous = unique.get(key);
    if (!previous || String(entry.openedAt || "") > String(previous.openedAt || "")) {
      unique.set(key, { ...entry, pinned: pinnedKeys.has(key) });
    }
  }
  const entries = [...unique.values()].sort((a, b) => String(b.openedAt || "").localeCompare(String(a.openedAt || "")));
  return [...entries.filter((entry) => entry.pinned), ...entries.filter((entry) => !entry.pinned).slice(0, 5)];
}

export function groupRecentViews(entries, limit = 5) {
  const groups = new Map();
  for (const entry of normalizeRecentViews(entries, "", limit)) {
    const key = JSON.stringify([entry.cloudKind, entry.root.id, entry.route.workId]);
    if (!groups.has(key)) groups.set(key, { entry, entries: [] });
    groups.get(key).entries.push(entry);
  }
  return [...groups.values()];
}

export function recentWorkDestination(entry, destination) {
  const work = entry.route.work;
  const kind = destination === "manuscript" ? "manuscript-list"
    : destination === "plot" || destination === "reference" ? "notes-list"
    : destination === "concept" ? "concept-list" : "settings";
  return { ...entry, route: {
    kind, workId: entry.route.workId, work,
    ...(kind === "manuscript-list" ? { folder: work.manuscript, trail: [] } : {}),
    ...(kind === "notes-list" ? { noteType: destination } : {}),
  } };
}
