import { normalizeNote, NOTE_TYPES } from "./notes.mjs";
import { normalizeConceptDocument } from "./concept-memos.mjs";
import { createLineDiffRows } from "./text-diff.mjs";

const INTERNAL_FIELDS = new Set([
  "id", "schemaVersion", "updatedAt", "createdAt", "sections",
  "conceptMemoSyncedAt", "conceptMemoSyncFingerprint",
]);
const LABELS = {
  headingRuby: "見出しのルビ", type: "種類", body: "本文", tags: "タグ",
  listItems: "リスト", todoItems: "チェックリスト", text: "内容",
  done: "完了", checked: "チェック", name: "名前", fileName: "ファイル名",
  relativePath: "画像の保存先", relatedReferences: "関連項目",
  noteTitle: "ノート", groupTitle: "分類", itemLabel: "項目",
  noteType: "ノートの種類", noteFileName: "ノートのファイル名",
  noteId: "参照先ノート", groupId: "参照先分類", itemId: "参照先項目",
  itemKind: "項目の種類", linkedConceptMemoIds: "連携する構想メモ",
  autoSyncToConceptMemo: "構想メモへの自動同期",
  autoSyncToConceptMemoOverride: "項目ごとの自動同期設定",
  order: "表示順", isPinned: "ピン留め", isArchived: "保管",
  showInDashboard: "ダッシュボードに表示", source: "出典",
  kind: "出典の種類", notePath: "ノートの保存先", itemHeading: "項目",
  status: "連携状態", autoSyncToNoteItem: "ノート項目への自動同期",
  autoSyncToNoteItemOverride: "メモごとの自動同期設定",
  autoSyncToNoteItemDefault: "ノート項目への自動同期の既定設定",
};

// Keep unfamiliar fields visible as well, so a new editable field cannot
// silently disappear from the restore comparison. Object key order is irrelevant.
function appendFields(lines, value, prefix = "", excluded = []) {
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value).sort()) {
    if (INTERNAL_FIELDS.has(key) || excluded.includes(key)) continue;
    const entry = value[key];
    if (entry === null || entry === undefined || entry === "") continue;
    const label = [prefix, LABELS[key] || key].filter(Boolean).join(" / ");
    if (Array.isArray(entry)) {
      entry.forEach((item, index) => {
        if (item && typeof item === "object") appendFields(lines, item, `${label} ${index + 1}`);
        else lines.push(`${label} ${index + 1}：${String(item)}`);
      });
    } else if (typeof entry === "object") {
      appendFields(lines, entry, label);
    } else {
      const text = typeof entry === "boolean" ? (entry ? "有効" : "無効") : String(entry);
      lines.push(`${label}：${text}`);
    }
  }
}

function appendAddressBook(lines, book) {
  if (!book || typeof book !== "object") return;
  const characters = Array.isArray(book.characters) ? book.characters : [];
  const labels = new Map(characters.map((person) => [person.id, person.label || "名前未設定"]));
  const personLabel = (id) => labels.get(id) || id;
  if (characters.length) lines.push("", "【呼び名表】");
  characters.forEach((person, index) => {
    lines.push(`人物 ${index + 1}：${personLabel(person.id)}`);
    appendFields(lines, person, "人物", ["label", "sourceKind", "sourceId"]);
  });
  // Sort by the displayed names, rather than the internal character IDs.
  const firstPerson = Object.entries(book.firstPerson || {})
    .map(([id, text]) => [`${personLabel(id)} / 一人称`, text]);
  const calls = Object.entries(book.calls || {}).map(([key, text]) => {
    const [from, to] = key.split("::");
    return [`${personLabel(from)} → ${personLabel(to)}`, text];
  });
  [...firstPerson, ...calls].sort(([a], [b]) => a.localeCompare(b, "ja"))
    .forEach(([label, text]) => lines.push(`${label}：${text}`));
  appendFields(lines, book, "呼び名表", ["characters", "firstPerson", "calls"]);
}

