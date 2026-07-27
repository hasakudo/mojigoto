const vscode = require("vscode");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { sanitizeFolderName } = require("../core/path-utils");
const { getCurrentWorkDisplayName } = require("../work/work-settings");
const { ensureNamedExportDir } = require("./export-utils");

// ===============================
// Stats Export Root (one-time select)
// ===============================
function getWorkNameForStats(context) {
  const displayName = String(getCurrentWorkDisplayName(context) || "").trim();
  if (displayName) {
    return sanitizeFolderName(displayName);
  }

  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const mode = String(cfg.get("mode", "single") || "single");

  if (mode === "multi") {
    const saved = String(
      context.globalState.get("mojigoto.currentWorkName", "") || "",
    ).trim();
    if (saved) return sanitizeFolderName(saved);
    return "multi-unknown";
  }

  const wf = vscode.workspace.workspaceFolders?.[0];
  if (wf?.name) return sanitizeFolderName(wf.name);

  const mr = String(cfg.get("manuscriptRoot", "") || "").trim();
  if (mr) return sanitizeFolderName(path.basename(path.dirname(mr)));

  return "single-unknown";
}

async function getOrPickExportRoot() {
  const cfg = vscode.workspace.getConfiguration("mojigoto");
  let root = String(cfg.get("exportRoot", "") || "").trim();

  if (root && fs.existsSync(root)) return root;

  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "このフォルダを書き出しの親フォルダに設定",
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
      `もじごと: 書き出し先の親フォルダの設定に失敗しました: ${String(e)}`,
    );
    return "";
  }

  return root;
}

async function ensureStatsOutDir(context) {
  return await ensureNamedExportDir(context, "CSV");
}

module.exports = {
  sanitizeFolderName,
  getWorkNameForStats,
  getOrPickExportRoot,
  ensureStatsOutDir,
};
