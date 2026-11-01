const vscode = require("vscode");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { isForbiddenExportRoot: isForbiddenRoot } = require("../core/export-root");
const { sanitizeFolderName } = require("../core/path-utils");
const {
  getCurrentWorkDisplayName,
  getCurrentWorkFolderName,
} = require("../work/work-settings");

function getExportFieldDefaults() {
  const config = vscode.workspace.getConfiguration("mojigoto");

  return {
    includeSubtitle: config.get("exportIncludeSubtitle", true),
    includeFolderName: config.get("exportIncludeFolderName", false),
    includeGenre: config.get("exportIncludeGenre", true),
    includeTargetChars: config.get("exportIncludeTargetChars", true),
    includeDeadline: config.get("exportIncludeDeadline", true),
    includePenName: config.get("exportIncludePenName", true),
    includeMemo: config.get("exportIncludeMemo", false),
    includeUpdatedAt: config.get("exportIncludeUpdatedAt", false),
  };
}

function getEffectiveExportOptions(settings) {
  const defaults = getExportFieldDefaults();
  const local = settings?.exportOptions || {};

  return {
    includeSubtitle:
      typeof local.includeSubtitle === "boolean"
        ? local.includeSubtitle
        : defaults.includeSubtitle,

    includeFolderName:
      typeof local.includeFolderName === "boolean"
        ? local.includeFolderName
        : defaults.includeFolderName,

    includeGenre:
      typeof local.includeGenre === "boolean"
        ? local.includeGenre
        : defaults.includeGenre,

    includeTargetChars:
      typeof local.includeTargetChars === "boolean"
        ? local.includeTargetChars
        : defaults.includeTargetChars,

    includeDeadline:
      typeof local.includeDeadline === "boolean"
        ? local.includeDeadline
        : defaults.includeDeadline,

    includePenName:
      typeof local.includePenName === "boolean"
        ? local.includePenName
        : defaults.includePenName,

    includeMemo:
      typeof local.includeMemo === "boolean"
        ? local.includeMemo
        : defaults.includeMemo,

    includeUpdatedAt:
      typeof local.includeUpdatedAt === "boolean"
        ? local.includeUpdatedAt
        : defaults.includeUpdatedAt,
  };
}

function getWorkNameForExport(context) {
  const displayName = String(getCurrentWorkDisplayName(context) || "").trim();
  const stableWorkName = String(getCurrentWorkFolderName(context) || "").trim();
  return getWorkNameForExportFromValue(displayName, stableWorkName);
}

function getWorkNameForExportFromValue(workTitle = "", workName = "") {
  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const nameMode = String(cfg.get("exportWorkFolderNameMode", "folderName") || "folderName");
  const title = String(workTitle || "").trim();
  const name = String(workName || "").trim();
  const selected = nameMode === "title" ? title || name : name || title;
  if (selected) return sanitizeFolderName(selected);

  return "single-unknown";
}

function isDirectChildPath(parentPath, childPath) {
  const parent = path.resolve(String(parentPath || ""));
  const child = path.resolve(String(childPath || ""));
  if (!parentPath || !childPath || parent === child) return false;
  return path.dirname(child).toLowerCase() === parent.toLowerCase();
}

function isForbiddenExportRoot(cfg, candidatePath) {
  const workspaceRoot =
    vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || "";
  return isForbiddenRoot(cfg, candidatePath, workspaceRoot);
}

async function confirmRepickForbiddenExportRoot() {
  const answer = await vscode.window.showWarningMessage(
    "ワークスペースまたは作品ルート自体は、書き出し先の親フォルダに指定できません。「書き出し」などの専用フォルダを作成し、そのフォルダを選択してください。開いているフォルダの外でも選べます。",
    { modal: true },
    "フォルダを選び直す",
  );

  return answer === "フォルダを選び直す";
}

async function offerToExcludeExportRoot(cfg, exportRoot) {
  const folderName = path.basename(String(exportRoot || "").trim());
  if (!folderName) return;

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || "";
  const workRoot = String(cfg.get("workRoot", "") || "").trim();
  const isRootChild = [workRoot, workspaceRoot]
    .filter(Boolean)
    .some((root) => isDirectChildPath(root, exportRoot));

  if (!isRootChild) return;

  const current = cfg.get("workExclude", []);
  const excludes = Array.isArray(current)
    ? current.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  if (excludes.some((item) => item.toLowerCase() === folderName.toLowerCase())) {
    return;
  }

  await cfg.update(
    "workExclude",
    [...excludes, folderName],
    vscode.ConfigurationTarget.Workspace,
  );

  try {
    await vscode.commands.executeCommand("mojigoto.refreshWorkTree");
  } catch {
    // ツリー未初期化時は設定だけ保存する。
  }
}

