const path = require("path");

function comparablePath(value) {
  const resolved = path.resolve(String(value));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isForbiddenExportRoot(cfg, candidatePath, workspaceRoot = "") {
  if (!candidatePath) return false;
  const workRoot = String(cfg.get("workRoot", "") || "").trim();
  return [workspaceRoot, workRoot].filter(Boolean).some(
    (root) => comparablePath(root) === comparablePath(candidatePath),
  );
}

// Existence is checked by the tree; a watcher can also wait for a missing root.
function getWarehousePath(cfg, workspaceRoot = "") {
  const root = String(cfg.get("exportRoot", "") || "").trim();
  return root && !isForbiddenExportRoot(cfg, root, workspaceRoot)
    ? path.resolve(root)
    : "";
}

module.exports = { isForbiddenExportRoot, getWarehousePath };
