const vscode = require("vscode");
const { post } = require("./server-service");

function isTextLikePath(filePath) {
  const p = String(filePath || "").toLowerCase();
  return p.endsWith(".txt") || p.endsWith(".md");
}

async function sendOpen(options = {}) {
  const { state, filePath, workRoot = "", manuscriptRoot = "" } = options;

  if (!state || !state.serverOk) return false;
  if (!filePath) return false;
  if (!isTextLikePath(filePath)) return false;

  return post(state, "/api/vscode/open", {
    file: filePath,
    workRoot,
    manuscriptRoot,
  });
}

async function sendCursor(options = {}) {
  const {
    state,
    filePath,
    line = 0,
    column = 0,
    workRoot = "",
    manuscriptRoot = "",
  } = options;

  if (!state || !state.serverOk) return false;
  if (!filePath) return false;
  if (!isTextLikePath(filePath)) return false;

  return post(state, "/api/vscode/cursor", {
    file: filePath,
    line: Number(line) + 1, // 1-based
    column: Number(column) + 1, // 1-based
    workRoot,
    manuscriptRoot,
  });
}

async function sendScroll(options = {}) {
  const { state, filePath, line = 0 } = options;

  if (!state || !state.serverOk) return false;
  if (!filePath) return false;
  if (!isTextLikePath(filePath)) return false;

  return post(state, "/api/vscode/scroll", {
    file: filePath,
    line: Number(line) + 1, // 1-based
  });
}

async function sendPreviewSettings(options = {}) {
  const { state } = options;

  if (!state || !state.serverOk) return false;

  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const verticalPunctuationLayout = String(
    cfg.get("verticalPunctuationLayout", "hanging") || "hanging",
  ).trim();
  const inspected =
    typeof cfg.inspect === "function"
      ? cfg.inspect("useTypographyAdjustments")
      : null;
  const explicitTypographyValue =
    inspected?.workspaceFolderValue ??
    inspected?.workspaceValue ??
    inspected?.globalValue;
  const useTypographyAdjustments =
    typeof explicitTypographyValue === "boolean"
      ? explicitTypographyValue
      : false;

  return post(state, "/api/settings", {
    verticalPunctuationLayout:
      verticalPunctuationLayout === "pushout" ? "pushout" : "hanging",
    useTypographyAdjustments,
  });
}

module.exports = {
  sendOpen,
  sendCursor,
  sendScroll,
  sendPreviewSettings,
  isTextLikePath,
};