async function getOrPickExportRoot(context) {
  const cfg = vscode.workspace.getConfiguration("mojigoto");

  let root = String(cfg.get("exportRoot", "") || "").trim();

  let hasExistingRoot = false;
  try { hasExistingRoot = Boolean(root && fs.statSync(root).isDirectory()); } catch {}
  const hasForbiddenExistingRoot =
    hasExistingRoot && isForbiddenExportRoot(cfg, root);

  if (hasExistingRoot && !hasForbiddenExistingRoot) {
    return root;
  }

  if (hasForbiddenExistingRoot) {
    const shouldRepick = await confirmRepickForbiddenExportRoot();
    if (!shouldRepick) return "";
  } else {
    const proceed = await vscode.window.showInformationMessage(
      "書き出し先の親フォルダを選択します。開いているフォルダの外や別のドライブも選べます。選んだフォルダは作品ツリーの「倉庫」に表示され、書き出したファイルを開けます。",
      { modal: true },
      "フォルダを選択",
    );

    if (proceed !== "フォルダを選択") return "";
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;

  while (true) {
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri: workspaceRoot,
      openLabel: "このフォルダを書き出し先の親フォルダに設定",
    });

    if (!picked || !picked[0]) return "";

    root = picked[0].fsPath;
    if (!isForbiddenExportRoot(cfg, root)) break;

    const shouldRepick = await confirmRepickForbiddenExportRoot();
    if (!shouldRepick) return "";
  }

  try {
    await fsp.mkdir(root, { recursive: true });

    await cfg.update("exportRoot", root, vscode.ConfigurationTarget.Workspace);
    await offerToExcludeExportRoot(cfg, root);

    vscode.window.showInformationMessage(
      "もじごと: 書き出し先を設定し、作品ツリーの倉庫に追加しました。",
    );
  } catch (e) {
    vscode.window.showErrorMessage(
      `もじごと: 書き出し先フォルダの設定に失敗しました: ${String(e)}`,
    );
    return "";
  }

  return root;
}

async function ensureWorkExportBaseDir(context) {
  const root = await getOrPickExportRoot(context);
  if (!root) return "";

  const outDir = path.join(root, getWorkNameForExport(context));

  try {
    await fsp.mkdir(outDir, { recursive: true });
    return outDir;
  } catch (e) {
    vscode.window.showErrorMessage(
      `もじごと: 作品書き出しフォルダの作成に失敗しました: ${String(e)}`,
    );
    return "";
  }
}

async function ensureNamedExportDir(context, folderName) {
  const baseDir = await ensureWorkExportBaseDir(context);
  if (!baseDir) return "";

  const safeFolderName = String(folderName || "").trim() || "書き出し";

  const dir = path.join(baseDir, safeFolderName);

  try {
    await fsp.mkdir(dir, { recursive: true });
    return dir;
  } catch (e) {
    vscode.window.showErrorMessage(
      `もじごと: 書き出しフォルダの作成に失敗しました: ${String(e)}`,
    );
    return "";
  }
}

async function resolveNamedExportDirForWorkIfConfigured(
  folderName,
  workDir = "",
  workTitle = "",
  workName = "",
) {
  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const root = String(cfg.get("exportRoot", "") || "").trim();

  if (!root || !fs.existsSync(root)) {
    return "";
  }

  let resolvedWorkTitle = String(workTitle || "").trim();

  if (!resolvedWorkTitle && workDir) {
    try {
      const target = await resolveSettingsTarget({ fsPath: workDir });
      const settings = await readSettingsFile(target.path, { fsPath: workDir });
      resolvedWorkTitle = String(settings?.title || "").trim();
    } catch {
      // 読めなければ後で workName にフォールバック
    }
  }

  const workFolder = getWorkNameForExportFromValue(resolvedWorkTitle, workName);
  const baseDir = path.join(root, workFolder);
  const safeFolderName = String(folderName || "").trim() || "書き出し";
  const dir = path.join(baseDir, safeFolderName);

  try {
    await fsp.mkdir(dir, { recursive: true });
    return dir;
  } catch {
    return "";
  }
}

async function resolveExportDirForTarget(context, targetWork, folderName) {
  const root = await getOrPickExportRoot(context);
  if (!root) return "";

  const safeWorkFolder = getWorkNameForExportFromValue(
    targetWork?.workTitle,
    targetWork?.workName,
  );

  const safeFolderName = String(folderName || "").trim() || "書き出し";
  const dir = path.join(root, safeWorkFolder, safeFolderName);

  try {
    await fsp.mkdir(dir, { recursive: true });
    return dir;
  } catch (e) {
    vscode.window.showErrorMessage(
      `もじごと: 書き出しフォルダの作成に失敗しました: ${String(e)}`,
    );
    return "";
  }
}

async function resolveExportDirForTargetIfConfigured(targetWork, folderName) {
  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const root = String(cfg.get("exportRoot", "") || "").trim();

  if (!root || !fs.existsSync(root)) {
    return "";
  }

  const safeWorkFolder = getWorkNameForExportFromValue(
    targetWork?.workTitle,
    targetWork?.workName,
  );

  const safeFolderName = String(folderName || "").trim() || "書き出し";
  const dir = path.join(root, safeWorkFolder, safeFolderName);

  try {
    await fsp.mkdir(dir, { recursive: true });
    return dir;
  } catch {
    return "";
  }
}

module.exports = {
  getExportFieldDefaults,
  getEffectiveExportOptions,
  getWorkNameForExport,
  getOrPickExportRoot,
  ensureWorkExportBaseDir,
  ensureNamedExportDir,
  getWorkNameForExportFromValue,
  resolveNamedExportDirForWorkIfConfigured,
  resolveExportDirForTargetIfConfigured,
  resolveExportDirForTarget,
};
