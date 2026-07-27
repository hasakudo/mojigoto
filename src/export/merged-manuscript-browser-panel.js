const vscode = require("vscode");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toPositiveNumber(
  value,
  fallback,
  min = 0,
  max = Number.POSITIVE_INFINITY,
) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function pxToPt(px) {
  const n = Number(px);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 0.75 * 10) / 10;
}

function ptToPx(pt) {
  const n = Number(pt);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n / 0.75);
}

function normalizePanelState(initialState = {}) {
  const punctuation = String(initialState.punctuationLayoutMode || "hanging")
    .trim()
    .toLowerCase();

  return {
    format: "html",
    htmlTarget: "browser",
    htmlDirection: "vertical",
    htmlShowTitle: false,
    htmlPageSize: "auto",
    htmlOrientation: "auto",

    htmlPrintLayoutMode:
      String(initialState.htmlPrintLayoutMode || "single") === "2up"
        ? "2up"
        : "single",

    htmlPrintOrientation:
      String(initialState.htmlPrintOrientation || "portrait") === "landscape"
        ? "landscape"
        : "portrait",

    showPageNumbers: initialState.showPageNumbers === true,

    printFontSizePt: (() => {
      const savedPt = Number(initialState.printFontSizePt);
      if (Number.isFinite(savedPt) && savedPt > 0) {
        return toPositiveNumber(savedPt, pxToPt(14.5), 6, 40);
      }

      return toPositiveNumber(
        pxToPt(initialState.printFontSizePx),
        pxToPt(14.5),
        6,
        40,
      );
    })(),

    printFontSizePx: (() => {
      const savedPt = Number(initialState.printFontSizePt);
      if (Number.isFinite(savedPt) && savedPt > 0) {
        return ptToPx(savedPt);
      }

      return toPositiveNumber(initialState.printFontSizePx, 14.5, 8, 40);
    })(),

    printLineHeight: toPositiveNumber(
      initialState.printLineHeight,
      1.72,
      1.4,
      3,
    ),
    printMarginMm: toPositiveNumber(initialState.printMarginMm, 0, 0, 60),
    printBodyPaddingPx: 0,

    charsPerLine: toPositiveNumber(initialState.charsPerLine, 42, 1, 200),
    linesPerPage: toPositiveNumber(initialState.linesPerPage, 16, 1, 200),
    fontFamily: String(initialState.fontFamily || "serif").trim() || "serif",
    punctuationLayoutMode: punctuation === "pushout" ? "pushout" : "hanging",
    useTypographyAdjustments: initialState.useTypographyAdjustments !== false,
    pageSizeLabel: String(initialState.pageLabel || "auto"),

    exportMode:
      String(initialState.exportMode || "simple")
        .trim()
        .toLowerCase() === "real"
        ? "real"
        : "simple",

    realPrintPageSize: (() => {
      const v = String(initialState.realPrintPageSize || "b6")
        .trim()
        .toLowerCase();

      if (
        v === "a5" ||
        v === "a6" ||
        v === "b6" ||
        v === "shiroku" ||
        v === "shinsho"
      ) {
        return v;
      }

      return "b6";
    })(),

    realPrintColumnMode: (() => {
      const size = String(initialState.realPrintPageSize || "b6")
        .trim()
        .toLowerCase();

      const mode = String(initialState.realPrintColumnMode || "single")
        .trim()
        .toLowerCase();

      if (mode === "two" && (size === "a5" || size === "shinsho")) {
        return "two";
      }

      return "single";
    })(),

    realPrintColumnGapMm: toPositiveNumber(
      initialState.realPrintColumnGapMm,
      0,
      0,
      30,
    ),

    realPrintFontSizePt: toPositiveNumber(
      initialState.realPrintFontSizePt,
      9,
      1,
      40,
    ),

    realPrintBleedMm: toPositiveNumber(initialState.realPrintBleedMm, 0, 0, 20),

    realPrintBleedMode:
      String(initialState.realPrintBleedMode || "all") === "nonSpine"
        ? "nonSpine"
        : "all",

    realPrintMirrorMargins: initialState.realPrintMirrorMargins !== false,

    realPrintStartPageSide:
      String(initialState.realPrintStartPageSide || "odd") === "even"
        ? "even"
        : "odd",

    realPrintBookOptionsEnabled:
      initialState.realPrintBookOptionsEnabled === true,

    realPrintShowPageNumber: initialState.realPrintShowPageNumber === true,

    realPrintPageNumberStart: toPositiveNumber(
      initialState.realPrintPageNumberStart,
      1,
      1,
      9999,
    ),

    realPrintShowHeading1: initialState.realPrintShowHeading1 === true,

    realPrintHeading1Mode:
      String(initialState.realPrintHeading1Mode || "all") === "evenOnly"
        ? "evenOnly"
        : "all",

    realPrintHeaderOrder:
      String(initialState.realPrintHeaderOrder || "numberTitle") ===
      "titleNumber"
        ? "titleNumber"
        : "numberTitle",

    realPrintHeaderPosition:
      String(initialState.realPrintHeaderPosition || "bottom") === "top"
        ? "top"
        : "bottom",

    realPrintMarginTopMm: toPositiveNumber(
      initialState.realPrintMarginTopMm,
      22,
      0,
      100,
    ),
    realPrintMarginBottomMm: toPositiveNumber(
      initialState.realPrintMarginBottomMm,
      18,
      0,
      100,
    ),
    realPrintMarginRightMm: toPositiveNumber(
      initialState.realPrintMarginRightMm,
      18,
      0,
      100,
    ),
    realPrintMarginLeftMm: toPositiveNumber(
      initialState.realPrintMarginLeftMm,
      14,
      0,
      100,
    ),

    realPrintCharsPerLine: toPositiveNumber(
      initialState.realPrintCharsPerLine,
      42,
      1,
      200,
    ),
    realPrintLinesPerPage: toPositiveNumber(
      initialState.realPrintLinesPerPage,
      16,
      1,
      200,
    ),

    realPrintMetrics:
      initialState.realPrintMetrics &&
      typeof initialState.realPrintMetrics === "object"
        ? initialState.realPrintMetrics
        : null,

    realPrintSavedBySize:
      initialState.realPrintSavedBySize &&
      typeof initialState.realPrintSavedBySize === "object"
        ? initialState.realPrintSavedBySize
        : {},

    simpleSavedByLayout:
      initialState.simpleSavedByLayout &&
      typeof initialState.simpleSavedByLayout === "object"
        ? initialState.simpleSavedByLayout
        : {},
  };
}

let mergedManuscriptBrowserPanelRef = null;
let mergedManuscriptBrowserPanelResolve = null;

const PANEL_PERSIST_KEY = "mojigoto.mergedManuscriptBrowserPanelState";

function normalizePersistedPanelState(value = {}) {
  const exportMode =
    String(value.exportMode || "simple")
      .trim()
      .toLowerCase() === "real"
      ? "real"
      : "simple";

  const realPrintPageSize = (() => {
    const v = String(value.realPrintPageSize || "b6")
      .trim()
      .toLowerCase();
    if (
      v === "a5" ||
      v === "a6" ||
      v === "b6" ||
      v === "shiroku" ||
      v === "shinsho"
    ) {
      return v;
    }
    return "b6";
  })();

  const realPrintColumnMode = (() => {
    const mode = String(value.realPrintColumnMode || "single")
      .trim()
      .toLowerCase();

    if (
      mode === "two" &&
      (realPrintPageSize === "a5" || realPrintPageSize === "shinsho")
    ) {
      return "two";
    }

    return "single";
  })();

  return {
    exportMode,
    realPrintPageSize,
    realPrintColumnMode,
    useTypographyAdjustments: value.useTypographyAdjustments !== false,
    punctuationLayoutMode:
      value.punctuationLayoutMode === "pushout" ? "pushout" : "hanging",
  };
}

