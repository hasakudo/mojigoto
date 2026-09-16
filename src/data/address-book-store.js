const fs = require("fs/promises");
const path = require("path");

const { isSingleMode } = require("../core/mojigoto-context");
const {
  getMojigotoDirForSingle,
  getMojigotoDirForWork,
} = require("../core/mojigoto-paths");
const { makeId } = require("../core/path-utils");
const { listNoteFiles, readNoteFile } = require("./note-store");

function getAddressBookPath(workDir = "") {
  const root = isSingleMode()
    ? getMojigotoDirForSingle()
    : getMojigotoDirForWork(workDir);
  return root ? path.join(root, "address-book.json") : "";
}

function normalizeStringMap(value) {
  const result = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = String(key || "").trim();
    const text = String(entry || "").trim();
    if (normalizedKey && text) result[normalizedKey] = text;
  }
  return result;
}

function normalizeStringList(value) {
  return [...new Set(
    (Array.isArray(value) ? value : [])
      .map((entry) => String(entry || "").trim())
      .filter(Boolean),
  )];
}

function normalizeWorkAddressBook(value) {
  const seen = new Set();
  const characters = (Array.isArray(value?.characters) ? value.characters : [])
    .map((character) => ({
      id: String(character?.id || makeId("person")).trim(),
      noteType: character?.noteType === "plot" ? "plot" : "reference",
      noteId: String(character?.noteId || "").trim(),
      noteFileName: String(character?.noteFileName || "").trim(),
      noteTitle: String(character?.noteTitle || "").trim(),
      groupId: String(character?.groupId || "").trim(),
      groupTitle: String(character?.groupTitle || "").trim(),
      sourceKind: ["group", "divider", "item"].includes(character?.sourceKind)
        ? character.sourceKind
        : "item",
      sourceId: String(character?.sourceId || "").trim(),
      dividerNameSource: character?.dividerNameSource === "label" ? "label" : "value",
      dividerLabel: String(character?.dividerLabel || "").trim(),
      dividerValue: String(character?.dividerValue || "").trim(),
      label: String(character?.label || "").trim(),
    }))
    .filter((character) => {
      if (!character.id || seen.has(character.id)) return false;
      seen.add(character.id);
      return true;
    });

  return {
    schemaVersion: 1,
    characters,
    firstPerson: normalizeStringMap(value?.firstPerson),
    calls: normalizeStringMap(value?.calls),
    hiddenTerms: normalizeStringList(value?.hiddenTerms),
    migratedNoteIds: [...new Set(
      (Array.isArray(value?.migratedNoteIds) ? value.migratedNoteIds : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    )],
    updatedAt: String(value?.updatedAt || ""),
  };
}

function getDividerPersonLabel(item) {
  return String(item?.value || "").trim() || String(item?.label || "").trim();
}

function collectNoteCandidates(note, file, type) {
  const noteTitle = String(note?.title || "").trim() || file.name.replace(/\.json$/i, "");
  const candidates = [];
  for (const group of Array.isArray(note?.groups) ? note.groups : []) {
    const groupTitle = String(group?.title || "").trim();
    if (groupTitle) {
      candidates.push({
        key: `${type}:${note.id}:group:${group.id}`,
        noteType: type,
        noteId: String(note.id || ""),
        noteFileName: file.name,
        noteTitle,
        groupId: String(group.id || ""),
        groupTitle,
        sourceKind: "group",
        sourceId: String(group.id || ""),
        label: groupTitle,
        path: `${type === "plot" ? "プロット" : "資料"} / ${noteTitle} / 大分類`,
      });
    }
    for (const item of Array.isArray(group?.items) ? group.items : []) {
      const isDivider = item?.kind === "divider";
      const dividerLabel = isDivider ? String(item?.label || "").trim() : "";
      const dividerValue = isDivider ? String(item?.value || "").trim() : "";
      const label = isDivider
        ? getDividerPersonLabel(item)
        : String(item?.heading || "").trim();
      if (!label) continue;
      const sourceKind = isDivider ? "divider" : "item";
      const dividerContext = isDivider && item?.value && item?.label
        ? ` / ${String(item.label).trim()}`
        : "";
      candidates.push({
        key: `${type}:${note.id}:${sourceKind}:${item.id}`,
        noteType: type,
        noteId: String(note.id || ""),
        noteFileName: file.name,
        noteTitle,
        groupId: String(group.id || ""),
        groupTitle,
        sourceKind,
        sourceId: String(item.id || ""),
        dividerLabel: isDivider ? dividerLabel : "",
        dividerValue: isDivider ? dividerValue : "",
        label,
        path: `${type === "plot" ? "プロット" : "資料"} / ${noteTitle}${groupTitle ? ` / ${groupTitle}` : ""} / ${isDivider ? "区分" : "項目"}${dividerContext}`,
      });
    }
  }
  return candidates;
}

async function collectAddressBookSources(workDir = "") {
  const candidates = [];
  const notes = [];
  for (const type of ["reference", "plot"]) {
    const files = await listNoteFiles(type, { fsPath: workDir });
    for (const file of files) {
      try {
        const note = await readNoteFile(file.fsPath, type);
        notes.push({ type, file, note });
        candidates.push(...collectNoteCandidates(note, file, type));
      } catch {
        // 壊れたノートだけを候補から除外する
      }
    }
  }
  return { candidates, notes };
}

function sourceKey(value) {
  return `${value?.noteType === "plot" ? "plot" : "reference"}:${String(value?.noteId || "")}:${String(value?.sourceKind || "item")}:${String(value?.sourceId || "")}`;
}

function migrateLegacyNoteAddressBooks(book, notes, candidates) {
  const migrated = new Set(book.migratedNoteIds);
  const candidateMap = new Map(candidates.map((candidate) => [candidate.key, candidate]));
  let changed = false;

  for (const { type, file, note } of notes) {
    const noteId = String(note?.id || "").trim();
    if (!noteId || migrated.has(noteId)) continue;
    const legacy = note?.addressBook;
    if (Array.isArray(legacy?.characters) && legacy.characters.length) {
      const personMap = new Map();
      for (const character of legacy.characters) {
        const key = `${type}:${noteId}:${character?.sourceKind || "item"}:${character?.sourceId || ""}`;
        const candidate = candidateMap.get(key);
        if (!candidate) continue;
        const existing = book.characters.find((entry) => sourceKey(entry) === key);
        const nextId = existing?.id || makeId("person");
        personMap.set(String(character?.id || ""), nextId);
        if (!existing) {
          book.characters.push({ ...candidate, id: nextId });
        }
      }
      for (const [oldId, text] of Object.entries(legacy.firstPerson || {})) {
        const nextId = personMap.get(oldId);
        if (nextId && String(text || "").trim()) book.firstPerson[nextId] = String(text).trim();
      }
      for (const [key, text] of Object.entries(legacy.calls || {})) {
        const [oldFrom, oldTo] = key.split("::");
        const from = personMap.get(oldFrom);
        const to = personMap.get(oldTo);
        if (from && to && String(text || "").trim()) book.calls[`${from}::${to}`] = String(text).trim();
      }
      changed = true;
    }
    migrated.add(noteId);
    changed = true;
  }

  book.migratedNoteIds = [...migrated];
  return changed;
}

async function saveWorkAddressBook(workDir, value) {
  const filePath = getAddressBookPath(workDir);
  if (!filePath) throw new Error("呼び名一覧の保存先を取得できませんでした。");
  const payload = normalizeWorkAddressBook(value);
  payload.updatedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

async function loadWorkAddressBook(workDir = "") {
  const filePath = getAddressBookPath(workDir);
  let book = normalizeWorkAddressBook({});
  try {
    book = normalizeWorkAddressBook(JSON.parse(await fs.readFile(filePath, "utf8")));
  } catch {
    // 初回は空の一覧を使う
  }

  const { candidates, notes } = await collectAddressBookSources(workDir);
  const changed = migrateLegacyNoteAddressBooks(book, notes, candidates);
  const candidateMap = new Map(candidates.map((candidate) => [candidate.key, candidate]));
  book.characters = book.characters.map((character) => {
    const latest = candidateMap.get(sourceKey(character));
    if (!latest) return character;
    const dividerNameSource = character.dividerNameSource === "label" ? "label" : "value";
    const label = latest.sourceKind === "divider"
      ? (dividerNameSource === "label"
        ? latest.dividerLabel || latest.dividerValue
        : latest.dividerValue || latest.dividerLabel)
      : latest.label;
    return { ...character, ...latest, id: character.id, dividerNameSource, label };
  });
  if (changed) book = await saveWorkAddressBook(workDir, book);
  return { book, candidates };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildAddressBookExport(value, format, workTitle = "") {
  const book = normalizeWorkAddressBook(value);
  const labels = new Map(book.characters.map((character) => [character.id, character.label || "名前未設定"]));
  if (format === "csv") {
    const header = ["呼ぶ人＼呼ばれる人", ...book.characters.map((character) => labels.get(character.id))];
    const rows = book.characters.map((from) => [
      labels.get(from.id),
      ...book.characters.map((to) => from.id === to.id
        ? book.firstPerson[from.id] || ""
        : book.calls[`${from.id}::${to.id}`] || ""),
    ]);
    return "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  }

  const head = book.characters.map((character) => `<th>${escapeHtml(labels.get(character.id))}</th>`).join("");
  const rows = book.characters.map((from) => `<tr><th>${escapeHtml(labels.get(from.id))}</th>${book.characters.map((to) => {
    const text = from.id === to.id
      ? book.firstPerson[from.id] || ""
      : book.calls[`${from.id}::${to.id}`] || "";
    return `<td${from.id === to.id ? ' class="self"' : ""}>${escapeHtml(text)}</td>`;
  }).join("")}</tr>`).join("");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>呼び名一覧</title><style>body{font-family:sans-serif;margin:24px;color:#222}table{border-collapse:collapse;min-width:100%}th,td{border:1px solid #888;padding:8px 12px;text-align:left}thead th,tbody th{background:#f1f1f1}.self{background:#dff7ee;font-weight:700}</style></head><body><h1>${escapeHtml(workTitle ? `${workTitle} - 呼び名一覧` : "呼び名一覧")}</h1><table><thead><tr><th>呼ぶ人 ＼ 呼ばれる人</th>${head}</tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

module.exports = {
  getAddressBookPath,
  normalizeWorkAddressBook,
  collectAddressBookSources,
  loadWorkAddressBook,
  saveWorkAddressBook,
  buildAddressBookExport,
  getDividerPersonLabel,
};
