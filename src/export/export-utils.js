const vscode = require("vscode");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { sanitizeFolderName } = require("../core/path-utils");
const { getCurrentWorkDisplayName } = require("../work/work-settings");

function getExportFieldDefaults() {
  const config = vscode.workspace.getConfiguration("mojigoto");

  return {
    includeFolderName: config.get("exportIncludeFolderName", false),
    includeGenre: config.get("exportIncludeGenre", true),
    includeTargetChars: config.get("exportIncludeTargetChars", true),
    includeDeadline: config.get("exportIncludeDeadline", true),
    includeMemo: config.get("exportIncludeMemo", false),
    includeUpdatedAt: config.get("exportIncludeUpdatedAt", false),
  };
}

function getEffectiveExportOptions(settings) {
  const defaults = getExportFieldDefaults();
  const local = settings?.exportOptions || {};

  return {
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
  if (displayName) {
    return sanitizeFolderName(displayName);
  }

  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const mode = String(cfg.get("mode", "single") || "single");

  if (mode === "multi") {
    const saved = String(
      context?.globalState?.get("mojigoto.currentWorkName", "") || "",
    ).trim();
    if (saved) return sanitizeFolderName(saved);
    return "multi-unknown";
  }

  const wf = vscode.workspace.workspaceFolders?.[0];
  if (wf?.name) return sanitizeFolderName(wf.name);

  const manuscriptRoot = String(cfg.get("manuscriptRoot", "") || "").trim();
  if (manuscriptRoot) {
    return sanitizeFolderName(path.basename(path.dirname(manuscriptRoot)));
  }

  return "single-unknown";
}

function getWorkNameForExportFromValue(workTitle = "", workName = "") {
  const title = String(workTitle || "").trim();
  if (title) {
    return sanitizeFolderName(title);
  }

  const name = String(workName || "").trim();
  if (name) {
    return sanitizeFolderName(name);
  }

  return "single-unknown";
}

async function getOrPickExportRoot(context) {
  const cfg = vscode.workspace.getConfiguration("mojigoto");

  let root = String(cfg.get("exportRoot", "") || "").trim();

  if (root && fs.existsSync(root)) {
    return root;
  }

  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "このフォルダを書き出し先の親フォルダに設定",
  });

  if (!picked || !picked[0]) return "";

  root = picked[0].fsPath;

  try {
    await fsp.mkdir(root, { recursive: true });

    await cfg.update("exportRoot", root, vscode.ConfigurationTarget.Workspace);
    
    vscode.window.showInformationMessage(
      "もじごと: 書き出し先の親フォルダを設定しました。",
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
