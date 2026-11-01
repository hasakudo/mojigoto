const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

function normalizeComparablePath(value) {
  return path.resolve(String(value || "")).replace(/[\\/]+$/, "").toLowerCase();
}

function isSameOrInside(parentPath, targetPath) {
  if (!parentPath || !targetPath) return false;
  const relative = path.relative(path.resolve(parentPath), path.resolve(targetPath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function findCopiedWorkspaceRoot(configuredPath, workspaceRoot, importedRootNames = []) {
  const expectedName = path.basename(path.resolve(String(workspaceRoot || ""))).toLowerCase();
  if (!configuredPath || !expectedName) return "";
  const expectedNames = new Set([expectedName, ...importedRootNames
    .filter((name) => typeof name === "string" && name && name !== "." && name !== ".." && !/[\\/\x00-\x1f]/.test(name))
    .map((name) => name.toLowerCase())]);
  let cursor = path.resolve(configuredPath);
  const stop = path.parse(cursor).root;
  while (cursor && cursor !== stop) {
    if (expectedNames.has(path.basename(cursor).toLowerCase())) return cursor;
    cursor = path.dirname(cursor);
  }
  return "";
}

function hasMultiWorkData(workRoot) {
  try {
    return fs.readdirSync(workRoot, { withFileTypes: true }).some((entry) =>
      entry.isDirectory() && !entry.name.startsWith(".") && entry.name.toUpperCase() !== "_WORK"
      && fs.existsSync(path.join(workRoot, entry.name, ".mojigoto", "work.json")));
  } catch { return false; }
}

function planCopiedWorkspacePathRepair({
  mode,
  workspaceRoot,
  manuscriptRoot,
  workRoot,
  exportRoot,
  importedRootNames = [],
  pathExists = fs.existsSync,
}) {
  const currentRoot = path.resolve(String(workspaceRoot || ""));
  const primaryPath = mode === "multi" ? workRoot : manuscriptRoot;
  const sourceRoot = findCopiedWorkspaceRoot(primaryPath, currentRoot, importedRootNames);
  if (!sourceRoot || normalizeComparablePath(sourceRoot) === normalizeComparablePath(currentRoot)) return null;

  const currentPrimary = path.join(currentRoot, path.relative(sourceRoot, path.resolve(primaryPath)));
  const hasWorkspaceMarker = mode === "multi"
    ? pathExists(path.join(currentRoot, "_WORK")) || (importedRootNames.length > 0 && hasMultiWorkData(currentPrimary))
    : pathExists(path.join(currentRoot, ".mojigoto"));
  if (!hasWorkspaceMarker || !pathExists(currentPrimary)) return null;

  const changes = {};
  for (const [key, configuredValue] of Object.entries({ manuscriptRoot, workRoot, exportRoot })) {
    const value = String(configuredValue || "").trim();
    if (!value || !isSameOrInside(sourceRoot, value)) continue;
    changes[key] = path.join(currentRoot, path.relative(sourceRoot, path.resolve(value)));
  }
  return Object.keys(changes).length ? { sourceRoot, currentRoot, changes } : null;
}

async function repairCopiedWorkspacePaths() {
  const workspaceFolders = vscode.workspace.workspaceFolders || [];
  if (workspaceFolders.length !== 1) return null;
  const workspaceRoot = workspaceFolders[0]?.uri?.fsPath || "";
  if (!workspaceRoot) return null;
  const config = vscode.workspace.getConfiguration("mojigoto");
  let importedRootNames = [];
  try {
    const marker = JSON.parse(fs.readFileSync(path.join(workspaceRoot, ".vscode", "mojigoto-import-source.json"), "utf8"));
    if (marker.kind === "mojigoto-drive-import" && marker.version === 1) importedRootNames = [marker.sourceRootName, marker.importedRootName];
  } catch { /* Ordinary copied folders still use the existing same-name repair. */ }
  const workspaceValue = (key) => String(config.inspect?.(key)?.workspaceValue || "").trim();
  const plan = planCopiedWorkspacePathRepair({
    mode: String(config.get("mode", "single") || "single"),
    workspaceRoot,
    manuscriptRoot: workspaceValue("manuscriptRoot"),
    workRoot: workspaceValue("workRoot"),
    exportRoot: workspaceValue("exportRoot"),
    importedRootNames,
  });
  if (!plan) return null;
  for (const [key, value] of Object.entries(plan.changes)) {
    await config.update(key, value, vscode.ConfigurationTarget.Workspace);
  }
  void vscode.window.showInformationMessage(
    "もじごと: コピー元の保存先設定を、現在開いているフォルダへ更新しました。",
  );
  return plan;
}

module.exports = {
  findCopiedWorkspaceRoot,
  planCopiedWorkspacePathRepair,
  repairCopiedWorkspacePaths,
};
