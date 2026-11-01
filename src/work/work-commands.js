const { createWorkSwitchCommand } = require("./work-switch-command");
const vscode = require("vscode");
const {
  switchWorkImpl,
  closeEditorsUnderManuscriptRoot,
} = require("./work-switch-service");
const {
  getCurrentWorkGoal,
  setCurrentWorkGoal,
  getCurrentWorkDeadline,
  setCurrentWorkDeadline,
} = require("./work-settings");
const { resetDiffForCurrentWork } = require("../stats/stats-service");

function registerWorkCommands(context, deps = {}) {
  const {
    itemWork = null,
    ensureProjectNameFilled = async () => {},
    restartServer = true,
    previewState = null,
    refreshStatsPanel = () => {},
    scheduleRecalc = () => {},
    importSharedWritingRecords = async () => ({ imported: 0 }),
  } = deps;

  const switchWorkAndRestart = createWorkSwitchCommand({
    vscode, context, switchWorkImpl, closeEditorsUnderManuscriptRoot,
    resetDiffForCurrentWork, itemWork, ensureProjectNameFilled, restartServer,
    previewState, refreshStatsPanel, scheduleRecalc, importSharedWritingRecords,
  });

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "mojigoto.switchWorkAndRestart",
      switchWorkAndRestart,
    ),

    vscode.commands.registerCommand("mojigoto.setWorkGoal", async () => {
      try {
        const current = getCurrentWorkGoal(context);

        const value = await vscode.window.showInputBox({
          prompt: "現在の作品の目標文字数を入力してください",
          value: String(current || ""),
          placeHolder: "例: 80000",
          validateInput: (input) => {
            const s = String(input || "").trim();
            if (s === "") return null;
            return /^\d+$/.test(s) ? null : "0以上の整数を入力してください";
          },
        });

        if (value === undefined) return;

        await setCurrentWorkGoal(context, Number(value) || 0);
        refreshStatsPanel();
        scheduleRecalc("workGoal");

        vscode.window.showInformationMessage(
          "現在の作品の目標文字数を保存しました。",
        );
      } catch (e) {
        vscode.window.showErrorMessage(
          `目標文字数の設定に失敗しました: ${String(e)}`,
        );
      }
    }),

    vscode.commands.registerCommand("mojigoto.setWorkDeadline", async () => {
      try {
        const current = getCurrentWorkDeadline(context);

        const value = await vscode.window.showInputBox({
          prompt: "現在の作品の締切日を入力してください（YYYY-MM-DD）",
          value: current || "",
          placeHolder: "例: 2026-04-30",
          validateInput: (input) => {
            const s = String(input || "").trim();
            if (s === "") return null;
            return /^\d{4}-\d{2}-\d{2}$/.test(s)
              ? null
              : "YYYY-MM-DD 形式で入力してください";
          },
        });

        if (value === undefined) return;

        const normalized = String(value).trim();
        await setCurrentWorkDeadline(context, normalized);
        refreshStatsPanel();
        scheduleRecalc("workDeadline");

        vscode.window.showInformationMessage(
          normalized
            ? "現在の作品の締切を保存しました。"
            : "現在の作品の締切を解除しました。",
        );
      } catch (e) {
        vscode.window.showErrorMessage(
          `締切の設定に失敗しました: ${String(e)}`,
        );
      }
    }),
  );
}

module.exports = {
  registerWorkCommands,
};
