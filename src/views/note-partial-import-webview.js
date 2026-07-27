const vscode = require("vscode");
const fs = require("fs/promises");
const { readNoteFile } = require("../data/note-store");
const { parseMarkdownImport } = require("../import/note-markdown-import");
const { getNonce, escapeHtml } = require("../core/path-utils");

const openPartialImportPanels = new Map();

function getPanelKey(options = {}) {
  return [
    String(options.notePath || ""),
    String(options.scopeGroupId || ""),
    String(options.sourceFilePath || ""),
  ].join("::");
}

function getPanelTitle() {
  return "選択インポート";
}

function flattenTargetGroups(groups = [], scopeGroupId = "") {
  const scoped = scopeGroupId
    ? groups.filter((group) => String(group?.id || "") === String(scopeGroupId))
    : groups;

  return scoped.map((group, index) => ({
    groupId: String(group?.id || ""),
    groupTitle: String(group?.title || "").trim() || `大分類 ${index + 1}`,
    items: Array.isArray(group?.items) ? group.items : [],
  }));
}

function escScriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function flattenTargetEntries(groups = [], scopeGroupId = "") {
  const scoped = scopeGroupId
    ? groups.filter((group) => String(group?.id || "") === String(scopeGroupId))
    : groups;

  const entries = [];

  scoped.forEach((group, groupIndex) => {
    const groupTitle =
      String(group?.title || "").trim() || `大分類 ${groupIndex + 1}`;

    const items = Array.isArray(group?.items) ? group.items : [];
    let itemNumber = 0;

    items.forEach((item) => {
      if (item?.kind !== "entry") return;

      itemNumber += 1;
      entries.push({
        groupId: String(group?.id || ""),
        groupTitle,
        itemId: String(item?.id || ""),
        heading: String(item?.heading || "").trim() || `無題項目 ${itemNumber}`,
        body: String(item?.body || ""),
        bodyPreview:
          String(item?.body || "")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)[0] || "",
      });
    });
  });

  return entries;
}

function flattenSourceEntries(parsedNote = {}) {
  const groups = Array.isArray(parsedNote?.groups) ? parsedNote.groups : [];
  const entries = [];

  groups.forEach((group, groupIndex) => {
    const groupTitle =
      String(group?.title || "").trim() || `大分類 ${groupIndex + 1}`;

    const items = Array.isArray(group?.items) ? group.items : [];
    items.forEach((item, itemIndex) => {
      if (item?.kind !== "entry") return;

      entries.push({
        sourceGroupId: String(group?.id || ""),
        sourceGroupTitle: groupTitle,
        sourceItemId: String(item?.id || ""),
        importMeta: {
          supplemented: !!item?.importMeta?.supplemented,
        },
        heading:
          String(item?.heading || "").trim() || `無題項目 ${itemIndex + 1}`,
        body: String(item?.body || ""),
        previewLine:
          String(item?.body || "")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)[0] || "",
      });
    });
  });

  return entries;
}

function flattenSourceInsertables(parsedNote = {}) {
  const groups = Array.isArray(parsedNote?.groups) ? parsedNote.groups : [];
  const items = [];

  groups.forEach((group, groupIndex) => {
    const groupTitle =
      String(group?.title || "").trim() || `大分類 ${groupIndex + 1}`;

    const groupItems = Array.isArray(group?.items) ? group.items : [];

    const dividerCount = groupItems.filter(
      (item) => item?.kind === "divider",
    ).length;
    const entryCount = groupItems.filter(
      (item) => item?.kind === "entry",
    ).length;

    items.push({
      sourceType: "group",
      sourceGroupId: String(group?.id || ""),
      sourceGroupTitle: groupTitle,
      sourceItemId: `group:${String(group?.id || groupIndex)}`,
      importMeta: {
        supplemented: !!group?.importMeta?.supplemented,
      },
      title: groupTitle,
      items: groupItems.map((item) => ({ ...item })),
      previewLine: `${groupItems.length}件`,
      counts: {
        dividers: dividerCount,
        entries: entryCount,
      },
    });

    groupItems.forEach((item, itemIndex) => {
      if (item?.kind === "divider") {
        items.push({
          sourceType: "divider",
          sourceGroupId: String(group?.id || ""),
          sourceGroupTitle: groupTitle,
          sourceItemId: String(item?.id || ""),
          importMeta: {
            supplemented: !!item?.importMeta?.supplemented,
          },
          label:
            String(item?.label || "").trim() || `無題区分 ${itemIndex + 1}`,
          value: String(item?.value || ""),
          previewLine: String(item?.value || "").trim(),
        });
        return;
      }

      if (item?.kind === "entry") {
        items.push({
          sourceType: "entry",
          sourceGroupId: String(group?.id || ""),
          sourceGroupTitle: groupTitle,
          sourceItemId: String(item?.id || ""),
          importMeta: {
            supplemented: !!item?.importMeta?.supplemented,
          },
          heading:
            String(item?.heading || "").trim() || `無題項目 ${itemIndex + 1}`,
          body: String(item?.body || ""),
          previewLine:
            String(item?.body || "")
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)[0] || "",
        });
      }
    });
  });

  return items;
}

