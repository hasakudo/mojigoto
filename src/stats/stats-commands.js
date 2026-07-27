const vscode = require("vscode");

function registerStatsCommands(context, options) {
  const {
    panelController,
    logOnSave,
    exportStatsCsv,
    exportMergedManuscript,
    getRefreshTargets,
  } = options;

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

    vscode.workspace.onDidChangeConfiguration((e) => {
      const changed = refreshTargets.some((key) => e.affectsConfiguration(key));
      if (!changed) return;

      panelController.refresh();
    }),
  );
}

module.exports = {
  registerStatsCommands,
};
