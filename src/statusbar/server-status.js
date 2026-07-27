const vscode = require("vscode");

function createServerStatusBarItem(context) {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    105,
  );

  item.command = "mojigoto.openPreviewBeside";
  item.tooltip = "プレビューを開く";

  context.subscriptions.push(item);

  function update(state = {}) {
    const {
      serverOk = false,
      serverPort = null,
      serverUrl = "",
      enabled = true,
    } = state;

    if (!enabled) {
      item.hide();
      return;
    }

    if (serverOk) {
      item.text = `$(radio-tower) Preview ON`;
      item.tooltip = serverUrl
        ? `プレビューサーバー起動中: ${serverUrl}`
        : serverPort
          ? `プレビューサーバー起動中: http://127.0.0.1:${serverPort}`
          : "プレビューサーバー起動中";
    } else {
      item.text = `$(radio-tower) Preview OFF`;
      item.tooltip = "プレビューサーバー停止中";
    }

    item.show();
  }

  function hide() {
    item.hide();
  }

  function dispose() {
    item.dispose();
  }

  return {
    item,
    update,
    hide,
    dispose,
  };
}

module.exports = {
  createServerStatusBarItem,
};
