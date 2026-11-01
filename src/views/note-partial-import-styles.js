function getStyles() {
  return `
  body {
    margin: 0;
    padding: 16px;
    box-sizing: border-box;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
  }

  .shell {
    max-width: 1200px;
    margin: 0 auto;
    min-height: calc(100dvh - 32px);
    box-sizing: border-box;
    padding-bottom: var(--footer-space, 76px);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .card {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 10px;
    background: var(--vscode-editorWidget-background);
    padding: 14px;
  }

  .head {
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: relative;
  }

  .headMetaRow {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
  }

  .headMetaRow span {
    white-space: nowrap;
  }

  .headTitle {
    display: flex;
    align-items: end;
    flex-wrap: wrap;
    gap: 15px;
  }

  .title {
    font-size: 1.1rem;
    font-weight: 700;
  }

  .headActions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    position: absolute;
    top: 10px;
    right: 10px;
  }

  .muted {
    color: var(--vscode-descriptionForeground);
  }

  .layout {
    display: grid;
    gap: 16px;
    align-items: start;
    grid-template-columns: minmax(0, 1fr) minmax(320px, 0.92fr);
    grid-template-areas: "source right";
  }

  .sourceColumn {
    grid-area: source;
    min-width: 0;
  }

  .rightColumn {
    grid-area: right;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .previewColumn,
  .targetColumn {
    min-width: 0;
    min-height: 0;
  }

  .sectionTitle {
    font-weight: 700;
    margin-bottom: 10px;
  }

  .sourceColumn,
  .previewColumn,
  .targetColumn {
    min-height: 0;
  }

  .previewColumn .card,
  .previewColumn,
  .targetColumn .card,
  .targetColumn {
    min-width: 0;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 8px;
    min-height: 0;
    overflow: auto;
  }

  .previewBody {
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.85;
    min-height: 170px;
    overflow: auto;
    padding: 10px 12px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    background: var(--vscode-editor-background);
  }

  .shell.hasWarnings .previewBody {
    min-height: 0;
  }

  .shell.hasWarnings .targetListCompact {
    min-height: 0;
  }

  .shell.hasWarnings .list {
    min-height: 0;
  }

  .targetListCompact {
    min-height: 140px;
    overflow: auto;
  }

  .targetColumn label {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .previewBody.isCompare {
    white-space: normal;
    line-height: normal;
    padding: 0;
    border: none;
    background: transparent;
  }

  .comparePreview {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 12px;
    align-items: start;
    padding-right: 5px;
  }

  .compareBlock {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    padding: 10px 12px;
    background: var(--vscode-editor-background);
    min-width: 0;
    min-height: 0;
  }

  .compareLabel {
    font-size: 12px;
    font-weight: 700;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 6px;
  }

  .compareHeading {
    font-weight: 700;
    margin-bottom: 8px;
    line-height: 1.6;
    word-break: break-word;
  }

  .compareBody {
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.75;
  }

  @media (max-width: 900px) {
    .comparePreview {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 650px) {
    .comparePreview {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
  }

  .sourceGroupBlock {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .rowButton.isChild {
    margin-left: 10px;
    width: calc(100% - 10px);
  }

  .rowButton.isChild .rowTitle {
    font-weight: 500;
  }

  .childList {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .rowButton {
    width: 100%;
    text-align: left;
    border: 1px solid var(--vscode-panel-border);
    background: var(--vscode-sideBar-background);
    color: inherit;
    border-radius: 8px;
    padding: 10px;
    cursor: pointer;
  }

  .rowButton.isActive {
    outline: 1px solid var(--vscode-focusBorder);
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }

  .rowButton.isDone {
    opacity: 0.7;
  }

  .rowTop {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: start;
  }

  .rowTitle {
    font-weight: 600;
    min-width: 0;
  }

  .rowMeta {
    margin-top: 4px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }

  .rowLine {
    margin-top: 6px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rowBadge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.4;
    border: 1px solid var(--vscode-panel-border);
    color: var(--vscode-descriptionForeground);
    background: var(--vscode-editor-background);
    margin-right: 8px;
  }

  .rowTitleLine {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .previewNote {
    margin-top: 10px;
    padding: 10px 12px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    background: var(--vscode-editor-background);
    font-size: 12px;
    line-height: 1.7;
    color: var(--vscode-descriptionForeground);
  }

  .filterRow {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 120px;
    gap: 8px;
    margin-bottom: 10px;
  }

  .targetFormGrid {
    display: grid;
    grid-template-columns: 90px minmax(0, 1fr);
    gap: 10px 12px;
    align-items: center;
  }

  .targetFormGrid .muted {
    margin: 0;
  }

  .insertAroundPreview {
    margin-top: 12px;
    border-top: 1px solid var(--vscode-panel-border);
    padding-top: 12px;
    display: grid;
    gap: 10px;
  }

  .insertAroundRow {
    display: grid;
    grid-template-columns: 64px 1fr;
    gap: 10px;
    align-items: start;
  }

  .insertAroundLabel {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    font-weight: 600;
  }

  .insertAroundValue {
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.7;
    padding: 8px 10px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    background: var(--vscode-editor-background);
  }

  .footer {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 10;
    padding: 8px 0 8px 15px;
    background: var(--vscode-editor-background);
    border-top: 1px solid var(--vscode-panel-border);
  }

  input[type="text"],
  select {
    width: 100%;
    min-height: 34px;
    padding: 6px 10px;
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 8px;
    background: var(--vscode-input-background, var(--vscode-editor-background));
    color: var(--vscode-input-foreground, var(--vscode-foreground));
    box-sizing: border-box;
  }

  input[type="text"]:focus,
  select:focus {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: 0;
  }

  button {
    border: 1px solid var(--vscode-button-border, transparent);
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-radius: 8px;
    padding: 8px 12px;
    cursor: pointer;
  }

  button.secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }

  .headActions > button {
    padding: 6px 8px;
    font-size: 0.95em;
  }

  .modeTabs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .memoImportSummary {
    margin-top: 10px;
    padding: 8px 10px;
    border-left: 3px solid var(--vscode-focusBorder);
    border-radius: 4px;
    background: var(--vscode-textBlockQuote-background);
    color: var(--vscode-foreground);
    font-weight: 600;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }

  .memoImportOptions { display: flex; gap: 8px 16px; align-items: center; flex-wrap: wrap; margin-top: 10px; }
  .memoImportOptions[hidden] { display: none; }
  .memoImportOptions label { display: inline-flex; gap: 6px; align-items: center; cursor: pointer; }

  .modeTabs > button {
    padding: 6px 8px;
    font-size: 0.95em;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }

  .modeTabs > button.isActive {
    padding: 6px 8px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }

  .mobileJumpRow {
    display: none;
    gap: 8px;
    flex-wrap: wrap;
  }

  .mobileJumpRow > button {
    padding: 6px 8px;
    font-size: 0.9em;
  }

  .rowBadges {
    display: inline-flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-left: 8px;
  }

  .rowMiniBadge {
    display: inline-flex;
    align-items: center;
    padding: 0 6px;
    min-height: 18px;
    border-radius: 4px;
    font-size: 10px;
    line-height: 1.3;
    border: 1px solid var(--vscode-panel-border);
    background: transparent;
    color: var(--vscode-descriptionForeground);
  }

  .rowMiniBadge.attention {
    border-color: var(--vscode-editorWarning-foreground);
    color: var(--vscode-editorWarning-foreground);
  }

  .warning {
    border-left: 3px solid var(--vscode-editorWarning-foreground);
    padding-left: 10px;
    position: relative;
  }

  #warningDetails > summary {
    cursor: pointer;
    user-select: none;
    font-weight: 700;
    margin-bottom: 8px;
  }

  #warningDetails[open] > summary {
    margin-bottom: 10px;
  }

  .warningHint {
    margin-left: 8px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    font-weight: 400;
  }

  #warningList {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .warningItemBlock {
    line-height: 1.4;
  }

  .warningHeaderLine {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    line-height: 1.6;
  }

  .warningSample {
    margin-top: 8px;
    padding: 6px 8px;
    border-radius: 6px;
    background: var(--vscode-editor-background);
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.6;
  }

  .warningFlag {
    display: inline-flex;
    align-items: center;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 11px;
    line-height: 1.4;
    border: 1px solid var(--vscode-editorWarning-foreground);
    color: var(--vscode-editorWarning-foreground);
  }

  @media (max-width: 900px) {
    .previewBody {
      max-height: 100px;
    }

    .targetListCompact {
      max-height: 35vh;
    }
  }

  @media (max-width: 650px) {
    .layout {
      grid-template-columns: 1fr;
      grid-template-areas:
        "source"
        "right";
    }

    .rightColumn {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .filterRow {
      grid-template-columns: minmax(0, 1fr) 110px;
    }

    .mobileJumpRow {
      display: flex;
    }
  }
`;
}

module.exports = { getStyles };
