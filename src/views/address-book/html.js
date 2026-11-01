const fs = require("fs");
const path = require("path");
const { getNonce, escapeHtml } = require("../../core/path-utils");
const { getAddressBookScript } = require("../note-webview/script-address-book");

const css = fs.readFileSync(
  path.join(__dirname, "../note-webview/note-webview.css"),
  "utf8",
);

function getHtml(workTitle, workDir = "") {
  const nonce = getNonce();
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>呼び名一覧</title>
  <style>
    ${css}
    body { overflow: hidden; }
    .addressBookPanel { display: block; background: var(--vscode-editor-background); }
  </style>
</head>
<body>
  <aside id="addressBookPanel" class="addressBookPanel">
    <div class="addressBookDialog">
      <div class="addressBookHead">
        <div>
          <div class="addressBookTitle">${escapeHtml(workTitle)} — 呼び名一覧</div>
          <div class="panelHint">対角セルは一人称、交差セルは相手への呼び方です。</div>
        </div>
        <button class="secondary" type="button" id="closeAddressBookBtn">閉じる</button>
      </div>
      <div class="addressBookCandidateArea">
        <div class="addressBookCandidateSearch">
          <input id="addressCandidateSearch" type="search" placeholder="人物名・ノート名・分類名を検索" autocomplete="off">
          <select id="addressCandidateSelect" aria-label="追加する人物"></select>
          <button class="secondary" type="button" id="addressAddBtn">人物を追加</button>
        </div>
        <div class="addressCandidateFilters" role="group" aria-label="人物候補の絞り込み">
          <span>ノート:</span>
          <label><input type="checkbox" id="addressSourceReference" checked> 資料</label>
          <label><input type="checkbox" id="addressSourcePlot"> プロット</label>
          <span>種類:</span>
          <label><input type="checkbox" id="addressKindGroup" checked> 大分類</label>
          <label><input type="checkbox" id="addressKindDivider" checked> 区分</label>
          <label><input type="checkbox" id="addressKindItem" checked> 項目</label>
          <label class="addressDividerNameChoice">区分の名前:
            <select id="addressDividerNameSource"><option value="value">補足</option><option value="label">区分名</option></select>
          </label>
          <span id="addressCandidateCount" class="panelMeta"></span>
        </div>
      </div>
      <div class="addressBookToolbar">
        <span id="addressCount" class="panelMeta"></span>
        <span id="addressStatus" class="panelMeta">読み込み中…</span>
        <button class="secondary" type="button" id="addressReloadBtn">最新を読み直す</button>
        <button class="secondary" type="button" id="addressPreviewBtn">全体プレビュー</button>
        <button class="secondary" type="button" id="addressExportHtmlBtn">HTML書き出し</button>
        <button class="secondary" type="button" id="addressExportCsvBtn">CSV書き出し</button>
      </div>
      <div class="addressBookFilters">
        <label>表示する行 <select id="addressFocusSelect"></select></label>
        <details class="addressVisibilityPicker"><summary>表示する人物を絞る</summary><div id="addressVisibleOptions" class="addressVisibleOptions"></div><button class="secondary addressShowAllBtn" type="button" id="addressShowAllBtn">すべて表示</button></details>
        <details class="addressTermManager"><summary>呼び名候補を整理</summary><div id="addressTermManagerList" class="addressTermManagerList"></div></details>
      </div>
      <div id="addressMatrixRoot" class="addressMatrixRoot"><div class="addressEmpty">作品内のノートを読み込んでいます…</div></div>
      <div id="addressTermPicker" class="addressTermPicker" hidden></div>
      <div class="addressBookHint">入力済みの呼び方は、ほかのセルでも候補から選択できます。</div>
    </div>
    <aside id="addressPreviewPanel" class="addressPreviewPanel" hidden>
      <div class="addressPreviewDialog">
        <div class="addressPreviewHead">
          <div>
            <div class="addressBookTitle">${escapeHtml(workTitle)} — 呼び名一覧プレビュー</div>
            <div class="panelHint">絞り込みに関係なく、登録されている人物と呼び名をすべて表示します。</div>
          </div>
          <button class="secondary" type="button" id="closeAddressPreviewBtn">閉じる</button>
        </div>
        <div id="addressPreviewRoot" class="addressPreviewRoot"></div>
      </div>
    </aside>
  </aside>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    vscode.setState?.(${JSON.stringify({workDir, workTitle}).replace(/</g, "\\u003c")});
    const makeId = (prefix) => prefix + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    const esc = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const setStatus = (message) => { if (addressStatusEl) addressStatusEl.textContent = String(message || ""); };
    const addressBookPanel = document.getElementById("addressBookPanel");
    const closeAddressBookBtn = document.getElementById("closeAddressBookBtn");
    const addressCandidateSearch = document.getElementById("addressCandidateSearch");
    const addressCandidateSelect = document.getElementById("addressCandidateSelect");
    const addressAddBtn = document.getElementById("addressAddBtn");
    const addressSourceReference = document.getElementById("addressSourceReference");
    const addressSourcePlot = document.getElementById("addressSourcePlot");
    const addressKindGroup = document.getElementById("addressKindGroup");
    const addressKindDivider = document.getElementById("addressKindDivider");
    const addressKindItem = document.getElementById("addressKindItem");
    const addressDividerNameSource = document.getElementById("addressDividerNameSource");
    const addressCandidateCount = document.getElementById("addressCandidateCount");
    const addressCountEl = document.getElementById("addressCount");
    const addressStatusEl = document.getElementById("addressStatus");
    const addressFocusSelect = document.getElementById("addressFocusSelect");
    const addressVisibleOptionsEl = document.getElementById("addressVisibleOptions");
    const addressShowAllBtn = document.getElementById("addressShowAllBtn");
    const addressTermManagerList = document.getElementById("addressTermManagerList");
    const addressMatrixRoot = document.getElementById("addressMatrixRoot");
    const addressPreviewBtn = document.getElementById("addressPreviewBtn");
    const addressPreviewPanel = document.getElementById("addressPreviewPanel");
    const closeAddressPreviewBtn = document.getElementById("closeAddressPreviewBtn");
    const addressPreviewRoot = document.getElementById("addressPreviewRoot");
    const addressTermPicker = document.getElementById("addressTermPicker");
    const addressExportHtmlBtn = document.getElementById("addressExportHtmlBtn");
    const addressExportCsvBtn = document.getElementById("addressExportCsvBtn");
    let addressVisibleIds = new Set();
    let isAddressBookOpen = false;
    ${getAddressBookScript({ standalone: true })}
    registerAddressBookEvents();
    window.addEventListener("message", (event) => handleAddressBookMessage(event.data || {}));
    setAddressBookOpen(true);
  </script>
</body>
</html>`;
}

module.exports = { getHtml };
