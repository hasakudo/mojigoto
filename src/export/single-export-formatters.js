const { notePrintStyle } = require("./note-print-style");
const { escapeHtml } = require("../core/path-utils");
const { convertNoteInlineMarkupToHtml, renderNoteEntryHeadingHtml } = require("./note-html-utils");
const { nowJstParts } = require("../stats/stats-utils");
const {
  noteMemoContent, hasItemMemo, memoTagText, noteMemoTxt,
  noteMemoHtml, noteMemoHtmlStyle, formatItemMemoMarkdown,
} = require("./note-memo-export");

function formatDateTimeJst(value) {
  if (!value) return "";

  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);

  return nowJstParts(d).dateTimeJst;
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function getExportHtmlStyle() {
  return `
@page {
  margin: 11mm;
}

body{
  font-family: sans-serif;
  line-height: 1.6;
  margin: 32px;
  color: #222;
  background: #fff;
}

.exportDocument{
  max-width: 980px;
  margin: 0 auto;
}

h1{
  margin-top: 0;
}

h1,h2{
  line-height: 1.4;
  break-after: avoid-page;
  page-break-after: avoid;
}

h1{ font-size: 20px; }
h2{ font-size: 18px; }

h2{ border-bottom: 4px double #555; margin: 0.5em 0 0.9em; }

.meta dt{
  font-weight: bold;
}

.meta dd{
  margin: 0 0 10px 0;
}

.block{
  white-space: pre-wrap;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 14px;
  background: #fafafa;
  margin-bottom: 14px;
}

.dividerBlock{
  margin: 18px 0 14px;
  padding: 10px 12px;
  border-left: 4px solid #777;
  background: #f2f2f2;
  break-inside: avoid;
  page-break-inside: avoid;
}

.dividerTitle{
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: bold;
  line-height: 1.4;
}

.dividerSupplement{
  white-space: pre-wrap;
  margin: 0;
  color: #333;
}

.noteEntry{
  margin: 12px 0 18px;
  break-inside: avoid;
  page-break-inside: avoid;
}

.noteEntryTitle{
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: bold;
  line-height: 1.4;
}

.noteEntryBody{
  white-space: pre-wrap;
}

ruby{
  ruby-position: over;
}

rt{
  font-size: 0.55em;
  font-weight: normal;
}

.noteBouten{
  text-emphasis: filled dot;
  -webkit-text-emphasis: filled dot;
}

@media print {
  body {
    margin: 0;
    color: #000;
    background: #fff;
    font-size: 15px;
  }

  .exportDocument{
    max-width: none;
  }

  .block,
  .dividerBlock{
    border: none;
    border-radius: 0;
    background: transparent;
    padding: 0;
  }

  .dividerBlock{
    border-left: 2pt solid #000;
    padding-left: 8pt;
  }

  h1{ font-size: 14pt; }
  h2{ font-size: 12pt; }
}
`;
}

function formatSettingsGenre(settings, environment) {
  return environment.getGenreDisplayText(settings);
}

function formatSettingsTxt(settings, environment) {
  const exportOptions = environment.getEffectiveExportOptions(settings);
  return [
    "作品設定",
    "",
    `作品名: ${settings.title || ""}`,
    ...(exportOptions.includeSubtitle && settings.subtitle
      ? [`補助タイトル: ${settings.subtitle}`]
      : []),
    `フォルダ名: ${settings.folderName || ""}`,
    `ジャンル: ${formatSettingsGenre(settings, environment)}`,
    `目標文字数: ${settings.targetChars || 0}`,
    `締切: ${settings.deadline || ""}`,
    `ペンネーム: ${settings.penName || ""}`,
    "",
    "あらすじ",
    "--------",
    settings.summary || "",
    "",
    "メモ",
    "--------",
    settings.memo || "",
    "",
    `更新日時: ${formatDateTimeJst(settings.updatedAt || "")}`,
    "",
  ].join("\n");
}

function formatSettingsMd(settings, environment) {
  const exportOptions = environment.getEffectiveExportOptions(settings);
  return [
    `# ${settings.title || settings.folderName || "作品設定"}`,
    "",
    "## 基本情報",
    "",
    ...(exportOptions.includeSubtitle && settings.subtitle
      ? [`- 補助タイトル: ${settings.subtitle}`]
      : []),
    `- フォルダ名: ${settings.folderName || ""}`,
    `- ジャンル: ${formatSettingsGenre(settings, environment)}`,
    `- 目標文字数: ${settings.targetChars || 0}`,
    `- 締切: ${settings.deadline || ""}`,
    `- ペンネーム: ${settings.penName || ""}`,
    `- 更新日時: ${formatDateTimeJst(settings.updatedAt || "")}`,
    "",
    "## あらすじ",
    "",
    settings.summary || "（未入力）",
    "",
    "## メモ",
    "",
    settings.memo || "（未入力）",
    "",
  ].join("\n");
}

