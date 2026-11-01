const { notePrintStyle } = require("./note-print-style");
const { escapeHtml } = require("../core/path-utils");
const { convertNoteInlineMarkupToHtml, renderNoteEntryHeadingHtml } = require("./note-html-utils");
const { hasItemMemo, noteMemoTxt, noteMemoHtml, noteMemoHtmlStyle, formatItemMemoMarkdown } = require("./note-memo-export");

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

h2,h3,h4{
  margin: 0.5em 0;
}

h1,h2,h3,h4{
  line-height: 1.4;
  break-after: avoid-page;
  page-break-after: avoid;
}

h1{ font-size: 20px; }
h2,h3{ font-size: 18px; }
h4{ font-size: 16px; border-bottom: 4px double #555; margin: 0.5em 0 0.9em; }

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

.sectionDivider{
  margin: 28px 0;
}

.bundleSection {
  margin-bottom: 28px;
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
  h2,h3,h4{ font-size: 12pt; }

  .sectionDivider{
    display:  none;
    margin: 0;
  }

  .bundleSection {
    break-before: page;
    page-break-before: always;
  }

  .bundleSection:first-of-type {
    break-before: auto;
    page-break-before: auto;
  }
}
`;
}

function formatSettingsGenre(settings, environment) {
  return environment.getGenreDisplayText(settings);
}

function formatSettingsSectionTxt(settings, environment) {
  const exportOptions = environment.getEffectiveExportOptions(settings);
  return [
    "==== 設定 ====",
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
    "[あらすじ]",
    settings.summary || "",
    "",
    "[メモ]",
    settings.memo || "",
    "",
  ].join("\n");
}

function formatSettingsSectionMd(settings, environment) {
  const exportOptions = environment.getEffectiveExportOptions(settings);
  return [
    "## 設定",
    "",
    `- 作品名: ${settings.title || ""}`,
    ...(exportOptions.includeSubtitle && settings.subtitle
      ? [`- 補助タイトル: ${settings.subtitle}`]
      : []),
    `- フォルダ名: ${settings.folderName || ""}`,
    `- ジャンル: ${formatSettingsGenre(settings, environment)}`,
    `- 目標文字数: ${settings.targetChars || 0}`,
    `- 締切: ${settings.deadline || ""}`,
    `- ペンネーム: ${settings.penName || ""}`,
    "",
    "### あらすじ",
    "",
    settings.summary || "（未入力）",
    "",
    "### メモ",
    "",
    settings.memo || "（未入力）",
    "",
  ].join("\n");
}

function formatSettingsSectionHtml(settings, environment) {
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

  return [
    `<section class="bundleSection">`,
    `<h2>設定</h2>`,

    `<dl class="meta">`,
    metaRows.join("\n"),
    `</dl>`,

    `<h3>あらすじ</h3>`,
    `<div class="block">${escapeHtml(settings.summary || "")}</div>`,

    exportOptions.includeMemo
      ? `<h3>メモ</h3>
<div class="block">${escapeHtml(settings.memo || "")}</div>`
      : "",

    `</section>`,
  ].join("\n");
}

function noteToTxtSection(note, headingLabel) {
  const lines = [];
  lines.push(`${headingLabel}: ${note.title || ""}`);
  lines.push("");

  for (const group of Array.isArray(note.groups) ? note.groups : []) {
    const groupTitle = String(group?.title || "").trim();
    if (groupTitle) {
      lines.push(`【${groupTitle}】`);
      lines.push("");
    }

    for (const item of Array.isArray(group.items) ? group.items : []) {
      if (item?.kind === "divider") {
        const label = String(item?.label || "").trim();
        const value = String(item?.value || "").trim();
        if (label || value) {
          lines.push(`${label}: ${value}`);
          lines.push("");
        }
      } else {
        const heading = String(item?.heading || "").trim();
        const body = String(item?.body || "");
        if (heading) {
          lines.push(heading);
          lines.push("");
        }
        if (body) {
          lines.push(body);
          lines.push("");
        }
        if (hasItemMemo(item)) lines.push(noteMemoTxt(item), "");
      }
    }
  }

  return lines.join("\n");
}

function noteToMdSection(note, headingLabel) {
  const lines = [];
  lines.push(`### ${headingLabel}: ${note.title || ""}`);
  lines.push("");

  for (const group of Array.isArray(note.groups) ? note.groups : []) {
    const groupTitle = String(group?.title || "").trim();
    if (groupTitle) {
      lines.push(`#### ${groupTitle}`);
      lines.push("");
    }

    for (const item of Array.isArray(group.items) ? group.items : []) {
      if (item?.kind === "divider") {
        const label = String(item?.label || "").trim();
        const value = String(item?.value || "").trim();

        if (label) {
          lines.push(`##### ${label}`);
          lines.push("");
        }
        if (value) {
          lines.push(value);
          lines.push("");
        }
      } else {
        const heading = String(item?.heading || "").trim();
        const body = String(item?.body || "");
        if (heading) {
          lines.push(`##### ${heading}`);
          lines.push("");
        }
        lines.push(body || " ");
        lines.push("");
        if (hasItemMemo(item)) lines.push(formatItemMemoMarkdown(item.memo), "");
      }
    }
  }

  return lines.join("\n");
}

