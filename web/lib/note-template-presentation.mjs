import { NOTE_TYPES } from "./notes.mjs";
import { needsTemplateUpdate } from "./note-template-sync.mjs";
import { createLineDiffRows, selectDiffContext, summarizeLineDiff } from "./text-diff.mjs";

export function templateDestinationPresentation(destination, imported) {
  const name = destination?.entry?.data.title || "名前のないノート";
  const fields = imported.generated?.version >= 4 ? "分類・項目・本文・項目メモ・ふりがな・関連リンク・画像の関連付け・呼び名一覧" : imported.generated?.version >= 3 ? "分類・項目・本文・項目メモ・ふりがな・関連リンク" : "分類・項目・本文";
  switch (destination?.mode) {
    case "original": return { title: "原本を開く", detail: `VS Codeと同じノート「${name}」をそのまま編集します。Markdownの内容では上書きしません。`, action: "原本を開く", result: "元のノートを開きます。新規作成はしません。" };
    case "new": return { title: "新しいコピーを作成", detail: `${NOTE_TYPES[imported.note.type].label}に${fields}を含む別のノートを作ります。元のノートは変わりません。`, action: "コピーを作成して開く", result: `${NOTE_TYPES[imported.note.type].label}に新しいノートを1件作成します。` };
    case "copy": return !needsTemplateUpdate(destination.entry.data.importSource, imported.generated)
      ? { title: `読込済みのノートを開く：${name}`, detail: "前回と同じMarkdownです。Webのコピーを変更せず開きます。", action: "読込済みを開く", result: "保存済みのコピーをそのまま開きます。" }
      : { title: `前のコピーへ反映：${name}`, detail: `このコピーの${fields}を更新します。Web側にも変更があれば停止します。`, action: "既存ノートへ反映して開く", result: "前に作ったコピーの内容を更新します。" };
    case "adopt": return { title: `今後の読込先にする：${name}`, detail: "同じ内容のノートを登録します。本文は変更せず、次回からここへ反映します。", action: "読込先に登録して開く", result: "次回からの読込先を登録します。" };
    case "replace-select":
    case "replace": return { title: "既存ノートに上書き", detail: "作り直した内容で、選んだノートを置き換えます。上書き前にバックアップします。", action: "バックアップして上書き", result: destination.entry ? `「${name}」をMarkdownの内容に置き換えます。` : "上書きするノートを選んでください。" };
    default: return { title: "操作を選んでください", detail: "", action: "作成して開く", result: "操作を選択してください。" };
  }
}

function basicNoteText(note, details, attachments) {
  const lines = [];
  for (const group of note.groups) {
    lines.push(`大分類：${group.title}`);
    if (attachments) for (const image of group.images || []) lines.push(`画像の関連付け：${image.name || image.fileName} / ${image.relativePath}`);
    for (const item of group.items) {
      if (item.kind === "divider") lines.push(`区分：${item.label}`, `補足：${item.value || ""}`);
      else lines.push(`項目：${item.heading}`, String(item.body || "").replace(/\r\n?/g, "\n").trimEnd());
      if (details) {
        if (item.kind !== "divider") lines.push(`ふりがな：${item.headingRuby || ""}`, `項目メモ（${item.memo?.type === "list" ? "リスト" : "通常"}）：`, item.memo?.body || "", `タグ：${(item.memo?.tags || []).join(" / ")}`);
        for (const link of item.relatedReferences || []) {
          const source = link.importTarget || link;
          lines.push(`関連リンク：${link.noteTitle || "ノート"} / ${link.groupTitle || ""} / ${link.itemLabel || "項目"}`,
            `参照先：${source.noteType}:${source.noteId || source.noteFileName}:${source.groupId}:${source.itemId}`);
        }
      }
    }
  }
  if (attachments) for (const [label, book] of [["ノート内の呼び名一覧", note.addressBook], ["作品の呼び名一覧（取込版）", note.importedAddressBook?.book]]) {
    if (!book?.characters?.length) continue;
    const names = new Map(book.characters.map((person) => [person.id, person.label || "名前未設定"]));
    lines.push(label);
    for (const person of book.characters) lines.push(`人物：${names.get(person.id)} / 一人称：${book.firstPerson?.[person.id] || ""}`);
    for (const [key, text] of Object.entries(book.calls || {})) {
      const [from, to] = key.split("::");
      lines.push(`${names.get(from) || from} → ${names.get(to) || to}：${text}`);
    }
  }
  return lines.join("\n");
}
export function createTemplateComparison(current, imported, { details = false, attachments = false } = {}) {
  const rows = createLineDiffRows(basicNoteText(current, details, attachments), basicNoteText(imported, details, attachments));
  return { rows: selectDiffContext(rows, { context: 2 }), summary: summarizeLineDiff(rows) };
}
export function templateComparisonPage(comparison, page = 0) {
  const pages = Math.max(1, Math.ceil(comparison.rows.length / 100));
  const index = Math.max(0, Math.min(pages - 1, page));
  return { rows: comparison.rows.slice(index * 100, (index + 1) * 100), index, pages };
}