async function updatePersistedPanelUiState(context, nextState = {}) {
  if (!context?.workspaceState) return;

  const prev = context.workspaceState.get(PANEL_PERSIST_KEY) || {};

  const normalized = normalizePersistedPanelState(nextState);

  const next = {
    ...(prev && typeof prev === "object" ? prev : {}),
    exportMode: normalized.exportMode,
    realPrintPageSize: normalized.realPrintPageSize,
    realPrintColumnMode: normalized.realPrintColumnMode,
    useTypographyAdjustments: normalized.useTypographyAdjustments,
    punctuationLayoutMode: normalized.punctuationLayoutMode,
  };

  if (
    nextState.simpleSavedByLayout &&
    typeof nextState.simpleSavedByLayout === "object"
  ) {
    next.simple = {
      ...(next.simple && typeof next.simple === "object" ? next.simple : {}),
      currentLayoutMode:
        String(
          nextState.htmlPrintLayoutMode ||
            next.simple?.currentLayoutMode ||
            "single",
        ) === "2up"
          ? "2up"
          : "single",
      byLayout: {
        ...(next.simple?.byLayout && typeof next.simple.byLayout === "object"
          ? next.simple.byLayout
          : {}),
        ...nextState.simpleSavedByLayout,
      },
    };
  }

  if (
    nextState.realPrintSavedBySize &&
    typeof nextState.realPrintSavedBySize === "object"
  ) {
    next.realBySize = {
      ...(next.realBySize && typeof next.realBySize === "object"
        ? next.realBySize
        : {}),
      ...nextState.realPrintSavedBySize,
    };
  }

  await context.workspaceState.update(PANEL_PERSIST_KEY, next);
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
<style>
  :root {
    color-scheme: light dark;
  }

  html, body {
    margin: 0;
    padding: 0;
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family);
    font-size: 13px;
  }

  body {
    padding: 16px 16px 84px;
  }

  .shell {
    width: min(1120px, 100%);
    max-width: none;
    margin: 0 auto;
    display: grid;
    gap: 14px;
  }

  .hero {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 10px;
    background: var(--vscode-sideBar-background);
    padding: 14px 16px;
  }

  .hero h1 {
    margin: 0 0 6px;
    font-size: 18px;
    line-height: 1.4;
  }

  .hero p {
    margin: 0;
    color: var(--vscode-descriptionForeground);
    line-height: 1.6;
  }

  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.9fr);
    gap: 14px;
  }

  .card {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 10px;
    background: var(--vscode-sideBar-background);
    padding: 14px 16px;
    min-width: 0;
  }

  .card h2 {
    margin: 0 0 12px;
    font-size: 14px;
    line-height: 1.4;
  }

  .row {
    display: grid;
    gap: 6px;
    margin-bottom: 12px;
  }

  .row:last-child {
    margin-bottom: 0;
  }

  .row.inline {
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 12px;
  }

  .sectionBox {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    padding: 10px 12px;
    background: var(--vscode-editor-background);
    margin-bottom: 12px;
  }

  .sectionBoxTitle {
    font-weight: 700;
    margin: 0 0 8px;
    line-height: 1.4;
  }

  .sectionBoxHint {
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    line-height: 1.5;
    margin: -2px 0 10px;
  }

  .fieldGrid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px 14px;
  }

  .fieldGrid .row {
    margin-bottom: 0;
  }

  .fieldGrid > .row {
    align-self: start;
  }

  .fieldGridWide {
    grid-column: 1 / -1;
  }

  .fieldGridPlaceholder {
    visibility: hidden;
    pointer-events: none;
  }

  .realTrimMain {
    font-weight: 600;
  }

  .realTrimSub {
    margin-top: 3px;
    color: var(--vscode-descriptionForeground);
    line-height: 1.45;
  }

  @media (max-width: 620px) {
    .fieldGrid {
      grid-template-columns: 1fr;
    }

    .fieldGridWide {
      grid-column: auto;
    }
  }

  .label {
    font-weight: 600;
  }

  .hint {
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    line-height: 1.5;
  }

  input[type="number"],
  select {
    width: 100%;
    box-sizing: border-box;
    height: 30px;
    min-height: 30px;
    padding: 4px 8px;
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 6px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
  }

  input[type="checkbox"] {
    transform: translateY(1px);
  }

  .metaGrid {
    display: grid;
    grid-template-columns: 86px minmax(0, 1fr);
    gap: 8px 10px;
    align-items: start;
  }

  .metaKey {
    color: var(--vscode-descriptionForeground);
  }

  .metaValue {
    word-break: break-word;
  }

  .noteList {
    margin: 0;
    padding-left: 18px;
    color: var(--vscode-descriptionForeground);
    line-height: 1.6;
  }

  .footer {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 900;

    display: flex;
    justify-content: center;
    gap: 10px;

    padding: 10px 16px;
    box-sizing: border-box;

    background: color-mix(
      in srgb,
      var(--vscode-editor-background) 92%,
      transparent
    );
    border-top: 1px solid var(--vscode-panel-border);
    backdrop-filter: blur(8px);
  }

  .footerInner {
    width: min(1120px, 100%);
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  button {
    min-height: 32px;
    padding: 0 14px;
    border-radius: 6px;
    border: 1px solid var(--vscode-button-border, transparent);
    cursor: pointer;
  }

  button.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }

  button.secondary {
    background: transparent;
    color: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
    border-color: var(--vscode-panel-border);
  }

  .error {
    display: none;
    border: 1px solid var(--vscode-inputValidation-errorBorder, #be1100);
    background: var(--vscode-inputValidation-errorBackground, transparent);
    color: var(--vscode-inputValidation-errorForeground, var(--vscode-editor-foreground));
    border-radius: 8px;
    padding: 10px 12px;
    line-height: 1.5;
  }

  .error.is-visible {
    display: block;
  }

  .is-hidden {
    display: none !important;
  }

  #twoUpNoticeBox {
    margin-top: 4px;
  }

  .noticeBox {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    padding: 10px 12px;
    background: var(--vscode-editor-background);
    color: var(--vscode-descriptionForeground);
    line-height: 1.6;
    font-size: 12px;
  }

  .warningBox {
    border-color: var(--vscode-inputValidation-warningBorder, #b89500);
    background: var(--vscode-inputValidation-warningBackground, var(--vscode-editor-background));
    color: var(--vscode-inputValidation-warningForeground, var(--vscode-editor-foreground));
    white-space: pre-line;
    min-height: 0;
    padding: 4px 12px;
    line-height: 1.3;
  }

  .warningBoxTitle {
    font-weight: 700;
    margin: 0;
    line-height: 1.35;
  }

  #simplePrintWarningMessages {
    margin: 0;
    line-height: 1.45;
  }

  .warningBox > div {
    padding: 0;
  }

  .footerStatusBox {
    position: fixed;
    left: 50%;
    bottom: 58px;
    transform: translateX(-50%);
    z-index: 901;

    width: min(1120px, calc(100% - 32px));
    box-sizing: border-box;

    margin: 0;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.16);
  }

  @media (max-width: 520px) {
    body {
      padding-bottom: 128px;
    }

    .footerInner {
      flex-wrap: wrap;
    }

    .footerInner button {
      flex: 1 1 auto;
    }

    .footerStatusBox {
      bottom: 104px;
    }
  }

  .compactRows .row {
    margin-bottom: 10px;
  }

  .previewButtonRow {
    margin-top: 12px;
    display: flex;
    justify-content: flex-start;
  }

  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.42);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    z-index: 1000;
  }

  .overlayCard {
    width: min(760px, 100%);
    max-height: min(88vh, 920px);
    overflow: auto;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 12px;
    background: var(--vscode-sideBar-background);
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.28);
    padding: 16px;
  }

  .overlayHeader {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
  }

  .overlayHeader h3 {
    margin: 0;
    font-size: 15px;
    line-height: 1.4;
  }

  .overlayActions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
  }

  .previewMeta {
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    line-height: 1.6;
    margin-bottom: 14px;
  }

  .previewStage {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 14px;
    border: 1px dashed var(--vscode-panel-border);
    border-radius: 10px;
    background: var(--vscode-editor-background);
  }

  .previewSheet {
    position: relative;
    background: #fff;
    border: 1px solid #bdbdbd;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    overflow: hidden;
    flex: 0 0 auto;
  }

  .previewContentBox {
    position: absolute;
    box-sizing: border-box;
    border: 1px solid rgba(60, 120, 220, 0.75);
    background: rgba(60, 120, 220, 0.08);
    overflow: hidden;
  }

  .realHtmlPreviewStage {
    position: relative;
    display: block;
    padding: 8px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 10px;
    background: #fff;
    overflow: hidden;
    box-sizing: border-box;
  }

  .realPreviewFrame {
    display: block;
    width: 100%;
    height: min(72vh, 760px);
    min-height: 520px;
    border: 0;
    background: #fff;
  }

  .previewColumns {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: row-reverse;
  }

  .previewColumn {
    flex: 1 1 0;
    border-left: 1px solid rgba(60, 120, 220, 0.18);
    position: relative;
  }

  .previewColumn:last-child {
    border-left: none;
  }

  .previewRowGuide {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1px solid rgba(60, 120, 220, 0.14);
  }

  .previewMarginLabel {
    position: absolute;
    font-size: 11px;
    color: #666;
    background: rgba(255,255,255,0.92);
    padding: 1px 4px;
    border-radius: 4px;
    line-height: 1.3;
    white-space: nowrap;
  }

  .previewLegend {
    margin-top: 12px;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    line-height: 1.6;
  }

  .realPreviewLoading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.82);
    color: #333;
    z-index: 2;
    font-size: 13px;
  }

  @media (max-width: 820px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <h1>縦書きHTML書き出し</h1>
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
          <h3 id="realPreviewTitle">実寸優先モードの簡易プレビュー</h3>
          <div class="overlayActions">
            <button class="primary" id="submitFromPreviewButton" type="button">HTMLを書き出す</button>
            <button class="secondary" id="closeRealPreviewButton" type="button">閉じる</button>
          </div>
        </div>

        <div class="previewMeta" id="realPreviewMeta">-</div>

        <div class="previewStage realHtmlPreviewStage">
          <div class="realPreviewLoading is-hidden" id="realPreviewLoading">
            プレビューを生成しています…
          </div>
          <iframe id="realPreviewFrame" class="realPreviewFrame"></iframe>

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

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    function savePanelUiState() {
      if (exportModeEl && exportModeEl.value === "real") {
        updateSavedRealPrintStateFromCurrentInputs();
      } else {
        updateSavedSimpleStateFromCurrentInputs();
      }

      const currentRealPrintPageSize = realPrintPageSizeEl
        ? normalizeRealPrintSizeKey(realPrintPageSizeEl.value)
        : "b6";

      const currentRealPrintColumnMode = realPrintColumnModeEl
        ? normalizeRealPrintColumnMode(
            realPrintColumnModeEl.value,
            currentRealPrintPageSize,
          )
        : "single";

      const nextState = {
        exportMode: exportModeEl ? exportModeEl.value : "simple",
        realPrintPageSize: currentRealPrintPageSize,
        realPrintColumnMode: currentRealPrintColumnMode,
        useTypographyAdjustments:
          !useTypographyAdjustmentsEl || useTypographyAdjustmentsEl.checked,
        punctuationLayoutMode:
          punctuationLayoutModeEl.value === "pushout" ? "pushout" : "hanging",

        simpleSavedByLayout,
        realPrintSavedBySize,
      };

      const current = vscode.getState() || {};
      vscode.setState({
        ...current,
        ...nextState,
      });

      vscode.postMessage({
        type: "persistUiState",
        state: nextState,
      });
    }

    function restorePanelUiState() {
      const saved = vscode.getState() || {};

      if (saved.exportMode === "real" || saved.exportMode === "simple") {
        exportModeEl.value = saved.exportMode;
      }
      if (
        useTypographyAdjustmentsEl &&
        typeof saved.useTypographyAdjustments === "boolean"
      ) {
        useTypographyAdjustmentsEl.checked = saved.useTypographyAdjustments;
      }
      if (saved.punctuationLayoutMode) {
        punctuationLayoutModeEl.value =
          saved.punctuationLayoutMode === "pushout" ? "pushout" : "hanging";
      }
    }

    const defaultState = {
      htmlPrintLayoutMode: ${JSON.stringify(resetState.htmlPrintLayoutMode)},
      htmlPrintOrientation: ${JSON.stringify(resetState.htmlPrintOrientation || "portrait")},
      showPageNumbers: ${resetState.showPageNumbers ? "true" : "false"},
      printFontSizePt: ${JSON.stringify(pxToPt(resetState.printFontSizePx))},
      printLineHeight: ${JSON.stringify(resetState.printLineHeight)},
      printMarginMm: ${JSON.stringify(resetState.printMarginMm)},
      printBodyPaddingPx: ${JSON.stringify(resetState.printBodyPaddingPx)},
      charsPerLine: ${JSON.stringify(resetState.charsPerLine)},
      linesPerPage: ${JSON.stringify(resetState.linesPerPage)},
      punctuationLayoutMode: ${JSON.stringify(resetState.punctuationLayoutMode)},
      useTypographyAdjustments: ${resetState.useTypographyAdjustments !== false ? "true" : "false"},

      exportMode: ${JSON.stringify(resetState.exportMode)},
      realPrintPageSize: ${JSON.stringify(resetState.realPrintPageSize)},
      realPrintFontSizePt: ${JSON.stringify(resetState.realPrintFontSizePt)},

      realPrintColumnMode: ${JSON.stringify(resetState.realPrintColumnMode || "single")},
      realPrintColumnGapMm: ${JSON.stringify(resetState.realPrintColumnGapMm || 0)},

      realPrintBleedMm: ${JSON.stringify(resetState.realPrintBleedMm || 0)},
      realPrintBleedMode: ${JSON.stringify(resetState.realPrintBleedMode || "all")},
      realPrintMirrorMargins: ${resetState.realPrintMirrorMargins !== false ? "true" : "false"},
      realPrintStartPageSide: ${JSON.stringify(resetState.realPrintStartPageSide || "odd")},

      realPrintBookOptionsEnabled: ${resetState.realPrintBookOptionsEnabled ? "true" : "false"},
      realPrintShowPageNumber: ${resetState.realPrintShowPageNumber ? "true" : "false"},
      realPrintPageNumberStart: ${JSON.stringify(resetState.realPrintPageNumberStart || 1)},
      realPrintShowHeading1: ${resetState.realPrintShowHeading1 ? "true" : "false"},
      realPrintHeading1Mode: ${JSON.stringify(resetState.realPrintHeading1Mode || "all")},
      realPrintHeaderOrder: ${JSON.stringify(resetState.realPrintHeaderOrder || "numberTitle")},
      realPrintHeaderPosition: ${JSON.stringify(resetState.realPrintHeaderPosition || "bottom")},

      realPrintMarginTopMm: ${JSON.stringify(resetState.realPrintMarginTopMm)},
      realPrintMarginBottomMm: ${JSON.stringify(resetState.realPrintMarginBottomMm)},
      realPrintMarginRightMm: ${JSON.stringify(resetState.realPrintMarginRightMm)},
      realPrintMarginLeftMm: ${JSON.stringify(resetState.realPrintMarginLeftMm)},
      realPrintCharsPerLine: ${JSON.stringify(resetState.realPrintCharsPerLine)},
      realPrintLinesPerPage: ${JSON.stringify(resetState.realPrintLinesPerPage)},
    };

    let realPrintSavedBySize = cleanupRealPrintSavedByLayout(
      ${JSON.stringify(state.realPrintSavedBySize || {})},
    );

    let simpleSavedByLayout =
      ${JSON.stringify(state.simpleSavedByLayout || {})};

    const REAL_PRINT_PAGE_PRESETS = {
      a5: { key: "a5", label: "A5", widthMm: 148, heightMm: 210 },
      a6: { key: "a6", label: "A6", widthMm: 105, heightMm: 148 },
      b6: { key: "b6", label: "B6", widthMm: 128, heightMm: 182 },
      shiroku: { key: "shiroku", label: "四六判", widthMm: 128, heightMm: 188 },
      shinsho: { key: "shinsho", label: "新書判", widthMm: 105, heightMm: 173 },
    };

    const REAL_PRINT_DEFAULTS_BY_LAYOUT = {
      "a5:single": {
        realPrintPageSize: "a5",
        realPrintColumnMode: "single",
        realPrintColumnGapMm: 0,
        realPrintFontSizePt: 10,
        realPrintMarginTopMm: 30,
        realPrintMarginBottomMm: 30,
        realPrintMarginRightMm: 20,
        realPrintMarginLeftMm: 20,
        realPrintCharsPerLine: 40,
        realPrintLinesPerPage: 17,
      },

      "a5:two": {
        realPrintPageSize: "a5",
        realPrintColumnMode: "two",
        realPrintColumnGapMm: 8.5,
        realPrintFontSizePt: 8,
        realPrintMarginTopMm: 20,
        realPrintMarginBottomMm: 20,
        realPrintMarginRightMm: 18,
        realPrintMarginLeftMm: 18,
        realPrintCharsPerLine: 28,
        realPrintLinesPerPage: 23,
      },

      "b6:single": {
        realPrintPageSize: "b6",
        realPrintColumnMode: "single",
        realPrintColumnGapMm: 0,
        realPrintFontSizePt: 9,
        realPrintMarginTopMm: 19,
        realPrintMarginBottomMm: 19,
        realPrintMarginRightMm: 17,
        realPrintMarginLeftMm: 21,
        realPrintCharsPerLine: 42,
        realPrintLinesPerPage: 16,
      },

      "a6:single": {
        realPrintPageSize: "a6",
        realPrintColumnMode: "single",
        realPrintColumnGapMm: 0,
        realPrintFontSizePt: 8,
        realPrintMarginTopMm: 13,
        realPrintMarginBottomMm: 13,
        realPrintMarginRightMm: 11,
        realPrintMarginLeftMm: 15,
        realPrintCharsPerLine: 40,
        realPrintLinesPerPage: 16,
      },

      "shiroku:single": {
        realPrintPageSize: "shiroku",
        realPrintColumnMode: "single",
        realPrintColumnGapMm: 0,
        realPrintFontSizePt: 10,
        realPrintMarginTopMm: 19,
        realPrintMarginBottomMm: 19,
        realPrintMarginRightMm: 13,
        realPrintMarginLeftMm: 16,
        realPrintCharsPerLine: 40,
        realPrintLinesPerPage: 16,
      },

      "shinsho:single": {
        realPrintPageSize: "shinsho",
        realPrintColumnMode: "single",
        realPrintColumnGapMm: 0,
        realPrintFontSizePt: 8,
        realPrintMarginTopMm: 21,
        realPrintMarginBottomMm: 21,
        realPrintMarginRightMm: 15,
        realPrintMarginLeftMm: 15,
        realPrintCharsPerLine: 42,
        realPrintLinesPerPage: 16,
      },

      "shinsho:two": {
        realPrintPageSize: "shinsho",
        realPrintColumnMode: "two",
        realPrintColumnGapMm: 8.5,
        realPrintFontSizePt: 8,
        realPrintMarginTopMm: 15,
        realPrintMarginBottomMm: 15,
        realPrintMarginRightMm: 12,
        realPrintMarginLeftMm: 15,
        realPrintCharsPerLine: 22,
        realPrintLinesPerPage: 18,
      },
    };

    const layoutModeEl = document.getElementById("layoutMode");
    const showPageNumbersEl = document.getElementById("showPageNumbers");
    const printFontSizePtEl = document.getElementById("printFontSizePt");
    const printLineHeightEl = document.getElementById("printLineHeight");
    const printMarginMmEl = document.getElementById("printMarginMm");
    const printBodyPaddingPxEl = document.getElementById("printBodyPaddingPx");
    const htmlPrintOrientationEl = document.getElementById("htmlPrintOrientation");

    const errorBoxEl = document.getElementById("errorBox");
    const footerStatusBoxEl = document.getElementById("footerStatusBox");
    const charsPerLineEl = document.getElementById("charsPerLine");
    const linesPerPageEl = document.getElementById("linesPerPage");
    const punctuationLayoutModeEl = document.getElementById("punctuationLayoutMode");
    const useTypographyAdjustmentsEl = document.getElementById("useTypographyAdjustments");
    const currentTypographyAdjustmentsEl = document.getElementById("currentTypographyAdjustments");

    const resetButtonEl = document.getElementById("resetButton");
    const cancelButtonEl = document.getElementById("cancelButton");
    const submitButtonEl = document.getElementById("submitButton");

    const singleOnlyFieldsEl = document.getElementById("singleOnlyFields");
    const singleModeNotesEl = document.getElementById("singleModeNotes");
    const twoUpNoticeBoxEl = document.getElementById("twoUpNoticeBox");

    const currentCharsPerLineEl = document.getElementById("currentCharsPerLine");
    const currentLinesPerPageEl = document.getElementById("currentLinesPerPage");
    const currentFontFamilyEl = document.getElementById("currentFontFamily");
    const currentPunctuationLayoutEl = document.getElementById("currentPunctuationLayout");

    const simplePrintWarningBoxEl = document.getElementById("simplePrintWarningBox");
    const simplePrintWarningMessagesEl = document.getElementById("simplePrintWarningMessages");
    const openSimpleGuideButtonEl = document.getElementById("openSimpleGuideButton");

    const exportModeEl = document.getElementById("exportMode");
    const exportModeHintEl = document.getElementById("exportModeHint");
    const simpleRightPaneEl = document.getElementById("simpleRightPane");
    const simpleLeftPaneEl = document.getElementById("simpleLeftPane");

    const realPrintFieldsEl = document.getElementById("realPrintFields");
    const realPrintPageSizeEl = document.getElementById("realPrintPageSize");

    const realPrintColumnModeEl = document.getElementById("realPrintColumnMode");
    const realPrintColumnGapMmEl = document.getElementById("realPrintColumnGapMm");
    const realPrintColumnGapRowEl = document.getElementById("realPrintColumnGapRow");
    const realPrintColumnModeHintEl = document.getElementById("realPrintColumnModeHint");
    const realPrintLinesPerPageLabelEl = document.getElementById("realPrintLinesPerPageLabel");

    const realPrintBleedMmEl = document.getElementById("realPrintBleedMm");
    const realPrintBleedModeEl = document.getElementById("realPrintBleedMode");
    const realPrintMirrorMarginsEl = document.getElementById("realPrintMirrorMargins");
    const realPrintStartPageSideEl = document.getElementById("realPrintStartPageSide");

    const realPrintBookOptionsEnabledEl = document.getElementById("realPrintBookOptionsEnabled");
    const realPrintBookOptionsFieldsEl = document.getElementById("realPrintBookOptionsFields");

    const realPrintShowPageNumberEl = document.getElementById("realPrintShowPageNumber");
    const realPrintPageNumberStartEl = document.getElementById("realPrintPageNumberStart");
    const realPrintShowHeading1El = document.getElementById("realPrintShowHeading1");
    const realPrintHeading1ModeEl = document.getElementById("realPrintHeading1Mode");
    const realPrintHeaderOrderEl = document.getElementById("realPrintHeaderOrder");
    const realPrintHeaderPositionEl = document.getElementById("realPrintHeaderPosition");

    const realPrintFontSizePtEl = document.getElementById("realPrintFontSizePt");
    const realPrintCharsPerLineEl = document.getElementById("realPrintCharsPerLine");
    const realPrintLinesPerPageEl = document.getElementById("realPrintLinesPerPage");
    const realPrintMarginTopMmEl = document.getElementById("realPrintMarginTopMm");
    const realPrintMarginBottomMmEl = document.getElementById("realPrintMarginBottomMm");
    const realPrintMarginRightMmEl = document.getElementById("realPrintMarginRightMm");
    const realPrintMarginLeftMmEl = document.getElementById("realPrintMarginLeftMm");

    const realPrintMetricsBoxEl = document.getElementById("realPrintMetricsBox");
    const realTrimSizeEl = document.getElementById("realTrimSize");
    const realContentBoxEl = document.getElementById("realContentBox");
    const realFontSizeEl = document.getElementById("realFontSize");
    const realCharSpacingEl = document.getElementById("realCharSpacing");
    const realLineSpacingEl = document.getElementById("realLineSpacing");
    const realStatusEl = document.getElementById("realStatus");
    const realMessagesBoxEl = document.getElementById("realMessagesBox");

    const openRealPreviewButtonEl = document.getElementById("openRealPreviewButton");
    const realPreviewOverlayEl = document.getElementById("realPreviewOverlay");
    const closeRealPreviewButtonEl = document.getElementById("closeRealPreviewButton");
    const submitFromPreviewButtonEl = document.getElementById("submitFromPreviewButton");

    const realPreviewMetaEl = document.getElementById("realPreviewMeta");
    const realPreviewSheetEl = document.getElementById("realPreviewSheet");
    const realPreviewContentBoxEl = document.getElementById("realPreviewContentBox");
    const realPreviewColumnsEl = document.getElementById("realPreviewColumns");

    const realPreviewTopLabelEl = document.getElementById("realPreviewTopLabel");
    const realPreviewBottomLabelEl = document.getElementById("realPreviewBottomLabel");
    const realPreviewRightLabelEl = document.getElementById("realPreviewRightLabel");
    const realPreviewLeftLabelEl = document.getElementById("realPreviewLeftLabel");

    const realPreviewFrameEl = document.getElementById("realPreviewFrame");
    const realPreviewLoadingEl = document.getElementById("realPreviewLoading");

    let successTimerId = null;

    let realPreviewRefreshTimerId = null;

    let isSubmitting = false;
    const submitButtonDefaultText = "HTMLを書き出す";

    function cleanupRealPrintSavedByLayout(savedMap) {
      const out = {};
      const source =
        savedMap && typeof savedMap === "object" ? savedMap : {};

      Object.entries(source).forEach(([key, value]) => {
        if (!key.includes(":")) return;
        if (!value || typeof value !== "object") return;

        const [sizeKeyRaw, columnModeRaw] = key.split(":");
        const sizeKey = normalizeRealPrintSizeKey(sizeKeyRaw);
        const columnMode = normalizeRealPrintColumnMode(columnModeRaw, sizeKey);
        const layoutKey = getRealPrintLayoutKey(sizeKey, columnMode);

        out[layoutKey] = {
          ...value,
          realPrintPageSize: sizeKey,
          realPrintColumnMode: columnMode,
        };
      });

      return out;
    }

    function setSubmitting(nextValue) {
      isSubmitting = !!nextValue;

      submitButtonEl.disabled = isSubmitting;
      cancelButtonEl.disabled = isSubmitting;
      resetButtonEl.disabled = isSubmitting;

      submitButtonEl.textContent = isSubmitting
        ? "保存先を選択中…"
        : submitButtonDefaultText;

      if (isSubmitting) {
        footerStatusBoxEl.textContent = "保存先を選択します。保存ダイアログが開くまでお待ちください。";
        footerStatusBoxEl.classList.remove("is-hidden");
      }

      if (submitFromPreviewButtonEl) {
        submitFromPreviewButtonEl.disabled = isSubmitting;
        submitFromPreviewButtonEl.textContent = isSubmitting
          ? "保存先を選択中…"
          : submitButtonDefaultText;
      }
    }

    function clearSubmitting() {
      setSubmitting(false);
    }

    function showError(message) {
      const text = String(message || "").trim();
      errorBoxEl.textContent = text;
      errorBoxEl.classList.toggle("is-visible", !!text);

      if (text) {
        if (successTimerId) {
          clearTimeout(successTimerId);
          successTimerId = null;
        }
        footerStatusBoxEl.textContent = "";
        footerStatusBoxEl.classList.add("is-hidden");
      }
    }

    function showSuccess(message) {
      const text = String(message || "").trim();

      if (successTimerId) {
        clearTimeout(successTimerId);
        successTimerId = null;
      }

      footerStatusBoxEl.textContent = text;
      footerStatusBoxEl.classList.toggle("is-hidden", !text);

      if (!text) return;

      footerStatusBoxEl.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });

      successTimerId = setTimeout(() => {
        footerStatusBoxEl.textContent = "";
        footerStatusBoxEl.classList.add("is-hidden");
        successTimerId = null;
      }, 3000);
    }

    function readNumber(el, fallback) {
      const n = Number(el.value);
      return Number.isFinite(n) ? n : fallback;
    }

    function pxToPt(px) {
      const n = Number(px);
      if (!Number.isFinite(n) || n <= 0) return 0;
      return Math.round(n * 0.75 * 10) / 10;
    }

    function ptToPx(pt) {
      const n = Number(pt);
      if (!Number.isFinite(n) || n <= 0) return 0;
      return Math.round((n / 0.75) * 100) / 100;
    }

    function roundMm(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return 0;
      return Math.round(n * 100) / 100;
    }

    function convertPrintPtToApproxMm(pt) {
      const value = Number(pt);
      if (!Number.isFinite(value) || value <= 0) return 0;
      return roundMm(value * 0.35);
    }

    function getRealPrintPreset(pageSize) {
      const key = String(pageSize || "b6").trim().toLowerCase();
      return REAL_PRINT_PAGE_PRESETS[key] || REAL_PRINT_PAGE_PRESETS.b6;
    }

    function normalizeRealPrintSizeKey(value) {
      const v = String(value || "b6").trim().toLowerCase();

      if (
        v === "a5" ||
        v === "a6" ||
        v === "b6" ||
        v === "shiroku" ||
        v === "shinsho"
      ) {
        return v;
      }

      return "b6";
    }

    function isRealPrintTwoColumnSize(value) {
      const key = normalizeRealPrintSizeKey(value);
      return key === "a5" || key === "shinsho";
    }

    function normalizeRealPrintColumnMode(value, pageSize = "b6") {
      const mode = String(value || "single").trim().toLowerCase();

      if (mode === "two" && isRealPrintTwoColumnSize(pageSize)) {
        return "two";
      }

      return "single";
    }

    function getRealPrintLayoutKey(pageSize = "b6", columnMode = "single") {
      const sizeKey = normalizeRealPrintSizeKey(pageSize);
      const mode = normalizeRealPrintColumnMode(columnMode, sizeKey);
      return \`\${sizeKey}:\${mode}\`;
    }

    function getRealPrintDefaultsForLayout(pageSize = "b6", columnMode = "single") {
      const key = getRealPrintLayoutKey(pageSize, columnMode);
      return {
        ...(REAL_PRINT_DEFAULTS_BY_LAYOUT[key] ||
          REAL_PRINT_DEFAULTS_BY_LAYOUT["b6:single"]),
      };
    }

    function calculateRealPrintMetricsFromInputs() {
      const preset = getRealPrintPreset(realPrintPageSizeEl.value);

      const columnMode = normalizeRealPrintColumnMode(
        realPrintColumnModeEl.value,
        realPrintPageSizeEl.value,
      );
      const columnGapMm =
        columnMode === "two" ? readNumber(realPrintColumnGapMmEl, 0) : 0;
      const columnCount = columnMode === "two" ? 2 : 1;

      const fontSizePt = readNumber(realPrintFontSizePtEl, 9);

      const bookOptionsEnabled = !!realPrintBookOptionsEnabledEl.checked;
      const bleedMm = bookOptionsEnabled ? readNumber(realPrintBleedMmEl, 0) : 0;
      const bleedMode =
        realPrintBleedModeEl.value === "nonSpine" ? "nonSpine" : "all";
      const mirrorMargins = !!realPrintMirrorMarginsEl.checked;
      const startPageSide =
        realPrintStartPageSideEl.value === "even" ? "even" : "odd";

      const topMm = readNumber(realPrintMarginTopMmEl, 22);
      const bottomMm = readNumber(realPrintMarginBottomMmEl, 18);
      const rightMm = readNumber(realPrintMarginRightMmEl, 18);
      const leftMm = readNumber(realPrintMarginLeftMmEl, 14);
      const charsPerLine = readNumber(realPrintCharsPerLineEl, 42);
      const linesPerPage = readNumber(realPrintLinesPerPageEl, 16);

      const contentWidthMm = roundMm(preset.widthMm - leftMm - rightMm);
      const contentHeightMm = roundMm(preset.heightMm - topMm - bottomMm);
      const fontSizeMm = convertPrintPtToApproxMm(fontSizePt);

      const columnWidthMm = contentWidthMm;

      const columnHeightMm =
        columnCount === 2
          ? roundMm((contentHeightMm - columnGapMm) / 2)
          : contentHeightMm;

      const charPitchMm =
        columnHeightMm > 0 ? roundMm(columnHeightMm / charsPerLine) : 0;

      const linePitchMm =
        columnWidthMm > 0 ? roundMm(columnWidthMm / linesPerPage) : 0;

      const charSpacingMm = roundMm(charPitchMm - fontSizeMm);
      const lineSpacingMm = roundMm(linePitchMm - fontSizeMm);

      const outputCharSpacingMm = Math.max(
        0,
        Math.round((charSpacingMm - 0.02) * 1000) / 1000,
      );

      const messages = [];
      let status = "ok";

      if (contentWidthMm <= 0 || contentHeightMm <= 0) {
        status = "error";
        messages.push("余白が大きすぎて本文面を確保できません。");
      }

      if (charSpacingMm < 0) {
        status = "error";
        messages.push("字間が 0mm です。文字数によっては欠ける場合があります。");
      }

      if (lineSpacingMm < 0) {
        status = "error";
        messages.push("行数が多すぎて行送りが足りません。");
      }

      if (status !== "error") {
        if (outputCharSpacingMm < 0.05) {
          status = "warning";
          messages.push(
            "出力字間が 0.05mm 未満です。",
          );
        } else if (outputCharSpacingMm < 0.07) {
          status = "warning";
          messages.push(
            "出力字間が狭めです。",
          );
        } else if (outputCharSpacingMm < 0.15) {
          messages.push(
            "出力字間は狭めですが、実寸優先の本文としては使用しやすい範囲です。",
          );
        }

        const lineSpacingRatio =
          fontSizeMm > 0 ? Math.round((lineSpacingMm / fontSizeMm) * 100) / 100 : 0;

        if (lineSpacingMm < 0.5 || lineSpacingRatio < 0.18) {
          status = "warning";
          messages.push(
            "行送りがかなり狭めです。ルビやフォントによって行の左端が欠ける場合があります。",
          );
        }

        if (columnMode === "two" && columnHeightMm <= 0) {
          status = "error";
          messages.push("段間または余白が大きすぎて、二段組みの本文高さを確保できません。");
        }

        if (fontSizeMm > 0 && lineSpacingMm < fontSizeMm * 0.45) {
          messages.push(
            "ルビが多いページでは、行送り不足に見える場合があります。",
          );
        }
      }

      if (!messages.length) {
        messages.push(
          "目標字数・行数で収まる見込みです。",
        );
      }

      return {
        trimSize: {
          label: preset.label,
          widthMm: preset.widthMm,
          heightMm: preset.heightMm,
          bleedMm,
          bleedMode,
          mirrorMargins,
          startPageSide,
          outputWidthMm: roundMm(
            preset.widthMm + (bleedMode === "nonSpine" ? bleedMm : bleedMm * 2),
          ),
          outputHeightMm: roundMm(preset.heightMm + bleedMm * 2),
        },
        contentBox: {
          widthMm: contentWidthMm,
          heightMm: contentHeightMm,
        },
        column: {
          mode: columnMode,
          count: columnCount,
          gapMm: columnGapMm,
          widthMm: columnWidthMm,
          heightMm: columnHeightMm,
          linesPerColumn: linesPerPage,
          linesPerPageTotal: linesPerPage * columnCount,
        },
        font: {
          sizePt: fontSizePt,
          sizeMm: fontSizeMm,
        },
        estimated: {
          charSpacingMm,
          outputCharSpacingMm,
          lineSpacingMm,
        },
        status,
        messages,
      };
    }

    function applyRealPrintStateToInputs(nextState = {}) {
      const nextSize = normalizeRealPrintSizeKey(
        nextState.realPrintPageSize || realPrintPageSizeEl.value,
      );

      const nextColumnMode = normalizeRealPrintColumnMode(
        nextState.realPrintColumnMode || "single",
        nextSize,
      );

      realPrintPageSizeEl.value = nextSize;
      realPrintColumnModeEl.value = nextColumnMode;

      realPrintColumnGapMmEl.value = String(
        Number.isFinite(Number(nextState.realPrintColumnGapMm))
          ? Number(nextState.realPrintColumnGapMm)
          : getRealPrintDefaultsForLayout(
              nextSize,
              nextColumnMode,
            ).realPrintColumnGapMm,
      );

      realPrintFontSizePtEl.value = String(
        Number.isFinite(Number(nextState.realPrintFontSizePt))
          ? Number(nextState.realPrintFontSizePt)
          : 9,
      );

      realPrintBleedMmEl.value = String(
        Number.isFinite(Number(nextState.realPrintBleedMm))
          ? Number(nextState.realPrintBleedMm)
          : 0,
      );
      realPrintBleedModeEl.value =
        nextState.realPrintBleedMode === "nonSpine" ? "nonSpine" : "all";

      realPrintMirrorMarginsEl.checked = nextState.realPrintMirrorMargins !== false;

      realPrintStartPageSideEl.value =
        nextState.realPrintStartPageSide === "even" ? "even" : "odd";

      realPrintBookOptionsEnabledEl.checked =
        nextState.realPrintBookOptionsEnabled === true;

      realPrintShowPageNumberEl.checked =
        nextState.realPrintShowPageNumber === true;

      realPrintPageNumberStartEl.value = String(
        Number.isFinite(Number(nextState.realPrintPageNumberStart))
          ? Number(nextState.realPrintPageNumberStart)
          : 1,
      );

      realPrintShowHeading1El.checked =
        nextState.realPrintShowHeading1 === true;

      realPrintHeading1ModeEl.value =
        nextState.realPrintHeading1Mode === "evenOnly" ? "evenOnly" : "all";

      realPrintHeaderOrderEl.value =
        nextState.realPrintHeaderOrder === "titleNumber"
          ? "titleNumber"
          : "numberTitle";

      realPrintHeaderPositionEl.value =
        nextState.realPrintHeaderPosition === "top" ? "top" : "bottom";

      updateRealPrintBookOptionsUI();

      realPrintMarginTopMmEl.value = String(
        Number.isFinite(Number(nextState.realPrintMarginTopMm))
          ? Number(nextState.realPrintMarginTopMm)
          : 22,
      );
      realPrintMarginBottomMmEl.value = String(
        Number.isFinite(Number(nextState.realPrintMarginBottomMm))
          ? Number(nextState.realPrintMarginBottomMm)
          : 18,
      );
      realPrintMarginRightMmEl.value = String(
        Number.isFinite(Number(nextState.realPrintMarginRightMm))
          ? Number(nextState.realPrintMarginRightMm)
          : 18,
      );
      realPrintMarginLeftMmEl.value = String(
        Number.isFinite(Number(nextState.realPrintMarginLeftMm))
          ? Number(nextState.realPrintMarginLeftMm)
          : 14,
      );
      realPrintCharsPerLineEl.value = String(
        Number.isFinite(Number(nextState.realPrintCharsPerLine))
          ? Number(nextState.realPrintCharsPerLine)
          : 42,
      );
      realPrintLinesPerPageEl.value = String(
        Number.isFinite(Number(nextState.realPrintLinesPerPage))
          ? Number(nextState.realPrintLinesPerPage)
          : 16,
      );
    }

    function getRealPrintSavedStateByLayout(sizeKey, columnMode) {
      const key = normalizeRealPrintSizeKey(sizeKey);
      const mode = normalizeRealPrintColumnMode(columnMode, key);
      const layoutKey = getRealPrintLayoutKey(key, mode);

      const saved =
        realPrintSavedBySize &&
        typeof realPrintSavedBySize === "object" &&
        realPrintSavedBySize[layoutKey] &&
        typeof realPrintSavedBySize[layoutKey] === "object"
          ? realPrintSavedBySize[layoutKey]
          : null;

      if (saved) {
        return {
          ...saved,
          realPrintPageSize: key,
          realPrintColumnMode: mode,
        };
      }

      return getRealPrintDefaultsForLayout(key, mode);
    }

    function switchRealPrintPresetByLayout(sizeKey, columnMode) {
      const key = normalizeRealPrintSizeKey(sizeKey);
      const mode = normalizeRealPrintColumnMode(columnMode, key);

      const nextState = getRealPrintSavedStateByLayout(key, mode);

      applyRealPrintStateToInputs(nextState);
      updateRealPrintColumnModeUI();
      syncRealPrintMetricsView();
      refreshRealPreviewIfOpen();
    }

    function updateSavedRealPrintStateFromCurrentInputs(
      sizeKeyOverride,
      columnModeOverride,
    ) {
      const sizeKey = normalizeRealPrintSizeKey(
        sizeKeyOverride || realPrintPageSizeEl.value,
      );

      const columnMode = normalizeRealPrintColumnMode(
        columnModeOverride || realPrintColumnModeEl.value,
        sizeKey,
      );

      const layoutKey = getRealPrintLayoutKey(sizeKey, columnMode);

      realPrintSavedBySize = {
        ...(realPrintSavedBySize || {}),
        [layoutKey]: {
          realPrintPageSize: sizeKey,
          realPrintColumnMode: columnMode,
          realPrintColumnGapMm:
            columnMode === "two" ? readNumber(realPrintColumnGapMmEl, 0) : 0,

          realPrintFontSizePt: readNumber(realPrintFontSizePtEl, 9),

          realPrintBleedMm: readNumber(realPrintBleedMmEl, 0),
          realPrintBleedMode:
            realPrintBleedModeEl.value === "nonSpine" ? "nonSpine" : "all",
          realPrintMirrorMargins: !!realPrintMirrorMarginsEl.checked,
          realPrintStartPageSide:
            realPrintStartPageSideEl.value === "even" ? "even" : "odd",

          realPrintBookOptionsEnabled: !!realPrintBookOptionsEnabledEl.checked,
          realPrintShowPageNumber: !!realPrintShowPageNumberEl.checked,
          realPrintPageNumberStart: readNumber(realPrintPageNumberStartEl, 1),
          realPrintShowHeading1: !!realPrintShowHeading1El.checked,
          realPrintHeading1Mode:
            realPrintHeading1ModeEl.value === "evenOnly" ? "evenOnly" : "all",
          realPrintHeaderOrder:
            realPrintHeaderOrderEl.value === "titleNumber"
              ? "titleNumber"
              : "numberTitle",
          realPrintHeaderPosition:
            realPrintHeaderPositionEl.value === "top" ? "top" : "bottom",

          realPrintMarginTopMm: readNumber(realPrintMarginTopMmEl, 22),
          realPrintMarginBottomMm: readNumber(realPrintMarginBottomMmEl, 18),
          realPrintMarginRightMm: readNumber(realPrintMarginRightMmEl, 18),
          realPrintMarginLeftMm: readNumber(realPrintMarginLeftMmEl, 14),
          realPrintCharsPerLine: readNumber(realPrintCharsPerLineEl, 42),
          realPrintLinesPerPage: readNumber(realPrintLinesPerPageEl, 16),
        },
      };
    }

    function normalizeSimpleLayoutKey(value) {
      return String(value || "single") === "2up" ? "2up" : "single";
    }

    function getCurrentSimpleInputState() {
      const printFontSizePt = readNumber(printFontSizePtEl, defaultState.printFontSizePt);

      return {
        htmlPrintLayoutMode: normalizeSimpleLayoutKey(layoutModeEl.value),
        htmlPrintOrientation:
          htmlPrintOrientationEl.value === "landscape" ? "landscape" : "portrait",
        showPageNumbers: !!showPageNumbersEl.checked,
        printFontSizePt,
        printFontSizePx: ptToPx(printFontSizePt),
        printLineHeight: readNumber(printLineHeightEl, defaultState.printLineHeight),
        printMarginMm: readNumber(printMarginMmEl, defaultState.printMarginMm),
        printBodyPaddingPx: readNumber(printBodyPaddingPxEl, defaultState.printBodyPaddingPx),
        charsPerLine: readNumber(charsPerLineEl, defaultState.charsPerLine),
        linesPerPage: readNumber(linesPerPageEl, defaultState.linesPerPage),
        punctuationLayoutMode:
          punctuationLayoutModeEl.value === "pushout" ? "pushout" : "hanging",
      };
    }

    function updateSavedSimpleStateFromCurrentInputs() {
      const key = normalizeSimpleLayoutKey(layoutModeEl.value);

      simpleSavedByLayout = {
        ...(simpleSavedByLayout || {}),
        [key]: getCurrentSimpleInputState(),
      };
    }

    function applySimpleStateToInputs(nextState = {}) {
      layoutModeEl.value = normalizeSimpleLayoutKey(
        nextState.htmlPrintLayoutMode || layoutModeEl.value,
      );

      htmlPrintOrientationEl.value =
        nextState.htmlPrintOrientation === "landscape" ? "landscape" : "portrait";

      showPageNumbersEl.checked = nextState.showPageNumbers === true;

      printFontSizePtEl.value = String(
        Number.isFinite(Number(nextState.printFontSizePt))
          ? Number(nextState.printFontSizePt)
          : defaultState.printFontSizePt,
      );

      printLineHeightEl.value = String(
        Number.isFinite(Number(nextState.printLineHeight))
          ? Number(nextState.printLineHeight)
          : defaultState.printLineHeight,
      );

      printMarginMmEl.value = String(
        Number.isFinite(Number(nextState.printMarginMm))
          ? Number(nextState.printMarginMm)
          : defaultState.printMarginMm,
      );

      printBodyPaddingPxEl.value = String(
        Number.isFinite(Number(nextState.printBodyPaddingPx))
          ? Number(nextState.printBodyPaddingPx)
          : defaultState.printBodyPaddingPx,
      );

      charsPerLineEl.value = String(
        Number.isFinite(Number(nextState.charsPerLine))
          ? Number(nextState.charsPerLine)
          : defaultState.charsPerLine,
      );

      linesPerPageEl.value = String(
        Number.isFinite(Number(nextState.linesPerPage))
          ? Number(nextState.linesPerPage)
          : defaultState.linesPerPage,
      );

      punctuationLayoutModeEl.value =
        nextState.punctuationLayoutMode === "pushout" ? "pushout" : "hanging";
    }

    function getSimpleSavedStateByLayout(layoutKey) {
      const key = normalizeSimpleLayoutKey(layoutKey);

      const saved =
        simpleSavedByLayout &&
        typeof simpleSavedByLayout === "object" &&
        simpleSavedByLayout[key] &&
        typeof simpleSavedByLayout[key] === "object"
          ? simpleSavedByLayout[key]
          : null;

      if (saved) {
        return {
          ...saved,
          htmlPrintLayoutMode: key,
        };
      }

      return {
        htmlPrintLayoutMode: key,
        htmlPrintOrientation: defaultState.htmlPrintOrientation || "portrait",
        showPageNumbers: defaultState.showPageNumbers,
        printFontSizePt: defaultState.printFontSizePt,
        printFontSizePx: ptToPx(defaultState.printFontSizePt),
        printLineHeight: defaultState.printLineHeight,
        printMarginMm: defaultState.printMarginMm,
        printBodyPaddingPx: defaultState.printBodyPaddingPx,
        charsPerLine: defaultState.charsPerLine,
        linesPerPage: defaultState.linesPerPage,
        punctuationLayoutMode: defaultState.punctuationLayoutMode,
      };
    }

    function switchSimplePresetByLayout(layoutKey) {
      const key = normalizeSimpleLayoutKey(layoutKey);
      const nextState = getSimpleSavedStateByLayout(key);

      applySimpleStateToInputs({
        ...nextState,
        htmlPrintLayoutMode: key,
      });
    }

    function updateExportModeHint() {
      if (!exportModeHintEl || !exportModeEl) return;

      if (exportModeEl.value === "real") {
        exportModeHintEl.textContent =
          "判型・余白・本文面を固定し、実寸出力、本文プレビュー確認ができます。";
        return;
      }

      exportModeHintEl.textContent =
        "印刷/PDF保存向けに文字数・行数を調整。収まりはブラウザ印刷設定に左右されます。";
    }

    function updateLayoutModeUI() {
      const isTwoUp = layoutModeEl.value === "2up";
      const isRealMode = exportModeEl.value === "real";

      updateExportModeHint();

      simpleLeftPaneEl.classList.toggle("is-hidden", isRealMode);

      singleOnlyFieldsEl.classList.toggle("is-hidden", isTwoUp || isRealMode);
      twoUpNoticeBoxEl.classList.toggle("is-hidden", !isTwoUp || isRealMode);

      realPrintFieldsEl.classList.toggle("is-hidden", !isRealMode);
      realPrintMetricsBoxEl.classList.toggle("is-hidden", !isRealMode);

      simpleRightPaneEl.classList.toggle("is-hidden", isRealMode);
    }

    function getPunctuationLayoutLabel(mode) {
      return mode === "pushout" ? "追い込み" : "ぶら下げ";
    }

    const SIMPLE_PRINT_GUIDE_LIMITS = {
      single: {
        landscape: {
          8: { chars: 62, lines: 54, lineHeight: 1.74 },
          9: { chars: 55, lines: 48, lineHeight: 1.74 },
          10: { chars: 50, lines: 44, lineHeight: 1.72 },
          11: { chars: 45, lines: 40, lineHeight: 1.72 },
        },
        portrait: {
          8: { lines: 36, lineHeight: 1.74 },
          9: { lines: 32, lineHeight: 1.74 },
          10: { lines: 30, lineHeight: 1.72 },
          11: { lines: 27, lineHeight: 1.72 },
        },
      },

      twoUp: {
        8: { chars: 62, lines: 26, lineHeight: 1.72 },
        9: { chars: 55, lines: 24, lineHeight: 1.72 },
        10: { chars: 50, lines: 22, lineHeight: 1.7 },
        11: { chars: 45, lines: 20, lineHeight: 1.7 },
      },
    };

    function getSimpleGuideFontKey(fontSizePt) {
      const pt = Number(fontSizePt);
      if (!Number.isFinite(pt)) return null;

      // 8pt未満は小さいフォントなので、ここでは警告対象にしない
      if (pt < 8) return null;

      if (pt >= 11) return 11;
      if (pt >= 10) return 10;
      if (pt >= 9) return 9;
      return 8;
    }

    function buildSimplePrintGuideText() {
      return [
        "簡易印刷/保存の体裁目安",
        "",
        "通常印刷 / A4横 / 余白12mm目安",
        "8pt  : 62字 × 54行 / 行送り1.74前後",
        "9pt  : 55字 × 48行 / 行送り1.74前後",
        "10pt : 50字 × 44行 / 行送り1.72前後",
        "11pt : 45字 × 40行 / 行送り1.72前後",
        "",
        "通常印刷 / A4縦 / 余白12mm目安",
        "8pt  : 36行前後",
        "9pt  : 32行前後",
        "10pt : 30行前後",
        "11pt : 27行前後",
        "",
        "2ページ面付け / A4横目安",
        "8pt  : 62字 × 26行 / 行送り1.72前後",
        "9pt  : 55字 × 24行 / 行送り1.72前後",
        "10pt : 50字 × 22行 / 行送り1.70前後",
        "11pt : 45字 × 20行 / 行送り1.70前後",
        "",
        "※ フォント、ルビ、見出し、ページ番号、PDF変換環境により収まりは変わります。",
        "※ 11pt以上は11ptの目安を基準にしてください。",
      ].join("\\n");
    }

    function getSimplePrintWarnings() {
      const layoutMode = normalizeSimpleLayoutKey(layoutModeEl.value);
      const orientation =
        htmlPrintOrientationEl.value === "landscape" ? "landscape" : "portrait";

      const fontSizePt = readNumber(printFontSizePtEl, defaultState.printFontSizePt);
      const lineHeight = readNumber(printLineHeightEl, defaultState.printLineHeight);
      const chars = readNumber(charsPerLineEl, defaultState.charsPerLine);
      const lines = readNumber(linesPerPageEl, defaultState.linesPerPage);
      const showPageNumbers = !!showPageNumbersEl.checked;

      const warnings = [];
      const guideFontKey = getSimpleGuideFontKey(fontSizePt);

      // 8pt未満は小さいフォントなので、細かな警告は出さない
      if (!guideFontKey) {
        if (lineHeight < 1.5) {
          warnings.push(
            "行送りが 1.5 未満です。ルビ・見出し・フォントによって欠ける可能性があります。",
          );
        }
        return warnings;
      }

      if (layoutMode === "single") {
        const limits =
          SIMPLE_PRINT_GUIDE_LIMITS.single[orientation]?.[guideFontKey] || null;

        if (!limits) return warnings;

        const orientationLabel = orientation === "landscape" ? "A4横" : "A4縦";
        const fontLabel =
          Number(fontSizePt) >= 11 ? "11pt以上" : \`\${guideFontKey}pt\`;

        if (
          orientation === "landscape" &&
          Number.isFinite(limits.chars) &&
          chars > limits.chars
        ) {
          warnings.push(
            \`通常印刷（\${orientationLabel}・\${fontLabel}）の文字数目安は \${limits.chars}字前後です。指定値では本文やページ番号が欠ける可能性があります。\`,
          );
        }

        if (Number.isFinite(limits.lines) && lines > limits.lines) {
          warnings.push(
            \`通常印刷（\${orientationLabel}・\${fontLabel}）の行数目安は \${limits.lines}行前後です。指定値では本文が印刷範囲から欠ける可能性があります。\`,
          );
        }

        if (lineHeight < 1.5) {
          warnings.push(
            "行送りが 1.5 未満です。ルビ・見出し・フォントによって欠ける可能性があります。",
          );
        }

        if (showPageNumbers && warnings.length > 0) {
          warnings.push(
            "ナンバリングありの場合、ページ番号ぶんの領域を使うため、収まりがさらに変わる場合があります。",
          );
        }
      }

      if (layoutMode === "2up") {
        const limits = SIMPLE_PRINT_GUIDE_LIMITS.twoUp[guideFontKey] || null;
        if (!limits) return warnings;

        const fontLabel =
          Number(fontSizePt) >= 11 ? "11pt以上" : \`\${guideFontKey}pt\`;

        if (chars > limits.chars) {
          warnings.push(
            \`2ページ面付け（\${fontLabel}）の文字数目安は \${limits.chars}字前後です。指定値では本文やページ番号が欠ける可能性があります。\`,
          );
        }

        if (lines > limits.lines) {
          warnings.push(
            \`2ページ面付け（\${fontLabel}）の行数目安は \${limits.lines}行前後です。指定値では本文が印刷範囲から欠ける可能性があります。\`,
          );
        }

        if (lineHeight < 1.5) {
          warnings.push(
            "行送りが 1.5 未満です。ルビ・見出し・フォントによって欠ける可能性があります。",
          );
        }

        if (showPageNumbers && warnings.length > 0) {
          warnings.push(
            "ナンバリングありの場合、ページ番号ぶんの領域を使うため、収まりがさらに変わる場合があります。",
          );
        }
      }

      return warnings;
    }

    function updateSimplePrintWarnings() {
      if (!simplePrintWarningBoxEl || !simplePrintWarningMessagesEl) return;
      if (!exportModeEl || !layoutModeEl) return;

      const isSimpleMode = exportModeEl.value !== "real";

      if (!isSimpleMode) {
        simplePrintWarningBoxEl.classList.add("is-hidden");
        simplePrintWarningMessagesEl.textContent = "";
        return;
      }

      const warnings = getSimplePrintWarnings();

      if (!warnings.length) {
        simplePrintWarningBoxEl.classList.add("is-hidden");
        simplePrintWarningMessagesEl.textContent = "";
        return;
      }

      simplePrintWarningMessagesEl.textContent = warnings.join("\\n");
      simplePrintWarningBoxEl.classList.remove("is-hidden");
    }

    function syncSimpleModeView() {
      syncCurrentSettingsView();
      updateSimplePrintWarnings();
    }

    function syncPanelView() {
      updateLayoutModeUI();

      if (exportModeEl.value === "real") {
        if (simplePrintWarningBoxEl) {
          simplePrintWarningBoxEl.classList.add("is-hidden");
        }
        if (simplePrintWarningMessagesEl) {
          simplePrintWarningMessagesEl.textContent = "";
        }

        updateRealPrintBookOptionsUI();
        updateRealPrintColumnModeUI();
        syncRealPrintMetricsView();
        refreshRealPreviewIfOpen();
        return;
      }

      syncCurrentSettingsView();
      updateSimplePrintWarnings();
    }

    function safelySyncPanelView() {
      try {
        syncPanelView();
      } catch (error) {
        showError(error?.message || String(error || "表示更新に失敗しました。"));
      }
    }

    function syncCurrentSettingsView() {
      currentCharsPerLineEl.textContent =
        \`\${readNumber(charsPerLineEl, defaultState.charsPerLine)} 字\`;

      currentLinesPerPageEl.textContent =
        \`\${readNumber(linesPerPageEl, defaultState.linesPerPage)} 行\`;

      currentFontFamilyEl.textContent = ${JSON.stringify(state.fontFamily)};

      currentPunctuationLayoutEl.textContent = getPunctuationLayoutLabel(
        punctuationLayoutModeEl.value === "pushout" ? "pushout" : "hanging",
      );
      if (currentTypographyAdjustmentsEl) {
        currentTypographyAdjustmentsEl.textContent =
          !useTypographyAdjustmentsEl || useTypographyAdjustmentsEl.checked
            ? "ON"
            : "OFF";
      }
    }

    function syncRealPrintMetricsView() {
      const metrics = calculateRealPrintMetricsFromInputs();

      if (Number(metrics.trimSize.bleedMm || 0) > 0) {
        const bleedLabel =
          metrics.trimSize.bleedMode === "nonSpine" ? "ノド以外" : "四方";

        realTrimSizeEl.innerHTML =
          \`<div class="realTrimMain">\${metrics.trimSize.label}（仕上がり \${metrics.trimSize.widthMm} × \${metrics.trimSize.heightMm} mm）</div>\` +
          \`<div class="realTrimSub">出力 \${metrics.trimSize.outputWidthMm} × \${metrics.trimSize.outputHeightMm} mm / 裁ち落とし: \${bleedLabel}</div>\`;
      } else {
        realTrimSizeEl.innerHTML =
          \`<div class="realTrimMain">\${metrics.trimSize.label}（\${metrics.trimSize.widthMm} × \${metrics.trimSize.heightMm} mm）</div>\`;
      }

      if (metrics.column && metrics.column.count === 2) {
        realContentBoxEl.textContent =
          \`\${metrics.contentBox.widthMm} × \${metrics.contentBox.heightMm} mm / \` +
          \`二段：1段 \${metrics.column.widthMm} × \${metrics.column.heightMm}mm・段間 \${metrics.column.gapMm}mm\`;
      } else {
        realContentBoxEl.textContent =
          \`\${metrics.contentBox.widthMm} × \${metrics.contentBox.heightMm} mm\`;
      }

      realFontSizeEl.textContent =
        \`\${metrics.font.sizePt} pt（約 \${metrics.font.sizeMm} mm）\`;

      realCharSpacingEl.textContent =
        \`\${metrics.estimated.outputCharSpacingMm} mm\`;

      realLineSpacingEl.textContent =
        \`\${metrics.estimated.lineSpacingMm} mm\`;

      realStatusEl.textContent = metrics.status;

      realMessagesBoxEl.innerHTML = Array.isArray(metrics.messages)
        ? metrics.messages.map((msg) => \`<div>\${String(msg)}</div>\`).join("")
        : "メッセージなし";
    }

    function clearRealPreviewFrame(message = "設定が変更されました。プレビューを再生成しています…") {
      if (realPreviewFrameEl) {
        realPreviewFrameEl.srcdoc = "";
      }
      if (realPreviewMetaEl) {
        realPreviewMetaEl.textContent = message;
      }
    }

    function fitRealPreviewFrameToPage() {
      if (!realPreviewFrameEl) return;

      const frame = realPreviewFrameEl;
      const doc = frame.contentDocument || frame.contentWindow?.document;
      if (!doc) return;

      const page = doc.querySelector(".realPrintPage");
      const documentRoot = doc.querySelector(".realPrintDocument");
      if (!page || !documentRoot) return;

      const body = doc.body;
      if (!body) return;

      // いったん等倍に戻してから測る
      documentRoot.style.zoom = "1";
      documentRoot.style.transform = "";
      documentRoot.style.transformOrigin = "top center";

      body.style.overflowX = "hidden";
      body.style.overflowY = "auto";

      const frameWidth = Math.max(1, frame.clientWidth);
      const frameHeight = Math.max(1, frame.clientHeight);

      const pageRect = page.getBoundingClientRect();

      // iframe内のbody paddingや影を少し見込む
      const safetyPx = 44;

      const widthScale = (frameWidth - safetyPx) / Math.max(1, pageRect.width);
      const heightScale = (frameHeight - safetyPx) / Math.max(1, pageRect.height);

      const scale = Math.min(1, widthScale, heightScale);

      // Chromium系WebViewなので zoom が扱いやすい
      documentRoot.style.zoom = String(Math.max(0.35, Math.floor(scale * 1000) / 1000));

      // 縮小後に中央寄せを維持
      documentRoot.style.justifyContent = "center";
    }

    function refreshRealPreviewIfOpen() {
      if (realPreviewOverlayEl.classList.contains("is-hidden")) return;

      clearRealPreviewFrame();

      if (realPreviewRefreshTimerId) {
        clearTimeout(realPreviewRefreshTimerId);
      }

      realPreviewRefreshTimerId = setTimeout(() => {
        realPreviewRefreshTimerId = null;
        requestRealPrintPreview();
      }, 350);
    }

    function buildRealPreviewMetrics() {
      return calculateRealPrintMetricsFromInputs();
    }

    function renderRealPreview() {
      const metrics = buildRealPreviewMetrics();

      const trimWidth = Number(metrics.trimSize.widthMm || 1);
      const trimHeight = Number(metrics.trimSize.heightMm || 1);
      const topMm = readNumber(realPrintMarginTopMmEl, 0);
      const bottomMm = readNumber(realPrintMarginBottomMmEl, 0);
      const rightMm = readNumber(realPrintMarginRightMmEl, 0);
      const leftMm = readNumber(realPrintMarginLeftMmEl, 0);
      const linesPerPage = Math.max(1, readNumber(realPrintLinesPerPageEl, 1));
      const charsPerLine = Math.max(1, readNumber(realPrintCharsPerLineEl, 1));

      const maxPreviewHeightPx = 520;
      const scale = Math.min(3.2, maxPreviewHeightPx / trimHeight);

      const sheetWidthPx = Math.max(120, Math.round(trimWidth * scale));
      const sheetHeightPx = Math.max(180, Math.round(trimHeight * scale));

      const contentLeftPx = Math.round(leftMm * scale);
      const contentTopPx = Math.round(topMm * scale);
      const contentWidthPx = Math.max(1, Math.round(metrics.contentBox.widthMm * scale));
      const contentHeightPx = Math.max(1, Math.round(metrics.contentBox.heightMm * scale));

      realPreviewSheetEl.style.width = \`\${sheetWidthPx}px\`;
      realPreviewSheetEl.style.height = \`\${sheetHeightPx}px\`;

      realPreviewContentBoxEl.style.left = \`\${contentLeftPx}px\`;
      realPreviewContentBoxEl.style.top = \`\${contentTopPx}px\`;
      realPreviewContentBoxEl.style.width = \`\${contentWidthPx}px\`;
      realPreviewContentBoxEl.style.height = \`\${contentHeightPx}px\`;

      realPreviewMetaEl.textContent =
        \`\${metrics.trimSize.label} / 本文面 \${metrics.contentBox.widthMm} × \${metrics.contentBox.heightMm} mm / \${metrics.font.sizePt}pt / 判定: \${metrics.status}\`;

      realPreviewTopLabelEl.textContent = \`上 \${topMm}mm\`;
      realPreviewBottomLabelEl.textContent = \`下 \${bottomMm}mm\`;
      realPreviewRightLabelEl.textContent = \`右 \${rightMm}mm\`;
      realPreviewLeftLabelEl.textContent = \`左 \${leftMm}mm\`;

      realPreviewTopLabelEl.style.top = \`6px\`;
      realPreviewTopLabelEl.style.left = \`50%\`;
      realPreviewTopLabelEl.style.transform = \`translateX(-50%)\`;

      realPreviewBottomLabelEl.style.bottom = \`6px\`;
      realPreviewBottomLabelEl.style.left = \`50%\`;
      realPreviewBottomLabelEl.style.transform = \`translateX(-50%)\`;

      realPreviewRightLabelEl.style.top = \`50%\`;
      realPreviewRightLabelEl.style.right = \`6px\`;
      realPreviewRightLabelEl.style.transform = \`translateY(-50%)\`;

      realPreviewLeftLabelEl.style.top = \`50%\`;
      realPreviewLeftLabelEl.style.left = \`6px\`;
      realPreviewLeftLabelEl.style.transform = \`translateY(-50%)\`;

      const columnsHtml = [];
      for (let lineIndex = 0; lineIndex < linesPerPage; lineIndex += 1) {
        const rowGuides = [];
        for (let charIndex = 1; charIndex < charsPerLine; charIndex += 1) {
          const topPercent = (charIndex / charsPerLine) * 100;
          rowGuides.push(
            \`<div class="previewRowGuide" style="top:\${topPercent}%;"></div>\`,
          );
        }

        columnsHtml.push(
          \`<div class="previewColumn">\${rowGuides.join("")}</div>\`,
        );
      }

      realPreviewColumnsEl.innerHTML = columnsHtml.join("");
    }

    function openRealPreview() {
      realPreviewOverlayEl.classList.remove("is-hidden");
      requestRealPrintPreview();
    }

    function setRealPreviewLoading(isLoading) {
      if (!realPreviewLoadingEl) return;
      realPreviewLoadingEl.classList.toggle("is-hidden", !isLoading);
    }

    function requestRealPrintPreview() {
      showError("");
      clearRealPreviewFrame("プレビューを生成しています…");
      setRealPreviewLoading(true);

      const payload = collectPayload();

      vscode.postMessage({
        type: "requestRealPrintPreview",
        payload,
      });
    }

    function closeRealPreview() {
      if (realPreviewRefreshTimerId) {
        clearTimeout(realPreviewRefreshTimerId);
        realPreviewRefreshTimerId = null;
      }
      realPreviewOverlayEl.classList.add("is-hidden");
    }

    function resetToDefaults() {
      const currentMode = exportModeEl.value === "real" ? "real" : "simple";
      if (useTypographyAdjustmentsEl) {
        useTypographyAdjustmentsEl.checked =
          defaultState.useTypographyAdjustments !== false;
      }

      if (currentMode === "simple") {
        const currentLayout = normalizeSimpleLayoutKey(layoutModeEl.value);

        const nextState = {
          htmlPrintLayoutMode: currentLayout,
          htmlPrintOrientation: defaultState.htmlPrintOrientation || "portrait",
          showPageNumbers: defaultState.showPageNumbers,
          printFontSizePt: defaultState.printFontSizePt,
          printFontSizePx: ptToPx(defaultState.printFontSizePt),
          printLineHeight: defaultState.printLineHeight,
          printMarginMm: defaultState.printMarginMm,
          printBodyPaddingPx: defaultState.printBodyPaddingPx,
          charsPerLine: defaultState.charsPerLine,
          linesPerPage: defaultState.linesPerPage,
          punctuationLayoutMode: defaultState.punctuationLayoutMode,
        };

        simpleSavedByLayout = {
          ...(simpleSavedByLayout || {}),
          [currentLayout]: nextState,
        };

        applySimpleStateToInputs(nextState);
      } else {
        const sizeKey = normalizeRealPrintSizeKey(realPrintPageSizeEl.value);
        const columnMode = normalizeRealPrintColumnMode(
          realPrintColumnModeEl.value,
          sizeKey,
        );
        const nextState = getRealPrintDefaultsForLayout(sizeKey, columnMode);

        applyRealPrintStateToInputs({
          ...nextState,
          realPrintBleedMm: defaultState.realPrintBleedMm || 0,
          realPrintBleedMode: defaultState.realPrintBleedMode || "all",
          realPrintMirrorMargins: defaultState.realPrintMirrorMargins !== false,
          realPrintStartPageSide: defaultState.realPrintStartPageSide || "odd",
          realPrintBookOptionsEnabled: defaultState.realPrintBookOptionsEnabled === true,
          realPrintShowPageNumber: defaultState.realPrintShowPageNumber === true,
          realPrintPageNumberStart: defaultState.realPrintPageNumberStart || 1,
          realPrintShowHeading1: defaultState.realPrintShowHeading1 === true,
          realPrintHeading1Mode: defaultState.realPrintHeading1Mode || "all",
          realPrintHeaderOrder: defaultState.realPrintHeaderOrder || "numberTitle",
          realPrintHeaderPosition: defaultState.realPrintHeaderPosition || "bottom",
        });

        updateRealPrintBookOptionsUI();
        updateRealPrintColumnModeUI();
      }

      showError("");
      showSuccess("");
      safelySyncPanelView();
      savePanelUiState();
    }

    function collectPayload() {
      const currentMode = exportModeEl.value === "real" ? "real" : "simple";

      if (currentMode === "simple") {
        updateSavedSimpleStateFromCurrentInputs();
      }

      const printFontSizePt = readNumber(printFontSizePtEl, pxToPt(14.5));

      const payload = {
        format: "html",
        htmlTarget: "browser",
        htmlDirection: "vertical",
        htmlShowTitle: false,
        htmlPageSize: "auto",
        htmlOrientation: "auto",
        fontFamily: ${JSON.stringify(state.fontFamily)},

        exportMode: currentMode,

        htmlPrintLayoutMode: layoutModeEl.value === "2up" ? "2up" : "single",
        htmlPrintOrientation:
          htmlPrintOrientationEl.value === "landscape" ? "landscape" : "portrait",
        showPageNumbers: !!showPageNumbersEl.checked,
        printFontSizePx: ptToPx(printFontSizePt),
        printLineHeight: readNumber(printLineHeightEl, 1.72),
        charsPerLine: readNumber(charsPerLineEl, 42),
        linesPerPage: readNumber(linesPerPageEl, 16),
        punctuationLayoutMode:
          punctuationLayoutModeEl.value === "pushout" ? "pushout" : "hanging",
        useTypographyAdjustments:
          !useTypographyAdjustmentsEl || useTypographyAdjustmentsEl.checked,
        printMarginMm: readNumber(printMarginMmEl, 0),
        printBodyPaddingPx: readNumber(printBodyPaddingPxEl, 0),

        realPrintPageSize: realPrintPageSizeEl.value,
        realPrintFontSizePt: readNumber(realPrintFontSizePtEl, 9),

        realPrintColumnMode: normalizeRealPrintColumnMode(
          realPrintColumnModeEl.value,
          realPrintPageSizeEl.value,
        ),
        realPrintColumnGapMm:
          normalizeRealPrintColumnMode(
            realPrintColumnModeEl.value,
            realPrintPageSizeEl.value,
          ) === "two"
            ? readNumber(realPrintColumnGapMmEl, 0)
            : 0,

        realPrintBleedMm: readNumber(realPrintBleedMmEl, 0),
        realPrintBleedMode:
          realPrintBleedModeEl.value === "nonSpine" ? "nonSpine" : "all",
        realPrintMirrorMargins: !!realPrintMirrorMarginsEl.checked,
        realPrintStartPageSide:
          realPrintStartPageSideEl.value === "even" ? "even" : "odd",

        realPrintBookOptionsEnabled: !!realPrintBookOptionsEnabledEl.checked,

        realPrintShowPageNumber:
          !!realPrintBookOptionsEnabledEl.checked &&
          !!realPrintShowPageNumberEl.checked,

        realPrintPageNumberStart: readNumber(realPrintPageNumberStartEl, 1),

        realPrintShowHeading1:
          !!realPrintBookOptionsEnabledEl.checked &&
          !!realPrintShowHeading1El.checked,

        realPrintHeading1Mode:
          realPrintHeading1ModeEl.value === "evenOnly" ? "evenOnly" : "all",

        realPrintHeaderOrder:
          realPrintHeaderOrderEl.value === "titleNumber"
            ? "titleNumber"
            : "numberTitle",

        realPrintHeaderPosition:
          realPrintHeaderPositionEl.value === "top" ? "top" : "bottom",

        realPrintMarginTopMm: readNumber(realPrintMarginTopMmEl, 22),
        realPrintMarginBottomMm: readNumber(realPrintMarginBottomMmEl, 18),
        realPrintMarginRightMm: readNumber(realPrintMarginRightMmEl, 18),
        realPrintMarginLeftMm: readNumber(realPrintMarginLeftMmEl, 14),
        realPrintCharsPerLine: readNumber(realPrintCharsPerLineEl, 42),
        realPrintLinesPerPage: readNumber(realPrintLinesPerPageEl, 16),
      };

      if (currentMode === "simple") {
        if (printFontSizePt < 6) {
          throw new Error("印刷用フォントサイズは 6pt 以上で入力してください。");
        }
        if (!(payload.printLineHeight >= 1.4)) {
          throw new Error("印刷用行送りは 1.4 以上で入力してください。");
        }
        if (payload.htmlPrintLayoutMode === "single") {
          if (payload.printMarginMm < 0) {
            throw new Error("上余白 mm は 0 以上で入力してください。");
          }
          if (payload.printBodyPaddingPx < 0) {
            throw new Error("本文内余白 px は 0 以上で入力してください。");
          }
        }
        if (!(payload.charsPerLine >= 1)) {
          throw new Error("文字数は 1 以上で入力してください。");
        }
        if (!(payload.linesPerPage >= 1)) {
          throw new Error("行数は 1 以上で入力してください。");
        }
        if (payload.htmlPrintLayoutMode === "2up") {
          payload.printMarginMm = 0;
          payload.printBodyPaddingPx = 0;
        }
      } else {
        if (currentMode === "real" && !payload.realPrintBookOptionsEnabled) {
          payload.realPrintBleedMm = 0;
          payload.realPrintBleedMode = "all";
          payload.realPrintShowPageNumber = false;
          payload.realPrintShowHeading1 = false;
        }
        if (!(payload.realPrintFontSizePt > 0)) {
          throw new Error("フォントサイズは 1pt 以上で入力してください。");
        }
        if (payload.realPrintBleedMm < 0) {
          throw new Error("裁ち落とし mm は 0 以上で入力してください。");
        }
        if (payload.realPrintPageNumberStart < 1) {
          throw new Error("ページ番号開始は 1 以上で入力してください。");
        }
        if (!(payload.realPrintCharsPerLine >= 1)) {
          throw new Error("目標文字数は 1 以上で入力してください。");
        }
        if (!(payload.realPrintLinesPerPage >= 1)) {
          throw new Error("目標行数は 1 以上で入力してください。");
        }
      }
      return payload;
    }

    openRealPreviewButtonEl.addEventListener("click", () => {
      openRealPreview();
    });

    closeRealPreviewButtonEl.addEventListener("click", () => {
      closeRealPreview();
    });

    submitFromPreviewButtonEl.addEventListener("click", () => {
      submitButtonEl.click();
    });

    realPreviewFrameEl.addEventListener("load", () => {
      requestAnimationFrame(() => {
        fitRealPreviewFrameToPage();
      });
    });

    window.addEventListener("resize", () => {
      if (realPreviewOverlayEl.classList.contains("is-hidden")) return;

      requestAnimationFrame(() => {
        fitRealPreviewFrameToPage();
      });
    });

    realPreviewOverlayEl.addEventListener("click", (event) => {
      if (event.target === realPreviewOverlayEl) {
        closeRealPreview();
      }
    });

    openSimpleGuideButtonEl.addEventListener("click", () => {
      vscode.postMessage({
        type: "showSimplePrintGuide",
        message: buildSimplePrintGuideText(),
      });
    });

    resetButtonEl.addEventListener("click", () => {
      resetToDefaults();
    });

    cancelButtonEl.addEventListener("click", () => {
      savePanelUiState();
      vscode.postMessage({ type: "cancel" });
    });

    submitButtonEl.addEventListener("click", () => {
      if (isSubmitting) return;

      try {
        showError("");
        showSuccess("");

        savePanelUiState();

        const payload = collectPayload();

        setSubmitting(true);

        vscode.postMessage({ type: "submit", payload });
      } catch (error) {
        clearSubmitting();
        showError(error?.message || String(error || ""));
      }
    });

    window.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        submitButtonEl.click();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();

        if (!realPreviewOverlayEl.classList.contains("is-hidden")) {
          closeRealPreview();
          return;
        }

        cancelButtonEl.click();
      }
    });

    window.addEventListener("message", (event) => {
      const message = event.data || {};
      const type = String(message.type || "");

      if (type === "realPrintPreviewResult") {
        setRealPreviewLoading(false);

        if (!message.ok) {
          showError(message.message || "プレビュー生成に失敗しました。");
          realPreviewMetaEl.textContent = "プレビュー生成に失敗しました。";
          return;
        }

        const previewHtml = String(message.html || "");

        if (!previewHtml.trim()) {
          showError("プレビューHTMLが空です。原稿ファイルまたは生成処理を確認してください。");
          realPreviewMetaEl.textContent = "プレビューHTMLが空です。";
          return;
        }

        realPreviewFrameEl.srcdoc = previewHtml;
        realPreviewMetaEl.textContent =
          message.message || "現在の設定で本文プレビューを表示しています。";

        requestAnimationFrame(() => {
          fitRealPreviewFrameToPage();
        });

        return;
      }

      if (type === "submitResult") {
        clearSubmitting();

      if (message.ok) {
        updateSavedSimpleStateFromCurrentInputs();
        updateSavedRealPrintStateFromCurrentInputs();
        showError("");
        showSuccess(message.message || "書き出しました。");
      } else {
          showSuccess("");
          showError(message.message || "書き出しに失敗しました。");
        }
      }

      if (type === "resetDone") {
        showError("");
        showSuccess("");
      }
    });

    layoutModeEl.addEventListener("focus", () => {
      updateSavedSimpleStateFromCurrentInputs();
    });

    let previousSimpleLayoutKey = normalizeSimpleLayoutKey(layoutModeEl.value);

    layoutModeEl.addEventListener("focus", () => {
      previousSimpleLayoutKey = normalizeSimpleLayoutKey(layoutModeEl.value);
      updateSavedSimpleStateFromCurrentInputs();
    });

    layoutModeEl.addEventListener("change", () => {
      const nextKey = normalizeSimpleLayoutKey(layoutModeEl.value);

      // 変更前の版組を保存
      simpleSavedByLayout = {
        ...(simpleSavedByLayout || {}),
        [previousSimpleLayoutKey]: getCurrentSimpleInputState(),
      };

      // 変更後の版組を読み込み
      switchSimplePresetByLayout(nextKey);

      previousSimpleLayoutKey = nextKey;

      safelySyncPanelView();
      savePanelUiState();
    });

    [
      charsPerLineEl,
      linesPerPageEl,
      printFontSizePtEl,
      printLineHeightEl,
      printMarginMmEl,
      printBodyPaddingPxEl,
      htmlPrintOrientationEl,
      showPageNumbersEl,
      useTypographyAdjustmentsEl,
    ].forEach((el) => {
      if (!el) return;
      el.addEventListener("input", safelySyncPanelView);
      el.addEventListener("change", safelySyncPanelView);
    });

    punctuationLayoutModeEl.addEventListener("change", safelySyncPanelView);

    exportModeEl.addEventListener("change", () => {
      safelySyncPanelView();
      savePanelUiState();
    });

    function updateRealPrintBookOptionsUI() {
      const enabled = !!realPrintBookOptionsEnabledEl.checked;

      realPrintBookOptionsFieldsEl.classList.toggle("is-hidden", !enabled);

      if (!enabled) {
        realPrintBleedMmEl.value = realPrintBleedMmEl.value || "0";
      }
    }

    function updateRealPrintColumnModeUI() {
      const sizeKey = normalizeRealPrintSizeKey(realPrintPageSizeEl.value);
      const canTwoColumn = isRealPrintTwoColumnSize(sizeKey);

      if (!canTwoColumn && realPrintColumnModeEl.value === "two") {
        realPrintColumnModeEl.value = "single";
      }

      const columnMode = normalizeRealPrintColumnMode(
        realPrintColumnModeEl.value,
        sizeKey,
      );

      realPrintColumnModeEl.value = columnMode;

      const twoOption = Array.from(realPrintColumnModeEl.options).find(
        (option) => option.value === "two",
      );

      if (twoOption) {
        twoOption.disabled = !canTwoColumn;
      }

      realPrintColumnGapRowEl.classList.toggle(
        "fieldGridPlaceholder",
        columnMode !== "two",
      );

      if (realPrintColumnModeHintEl) {
        realPrintColumnModeHintEl.textContent = canTwoColumn
          ? "二段組みの行数は1段あたりとして扱います。"
          : "二段組みは A5 / 新書判のみ選択できます。";
      }

      if (realPrintLinesPerPageLabelEl) {
        realPrintLinesPerPageLabelEl.textContent =
          columnMode === "two" ? "行数（1段あたり）" : "行数";
      }
    }

    function handleRealPrintInput() {
      updateSavedRealPrintStateFromCurrentInputs();
      syncRealPrintMetricsView();
      refreshRealPreviewIfOpen();
    }

    let previousRealPrintSizeKey = normalizeRealPrintSizeKey(
      realPrintPageSizeEl.value,
    );

    let previousRealPrintColumnMode = normalizeRealPrintColumnMode(
      realPrintColumnModeEl.value,
      previousRealPrintSizeKey,
    );

    realPrintPageSizeEl.addEventListener("focus", () => {
      previousRealPrintSizeKey = normalizeRealPrintSizeKey(
        realPrintPageSizeEl.value,
      );

      previousRealPrintColumnMode = normalizeRealPrintColumnMode(
        realPrintColumnModeEl.value,
        previousRealPrintSizeKey,
      );

      updateSavedRealPrintStateFromCurrentInputs(
        previousRealPrintSizeKey,
        previousRealPrintColumnMode,
      );
    });

    realPrintPageSizeEl.addEventListener("change", () => {
      updateSavedRealPrintStateFromCurrentInputs(
        previousRealPrintSizeKey,
        previousRealPrintColumnMode,
      );

      const nextSizeKey = normalizeRealPrintSizeKey(realPrintPageSizeEl.value);
      const nextColumnMode = normalizeRealPrintColumnMode(
        realPrintColumnModeEl.value,
        nextSizeKey,
      );

      switchRealPrintPresetByLayout(nextSizeKey, nextColumnMode);

      previousRealPrintSizeKey = nextSizeKey;
      previousRealPrintColumnMode = nextColumnMode;

      savePanelUiState();
    });

    realPrintColumnModeEl.addEventListener("focus", () => {
      previousRealPrintSizeKey = normalizeRealPrintSizeKey(
        realPrintPageSizeEl.value,
      );

      previousRealPrintColumnMode = normalizeRealPrintColumnMode(
        realPrintColumnModeEl.value,
        previousRealPrintSizeKey,
      );

      updateSavedRealPrintStateFromCurrentInputs(
        previousRealPrintSizeKey,
        previousRealPrintColumnMode,
      );
    });

    realPrintColumnModeEl.addEventListener("change", () => {
      updateSavedRealPrintStateFromCurrentInputs(
        previousRealPrintSizeKey,
        previousRealPrintColumnMode,
      );

      const sizeKey = normalizeRealPrintSizeKey(realPrintPageSizeEl.value);
      const columnMode = normalizeRealPrintColumnMode(
        realPrintColumnModeEl.value,
        sizeKey,
      );

      switchRealPrintPresetByLayout(sizeKey, columnMode);

      previousRealPrintSizeKey = sizeKey;
      previousRealPrintColumnMode = columnMode;

      savePanelUiState();
    });

    realPrintColumnGapMmEl.addEventListener("input", handleRealPrintInput);

    realPrintBleedModeEl.addEventListener("change", handleRealPrintInput);
    realPrintMirrorMarginsEl.addEventListener("change", handleRealPrintInput);
    realPrintStartPageSideEl.addEventListener("change", handleRealPrintInput);

    realPrintBookOptionsEnabledEl.addEventListener("change", () => {
      updateRealPrintBookOptionsUI();
      handleRealPrintInput();
    });

    realPrintShowPageNumberEl.addEventListener("change", handleRealPrintInput);
    realPrintPageNumberStartEl.addEventListener("input", handleRealPrintInput);
    realPrintShowHeading1El.addEventListener("change", handleRealPrintInput);
    realPrintHeading1ModeEl.addEventListener("change", handleRealPrintInput);
    realPrintHeaderOrderEl.addEventListener("change", handleRealPrintInput);
    realPrintHeaderPositionEl.addEventListener("change", handleRealPrintInput);

    realPrintColumnGapMmEl.addEventListener("input", handleRealPrintInput);
    realPrintColumnGapMmEl.addEventListener("change", handleRealPrintInput);

    realPrintFontSizePtEl.addEventListener("input", handleRealPrintInput);
    realPrintBleedMmEl.addEventListener("input", handleRealPrintInput);
    realPrintCharsPerLineEl.addEventListener("input", handleRealPrintInput);
    realPrintLinesPerPageEl.addEventListener("input", handleRealPrintInput);
    realPrintMarginTopMmEl.addEventListener("input", handleRealPrintInput);
    realPrintMarginBottomMmEl.addEventListener("input", handleRealPrintInput);
    realPrintMarginRightMmEl.addEventListener("input", handleRealPrintInput);
    realPrintMarginLeftMmEl.addEventListener("input", handleRealPrintInput);

    restorePanelUiState();
    updateRealPrintColumnModeUI();

    // 古い vscode.getState() が single を持っていても、
    // 初期HTMLで描画された現在の判型・版組を正として上書きする。
    vscode.setState({
      ...(vscode.getState() || {}),
      exportMode: exportModeEl ? exportModeEl.value : "simple",
      realPrintPageSize: normalizeRealPrintSizeKey(realPrintPageSizeEl.value),
      realPrintColumnMode: normalizeRealPrintColumnMode(
        realPrintColumnModeEl.value,
        realPrintPageSizeEl.value,
      ),
      simpleSavedByLayout,
      realPrintSavedBySize,
    });

    previousSimpleLayoutKey = normalizeSimpleLayoutKey(layoutModeEl.value);

    previousRealPrintSizeKey = normalizeRealPrintSizeKey(
      realPrintPageSizeEl.value,
    );

    previousRealPrintColumnMode = normalizeRealPrintColumnMode(
      realPrintColumnModeEl.value,
      previousRealPrintSizeKey,
    );

    safelySyncPanelView();
  </script>
</body>
</html>`;
}