function noteToHtmlSection(note, headingLabel, { includeItemMemos = false } = {}) {
  const parts = [];
  parts.push(`<section class="bundleSection">`);
  parts.push(
    `<h3>${escapeHtml(headingLabel)}: ${escapeHtml(note.title || "")}</h3>`,
  );

  for (const group of Array.isArray(note.groups) ? note.groups : []) {
    const groupTitle = String(group?.title || "").trim();
    if (groupTitle) {
      parts.push(`<h4>${escapeHtml(groupTitle)}</h4>`);
    }

    for (const item of Array.isArray(group.items) ? group.items : []) {
      if (item?.kind === "divider") {
        const label = String(item?.label || "").trim();
        const value = String(item?.value || "").trim();

        if (!label && !value) {
          continue;
        }

        parts.push(`<section class="dividerBlock">`);

        if (label) {
          parts.push(`<div class="dividerTitle">${escapeHtml(label)}</div>`);
        }

        if (value) {
          parts.push(
            `<div class="dividerSupplement">${escapeHtml(value)}</div>`,
          );
        }

        parts.push(`</section>`);
        continue;
      }

      const heading = String(item?.heading || "").trim();
      const body = String(item?.body || "").trim();

      if (!heading && !body && !(includeItemMemos && hasItemMemo(item))) {
        continue;
      }

      parts.push(`<section class="noteEntry">`);

      if (heading) {
        parts.push(
          `<div class="noteEntryTitle">${renderNoteEntryHeadingHtml(item)}</div>`,
        );
      }

      if (body) {
        parts.push(
          `<div class="block noteEntryBody">${convertNoteInlineMarkupToHtml(body)}</div>`,
        );
      }

      if (includeItemMemos) parts.push(noteMemoHtml(item));
      parts.push(`</section>`);
    }
  }

  parts.push(`</section>`);
  return parts.join("\n");
}

function buildBundleTxt(bundle, environment) {
  const sections = [];

  sections.push(`${bundle.title} まとめ`);
  sections.push("");

  if (bundle.settings) {
    sections.push(formatSettingsSectionTxt(bundle.settings, environment));
  }

  if (bundle.plotNotes.length > 0) {
    sections.push("==== プロット ====");
    sections.push("");

    for (const note of bundle.plotNotes) {
      sections.push(noteToTxtSection(note, "プロット"));
      sections.push("");
    }
  }

  if (bundle.referenceNotes.length > 0) {
    sections.push("==== 資料 ====");
    sections.push("");

    for (const note of bundle.referenceNotes) {
      sections.push(noteToTxtSection(note, "資料"));
      sections.push("");
    }
  }

  return sections.join("\n");
}

