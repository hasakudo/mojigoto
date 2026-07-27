const vscode = require("vscode");

function createWorkStatusController(context, deps = {}) {
  const {
    getCurrentWorkName,
    getCurrentWorkDisplayName,
    shouldShowWorkStatusBar,
  } = deps;

  const itemWork = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    104,
  );
  const itemStats = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    106,
  );

  itemStats.command = "mojigoto.openStats";
  itemStats.tooltip = "ダッシュボードを開く";
  itemStats.text = "$(preview) Dashboard";

  context.subscriptions.push(itemWork, itemStats);

  function getModeSafe() {
    try {
      return (
        String(
          vscode.workspace.getConfiguration("mojigoto").get("mode", "single") ||
            "single",
        ).trim() || "single"
      );
    } catch {
      return "single";
    }
  }

  function getWorkNameSafe() {
    try {
      if (typeof getCurrentWorkDisplayName === "function") {
        const v = String(getCurrentWorkDisplayName(context) || "").trim();
        if (v) return v;
      }
    } catch {}

    try {
      if (typeof getCurrentWorkName === "function") {
        return String(getCurrentWorkName(context) || "").trim();
      }
    } catch {}

    return "";
  }

  function shouldShowSafe() {
    try {
      if (typeof shouldShowWorkStatusBar === "function") {
        return !!shouldShowWorkStatusBar();
      }
    } catch {}
    return false;
  }

  function updateWorkText() {
    const mode = getModeSafe();
    const name = getWorkNameSafe();

    itemWork.text = name ? `$(bookmark) ${name}` : "$(bookmark) -";

    if (mode === "multi") {
      itemWork.command = "mojigoto.switchWorkAndRestart";
      itemWork.tooltip = "現在の作品（クリックで切替）";
      return;
    }

    itemWork.command = undefined;
    itemWork.tooltip = "現在の作品";
  }

  function updateVisibility() {
    const mode = getModeSafe();

    if (mode === "multi") {
      if (shouldShowSafe()) {
        itemWork.show();
      } else {
        itemWork.hide();
      }
    } else {
      // Single は常に表示
      itemWork.show();
    }

    itemStats.show();
  }

  function refresh() {
    updateWorkText();
    updateVisibility();
  }

  function registerEventHandlers() {
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (
          e.affectsConfiguration("mojigoto.mode") ||
          e.affectsConfiguration("mojigoto.workRoot") ||
          e.affectsConfiguration("mojigoto.manuscriptRoot") ||
          e.affectsConfiguration("mojigoto.projectName")
        ) {
          refresh();
        }
      }),
    );
  }

  function initialize() {
    refresh();
    registerEventHandlers();
  }

  function dispose() {
    itemWork.dispose();
    itemStats.dispose();
  }

  return {
    initialize,
    refresh,
    dispose,
    items: {
      itemWork,
      itemStats,
    },
  };
}

module.exports = {
  createWorkStatusController,
};
