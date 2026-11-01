export const WORK_STATUS_OPTIONS = [
  { value: "", label: "未設定" },
  { value: "preparing", label: "準備中" },
  { value: "planning", label: "構想中" },
  { value: "draft", label: "執筆中" },
  { value: "revision", label: "改稿中" },
  { value: "hold", label: "保留" },
  { value: "complete", label: "完結" },
];

function makeWorkId() {
  if (globalThis.crypto?.randomUUID) return `work-${globalThis.crypto.randomUUID()}`;
  return `work-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeGenres(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[,、]/);
  const seen = new Set();
  return source.map((item) => String(item || "").trim()).filter((item) => {
    const key = item.toLocaleLowerCase("ja");
    if (!item || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeWorkSettings(value, fallbackName = "") {
  const source = value && typeof value === "object" ? structuredClone(value) : {};
  const genres = normalizeGenres(Array.isArray(source.genres) && source.genres.length ? source.genres : source.genre);
  const validStatuses = new Set(WORK_STATUS_OPTIONS.map((item) => item.value));
  source.schemaVersion = Number(source.schemaVersion || 1);
  source.workId = String(source.workId || makeWorkId());
  source.relatedWorkIds = Array.isArray(source.relatedWorkIds) ? source.relatedWorkIds.map(String).filter(Boolean) : [];
  source.folderName = String(source.folderName || fallbackName || "");
  source.title = String(source.title || fallbackName || "");
  source.subtitle = String(source.subtitle || "");
  source.penName = String(source.penName || "");
  source.genres = genres;
  source.genre = genres.join(", ");
  source.status = validStatuses.has(String(source.status || "")) ? String(source.status || "") : "";
  source.targetChars = Math.max(0, Number(source.targetChars || 0) || 0);
  source.deadline = String(source.deadline || "");
  source.summary = String(source.summary || "");
  source.memo = String(source.memo || "");
  source.updatedAt = String(source.updatedAt || "");
  source.exportOptions = {
    ...(source.exportOptions && typeof source.exportOptions === "object" ? source.exportOptions : {}),
    includeSubtitle: source.exportOptions?.includeSubtitle !== false,
    includeFolderName: Boolean(source.exportOptions?.includeFolderName),
    includeGenre: source.exportOptions?.includeGenre !== false,
    includeTargetChars: source.exportOptions?.includeTargetChars !== false,
    includeDeadline: source.exportOptions?.includeDeadline !== false,
    includePenName: source.exportOptions?.includePenName !== false,
    includeMemo: Boolean(source.exportOptions?.includeMemo),
    includeUpdatedAt: Boolean(source.exportOptions?.includeUpdatedAt),
  };
  return source;
}
