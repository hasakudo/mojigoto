function getStyles() {
  return `
  body {
    margin: 0;
    padding: 16px;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
  }

  .importShell {
    max-width: 1100px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .card {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 10px;
    background: var(--vscode-editorWidget-background);
    padding: 14px;
  }

  .muted {
    color: var(--vscode-descriptionForeground);
  }

  .memoImportChoice { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px; }
  .memoImportChoice label { display: flex; gap: 7px; align-items: center; cursor: pointer; }
  .memoImportExcluded { opacity: .65; }

  .importTopCard {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .importTopRow {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: start;
  }

  .importTopTitleRow {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: end;
  }

  .importTopTitle {
    display: flex;
    align-items: start;
    flex-wrap: wrap;
    gap: 15px;
  }

  .importTopMeta {
    display: flex;
    flex-direction: column;
    flex-wrap: wrap;
    gap: 6px;
  }

  .importHeaderTitle {
    font-size: 1.15rem;
    font-weight: 600;
    margin: 0;
  }

  .headerActions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
    
  .headerActions > button {
    padding: 6px 8px;
    font-size: 0.95em;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }

  .importTitleBlock {
    min-width: 0;
  }

  .label {
    display: block;
    margin-bottom: 6px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    font-weight: 600;
  }

  .textInput {
    width: 100%;
    min-width: 100px;
    box-sizing: border-box;
    padding: 8px 10px;
    border: 1px solid var(--vscode-input-border);
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border-radius: 8px;
  }

  .summaryCounts {
    display: grid;
    grid-template-columns: repeat(4, minmax(74px, 1fr));
    gap: 8px;
    align-self: start;
  }

  .summaryCountBox {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    padding: 8px 10px;
    background: var(--vscode-sideBar-background);
    min-width: 0;
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
  }

  .summaryCountLabel {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 2px;
    line-height: 1.2;
  }

  .summaryCountValue {
    font-size: 0.95rem;
    font-weight: 700;
    line-height: 1.2;
    text-align: right;
  }

  .previewHead {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }

  .btnbar {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  button {
    border: 1px solid var(--vscode-button-border, transparent);
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-radius: 8px;
    padding: 7px 12px;
    cursor: pointer;
  }

  button.secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }

  button.danger {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-errorForeground);
  }

  #warningsCollapsedCard {
    padding: 8px 14px;
  }

  .warningsHead {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .warningList {
    max-height: auto;
    line-height: 1.4;
  }

  .warningItem {
    border-left: 3px solid var(--vscode-editorWarning-foreground);
    padding: 4px 0 4px 10px;
  }

  .warningsHead > button {
    padding: 6px 8px;
    font-size: 0.95em;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }

  .warningHeaderLine {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
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

  .warningSample {
    margin-top: 6px;
    padding: 6px 8px;
    border-radius: 6px;
    background: var(--vscode-editor-background);
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
    white-space: pre-wrap;
    word-break: break-word;
  }

  .warningsCollapsedBar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .previewlist {
    max-height: calc(100vh - 300px);
    overflow: auto;
    padding-right: 10px;
  }

  .previewGroup {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 12px;
  }

  .previewGroupTitle {
    font-size: 1rem;
    font-weight: 700;
    margin-bottom: 10px;
  }

  .previewDivider {
    margin: 10px 0 6px;
    padding: 8px 0;
    border-radius: 8px;
    background: var(--vscode-sideBar-background);
  }

  .previewDividerLabel {
    font-weight: 600;
  }

  .previewDividerValue {
    margin-top: 4px;
    white-space: pre-wrap;
  }

  .previewEntry {
    border-top: 1px solid var(--vscode-panel-border);
    padding: 10px 8px;
  }

  .previewEntry:first-of-type {
    border-top: 0;
    padding-top: 0;
  }

  .previewEntryHead {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
  }

  .previewEntryTitle {
    font-weight: 600;
    min-width: 0;
  }

  .previewEntryLine {
    margin-top: 4px;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .previewEntryBody {
    margin-top: 8px;
    white-space: pre-wrap;
    line-height: 1.6;
  }

  .importActions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .inlineBadges {
    display: inline-flex;
    gap: 6px;
    margin-left: 8px;
    vertical-align: middle;
    flex-wrap: wrap;
  }

  .inlineBadge {
    display: inline-flex;
    align-items: center;
    padding: 1px 6px;
    border-radius: 999px;
    font-size: 11px;
    line-height: 1.4;
    border: 1px solid var(--vscode-panel-border);
    background: var(--vscode-editor-background);
    color: var(--vscode-descriptionForeground);
  }

  .inlineBadge.attention {
    color: var(--vscode-editorWarning-foreground);
  }

  @media (max-width: 620px) {
    .importTopRow {
      grid-template-columns: 1fr;
    }

    .summaryCounts {
      grid-template-columns: repeat(4, minmax(70px, 1fr));
      justify-self: start;
    }

    .previewlist {
      max-height: calc(100vh - 350px);
    }
  }

  @media (max-width: 500px) {
    .summaryCounts {
      grid-template-columns: repeat(2, minmax(70px, 1fr));
    }
    .previewlist {
      max-height: calc(100vh - 400px);
    }
  }
`;
}

module.exports = { getStyles };
