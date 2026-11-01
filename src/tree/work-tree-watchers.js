const vscode = require("vscode");
const { getWarehousePath } = require("../core/export-root");

function registerTreeRefreshWatchers(context, treeProvider) {
  if (!context || !treeProvider || typeof treeProvider.refresh !== "function") {
    throw new Error(
      "registerTreeRefreshWatchers: treeProvider.refresh is required",
    );
  }

  let warehouseWatcher;
  let refreshTimer;
  let disposed = false;
  let generation = 0;
  const refresh = () => {
    if (disposed) return;
    try {
      treeProvider.refresh();
    } catch (e) {
      console.error("[mojigoto] tree refresh failed:", e);
    }
  };

  const watchWarehouse = () => {
    if (disposed) return;
    generation += 1;
    const currentGeneration = generation;
    clearTimeout(refreshTimer);
    warehouseWatcher?.dispose();
    warehouseWatcher = undefined;
    const root = getWarehousePath(
      vscode.workspace.getConfiguration("mojigoto"),
      vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || "",
    );
    if (!root || disposed) return;
    try {
      warehouseWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(vscode.Uri.file(root), "**/*"),
        false, true, false,
      );
      const scheduleRefresh = () => {
        if (disposed || generation !== currentGeneration) return;
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
          if (!disposed && generation === currentGeneration) refresh();
        }, 120);
      };
      warehouseWatcher.onDidCreate(scheduleRefresh);
      warehouseWatcher.onDidDelete(scheduleRefresh);
    } catch (e) {
      generation += 1;
      clearTimeout(refreshTimer);
      warehouseWatcher?.dispose();
      warehouseWatcher = undefined;
      console.error("[mojigoto] warehouse watcher failed:", e);
    }
  };

  watchWarehouse();
  context.subscriptions.push({ dispose() {
    if (disposed) return;
    disposed = true;
    generation += 1;
    clearTimeout(refreshTimer);
    warehouseWatcher?.dispose();
    warehouseWatcher = undefined;
  } });

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("mojigoto.mode") ||
        e.affectsConfiguration("mojigoto.workRoot") ||
        e.affectsConfiguration("mojigoto.manuscriptRoot") ||
        e.affectsConfiguration("mojigoto.exportRoot")
      ) {
        watchWarehouse();
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
