const vscode = require("vscode");
const fs = require("fs/promises");
const path = require("path");
const { readNoteFile } = require("../data/note-store");
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
const { resolveTargetWorkContext } = require("../core/mojigoto-paths");
const { pickIncludeNoteMemos } = require("./note-memo-export");
const { createSingleExportFormatters } = require("./single-export-formatters");
const {
  getFormatters, formatSettingsTxt, formatSettingsMd, formatSettingsCsv, formatSettingsHtml,
} = createSingleExportFormatters({ getEffectiveExportOptions, getGenreDisplayText });

function sanitizeFileName(input, fallback = "export") {
  const s = String(input || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ");
  return s || fallback;
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
  const includeItemMemos = format === "html" && source.sourceType !== "settings"
    ? await pickIncludeNoteMemos(vscode, [source.data]) : false;
  if (includeItemMemos === undefined) return;
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

  const content = formatter(source.data, { includeItemMemos });
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
  formatSettingsTxt,
  formatSettingsMd,
  formatSettingsCsv,
  formatSettingsHtml,
};
