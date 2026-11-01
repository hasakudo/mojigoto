const { getNonce, escapeHtml } = require("../core/path-utils");
const { getStyles } = require("./note-partial-import-styles");
const { getScript } = require("./note-partial-import-script");

function getPanelTitle() {
  return "選択インポート";
}

function escScriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function getHtml(initialData) {
  const nonce = getNonce();
  const dataJson = escScriptJson(initialData);
  const initialMode = String(initialData?.initialMode || "insert_entry");
  const isInsertMode = initialMode === "insert_entry";

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"
/>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(getPanelTitle())}</title>
<style>${getStyles()}</style>
</head>
<body>
  <div class="shell">
    <section class="card head">
      <div class="headTitle">
        <div class="title">${escapeHtml(getPanelTitle())}</div>
        <div class="modeTabs">
          <button type="button" id="modeInsertBtn">挿入</button>
          <button type="button" id="modeReplaceBtn">項目上書き</button>
        </div>
      </div>

      <div class="memoImportOptions" id="insertMemoOptions">
        <label><input type="checkbox" id="includeItemMemos" ${initialData.includeItemMemos !== false ? "checked" : ""}>項目メモも挿入する</label>
      </div>
      <div class="memoImportOptions" id="replaceMemoOptions" role="group" aria-label="項目上書きの対象">
        <label><input type="radio" name="replaceScope" id="replaceBodyOnly" value="body" ${initialData.replaceItemMemo === true ? "" : "checked"}>詳細本文のみ（メモを保持）</label>
        <label><input type="radio" name="replaceScope" id="replaceBodyAndMemo" value="bodyAndMemo" ${initialData.replaceItemMemo === true ? "checked" : ""}>詳細本文＋項目メモ</label>
      </div>
      <div class="memoImportSummary" id="memoImportSummary" role="status"></div>

      <div class="headMetaRow">
        <span>読み込み元: ${escapeHtml(initialData.sourceFileName || "")}</span>
        <span>対象ノート: ${escapeHtml(initialData.noteTypeLabel || "")} / ${escapeHtml(initialData.noteTitle || "無題ノート")}</span>
        <span>
          ${
            initialData.scopeGroupTitle
              ? `対象範囲: 大分類「${escapeHtml(initialData.scopeGroupTitle)}」`
              : "対象範囲: ノート全体"
          }
        </span>
      </div>

      <div class="headActions">
        <button type="button" class="secondary" id="openSourceFileBtn">
          ファイルを修正
        </button>
        <button type="button" class="secondary" id="reloadImportSourceBtn">
          再読み込み
        </button>
      </div>
    </section>

    <section class="card" id="resultNotice" hidden>
      <div id="resultNoticeText"></div>
    </section>

    <section class="card warning" id="warningCard" hidden>
      <details id="warningDetails" open>
        <summary id="warningSummary">
          警告
          <span class="warningHint">クリックで開閉</span>
        </summary>

        <div id="warningList"></div>
      </details>
    </section>

    <section class="layout ${isInsertMode ? "insertModeLayout" : ""}">
      <section class="card sourceColumn">
        <div class="sectionTitle" id="sourceSectionTitle"></div>

        <div class="filterRow">
          <input id="sourceFilterInput" type="text" placeholder="名称や本文で絞り込み" />
          <select id="sourceTypeFilter">
            <option value="all">すべて</option>
            <option value="group" data-insert-only="true">大分類</option>
            <option value="divider" data-insert-only="true">区分</option>
            <option value="entry">項目</option>
          </select>
        </div>

        <div id="sourceList" class="list"></div>
      </section>

      <div class="rightColumn">
        <section class="card previewColumn">
          <div class="sectionTitle">内容プレビュー</div>
          <div id="previewMeta" class="muted" style="margin-bottom:10px;"></div>
          <div id="previewBody" class="previewBody muted">左の項目を選択してください。</div>
        </section>

        <section class="card targetColumn" id="insertTargetPanel">
          <div class="sectionTitle">挿入先</div>

          <div class="targetFormGrid">
            <div class="muted">大分類</div>
            <select id="targetGroupSelect"></select>

            <div class="muted">位置</div>
            <select id="targetPositionSelect"></select>
          </div>

          <div id="groupInsertControls" hidden>
            <div class="targetFormGrid" style="margin-top:10px;">
              <div class="muted">大分類の位置</div>
              <select id="targetGroupPositionSelect"></select>
            </div>
            <div id="groupInsertPreviewMeta" class="previewNote"></div>
          </div>

          <div id="insertPreviewMeta" class="previewNote"></div>
          <div id="insertAroundPreview" class="insertAroundPreview"></div>
        </section>

        <section class="card targetColumn" id="replaceTargetPanel">
          <div class="sectionTitle">上書き先の項目</div>
          <div id="targetList" class="list targetListCompact"></div>
        </section>
      </div>
    </section>

    <section class="footer">
      <button type="button" id="applyKeepOpenBtn"></button>
      <button type="button" id="applyCloseBtn" class="secondary"></button>
      <button type="button" class="secondary" id="cancelBtn">閉じる</button>

      <div class="mobileJumpRow">
        <button type="button" class="secondary" id="jumpToSourceBtn"></button>
        <button type="button" class="secondary" id="jumpToTargetBtn"></button>
      </div>
    </section>
  </div>

  <script nonce="${nonce}">${getScript(dataJson)}</script>
</body>
</html>`;
}

module.exports = { getHtml, getPanelTitle };
