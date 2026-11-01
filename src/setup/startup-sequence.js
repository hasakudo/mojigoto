const vscode = require("vscode");
const { registerMojigotoTreeCommands } = require("../tree/work-tree-commands");
const { firstRunSetup } = require("./setup-commands");
const { maybeRemindEventsSend } = require("../stats/stats-reminder");

function startStartupSequence(context, {
  treeProvider,
  workTreeView,
  importSharedWritingRecords,
}) {
  let disposed = false;
  let focusTimer;
  context.subscriptions.push({
    dispose() {
      disposed = true;
      clearTimeout(focusTimer);
      focusTimer = undefined;
    },
  });
  return (async () => {
    await registerMojigotoTreeCommands(context, treeProvider, workTreeView);
    if (disposed) return;
    await firstRunSetup(context);
    if (disposed) return;
    await importSharedWritingRecords();
    if (disposed) return;
    focusTimer = setTimeout(() => {
      focusTimer = undefined;
      if (disposed) return;
      vscode.commands.executeCommand("mojigoto.workTree.focus").then(undefined, () => {});
    }, 250);
    await maybeRemindEventsSend(context, "activate");
  })().catch((error) => {
    console.error("Mojigoto activate error:", error);
  });
}

module.exports = { startStartupSequence };
