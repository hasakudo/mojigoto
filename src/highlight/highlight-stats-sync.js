const vscode = require("vscode");

function registerHighlightStatsSync(context, deps = {}) {
  const {
    highlightManager,
    refreshStatsPanel = () => {},
    delayMs = 150,
  } = deps;

  if (!context) {
    throw new Error("registerHighlightStatsSync: context is required");
  }
  if (!highlightManager) {
    throw new Error("registerHighlightStatsSync: highlightManager is required");
  }

  function schedulePanelRefresh() {
    setTimeout(() => {
      try {
        refreshStatsPanel();
      } catch (e) {
        console.error("[mojigoto] refreshStatsPanel failed:", e);
      }
    }, delayMs);
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor) return;

      try {
        highlightManager.scheduleRefresh(editor);
      } catch (e) {
        console.error("[mojigoto] highlight scheduleRefresh failed:", e);
      }

      schedulePanelRefresh();
    }),

    vscode.workspace.onDidChangeTextDocument((event) => {
      const active = vscode.window.activeTextEditor;
      if (!active) return;
      if (event.document !== active.document) return;

      try {
        highlightManager.scheduleRefresh(active);
      } catch (e) {
        console.error("[mojigoto] highlight scheduleRefresh failed:", e);
      }

      schedulePanelRefresh();
    }),

    vscode.workspace.onDidSaveTextDocument((doc) => {
      const active = vscode.window.activeTextEditor;
      if (!active) return;
      if (doc !== active.document) return;

      try {
        highlightManager.scheduleRefresh(active);
      } catch (e) {
        console.error("[mojigoto] highlight scheduleRefresh failed:", e);
      }

      schedulePanelRefresh();
    }),
  );
}

module.exports = {
  registerHighlightStatsSync,
};