function openMergedManuscriptBrowserPanel(
  context,
  initialState = {},
  handlers = {},
) {
  const persistedState = normalizePersistedPanelState(
    context?.workspaceState?.get(PANEL_PERSIST_KEY) || {},
  );

  const state = normalizePanelState({
    ...persistedState,
    ...initialState,
  });

  const resetState = normalizePanelState(
    initialState.resetState || initialState,
  );

  if (mergedManuscriptBrowserPanelRef) {
    mergedManuscriptBrowserPanelRef.reveal(vscode.ViewColumn.Active);
    return Promise.resolve({
      reused: true,
    });
  }

  return new Promise((resolve) => {
    const panel = vscode.window.createWebviewPanel(
      "mojigotoMergedManuscriptBrowserPanel",
      "縦書きHTML書き出し",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    mergedManuscriptBrowserPanelRef = panel;
    mergedManuscriptBrowserPanelResolve = resolve;

    let settled = false;

    function finish(result) {
      if (settled) return;
      settled = true;

      if (mergedManuscriptBrowserPanelRef === panel) {
        mergedManuscriptBrowserPanelRef = null;
      }

      const currentResolve = mergedManuscriptBrowserPanelResolve;
      if (mergedManuscriptBrowserPanelResolve === resolve) {
        mergedManuscriptBrowserPanelResolve = null;
      }

      try {
        panel.dispose();
      } catch {}

      if (typeof currentResolve === "function") {
        currentResolve(result);
      }
    }

    panel.webview.html = getPanelHtml(panel.webview, state, resetState);

    panel.webview.onDidReceiveMessage(
      async (message) => {
        const type = String(message?.type || "");

        if (type === "requestRealPrintPreview") {
          try {
            if (typeof handlers.onPreview === "function") {
              const result = await handlers.onPreview(message?.payload || {});

              panel.webview.postMessage({
                type: "realPrintPreviewResult",
                ok: true,
                html: result?.html || "",
                message: result?.message || "",
              });
              return;
            }

            panel.webview.postMessage({
              type: "realPrintPreviewResult",
              ok: false,
              message: "プレビュー生成処理が未設定です。",
            });
          } catch (error) {
            panel.webview.postMessage({
              type: "realPrintPreviewResult",
              ok: false,
              message:
                error?.message ||
                String(error || "プレビュー生成に失敗しました。"),
            });
          }

          return;
        }

        if (type === "showSimplePrintGuide") {
          const guideMessage = String(message?.message || "").trim();

          await vscode.window.showInformationMessage(
            guideMessage || "体裁の目安を取得できませんでした。",
            { modal: true },
          );

          return;
        }

        if (type === "persistUiState") {
          await updatePersistedPanelUiState(context, message?.state || {});
          return;
        }

        if (type === "cancel") {
          finish(null);
          return;
        }

        if (type === "submit") {
          const payload = message?.payload || {};
          const nextState = {
            ...state,
            ...payload,
          };

          await updatePersistedPanelUiState(context, nextState);

          try {
            if (typeof handlers.onSubmit === "function") {
              const result = await handlers.onSubmit(nextState);
              panel.webview.postMessage({
                type: "submitResult",
                ok: true,
                message: result?.message || "書き出しました。",
              });
            } else {
              panel.webview.postMessage({
                type: "submitResult",
                ok: true,
                message: "書き出しました。",
              });
            }
          } catch (error) {
            panel.webview.postMessage({
              type: "submitResult",
              ok: false,
              message:
                error?.message || String(error || "書き出しに失敗しました。"),
            });
          }

          return;
        }
      },
      null,
      [],
    );

    panel.onDidDispose(() => {
      if (!settled) {
        settled = true;

        if (mergedManuscriptBrowserPanelRef === panel) {
          mergedManuscriptBrowserPanelRef = null;
        }

        const currentResolve = mergedManuscriptBrowserPanelResolve;
        if (mergedManuscriptBrowserPanelResolve === resolve) {
          mergedManuscriptBrowserPanelResolve = null;
        }

        if (typeof currentResolve === "function") {
          currentResolve(null);
        }
      }
    });
  });
}

module.exports = {
  openMergedManuscriptBrowserPanel,
};
