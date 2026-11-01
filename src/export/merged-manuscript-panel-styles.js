// 原稿書き出し設定画面のスタイル。
function getPanelStyles() {
  return `
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
    flex-wrap: wrap;
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

  .previewChapterRow { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
  .previewChapterRow select { flex: 1; min-width: 0; max-width: 460px; }

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
    min-height: 240px;
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
`;
}

module.exports = { getPanelStyles };
