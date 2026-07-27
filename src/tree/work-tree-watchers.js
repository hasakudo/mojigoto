const vscode = require("vscode");

function registerTreeRefreshWatchers(context, treeProvider) {
  if (!context || !treeProvider || typeof treeProvider.refresh !== "function") {
    throw new Error(
      "registerTreeRefreshWatchers: treeProvider.refresh is required",
    );
  }

  const refresh = () => {
    try {
      treeProvider.refresh();
    } catch (e) {
      console.error("[mojigoto] tree refresh failed:", e);
    }
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("mojigoto.mode") ||
        e.affectsConfiguration("mojigoto.workRoot") ||
        e.affectsConfiguration("mojigoto.manuscriptRoot")
      ) {
        refresh();
      }
    }),

    vscode.workspace.onDidCreateFiles(() => {
      refresh();
    }),

    vscode.workspace.onDidDeleteFiles(() => {
      refresh();
    }),

    vscode.workspace.onDidRenameFiles(() => {
      refresh();
    }),

    vscode.workspace.onDidSaveTextDocument(() => {
      refresh();
    }),
  );
}

module.exports = {
  registerTreeRefreshWatchers,
};
