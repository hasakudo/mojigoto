const { getNonce, escapeHtml } = require("../core/path-utils");
const { getStyles } = require("./note-import-styles");
const { getScript } = require("./note-import-script");

function getImportPanelTitle(noteType) {
  return noteType === "plot" ? "プロットインポート" : "資料インポート";
}

function getImportHtml(initialData) {
  const nonce = getNonce();
  const dataJson = JSON.stringify(initialData)
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/&/g, "\\u0026");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(getImportPanelTitle(initialData.noteType))}</title>
<style>${getStyles()}</style>
</head>
<body>
  <div class="importShell">
    <header class="card importTopCard">
      <div class="importTopRow">
        <div class="importTopTitle">
          <div class="importTopMeta">
            <div class="importHeaderTitle">${escapeHtml(getImportPanelTitle(initialData.noteType))}</div>
            <div class="muted">読み込み元: ${escapeHtml(initialData.previewData?.source?.fileName || "")}</div>
          </div>
          <div class="headerActions">
              <button type="button" class="secondary" id="openSourceFileBtn">ファイルを修正</button>
              <button type="button" class="secondary" id="reloadImportSourceBtn">再読み込み</button>
          </div>
        </div>
        <div class="summaryCounts">
          <div class="summaryCountBox">
            <div class="summaryCountLabel">大分類</div>
            <div class="summaryCountValue">${escapeHtml(String(initialData.previewData?.counts?.groups ?? 0))}</div>
          </div>
          <div class="summaryCountBox">
            <div class="summaryCountLabel">区分</div>
            <div class="summaryCountValue">${escapeHtml(String(initialData.previewData?.counts?.dividers ?? 0))}</div>
          </div>
          <div class="summaryCountBox">
            <div class="summaryCountLabel">項目</div>
            <div class="summaryCountValue">${escapeHtml(String(initialData.previewData?.counts?.entries ?? 0))}</div>
          </div>
          <div class="summaryCountBox">
            <div class="summaryCountLabel">警告</div>
            <div class="summaryCountValue">${escapeHtml(String(initialData.previewData?.counts?.warnings ?? 0))}</div>
          </div>
        </div>
      </div>
      <div class="importTopTitleRow">
        <div class="importTitleBlock">
          <label class="label" for="noteTitleInput">ノートタイトル</label>
          <input
            id="noteTitleInput"
            class="textInput"
            type="text"
            value="${escapeHtml(initialData.previewData?.titleCandidate || "")}"
          />
        </div>
        
        <div class="importActions" id="btnActions"></div>
      </div>
      <div class="memoImportChoice">
        <label><input type="checkbox" id="includeItemMemos" ${initialData.includeItemMemos !== false ? "checked" : ""}>項目メモも取り込む</label>
        <span class="muted" id="memoImportSummary" role="status"></span>
      </div>
      ${
        String(initialData.mode || "") === "note_import"
          ? `<div class="muted">全体置換は大分類・項目・項目メモをすべて置き換えます。OFFでも既存メモは残りません。既存メモを残す場合は、選択インポートの「詳細本文のみ」を使ってください。</div>`
          : ""
      }
    </header>

    <section class="card" id="warningsCard">
      <div class="warningsHead">
        <div style="font-weight:600;">警告</div>
        <button type="button" class="secondary" id="hideWarningsBtn">閉じる</button>
      </div>
      <div id="warningList" class="warningList"></div>
    </section>

    <section class="card" id="warningsCollapsedCard" hidden>
      <div class="warningsCollapsedBar">
        <div class="muted" id="warningsCollapsedText">警告を閉じています。</div>
        <button type="button" class="secondary" id="showWarningsBtn">再表示</button>
      </div>
    </section>

    <section class="card">
      <div class="previewHead">
        <div style="font-weight:600;">プレビュー</div>
        <div class="btnbar">
          <button type="button" class="secondary" id="expandAllBtn">すべて開く</button>
          <button type="button" class="secondary" id="collapseAllBtn">すべて閉じる</button>
        </div>
      </div>
      <div class="previewlist" id="previewRoot"></div>
    </section>
  </div>

  <script nonce="${nonce}">${getScript(dataJson)}</script>
</body>
</html>`;
}

module.exports = { getImportHtml, getImportPanelTitle };
