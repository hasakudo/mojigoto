const vscode = require("vscode");
const path = require("path");
const { sanitizeFolderName } = require("../core/path-utils");
const { getCurrentWorkDisplayName } = require("../work/work-settings");
const {
  ensureNamedExportDir,
  getOrPickExportRoot,
} = require("./export-utils");

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

async function ensureStatsOutDir(context) {
  return await ensureNamedExportDir(context, "CSV");
}

module.exports = {
  sanitizeFolderName,
  getWorkNameForStats,
  getOrPickExportRoot,
  ensureStatsOutDir,
};
