function getConceptMemoStyles() {
  return `
    body {
      margin: 0;
      font-family: var(--vscode-font-family);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
    }

    .app {
      display: grid;
      grid-template-columns: 350px 1fr;
      min-height: 100vh;
      height: 100vh;
    }

    .app.isSidebarCollapsed {
      grid-template-columns: 0 1fr;
      min-height: auto;
      align-items: start;
    }

    .app.isSidebarCollapsed .sidebar {
      width: 0;
      height: 0;
      min-height: 0;
      overflow: hidden;
      padding: 0;
      margin: 0;
      border: 0;
      opacity: 0;
      pointer-events: none;
    }

    .sidebar {
      border-right: 1px solid var(--vscode-panel-border);
      padding: 10px 10px 15px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
      min-height: 0;
      overflow: visible;
    }

    .main {
      padding: 10px 8px 16px 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
      min-height: 0;
    }

    .app.isSidebarCollapsed .main {
      align-self: start;
      padding: 10px 8px;
    }

    .row {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }

    .editorHeader {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .editorHeaderTop,
    .editorHeaderBottom {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .editorHeaderLeft {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: nowrap;
    }

    .editorHeaderActions {
      display: flex;
      align-items: stretch;
      gap: 8px;
      flex-wrap: nowrap;
      margin-left: auto;
    }

    .editorHeaderBottom {
      align-items: center;
      padding-left: 16px;
      margin-top: 8px;
    }

    .compactActionButton {
      min-width: 54px;
      min-height: 36px;
      padding: 5px 8px;
      display: inline-flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      line-height: 1.1;
    }

    .shortcutHint {
      display: block;
      font-size: 9px;
      line-height: 1.1;
      opacity: 0.62;
      margin-top: 1px;
    }

    @media (max-width: 980px) {
      .sidebar {
        padding: 8px 8px 16px 0;
      }

      .editorHeaderTop {
        align-items: flex-start;
        gap: 6px;
      }

      .editorHeaderActions {
        margin-left: 0;
        gap: 6px;
      }

      .editorHeaderBottom {
        gap: 6px;
        padding-left: 0;
        margin-top: 0;
      }

      .app {
        grid-template-columns: 300px 1fr;
      }
    }

    @media (max-width: 600px) {
      .editorHeaderTop {
        flex-direction: column;
        align-items: stretch;
        gap: 6px;
      }

      .editorHeaderActions {
        justify-content: flex-start;
        gap: 6px;
      }

      .editorHeaderBottom {
        gap: 6px;
      }
    }

    .editorContent {
      display: flex;
      flex-direction: column;
      flex-wrap: wrap;
      width: 100%;
      overflow: auto;
    }

    #editorPanel {
      display: flex;
      flex-direction: column;
      flex-wrap: wrap;
      padding: 10px 0 16px;
      gap: 8px;
      max-width: 1100px;
      margin: 0 auto;
    }

    @media (max-width: 900px) {
      .editorContent {
        padding: 5px 0 14px;
      }
    }

    .compactBox {
      padding: 10px 12px;
    }

    .compactBox .row:first-child {
      margin-bottom: 6px !important;
    }

    .compactCheck {
      display: flex;
      gap: 8px;
    }

    .compactHelpText {
      margin-top: 6px !important;
      font-size: 11px;
      opacity: 0.78;
    }

    .title {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    .box {
      padding: 12px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      background: var(--vscode-sideBar-background);
    }

    .empty {
      padding: 18px 12px;
      opacity: 0.8;
    }

    .muted {
      opacity: 0.8;
      font-size: 12px;
      word-break: break-all;
    }

    #memoListItemCount {
      font-weight: 600;
    }

    .memoLists {
      flex: 1 1 auto;
      overflow-y: auto;
      padding: 2px;
    }

    .memoList {
      display: grid;
      gap: 8px;
      min-height: 0;
    }

    .memoItem {
      padding: 10px 10px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      cursor: pointer;
    }

    .memoItem.isSelected {
      outline: 1px solid var(--vscode-focusBorder);
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }

    #memoType {
      width: 100%;
      max-width: 250px;
    }

    .memoMetaRow {
      margin-top: 5px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .memoUpdatedAt {
      font-size: 11px;
      opacity: 0.72;
    }

    .memoTitleRow {
      align-items: flex-start;
      flex-wrap: nowrap;
      gap: 10px;
    }

    .memoTitleField {
      min-width: 0;
    }

    #memoTitle,
    .app.isSidebarCollapsed #memoTitle {
      min-width: 600px;
    }

    @media (max-width: 980px) {
      #memoTitle {
        min-width: 0;
      }

      .memoTitleField {
        flex: 1 1 auto;
        min-width: 0;
      }
    }

    @media (max-width: 720px) {
      #memoTitle,
      .app.isSidebarCollapsed #memoTitle {
        min-width: 0;
      }
    }

    .memoEditorMenuArea {
      flex: 0 0 auto;
      padding-top: 22px;
      position: relative;
    }

    .editorMenuPopover {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      z-index: 30;
      min-width: 220px;
      padding: 6px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .editorMenuPopover[hidden],
    .editorSubmenu[hidden] {
      display: none !important;
    }

    .editorSubmenu {
      position: absolute;
      top: calc(100% + 6px);
      right: 228px;
      z-index: 31;
      min-width: 220px;
      padding: 8px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    }

    .submenuTitle {
      margin-bottom: 8px;
      font-size: 12px;
      opacity: 0.8;
    }

    .menuItemButton {
      width: 100%;
      min-height: 34px;
      padding: 6px 10px;
      border: 1px solid transparent;
      border-radius: 6px;
      background: transparent;
      color: var(--vscode-foreground);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      cursor: pointer;
      text-align: left;
    }

    .menuItemButton:hover {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-list-hoverBackground);
    }

    .menuItemValue {
      font-size: 11px;
      opacity: 0.72;
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .menuCheckRow {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 4px;
      padding: 6px 8px 2px;
    }

    @media (max-width: 720px) {
      .editorSubmenu {
        right: 0;
        top: calc(100% + 170px);
        min-width: min(240px, calc(100vw - 40px));
      }

      .editorMenuPopover {
        min-width: min(240px, calc(100vw - 40px));
      }
    }

    .memoListMenuArea {
      position: relative;
      display: flex;
      gap: 8px;
    }

    #memosidebar .memoListMenuArea {
      position: relative;
    }

    .listMenuPopover {
      position: absolute;
      top: 0;
      left: calc(100% + 8px);
      right: auto;
      z-index: 60;
      min-width: 280px;
      max-width: 320px;
      padding: 10px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    }

    .listMenuPopover[hidden] {
      display: none !important;
    }

    .sortPanelStack {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .sortDirectionRadios {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .sortRadioOption {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 999px;
      background: var(--vscode-editor-background);
      cursor: pointer;
    }

    .sortRadioOption:hover {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-list-hoverBackground);
    }

    .filterGroup {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 8px;
    }

    .filterGroup:first-of-type {
      margin-top: 0;
    }

    .filterGroupLabel {
      font-size: 11px;
      opacity: 0.76;
    }

    .filterChipRow {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .filterChip {
      padding: 4px 10px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 999px;
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      font-size: 11px;
      cursor: pointer;
    }

    .filterChip:hover {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-list-hoverBackground);
    }

    .filterChip.isActive {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
      font-weight: 600;
    }

    .filterChip.isDisabled {
      opacity: 0.45;
      cursor: default;
      pointer-events: none;
    }

    .filterChip.isDisabled:hover {
      border-color: var(--vscode-panel-border);
      background: var(--vscode-editor-background);
    }

    @media (max-width: 900px) {
      .listMenuPopover {
        top: calc(100% + 6px);
        left: 0;
        right: auto;
        min-width: min(280px, calc(100vw - 40px));
      }
    }

    @media (max-width: 720px) {
      .listMenuPopover {
        right: auto;
        left: 0;
        min-width: min(260px, calc(100vw - 40px));
      }
    }

    .listStateBadge {
      display: inline-flex;
      align-items: center;
      padding: 1px 8px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 999px;
      font-size: 10px;
      line-height: 1.5;
      white-space: nowrap;
      background: var(--vscode-editor-background);
      color: var(--vscode-descriptionForeground);
      opacity: 0.88;
    }

    .listStateBadge.isClickable {
      cursor: pointer;
    }

    .listStateBadge.isArchived:hover,
    .listStateBadge.isClickable:hover {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-list-hoverBackground);
      color: var(--vscode-foreground);
      opacity: 1;
    }

    .memoCardHeader {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }

    .memoCardTitle {
      min-width: 0;
      font-weight: 600;
      word-break: break-word;
    }

    .memoBadgeRow {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 6px;
    }

    .pinToggleButton {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 999px;
      background: transparent;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
      flex: 0 0 auto;
      transition:
        background 0.15s ease,
        border-color 0.15s ease,
        color 0.15s ease,
        opacity 0.15s ease;
      opacity: 0.82;
    }

    .pinToggleButton:hover {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-list-hoverBackground);
      color: var(--vscode-foreground);
      opacity: 1;
    }

    .pinToggleButton.isPinned {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
      opacity: 1;
    }

    .todoItemRow {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      background: var(--vscode-editor-background);
    }

    .todoItemText {
      flex: 1 1 auto;
      word-break: break-word;
    }

    .todoItemText.isDone {
      opacity: 0.7;
      text-decoration: line-through;
    }

    .todoMetaText {
      display: inline-flex;
      align-items: center;
      padding: 0 6px;
      min-height: 18px;
      border-radius: 6px;
      font-size: 11px;
      line-height: 1.4;
      white-space: nowrap;
      background: transparent;
      color: var(--vscode-descriptionForeground);
    }

    .todoMetaText.isActive {
      background: transparent;
      color: var(--vscode-foreground);
      font-weight: 600;
    }

    .todoMetaText.isDone {
      opacity: 0.75;
    }

    .tagList {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 6px;
    }

    .tagChip {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 999px;
      font-size: 11px;
      opacity: 0.88;
      background: var(--vscode-editor-background);
    }

    .tagChip.isClickable {
      cursor: pointer;
    }

    .tagChip:hover {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-list-hoverBackground);
      color: var(--vscode-foreground);
      opacity: 1;
    }

    .tagSuggestions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
    }

    .tagSuggestionChip {
      padding: 2px 8px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 999px;
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      cursor: pointer;
      font-size: 11px;
    }

    .tagSuggestionChip:hover {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-list-hoverBackground);
    }

    .tagSuggestionsBlock {
      margin-top: 8px;
    }

    .tagSuggestionLabel {
      margin-bottom: 6px;
      font-size: 11px;
      opacity: 0.72;
    }

    .iconButton {
      padding: 4px 7px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      cursor: pointer;
    }

    .pushButton {
      width: 30px;
      height: 30px;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    #openSearchPanelButton {
      font-size: 1.6em;
    }

    #memoEditorMoreButton {
      width: 35px;
      height: 35px;
      display: flex;
      justify-content: center;
      align-items: center;
      margin-top: 3px;
    }

    .button {
      padding: 6px 10px;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 6px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
    }

    .button.secondary {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-color: var(--vscode-panel-border);
    }

    .button.secondary.dangerButton {
      min-width: 50px;
      border-color: var(--vscode-errorForeground);
      color: var(--vscode-errorForeground);
    }

    .button.secondary.dangerButton:hover {
      border-color: var(--vscode-errorForeground);
      background: var(--vscode-list-hoverBackground);
    }

    .input,
    .textarea {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 6px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      padding: 8px 10px;
      font: inherit;
    }

    .textarea {
      min-height: 440px;
      resize: vertical;
      line-height: 1.6;
    }

    @media (max-width: 980px) {
      .textarea {
        min-height: 400px;
      }
    }

    .stateBadgeRow {
      display: flex;
      align-items: center;
      gap: 5px;
      flex-wrap: wrap;
    }

    .saveStatus {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      padding: 0 10px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 999px;
      font-size: 12px;
      white-space: nowrap;
      background: var(--vscode-editor-background);
      color: var(--vscode-descriptionForeground);
    }

    .saveStatus.isDirty {
      border-color: var(--vscode-inputValidation-warningBorder, var(--vscode-focusBorder));
      background: var(--vscode-inputValidation-warningBackground, var(--vscode-editorWidget-background));
      color: var(--vscode-editorWarning-foreground, var(--vscode-foreground));
      font-weight: 600;
    }

    .saveStatus.isError {
      border-color: var(--vscode-inputValidation-errorBorder, var(--vscode-panel-border));
      background: var(--vscode-inputValidation-errorBackground, var(--vscode-editorWidget-background));
      color: var(--vscode-errorForeground, var(--vscode-foreground));
      font-weight: 600;
    }

    .stateBadge:hover {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-list-hoverBackground);
    }

    .stateBadge.isOff {
      background: transparent;
      color: var(--vscode-descriptionForeground);
    }

    .stateBadge.isOn {
      font-weight: 600;
    }

    .stateBadge.isPinned.isOn {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }
      
    .stateBadge.isArchived.isOn {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-editor-inactiveSelectionBackground, var(--vscode-list-hoverBackground));
      color: var(--vscode-foreground);
    }

    .sourceSummaryRow {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .sourceSummaryText.isInactive {
      text-decoration: line-through;
      opacity: 0.72;
    }

    .sourceStatusBadge {
      display: inline-flex;
      align-items: center;
      padding: 1px 8px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 999px;
      font-size: 10px;
      line-height: 1.5;
      white-space: nowrap;
      opacity: 0.9;
    }

    .sourceStatusBadge.isCleared {
      color: var(--vscode-descriptionForeground);
    }

    .sourceStatusBadge.isMissing {
      color: var(--vscode-errorForeground);
      border-color: var(--vscode-errorForeground);
    }

    .toastMessage {
      position: fixed;
      top: 60px;
      right: 10%;
      z-index: 1000;
      max-width: 360px;
      padding: 10px 12px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      background: var(--vscode-notifications-background, var(--vscode-editorWidget-background));
      color: var(--vscode-notifications-foreground, var(--vscode-editorWidget-foreground));
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
      opacity: 0;
      pointer-events: none;
      transform: translateY(-6px);
      transition: opacity 0.18s ease, transform 0.18s ease;
    }

    .toastMessage.isVisible {
      opacity: 1;
      transform: translateY(0);
    }

    .toastMessage.isError {
      border-color: var(--vscode-inputValidation-errorBorder, var(--vscode-panel-border));
    }

    .countSubtle {
      line-height: 1.4;
    }

    .countSummaryStrong {
      font-weight: 500;
      line-height: 1.4;
    }

    .workTitleLabel {
      font-size: 12px;
      opacity: 0.85;
    }

    .app.isNarrowLayout {
      grid-template-columns: 1fr;
    }

    .app.isNarrowLayout .sidebar,
    .app.isNarrowLayout .main {
      min-width: 0;
      width: 100%;
    }

    .app.isNarrowLayout.showListOnly .sidebar {
      display: flex;
    }

    .app.isNarrowLayout.showListOnly .main {
      display: none;
    }

    .app.isNarrowLayout.showEditorOnly .sidebar {
      display: none;
    }

    .app.isNarrowLayout.showEditorOnly .main {
      display: flex;
    }

    .spacer {
      flex: 1 1 auto;
    }
  `;
}

module.exports = {
  getConceptMemoStyles,
};
