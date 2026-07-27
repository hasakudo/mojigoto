const vscode = require("vscode");
const fs = require("fs/promises");
const path = require("path");

const { readNoteFile, listNotesWithMeta } = require("../data/note-store");
const {
  resolveExportDirForTarget,
  getEffectiveExportOptions,
  ensureNamedExportDir,
} = require("./export-utils");
const {
  readSettingsFile,
  resolveSettingsTarget,
  getGenreDisplayText,
} = require("../data/settings-store");
const { escapeHtml } = require("../core/path-utils");
const { resolveTargetWorkContext } = require("../core/mojigoto-paths");
const { isSingleMode } = require("../core/mojigoto-context");

function sanitizeFileName(input, fallback = "作品まとめ") {
  const s = String(input || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ");
  return s || fallback;
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

async function resolveViewBundleExportDir(context) {
  const dir = await ensureNamedExportDir(context, "ノート書き出し");
  if (!dir) {
    throw new Error("ノート書き出し先フォルダを解決できませんでした。");
  }
  return dir;
}

async function resolveTargetBundleExportDir(context, item) {
  if (isSingleMode()) {
    const dir = await ensureNamedExportDir(context, "ノート書き出し");

    if (!dir) {
      throw new Error("ノート書き出し先フォルダを解決できませんでした。");
    }

    return dir;
  }

  const targetWork = resolveTargetWorkContext({
    workDir: String(item?.workDir || item?.fsPath || ""),
    workName: String(item?.workName || ""),
    workTitle: String(item?.workTitle || ""),
  });

  const dir = await resolveExportDirForTarget(
    context,
    targetWork,
    "ノート書き出し",
  );

  if (!dir) {
    throw new Error("ノート書き出し先フォルダを解決できませんでした。");
  }

  return dir;
}

function buildStableBundleFileName(title, label, ext) {
  const baseName = sanitizeFileName(`${title}_${label}`, label);
  return `${baseName}.${ext}`;
}

function resolveBundleTitle(item, settings, fallback = "作品") {
  const targetWork = resolveTargetWorkContext({
    workDir: String(item?.workDir || item?.fsPath || ""),
    workName: String(item?.workName || ""),
    workTitle: String(item?.workTitle || ""),
  });

  return (
    String(targetWork?.workTitle || "").trim() ||
    String(settings?.title || "").trim() ||
    String(item?.workTitle || "").trim() ||
    String(settings?.folderName || "").trim() ||
    String(targetWork?.workName || "").trim() ||
    String(item?.workName || "").trim() ||
    fallback
  );
}

function normalizeViewBundleItem(item) {
  const targetWork = resolveTargetWorkContext({
    workDir: String(item?.workDir || item?.fsPath || ""),
    workName: String(item?.workName || ""),
    workTitle: String(item?.workTitle || ""),
  });

  return {
    fsPath: targetWork.workDir,
    workDir: targetWork.workDir,
    workName: targetWork.workName,
    workTitle: targetWork.workTitle,
    kind: "work",
  };
}

async function pickBundleFormat() {
  const picked = await vscode.window.showQuickPick(
    [
      { label: "Markdown (.md)", value: "md" },
      { label: "テキスト (.txt)", value: "txt" },
      {
        label: "HTML (.html)",
        value: "html",
        description: "ブラウザ表示 / PDF保存向け",
      },
    ],
    {
      title: "もじごと: まとめ書き出し形式を選択",
      ignoreFocusOut: true,
    },
  );

  return picked?.value || "";
}

async function pickIncludeSettings() {
  const picked = await vscode.window.showQuickPick(
    [
      {
        label: "設定を含める",
        value: true,
        detail:
          "HTMLでは、フォルダ名・目標文字数・締切日・メモの出力は作品設定の書き出し設定に従います。",
      },
      {
        label: "設定を含めない",
        value: false,
      },
    ],
    {
      title: "もじごと: 設定を含めますか？",
      ignoreFocusOut: true,
    },
  );

  if (!picked) return null;
  return picked.value;
}

async function pickPlotNotes(plotNotesMeta) {
  if (!Array.isArray(plotNotesMeta) || plotNotesMeta.length === 0) {
    return [];
  }

  const items = plotNotesMeta.map((meta) => ({
    label:
      meta.title || path.basename(meta.fsPath || "", ".json") || "プロット",
    description: meta.fsPath || "",
    picked: true,
    value: meta,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: "もじごと: 含めるプロットを選択",
    placeHolder: "複数選択できます。何も選ばないとプロットなしで出力します。",
    canPickMany: true,
    ignoreFocusOut: true,
    matchOnDescription: true,
  });

  if (!picked) return null;
  return picked.map((item) => item.value);
}

async function pickReferenceNotes(referenceNotesMeta) {
  if (!Array.isArray(referenceNotesMeta) || referenceNotesMeta.length === 0) {
    return [];
  }

  const items = referenceNotesMeta.map((meta) => ({
    label: meta.title || path.basename(meta.fsPath || "", ".json") || "資料",
    description: meta.fsPath || "",
    picked: true,
    value: meta,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: "もじごと: 含める資料を選択",
    placeHolder: "複数選択できます。何も選ばないと資料なしで出力します。",
    canPickMany: true,
    ignoreFocusOut: true,
    matchOnDescription: true,
  });

  if (!picked) return null;
  return picked.map((item) => item.value);
}

function formatSettingsGenre(settings) {
  return getGenreDisplayText(settings);
}

function formatSettingsSectionTxt(settings) {
  return [
    "==== 設定 ====",
    "",
    `作品名: ${settings.title || ""}`,
    `フォルダ名: ${settings.folderName || ""}`,
    `ジャンル: ${formatSettingsGenre(settings)}`,
    `目標文字数: ${settings.targetChars || 0}`,
    `締切: ${settings.deadline || ""}`,
    "",
    "[あらすじ]",
    settings.summary || "",
    "",
    "[メモ]",
    settings.memo || "",
    "",
  ].join("\n");
}

function formatSettingsSectionMd(settings) {
  return [
    "## 設定",
    "",
    `- 作品名: ${settings.title || ""}`,
    `- フォルダ名: ${settings.folderName || ""}`,
    `- ジャンル: ${formatSettingsGenre(settings)}`,
    `- 目標文字数: ${settings.targetChars || 0}`,
    `- 締切: ${settings.deadline || ""}`,
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

function formatSettingsSectionHtml(settings) {
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
      }
    }
  }

  return lines.join("\n");
}

function noteToHtmlSection(note, headingLabel) {
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

      if (!heading && !body) {
        continue;
      }

      parts.push(`<section class="noteEntry">`);

      if (heading) {
        parts.push(`<div class="noteEntryTitle">${escapeHtml(heading)}</div>`);
      }

      if (body) {
        parts.push(
          `<div class="block noteEntryBody">${escapeHtml(body)}</div>`,
        );
      }

      parts.push(`</section>`);
    }
  }

  parts.push(`</section>`);
  return parts.join("\n");
}

async function loadBundleData(item, options = {}) {
  const includeSettings = options.includeSettings !== false;
  const selectedPlotMetas = Array.isArray(options.selectedPlotMetas)
    ? options.selectedPlotMetas
    : null;
  const selectedReferenceMetas = Array.isArray(options.selectedReferenceMetas)
    ? options.selectedReferenceMetas
    : null;

  let settings = null;
  if (includeSettings) {
    const settingsTarget = await resolveSettingsTarget(item);
    settings = await readSettingsFile(settingsTarget.path, item);
  }

  const allPlotNotesMeta = await listNotesWithMeta("plot", item);
  const allReferenceNotesMeta = await listNotesWithMeta("reference", item);

  const plotNotesMeta = selectedPlotMetas ?? allPlotNotesMeta;
  const referenceNotesMeta = selectedReferenceMetas ?? allReferenceNotesMeta;

  const plotNotes = [];
  for (const meta of plotNotesMeta) {
    plotNotes.push(await readNoteFile(meta.fsPath, "plot"));
  }

  const referenceNotes = [];
  for (const meta of referenceNotesMeta) {
    referenceNotes.push(await readNoteFile(meta.fsPath, "reference"));
  }

  const title = resolveBundleTitle(item, settings, "作品");

  return {
    title,
    settings,
    plotNotes,
    referenceNotes,
    allPlotNotesMeta,
    allReferenceNotesMeta,
  };
}

function buildBundleTxt(bundle) {
  const sections = [];

  sections.push(`${bundle.title} まとめ`);
  sections.push("");

  if (bundle.settings) {
    sections.push(formatSettingsSectionTxt(bundle.settings));
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

function buildBundleMd(bundle) {
  const sections = [];

  sections.push(`# ${bundle.title} まとめ`);
  sections.push("");

  if (bundle.settings) {
    sections.push(formatSettingsSectionMd(bundle.settings));
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


function buildBundleHtml(bundle) {
  const settingsSection = bundle.settings
    ? formatSettingsSectionHtml(bundle.settings)
    : "";

  const plotSection =
    bundle.plotNotes.length > 0
      ? [
          "<section class='bundleSection'>",
          bundle.plotNotes
            .map((note) => noteToHtmlSection(note, "プロット"))
            .join("\n<hr class='sectionDivider'>\n"),
          "</section>",
        ].join("\n")
      : "";

  const referenceSection =
    bundle.referenceNotes.length > 0
      ? [
          "<section class='bundleSection'>",
          bundle.referenceNotes
            .map((note) => noteToHtmlSection(note, "資料"))
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

async function exportViewBundle(context, item) {
  if (
    !item &&
    !vscode.workspace
      .getConfiguration("mojigoto")
      .get("mode", "single")
      .includes("single")
  ) {
    throw new Error(
      "View対象作品を取得できませんでした。Viewから実行してください。",
    );
  }

  const format = await pickBundleFormat();
  if (!format) return;

  const includeSettings = await pickIncludeSettings();
  if (includeSettings === null) return;

  const bundleItem = normalizeViewBundleItem(item);

  const previewBundle = await loadBundleData(bundleItem, {
    includeSettings,
  });

  const selectedPlotMetas = await pickPlotNotes(previewBundle.allPlotNotesMeta);
  if (selectedPlotMetas === null) return;

  const selectedReferenceMetas = await pickReferenceNotes(
    previewBundle.allReferenceNotesMeta,
  );
  if (selectedReferenceMetas === null) return;

  const bundle = await loadBundleData(bundleItem, {
    includeSettings,
    selectedPlotMetas,
    selectedReferenceMetas,
  });

  const dir = await resolveViewBundleExportDir(context);

  let content = "";
  let ext = format;

  if (format === "txt") {
    content = buildBundleTxt(bundle);
  } else if (format === "md") {
    content = buildBundleMd(bundle);
  } else if (format === "html") {
    content = buildBundleHtml(bundle);
  } else {
    throw new Error(`未対応の形式です: ${format}`);
  }

  const fileName = buildStableBundleFileName(
    bundle.title,
    "設定・プロット・資料まとめ",
    ext,
  );
  const fullPath = path.join(dir, fileName);

  await fs.writeFile(fullPath, content, "utf8");

  const action = await vscode.window.showInformationMessage(
    `もじごと: Viewまとめを書き出しました → ${fileName}`,
    "フォルダを開く",
    "ファイルを開く",
  );

  if (action === "フォルダを開く") {
    await vscode.commands.executeCommand(
      "revealFileInOS",
      vscode.Uri.file(fullPath),
    );
  } else if (action === "ファイルを開く") {
    await vscode.commands.executeCommand(
      "vscode.open",
      vscode.Uri.file(fullPath),
    );
  }

  return fullPath;
}

async function exportTargetWorkBundle(context, item) {
  if (!item?.fsPath && !item?.workDir) {
    throw new Error(
      "作品情報を取得できませんでした。作品ツリーから実行してください。",
    );
  }

  const format = await pickBundleFormat();
  if (!format) return;

  const includeSettings = await pickIncludeSettings();
  if (includeSettings === null) return;

  const previewBundle = await loadBundleData(item, {
    includeSettings,
  });

  const selectedPlotMetas = await pickPlotNotes(previewBundle.allPlotNotesMeta);
  if (selectedPlotMetas === null) return;

  const selectedReferenceMetas = await pickReferenceNotes(
    previewBundle.allReferenceNotesMeta,
  );
  if (selectedReferenceMetas === null) return;

  const bundle = await loadBundleData(item, {
    includeSettings,
    selectedPlotMetas,
    selectedReferenceMetas,
  });

  const dir = await resolveTargetBundleExportDir(context, item);

  let content = "";
  let ext = format;

  if (format === "txt") {
    content = buildBundleTxt(bundle);
  } else if (format === "md") {
    content = buildBundleMd(bundle);
  } else if (format === "html") {
    content = buildBundleHtml(bundle);
  } else {
    throw new Error(`未対応の形式です: ${format}`);
  }

  const fileName = buildStableBundleFileName(
    bundle.title,
    "設定・プロット・資料",
    ext,
  );
  const fullPath = path.join(dir, fileName);

  await fs.writeFile(fullPath, content, "utf8");

  const action = await vscode.window.showInformationMessage(
    `もじごと: この作品のまとめを書き出しました → ${fileName}`,
    "フォルダを開く",
    "ファイルを開く",
  );

  if (action === "フォルダを開く") {
    await vscode.commands.executeCommand(
      "revealFileInOS",
      vscode.Uri.file(fullPath),
    );
  } else if (action === "ファイルを開く") {
    await vscode.commands.executeCommand(
      "vscode.open",
      vscode.Uri.file(fullPath),
    );
  }

  return fullPath;
}

async function pickBundleMode(typeLabel) {
  const picked = await vscode.window.showQuickPick(
    [
      {
        label: "すべてまとめて書き出し",
        description: `${typeLabel}を全件まとめて出力します`,
        value: "all",
      },
      {
        label: "選択して書き出し",
        description: `${typeLabel}を選んでまとめて出力します`,
        value: "select",
      },
    ],
    {
      title: `もじごと: ${typeLabel}まとめ書き出し`,
      ignoreFocusOut: true,
    },
  );

  return picked?.value || "";
}

async function pickNoteMetasByType(noteMetas, typeLabel) {
  if (!Array.isArray(noteMetas) || noteMetas.length === 0) {
    return [];
  }

  const items = noteMetas.map((meta) => ({
    label: meta.title || path.basename(meta.fsPath || "", ".json") || typeLabel,
    description: meta.fsPath || "",
    picked: true,
    value: meta,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: `もじごと: 含める${typeLabel}を選択`,
    placeHolder: "複数選択できます。何も選ばないと出力対象なしになります。",
    canPickMany: true,
    ignoreFocusOut: true,
    matchOnDescription: true,
  });

  if (!picked) return null;
  return picked.map((item) => item.value);
}

async function loadNoteTypeBundleData(item, noteType, options = {}) {
  const selectedMetas = Array.isArray(options.selectedMetas)
    ? options.selectedMetas
    : null;

  const allMetas = await listNotesWithMeta(noteType, item);
  const targetMetas = selectedMetas ?? allMetas;

  const notes = [];
  for (const meta of targetMetas) {
    notes.push(await readNoteFile(meta.fsPath, noteType));
  }

  let settings = null;
  try {
    const settingsTarget = await resolveSettingsTarget(item);
    settings = await readSettingsFile(settingsTarget.path, item);
  } catch {
    settings = null;
  }

  const titleBase = resolveBundleTitle(
    item,
    settings,
    noteType === "plot" ? "プロット" : "資料",
  );

  return {
    title: titleBase,
    noteType,
    notes,
    allMetas,
  };
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

function buildNoteTypeBundleHtml(bundle) {
  const typeLabel = bundle.noteType === "plot" ? "プロット" : "資料";

  const noteSections = bundle.notes
    .map((note) => noteToHtmlSection(note, typeLabel))
    .join("\n<hr class='sectionDivider'>\n");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(bundle.title)} ${escapeHtml(typeLabel)}まとめ</title>
<style>
${getExportHtmlStyle()}
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

async function exportNoteTypeBundle(context, item, noteType) {
  const typeLabel = noteType === "plot" ? "プロット" : "資料";

  const format = await pickBundleFormat();
  if (!format) return;

  const mode = await pickBundleMode(typeLabel);
  if (!mode) return;

  const previewBundle = await loadNoteTypeBundleData(item, noteType);

  let selectedMetas = previewBundle.allMetas;
  if (mode === "select") {
    selectedMetas = await pickNoteMetasByType(
      previewBundle.allMetas,
      typeLabel,
    );
    if (selectedMetas === null) return;
  }

  if (!Array.isArray(selectedMetas) || selectedMetas.length === 0) {
    vscode.window.showInformationMessage(
      `もじごと: 出力対象の${typeLabel}がありません。`,
    );
    return;
  }

  const bundle = await loadNoteTypeBundleData(item, noteType, {
    selectedMetas,
  });

  if (!Array.isArray(bundle.notes) || bundle.notes.length === 0) {
    vscode.window.showInformationMessage(
      `もじごと: 出力対象の${typeLabel}がありません。`,
    );
    return;
  }

  const dir = await resolveTargetBundleExportDir(context, item);

  let content = "";
  let ext = format;

  if (format === "txt") {
    content = buildNoteTypeBundleTxt(bundle);
  } else if (format === "md") {
    content = buildNoteTypeBundleMd(bundle);
  } else if (format === "html") {
    content = buildNoteTypeBundleHtml(bundle);
  } else {
    throw new Error(`未対応の形式です: ${format}`);
  }

  const label = noteType === "plot" ? "プロットまとめ" : "資料まとめ";
  const fileName = buildStableBundleFileName(bundle.title, label, ext);
  const fullPath = path.join(dir, fileName);

  await fs.writeFile(fullPath, content, "utf8");

  const action = await vscode.window.showInformationMessage(
    `もじごと: ${typeLabel}まとめを書き出しました → ${fileName}`,
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
  exportViewBundle,
  exportTargetWorkBundle,
  exportNoteTypeBundle,
};
