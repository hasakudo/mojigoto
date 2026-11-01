// Switch command orchestration; reference selection and document handling stay in the service.
function createWorkSwitchCommand({ vscode, context, switchWorkImpl,
  closeEditorsUnderManuscriptRoot, resetDiffForCurrentWork, itemWork,
  ensureProjectNameFilled, restartServer, previewState, refreshStatsPanel,
  scheduleRecalc, importSharedWritingRecords }) {
  return async function switchWorkAndRestart() {
    const ok = await switchWorkImpl(context, {
      itemWork,
      onAfterSwitch: async ({ picked }) => {
        if (itemWork) {
          itemWork.text = `$(bookmark) ${picked.label}`;
        }

        await ensureProjectNameFilled(context, "switchWork");
        await closeEditorsUnderManuscriptRoot();
        await resetDiffForCurrentWork(context);
        await importSharedWritingRecords();

        vscode.window.showInformationMessage(
          `もじごと: 作品切替 → ${picked.label}`,
        );

        if (restartServer) {
          await vscode.commands.executeCommand("mojigoto.serverRestart");
        } else {
          await vscode.commands.executeCommand("mojigoto.ping");
        }

        if (previewState?.enabled) {
          try {
            await vscode.commands.executeCommand(
              "mojigoto.syncPreviewToActiveEditor",
            );
          } catch {}
        }

        if (typeof scheduleRecalc === "function") {
          scheduleRecalc("switchWork");
        }

        refreshStatsPanel();

        await vscode.commands.executeCommand("mojigoto.refreshWorkTree");

        try {
          await vscode.commands.executeCommand(
            "workbench.view.extension.mojigoto",
          );
        } catch {}
      },
    });

    return ok;
  };
}

module.exports = { createWorkSwitchCommand };
