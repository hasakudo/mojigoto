function makeStatsStyles() {
  return `
    :root {
      --mg-bg: var(--vscode-editor-background);
      --mg-fg: var(--vscode-editor-foreground);
      --mg-muted: var(--vscode-descriptionForeground);
      --mg-border: var(--vscode-panel-border);
      --mg-card-bg: var(--vscode-sideBar-background);
      --mg-soft-bg: var(--vscode-input-background);
      --mg-hover-bg: var(--vscode-list-hoverBackground);
      --mg-active-bg: var(--vscode-list-activeSelectionBackground);
      --mg-active-fg: var(--vscode-list-activeSelectionForeground);
      --mg-button-bg: var(--vscode-button-background);
      --mg-button-fg: var(--vscode-button-foreground);
      --mg-button-hover: var(--vscode-button-hoverBackground);
      --mg-focus: var(--vscode-focusBorder);
      --mg-widget-bg: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
      --mg-widget-fg: var(--vscode-editorWidget-foreground, var(--vscode-editor-foreground));
    }
    body{
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      margin:0;
      padding:16px;
      color:var(--mg-fg);
      background:var(--mg-bg);
    }
    .statsHeader {
      display:flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
    }
    .statsHeaderActions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    h1{ font-size:16px; margin:0 0 12px; }
    .row{ display:flex; gap:12px; flex-wrap:wrap; margin:10px 0 16px; }
    .card{
      background:var(--mg-card-bg);
      border:1px solid var(--mg-border);
      border-radius:10px;
      padding:12px;
      min-width:280px;
      flex:1;
    }
    .muted{
      color:var(--mg-muted);
      font-size:12px;
    }

    table{ width:100%; border-collapse:collapse; }
    th, td{
      padding:6px 8px;
      border-bottom:1px solid var(--mg-border);
      font-size:13px;
    }
    th{
      text-align:left;
      color:var(--mg-muted);
      font-weight:600;
    }

    .num{ text-align:right; font-variant-numeric: tabular-nums; }
    ul{ margin:8px 0 0; padding-left:18px; }
    
    button{
      background:var(--mg-soft-bg);
      color:var(--mg-fg);
      border:1px solid var(--mg-border);
      border-radius:8px;
      padding:7px 10px;
      cursor:pointer;
    }
    button:hover{
      background:var(--mg-hover-bg);
    }

    select{
      background:var(--mg-soft-bg);
      color:var(--mg-fg);
      border:1px solid var(--mg-border);
      border-radius:8px;
      padding:6px 10px;
    }

    .mojigoto-actions{ display:flex; gap:10px; align-items:center; margin:10px 0 14px; }
    .btnbar{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:25px; }
    .btnbar button{
      min-width:100px;
    }
    .btn{
      padding:6px 10px;
      border:1px solid var(--mg-border);
      border-radius:6px;
      background:transparent;
      color: var(--mg-fg);
      cursor:pointer;
    }
    .btn:disabled{ opacity:.6; cursor:default; }
    .status{
      display:inline-block;
      opacity:.8;
      font-size:12px;
      padding-top: 8px;
    }
    .statsHint {
      margin:4px 0 0;
      padding: 0;
      font-size:12px;
      opacity:0.8;
    }
    .chip{
      display:inline-block;
      padding:2px 8px;
      border:1px solid var(--mg-border);
      border-radius:999px;
      font-size:12px;
      color:var(--mg-muted);
      background: var(--mg-card-bg);
    }

    .tabbar { display:flex; gap:8px; margin:0 0 12px; }
    .tab-btn {
      background: transparent;
      color: var(--mg-muted);
      border: 1px solid var(--mg-border);
      border-radius: 999px;
      padding: 6px 12px;
      cursor: pointer;
    }
    .tab-btn.is-active {
      color: var(--mg-muted);
      border-color: var(--mg-focus);
    }
    .tab-panel { display:none; }
    .tab-panel.is-active { display:block; }

    .highlight-group-row:hover,
    .highlight-detail-row:hover {
      background: var(--mg-hover-bg);
    }
    .hl-inline-hit {
      background: rgba(255, 220, 120, 0.45);
      border-radius: 2px;
      padding: 0 1px;
    }
    .highlight-group-row.is-selected {
      background: var(--mg-active-bg);
      border-left: 3px solid var(--mg-focus);
    }
    .highlight-group-row.is-selected td { font-weight:600; }
    .highlight-heading-row td:last-child {
      font-weight: 600;
    }
    .highlight-heading-row.is-level-2 td:last-child {
      padding-left: 30px;
    }
    .highlight-heading-row.is-level-3 td:last-child {
      padding-left: 52px;
    }
    .highlightHeadingLevel {
      display: inline-block;
      min-width: 22px;
      margin-right: 7px;
      color: var(--mg-muted);
      font-size: 10px;
      font-weight: 700;
    }
    .highlightHeadingText {
      overflow-wrap: anywhere;
    }
    .headingBatchToolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 10px;
      padding: 9px 10px;
      border: 1px solid var(--mg-border);
      border-radius: 8px;
      background: var(--mg-soft-bg);
    }
    .headingBatchToolbarText {
      margin-right: 4px;
      font-size: 12px;
      font-weight: 600;
    }
    .headingBatchLevelLabel {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: var(--mg-muted);
      font-size: 12px;
    }
    .headingBatchToolbar button {
      padding: 5px 8px;
    }
    .headingBatchToolbar button:disabled {
      cursor: default;
      opacity: 0.5;
    }
    .headingBatchSelectedCount {
      color: var(--mg-muted);
      font-size: 11px;
      font-variant-numeric: tabular-nums;
    }
    .headingBatchHint {
      margin-top: 5px;
    }
    .headingBatchCheckCell {
      width: 42px;
      text-align: center;
    }
    .headingBatchCheckCell input {
      cursor: pointer;
    }

    .dashboardSectionTitle {
      font-size: 13px;
      font-weight: 700;
      color: var(--mg-fg);
      margin-bottom: 10px;
    }
    .dashboardSectionList {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .dashboardNoteItem {
      position: relative;
      margin: 8px 0;
      padding: 10px 12px;
      border: 1px solid var(--mg-border);
      border-radius: 8px;
      cursor: pointer;
      list-style: none;
      background: var(--mg-soft-bg);
      transition:
        background 0.15s ease,
        border-color 0.15s ease;
    }
    .dashboardNoteItem:hover {
      background: var(--mg-hover-bg);
      border-color: var(--mg-focus);
    }
    .dashboardNoteItem.is-pinned {
      border-color: var(--mg-focus);
    }
    .dashboardNoteTitle {
      padding-right: 22px;
      font-weight: 700;
      color: var(--mg-fg);
      line-height: 1.4;
      margin: 0;
    }
    .dashboardNotePreview {
      margin-top: 4px;
      color: var(--mg-muted);
      font-size: 12px;
      line-height: 1.5;
      word-break: break-word;
    }
    .dashboardNotePreview.is-single-line {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dashboardSectionFooter {
      margin-top: 8px;
    }
    .dashboardMoreButton {
      padding: 4px 8px;
      font-size: 12px;
    }
    .dashboardPinnedMark {
      position: absolute;
      top: 9px;
      right: 10px;
      font-size: 13px;
      line-height: 1;
      opacity: 0.9;
    }

    .dashboardScopeNotice {
      margin: 0 0 8px;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      color: var(--mg-muted);
      font-size: 12px;
      font-weight: 600;
      line-height: 1.5;
    }
    .dashboardSummaryCard {
      margin: 0 0 14px;
    }
    .dashboardSummarySplit {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }
    .dashboardSummaryCol {
      min-width: 0;
    }
    .dashboardSummaryCol + .dashboardSummaryCol {
      border-left: 1px solid var(--mg-border);
      padding-left: 24px;
    }
    .dashboardWorkTitleBlock {
      margin: 8px 0 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--mg-border);
    }
    .dashboardWorkTitleLabel {
      margin-bottom: 4px;
      font-size: 12px;
      color: var(--mg-muted);
      font-weight: 600;
    }
    .dashboardWorkTitleValue {
      font-size: 13px;
      font-weight: 600;
      line-height: 1.5;
      word-break: keep-all;
      overflow-wrap: break-word;
    }
    .dashboardSubsectionLabel {
      margin: 10px 0 6px;
      font-size: 12px;
      color: var(--mg-muted);
      font-weight: 600;
    }
    .dashboardSummaryCard table {
      table-layout: fixed;
    }
    .dashboardSummaryCard th {
      width: 140px;
      white-space: nowrap;
    }
    .dashboardSummaryCard td {
      word-break: normal;
      overflow-wrap: anywhere;
    }
    .dashboardShareAction {
      display: flex;
      justify-content: flex-start;
      margin-top: 12px;
    }
    .dashboardProgressHead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
    }
    .dashboardProgressHead .dashboardSubsectionLabel {
      margin: 0;
    }
    .dashboardProgressToggle {
      flex: 0 0 auto;
    }
    .dashboardProgressActions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      flex-wrap: wrap;
    }
    .dashboardProgressActions select {
      max-width: 120px;
      padding: 4px 6px;
      border: 1px solid var(--mg-border);
      border-radius: 6px;
      background: var(--vscode-dropdown-background, var(--mg-card-bg));
      color: var(--mg-fg);
    }
    .dashboardProgressMeta,
    .dashboardProgressFooter {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      color: var(--mg-muted);
      font-size: 11px;
      font-variant-numeric: tabular-nums;
    }
    .dashboardProgressMeta {
      flex-wrap: wrap;
      margin-bottom: 6px;
    }
    .dashboardProgressMeta strong {
      color: var(--mg-fg);
      font-size: 12px;
    }
    .dashboardProgressChart {
      position: relative;
      height: 142px;
      min-width: 0;
      padding: 8px 4px 0;
      box-sizing: border-box;
      border-bottom: 1px solid var(--mg-border);
      background: repeating-linear-gradient(
        to top,
        transparent 0,
        transparent 34px,
        var(--mg-border) 35px
      );
      overflow: hidden;
    }
    .dashboardProgressBars {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: stretch;
      justify-content: space-around;
      gap: 5px;
      height: 100%;
    }
    .dashboardProgressBarItem {
      flex: 1 1 0;
      min-width: 22px;
      max-width: 54px;
      display: grid;
      grid-template-rows: minmax(0, 1fr) auto auto;
      align-items: end;
      text-align: center;
    }
    .dashboardProgressBarTrack {
      align-self: stretch;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      min-height: 0;
    }
    .dashboardProgressBarTrack.is-daily {
      position: relative;
      align-items: initial;
    }
    .dashboardProgressBarTrack.is-daily::after {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      top: 50%;
      border-top: 1px solid var(--mg-border);
      pointer-events: none;
    }
    .dashboardProgressBar {
      width: min(70%, 30px);
      min-height: 0;
      border-radius: 4px 4px 0 0;
      background: var(--mg-button-bg);
      opacity: 0.86;
    }
    .dashboardProgressBarTrack.is-daily .dashboardProgressBar {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
    }
    .dashboardProgressBarTrack.is-daily .dashboardProgressBar.is-positive {
      bottom: 50%;
    }
    .dashboardProgressBarTrack.is-daily .dashboardProgressBar.is-negative {
      top: 50%;
      border-radius: 0 0 4px 4px;
      background: var(--vscode-charts-red, #c94f4f);
    }
    .dashboardProgressBarValue {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--mg-fg);
      font-size: 9px;
      line-height: 1.35;
      white-space: nowrap;
    }
    .dashboardProgressBarDate {
      color: var(--mg-muted);
      font-size: 9px;
      line-height: 1.35;
      white-space: nowrap;
    }
    .dashboardProgressGoalLine {
      position: absolute;
      left: 4px;
      right: 4px;
      z-index: 3;
      border-top: 1px dashed var(--vscode-charts-orange, #d97706);
      pointer-events: none;
    }
    .dashboardProgressGoalLine span {
      position: absolute;
      top: -15px;
      right: 0;
      color: var(--vscode-charts-orange, #d97706);
      font-size: 9px;
    }
    .dashboardProgressEmpty {
      align-self: center;
      width: 100%;
      color: var(--mg-muted);
      font-size: 12px;
      text-align: center;
    }
    .dashboardProgressFooter {
      margin-top: 6px;
      flex-wrap: wrap;
    }
    .dashboardControlsBar {
      margin: 0 0 14px;
      padding: 10px 12px;
      border: 1px solid var(--mg-border);
      border-radius: 10px;
      background: var(--mg-card-bg);
    }
    .dashboardControlsMain {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .dashboardControlsGroup {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .dashboardControlsLabel {
      font-size: 12px;
      color: var(--mg-muted);
      font-weight: 600;
    }
    .dashboardVisibilityChips {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .dashboardControlsActions {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
    }
    .dashboardNotesTopRow,
    .dashboardNotesBottomRow {
      margin: 0 0 14px;
    }
    .dashboardNotesBottomRow .card {
      flex: 1 1 auto;
      min-width: 0;
    }
    #dashboardTabPanel .card {
      padding: 14px;
    }
    #dashboardTabPanel .dashboardSectionTitle {
      margin-bottom: 12px;
    }
    #dashboardTabPanel .dashboardNoteItem {
      margin: 10px 0;
      padding: 12px 14px;
    }
    @media (max-width: 720px) {
      .dashboardSummarySplit {
        grid-template-columns: 1fr;
        gap: 16px;
      }
      .dashboardSummaryCol + .dashboardSummaryCol {
        border-left: 0;
        border-top: 1px solid var(--mg-border);
        padding-left: 0;
        padding-top: 16px;
      }
    }

    .dashboardModalOverlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 20px;
    }
    .dashboardModalOverlay.is-open {
      display: flex;
    }
    .dashboardModal {
      width: min(760px, 100%);
      max-height: min(80vh, 900px);
      overflow: auto;
      background: var(--mg-widget-bg);
      color: var(--mg-widget-fg);
      border: 1px solid var(--mg-border);
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
    }
    .dashboardModalSource {
      margin-top: 8px;
      font-size: 12px;
      color: var(--mg-muted);
      line-height: 1.5;
      word-break: break-word;
    }
    .dashboardModalHeader {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 12px;
    }
    .dashboardModalTitleWrap {
      flex: 1 1 auto;
      min-width: 0;
    }
    .dashboardModalTitle {
      font-size: 16px;
      font-weight: 700;
      margin: 0;
      word-break: break-word;
    }
    .dashboardModalMeta {
      margin-top: 4px;
      color: var(--mg-muted);
      font-size: 12px;
    }
    .dashboardModalClose {
      flex: 0 0 auto;
    }
    .dashboardModalBody {
      line-height: 1.75;
      word-break: break-word;
    }
    .dashboardModalText {
      white-space: pre-wrap;
    }
    .dashboardModalActions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 14px;

    }

    .dashboardModalList {
      margin: 0;
      padding-left: 18px;
    }
    .dashboardModalList li {
      margin: 6px 0;
    }

    .dashboardTodoList {
      display: grid;
      gap: 8px;
    }
    .dashboardTodoItem {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border: 1px solid var(--mg-border);
      border-radius: 8px;
      background: var(--mg-bg);
      cursor: pointer;
    }
    button.dashboardTodoItem {
      width: 100%;
      box-sizing: border-box;
      color: var(--mg-fg);
      font: inherit;
      text-align: left;
    }
    .dashboardTodoItem:hover {
      background: var(--mg-hover-bg);
      border-color: var(--mg-focus);
    }
    .dashboardTodoItemText.is-done {
      text-decoration: line-through;
      opacity: 0.7;
    }
    .dashboardTodoCheck {
      opacity: 0.9;
    }

    .dashboardModalTags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
    }
    .dashboardModalTag {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border: 1px solid var(--mg-border);
      border-radius: 999px;
      font-size: 11px;
      color: var(--mg-muted);
      background: var(--mg-bg);
    }

    .progressShareModal {
      width: min(980px, 100%);
      max-height: min(90vh, 960px);
    }
    .progressShareEyebrow {
      margin-bottom: 3px;
      color: var(--mg-muted);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.18em;
    }
    .progressShareLayout {
      display: grid;
      grid-template-columns: minmax(160px, 190px) minmax(0, 1fr);
      gap: 16px;
      align-items: start;
    }
    .progressShareOptions {
      display: grid;
      gap: 8px;
      padding: 12px;
      border: 1px solid var(--mg-border);
      border-radius: 10px;
      background: var(--mg-soft-bg);
    }
    .progressShareOptionsTitle {
      margin-bottom: 2px;
      color: var(--mg-muted);
      font-size: 11px;
      font-weight: 700;
    }
    .progressShareDateField {
      display: grid !important;
      gap: 5px !important;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--mg-border);
      font-weight: 700;
    }
    .progressShareDateField input { width: 100%; }
    .progressShareDateField select { width: 100%; }
    .progressShareOptions label[hidden] { display: none !important; }
    .progressShareRetentionHelp { position: relative; justify-self: end; }
    .progressShareRetentionHelp > summary { display: grid; width: 25px; height: 25px; place-items: center; border: 1px solid var(--mg-border); border-radius: 50%; color: var(--mg-button-bg); background: var(--mg-widget-bg); font-weight: 800; cursor: pointer; list-style: none; }
    .progressShareRetentionHelp > summary::-webkit-details-marker { display: none; }
    .progressShareRetentionHelp > div { position: absolute; top: 31px; right: 0; z-index: 5; width: min(310px, 70vw); padding: 10px 12px; border: 1px solid var(--mg-border); border-radius: 9px; color: var(--mg-widget-fg); background: var(--mg-widget-bg); box-shadow: 0 8px 24px rgb(0 0 0 / 18%); font-size: 11px; line-height: 1.6; }
    .progressShareOptions label {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 12px;
      line-height: 1.5;
      cursor: pointer;
    }
    .progressShareWorkBreakdown {
      display: grid;
      gap: 6px;
      margin-top: 16px;
      padding: 12px 14px;
      border: 1px solid #c9dce3;
      border-radius: 10px;
      background: #fff;
    }
    .progressShareWorkBreakdownTitle { color: #456d7b; font-size: 12px; font-weight: 700; }
    .progressShareWorkBreakdownRow { display: flex; justify-content: space-between; gap: 16px; font-size: 13px; }
    .progressShareWorkBreakdownRow strong { color: #005990; white-space: nowrap; }
    .progressSharePreviewStage {
      display: flex;
      justify-content: center;
      align-items: flex-start;
      min-width: 0;
      max-height: min(60vh, 640px);
      box-sizing: border-box;
      overflow: auto;
      padding: 16px;
      border: 1px solid var(--mg-border);
      border-radius: 12px;
      background: var(--mg-soft-bg);
    }
    .progressSharePreviewScaler {
      position: relative;
      flex: 0 0 auto;
      width: 480px;
      height: 640px;
    }
    .progressShareCard {
      position: absolute;
      inset: 0 auto auto 0;
      box-sizing: border-box;
      width: 480px;
      height: auto;
      display: flex;
      flex-direction: column;
      padding: 22px;
      overflow: hidden;
      border: 1px solid #c9dce3;
      border-radius: 14px;
      color: #123f52;
      background: #f7fafb;
    }
    .progressShareCardTop {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .progressShareCardBrand {
      display: flex;
      align-items: center;
      gap: 9px;
      color: #1a5d78;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }
    .progressShareCardLogo {
      width: 40px;
      height: 40px;
      display: block;
      border-radius: 8px;
    }
    .progressShareCardDate {
      color: #456d7b;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }
    .progressShareCardContent {
      width: 100%;
      margin: 18px 0 0;
    }
    .progressShareCardTitle {
      margin: 14px 0 2px;
      font-size: 22px;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }
    .progressShareGraph {
      margin-top: 14px;
    }
    .progressShareGraphLabel {
      margin-bottom: 6px;
      color: #456d7b;
      font-size: 11px;
      font-weight: 700;
    }
    .progressShareBars {
      height: 125px;
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 8px;
      align-items: end;
      padding: 12px 10px 8px;
      border-radius: 14px;
      background: #eef5f7;
    }
    .progressShareBars.is-monthly {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
    .progressShareBars.is-annual {
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: 3px;
      padding-right: 6px;
      padding-left: 6px;
    }
    .progressShareBarItem {
      min-width: 0;
      height: 100%;
      display: grid;
      grid-template-rows: 20px minmax(0, 1fr) 18px;
      row-gap: 5px;
      align-items: end;
      text-align: center;
    }
    .progressShareBarValue,
    .progressShareBarDate {
      overflow: hidden;
      color: #456d7b;
      font-size: 9px;
      font-variant-numeric: tabular-nums;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .progressShareBarTrack {
      width: min(60%, 34px);
      height: 100%;
      display: flex;
      align-items: flex-end;
      justify-self: center;
      border-radius: 1px;
      background: transparent;
    }
    .progressShareBar {
      width: 100%;
      min-height: 2px;
      border-radius: 1px;
      background: #005990;
    }
    .progressShareBar.is-negative {
      background: linear-gradient(180deg, #bd8790, #8b4c58);
    }
    .progressShareMetrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: 9px;
      margin-top: 12px;
    }
    .progressShareMetrics.is-count-1 {
      grid-template-columns: 1fr;
    }
    .progressShareMetrics.is-count-2,
    .progressShareMetrics.is-count-3,
    .progressShareMetrics.is-count-4,
    .progressShareMetrics.is-count-5 {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .progressShareMetric {
      min-width: 0;
      padding: 9px 11px;
      border: 1px solid #c9dce3;
      border-radius: 12px;
      background: #fff;
    }
    .progressShareMetric span {
      display: block;
      margin-bottom: 4px;
      color: #456d7b;
      font-size: 10px;
      font-weight: 700;
    }
    .progressShareMetric strong {
      display: block;
      color: #005990;
      font-size: 22px;
      font-variant-numeric: tabular-nums;
      line-height: 1.25;
    }
    .progressShareMetric small {
      display: block;
      margin-top: 2px;
      color: #456d7b;
      font-size: 9px;
    }
    .progressShareCardFoot {
      margin-top: 18px;
      padding-top: 10px;
      color: #1a5d78;
      font-size: 11px;
      font-weight: 700;
      text-align: right;
    }
    .progressShareFooter {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 10px;
      color: var(--mg-muted);
      font-size: 11px;
    }
    .progressShareOutputActions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .progressShareLogoSource {
      position: fixed;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    }
    @media (max-width: 720px) {
      .progressShareModalOverlay {
        padding: 8px;
      }
      .progressShareModal {
        max-height: 94vh;
        padding: 12px;
      }
      .progressShareModalHeader {
        margin-bottom: 8px;
      }
      .progressShareLayout {
        grid-template-columns: 1fr;
        gap: 10px;
      }
      .progressShareOptions {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px 10px;
      }
      .progressShareOptionsTitle {
        grid-column: 1 / -1;
      }
      .progressSharePreviewStage {
        padding: 8px;
      }
    }

    .statsControlsBar {
      padding: 12px 14px;
    }
    .statsControlsHeader {
      margin-bottom: 6px;
    }
    .statsControlsTopRow {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .statsControlsRight {
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      flex: 1 1 auto;
      min-width: 180px;
    }
    .statsBtnbar {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
      margin-bottom: 8px;
    }
    .statsControlsLeft button,
    .statsControlsRight button {
      min-width: 140px;
    }
    .statsControlsBody .status {
      padding-top: 0;
    }
    @media (max-width: 720px) {
      .statsControlsTopRow {
        grid-template-columns: 1fr,
        flex-direction: column;
        align-items: stretch;
      }
      .statsControlsLeft,
      .statsControlsRight {
        width: 100%;
        min-width: 0;
      }
      .statsControlsLeft {
        flex-direction: column;
        align-items: stretch;
      }
      .statsControlsRight {
        justify-content: stretch;
      }
      .statsControlsLeft button,
      .statsControlsRight button {
        width: 100%;
        min-width: 0;
      }
    }

    .collapsibleSection {
      margin-top: 14px;
    }
    .collapsibleToggle {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 12px;
      background: var(--mg-card-bg);
      color: var(--mg-fg);
      border: 1px solid var(--mg-border);
      border-radius: 10px;
      cursor: pointer;
      font: inherit;
      text-align: left;
    }
    .collapsibleToggle:hover {
      background: var(--mg-hover-bg);
    }
    .collapsibleToggleLabel {
      font-weight: 700;
    }
    .collapsibleToggleIcon {
      color: var(--mg-muted);
      font-size: 12px;
      flex: 0 0 auto;
    }
    .collapsibleBody {
      display: none;
      margin-top: 8px;
    }
    .collapsibleBody.is-open {
      display: block;
    }

    .writingMemoHeader {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .writingMemoHeaderActions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .writingMemoHeaderActions > button {
      min-width: 132px;
      justify-content: center;
    }
    .writingMemoHeaderActions > button.is-busy {
      opacity: 0.72;
      cursor: wait;
    }
    .writingMemoTargetPath {
      margin-top: 4px;
      font-size: 12px;
      color: var(--mg-muted);
      word-break: break-word;
    }
    .writingMemoList {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .writingMemoItem {
      margin: 8px 0;
      padding: 10px 12px;
      border: 1px solid var(--mg-border);
      border-radius: 8px;
      background: var(--mg-soft-bg);
      cursor: pointer;
    }
    .writingMemoItem:hover {
      background: var(--mg-hover-bg);
      border-color: var(--mg-focus);
    }
    .writingMemoItem.is-done {
      opacity: 0.6;
    }
    .writingMemoItem.is-archived {
      opacity: 0.72;
    }
    .writingMemoItemHeader {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .writingMemoBody {
      margin-top: 6px;
      font-size: 12px;
      color: var(--mg-muted);
      line-height: 1.5;
      word-break: break-word;
    }
    .writingMemoExcerpt {
      flex: 1 1 auto;
      min-width: 0;
      font-size: 13px;
      font-weight: 700;
      color: var(--mg-fg);
      line-height: 1.5;
      word-break: break-word;
    }

    .writingMemoExcerptChanged {
      display: inline-block;
      margin-left: 6px;
      padding: 1px 6px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      opacity: 0.8;
      border: 1px solid var(--vscode-badge-background);
      cursor: help;
    }

    .writingMemoExcerptWrap {
      flex: 1 1 auto;
      min-width: 0;
    }

    .writingMemoFileName {
      margin-bottom: 2px;
      font-size: 11px;
      color: var(--mg-muted);
      line-height: 1.4;
      word-break: break-word;
    }
    .writingMemoMeta {
      margin-top: 2px;
      font-size: 11px;
      color: var(--mg-muted);
      opacity: 0.9;
    }
    .writingMemoHint {
      margin-left: 2px;
      font-size: 9px;
      color: var(--mg-muted);
      opacity: 0.9;
    }
    .writingMemoLinkedBadge {
      display: inline-block;
      margin-left: 8px;
      padding: 1px 6px;
      border-radius: 999px;
      font-size: 11px;
      line-height: 1.6;
      color: var(--vscode-descriptionForeground);
      border: 1px solid var(--vscode-descriptionForeground);
    }

    .writingMemoDoneSection {
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px solid var(--mg-border);
    }
    .writingMemoDoneToggle {
      width: 100%;
      text-align: left;
      padding: 6px 4px;
      font-size: 12px;
      color: var(--mg-muted);
      background: transparent;
      border: 0;
      cursor: pointer;
    }
    .writingMemoDoneToggle:hover {
      color: var(--mg-fg);
    }
    .writingMemoDoneList.is-collapsed {
      display: none;
    }

    .writingMemoMiniAction {
      padding: 2px 8px;
      font-size: 11px;
      border-color: var(--mg-focus);
    }

    .writingMemoListActions {
      display: flex;
      justify-content: flex-end;
      margin-top: 8px;
    }

    .writingMemoEditBox {
      margin-top: 8px;
      display: grid;
      gap: 8px;
    }
    .writingMemoEditTextarea {
      width: 100%;
      min-height: 88px;
      resize: vertical;
      box-sizing: border-box;
      padding: 8px 10px;
      border: 1px solid var(--mg-border);
      border-radius: 8px;
      background: var(--mg-bg);
      color: var(--mg-fg);
      font: inherit;
      line-height: 1.6;
    }
    .writingMemoEditActions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
    }

    .writingMemoSecondarySection {
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px solid var(--mg-border);
    }
    .writingMemoSecondaryHeader {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }
    .writingMemoSecondaryTabs {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .writingMemoSecondaryTabButton {
      padding: 4px 8px;
      font-size: 12px;
      text-align: center;
      min-width: 120px;
      border-radius: 999px;
      background: transparent;
      color: var(--mg-muted);
      border: 1px solid var(--mg-border);
    }
    .writingMemoSecondaryTabButton.is-active {
      color: var(--mg-fg);
      border-color: var(--mg-focus);
      background: var(--mg-soft-bg);
    }
    .writingMemoSecondaryCount {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 4px;
      border-radius: 999px;
      font-size: 11px;
      line-height: 1;
      opacity: 0.9;
      border: 1px solid var(--mg-border);
    }
    .writingMemoSecondaryTabButton.is-active
     .writingMemoSecondaryCount {
      border-color: var(--mg-focus);
    }
    .writingMemoSecondaryBody {
      margin-top: 10px;
    }
    .writingMemoSecondaryPanel {
      display: none;
    }
    .writingMemoSecondaryPanel.is-active {
      display: block;
    }
    .writingMemoArchiveDoneButton,
    .writingMemoClearArchivedButton {
      flex: 0 0 auto;
      padding: 4px 8px;
      font-size: 12px;
      line-height: 1.2;
    }
    .writingMemoSecondaryActions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex: 0 0 auto;
    }
    .writingMemoSecondaryToggle {
      padding: 4px 8px;
      font-size: 12px;
      line-height: 1.2;
      background: transparent;
      color: var(--mg-muted);
      border: 1px solid var(--mg-border);
      border-radius: 999px;
      cursor: pointer;
    }
    .writingMemoSecondaryToggle:hover {
      color: var(--mg-fg);
      border-color: var(--mg-focus);
    }

    .writingMemoStatus {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      min-width: 62px;
      white-space: nowrap;
      padding: 2px 8px;
      border: 1px solid var(--mg-border);
      border-radius: 999px;
      color: var(--mg-muted);
      background: var(--mg-bg);
    }
    .writingMemoStatus--active {
      border-color: var(--mg-focus);
      color: var(--mg-fg);
      background: var(--mg-soft-bg);
    }
    .writingMemoStatus--done {
      border-color: var(--mg-border);
      color: var(--mg-muted);
      background: var(--mg-bg);
      opacity: 0.6;
    }
    .writingMemoStatus--hold {
      border-color: var(--mg-warning, #d97706);
      color: var(--mg-warning, #d97706);
      background: var(--mg-bg);
    }
    .writingMemoStatus.isClickable {
      cursor: pointer;
    }
    .writingMemoStatusMenuOverlay {
      position: fixed;
      inset: 0;
      display: none;
      z-index: 1100;
    }
    .writingMemoStatusMenuOverlay.is-open {
      display: block;
    }
    .writingMemoStatusMenu {
      position: absolute;
      min-width: 120px;
      background: var(--mg-widget-bg);
      color: var(--mg-widget-fg);
      border: 1px solid var(--mg-border);
      border-radius: 10px;
      padding: 6px;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.22);
    }
    .writingMemoStatusMenuButton {
      display: block;
      width: 100%;
      text-align: left;
      padding: 8px 10px;
      border: 0;
      background: transparent;
      color: inherit;
      border-radius: 8px;
    }
    .writingMemoStatusMenuButton:hover {
      background: var(--mg-hover-bg);
    }

    .statsToast {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1200;
      max-width: 400px;
      padding: 10px 12px;
      border: 1px solid var(--mg-border);
      border-radius: 8px;
      background: var(--mg-widget-bg);
      color: var(--mg-widget-fg);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
      opacity: 0;
      pointer-events: none;
      transform: translateY(-6px);
      transition: opacity 0.18s ease, transform 0.18s ease;
    }

    .webviewActionIcon { width: 17px; height: 17px; flex: 0 0 auto; pointer-events: none; }
    .statsHeaderActions .statsIconButton { display: inline-flex; align-items: center; justify-content: center; width: 34px; min-width: 34px; min-height: 32px; padding: 6px; }
    .dashboardBackupSettings { table-layout: fixed; width: 100%; }
    .dashboardBackupSettings th, .dashboardBackupSettings td { overflow-wrap: anywhere; white-space: normal; }
    #saveSettingsNotice, #webMarkdownNotice { margin: 12px 0; padding: 10px 12px; border-left: 3px solid var(--vscode-focusBorder); background: var(--vscode-textBlockQuote-background); overflow-wrap: anywhere; white-space: pre-line; }
    .dashboardMarkdownDetails { margin-top: 16px; }
    #webMarkdownRegenerate[hidden] { display: none !important; }
    .dashboardMarkdownDetails > summary { cursor: pointer; font-weight: 600; margin-bottom: 12px; }
    #saveSettingsNotice[data-kind="error"], #webMarkdownNotice[role="alert"] { border-left-color: var(--vscode-errorForeground); }
    .statsToast.is-visible {
      opacity: 1;
      transform: translateY(0);
    }
  `;
}

module.exports = { makeStatsStyles };
