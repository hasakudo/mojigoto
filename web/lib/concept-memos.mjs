function makeId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultConceptFolders() {
  return [
    { id: "writing", name: "執筆メモ", order: 0 },
    { id: "note-item", name: "項目メモ", order: 1 },
    { id: "dialogue", name: "台詞", order: 2 },
    { id: "review", name: "要確認", order: 3 },
  ];
}

export function conceptMemoFolderIds(memo = {}) {
  const source = Array.isArray(memo?.folderIds) ? memo.folderIds : [memo?.folderId];
  return source
    .map((folderId) => String(folderId || "").trim())
    .filter(Boolean)
    .filter((folderId, index, values) => values.indexOf(folderId) === index);
}

export function createConceptMemo(overrides = {}) {
  const now = new Date().toISOString();
  const folderIds = conceptMemoFolderIds(overrides);
  return {
    id: makeId("memo"),
    type: "text",
    title: "",
    body: "",
    listItems: [],
    todoItems: [],
    tags: [],
    folderIds,
    folderId: folderIds[0] || "",
    isPinned: false,
    isArchived: false,
    showInDashboard: false,
    createdAt: now,
    updatedAt: now,
    order: 0,
    source: null,
    ...overrides,
    folderIds,
    folderId: folderIds[0] || "",
  };
}

export function normalizeConceptDocument(value) {
  const source = value && typeof value === "object" ? structuredClone(value) : {};
  source.version = Number(source.version || 1);
  source.updatedAt = String(source.updatedAt || "");
  source.folders = Array.isArray(source.folders) ? source.folders : defaultConceptFolders();
  source.memos = (Array.isArray(source.memos) ? source.memos : []).map((memo) => {
    const folderIds = conceptMemoFolderIds(memo);
    return {
      ...createConceptMemo(memo),
      id: String(memo?.id || makeId("memo")),
      type: ["list", "todo"].includes(memo?.type) ? memo.type : "text",
      title: String(memo?.title || ""),
      body: String(memo?.body || ""),
      listItems: Array.isArray(memo?.listItems) ? memo.listItems : [],
      todoItems: Array.isArray(memo?.todoItems) ? memo.todoItems : [],
      tags: Array.isArray(memo?.tags) ? memo.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [],
      folderIds,
      folderId: folderIds[0] || "",
      source: memo?.source && typeof memo.source === "object" ? memo.source : null,
    };
  });
  source.commonTodoItems = Array.isArray(source.commonTodoItems) ? source.commonTodoItems : [];
  source.autoSyncToNoteItemDefault = Boolean(source.autoSyncToNoteItemDefault);
  return source;
}

export function memoEditableText(memo) {
  if (memo?.type === "list") return (memo.listItems || []).map((item) => item?.text || "").join("\n");
  if (memo?.type === "todo") {
    return (memo.todoItems || []).map((item) => `[${item?.done ? "x" : " "}] ${item?.text || ""}`).join("\n");
  }
  return String(memo?.body || "");
}

export function applyMemoEditableText(memo, text) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (memo.type === "list") {
    memo.listItems = lines.map((line, index) => ({
      ...(memo.listItems?.[index] || {}),
      id: String(memo.listItems?.[index]?.id || makeId("li")),
      text: line,
      checked: Boolean(memo.listItems?.[index]?.checked),
    }));
    memo.body = "";
  } else if (memo.type === "todo") {
    memo.todoItems = lines.map((line, index) => {
      const marker = line.match(/^\[([ xX])\]\s*/);
      return {
        ...(memo.todoItems?.[index] || {}),
        id: String(memo.todoItems?.[index]?.id || makeId("td")),
        text: marker ? line.slice(marker[0].length) : line,
        done: marker ? marker[1].toLowerCase() === "x" : Boolean(memo.todoItems?.[index]?.done),
      };
    });
    memo.body = "";
  } else {
    memo.body = String(text || "");
  }
  return memo;
}

export function matchesConceptMemo(memo, filters = {}) {
  const terms = String(filters.query || "").normalize("NFKC").toLocaleLowerCase("ja").split(/\s+/).filter(Boolean);
  const haystack = [memo.title, memoEditableText(memo), ...(memo.tags || [])].join("\n").normalize("NFKC").toLocaleLowerCase("ja");
  if (!terms.every((term) => haystack.includes(term))) return false;
  if (filters.tag && !(memo.tags || []).includes(filters.tag)) return false;
  if (filters.folderId && !conceptMemoFolderIds(memo).includes(filters.folderId)) return false;
  if (filters.status === "pinned" && !memo.isPinned) return false;
  if (filters.status === "active" && memo.isArchived) return false;
  if (filters.status === "archived" && !memo.isArchived) return false;
  return true;
}

export function sortConceptMemos(memos, field = "updatedAt", direction = "desc") {
  const sign = direction === "asc" ? 1 : -1;
  return [...memos].sort((a, b) => {
    if (Boolean(a.isPinned) !== Boolean(b.isPinned)) return a.isPinned ? -1 : 1;
    if (field === "title") return sign * String(a.title || "").localeCompare(String(b.title || ""), "ja", { numeric: true });
    if (field === "order") return sign * ((Number(a.order) || 0) - (Number(b.order) || 0));
    return sign * String(a[field] || "").localeCompare(String(b[field] || ""));
  });
}

export function conceptMemoPreview(memo, maxLength = 110) {
  const chars = Array.from(memoEditableText(memo).replace(/\s+/g, " ").trim());
  return chars.length > maxLength ? `${chars.slice(0, maxLength).join("")}…` : chars.join("");
}

export function conceptSourceFileName(source) {
  const parts = String(source?.notePath || "").split(/[\\/]/).filter(Boolean);
  return parts.at(-1) || "";
}
