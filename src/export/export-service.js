const vscode = require("vscode");
const fs = require("fs/promises");
const path = require("path");
const { readNoteFile } = require("../data/note-store");
const { nowJstParts } = require("../stats/stats-utils");
const {
  resolveExportDirForTarget,
  getEffectiveExportOptions,
  ensureNamedExportDir,
} = require("./export-utils");

const { isSingleMode } = require("../core/mojigoto-context");
const {
  readSettingsFile,
  resolveSettingsTarget,
  getGenreDisplayText,
} = require("../data/settings-store");
const { escapeHtml } = require("../core/path-utils");
const { resolveTargetWorkContext } = require("../core/mojigoto-paths");

function formatDateTimeJst(value) {
  if (!value) return "";

  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);

  return nowJstParts(d).dateTimeJst;
}

function sanitizeFileName(input, fallback = "export") {
  const s = String(input || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ");
  return s || fallback;
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildSingleExportFileName(baseName, format) {
  if (format === "md") {
    return `${baseName}.${format}`;
  }

  const stamp = formatDateStamp();
  return `${baseName}_${stamp}.${format}`;
}

function buildSettingsExportFileName(settings, format) {
  const title = sanitizeFileName(
    settings?.title || settings?.folderName || "作品",
    "作品",
  );

  return `${title}_作品設定.${format}`;
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

function formatDateStamp(date = new Date()) {
  const y = String(date.getFullYear());
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

async function resolveExportDir(context, item, source = null) {
  const settings =
    source?.sourceType === "settings" && source?.data ? source.data : null;

  // Singleモードのプロット/資料単一書き出しは item に workName/workTitle がないため、
  // 現在の作品名から書き出し先を決める。
  if (isSingleMode() && source?.sourceType !== "settings") {
    const dir = await ensureNamedExportDir(context, "ノート書き出し");

    if (!dir) return "";

    return dir;
  }

  const targetWork = resolveTargetWorkContext({
    workDir: String(item?.workDir || ""),
    workName:
      String(item?.workName || "").trim() ||
      String(settings?.folderName || "").trim(),
    workTitle:
      String(item?.workTitle || "").trim() ||
      String(settings?.title || "").trim(),
  });

  const dir = await resolveExportDirForTarget(
    context,
    targetWork,
    "ノート書き出し",
  );

  if (!dir) return "";

  return dir;
}

function formatSettingsGenre(settings) {
  return getGenreDisplayText(settings);
}

function formatSettingsTxt(settings) {
  return [
    "作品設定",
    "",
    `作品名: ${settings.title || ""}`,
    `フォルダ名: ${settings.folderName || ""}`,
    `ジャンル: ${formatSettingsGenre(settings)}`,
    `目標文字数: ${settings.targetChars || 0}`,
    `締切: ${settings.deadline || ""}`,
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

function formatSettingsMd(settings) {
  return [
    `# ${settings.title || settings.folderName || "作品設定"}`,
    "",
    "## 基本情報",
    "",
    `- フォルダ名: ${settings.folderName || ""}`,
    `- ジャンル: ${formatSettingsGenre(settings)}`,
    `- 目標文字数: ${settings.targetChars || 0}`,
    `- 締切: ${settings.deadline || ""}`,
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

function formatSettingsCsv(settings) {
  const rows = [
    ["field", "value"],
    ["title", settings.title || ""],
    ["folderName", settings.folderName || ""],
    ["genre", formatSettingsGenre(settings)],
    ["targetChars", String(settings.targetChars || 0)],
    ["deadline", settings.deadline || ""],
    ["summary", settings.summary || ""],
    ["memo", settings.memo || ""],
    ["updatedAt", formatDateTimeJst(settings.updatedAt || "")],
  ];

  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

function formatSettingsHtml(settings) {
  const exportOptions = getEffectiveExportOptions(settings);

  const metaRows = [];

  metaRows.push(`<dt>作品名</dt><dd>${escapeHtml(settings.title || "")}</dd>`);

  if (exportOptions.includeFolderName) {
    metaRows.push(
      `<dt>フォルダ名</dt><dd>${escapeHtml(settings.folderName || "")}</dd>`,
    );
  }

  if (exportOptions.includeGenre) {
    metaRows.push(
      `<dt>ジャンル</dt><dd>${escapeHtml(formatSettingsGenre(settings))}</dd>`,
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
        });
      } else {
        rows.push({
          groupTitle,
          kind: "entry",
          heading: String(item?.heading || ""),
          body: String(item?.body || ""),
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
      lines.push("");
    }
  }

  return (
    lines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}

function formatNoteCsv(note) {
  const rows = [["大分類", "種別", "区分名", "項目名", "補足・詳細"]];

  for (const row of flattenNoteGroups(note)) {
    if (row.kind === "divider") {
      rows.push([row.groupTitle, "区分", row.heading, "", row.body]);
      continue;
    }

    rows.push([row.groupTitle, "項目", "", row.heading, row.body]);
  }

  rows.push([
    "",
    "更新情報",
    "",
    "更新日時",
    formatDateTimeJst(note.updatedAt || ""),
  ]);

  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

function formatNoteHtml(note) {
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

      if (!heading && !body) {
        continue;
      }

      blocks.push(`<section class="noteEntry">`);

      if (heading) {
        blocks.push(`<div class="noteEntryTitle">${escapeHtml(heading)}</div>`);
      }

      if (body) {
        blocks.push(
          `<div class="block noteEntryBody">${escapeHtml(body)}</div>`,
        );
      }

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

function getFormatters(sourceType) {
  if (sourceType === "settings") {
    return {
      txt: formatSettingsTxt,
      md: formatSettingsMd,
      csv: formatSettingsCsv,
      html: formatSettingsHtml,
    };
  }

  return {
    txt: formatNoteTxt,
    md: formatNoteMd,
    csv: formatNoteCsv,
    html: formatNoteHtml,
  };
}

async function loadSourceData(item) {
  if (item?.kind === "settingsEntry") {
    const target = await resolveSettingsTarget(item);
    const settings = await readSettingsFile(target.path, item);
    return {
      sourceType: "settings",
      title: settings.title || settings.folderName || "設定",
      data: settings,
    };
  }

  if (item?.kind === "noteFile") {
    const noteType = item.noteType || "plot";
    const note = await readNoteFile(item.fsPath, noteType);
    return {
      sourceType: noteType,
      title: note.title || path.basename(item.fsPath, ".json"),
      data: note,
    };
  }

  throw new Error("この項目は書き出しに未対応です。");
}

async function pickFormat() {
  const picked = await vscode.window.showQuickPick(
    [
      {
        label: "Markdown (.md)",
        value: "md",
        description: "インポート向け",
      },
      { label: "テキスト (.txt)", value: "txt" },
      { label: "CSV (.csv)", value: "csv" },
      {
        label: "HTML (.html)",
        value: "html",
        description: "ブラウザ表示 / PDF保存向け",
      },
    ],
    {
      title: "もじごと: 書き出し形式を選択",
      ignoreFocusOut: true,
    },
  );

  return picked?.value || "";
}

async function exportTreeItem(context, item) {
  const format = await pickFormat();
  if (!format) return;

  const source = await loadSourceData(item);
  const dir = await resolveExportDir(context, item, source);
  if (!dir) return;
  const formatters = getFormatters(source.sourceType);
  const formatter = formatters[format];

  if (!formatter) {
    throw new Error(`未対応の形式です: ${format}`);
  }

  const baseName = sanitizeFileName(source.title, source.sourceType);

  const fileName =
    source.sourceType === "settings"
      ? buildSettingsExportFileName(source.data, format)
      : buildSingleExportFileName(baseName, format);

  const fullPath = path.join(dir, fileName);

  const content = formatter(source.data);
  const output = format === "csv" ? "\uFEFF" + content : content;
  await fs.writeFile(fullPath, output, "utf8");

  const action = await vscode.window.showInformationMessage(
    `もじごと: 書き出しました → ${fileName}`,
    "フォルダを開く",
    "ファイルを開く",
  );

  if (action === "ファイルを開く") {
    await vscode.commands.executeCommand(
      "vscode.open",
      vscode.Uri.file(fullPath),
    );
  } else if (action === "フォルダを開く") {
    await vscode.commands.executeCommand(
      "revealFileInOS",
      vscode.Uri.file(fullPath),
    );
  }

  return fullPath;
}

module.exports = {
  exportTreeItem,
};
