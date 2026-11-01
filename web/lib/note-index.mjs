function searchText(note) {
  const parts = [note?.title];
  for (const group of note?.groups || []) {
    parts.push(group?.title);
    for (const item of group?.items || []) {
      parts.push(item?.kind === "divider" ? item?.label : item?.heading);
      parts.push(item?.kind === "divider" ? item?.value : item?.body);
      parts.push(item?.memo?.body);
      parts.push(...(Array.isArray(item?.memo?.tags) ? item.memo.tags : []));
    }
  }
  return parts.filter(Boolean).join("\n");
}

export function makeNoteIndexEntry(item, note, fallbackType = "plot") {
  const allText = searchText(note);
  const previewText = searchText({ ...note, title: "" }).replace(/\s+/g, " ").trim();
  const chars = Array.from(previewText);
  return {
    fileName: String(item?.name || ""),
    id: String(note?.id || ""),
    type: note?.type === "reference" ? "reference" : fallbackType === "reference" ? "reference" : "plot",
    title: String(note?.title || ""),
    order: Number.isFinite(Number(note?.order)) && note?.order !== null && note?.order !== "" ? Number(note.order) : null,
    groupCount: Array.isArray(note?.groups) ? note.groups.length : 0,
    preview: chars.length > 100 ? `${chars.slice(0, 100).join("")}…` : previewText,
    searchText: allText,
    updatedAt: String(note?.updatedAt || item?.lastModifiedDateTime || ""),
    fileModifiedAt: String(item?.lastModifiedDateTime || ""),
  };
}

export function normalizeNoteIndex(value) {
  const source = value && typeof value === "object" ? value : {};
  if (Number(source.schemaVersion) !== 1) return null;
  const normalize = (entries, type) => (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && typeof entry === "object" && entry.fileName)
    .map((entry) => ({
      fileName: String(entry.fileName),
      id: String(entry.id || ""),
      type,
      title: String(entry.title || ""),
      order: Number.isFinite(Number(entry.order)) && entry.order !== null && entry.order !== "" ? Number(entry.order) : null,
      groupCount: Math.max(0, Number(entry.groupCount) || 0),
      preview: String(entry.preview || ""),
      searchText: String(entry.searchText || entry.title || ""),
      updatedAt: String(entry.updatedAt || ""),
      fileModifiedAt: String(entry.fileModifiedAt || ""),
    }));
  return {
    schemaVersion: 1,
    updatedAt: String(source.updatedAt || ""),
    plots: normalize(source.plots, "plot"),
    references: normalize(source.references, "reference"),
  };
}

export function matchesNoteIndexEntry(entry, query) {
  const terms = String(query || "").normalize("NFKC").toLocaleLowerCase("ja").split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = String(entry?.searchText || entry?.title || "").normalize("NFKC").toLocaleLowerCase("ja");
  return terms.every((term) => haystack.includes(term));
}

export function mergeNoteIndexEntries(indexEntries, items) {
  const byName = new Map((indexEntries || []).map((entry) => [entry.fileName, entry]));
  return (items || []).map((item) => {
    const summary = byName.get(item.name);
    return summary ? { item, summary } : null;
  }).filter(Boolean);
}
