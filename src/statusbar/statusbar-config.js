const vscode = require("vscode");

function isStatusBarCountsEnabled() {
  try {
    return !!vscode.workspace
      .getConfiguration("mojigoto")
      .get("statusBarCountsEnabled", true);
  } catch {
    return true;
  }
}

function shouldShowWorkStatusBar() {
  try {
    const mode = String(
      vscode.workspace.getConfiguration("mojigoto").get("mode", "") || "",
    ).trim();
    return mode === "multi";
  } catch {
    return false;
  }
}

module.exports = {
  isStatusBarCountsEnabled,
  shouldShowWorkStatusBar,
};