function noteComparisonText(value) {
  const note = normalizeNote(value);
  const lines = [`タイトル：${note.title}`, `種類：${NOTE_TYPES[note.type].label}`];
  if (note.order !== null) lines.push(`表示順：${note.order}`);
  note.groups.forEach((group, groupIndex) => {
    lines.push("", `【分類 ${groupIndex + 1}】${group.title}`);
    group.items.forEach((item, itemIndex) => {
      if (item.kind === "divider") {
        lines.push("", `【区切り ${itemIndex + 1}】${item.label}`, item.value);
      } else {
        lines.push("", `【項目 ${itemIndex + 1}】${item.heading}`);
        if (item.headingRuby) lines.push(`見出しのルビ：${item.headingRuby}`);
        lines.push("本文：", item.body);
        if (item.memo?.body) lines.push("メモ：", item.memo.body);
        appendFields(lines, item.memo, "メモ", ["body"]);
      }
      appendFields(lines, item, "", ["kind", "heading", "headingRuby", "body", "memo", "label", "value"]);
    });
    appendFields(lines, group, "分類", ["title", "items", "images"]);
    (group.images || []).forEach((image, index) => {
      lines.push(`【画像 ${index + 1}】`);
      appendFields(lines, image);
    });
  });
  appendAddressBook(lines, note.addressBook);
  appendFields(lines, note, "", ["title", "type", "order", "groups", "addressBook"]);
  return lines.join("\n").replace(/\r\n?/g, "\n");
}

function appendChecklist(lines, items, heading, checkField) {
  if (!items.length) return;
  lines.push(heading);
  items.forEach((item) => {
    lines.push(`[${item?.[checkField] ? "x" : " "}] ${String(item?.text || "")}`);
    appendFields(lines, item, "チェック項目", ["text", checkField]);
  });
}

function conceptComparisonText(value) {
  const data = normalizeConceptDocument(value);
  const lines = ["【構想メモ】"];
  const folderNames = new Map(data.folders.map((folder) => [folder.id, folder.name || "名前未設定"]));
  data.folders.forEach((folder, index) => {
    lines.push(`【フォルダ ${index + 1}】${folder.name || "名前未設定"}`);
    appendFields(lines, folder, "フォルダ", ["name"]);
  });
  data.memos.forEach((memo, index) => {
    lines.push("", `【メモ ${index + 1}】${memo.title}`);
    lines.push(`種類：${{ text: "テキスト", list: "リスト", todo: "チェックリスト" }[memo.type]}`);
    memo.folderIds.forEach((id) => lines.push(`所属フォルダ：${folderNames.get(id) || id}`));
    if (memo.type === "text" || memo.body) lines.push("本文：", memo.body);
    appendChecklist(lines, memo.listItems, "リスト：", "checked");
    appendChecklist(lines, memo.todoItems, "チェックリスト：", "done");
    appendFields(lines, memo, "", ["title", "type", "body", "listItems", "todoItems", "folderIds", "folderId", "source"]);
    // Synchronization bookkeeping does not change the memo's editable content.
    appendFields(lines, memo.source, "出典", ["syncedAt", "syncFingerprint"]);
  });
  appendChecklist(lines, data.commonTodoItems, "\n【共通チェック項目】", "done");
  appendFields(lines, data, "", ["version", "folders", "memos", "commonTodoItems"]);
  return lines.join("\n").replace(/\r\n?/g, "\n");
}

export function createBackupComparisonRows(before, after, targetType = "manuscript") {
  if (!["note", "conceptMemo"].includes(targetType)) return createLineDiffRows(before, after);
  // Convert both sides together. If either file is malformed, show the raw
  // comparison so the problem remains visible instead of implying equality.
  try {
    const values = [before, after].map((content) => JSON.parse(String(content).replace(/^\uFEFF/, "")));
    if (values.some((value) => !value || typeof value !== "object" || Array.isArray(value))) {
      return createLineDiffRows(before, after);
    }
    const comparisonText = targetType === "note" ? noteComparisonText : conceptComparisonText;
    return createLineDiffRows(...values.map(comparisonText));
  } catch {
    return createLineDiffRows(before, after);
  }
}
