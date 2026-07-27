const vscode = require("vscode");
const { getNonce } = require("../core/path-utils");

function getReorderEditorHtml(webview, extensionUri, initialState) {
  const nonce = getNonce();
  const version = String(Date.now());

  const cssBaseUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "reorder-editor.css"),
  );
  const jsBaseUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "reorder-editor.js"),
  );

  const cssUri = `${cssBaseUri}?v=${version}`;
  const jsUri = `${jsBaseUri}?v=${version}`;

  const boot = JSON.stringify(initialState).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>並び順エディタ</title>
  <link rel="stylesheet" href="${cssUri}">
</head>
<body>
  <div class="app">
    <header class="app-header">
      <h1>並び順エディタ</h1>
      <p class="muted">左でフォルダを選択し、右でファイルの順番を編集します。</p>
      <p class="muted">保存時に既存の先頭番号は付け直されます。</p>
      <div id="currentTarget" class="current-target"></div>
      <div id="dirtyBadge" class="dirty-badge" hidden>ファイルに未保存の変更があります</div>
    </header>
    <main class="app-main">
      <aside class="left-pane">
        <div class="pane-title-row">
          <div class="pane-title">フォルダ</div>
          <div class="pane-toolbar">
            <span class="muted">操作方法</span>
            <button id="folderModeArrowBtn" type="button" class="mode-btn">矢印</button>
            <button id="folderModeDragBtn" type="button" class="mode-btn">ドラッグ</button>
          </div>
        </div>

        <div id="folderList" class="folder-list"></div>

        <div class="left-footer">
          <button id="saveFolderOrderBtn" class="primary">フォルダ順を保存</button>
          <div class="sub-actions">
            <button id="discardFolderOrderBtn">変更を破棄</button>
            <button id="reloadFolderListBtn">再読み込み</button>
          </div>
        </div>
      </aside>
      <section class="right-pane">
        <div class="pane-head">
          <div class="pane-title-row">
            <div>
              <div id="filePaneTitle" class="pane-title">ファイル</div>
              <div id="fileCount" class="muted"></div>
            </div>
            <div class="pane-toolbar">
              <span class="muted">操作方法</span>
              <button id="modeArrowBtn" type="button" class="mode-btn">矢印</button>
              <button id="modeDragBtn" type="button" class="mode-btn">ドラッグ</button>
            </div>
          </div>
        </div>

        <div id="fileList" class="file-list"></div>
        <div id="emptyState" class="empty-state" hidden>このフォルダには対象ファイルがありません。</div>

        <div class="right-footer">
          <button id="saveBtn" class="primary">保存してファイル名に反映</button>
          <div class="sub-actions">
            <button id="discardBtn">変更を破棄</button>
            <button id="reloadBtn">フォルダを再読み込み</button>
          </div>
        </div>
      </section>
    </main>

    <footer class="app-footer app-footer-global">
      <button id="closeBtn">閉じる</button>
    </footer>
  </div>
  <script nonce="${nonce}">window.__Mojigoto_REORDER_BOOT__ = ${boot};</script>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
}

module.exports = { getReorderEditorHtml };
