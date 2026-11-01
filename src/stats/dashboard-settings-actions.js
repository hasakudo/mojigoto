// Dashboard setting operations. Panel identity and rendered-work state stay with the controller.
function createDashboardSettingsActions({
  context, vscode, webMarkdown, currentMarkdownDir,
  getDisplayedMarkdownDir, getDisplayedRenderId, postToPanel,
  getWebviewSaveSettings, updateWebviewSaveSetting,
}) {
  async function handleWebMarkdownAction(msg) {
    const dir = currentMarkdownDir();
    const status = webMarkdown.getStatus?.(dir);
    if (!dir || dir !== getDisplayedMarkdownDir() || String(msg.renderId || "") !== getDisplayedRenderId() || msg.workKey !== status?.workKey) return;
    try {
      if (msg.action === "enabled" && typeof msg.enabled === "boolean") await webMarkdown.setEnabled(dir, msg.enabled);
      else if (msg.action === "regenerate" && status.enabled) await webMarkdown.regenerate(dir);
      else throw new Error("Web読込用Markdownの操作を確認してください。");
      if (dir === currentMarkdownDir()) await postToPanel({ type: "webMarkdownResult", status: webMarkdown.getStatus(dir) });
    } catch (error) {
      if (dir === currentMarkdownDir()) await postToPanel({ type: "webMarkdownResult", status: { ...webMarkdown.getStatus(dir), error: error.message || String(error) } });
    }
  }

  async function handleSaveSetting(msg) {
    try {
      const result = await updateWebviewSaveSetting(context, msg.key, msg.enabled);
      await postToPanel({ type: "webviewSaveSettingResult", ...result });
    } catch (error) {
      await postToPanel({ type: "webviewSaveSettingResult", settings: getWebviewSaveSettings(), error: String(error.message || error) });
    }
  }

  async function openBackupSettings(msg) {
    await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:hasakudo.mojigoto backup");
  }

  async function openMojigotoSettings(msg) {
    await vscode.commands.executeCommand(
      "workbench.action.openSettings",
      "@ext:hasakudo.mojigoto",
    );
  }

  return { handleWebMarkdownAction, handleSaveSetting, openBackupSettings, openMojigotoSettings };
}

module.exports = { createDashboardSettingsActions };
