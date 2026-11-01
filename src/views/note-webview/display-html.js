const { getDisplayStyles } = require("./display-styles");
const { getDisplayScript } = require("./display-script");

function getDisplayHtml({ webview, css, nonce, mode }) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <style nonce="${nonce}">${getDisplayStyles(css)}
  </style></head><body class="${mode === "board" ? "noteDisplayBoard" : "noteDisplayList"}">
  <header class="noteDisplayHeader"><div id="displayWork"></div><h1 id="displayTitle"></h1><div id="displayStatus" role="status">読み込み中…</div><p id="displayWarning" role="alert" hidden></p><button id="dismissDisplayWarning" type="button" hidden>警告を閉じる</button></header>
  <div class="noteDisplayTools"><div class="noteDisplayMemoTools" role="group" aria-label="項目メモの一括開閉"><button id="openDisplayMemos" type="button" title="項目メモをすべて開く" aria-label="項目メモをすべて開く" disabled>メモを開く</button><button id="closeDisplayMemos" type="button" title="項目メモをすべて閉じる" aria-label="項目メモをすべて閉じる" disabled>メモを閉じる</button></div><button id="displayTocToggle" type="button" aria-expanded="false" aria-controls="displayToc">目次</button></div>
  <p id="displayNavigationStatus" role="status" hidden></p>
  <div class="noteDisplayLayout"><nav id="displayToc" aria-label="ノートの目次" hidden></nav><main id="displayContent" class="${mode === "board" ? "noteBoardRoot" : "previewWrap"}"></main></div>
  <dialog id="displayImageModal" aria-labelledby="displayImageTitle"><header><h2 id="displayImageTitle">画像</h2><button type="button" id="closeDisplayImage">閉じる</button></header><img id="displayImageLarge" alt=""><p id="displayImageCaption"></p></dialog>
  <script nonce="${nonce}">
${getDisplayScript(mode)}
  </script></body></html>`;
}

module.exports = { getDisplayHtml };
