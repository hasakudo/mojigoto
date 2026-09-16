const vscode = require("vscode");

function supportsWebviewPanelThemeIcon(version = vscode.version) {
  const [major, minor] = String(version || "")
    .split(".")
    .map((value) => Number.parseInt(value, 10));
  return major > 1 || (major === 1 && minor >= 110);
}

function setWebviewPanelThemeIcon(panel, iconId) {
  if (!panel || !iconId || !supportsWebviewPanelThemeIcon()) return false;
  panel.iconPath = new vscode.ThemeIcon(iconId);
  return true;
}

module.exports = {
  setWebviewPanelThemeIcon,
  supportsWebviewPanelThemeIcon,
};
