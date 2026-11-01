const vscode = require("vscode");
const { setMemoAutoSyncDefault } = require("./memo-auto-sync-settings");
const KEYS = ["webviewAutoSaveEnabled", "noteMemoAutoSyncEnabled", "conceptMemoAutoSyncEnabled"];

function getWebviewSaveSettings() {
  const config = vscode.workspace.getConfiguration("mojigoto");
  return Object.fromEntries(KEYS.map((key) => [key, key === "webviewAutoSaveEnabled"
    ? config.get(key, true) !== false : config.get(key, false) === true]));
}

async function updateWebviewSaveSetting(context, key, enabled) {
  if (!KEYS.includes(key) || typeof enabled !== "boolean") throw new Error("保存・自動反映設定を確認してください。");
  let result = { cancelled: false };
  if (key === "webviewAutoSaveEnabled") {
    await vscode.workspace.getConfiguration("mojigoto").update(key, enabled, vscode.ConfigurationTarget.Workspace);
  } else {
    result = await setMemoAutoSyncDefault(context, key, enabled);
  }
  return { ...result, settings: getWebviewSaveSettings() };
}

module.exports = { getWebviewSaveSettings, updateWebviewSaveSetting };