function formatSettingsCsv(settings, environment) {
  const exportOptions = environment.getEffectiveExportOptions(settings);
  const rows = [
    ["field", "value"],
    ["title", settings.title || ""],
    ...(exportOptions.includeSubtitle && settings.subtitle
      ? [["subtitle", settings.subtitle]]
      : []),
    ["folderName", settings.folderName || ""],
    ["genre", formatSettingsGenre(settings, environment)],
    ["targetChars", String(settings.targetChars || 0)],
    ["deadline", settings.deadline || ""],
    ["penName", settings.penName || ""],
    ["summary", settings.summary || ""],
    ["memo", settings.memo || ""],
    ["updatedAt", formatDateTimeJst(settings.updatedAt || "")],
  ];

  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

function formatSettingsHtml(settings, environment) {
  const exportOptions = environment.getEffectiveExportOptions(settings);

  const metaRows = [];

  metaRows.push(`<dt>作品名</dt><dd>${escapeHtml(settings.title || "")}</dd>`);

  if (exportOptions.includeSubtitle && settings.subtitle) {
    metaRows.push(
      `<dt>補助タイトル</dt><dd>${escapeHtml(settings.subtitle)}</dd>`,
    );
  }

  if (exportOptions.includeFolderName) {
    metaRows.push(
      `<dt>フォルダ名</dt><dd>${escapeHtml(settings.folderName || "")}</dd>`,
    );
  }

  if (exportOptions.includeGenre) {
    metaRows.push(
      `<dt>ジャンル</dt><dd>${escapeHtml(formatSettingsGenre(settings, environment))}</dd>`,
    );
  }

  if (exportOptions.includeTargetChars) {
    metaRows.push(
      `<dt>目標文字数</dt><dd>${escapeHtml(settings.targetChars || 0)}</dd>`,
    );
  }

  if (exportOptions.includeDeadline) {
    metaRows.push(
      `<dt>締切</dt><dd>${escapeHtml(settings.deadline || "")}</dd>`,
    );
  }

  if (exportOptions.includePenName) {
    metaRows.push(
      `<dt>ペンネーム</dt><dd>${escapeHtml(settings.penName || "")}</dd>`,
    );
  }

  if (exportOptions.includeUpdatedAt) {
    metaRows.push(
      `<dt>更新日時</dt><dd>${formatDateTimeJst(settings.updatedAt || "")}</dd>`,
    );
  }

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(settings.title || settings.folderName || "作品設定")}</title>
<style>
${getExportHtmlStyle()}
</style>
</head>
<body>
<main class="exportDocument">

<h1>${escapeHtml(settings.title || settings.folderName || "作品設定")}</h1>

<h2>基本情報</h2>
<dl class="meta">
${metaRows.join("\n")}
</dl>

<h2>あらすじ</h2>
<div class="block">${escapeHtml(settings.summary || "")}</div>

${
  exportOptions.includeMemo
    ? `<h2>メモ</h2>
<div class="block">${escapeHtml(settings.memo || "")}</div>`
    : ""
}

</main>
</body>
</html>`;
}

function flattenNoteGroups(note) {
  const rows = [];

  for (const group of Array.isArray(note.groups) ? note.groups : []) {
    const groupTitle = String(group?.title || "");

    for (const item of Array.isArray(group.items) ? group.items : []) {
      if (item?.kind === "divider") {
        rows.push({
          groupTitle,
          kind: "divider",
          heading: String(item?.label || ""),
          body: String(item?.value || ""),
          memoBody: "", memoTags: "",
        });
      } else {
        rows.push({
          groupTitle,
          kind: "entry",
          heading: String(item?.heading || ""),
          body: String(item?.body || ""),
          memoBody: noteMemoContent(item).body, memoTags: memoTagText(item),
        });
      }
    }
  }

  return rows;
}

function formatNoteTxt(note) {
  const lines = [];
  lines.push(note.title || "");
  lines.push("");

  for (const group of Array.isArray(note.groups) ? note.groups : []) {
    const title = String(group?.title || "").trim();
    if (title) {
      lines.push(`【${title}】`);
      lines.push("");
    }

    for (const item of Array.isArray(group.items) ? group.items : []) {
      if (item?.kind === "divider") {
        const label = String(item?.label || "").trim();
        const value = String(item?.value || "").trim();
        lines.push(`${label}: ${value}`);
        lines.push("");
      } else {
        const heading = String(item?.heading || "").trim();
        const body = String(item?.body || "");
        if (heading) {
          lines.push(heading);
        }
        if (body) {
          lines.push(body);
        }
        if (hasItemMemo(item)) lines.push(noteMemoTxt(item));
        lines.push("");
      }
    }
  }

  lines.push(`更新日時: ${formatDateTimeJst(note.updatedAt || "")}`);
  lines.push("");
  return lines.join("\n");
}

function formatNoteMd(note) {
  const lines = [];

  for (const group of Array.isArray(note.groups) ? note.groups : []) {
    const groupTitle = String(group?.title || "").trim() || "無題大分類";
    lines.push(`# ${groupTitle}`);
    lines.push("");

    for (const item of Array.isArray(group.items) ? group.items : []) {
      if (item?.kind === "divider") {
        const label = String(item?.label || "").trim() || "無題区分";
        const value = String(item?.value || "")
          .replace(/\r\n?/g, "\n")
          .trim();

        lines.push(`## ${label}`);

        if (value) {
          const supplementLines = value.split("\n");
          for (const line of supplementLines) {
            lines.push(`> 補足: ${line}`);
          }
        }

        lines.push("");
        continue;
      }

      const heading = String(item?.heading || "").trim() || "無題項目";
      const body = String(item?.body || "").replace(/\r\n?/g, "\n");

      lines.push(`### ${heading}`);
      if (body) {
        lines.push(body);
      }
      if (hasItemMemo(item)) lines.push("", formatItemMemoMarkdown(item.memo));
      lines.push("");
    }
  }

  return (
    lines
      .join("\n")
      .trim() + "\n"
  );
}

