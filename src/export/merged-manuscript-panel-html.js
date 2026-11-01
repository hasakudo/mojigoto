const { getPanelStyles } = require("./merged-manuscript-panel-styles");
const { getPanelScript } = require("./merged-manuscript-panel-script");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getPunctuationLayoutLabel(mode) {
  return mode === "pushout" ? "追い込み" : "ぶら下げ";
}

function getNonce() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getPanelHtml(webview, state, resetState) {
  const nonce = getNonce();
  const punctuationLabel = getPunctuationLayoutLabel(
    state.punctuationLayoutMode,
  );

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"
/>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>縦書きHTML書き出し</title>
<style>${getPanelStyles()}</style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <h1>縦書きHTML書き出し</h1>
      ${state.exportScopeDescription ? `<p>${escapeHtml(state.exportScopeDescription)}</p>` : ""}
      <p>
        指定文字数と行数でHTMLを書き出せる。簡易印刷/保存モードと実寸優先の印刷/保存モード
      </p>
    </section>

    <div class="error" id="errorBox"></div>

    <div class="grid">
      <section class="card compactRows">
        <h2>出力設定</h2>

        <div class="row">
          <label class="label" for="exportMode">モード</label>
          <select id="exportMode">
            <option value="simple"${state.exportMode === "simple" ? " selected" : ""}>簡易印刷/保存</option>
            <option value="real"${state.exportMode === "real" ? " selected" : ""}>実寸優先</option>
          </select>
          <div class="hint" id="exportModeHint">-</div>
        </div>

        <div class="row inline">
          <label class="label" for="useTypographyAdjustments">体裁調整を使う</label>
          <input id="useTypographyAdjustments" type="checkbox"${state.useTypographyAdjustments ? " checked" : ""}>
          <div class="hint">OFFでは、ぶら下げ・追い込みなどの自動調整を行いません。</div>
        </div>

        <div class="row">
          <label class="label" for="punctuationLayoutMode">句読点処理</label>
          <select id="punctuationLayoutMode">
            <option value="hanging"${state.punctuationLayoutMode === "hanging" ? " selected" : ""}>ぶら下げ</option>
            <option value="pushout"${state.punctuationLayoutMode === "pushout" ? " selected" : ""}>追い込み</option>
          </select>
          <div class="hint">簡易／実寸優先のどちらにも適用されます。</div>
        </div>

        <div id="simpleLeftPane">
          <div class="row">
            <label class="label" for="layoutMode">版組</label>
            <select id="layoutMode">
              <option value="single"${state.htmlPrintLayoutMode === "single" ? " selected" : ""}>通常</option>
              <option value="2up"${state.htmlPrintLayoutMode === "2up" ? " selected" : ""}>2ページ面付け</option>
            </select>
            <div class="hint">通常は1枚ずつ。2ページ面付けは横向きA4前提です。</div>
          </div>

          <div class="row inline">
            <label class="label" for="showPageNumbers">ページ番号（右下）</label>
            <input id="showPageNumbers" type="checkbox"${state.showPageNumbers ? " checked" : ""}>
          </div>

          <div class="row">
            <label class="label" for="printFontSizePt">印刷用フォントサイズ (pt)</label>
            <input id="printFontSizePt" type="number" min="6" max="40" step="0.1" value="${escapeHtml(state.printFontSizePt)}">
            <div class="hint">印刷向けのサイズ指定です。</div>
          </div>

          <div class="row">
            <label class="label" for="printLineHeight">印刷用行送り</label>
            <input id="printLineHeight" type="number" min="1.4" max="3" step="0.01" value="${escapeHtml(state.printLineHeight)}">
            <div class="hint">ルビがある場合は1.7以上推奨</div>
          </div>

          <div id="singleOnlyFields">
            <div class="row">
              <label class="label" for="htmlPrintOrientation">想定用紙向き</label>
              <select id="htmlPrintOrientation">
                <option value="portrait"${state.htmlPrintOrientation === "portrait" ? " selected" : ""}>A4縦</option>
                <option value="landscape"${state.htmlPrintOrientation === "landscape" ? " selected" : ""}>A4横</option>
              </select>
              <div class="hint">通常印刷の等倍判定に使います。2ページ面付けはA4横固定です。</div>
            </div>

            <div class="row">
              <label class="label" for="printMarginMm">余白 mm</label>
              <input id="printMarginMm" type="number" min="0" max="60" step="1" value="${escapeHtml(state.printMarginMm)}">
              <div class="hint">通常1ページ印刷の外側余白です。0 のままでも使えます。</div>
            </div>

            <input id="printBodyPaddingPx" type="hidden" value="0">
          </div>

          <div class="noticeBox is-hidden" id="twoUpNoticeBox">
            <strong>2ページ面付けの注意</strong><br>
            横向きA4前提です。フォントサイズ・行送り・文字数・行数しだいで収まりが変わります。<br>
            行数を増やしすぎると欠ける場合があります。まずは20行前後から確認してください。
          </div>
        </div>

        <div class="is-hidden" id="realPrintFields">
                    <div class="sectionBox">
            <div class="sectionBoxTitle">基本設定</div>

            <div class="fieldGrid">
              <div class="row">
                <label class="label" for="realPrintPageSize">判型</label>
                <select id="realPrintPageSize">
                  <option value="a5"${state.realPrintPageSize === "a5" ? " selected" : ""}>A5</option>
                  <option value="a6"${state.realPrintPageSize === "a6" ? " selected" : ""}>A6</option>
                  <option value="b6"${state.realPrintPageSize === "b6" ? " selected" : ""}>B6</option>
                  <option value="shiroku"${state.realPrintPageSize === "shiroku" ? " selected" : ""}>四六判</option>
                  <option value="shinsho"${state.realPrintPageSize === "shinsho" ? " selected" : ""}>新書判</option>
                </select>
              </div>

              <div class="row">
                <label class="label" for="realPrintColumnMode">版組</label>
                <select id="realPrintColumnMode">
                  <option value="single"${state.realPrintColumnMode !== "two" ? " selected" : ""}>通常</option>
                  <option value="two"${state.realPrintColumnMode === "two" ? " selected" : ""}>二段組み</option>
                </select>
                <div class="hint" id="realPrintColumnModeHint">
                  二段組みは A5 / 新書判のみ選択できます。
                </div>
              </div>

              <div class="row">
                <label class="label" for="realPrintFontSizePt">フォントサイズ (pt)</label>
                <input id="realPrintFontSizePt" type="number" min="1" max="40" step="0.1" value="${escapeHtml(state.realPrintFontSizePt)}">
              </div>

              <div class="row" id="realPrintColumnGapRow">
                <label class="label" for="realPrintColumnGapMm">段間 mm</label>
                <input id="realPrintColumnGapMm" type="number" min="0" max="30" step="0.1" value="${escapeHtml(state.realPrintColumnGapMm)}">
              </div>

              <div class="row">
                <label class="label" for="realPrintCharsPerLine">文字数</label>
                <input id="realPrintCharsPerLine" type="number" min="1" max="200" step="1" value="${escapeHtml(state.realPrintCharsPerLine)}">
              </div>

              <div class="row">
                <label class="label" id="realPrintLinesPerPageLabel" for="realPrintLinesPerPage">行数</label>
                <input id="realPrintLinesPerPage" type="number" min="1" max="200" step="1" value="${escapeHtml(state.realPrintLinesPerPage)}">
              </div>

              <div class="row">
                <label class="label" for="realPrintMarginTopMm">上余白 mm</label>
                <input id="realPrintMarginTopMm" type="number" min="0" max="100" step="0.5" value="${escapeHtml(state.realPrintMarginTopMm)}">
              </div>

              <div class="row">
                <label class="label" for="realPrintMarginBottomMm">下余白 mm</label>
                <input id="realPrintMarginBottomMm" type="number" min="0" max="100" step="0.5" value="${escapeHtml(state.realPrintMarginBottomMm)}">
              </div>

              <div class="row">
                <label class="label" for="realPrintMarginRightMm">小口余白 mm</label>
                <input id="realPrintMarginRightMm" type="number" min="0" max="100" step="0.5" value="${escapeHtml(state.realPrintMarginRightMm)}">
              </div>

              <div class="row">
                <label class="label" for="realPrintMarginLeftMm">ノド余白 mm</label>
                <input id="realPrintMarginLeftMm" type="number" min="0" max="100" step="0.5" value="${escapeHtml(state.realPrintMarginLeftMm)}">
              </div>

              <div class="row inline fieldGridWide">
                <label class="label" for="realPrintMirrorMargins">奇数/偶数でノド・小口を入れ替える</label>
                <input id="realPrintMirrorMargins" type="checkbox"${state.realPrintMirrorMargins ? " checked" : ""}>
              </div>

              <div class="row fieldGridWide">
                <label class="label" for="realPrintStartPageSide">1ページ目の扱い</label>
                <select id="realPrintStartPageSide">
                  <option value="odd"${state.realPrintStartPageSide === "odd" ? " selected" : ""}>奇数ページから始める</option>
                  <option value="even"${state.realPrintStartPageSide === "even" ? " selected" : ""}>偶数ページから始める</option>
                </select>
                <div class="hint">ノド・小口、ノド以外の裁ち落とし、ページ番号位置の判定に使います。</div>
              </div>
            </div>
          </div>

          <div class="sectionBox">
            <div class="row inline" style="margin-bottom: 10px;">
              <label class="label" for="realPrintBookOptionsEnabled">製本向けオプションを使う</label>
              <input id="realPrintBookOptionsEnabled" type="checkbox"${state.realPrintBookOptionsEnabled ? " checked" : ""}>
            </div>

            <div class="hint">
              裁ち落とし、ページ番号、見出し1のヘッダー/フッター表示を使う場合にONにします。
            </div>

            <div id="realPrintBookOptionsFields" class="${state.realPrintBookOptionsEnabled ? "" : "is-hidden"}" style="margin-top: 12px;">
              <div class="fieldGrid">
                <div class="row">
                  <label class="label" for="realPrintBleedMm">裁ち落とし mm</label>
                  <input id="realPrintBleedMm" type="number" min="0" max="20" step="0.5" value="${escapeHtml(state.realPrintBleedMm)}">
                </div>

                <div class="row">
                  <label class="label" for="realPrintBleedMode">裁ち落とし適用</label>
                  <select id="realPrintBleedMode">
                    <option value="all"${state.realPrintBleedMode === "all" ? " selected" : ""}>四方</option>
                    <option value="nonSpine"${state.realPrintBleedMode === "nonSpine" ? " selected" : ""}>ノド以外</option>
                  </select>
                </div>

                <div class="hint fieldGridWide">
                  「ノド以外」は奇数/偶数ページに合わせて、ノド側の裁ち落としを外します。
                </div>

                <div class="row inline">
                  <label class="label" for="realPrintShowPageNumber">ページ番号を表示</label>
                  <input id="realPrintShowPageNumber" type="checkbox"${state.realPrintShowPageNumber ? " checked" : ""}>
                </div>

                <div class="row">
                  <label class="label" for="realPrintPageNumberStart">ページ番号開始</label>
                  <input id="realPrintPageNumberStart" type="number" min="1" max="9999" step="1" value="${escapeHtml(state.realPrintPageNumberStart)}">
                </div>

                <div class="row inline">
                  <label class="label" for="realPrintShowHeading1">見出し1を表示</label>
                  <input id="realPrintShowHeading1" type="checkbox"${state.realPrintShowHeading1 ? " checked" : ""}>
                </div>

                <div class="row">
                  <label class="label" for="realPrintHeading1Mode">見出し1の表示範囲</label>
                  <select id="realPrintHeading1Mode">
                    <option value="all"${state.realPrintHeading1Mode === "all" ? " selected" : ""}>全ページ</option>
                    <option value="evenOnly"${state.realPrintHeading1Mode === "evenOnly" ? " selected" : ""}>偶数ページのみ</option>
                  </select>
                </div>

                <div class="row">
                  <label class="label" for="realPrintHeaderOrder">表示順</label>
                  <select id="realPrintHeaderOrder">
                    <option value="numberTitle"${state.realPrintHeaderOrder === "numberTitle" ? " selected" : ""}>数字　見出し</option>
                    <option value="titleNumber"${state.realPrintHeaderOrder === "titleNumber" ? " selected" : ""}>見出し　数字</option>
                  </select>
                </div>

                <div class="row">
                  <label class="label" for="realPrintHeaderPosition">位置</label>
                  <select id="realPrintHeaderPosition">
                    <option value="top"${state.realPrintHeaderPosition === "top" ? " selected" : ""}>上余白</option>
                    <option value="bottom"${state.realPrintHeaderPosition === "bottom" ? " selected" : ""}>下余白</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="is-hidden" id="realPrintMetricsBox">
          <h2>実寸優先モードの計算結果</h2>

          <div class="metaGrid">
            <div class="metaKey">判型</div>
            <div class="metaValue" id="realTrimSize">-</div>

            <div class="metaKey">本文面</div>
            <div class="metaValue" id="realContentBox">-</div>

            <div class="metaKey">文字サイズ</div>
            <div class="metaValue" id="realFontSize">-</div>

            <div class="metaKey">出力字間</div>
            <div class="metaValue" id="realCharSpacing">-</div>

            <div class="metaKey">推定行送り</div>
            <div class="metaValue" id="realLineSpacing">-</div>

            <div class="metaKey">判定</div>
            <div class="metaValue" id="realStatus">-</div>
          </div>

          <div style="height: 12px;"></div>

          <div class="noticeBox" id="realMessagesBox">-</div>

          <div class="previewButtonRow">
            <button class="secondary" id="openRealPreviewButton" type="button">プレビューを見る</button>
          </div>

          <div style="height: 14px;"></div>
          <h2 style="margin-top: 0;">注意</h2>
          <ul class="noteList" id="singleModeNotes">
            <li>フォントは縦書きプレビューの設定で出力されます。</li>
            <li>PDF保存はブラウザの印刷からドライバを選んで保存してください。</li>
            <li>計算上収まっていても、フォントやPDF変換環境によって見え方が変わる場合があります。</li>
            <li>PDF保存直後は、PDF作成ソフト側の書き込みが完了していない場合があります。開けない場合は数秒待ってから開いてください。</li>
          </ul>
        </div>
        <div id="simpleRightPane">
          <h2>現在の体裁設定</h2>
          <div class="metaGrid">
            <div class="metaKey">文字数</div>
            <div class="metaValue" id="currentCharsPerLine">${escapeHtml(state.charsPerLine)} 字</div>

            <div class="metaKey">行数</div>
            <div class="metaValue" id="currentLinesPerPage">${escapeHtml(state.linesPerPage)} 行</div>

            <div class="metaKey">フォント</div>
            <div class="metaValue" id="currentFontFamily">${escapeHtml(state.fontFamily)}</div>

            <div class="metaKey">句読点処理</div>
            <div class="metaValue" id="currentPunctuationLayout">${escapeHtml(punctuationLabel)}</div>

            <div class="metaKey">体裁調整</div>
            <div class="metaValue" id="currentTypographyAdjustments">${state.useTypographyAdjustments ? "ON" : "OFF"}</div>
          </div>

          <div style="height: 14px;"></div>

          <h2>体裁の変更</h2>
          <div class="row">
            <label class="label" for="charsPerLine">文字数</label>
            <input id="charsPerLine" type="number" min="1" max="200" step="1" value="${escapeHtml(state.charsPerLine)}">
          </div>

          <div class="row">
            <label class="label" for="linesPerPage">行数</label>
            <input id="linesPerPage" type="number" min="1" max="200" step="1" value="${escapeHtml(state.linesPerPage)}">
          </div>

          <div class="noticeBox warningBox is-hidden" id="simplePrintWarningBox">
            <div class="warningBoxTitle">印刷時の注意</div>
            <div id="simplePrintWarningMessages"></div>
          </div>

          <div class="previewButtonRow">
            <button class="secondary" id="openSimplePreviewButton" type="button">A4プレビューを見る</button>
            <button class="secondary" id="openSimpleGuideButton" type="button">体裁の目安を確認</button>
          </div>

          <div style="height: 14px;"></div>

          <h2 style="margin-top: 0;">注意</h2>
          <ul class="noteList" id="singleModeNotes">
            <li>体裁の初期値は縦書きプレビューの設定です。</li>
            <li>この画面での文字数と行数、句読点処理の変更は縦書きプレビューの設定には反映されません。</li>
            <li>フォントは縦書きプレビューの設定で出力されます。</li>
            <li>PDF保存はブラウザの印刷からドライバを選んで保存してください。</li>
            <li>PDF保存直後は、PDF作成ソフト側の書き込みが完了していない場合があります。開けない場合は数秒待ってから開いてください。</li>
          </ul>
        </div>
      </section>
    </div>

    <div class="overlay is-hidden" id="realPreviewOverlay">
      <div class="overlayCard" role="dialog" aria-modal="true" aria-labelledby="realPreviewTitle">
        <div class="overlayHeader">
          <h3 id="realPreviewTitle">印刷プレビュー</h3>
          <div class="overlayActions">
            <button class="primary" id="submitFromPreviewButton" type="button">HTMLを書き出す</button>
            <button class="secondary" id="closeRealPreviewButton" type="button">閉じる</button>
          </div>
        </div>

        ${state.previewChapters.length ? `<div class="previewChapterRow">
          <label for="previewChapterSelect">プレビューする章</label>
          <select id="previewChapterSelect">${state.previewChapters.map(chapter => `<option value="${escapeHtml(chapter.id)}">${escapeHtml(chapter.title)}</option>`).join("")}</select>
        </div>` : ""}
        <div class="previewMeta" id="realPreviewMeta">-</div>

        <div class="previewStage realHtmlPreviewStage">
          <div class="realPreviewLoading is-hidden" id="realPreviewLoading">
            プレビューを生成しています…
          </div>
          <iframe id="realPreviewFrame" class="realPreviewFrame" title="原稿の印刷プレビュー"></iframe>

          <div class="previewSheet is-hidden" id="realPreviewSheet">
            <div class="previewContentBox" id="realPreviewContentBox">
              <div class="previewColumns" id="realPreviewColumns"></div>
            </div>

            <div class="previewMarginLabel" id="realPreviewTopLabel">上</div>
            <div class="previewMarginLabel" id="realPreviewBottomLabel">下</div>
            <div class="previewMarginLabel" id="realPreviewRightLabel">右</div>
            <div class="previewMarginLabel" id="realPreviewLeftLabel">左</div>
          </div>
        </div>
      </div>
    </div>

    <div class="noticeBox footerStatusBox is-hidden" id="footerStatusBox"></div>

    <div class="footer">
      <div class="footerInner">
        <button class="secondary" id="resetButton" type="button">初期値に戻す</button>
        <button class="secondary" id="cancelButton" type="button">閉じる</button>
        <button class="primary" id="submitButton" type="button">HTMLを書き出す</button>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">${getPanelScript(state, resetState)}</script>
</body>
</html>`;
}

module.exports = { getPanelHtml };