function buildBundleMd(bundle, environment) {
  const sections = [];

  sections.push(`# ${bundle.title} まとめ`);
  sections.push("");

  if (bundle.settings) {
    sections.push(formatSettingsSectionMd(bundle.settings, environment));
    sections.push("");
  }

  if (bundle.plotNotes.length > 0) {
    if (sections.length > 2) {
      sections.push("---");
      sections.push("");
    }

    sections.push("## プロット");
    sections.push("");

    for (const note of bundle.plotNotes) {
      sections.push(noteToMdSection(note, "プロット"));
      sections.push("");
    }
  }

  if (bundle.referenceNotes.length > 0) {
    if (bundle.settings || bundle.plotNotes.length > 0) {
      sections.push("---");
      sections.push("");
    }

    sections.push("## 資料");
    sections.push("");

    for (const note of bundle.referenceNotes) {
      sections.push(noteToMdSection(note, "資料"));
      sections.push("");
    }
  }

  return sections.join("\n");
}


function buildBundleHtml(bundle, options = {}, environment) {
  const settingsSection = bundle.settings
    ? formatSettingsSectionHtml(bundle.settings, environment)
    : "";

  const plotSection =
    bundle.plotNotes.length > 0
      ? [
          "<section class='bundleSection'>",
          bundle.plotNotes
            .map((note) => noteToHtmlSection(note, "プロット", options))
            .join("\n<hr class='sectionDivider'>\n"),
          "</section>",
        ].join("\n")
      : "";

  const referenceSection =
    bundle.referenceNotes.length > 0
      ? [
          "<section class='bundleSection'>",
          bundle.referenceNotes
            .map((note) => noteToHtmlSection(note, "資料", options))
            .join("\n<hr class='sectionDivider'>\n"),
          "</section>",
        ].join("\n")
      : "";

  const bodySections = [settingsSection, plotSection, referenceSection].filter(
    Boolean,
  );

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(bundle.title)} まとめ</title>
<style>
${getExportHtmlStyle()}
${noteMemoHtmlStyle()}
${notePrintStyle()}
</style>
</head>
<body>
<main class="exportDocument">
<h1>${escapeHtml(bundle.title)}</h1>
${bodySections.join('\n<hr class="sectionDivider">\n')}
</main>
</body>
</html>`;
}

function buildNoteTypeBundleTxt(bundle) {
  const typeLabel = bundle.noteType === "plot" ? "プロット" : "資料";
  const sections = [];

  sections.push(`${bundle.title} ${typeLabel}まとめ`);
  sections.push("");

  if (bundle.notes.length > 0) {
    for (const note of bundle.notes) {
      sections.push(noteToTxtSection(note, typeLabel));
      sections.push("");
    }
  }

  return sections.join("\n");
}

function buildNoteTypeBundleMd(bundle) {
  const typeLabel = bundle.noteType === "plot" ? "プロット" : "資料";
  const sections = [];

  sections.push(`# ${bundle.title} ${typeLabel}まとめ`);
  sections.push("");

  for (const note of bundle.notes) {
    sections.push(noteToMdSection(note, typeLabel));
    sections.push("");
  }

  return sections.join("\n");
}

function buildNoteTypeBundleHtml(bundle, options = {}) {
  const typeLabel = bundle.noteType === "plot" ? "プロット" : "資料";

  const noteSections = bundle.notes
    .map((note) => noteToHtmlSection(note, typeLabel, options))
    .join("\n<hr class='sectionDivider'>\n");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(bundle.title)} ${escapeHtml(typeLabel)}まとめ</title>
<style>
${getExportHtmlStyle()}
${noteMemoHtmlStyle()}
${notePrintStyle()}
</style>
</head>
<body>
<main class="exportDocument">
<h1>${escapeHtml(bundle.title)}</h1>
${noteSections}
</main>
</body>
</html>`;
}

// 単体とは見出しとスタイルが異なるため、まとめ出力の規則を独立して保つ。
function createBundleExportFormatters(environment) {
  return {
    buildBundleTxt: bundle => buildBundleTxt(bundle, environment),
    buildBundleMd: bundle => buildBundleMd(bundle, environment),
    buildBundleHtml: (bundle, options) => buildBundleHtml(bundle, options, environment),
    buildNoteTypeBundleTxt, buildNoteTypeBundleMd, buildNoteTypeBundleHtml,
  };
}

module.exports = { createBundleExportFormatters };