function formatNoteCsv(note) {
  const rows = [["大分類", "種別", "区分名", "項目名", "補足・詳細", "項目メモ", "項目メモのタグ"]];

  for (const row of flattenNoteGroups(note)) {
    if (row.kind === "divider") {
      rows.push([row.groupTitle, "区分", row.heading, "", row.body, "", ""]);
      continue;
    }

    rows.push([row.groupTitle, "項目", "", row.heading, row.body, row.memoBody, row.memoTags]);
  }

  rows.push([
    "",
    "更新情報",
    "",
    "更新日時",
    formatDateTimeJst(note.updatedAt || ""),
    "", "",
  ]);

  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

function formatNoteHtml(note, { includeItemMemos = false } = {}) {
  const blocks = [];

  for (const group of Array.isArray(note.groups) ? note.groups : []) {
    const title = String(group?.title || "").trim();
    if (title) {
      blocks.push(`<h2>${escapeHtml(title)}</h2>`);
    }

    for (const item of Array.isArray(group.items) ? group.items : []) {
      if (item?.kind === "divider") {
        const label = String(item?.label || "").trim();
        const value = String(item?.value || "").trim();

        if (!label && !value) {
          continue;
        }

        blocks.push(`<section class="dividerBlock">`);

        if (label) {
          blocks.push(`<div class="dividerTitle">${escapeHtml(label)}</div>`);
        }

        if (value) {
          blocks.push(
            `<div class="dividerSupplement">${escapeHtml(value)}</div>`,
          );
        }

        blocks.push(`</section>`);
        continue;
      }

      const heading = String(item?.heading || "").trim();
      const body = String(item?.body || "").trim();

      if (!heading && !body && !(includeItemMemos && hasItemMemo(item))) {
        continue;
      }

      blocks.push(`<section class="noteEntry">`);

      if (heading) {
        blocks.push(
          `<div class="noteEntryTitle">${renderNoteEntryHeadingHtml(item)}</div>`,
        );
      }

      if (body) {
        blocks.push(
          `<div class="block noteEntryBody">${convertNoteInlineMarkupToHtml(body)}</div>`,
        );
      }

      if (includeItemMemos) blocks.push(noteMemoHtml(item));
      blocks.push(`</section>`);
    }
  }

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(note.title || "ノート")}</title>
<style>
${getExportHtmlStyle()}
${noteMemoHtmlStyle()}
${notePrintStyle()}
</style>
</head>
<body>
<main class="exportDocument">
<h1>${escapeHtml(note.title || "ノート")}</h1>
${blocks.join("\n")}
<p>更新日時: ${escapeHtml(formatDateTimeJst(note.updatedAt || ""))}</p>
</main>
</body>
</html>`;
}

// 設定取得は呼び出し元へ委ね、形式ごとの整形からUIと保存を分離する。
function createSingleExportFormatters(environment) {
  const settings = {
    txt: value => formatSettingsTxt(value, environment),
    md: value => formatSettingsMd(value, environment),
    csv: value => formatSettingsCsv(value, environment),
    html: value => formatSettingsHtml(value, environment),
  };
  return {
    getFormatters(sourceType) {
      return sourceType === "settings"
        ? { ...settings }
        : { txt: formatNoteTxt, md: formatNoteMd, csv: formatNoteCsv, html: formatNoteHtml };
    },
    formatSettingsTxt: settings.txt,
    formatSettingsMd: settings.md,
    formatSettingsCsv: settings.csv,
    formatSettingsHtml: settings.html,
  };
}

module.exports = { createSingleExportFormatters };
