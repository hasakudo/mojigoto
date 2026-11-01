export const NOTE_TYPES = {
  plot: { folder: "plots", label: "プロット" },
  reference: { folder: "references", label: "資料" },
};

function makeId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createNote(type, title = "") {
  const noteType = type === "reference" ? "reference" : "plot";
  return {
    schemaVersion: 4,
    id: makeId(noteType),
    type: noteType,
    title: String(title || "").trim(),
    order: null,
    groups: [{ id: makeId("grp"), title: "", items: [], images: [] }],
    addressBook: { characters: [], firstPerson: {}, calls: {} },
    updatedAt: new Date().toISOString(),
  };
}

export function createNoteEntry() {
  return {
    id: makeId("item"),
    kind: "entry",
    heading: "",
    headingRuby: "",
    body: "",
    memo: {
      type: "text",
      body: "",
      updatedAt: "",
      tags: [],
      linkedConceptMemoIds: [],
      autoSyncToConceptMemo: false,
      autoSyncToConceptMemoOverride: null,
      conceptMemoSyncedAt: "",
      conceptMemoSyncFingerprint: "",
    },
    relatedReferences: [],
  };
}

export function createNoteDivider() {
  return { id: makeId("div"), kind: "divider", label: "", value: "", relatedReferences: [] };
}

