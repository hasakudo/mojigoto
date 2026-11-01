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
  const fontScale = Math.min(
    1.6,
    Math.max(0.8, Number(initialState?.uiSettings?.fontScale || 1)),
  );

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>原稿構成エディタ</title>
  <link rel="stylesheet" href="${cssUri}">
</head>
<body style="--mojigoto-content-font-scale: ${fontScale};">
  <div class="app">
    <header class="app-header">
      <div class="app-header-title-row">
        <h1>原稿構成エディタ</h1>
        <button id="closeBtn" type="button" title="原稿構成エディタを閉じる">閉じる</button>
      </div>
      <p class="header-summary muted">フォルダとファイルの並び順・作品ツリー上の表示名をまとめて編集します。</p>
      <details class="header-help">
        <summary>使い方と注意を表示</summary>
        <div class="header-help-content">
          <p class="muted">表示名は複数項目を編集して各欄の下にある保存ボタンでまとめて保存できます。</p>
          <p class="muted">実名は各項目の「実名変更」から1ファイル／1フォルダずつ変更します。</p>
          <p class="muted">原稿はチェックした複数ファイルをまとめて移動できます。フォルダは「移動」から原稿直下または別フォルダ内へ移動できます。</p>
          <p class="muted">表示名だけの変更では実名を変更しません。</p>
          <p class="muted">並び替えを保存したときだけ先頭番号を付け直します。入れ子フォルダも、同じ親フォルダ内の兄弟同士で並び替えられます。</p>
          <p class="muted">「見出し挿入」は操作したファイル1件だけが対象です。</P>
          <p class="muted">フォルダ名を選んだ場合も、フォルダ内の複数ファイルへ一括挿入はしません。</p>
        </div>
      </details>
      <div id="currentTarget" class="current-target"></div>
      <div id="dirtyBadge" class="dirty-badge" hidden>未保存の変更があります</div>
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
          <button id="saveFolderOrderBtn" class="primary">フォルダを保存</button>
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
          <button id="moveSelectedFilesBtn">選択した原稿を移動</button>
          <button id="saveBtn" class="primary">ファイルを保存</button>
          <div class="sub-actions">
            <button id="discardBtn">変更を破棄</button>
            <button id="reloadBtn">フォルダを再読み込み</button>
          </div>
        </div>
      </section>
    </main>

  </div>
  <script nonce="${nonce}">window.__Mojigoto_REORDER_BOOT__ = ${boot};</script>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
}

module.exports = { getReorderEditorHtml };
