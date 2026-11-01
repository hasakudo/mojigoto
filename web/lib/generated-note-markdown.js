// Browser/Node shared format. No I/O; callers supply SHA-256 functions.
(function () {
"use strict";
const MARKER = "<!-- mojigoto-web-note: ";
const CURRENT_VERSION = 4;
const clone = (value) => JSON.parse(JSON.stringify(value));
const stringMap = (value) => Object.fromEntries(Object.entries(value || {}).filter(([key, text]) => key && typeof text === "string"));
function addressBookDetails(value) {
  const fields = ["id", "noteType", "noteId", "noteFileName", "noteTitle", "groupId", "groupTitle", "sourceKind", "sourceId", "dividerNameSource", "dividerLabel", "dividerValue", "label"];
  return { characters: (Array.isArray(value?.characters) ? value.characters : []).map((character) =>
    Object.fromEntries(fields.filter((key) => typeof character?.[key] === "string").map((key) => [key, character[key]]))),
    firstPerson: stringMap(value?.firstPerson), calls: stringMap(value?.calls), updatedAt: String(value?.updatedAt || "") };
}
function validBook(book) {
  if (!book || !Array.isArray(book.characters) || !book.firstPerson || !book.calls
      || Array.isArray(book.firstPerson) || Array.isArray(book.calls) || typeof book.updatedAt !== "string") return false;
  const ids = new Set();
  return book.characters.every((person) => person && typeof person.id === "string" && person.id && !ids.has(person.id)
    && (ids.add(person.id), Object.values(person).every((value) => typeof value === "string")))
    && [book.firstPerson, book.calls].every((map) => typeof map === "object" && Object.values(map).every((value) => typeof value === "string"));
}
function validImage(image) {
  if (!image || !["id", "name", "fileName", "relativePath", "createdAt"].every((key) => typeof image[key] === "string")) return false;
  const parts = image.relativePath.replace(/\\/g, "/").split("/");
  return parts[0] === "note-images" && parts.length >= 2 && parts.every((part) => part && !/[. ]$/.test(part) && !/[<>:"|?*\x00-\x1f]/.test(part))
    && !/[\\/]/.test(image.fileName);
}
function formatAttachments(note, workAddressBook = null) {
  return { groupImages: note.groups.map((group) => (group.images || []).map((image) => ({
    id: String(image.id || ""), name: String(image.name || image.fileName || "画像"), fileName: basename(image.fileName),
    relativePath: String(image.relativePath || "").replace(/\\/g, "/"), createdAt: String(image.createdAt || ""),
  }))), addressBook: addressBookDetails(note.addressBook),
    workAddressBook: workAddressBook ? addressBookDetails(workAddressBook) : null };
}
function validateAttachments(metadata) {
  const value = metadata.attachments;
  if (!value || !Array.isArray(value.groupImages) || value.groupImages.length !== metadata.sourceIds.length
      || !value.groupImages.every((images) => Array.isArray(images) && images.every(validImage))
      || !validBook(value.addressBook) || (value.workAddressBook !== null && !validBook(value.workAddressBook))
      || !/^[a-f0-9]{64}$/.test(metadata.attachmentsHash || "")) throw new Error("画像の関連付け・呼び名一覧の情報を確認できません。再生成してください。");
}
function importedAddressBook(value) {
  if (!value || typeof value.workId !== "string" || !value.workId || typeof value.generatedAt !== "string" || !validBook(value.book)) return null;
  return { workId: value.workId, generatedAt: value.generatedAt, book: addressBookDetails(value.book) };
}
function basename(value) { return String(value || "").split(/[\\/]/).pop(); }
function referenceDetails(link, workId) {
  const source = link?.importTarget && !link.importTarget.self ? link.importTarget : link || {};
  return {
    workId: String(source.workId || workId), noteType: source.noteType === "plot" ? "plot" : "reference",
    noteId: String(source.noteId || ""), noteFileName: basename(source.noteFileName),
    groupId: String(source.groupId || ""), itemId: String(source.itemId || ""),
    noteTitle: String(link?.noteTitle || ""), groupTitle: String(link?.groupTitle || ""),
    itemLabel: String(link?.itemLabel || ""), itemKind: link?.itemKind === "divider" ? "divider" : "entry",
  };
}
function formatDetails(note, workId) {
  return note.groups.map((group) => (group.items || []).map((item) => ({
    ...(item.kind === "divider" ? {} : {
      headingRuby: String(item.headingRuby || ""),
      memo: { type: item.memo?.type === "list" ? "list" : "text", body: String(item.memo?.body || ""),
        tags: [...new Set((Array.isArray(item.memo?.tags) ? item.memo.tags : []).map((tag) => String(tag)))] },
    }),
    relatedReferences: (Array.isArray(item.relatedReferences) ? item.relatedReferences : []).map((link) => referenceDetails(link, workId)),
  })));
}
function validReference(link) {
  return link && ["workId", "noteType", "noteId", "noteFileName", "groupId", "itemId", "noteTitle", "groupTitle", "itemLabel", "itemKind"]
    .every((key) => typeof link[key] === "string") && link.workId && (link.noteId || link.noteFileName) && link.itemId
    && ["plot", "reference"].includes(link.noteType) && ["divider", "entry"].includes(link.itemKind)
    && !/[\\/]/.test(link.noteFileName);
}
function normalizeImportedTarget(value) {
  if (!validReference(value)) return null;
  return Object.fromEntries(["workId", "noteType", "noteId", "noteFileName", "groupId", "itemId", "noteTitle", "groupTitle", "itemLabel", "itemKind"]
    .map((key) => [key, value[key]]).concat([["self", value.self === true]]));
}
function validateDetails(metadata) {
  const details = metadata.details;
  const itemIds = new Set(metadata.sourceIds.flatMap((group) => group.items.map((item) => item.id)));
  if (!Array.isArray(details) || details.length !== metadata.sourceIds.length) throw new Error("項目メモ等の情報が不足しています。再生成してください。");
  metadata.sourceIds.forEach((group, i) => {
    if (!Array.isArray(details[i]) || details[i].length !== group.items.length) throw new Error("詳細情報と項目の数が一致しません。");
    group.items.forEach((item, j) => {
      const detail = details[i][j];
      if (!detail || !Array.isArray(detail.relatedReferences) || !detail.relatedReferences.every(validReference)) throw new Error("関連リンクの情報を確認できません。再生成してください。");
      for (const link of detail.relatedReferences) {
        if (link.workId === metadata.workId && link.noteType === metadata.type
            && (link.noteId ? link.noteId === metadata.noteId : link.noteFileName === metadata.sourceFileName) && !itemIds.has(link.itemId)) {
          throw new Error("同じノート内の関連リンク先がありません。VS Codeでリンクを確認してください。");
        }
      }
      if (item.kind !== "divider" && (typeof detail.headingRuby !== "string" || !detail.memo
          || !["text", "list"].includes(detail.memo.type) || typeof detail.memo.body !== "string"
          || !Array.isArray(detail.memo.tags) || !detail.memo.tags.every((tag) => typeof tag === "string"))) throw new Error("項目メモ・ふりがなの情報を確認できません。再生成してください。");
    });
  });
}
function applyDetails(metadata, note) {
  if (metadata.version < 3) return note;
  validateParsedIds(metadata, note);
  metadata.details.forEach((group, i) => group.forEach((detail, j) => {
    const item = note.groups[i].items[j];
    if (item.kind !== "divider") {
      item.headingRuby = detail.headingRuby;
      item.memo = { type: detail.memo.type, body: detail.memo.body, tags: [...detail.memo.tags], updatedAt: "", linkedConceptMemoIds: [],
        autoSyncToConceptMemo: false, autoSyncToConceptMemoOverride: false, conceptMemoSyncedAt: "", conceptMemoSyncFingerprint: "" };
    }
    item.relatedReferences = detail.relatedReferences.map((link) => {
      const target = normalizeImportedTarget(link);
      const { workId, self, ...visible } = target;
      return { ...visible, importTarget: { ...target, self: link.workId === metadata.workId && link.noteType === metadata.type
        && (link.noteId ? link.noteId === metadata.noteId : link.noteFileName === metadata.sourceFileName) } };
    });
  }));
  if (metadata.version >= 4) {
    note.groups.forEach((group, i) => { group.images = clone(metadata.attachments.groupImages[i]); });
    const { updatedAt, ...book } = clone(metadata.attachments.addressBook);
    note.addressBook = book;
    if (metadata.attachments.workAddressBook) note.importedAddressBook = { workId: metadata.workId, generatedAt: metadata.generatedAt, book: clone(metadata.attachments.workAddressBook) };
  }
  return remapSelfLinks(note, metadata);
}
function remapSelfLinks(note, metadata) {
  if (metadata.version < 3) return note;
  const items = new Map();
  metadata.sourceIds.forEach((group, i) => group.items.forEach((item, j) => items.set(item.id, { group: note.groups[i], item: note.groups[i].items[j] })));
  for (const group of note.groups) for (const item of group.items) for (const link of item.relatedReferences || []) {
    if (!link.importTarget?.self) continue;
    const target = items.get(link.importTarget.itemId);
    if (!target) throw new Error("同じノート内の関連リンク先がありません。VS Codeでリンクを確認してください。");
    Object.assign(link, { noteType: note.type, noteId: note.id, noteFileName: "", groupId: target.group.id, itemId: target.item.id });
  }
  if (metadata.version >= 4) {
    const groups = new Map(metadata.sourceIds.map((group, i) => [group.id, note.groups[i].id]));
    note.addressBook.characters = metadata.attachments.addressBook.characters.map((person) => ({ id: person.id, sourceKind: person.sourceKind || "item", label: person.label || "",
      sourceId: person.sourceKind === "group" ? groups.get(person.sourceId) || "" : items.get(person.sourceId)?.item.id || "",
    }));
  }
  return note;
}
// Resolve by provenance, never by a coincidental ID/name in another work.
function findImportedTarget(entries, target, localWorkId = "") {
  if (!validReference(target)) return null;
  const matches = entries.filter((entry) => {
    const note = entry.data, source = note.importSource;
    return (source?.workId === target.workId && source.type === target.noteType
      && (target.noteId ? source.noteId === target.noteId : source.sourceFileName === target.noteFileName))
      || (localWorkId === target.workId && note.type === target.noteType
        && (target.noteId ? note.id === target.noteId : entry.item?.name === target.noteFileName));
  });
  if (matches.length !== 1) return null;
  const entry = matches[0], note = entry.data, source = note.importSource;
  const isCopy = source?.workId === target.workId && source.type === target.noteType
    && (target.noteId ? source.noteId === target.noteId : source.sourceFileName === target.noteFileName);
  const itemId = isCopy ? source.items?.find((mapping) => mapping.sourceId === target.itemId)?.targetId : target.itemId;
  const found = note.groups.flatMap((group) => group.items.filter((item) => item.id === itemId).map((item) => ({ group, item })));
  if (found.length !== 1) return null;
  const { group, item } = found[0];
  return { entry, link: { noteType: note.type, noteId: note.id, noteFileName: entry.item?.name || "", noteTitle: note.title,
    groupId: group.id, groupTitle: group.title, itemId: item.id, itemKind: item.kind, itemLabel: item.kind === "divider" ? item.label : item.heading } };
}
function formatBody(note) {
  const lines = [];
  const label = (text, fallback) => String(text || "").trim().replace(/\r?\n/g, " ") || fallback;
  for (const group of note.groups || []) {
    lines.push(`# ${label(group.title, "無題大分類")}`, "");
    for (const item of group.items || []) {
      if (item.kind === "divider") {
        lines.push(`## ${label(item.label, "無題区分")}`);
        const value = String(item.value || "").replace(/\r\n?/g, "\n");
        if (value.trim()) for (const line of value.split("\n")) lines.push(`> 補足: ${line}`);
      } else {
        lines.push(`### ${label(item.heading, "無題項目")}`);
        // Escape structural-looking lines only in this versioned format.
        // The reader removes one slash after parsing, also inside fences.
        lines.push(String(item.body || "").replace(/\r\n?/g, "\n").replace(/^([^\S\r\n]*)(\\*#{1,3}(?:\s|　))/gm, "$1\\$2"));
      }
      lines.push("");
    }
  }
  return lines.join("\n").trimEnd() + "\n";
}
function canonical(metadata, body) {
  const { exportHash, ...fields } = metadata;
  return JSON.stringify(fields) + "\n" + body;
}
function encode(metadata, body) {
  const json = JSON.stringify(metadata).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  return `${MARKER}${json} -->\n${body}`;
}
function decode(text) {
  if (!text.startsWith(MARKER)) return null;
  const end = text.indexOf(" -->\n");
  if (end < 0 || end > 10 * 1024 * 1024) throw new Error("Web読込用Markdownの形式を確認できません。");
  let metadata;
  try { metadata = JSON.parse(text.slice(MARKER.length, end)); }
  catch { throw new Error("Web読込用Markdownの設定情報が壊れています。"); }
  if (metadata?.format !== "mojigoto-web-note" || ![1, 2, 3, 4].includes(metadata?.version) || metadata?.escapedHeadings !== true
      || !["plot", "reference"].includes(metadata.type)
      || !["workId", "noteId", "sourceFileName", "title", "generatedAt"].every((key) => typeof metadata[key] === "string")
      || !metadata.workId || !metadata.noteId
      || !["sourceHash", "bodyHash", "exportHash"].every((key) => /^[a-f0-9]{64}$/.test(metadata[key]))) {
    throw new Error("未対応、または不正なWeb読込用Markdownです。VS Codeで再生成してください。");
  }
  if (metadata.version >= 2) validateSourceIds(metadata.sourceIds);
  if (metadata.version >= 3) validateDetails(metadata);
  if (metadata.version >= 4) validateAttachments(metadata);
  return { metadata, body: text.slice(end + 5) };
}
function validateSourceIds(groups) {
  const groupIds = new Set(), itemIds = new Set();
  if (!Array.isArray(groups) || !groups.length) throw new Error("生成元の項目情報がありません。VS Codeで再生成してください。");
  for (const group of groups) {
    if (typeof group?.id !== "string" || !group.id || groupIds.has(group.id) || !Array.isArray(group.items)) throw new Error("生成元の大分類IDを確認してください。");
    groupIds.add(group.id);
    for (const item of group.items) {
      if (typeof item?.id !== "string" || !item.id || itemIds.has(item.id) || !["entry", "divider"].includes(item.kind)) throw new Error("生成元の項目IDを確認してください。");
      itemIds.add(item.id);
    }
  }
}
function validateParsedIds(metadata, note) {
  if (metadata.version < 2) return;
  if (metadata.sourceIds.length !== note.groups.length || metadata.sourceIds.some((group, index) =>
    group.items.length !== note.groups[index].items.length || group.items.some((item, i) => item.kind !== note.groups[index].items[i].kind))) {
    throw new Error("生成元と読込後の構造が一致しません。見出し・コードブロックを確認して再生成してください。");
  }
}
function restoreHeadings(groups) {
  for (const group of groups) for (const item of group.items || []) {
    if (item.kind !== "divider") item.body = item.body.replace(/^([^\S\r\n]*)\\(\\*#{1,3}(?:\s|　))/gm, "$1$2");
  }
}
const api = { CURRENT_VERSION, formatDetails, validateDetails, formatAttachments, validateAttachments, importedAddressBook, addressBookDetails, applyDetails, remapSelfLinks, findImportedTarget, normalizeImportedTarget,
  formatBody, canonical, encode, decode, restoreHeadings, validateSourceIds, validateParsedIds };
if (typeof module === "object" && module.exports) module.exports = api;
else Object.defineProperty(globalThis, Symbol.for("mojigoto.generatedNoteMarkdown"), { value: api });
})();
