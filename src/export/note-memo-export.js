const { escapeHtml } = require("../core/path-utils");
const { convertNoteInlineMarkupToHtml } = require("./note-html-utils");
const { formatItemMemoMarkdown } = require("../../web/lib/note-markdown-core");

function noteMemoContent(item) {
  const memo = item?.kind === "divider" ? null : item?.memo;
  const body = String(memo?.body || "").replace(/\r\n?/g, "\n");
  const tags = [...new Set((Array.isArray(memo?.tags) ? memo.tags : []).map(tag => String(tag).trim()).filter(Boolean))];
  return { type: memo?.type === "list" ? "list" : "text", body, tags };
}

function hasItemMemo(item) {
  const memo = noteMemoContent(item);
  return Boolean(memo.body.trim() || memo.tags.length);
}

function hasNoteMemos(note) {
  return (note?.groups || []).some(group => (group.items || []).some(hasItemMemo));
}

function memoTagText(item) {
  return noteMemoContent(item).tags.map(tag => `#${tag.replace(/^#+/, "")}`).join(" ");
}

function noteMemoTxt(item) {
  if (!hasItemMemo(item)) return "";
  const memo = noteMemoContent(item);
  return ["【項目メモ】", memo.body, memo.tags.length ? `タグ: ${memoTagText(item)}` : ""].filter(Boolean).join("\n");
}

function noteMemoHtml(item) {
  if (!hasItemMemo(item)) return "";
  const memo = noteMemoContent(item);
  return `<section class="noteItemMemo" aria-label="項目メモ"><div class="noteItemMemoLabel">項目メモ</div>${memo.body ? `<div class="noteItemMemoBody">${convertNoteInlineMarkupToHtml(memo.body)}</div>` : ""}${memo.tags.length ? `<div class="noteItemMemoTags">${escapeHtml(memoTagText(item))}</div>` : ""}</section>`;
}

function noteMemoHtmlStyle() {
  return `.noteItemMemo { margin: 10px 0; padding: 10px 12px; border-left: 3px solid #999; background: #f5f5f5; }
.noteItemMemoLabel { margin-bottom: 6px; font-size: .85em; font-weight: bold; }
.noteItemMemoBody { white-space: pre-wrap; }
.noteItemMemoTags { margin-top: 6px; font-size: .85em; color: #555; overflow-wrap: anywhere; }`;
}

async function pickIncludeNoteMemos(vscode, notes) {
  if (!notes.some(hasNoteMemos)) return false;
  const picked = await vscode.window.showQuickPick([
    { label: "項目メモを含めない", description: "大分類・区分・項目詳細を書き出します", value: false },
    { label: "項目メモを含める", description: "項目メモの本文・タグも書き出します", value: true },
  ], { title: "もじごと: HTMLの項目メモ", ignoreFocusOut: true });
  return picked?.value;
}

module.exports = { noteMemoContent, hasItemMemo, hasNoteMemos, memoTagText, noteMemoTxt, noteMemoHtml, noteMemoHtmlStyle, pickIncludeNoteMemos, formatItemMemoMarkdown };
