const vscode = require("vscode");

function stripChapterNumberPrefix(name) {
  const raw = String(name || "");
  if (!raw) return raw;

  const stripped = raw.replace(/^\s*[0-9０-９]+\s*[-._ ]*\s*/, "").trim();

  return stripped || raw;
}

function shouldHideChapterNumberPrefix() {
  try {
    const cfg = vscode.workspace.getConfiguration("mojigoto");
    return cfg.get("hideChapterNumber", false) === true;
  } catch {
    return false;
  }
}

function getDisplayChapterLabel(name) {
  const raw = String(name || "");
  if (!shouldHideChapterNumberPrefix()) return raw;
  return stripChapterNumberPrefix(raw);
}

module.exports = {
  stripChapterNumberPrefix,
  shouldHideChapterNumberPrefix,
  getDisplayChapterLabel,
};
