const vscode = require("vscode");

function registerStatsCommands(context, options) {
  const {
    panelController,
    logOnSave,
    exportStatsCsv,
    exportMergedManuscript,
    sendInitialProgressToWebhook,
    getRefreshTargets,
  } = options;

  let sheetsWasEnabled = Boolean(
    vscode.workspace.getConfiguration("mojigoto").get("sheetsEnabled", false),
  );

  const refreshTargets =
    typeof getRefreshTargets === "function"
      ? getRefreshTargets()
      : [
          "mojigoto.eventLogIntervalMinutes",
          "mojigoto.eventsMaxCount",
          "mojigoto.eventsRetentionDays",
          "mojigoto.dailyRetentionDays",
          "mojigoto.totalGoal",
          "mojigoto.workRoot",
          "mojigoto.manuscriptRoot",
          "mojigoto.sheetsEnabled",
          "mojigoto.webhookEventsMode",
          "mojigoto.highlightGroups",
          "mojigoto.highlightsEnabled",
        ];

  context.subscriptions.push(
    panelController.createSerializer(),

    vscode.workspace.onDidSaveTextDocument((doc) => logOnSave(context, doc)),

    vscode.commands.registerCommand("mojigoto.openStats", async () => {
      panelController.open();
    }),

    vscode.commands.registerCommand("mojigoto.refreshStats", async () => {
      panelController.refresh();
    }),

    vscode.commands.registerCommand("mojigoto.exportStatsCsv", async () => {
      await exportStatsCsv(context);
    }),

    vscode.commands.registerCommand(
      "mojigoto.exportMergedManuscript",
      async () => {
        await exportMergedManuscript(context);
      },
    ),

    vscode.workspace.onDidChangeConfiguration(async (e) => {
      const changed = refreshTargets.some((key) => e.affectsConfiguration(key));
      if (!changed) return;

      const sheetsChanged = e.affectsConfiguration("mojigoto.sheetsEnabled");
      const sheetsIsEnabled = Boolean(
        vscode.workspace.getConfiguration("mojigoto").get("sheetsEnabled", false),
      );
      const shouldSendInitialProgress =
        sheetsChanged && !sheetsWasEnabled && sheetsIsEnabled;
      sheetsWasEnabled = sheetsIsEnabled;

      panelController.refresh();

      if (
        shouldSendInitialProgress &&
        typeof sendInitialProgressToWebhook === "function"
      ) {
        try {
          const result = await sendInitialProgressToWebhook(context);
          vscode.window.showInformationMessage(
            `もじごと: Sheetsへ作品の初期情報を送信しました（総文字数 ${Number(result?.total || 0).toLocaleString("ja-JP")}文字）`,
          );
          panelController.refresh();
        } catch (error) {
          vscode.window.showWarningMessage(
            `もじごと: Sheetsへの初期情報送信に失敗しました: ${String(error?.message || error)}`,
          );
        }
      }
    }),
  );
}

module.exports = {
  registerStatsCommands,
};
