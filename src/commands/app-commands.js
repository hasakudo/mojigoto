const vscode = require("vscode");

function registerAppCommands(context, deps = {}) {
  const {
    getOrPickExportRoot = async () => "",
    sheetsEnabled = () => false,
    webhookEventsMode = () => "off",
    sendPendingMojigotoEvents = async () => ({
      ok: false,
      sent: 0,
      pending: 0,
      error: "not implemented",
    }),
    getPreviewUrl = () => "",
    runDoctor = null,
  } = deps;

  context.subscriptions.push(
    vscode.commands.registerCommand("mojigoto.setExportRoot", async () => {
      try {
        const cfg = vscode.workspace.getConfiguration("mojigoto");

        await cfg.update(
          "exportRoot",
          "",
          vscode.ConfigurationTarget.Workspace,
        );

        const root = await getOrPickExportRoot(context);
        if (!root) return;

        vscode.window.showInformationMessage(
          "もじごと: 書き出し先の親フォルダを更新しました。",
        );
      } catch (e) {
        vscode.window.showErrorMessage(
          `もじごと: 書き出し先の親フォルダ更新に失敗しました: ${String(e)}`,
        );
      }
    }),

    vscode.commands.registerCommand("mojigoto.sendMojigotoEvents", async () => {
      try {
        if (!sheetsEnabled()) {
          vscode.window.showWarningMessage(
            "もじごと: 執筆記録（Sheets送信）がOFFです。設定 mojigoto.sheetsEnabled をONにしてください。",
          );
          return;
        }

        if (webhookEventsMode() === "off") {
          vscode.window.showWarningMessage(
            "もじごと: 日時ログの送信モードが off です（mojigoto.webhookEventsMode）。",
          );
          return;
        }

        const result = await sendPendingMojigotoEvents(context);

        vscode.window.showInformationMessage(
          result.ok
            ? `もじごと: 日時ログを送信しました。（送信 ${result.sent} / 残り ${result.pending}）`
            : `もじごと: 日時ログの送信に失敗しました。(${result.error || "unknown"})`,
        );
      } catch (e) {
        vscode.window.showErrorMessage(
          `もじごと: 日時ログの送信に失敗しました: ${String(e)}`,
        );
      }
    }),

    vscode.commands.registerCommand("mojigoto.copyPreviewUrl", async () => {
      try {
        const url = String(getPreviewUrl() || "").trim();

        if (!url) {
          vscode.window.showWarningMessage("もじごと: server not running");
          return;
        }

        await vscode.env.clipboard.writeText(url);
        vscode.window.showInformationMessage("Preview URL copied");
      } catch (e) {
        vscode.window.showErrorMessage(
          `もじごと: Preview URL のコピーに失敗しました: ${String(e)}`,
        );
      }
    }),

    vscode.commands.registerCommand("mojigoto.doctor", async () => {
      try {
        if (typeof runDoctor === "function") {
          await runDoctor(context);
          return;
        }

        vscode.window.showInformationMessage("もじごと: 自己診断（Doctor）");
      } catch (e) {
        vscode.window.showErrorMessage(
          `もじごと: Doctor の実行に失敗しました: ${String(e)}`,
        );
      }
    }),
  );
}

module.exports = {
  registerAppCommands,
};
