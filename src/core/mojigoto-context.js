const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

function getConfig() {
  return vscode.workspace.getConfiguration("mojigoto");
}

function getMode() {
  return String(getConfig().get("mode", "") || "").trim() || "single";
}

function isSingleMode() {
  return getMode() === "single";
}

function isMultiMode() {
  return getMode() === "multi";
}

function getWorkspaceRoot() {
  const wf = vscode.workspace.workspaceFolders?.[0];
  return wf?.uri.fsPath || "";
}

function getWorkRoot() {
  return String(getConfig().get("workRoot", "") || "").trim();
}

function getConfiguredManuscriptRoot() {
  return String(getConfig().get("manuscriptRoot", "") || "").trim();
}

function getManuscriptCandidates() {
  const values = getConfig().get("manuscriptCandidates", [
    "manuscript",
    "原稿",
  ]);
  if (!Array.isArray(values)) return ["manuscript", "原稿"];

  const cleaned = values.map((v) => String(v || "").trim()).filter(Boolean);
  return cleaned.length ? cleaned : ["manuscript", "原稿"];
}

function getRecommendedRoots(
  mode = getMode(),
  workspaceRoot = getWorkspaceRoot(),
) {
  const normalizedMode = mode === "multi" ? "multi" : "single";
  const candidates = getManuscriptCandidates();
  const preferredName = candidates[0] || "manuscript";

  if (!workspaceRoot) {
    return {
      mode: normalizedMode,
      workspaceRoot: "",
      workRoot: "",
      manuscriptRoot: "",
      manuscriptDirName: preferredName,
    };
  }

  if (normalizedMode === "multi") {
    return {
      mode: "multi",
      workspaceRoot,
      workRoot: workspaceRoot,
      manuscriptRoot: path.join(workspaceRoot, "_WORK", preferredName),
      manuscriptDirName: preferredName,
    };
  }

  return {
    mode: "single",
    workspaceRoot,
    workRoot: "",
    manuscriptRoot: path.join(workspaceRoot, preferredName),
    manuscriptDirName: preferredName,
  };
}

function getRecommendedManuscriptRoot(
  mode = getMode(),
  workspaceRoot = getWorkspaceRoot(),
) {
  return getRecommendedRoots(mode, workspaceRoot).manuscriptRoot;
}

function getResolvedManuscriptRoot() {
  const mode = getMode();
  const workRoot = getWorkRoot();
  const manuscriptRoot = getConfiguredManuscriptRoot();

  if (manuscriptRoot) {
    return manuscriptRoot;
  }

  const candidates = getManuscriptCandidates();
  const preferredName = candidates[0] || "manuscript";

  if (mode === "single") {
    const ws = getWorkspaceRoot();
    if (!ws) return "";

    for (const name of candidates) {
      const full = path.join(ws, name);
      try {
        if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
          return full;
        }
      } catch {
        // noop
      }
    }

    return (
      getRecommendedManuscriptRoot("single", ws) || path.join(ws, preferredName)
    );
  }

  if (workRoot) {
    const base = path.join(workRoot, "_WORK");
    for (const name of candidates) {
      const full = path.join(base, name);
      try {
        if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
          return full;
        }
      } catch {
        // noop
      }
    }

    return path.join(base, preferredName);
  }

  const ws = getWorkspaceRoot();
  return getRecommendedManuscriptRoot("multi", ws);
}

function getCurrentWorkName(context) {
  return String(
    context.globalState.get("mojigoto.currentWorkName", "") || "",
  ).trim();
}

module.exports = {
  getMode,
  isSingleMode,
  isMultiMode,
  getWorkspaceRoot,
  getWorkRoot,
  getConfiguredManuscriptRoot,
  getResolvedManuscriptRoot,
  getCurrentWorkName,
  getManuscriptCandidates,
  getRecommendedRoots,
  getRecommendedManuscriptRoot,
};
