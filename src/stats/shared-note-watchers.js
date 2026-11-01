const vscode = require("vscode");
const path = require("path");
const { refreshSharedWorkMetrics } = require("./stats-service");
const { getCurrentWorkSettingsPath } = require("../work/work-settings");
const { writeNoteIndex } = require("../data/note-index");

function registerSharedNoteWatchers(context) {
  let sharedMetricsTimer = null;
  let disposed = false;
  const watchers = [];
  const pendingNoteIndexDirs = new Set();
  const scheduleSharedMetricsRefresh = (uri) => {
    if (disposed) return;
    let current = path.dirname(String(uri?.fsPath || ""));
    while (current && path.dirname(current) !== current) {
      const folderName = path.basename(current).toLowerCase();
      const parent = path.dirname(current);
      if (["plots", "references"].includes(folderName) && path.basename(parent) === ".mojigoto") {
        pendingNoteIndexDirs.add(parent);
        break;
      }
      current = parent;
    }
    if (sharedMetricsTimer) clearTimeout(sharedMetricsTimer);
    sharedMetricsTimer = setTimeout(() => {
      if (disposed) return;
      sharedMetricsTimer = null;
      refreshSharedWorkMetrics(context, "notes");
      if (pendingNoteIndexDirs.size) {
        for (const dirPath of pendingNoteIndexDirs) writeNoteIndex(dirPath);
        pendingNoteIndexDirs.clear();
      } else {
        const settingsPath = getCurrentWorkSettingsPath(context);
        if (settingsPath) writeNoteIndex(path.dirname(settingsPath));
      }
    }, 500);
  };
  const controller = {
    dispose() {
      if (disposed) return;
      disposed = true;
      if (sharedMetricsTimer) clearTimeout(sharedMetricsTimer);
      sharedMetricsTimer = null;
      pendingNoteIndexDirs.clear();
      for (const watcher of watchers) watcher.dispose();
    },
  };
  try {
    for (const pattern of ["**/.mojigoto/plots/**/*.json", "**/.mojigoto/references/**/*.json"]) {
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      watchers.push(watcher);
      watcher.onDidCreate(scheduleSharedMetricsRefresh);
      watcher.onDidChange(scheduleSharedMetricsRefresh);
      watcher.onDidDelete(scheduleSharedMetricsRefresh);
    }
  } catch (error) {
    controller.dispose();
    throw error;
  }
  context.subscriptions.push(controller);
}

module.exports = { registerSharedNoteWatchers };