export function moveNoteItem(items, fromIndex, toIndex) {
  if (!Array.isArray(items)) return false;
  const from = Number(fromIndex);
  const to = Number(toIndex);
  if (!Number.isInteger(from) || !Number.isInteger(to)
    || from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return false;
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
  return true;
}

export function moveNoteItemToGroup(groups, fromGroupIndex, itemIndex, toGroupIndex) {
  if (!Array.isArray(groups)) return false;
  const fromGroup = Number(fromGroupIndex);
  const fromItem = Number(itemIndex);
  const toGroup = Number(toGroupIndex);
  if (!Number.isInteger(fromGroup) || !Number.isInteger(fromItem) || !Number.isInteger(toGroup)
    || fromGroup < 0 || fromGroup >= groups.length || toGroup < 0 || toGroup >= groups.length
    || fromGroup === toGroup || !Array.isArray(groups[fromGroup]?.items) || fromItem < 0
    || fromItem >= groups[fromGroup].items.length) return false;
  const [item] = groups[fromGroup].items.splice(fromItem, 1);
  if (!Array.isArray(groups[toGroup].items)) groups[toGroup].items = [];
  groups[toGroup].items.push(item);
  return true;
}

export function normalizeNote(value, fallbackType = "plot") {
  const source = value && typeof value === "object" ? structuredClone(value) : {};
  const fallback = createNote(fallbackType, source.title);
  source.schemaVersion = 4;
  source.id = String(source.id || fallback.id);
  source.type = source.type === "reference" ? "reference" : fallback.type;
  source.title = String(source.title || "");
  source.order = source.order === null || source.order === undefined || source.order === ""
    ? null
    : Number.isFinite(Number(source.order)) ? Number(source.order) : null;
  if (!Array.isArray(source.groups) && Array.isArray(source.sections)) {
    source.groups = [{
      id: makeId("grp"),
      title: "",
      items: source.sections.map((section) => ({
        id: String(section?.id || makeId("item")),
        kind: "entry",
        heading: String(section?.heading || ""),
        headingRuby: "",
        body: String(section?.body || ""),
        memo: createNoteEntry().memo,
        relatedReferences: [],
      })),
      images: [],
    }];
  }
  source.groups = Array.isArray(source.groups) && source.groups.length ? source.groups : fallback.groups;
  source.groups = source.groups.map((group) => ({
    ...group,
    id: String(group?.id || makeId("grp")),
    title: String(group?.title || ""),
    items: (Array.isArray(group?.items) ? group.items : []).map((item) => item?.kind === "divider"
      ? {
          ...item,
          id: String(item?.id || makeId("div")),
          kind: "divider",
          label: String(item?.label || ""),
          value: String(item?.value || ""),
          relatedReferences: Array.isArray(item?.relatedReferences) ? item.relatedReferences : [],
        }
      : {
          ...item,
          id: String(item?.id || makeId("item")),
          kind: "entry",
          heading: String(item?.heading || ""),
          headingRuby: String(item?.headingRuby || ""),
          body: String(item?.body || ""),
          memo: {
            ...createNoteEntry().memo,
            ...(item?.memo && typeof item.memo === "object" ? item.memo : {}),
            body: String(item?.memo?.body || ""),
            tags: Array.isArray(item?.memo?.tags) ? item.memo.tags : [],
          },
          relatedReferences: Array.isArray(item?.relatedReferences) ? item.relatedReferences : [],
        }),
    images: Array.isArray(group?.images) ? group.images : [],
  }));
  source.addressBook = source.addressBook && typeof source.addressBook === "object"
    ? source.addressBook
    : fallback.addressBook;
  source.updatedAt = String(source.updatedAt || "");
  return source;
}

export function noteSearchText(note) {
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

export function matchesNoteQuery(note, query) {
  const terms = String(query || "").normalize("NFKC").toLocaleLowerCase("ja").split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = noteSearchText(note).normalize("NFKC").toLocaleLowerCase("ja");
  return terms.every((term) => haystack.includes(term));
}

export function notePreview(note, maxLength = 100) {
  const text = noteSearchText({ ...note, title: "" }).replace(/\s+/g, " ").trim();
  const chars = Array.from(text);
  return chars.length > maxLength ? `${chars.slice(0, maxLength).join("")}…` : text;
}

export function slugifyNoteTitle(title, fallbackType = "plot") {
  const value = String(title || "").trim().toLocaleLowerCase("ja")
    .replace(/[^\p{L}\p{N}\-_]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return value || (fallbackType === "reference" ? "reference" : "plot");
}

export function collectRelatedTargets(entries, sourceType, sourceNoteId = "") {
  const allowed = sourceType === "plot" ? new Set(["plot", "reference"]) : new Set(["reference"]);
  const results = [];
  for (const entry of entries || []) {
    const note = entry?.data;
    const noteType = note?.type === "reference" ? "reference" : "plot";
    if (!allowed.has(noteType) || String(note?.id || "") === String(sourceNoteId || "")) continue;
    for (const group of note?.groups || []) {
      for (const item of group?.items || []) {
        const isDivider = item?.kind === "divider";
        const itemLabel = String(isDivider
          ? [item?.label, item?.value].filter(Boolean).join(" / ")
          : item?.heading || "").trim();
        if (!itemLabel) continue;
        results.push({
          noteType,
          noteId: String(note.id || ""),
          noteFileName: String(entry?.item?.name || ""),
          noteTitle: String(note.title || ""),
          groupId: String(group?.id || ""),
          groupTitle: String(group?.title || ""),
          itemId: String(item?.id || ""),
          itemKind: isDivider ? "divider" : "entry",
          itemLabel,
          preview: String(isDivider ? item?.value || item?.label : item?.body || "").replace(/\s+/g, " ").trim(),
        });
      }
    }
  }
  return results;
}

export function relatedTargetKey(value) {
  return `${value?.importTarget?.workId ? value.importTarget.workId + ":" : ""}${value?.noteType === "plot" ? "plot" : "reference"}:${String(value?.noteId || "")}:${String(value?.groupId || "")}:${String(value?.itemId || "")}`;
}

export function addRelatedTarget(existing, target) {
  const list = Array.isArray(existing) ? [...existing] : [];
  const key = relatedTargetKey(target);
  if (!list.some((item) => relatedTargetKey(item) === key)) list.push({ ...target, preview: undefined });
  return list;
}

export function matchesRelatedTarget(target, query) {
  const terms = String(query || "").normalize("NFKC").toLocaleLowerCase("ja").split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = [target?.noteTitle, target?.groupTitle, target?.itemLabel, target?.preview]
    .filter(Boolean).join("\n").normalize("NFKC").toLocaleLowerCase("ja");
  return terms.every((term) => haystack.includes(term));
}

export function normalizeAddressBook(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    characters: Array.isArray(source.characters) ? source.characters.filter((item) => item?.id) : [],
    firstPerson: source.firstPerson && typeof source.firstPerson === "object" ? source.firstPerson : {},
    calls: source.calls && typeof source.calls === "object" ? source.calls : {},
    updatedAt: String(source.updatedAt || ""),
  };
}