function findSourceItemIdBySnapshot(snapshot, entries) {
  if (!snapshot || !Array.isArray(entries) || !entries.length) return "";

  const exact = entries.find((entry) => {
    return (
      String(entry.sourceType || "entry") ===
        String(snapshot.sourceType || "entry") &&
      String(entry.sourceGroupTitle || "") ===
        String(snapshot.sourceGroupTitle || "") &&
      String(entry.title || "") === String(snapshot.title || "") &&
      String(entry.label || "") === String(snapshot.label || "") &&
      String(entry.heading || "") === String(snapshot.heading || "") &&
      String(entry.body || "") === String(snapshot.body || "") &&
      String(entry.value || "") === String(snapshot.value || "")
    );
  });

  if (exact) {
    return String(exact.sourceItemId || "");
  }

  const loose = entries.find((entry) => {
    return (
      String(entry.sourceType || "entry") ===
        String(snapshot.sourceType || "entry") &&
      String(entry.sourceGroupTitle || "") ===
        String(snapshot.sourceGroupTitle || "") &&
      String(entry.title || "") === String(snapshot.title || "") &&
      String(entry.label || "") === String(snapshot.label || "") &&
      String(entry.heading || "") === String(snapshot.heading || "") &&
      String(entry.previewLine || "") === String(snapshot.previewLine || "")
    );
  });

  return loose ? String(loose.sourceItemId || "") : "";
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
<style>
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
    .shell {
      padding-bottom: 60px;
    }

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
</style>
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

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const initialData = ${dataJson};

    const insertTargetPanel = document.getElementById("insertTargetPanel");
    const replaceTargetPanel = document.getElementById("replaceTargetPanel");

    const sourceListEl = document.getElementById("sourceList");
    const previewMetaEl = document.getElementById("previewMeta");
    const previewBodyEl = document.getElementById("previewBody");

    const cancelBtn = document.getElementById("cancelBtn");
    const applyKeepOpenBtn = document.getElementById("applyKeepOpenBtn");
    const applyCloseBtn = document.getElementById("applyCloseBtn");
    
    let currentMode = String(initialData.initialMode || "insert_entry");

    const insertSourceEntries = Array.isArray(initialData.insertSourceEntries)
      ? initialData.insertSourceEntries
      : [];
    const replaceSourceEntries = Array.isArray(initialData.replaceSourceEntries)
      ? initialData.replaceSourceEntries
      : [];

    const insertTargetGroups = Array.isArray(initialData.insertTargetGroups)
      ? initialData.insertTargetGroups
      : [];
    const replaceTargetEntries = Array.isArray(initialData.replaceTargetEntries)
      ? initialData.replaceTargetEntries
      : [];

    const modeInsertBtn = document.getElementById("modeInsertBtn");
    const modeReplaceBtn = document.getElementById("modeReplaceBtn");

    const targetListEl = document.getElementById("targetList");
    const targetGroupSelect = document.getElementById("targetGroupSelect");
    const targetPositionSelect = document.getElementById("targetPositionSelect");
    const insertPreviewMetaEl = document.getElementById("insertPreviewMeta");

    const groupInsertControls = document.getElementById("groupInsertControls");
    const targetGroupPositionSelect = document.getElementById("targetGroupPositionSelect");
    const groupInsertPreviewMetaEl = document.getElementById("groupInsertPreviewMeta");

    const resultNoticeEl = document.getElementById("resultNotice");
    const resultNoticeTextEl = document.getElementById("resultNoticeText");

    const sourceFilterInput = document.getElementById("sourceFilterInput");
    const sourceTypeFilter = document.getElementById("sourceTypeFilter");

    const insertAroundPreviewEl = document.getElementById("insertAroundPreview");

    const sourceSectionTitleEl = document.getElementById("sourceSectionTitle");
    const jumpToSourceBtn = document.getElementById("jumpToSourceBtn");
    const jumpToTargetBtn = document.getElementById("jumpToTargetBtn");

    const appliedSourceIds = new Set();

    let warningsHidden = false;

    const warningCardEl = document.getElementById("warningCard");
    const warningSummaryEl = document.getElementById("warningSummary");
    const warningListEl = document.getElementById("warningList");

    const openSourceFileBtn = document.getElementById("openSourceFileBtn");
    const reloadImportSourceBtn = document.getElementById("reloadImportSourceBtn");

    let selectedSourceItemId = String(initialData.selectedSourceItemId || "");
    let selectedTargetItemId = String(initialData.selectedTargetItemId || "");
    let selectedTargetGroupId =
      String(initialData.selectedTargetGroupId || "") ||
      String(initialData.defaultTargetGroupId || "");
    let selectedInsertIndex = String(
      initialData.selectedInsertIndex || initialData.defaultInsertIndex || "0",
    );
    let selectedGroupInsertIndex = String(
      initialData.selectedGroupInsertIndex || "0",
    );

    let sourceFilterText = String(initialData.sourceFilterText || "");
    let sourceFilterType = String(initialData.sourceFilterType || "all");

    function isInsertMode() {
      return currentMode === "insert_entry";
    }

    function getCurrentSourceEntries() {
      return isInsertMode() ? insertSourceEntries : replaceSourceEntries;
    }

    function getCurrentTargetEntries() {
      return isInsertMode() ? [] : replaceTargetEntries;
    }

    function getCurrentTargetGroups() {
      return isInsertMode() ? insertTargetGroups : [];
    }

    function markSourceApplied(sourceItemId) {
      if (!sourceItemId) return;
      appliedSourceIds.add(String(sourceItemId));
    }

    function getFilteredSourceEntries() {
      const keyword = String(sourceFilterText || "").trim().toLowerCase();

      return getCurrentSourceEntries().filter((entry) => {
        const entryType = String(entry.sourceType || "entry");

        if (sourceFilterType !== "all" && entryType !== sourceFilterType) {
          return false;
        }

        if (!keyword) {
          return true;
        }

        const haystack = [
          entry.title,
          entry.label,
          entry.heading,
          entry.sourceGroupTitle,
          entry.previewLine,
          entry.body,
          entry.value,
        ]
          .map((value) => String(value || "").toLowerCase())
          .join("\\n");

        return haystack.includes(keyword);
      });
    }

    function getGroupedSourceEntries() {
      const visibleEntries = getFilteredSourceEntries();
      const groups = [];
      const groupMap = new Map();

      visibleEntries.forEach((entry) => {
        const sourceType = String(entry.sourceType || "");

        if (sourceType === "group") {
          const block = {
            groupId: String(entry.sourceGroupId || ""),
            groupEntry: entry,
            children: [],
          };
          groups.push(block);
          groupMap.set(block.groupId, block);
          return;
        }

        const groupId = String(entry.sourceGroupId || "");
        let block = groupMap.get(groupId);

        if (!block) {
          block = {
            groupId,
            groupEntry: null,
            children: [],
          };
          groups.push(block);
          groupMap.set(groupId, block);
        }

        block.children.push(entry);
      });

      return groups;
    }

    function esc(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function renderMiniBadges(importMeta) {
      const badges = [];

      if (importMeta?.supplemented) {
        badges.push('<span class="rowMiniBadge">補完</span>');
      }

      return badges.length
        ? \`<span class="rowBadges">\${badges.join("")}</span>\`
        : "";
    }

    function syncDynamicHeights() {
      const shell = document.querySelector(".shell");
      const warningEl = document.querySelector(".warning");
      if (!shell) return;

      const warningHeight = warningEl ? warningEl.offsetHeight : 0;
      shell.style.setProperty("--warning-h", \`\${warningHeight}px\`);
    }

    function updateWarningLayoutState() {
      const shellEl = document.querySelector(".shell");
      if (!shellEl) return;

      const hasWarnings = !warningCardEl?.hidden;
      shellEl.classList.toggle("hasWarnings", hasWarnings);
    }

    window.addEventListener("resize", syncDynamicHeights);
    requestAnimationFrame(syncDynamicHeights);

    function showResultNotice(message) {
      if (!resultNoticeEl || !resultNoticeTextEl) return;
      resultNoticeTextEl.textContent = String(message || "");
      resultNoticeEl.hidden = !message;
    }

    function clearResultNotice() {
      if (!resultNoticeEl || !resultNoticeTextEl) return;
      resultNoticeTextEl.textContent = "";
      resultNoticeEl.hidden = true;
    }

    function postApplyMessage(keepOpen) {
      const source = getSelectedSource();
      if (!source) return;

      clearResultNotice();

      if (isInsertMode()) {
        const isGroupSource = source.sourceType === "group";

        vscode.postMessage({
          type: "applyPartialInsertItem",
          payload: {
            keepOpen: !!keepOpen,
            source: {
              sourceType: String(source.sourceType || "entry"),
              sourceGroupId: String(source.sourceGroupId || ""),
              sourceItemId: String(source.sourceItemId || ""),
              title: String(source.title || ""),
              items: Array.isArray(source.items) ? source.items : [],
              heading: String(source.heading || ""),
              body: String(source.body || ""),
              label: String(source.label || ""),
              value: String(source.value || ""),
            },
            target: isGroupSource
              ? {
                  groupInsertIndex: String(targetGroupPositionSelect?.value || "0"),
                }
              : {
                  groupId: String(targetGroupSelect?.value || ""),
                  insertIndex: String(targetPositionSelect?.value || "0"),
                },
          },
        });
        return;
      }

      const target = getSelectedTarget();
      if (!target) return;

      vscode.postMessage({
        type: "applyPartialReplaceImport",
        payload: {
          keepOpen: !!keepOpen,
          source: {
            sourceGroupId: String(source.sourceGroupId || ""),
            sourceGroupTitle: String(source.sourceGroupTitle || ""),
            sourceItemId: String(source.sourceItemId || ""),
            heading: String(source.heading || ""),
            body: String(source.body || ""),
          },
          target: {
            groupId: String(target.groupId || ""),
            itemId: String(target.itemId || ""),
            heading: String(target.heading || ""),
          },
        },
      });
    }

    function moveToNextSource() {
      const currentSourceEntries = getCurrentSourceEntries();
      if (!Array.isArray(currentSourceEntries) || !currentSourceEntries.length) return;

      const currentIndex = currentSourceEntries.findIndex(
        (entry) => String(entry.sourceItemId || "") === String(selectedSourceItemId || ""),
      );

      if (currentIndex < 0) return;

      const next = currentSourceEntries[currentIndex + 1];
      if (!next) return;

      selectedSourceItemId = String(next.sourceItemId || "");
      renderAll();

      const nextButton = sourceListEl?.querySelector(
        '[data-role="pickSource"][data-source-item-id="' + CSS.escape(selectedSourceItemId) + '"]',
      );
      nextButton?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function getInsertPositionLabel(item, index) {
      if (item && item.kind === "divider") {
        const label = String(item?.label || "").trim() || \`無題区分 \${index + 1}\`;
        return \`区分「\${label}」の後\`;
      }

      const heading = String(item?.heading || "").trim() || \`無題項目 \${index + 1}\`;
      return \`項目「\${heading}」の後\`;
    }

    function getItemDisplayLabel(item, index) {
      if (!item) return "なし";

      if (item.kind === "divider") {
        const label = String(item.label || "").trim() || \`無題区分 \${index + 1}\`;
        const value = String(item.value || "").trim();
        return value ? \`区分: \${label}\\n\${value}\` : \`区分: \${label}\`;
      }

      const heading = String(item.heading || "").trim() || \`無題項目 \${index + 1}\`;
      const bodyLine =
        String(item.body || "")
          .split("\\n")
          .map((line) => line.trim())
          .filter(Boolean)[0] || "";

      return bodyLine ? \`項目: \${heading}\\n\${bodyLine}\` : \`項目: \${heading}\`;
    }

    function getSelectedSource() {
      return getCurrentSourceEntries().find(
        (entry) => String(entry.sourceItemId || "") === String(selectedSourceItemId || "")
      );
    }

    function buildSelectedSourceSnapshot() {
      const source = getSelectedSource();
      if (!source) return null;

      return {
        sourceType: String(source.sourceType || "entry"),
        sourceGroupTitle: String(source.sourceGroupTitle || ""),
        title: String(source.title || ""),
        label: String(source.label || ""),
        heading: String(source.heading || ""),
        body: String(source.body || ""),
        value: String(source.value || ""),
        previewLine: String(source.previewLine || ""),
      };
    }

    function isGroupSourceSelected() {
      const source = getSelectedSource();
      return !!source && String(source.sourceType || "") === "group";
    }

    function getSelectedTarget() {
      return getCurrentTargetEntries().find(
        (entry) => String(entry.itemId || "") === String(selectedTargetItemId || "")
      );
    }

    function renderSourceList() {
      const groupedEntries = getGroupedSourceEntries();

      if (!groupedEntries.length) {
        sourceListEl.innerHTML = '<div class="muted">該当する読み込み内容はありません。</div>';
        return;
      }

      sourceListEl.innerHTML = groupedEntries
        .map((block) => {
          const groupEntry = block.groupEntry;
          const children = Array.isArray(block.children) ? block.children : [];

          const groupHtml = groupEntry
            ? (() => {
                const done = appliedSourceIds.has(String(groupEntry.sourceItemId || ""));
                const active =
                  String(groupEntry.sourceItemId || "") === String(selectedSourceItemId || "");

                const lineText = \`区分 \${Number(groupEntry?.counts?.dividers || 0)}件 / 項目 \${Number(groupEntry?.counts?.entries || 0)}件\`;

                return \`
                  <button
                    type="button"
                    class="rowButton \${active ? "isActive" : ""} \${done ? "isDone" : ""}"
                    data-role="pickSource"
                    data-source-item-id="\${esc(groupEntry.sourceItemId)}"
                  >
                    <div class="rowTop">
                      <div class="rowTitleLine">
                        <span class="rowBadge">大分類</span>
                          <div class="rowTitle">
                            \${esc(String(groupEntry.title || ""))}
                            \${renderMiniBadges(groupEntry.importMeta)}
                          </div>
                      </div>
                    </div>
                    <div class="rowLine">\${esc(lineText)}</div>
                  </button>
                \`;
              })()
            : "";

          const childHtml = children
            .map((entry) => {
              const done = appliedSourceIds.has(String(entry.sourceItemId || ""));
              const active =
                String(entry.sourceItemId || "") === String(selectedSourceItemId || "");

              const typeLabel =
                entry.sourceType === "divider"
                  ? "区分"
                  : "項目";

              const mainLabel =
                entry.sourceType === "divider"
                  ? String(entry.label || "")
                  : String(entry.heading || "");

              const lineText = String(entry.previewLine || "");

              return \`
                <button
                  type="button"
                  class="rowButton isChild \${active ? "isActive" : ""} \${done ? "isDone" : ""}"
                  data-role="pickSource"
                  data-source-item-id="\${esc(entry.sourceItemId)}"
                >
                  <div class="rowTop">
                    <div class="rowTitleLine">
                      <span class="rowBadge">\${esc(typeLabel)}</span>
                      <div class="rowTitle">
                        \${esc(mainLabel)}
                        \${renderMiniBadges(entry.importMeta)}
                      </div>
                    </div>
                  </div>
                  <div class="rowLine">\${esc(lineText)}</div>
                </button>
              \`;
            })
            .join("");

          return \`
            <div class="sourceGroupBlock">
              \${groupHtml}
              \${childHtml ? \`<div class="childList">\${childHtml}</div>\` : ""}
            </div>
          \`;
        })
        .join("");

      sourceListEl.querySelectorAll("[data-role='pickSource']").forEach((button) => {
        button.addEventListener("click", () => {
          selectedSourceItemId = String(button.dataset.sourceItemId || "");
          renderAll();
        });
      });
    }

    function renderModeTabs() {
      modeInsertBtn?.classList.toggle("isActive", isInsertMode());
      modeReplaceBtn?.classList.toggle("isActive", !isInsertMode());
    }

    function renderModeLabels() {
      if (sourceSectionTitleEl) {
        sourceSectionTitleEl.textContent = isInsertMode() ? "読み込み内容" : "読み込み項目";
      }

      if (applyKeepOpenBtn) {
        applyKeepOpenBtn.textContent = isInsertMode()
          ? "挿入: 次を選択"
          : "上書き: 次を選択";
      }

      if (applyCloseBtn) {
        applyCloseBtn.textContent = isInsertMode()
          ? "挿入 → 閉じる"
          : "上書き → 閉じる";
      }

      if (jumpToSourceBtn) {
        jumpToSourceBtn.textContent = isInsertMode() ? "読込内容" : "読込項目";
      }

      if (jumpToTargetBtn) {
        jumpToTargetBtn.textContent = isInsertMode() ? "挿入先" : "上書き先";
      }
    }

    function getCurrentWarnings() {
      const warnings = Array.isArray(initialData.warnings)
        ? initialData.warnings
        : [];

      if (isInsertMode()) {
        return warnings;
      }

      return warnings.filter((warning) => {
        const code = String(warning?.code || "");
        return ![
          "MISSING_GROUP_FOR_ENTRY",
          "MISSING_GROUP_FOR_DIVIDER",
          "MISSING_GROUP_AND_ENTRY_FOR_BODY",
        ].includes(code);
      });
    }

    function renderWarnings() {
      if (!warningCardEl || !warningSummaryEl || !warningListEl) return;

      const currentWarnings = getCurrentWarnings();
      const warningDetailsEl = document.getElementById("warningDetails");

      if (!currentWarnings.length) {
        warningCardEl.hidden = true;
        warningListEl.innerHTML = "";
        updateWarningLayoutState();
        requestAnimationFrame(syncPanelHeights);
        return;
      }

      warningCardEl.hidden = false;

      warningSummaryEl.innerHTML =
        \`警告 \${currentWarnings.length}件\` +
        \`<span class="warningHint">クリックで開閉</span>\`;

      if (warningsHidden) {
        if (warningDetailsEl) {
          warningDetailsEl.open = false;
        }
        warningListEl.hidden = true;
        updateWarningLayoutState();
        requestAnimationFrame(syncPanelHeights);
        return;
      }

      if (warningDetailsEl) {
        warningDetailsEl.open = true;
      }

      warningListEl.hidden = false;
      warningListEl.innerHTML = currentWarnings
        .map((warning) => {
          const isAttention = String(warning?.level || "") === "attention";
          const sampleLine = String(warning?.sampleLine || "").trim();

          return \`
            <div class="warningItemBlock">
              <div class="warningHeaderLine">
                \${isAttention ? '<span class="warningFlag">要確認</span>' : ""}
                <span>\${esc(String(warning?.message || ""))}</span>
              </div>
              \${sampleLine ? \`<div class="warningSample">\${esc(sampleLine)}</div>\` : ""}
            </div>
          \`;
        })
        .join("");

      updateWarningLayoutState();
      requestAnimationFrame(syncPanelHeights);
    }

    function renderModePanels() {
      if (insertTargetPanel) {
        insertTargetPanel.hidden = !isInsertMode();
      }

      if (replaceTargetPanel) {
        replaceTargetPanel.hidden = isInsertMode();
      }

      if (sourceTypeFilter) {
        sourceTypeFilter.querySelectorAll("[data-insert-only='true']").forEach((option) => {
          option.hidden = !isInsertMode();
          option.disabled = !isInsertMode();
        });

        if (!isInsertMode() && sourceFilterType !== "all" && sourceFilterType !== "entry") {
          sourceFilterType = "all";
        }

        sourceTypeFilter.value = sourceFilterType;
      }
    }

    function renderTargetList() {
      if (!targetListEl) return;

      const currentTargetEntries = getCurrentTargetEntries();

      targetListEl.innerHTML = currentTargetEntries.map((entry) => {
        const active =
          String(entry.itemId || "") === String(selectedTargetItemId || "");
        return \`
          <button
            type="button"
            class="rowButton \${active ? "isActive" : ""}"
            data-role="pickTarget"
            data-item-id="\${esc(entry.itemId)}"
          >
            <div class="rowTop">
              <div class="rowTitle">\${esc(entry.heading)}</div>
            </div>
            <div class="rowMeta">\${esc(entry.groupTitle)}</div>
            <div class="rowLine">\${esc(entry.bodyPreview || "")}</div>
          </button>
        \`;
      }).join("");

      targetListEl.querySelectorAll("[data-role='pickTarget']").forEach((button) => {
        button.addEventListener("click", () => {
          selectedTargetItemId = String(button.dataset.itemId || "");
          renderAll();
        });
      });
    }

    function renderInsertTargetMode() {
      if (!isInsertMode()) return;

      const isGroupSource = isGroupSourceSelected();

      if (targetGroupSelect) {
        const wrapper = targetGroupSelect.closest("label");
        if (wrapper) wrapper.hidden = isGroupSource;
      }

      if (targetPositionSelect) {
        const wrapper = targetPositionSelect.closest("label");
        if (wrapper) wrapper.hidden = isGroupSource;
      }

      if (insertPreviewMetaEl) {
        insertPreviewMetaEl.hidden = isGroupSource;
      }

      if (groupInsertControls) {
        groupInsertControls.hidden = !isGroupSource;
      }
    }

    function renderGroupInsertPreview() {
      if (!groupInsertPreviewMetaEl) return;

      const positionLabel =
        targetGroupPositionSelect?.selectedOptions?.[0]?.textContent || "先頭";

      groupInsertPreviewMetaEl.innerHTML = \`
        <div>対象ノート: \${esc(initialData.noteTitle || "無題ノート")}</div>
        <div>大分類の位置: \${esc(positionLabel)}</div>
      \`;

      if (insertAroundPreviewEl) {
        insertAroundPreviewEl.innerHTML = "";
      }
    }

    function renderInsertAroundPreview() {
      if (!insertAroundPreviewEl || !isInsertMode()) return;

      const source = getSelectedSource();
      if (!source || source.sourceType === "group") {
        insertAroundPreviewEl.innerHTML = "";
        return;
      }

      const currentTargetGroups = getCurrentTargetGroups();
      const group = currentTargetGroups.find(
        (entry) => String(entry.groupId || "") === String(selectedTargetGroupId || ""),
      );

      if (!group) {
        insertAroundPreviewEl.innerHTML = "";
        return;
      }

      const items = Array.isArray(group.items) ? group.items : [];
      const index = Math.max(0, Math.min(Number(selectedInsertIndex || 0), items.length));

      const beforeItem = index > 0 ? items[index - 1] : null;
      const afterItem = index < items.length ? items[index] : null;

      insertAroundPreviewEl.innerHTML = \`
        <div class="insertAroundRow">
          <div class="insertAroundLabel">前列</div>
          <div class="insertAroundValue">\${esc(beforeItem ? getItemDisplayLabel(beforeItem, index - 1) : "なし")}</div>
        </div>
        <div class="insertAroundRow">
          <div class="insertAroundLabel">挿入位置</div>
          <div class="insertAroundValue">ここへ挿入</div>
        </div>
        <div class="insertAroundRow">
          <div class="insertAroundLabel">後列</div>
          <div class="insertAroundValue">\${esc(afterItem ? getItemDisplayLabel(afterItem, index) : "なし")}</div>
        </div>
      \`;
    }

    function renderTargetGroupOptions() {
      if (!isInsertMode() || !targetGroupSelect) return;

      const currentTargetGroups = getCurrentTargetGroups();

      targetGroupSelect.innerHTML = currentTargetGroups
        .map((group) => {
          const selected =
            String(group.groupId || "") === String(selectedTargetGroupId || "")
              ? "selected"
              : "";
          return \`<option value="\${esc(group.groupId)}" \${selected}>\${esc(group.groupTitle)}</option>\`;
        })
        .join("");
    }

    function renderGroupInsertPositionOptions() {
      const selectEl = document.getElementById("targetGroupPositionSelect");
      if (!selectEl) return;

      const currentTargetGroups = getCurrentTargetGroups();
      const groups = currentTargetGroups;
      const options = [];

      options.push(
        \`<option value="0" \${selectedGroupInsertIndex === "0" ? "selected" : ""}>先頭</option>\`,
      );

      groups.forEach((group, index) => {
        const insertIndex = index + 1;
        const selected =
          String(selectedGroupInsertIndex) === String(insertIndex) ? "selected" : "";

        options.push(
          \`<option value="\${insertIndex}" \${selected}>大分類「\${esc(group.groupTitle)}」の後</option>\`,
        );
      });

      selectEl.value = String(selectedGroupInsertIndex || "0");
      selectEl.innerHTML = options.join("");
    }

    function renderTargetPositionOptions() {
      if (!isInsertMode() || !targetPositionSelect) return;

      const currentTargetGroups = getCurrentTargetGroups();

      const group = currentTargetGroups.find(
        (entry) => String(entry.groupId || "") === String(selectedTargetGroupId || ""),
      );

      if (!group) {
        targetPositionSelect.innerHTML = \`<option value="0">先頭</option>\`;
        return;
      }

      const items = Array.isArray(group.items) ? group.items : [];
      const options = [];

      options.push(
        \`<option value="0" \${String(selectedInsertIndex) === "0" ? "selected" : ""}>先頭</option>\`,
      );

      items.forEach((item, index) => {
        const insertIndex = index + 1;
        const selected =
          String(selectedInsertIndex) === String(insertIndex) ? "selected" : "";
        options.push(
          \`<option value="\${insertIndex}" \${selected}>\${esc(getInsertPositionLabel(item, index))}</option>\`,
        );
      });

      if (!items.length) {
        options.push(\`<option value="0" selected>この大分類へ挿入</option>\`);
      }

      targetPositionSelect.innerHTML = options.join("");
    }

    function renderInsertPreview() {
      if (!isInsertMode() || !insertPreviewMetaEl) return;

      const currentTargetGroups = getCurrentTargetGroups();
      const group = currentTargetGroups.find(
        (entry) => String(entry.groupId || "") === String(selectedTargetGroupId || ""),
      );

      if (!group) {
        insertPreviewMetaEl.textContent = "";
        return;
      }

      const positionLabel =
        targetPositionSelect?.selectedOptions?.[0]?.textContent || "先頭";

      insertPreviewMetaEl.innerHTML = \`
        <div>挿入先: \${esc(group.groupTitle)}</div>
        <div>位置: \${esc(positionLabel)}</div>
      \`;

      renderInsertAroundPreview();
    }

    function renderPreview() {
      const source = getSelectedSource();

      if (!source) {
        previewMetaEl.textContent = "";
        previewBodyEl.classList.remove("isCompare");
        previewBodyEl.textContent = "左の項目を選択してください。";
        previewBodyEl.classList.add("muted");
        return;
      }

      if (!isInsertMode()) {
        const target = getSelectedTarget();

        const sourceBody = String(source.body || "");
        const targetBody = String(target?.body || "");

        previewMetaEl.innerHTML =
          \`<div class="muted">※ 上書きされるのは詳細本文のみです。項目名は変更されません。</div>\`;

        previewBodyEl.classList.add("isCompare");
        previewBodyEl.innerHTML = \`
          <div class="comparePreview">
            <div class="compareBlock">
              <div class="compareLabel">読み込む詳細</div>
              <div class="compareBody">\${esc(sourceBody || "（空）")}</div>
            </div>

            <div class="compareBlock">
              <div class="compareLabel">上書き先の詳細</div>
              <div class="compareBody">\${esc(targetBody || "（空）")}</div>
            </div>
          </div>
        \`;
        previewBodyEl.classList.remove("muted");
        return;
      }

      if (source.sourceType === "group") {
        previewBodyEl.classList.remove("isCompare");
        previewMetaEl.textContent = \`大分類: \${source.title || "無題大分類"}\`;
        previewBodyEl.textContent =
          \`区分 \${Number(source?.counts?.dividers || 0)}件\\n項目 \${Number(source?.counts?.entries || 0)}件\`;
        previewBodyEl.classList.remove("muted");
        return;
      }

      if (source.sourceType === "divider") {
        previewBodyEl.classList.remove("isCompare");
        previewMetaEl.textContent = \`区分: \${source.label || "無題区分"}\`;
        previewBodyEl.textContent = \`\${String(source.value || "")}\`;
        previewBodyEl.classList.remove("muted");
        return;
      }

      previewBodyEl.classList.remove("isCompare");
      previewMetaEl.textContent = \`項目: \${source.heading || "無題項目"}\`;
      previewBodyEl.textContent = \`\${String(source.body || "")}\`;
      previewBodyEl.classList.remove("muted");
    }

    function setApplyButtonsDisabled(disabled) {
      if (applyKeepOpenBtn) applyKeepOpenBtn.disabled = disabled;
      if (applyCloseBtn) applyCloseBtn.disabled = disabled;
    }

    function renderApplyState() {
      if (isInsertMode()) {
        if (isGroupSourceSelected()) {
          setApplyButtonsDisabled(!selectedSourceItemId);
          return;
        }

        setApplyButtonsDisabled(!(selectedSourceItemId && selectedTargetGroupId));
        return;
      }

      setApplyButtonsDisabled(!(selectedSourceItemId && selectedTargetItemId));
    }

    function switchMode(nextMode) {
      const prevMode = currentMode;

      currentMode =
        nextMode === "replace_entry_body"
          ? "replace_entry_body"
          : "insert_entry";

      sourceFilterType = "all";
      if (sourceTypeFilter) {
        sourceTypeFilter.value = "all";
      }

      selectedSourceItemId = "";
      selectedTargetItemId = "";
      selectedTargetGroupId = String(initialData.defaultTargetGroupId || "");
      selectedInsertIndex = String(initialData.defaultInsertIndex || "0");

      if (sourceFilterInput) {
        sourceFilterInput.value = sourceFilterText;
      }

      if (sourceTypeFilter) {
        sourceTypeFilter.value = sourceFilterType;
      }

      const currentSources = getCurrentSourceEntries();

      if (currentSources.length) {
        if (currentMode === "insert_entry" && prevMode !== "insert_entry") {
          const firstSelectable =
            currentSources.find((entry) => String(entry.sourceType || "") !== "group") ||
            currentSources[0];

          selectedSourceItemId = String(firstSelectable?.sourceItemId || "");
        } else {
          selectedSourceItemId = String(currentSources[0].sourceItemId || "");
        }
      }

      if (isInsertMode()) {
        const currentTargetGroups = getCurrentTargetGroups();

        if (!selectedTargetGroupId && currentTargetGroups.length) {
          selectedTargetGroupId = String(currentTargetGroups[0].groupId || "");
        }

        renderTargetGroupOptions();
        renderTargetPositionOptions();
        renderInsertPreview();
      } else {
        const currentTargets = getCurrentTargetEntries();
        if (currentTargets.length) {
          selectedTargetItemId = String(currentTargets[0].itemId || "");
        }
      }

      renderAll();
    }

    function syncPanelHeights() {
      const footerEl = document.querySelector(".footer");
      const sourceListElLocal = document.getElementById("sourceList");
      const previewBodyElLocal = document.getElementById("previewBody");
      const targetListElLocal = document.getElementById("targetList");
      const targetColumnEl = isInsertMode() ? insertTargetPanel : replaceTargetPanel;
      const hasWarnings = !warningCardEl?.hidden;

      if (!footerEl) return;

      const footerTop = footerEl.getBoundingClientRect().top;
      const bottomGap = 16;
      const isSingleColumn = window.innerWidth <= 650;

      if (isSingleColumn) {
        if (sourceListElLocal) {
          const sourceTop = sourceListElLocal.getBoundingClientRect().top;
          const sourceAvailable = Math.max(
            180,
            Math.min(
              420,
              Math.floor(footerTop - sourceTop - bottomGap - 140),
            ),
          );
          sourceListElLocal.style.maxHeight = \`\${sourceAvailable}px\`;
        }

        if (previewBodyElLocal) {
          const previewTop = previewBodyElLocal.getBoundingClientRect().top;
          const previewAvailable = Math.max(
            90,
            Math.min(
              130,
              Math.floor(footerTop - previewTop - bottomGap - 260),
            ),
          );
          previewBodyElLocal.style.maxHeight = \`\${previewAvailable}px\`;
        }

        if (targetListElLocal && !isInsertMode()) {
          const targetTop = targetListElLocal.getBoundingClientRect().top;
          const targetAvailable = Math.max(
            320,
            Math.floor(footerTop - targetTop - bottomGap),
          );
          targetListElLocal.style.maxHeight = \`\${targetAvailable}px\`;
        } else if (targetColumnEl) {
          const targetTop = targetColumnEl.getBoundingClientRect().top;
          const targetAvailable = Math.max(
            320,
            Math.floor(footerTop - targetTop - bottomGap),
          );
          targetColumnEl.style.maxHeight = \`\${targetAvailable}px\`;
          targetColumnEl.style.overflow = "auto";
        }

        return;
      }

      if (sourceListElLocal) {
        const sourceTop = sourceListElLocal.getBoundingClientRect().top;
        const sourceAvailable = Math.max(
          hasWarnings ? 180 : 220,
          Math.floor(footerTop - sourceTop - bottomGap - 25),
        );
        sourceListElLocal.style.maxHeight = \`\${sourceAvailable}px\`;
      }

      if (!previewBodyElLocal || !targetColumnEl) return;

      const rightColumnEl = document.querySelector(".rightColumn");
      if (!rightColumnEl) return;

      const rightTop = rightColumnEl.getBoundingClientRect().top;
      const rightAvailable = Math.max(
        260,
        Math.floor(footerTop - rightTop - bottomGap),
      );

      const previewCard = document.querySelector(".previewColumn");
      const previewHeadH =
        (previewCard?.offsetHeight || 0) - (previewBodyElLocal.offsetHeight || 0);

      const targetHeadH = isInsertMode()
        ? targetColumnEl.offsetHeight -
          (document.getElementById("insertAroundPreview")?.offsetHeight || 0)
        : targetColumnEl.offsetHeight - (targetListElLocal?.offsetHeight || 0);

      const gapBetween = 16;

      if (!isInsertMode() && targetListElLocal) {
        const previewBodyMax = hasWarnings ? 100 : 90;
        previewBodyElLocal.style.maxHeight = \`\${previewBodyMax}px\`;

        const targetTop = targetListElLocal.getBoundingClientRect().top;
        const targetListMax = Math.max(
          hasWarnings ? 260 : 220,
          Math.floor(footerTop - targetTop - bottomGap - 25),
        );

        targetListElLocal.style.maxHeight = \`\${targetListMax}px\`;
        return;
      }

      const previewBodyMax = hasWarnings ? 130 : 100;
      previewBodyElLocal.style.maxHeight = \`\${previewBodyMax}px\`;

      const targetBodyAvailable = Math.max(
        300,
        rightAvailable - previewHeadH - previewBodyMax - gapBetween - 25,
      );
      targetColumnEl.style.maxHeight = \`\${targetBodyAvailable}px\`;
      targetColumnEl.style.overflow = "auto";
    }

    function renderAll() {
      renderModeTabs();
      renderModeLabels();
      renderModePanels();
      renderWarnings();
      renderSourceList();

      if (isInsertMode()) {
        renderInsertTargetMode();

        if (isGroupSourceSelected()) {
          renderGroupInsertPositionOptions();
          renderGroupInsertPreview();
        } else {
          renderTargetGroupOptions();
          renderTargetPositionOptions();
          renderInsertPreview();
        }
      } else {
        renderTargetList();
      }

      renderPreview();
      renderApplyState();
      requestAnimationFrame(syncPanelHeights);
    }

    cancelBtn.addEventListener("click", () => {
      vscode.postMessage({ type: "cancelPartialImport" });
    });

    sourceFilterInput?.addEventListener("input", () => {
      sourceFilterText = String(sourceFilterInput.value || "");
      renderAll();
    });

    sourceTypeFilter?.addEventListener("change", () => {
      sourceFilterType = String(sourceTypeFilter.value || "all");
      renderAll();
    });

    modeInsertBtn?.addEventListener("click", () => {
      switchMode("insert_entry");
    });

    modeReplaceBtn?.addEventListener("click", () => {
      switchMode("replace_entry_body");
    });

    applyKeepOpenBtn?.addEventListener("click", () => {
      postApplyMessage(true);
    });

    applyCloseBtn?.addEventListener("click", () => {
      postApplyMessage(false);
    });

    openSourceFileBtn?.addEventListener("click", () => {
      vscode.postMessage({ type: "openSourceFile" });
    });

    reloadImportSourceBtn?.addEventListener("click", () => {
      vscode.postMessage({
        type: "reloadImportSource",
        payload: {
          currentMode,
          sourceFilterText,
          sourceFilterType,
          selectedSourceItemId,
          selectedTargetItemId,
          selectedTargetGroupId,
          selectedInsertIndex,
          selectedGroupInsertIndex,
          selectedSourceSnapshot: buildSelectedSourceSnapshot(),
        },
      });
    });

    jumpToSourceBtn?.addEventListener("click", () => {
      document.querySelector(".sourceColumn")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    jumpToTargetBtn?.addEventListener("click", () => {
      const activeTarget = isInsertMode() ? insertTargetPanel : replaceTargetPanel;
      activeTarget?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    window.addEventListener("message", (event) => {
      const message = event.data || {};

      if (message.type === "partialImportApplied") {
        const payload = message.payload || {};
        const sourceItemId = String(payload.sourceItemId || "");
        const keepOpen = !!payload.keepOpen;
        const messageText = String(payload.message || "反映しました。");

        markSourceApplied(sourceItemId);
        showResultNotice(messageText);

        if (keepOpen) {
          moveToNextSource();
        }
      }
    });

    window.addEventListener("resize", () => {
      requestAnimationFrame(syncPanelHeights);
    });

    const currentSources = getCurrentSourceEntries();
    if (
      !selectedSourceItemId ||
      !currentSources.some(
        (entry) =>
          String(entry.sourceItemId || "") === String(selectedSourceItemId || ""),
      )
    ) {
      if (currentSources.length) {
        selectedSourceItemId = String(currentSources[0].sourceItemId || "");
      }
    }

    const currentTargetGroups = getCurrentTargetGroups();
    if (
      (!selectedTargetGroupId ||
        !currentTargetGroups.some(
          (group) =>
            String(group.groupId || "") === String(selectedTargetGroupId || ""),
        )) &&
      currentTargetGroups.length
    ) {
      selectedTargetGroupId = String(currentTargetGroups[0].groupId || "");
    }

    renderTargetGroupOptions();
    renderTargetPositionOptions();

    const currentTargetEntries = getCurrentTargetEntries();
    if (
      (!selectedTargetItemId ||
        !currentTargetEntries.some(
          (entry) =>
            String(entry.itemId || "") === String(selectedTargetItemId || ""),
        )) &&
      currentTargetEntries.length
    ) {
      selectedTargetItemId = String(currentTargetEntries[0].itemId || "");
    }

    targetGroupSelect?.addEventListener("change", () => {
      selectedTargetGroupId = String(targetGroupSelect.value || "");
      selectedInsertIndex = "0";
      renderTargetPositionOptions();
      renderPreview();
      renderInsertPreview();
      renderApplyState();
    });

    targetPositionSelect?.addEventListener("change", () => {
      selectedInsertIndex = String(targetPositionSelect.value || "0");
      renderInsertPreview();
      renderApplyState();
    });

    targetGroupPositionSelect?.addEventListener("change", () => {
      selectedGroupInsertIndex = String(targetGroupPositionSelect.value || "0");
      renderGroupInsertPreview();
      renderApplyState();
    });

    const warningDetailsEl = document.getElementById("warningDetails");

    warningDetailsEl?.addEventListener("toggle", () => {
      warningsHidden = !warningDetailsEl.open;
      renderWarnings();
    });

    renderInsertAroundPreview();
    renderAll();
    requestAnimationFrame(syncPanelHeights);
  </script>
</body>
</html>`;
}

async function openNotePartialImportWebview(
  context,
  treeProvider,
  options = {},
) {
  const key = getPanelKey(options);
  const existing = openPartialImportPanels.get(key);

  if (existing) {
    try {
      existing.dispose();
    } catch {}
    openPartialImportPanels.delete(key);
  }

  const panel = vscode.window.createWebviewPanel(
    "mojigoto.notePartialImport",
    getPanelTitle(String(options.mode || "")),
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    },
  );

  openPartialImportPanels.set(key, panel);

  const insertSourceEntries = flattenSourceInsertables(
    options.parsedNote || {},
  );
  const replaceSourceEntries = flattenSourceEntries(options.parsedNote || {});

  const replaceTargetEntries = flattenTargetEntries(
    options.noteData?.groups || [],
    String(options.scopeGroupId || ""),
  );

  const insertTargetGroups = flattenTargetGroups(
    options.noteData?.groups || [],
    String(options.scopeGroupId || ""),
  );

  const defaultTargetGroupId =
    String(options.defaultTargetGroupId || "") ||
    String(options.scopeGroupId || "") ||
    String(insertTargetGroups[0]?.groupId || "");

  panel.webview.html = getHtml({
    initialMode: String(options.initialMode || "insert_entry"),
    notePath: String(options.notePath || ""),
    sourceFilterText: String(options.sourceFilterText || ""),
    sourceFilterType: String(options.sourceFilterType || "all"),
    selectedSourceItemId: String(options.selectedSourceItemId || ""),
    selectedTargetItemId: String(options.selectedTargetItemId || ""),
    selectedTargetGroupId: String(options.selectedTargetGroupId || ""),
    selectedInsertIndex: String(options.selectedInsertIndex || "0"),
    selectedGroupInsertIndex: String(options.selectedGroupInsertIndex || "0"),
    selectedSourceSnapshot: options.selectedSourceSnapshot || null,
    sourceFilePath: String(options.sourceFilePath || ""),
    sourceFileName: String(options.sourceFileName || ""),
    scopeGroupId: String(options.scopeGroupId || ""),
    noteTitle: String(options.noteTitle || ""),
    noteTypeLabel: String(options.noteTypeLabel || ""),
    scopeGroupTitle: String(options.scopeGroupTitle || ""),
    warnings: Array.isArray(options.previewData?.warnings)
      ? options.previewData.warnings
      : [],
    insertSourceEntries,
    replaceSourceEntries,
    insertTargetGroups,
    replaceTargetEntries,
    defaultTargetGroupId,
    defaultInsertIndex: "0",
  });

  panel.webview.onDidReceiveMessage(async (message) => {
    try {
      if (message?.type === "cancelPartialImport") {
        panel.dispose();
        return;
      }

      if (message?.type === "openSourceFile") {
        const sourceFilePath = String(options.sourceFilePath || "").trim();
        if (!sourceFilePath) {
          vscode.window.showWarningMessage(
            "読み込み元ファイルのパスを取得できませんでした。",
          );
          return;
        }

        await vscode.window.showTextDocument(vscode.Uri.file(sourceFilePath), {
          preview: false,
          preserveFocus: false,
        });
        return;
      }

      if (message?.type === "reloadImportSource") {
        const sourceFilePath = String(options.sourceFilePath || "").trim();
        if (!sourceFilePath) {
          throw new Error(
            "再読み込みするファイルのパスを取得できませんでした。",
          );
        }

        const sourceText = await fs.readFile(sourceFilePath, "utf8");

        const nextSourceFilterText = String(
          message?.payload?.sourceFilterText || "",
        );
        const nextSourceFilterType = String(
          message?.payload?.sourceFilterType || "all",
        );
        const nextSelectedSourceItemId = String(
          message?.payload?.selectedSourceItemId || "",
        );
        const nextSelectedTargetItemId = String(
          message?.payload?.selectedTargetItemId || "",
        );
        const nextSelectedTargetGroupId = String(
          message?.payload?.selectedTargetGroupId || "",
        );
        const nextSelectedInsertIndex = String(
          message?.payload?.selectedInsertIndex || "0",
        );
        const nextSelectedGroupInsertIndex = String(
          message?.payload?.selectedGroupInsertIndex || "0",
        );

        const nextSelectedSourceSnapshot =
          message?.payload?.selectedSourceSnapshot || null;

        const nextInitialMode =
          String(message?.payload?.currentMode || "").trim() || "insert_entry";

        const parsed = parseMarkdownImport(sourceText, {
          filePath: sourceFilePath,
          fileName: String(options.sourceFileName || ""),
          noteType: String(
            options.noteData?.type || options.noteData?.noteType || "plot",
          ),
          mode: "insert_entry",
        });

        if (!parsed?.ok) {
          throw new Error(
            parsed?.error?.message ||
              "部分インポートの再読み込みに失敗しました。",
          );
        }

        const nextInsertSourceEntries = flattenSourceInsertables(
          parsed.parsedNote || {},
        );
        const nextReplaceSourceEntries = flattenSourceEntries(
          parsed.parsedNote || {},
        );

        const resolvedSelectedSourceItemId =
          nextInitialMode === "insert_entry"
            ? findSourceItemIdBySnapshot(
                nextSelectedSourceSnapshot,
                nextInsertSourceEntries,
              )
            : findSourceItemIdBySnapshot(
                nextSelectedSourceSnapshot,
                nextReplaceSourceEntries,
              );

        const latestNote = await readNoteFile(
          String(options.notePath || ""),
          String(
            options.noteData?.type || options.noteData?.noteType || "plot",
          ),
        );

        const nextNote = {
          ...options.noteData,
          ...latestNote,
        };

        const nextInsertTargetGroups = flattenTargetGroups(
          nextNote.groups || [],
          String(options.scopeGroupId || ""),
        );

        const nextReplaceTargetEntries = flattenTargetEntries(
          nextNote.groups || [],
          String(options.scopeGroupId || ""),
        );

        const nextDefaultTargetGroupId =
          String(options.defaultTargetGroupId || "") ||
          String(options.scopeGroupId || "") ||
          String(nextInsertTargetGroups[0]?.groupId || "");

        panel.webview.html = getHtml({
          initialMode: nextInitialMode,
          notePath: String(options.notePath || ""),
          sourceFilterText: nextSourceFilterText,
          sourceFilterType: nextSourceFilterType,
          selectedSourceItemId:
            resolvedSelectedSourceItemId || nextSelectedSourceItemId,
          selectedTargetItemId: nextSelectedTargetItemId,
          selectedTargetGroupId: nextSelectedTargetGroupId,
          selectedInsertIndex: nextSelectedInsertIndex,
          selectedGroupInsertIndex: nextSelectedGroupInsertIndex,
          sourceFilePath,
          sourceFileName: String(options.sourceFileName || ""),
          scopeGroupId: String(options.scopeGroupId || ""),
          noteTitle: String(options.noteTitle || ""),
          noteTypeLabel: String(options.noteTypeLabel || ""),
          scopeGroupTitle: String(options.scopeGroupTitle || ""),
          warnings: Array.isArray(parsed.previewData?.warnings)
            ? parsed.previewData.warnings
            : [],
          insertSourceEntries: nextInsertSourceEntries,
          replaceSourceEntries: nextReplaceSourceEntries,
          insertTargetGroups: nextInsertTargetGroups,
          replaceTargetEntries: nextReplaceTargetEntries,
          defaultTargetGroupId: nextDefaultTargetGroupId,
          defaultInsertIndex: "0",
        });

        options.initialMode = nextInitialMode;
        options.parsedNote = parsed.parsedNote;
        options.previewData = parsed.previewData;
        options.noteData = nextNote;

        options.sourceFilterText = nextSourceFilterText;
        options.sourceFilterType = nextSourceFilterType;
        options.selectedSourceItemId =
          resolvedSelectedSourceItemId || nextSelectedSourceItemId;
        options.selectedSourceSnapshot = nextSelectedSourceSnapshot;
        options.selectedTargetItemId = nextSelectedTargetItemId;
        options.selectedTargetGroupId = nextSelectedTargetGroupId;
        options.selectedInsertIndex = nextSelectedInsertIndex;
        options.selectedGroupInsertIndex = nextSelectedGroupInsertIndex;
        return;
      }

      if (message?.type === "applyPartialReplaceImport") {
        const picked = await vscode.window.showWarningMessage(
          "選択した項目の詳細を上書きします。メモは保持されます。",
          { modal: true },
          "上書きする",
        );

        if (picked !== "上書きする") {
          return;
        }

        const result =
          typeof options.onApply === "function"
            ? await options.onApply(message?.payload || {})
            : null;

        panel.webview.postMessage({
          type: "partialImportApplied",
          payload: {
            keepOpen: !!message?.payload?.keepOpen,
            sourceItemId: String(
              result?.sourceItemId ||
                message?.payload?.source?.sourceItemId ||
                "",
            ),
            message: String(result?.message || "反映しました。"),
          },
        });

        if (!message?.payload?.keepOpen) {
          panel.dispose();
        }

        return;
      }

      if (message?.type === "applyPartialInsertItem") {
        const sourceType = String(message?.payload?.source?.sourceType || "");
        const confirmMessage =
          sourceType === "group"
            ? "選択した大分類を指定位置へ挿入します。"
            : sourceType === "divider"
              ? "選択した区分を指定位置へ挿入します。"
              : "選択した項目を指定位置へ挿入します。";

        const picked = await vscode.window.showInformationMessage(
          confirmMessage,
          { modal: true },
          "挿入する",
        );

        if (picked !== "挿入する") {
          return;
        }

        const result =
          typeof options.onApply === "function"
            ? await options.onApply(message?.payload || {})
            : null;

        panel.webview.postMessage({
          type: "partialImportApplied",
          payload: {
            keepOpen: !!message?.payload?.keepOpen,
            sourceItemId: String(
              result?.sourceItemId ||
                message?.payload?.source?.sourceItemId ||
                "",
            ),
            message: String(result?.message || "反映しました。"),
          },
        });

        if (!message?.payload?.keepOpen) {
          panel.dispose();
        }

        return;
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `部分インポートに失敗しました: ${error.message || error}`,
      );
    }
  });

  panel.onDidDispose(() => {
    if (openPartialImportPanels.get(key) === panel) {
      openPartialImportPanels.delete(key);
    }
  });

  return panel;
}

module.exports = {
  openNotePartialImportWebview,
};
