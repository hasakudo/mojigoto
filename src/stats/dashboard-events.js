// Event subscriptions belong to the controller, rather than an individual tab.
function createDashboardEvents({ vscode, webMarkdown, getPanel, getDisplayedMarkdownDir,
  currentMarkdownDir, getWritingMemoTarget, updateWritingMemoTarget, postToPanel,
  getWebviewSaveSettings, refresh }) {
  let disposed = false;
  const guard = fn => (...args) => { if (!disposed) return fn(...args); };
  const subscriptions = [
    webMarkdown.onDidChange?.(guard((dir, status) => {
      if (getPanel() && dir === getDisplayedMarkdownDir() && dir === currentMarkdownDir()) {
        void postToPanel({ type: "webMarkdownState", status });
      }
    })),
    vscode.window.onDidChangeActiveTextEditor(guard(editor => {
      const previous = getWritingMemoTarget();
      if (editor) updateWritingMemoTarget(editor);
      if (getPanel() && previous !== getWritingMemoTarget()) refresh();
    })),
    vscode.window.onDidChangeVisibleTextEditors(guard(() => {
      if (getPanel()) refresh();
    })),
    vscode.workspace.onDidChangeConfiguration(guard(e => {
      if (["webviewAutoSaveEnabled", "noteMemoAutoSyncEnabled", "conceptMemoAutoSyncEnabled"]
        .some(key => e.affectsConfiguration(`mojigoto.${key}`))) {
        void postToPanel({ type: "webviewSaveSettingsChanged", settings: getWebviewSaveSettings() });
      }
      if (["sheetsEnabled", "webhookEventsMode", "webhookEventsRemindMode", "eventLogIntervalMinutes",
        "backupIntervalMinutes", "backupMaxPerFile", "eventsMaxCount", "eventsRetentionDays",
        "dailyRetentionDays", "dashboardShowProgressGraph", "dashboardProgressGraphMode", "countMode"]
        .some(key => e.affectsConfiguration(`mojigoto.${key}`))) refresh();
    })),
  ];
  return { dispose() {
    if (disposed) return;
    disposed = true;
    for (const subscription of subscriptions) subscription?.dispose();
  } };
}

module.exports = { createDashboardEvents };
