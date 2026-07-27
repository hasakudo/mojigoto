const vscode = require("vscode");
const fs = require("fs/promises");
const { getNonce, escapeHtml } = require("../core/path-utils");
const { createNewNote, saveNoteFile } = require("../data/note-store");
const { parseMarkdownImport } = require("../import/note-markdown-import");

const openImportPanels = new Map();

function getImportPanelKey(options = {}) {
  return [
    String(options.noteType || ""),
    String(options.mode || ""),
    String(options.sourceFilePath || ""),
    String(options.existingNotePath || ""),
  ].join("::");
}

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
<style>
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
</style>
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
      ${
        String(initialData.mode || "") === "note_import"
          ? `<div class="muted">置換は内容がすべて上書きされます。必要なメモは事前に構想メモへコピーしてください。</div>`
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

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const initialData = ${dataJson};

    const titleInput = document.getElementById("noteTitleInput");
    const warningListEl = document.getElementById("warningList");
    const warningsCardEl = document.getElementById("warningsCard");
    const previewRoot = document.getElementById("previewRoot");
    const btnActions = document.getElementById("btnActions");
    const expandAllBtn = document.getElementById("expandAllBtn");
    const collapseAllBtn = document.getElementById("collapseAllBtn");

    const openSourceFileBtn = document.getElementById("openSourceFileBtn");
    const reloadImportSourceBtn = document.getElementById("reloadImportSourceBtn");
    const openSourceFileBtnSecondary = document.getElementById("openSourceFileBtnSecondary");
    const reloadImportSourceBtnSecondary = document.getElementById("reloadImportSourceBtnSecondary");

    const importShellEl = document.querySelector(".importShell");
    const importTopCardEl = document.querySelector(".importTopCard");
    const previewCardEl = previewRoot?.closest(".card");

    const hideWarningsBtn = document.getElementById("hideWarningsBtn");
    const showWarningsBtn = document.getElementById("showWarningsBtn");
    const warningsCollapsedCardEl = document.getElementById("warningsCollapsedCard");
    const warningsCollapsedTextEl = document.getElementById("warningsCollapsedText");

    const previewGroups = Array.isArray(initialData?.previewData?.preview?.groups)
      ? initialData.previewData.preview.groups
      : [];

    const warnings = Array.isArray(initialData?.previewData?.warnings)
      ? initialData.previewData.warnings
      : [];

    const expandedEntryIds = new Set();

    let warningsHidden = false;

    function esc(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function renderInlineBadges(importMeta) {
      const badges = [];

      if (importMeta?.supplemented) {
        badges.push('<span class="inlineBadge">補完</span>');
      }

      return badges.length
        ? \`<span class="inlineBadges">\${badges.join("")}</span>\`
        : "";
    }

    function renderWarnings() {
      if (!warnings.length) {
        warningsCardEl.hidden = true;
        warningsCollapsedCardEl.hidden = true;
        warningListEl.innerHTML = "";
        syncPreviewHeight();
        return;
      }

      if (warningsHidden) {
        warningsCardEl.hidden = true;
        warningsCollapsedCardEl.hidden = false;
        if (warningsCollapsedTextEl) {
          warningsCollapsedTextEl.textContent = \`警告を閉じています。（\${warnings.length}件）\`;
        }
        syncPreviewHeight();
        return;
      }

      warningsCardEl.hidden = false;
      warningsCollapsedCardEl.hidden = true;
      warningListEl.innerHTML = warnings
        .map((warning) => {
          const isAttention = String(warning?.level || "") === "attention";
          const sampleLine = String(warning?.sampleLine || "").trim();

          return \`
            <div class="warningItem">
              <div class="warningHeaderLine">
                \${isAttention ? '<span class="warningFlag">要確認</span>' : ""}
                <span>\${esc(warning?.message || "")}</span>
              </div>
              \${sampleLine ? \`<div class="warningSample">\${esc(sampleLine)}</div>\` : ""}
            </div>
          \`;
        })
        .join("");

      syncPreviewHeight();
    }

    function syncPreviewHeight() {
      if (!previewRoot || !previewCardEl) return;

      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      if (!viewportHeight) return;

      const previewTop = previewRoot.getBoundingClientRect().top;
      const bottomGap = 24;

      const available = Math.floor(viewportHeight - previewTop - bottomGap);

      const nextMaxHeight = Math.max(180, available);
      previewRoot.style.maxHeight = \`\${nextMaxHeight}px\`;
    }

    function renderPreview() {
      previewRoot.innerHTML = previewGroups.map((group) => {
        const items = Array.isArray(group?.items) ? group.items : [];

        const itemsHtml = items.map((item) => {
          if (item?.kind === "divider") {
            return \`
              <div class="previewDivider">
                <div class="previewDividerLabel">
                  区分: \${esc(item.label || "無題区分")}
                  \${renderInlineBadges(item?.importMeta)}
                </div>
                \${item.value ? \`<div class="previewDividerValue">\${esc(item.value)}</div>\` : ""}
              </div>
            \`;
          }

          const entryId = String(item?.id || "");
          const expanded = expandedEntryIds.has(entryId);

          return \`
            <div class="previewEntry">
              <div class="previewEntryHead">
                <div style="min-width:0;">
                  <div class="previewEntryTitle">
                    項目: \${esc(item?.heading || "無題項目")}
                    \${renderInlineBadges(item?.importMeta)}
                  </div>
                  \${!expanded ? \`<div class="previewEntryLine">\${esc(item?.previewLine || "")}</div>\` : ""}
                </div>
                <button
                  type="button"
                  class="secondary"
                  data-action="toggleEntry"
                  data-entry-id="\${esc(entryId)}"
                >\${expanded ? "閉じる" : "開く"}</button>
              </div>
              \${expanded ? \`<div class="previewEntryBody">\${esc(item?.body || "")}</div>\` : ""}
            </div>
          \`;
        }).join("");

        return \`
          <section class="previewGroup">
            <div class="previewGroupTitle">
              大分類: \${esc(group?.title || "無題大分類")}
              \${renderInlineBadges(group?.importMeta)}
            </div>
            \${itemsHtml || '<div class="muted">内容がありません。</div>'}
          </section>
        \`;
      }).join("");

      syncPreviewHeight();
    }

    function postOpenSourceFile() {
      vscode.postMessage({ type: "openSourceFile" });
    }

    function postReloadImportSource() {
      vscode.postMessage({ type: "reloadImportSource" });
    }

    openSourceFileBtn?.addEventListener("click", postOpenSourceFile);
    reloadImportSourceBtn?.addEventListener("click", postReloadImportSource);
    openSourceFileBtnSecondary?.addEventListener("click", postOpenSourceFile);
    reloadImportSourceBtnSecondary?.addEventListener("click", postReloadImportSource);

    function renderFooterActions() {
      const mode = String(initialData?.mode || initialData?.previewData?.target?.mode || "tree_create");
      const existingTitle = String(initialData?.existingNoteTitle || initialData?.previewData?.target?.existingNoteTitle || "").trim();

      const buttons = [];

      if (mode === "note_import") {
        buttons.push(\`
          <button type="button" id="replaceBtn">「\${esc(existingTitle || "現在のノート")}」を置換</button>
        \`);
        buttons.push(\`
          <button type="button" class="secondary" id="createBtn">新規作成</button>
        \`);
      } else {
        buttons.push(\`
          <button type="button" id="createBtn">ノートを新規作成</button>
        \`);
      }

      buttons.push(\`
        <button type="button" class="secondary" id="cancelBtn">閉じる</button>
      \`);

      btnActions.innerHTML = buttons.join("");

      document.getElementById("createBtn")?.addEventListener("click", () => {
        vscode.postMessage({
          type: "confirmImportCreate",
          payload: {
            title: String(titleInput?.value || "").trim(),
          },
        });
      });

      document.getElementById("replaceBtn")?.addEventListener("click", () => {
        vscode.postMessage({
          type: "confirmImportReplace",
          payload: {
            title: String(titleInput?.value || "").trim(),
          },
        });
      });

      document.getElementById("cancelBtn")?.addEventListener("click", () => {
        vscode.postMessage({ type: "cancelImport" });
      });

      syncPreviewHeight();
    }

    previewRoot.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-action='toggleEntry']");
      if (!btn) return;

      const entryId = String(btn.dataset.entryId || "");
      if (!entryId) return;

      if (expandedEntryIds.has(entryId)) {
        expandedEntryIds.delete(entryId);
      } else {
        expandedEntryIds.add(entryId);
      }

      renderPreview();
    });

    expandAllBtn.addEventListener("click", () => {
      previewGroups.forEach((group) => {
        (Array.isArray(group?.items) ? group.items : []).forEach((item) => {
          if (item?.kind === "entry" && item?.id) {
            expandedEntryIds.add(String(item.id));
          }
        });
      });
      renderPreview();
    });

    collapseAllBtn.addEventListener("click", () => {
      expandedEntryIds.clear();
      renderPreview();
    });

    hideWarningsBtn?.addEventListener("click", () => {
      warningsHidden = true;
      renderWarnings();
    });

    showWarningsBtn?.addEventListener("click", () => {
      warningsHidden = false;
      renderWarnings();
    });

    renderWarnings();
    renderPreview();
    renderFooterActions();
    syncPreviewHeight();

    window.addEventListener("resize", syncPreviewHeight);
  </script>
</body>
</html>`;
}

async function openNoteImportWebview(context, treeProvider, options = {}) {
  const key = getImportPanelKey(options);
  const existing = openImportPanels.get(key);

  if (existing) {
    existing.reveal(undefined, true);
    return existing;
  }

  const panel = vscode.window.createWebviewPanel(
    "mojigoto.noteImport",
    getImportPanelTitle(options.noteType),
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    },
  );

  openImportPanels.set(key, panel);

  panel.webview.html = getImportHtml({
    sourceFilePath: String(options.sourceFilePath || ""),
    noteType: String(options.noteType || "plot"),
    mode: String(options.mode || "tree_create"),
    existingNotePath: String(options.existingNotePath || ""),
    existingNoteTitle: String(options.existingNoteTitle || ""),
    workDir: String(options.workDir || ""),
    workName: String(options.workName || ""),
    workTitle: String(options.workTitle || ""),
    previewData: options.previewData || {},
    parsedNote: options.parsedNote || {},
  });

  panel.webview.onDidReceiveMessage(async (message) => {
    try {
      if (message?.type === "cancelImport") {
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

        const parsed = parseMarkdownImport(sourceText, {
          filePath: sourceFilePath,
          fileName: String(options.previewData?.source?.fileName || ""),
          noteType: String(options.noteType || "plot"),
          mode: String(options.mode || "tree_create"),
        });

        if (!parsed?.ok) {
          throw new Error(
            parsed?.error?.message ||
              "インポート元ファイルの再読み込みに失敗しました。",
          );
        }

        options.parsedNote = parsed.parsedNote;
        options.previewData = parsed.previewData;

        panel.webview.html = getImportHtml({
          sourceFilePath: String(options.sourceFilePath || ""),
          noteType: String(options.noteType || "plot"),
          mode: String(options.mode || "tree_create"),
          existingNotePath: String(options.existingNotePath || ""),
          existingNoteTitle: String(options.existingNoteTitle || ""),
          workDir: String(options.workDir || ""),
          workName: String(options.workName || ""),
          workTitle: String(options.workTitle || ""),
          previewData: options.previewData || {},
          parsedNote: options.parsedNote || {},
        });

        return;
      }

      if (message?.type === "confirmImportCreate") {
        const title =
          String(message?.payload?.title || "").trim() ||
          String(options?.previewData?.titleCandidate || "").trim() ||
          "インポートノート";

        const sourceNote = options?.parsedNote || {};
        const groups = Array.isArray(sourceNote?.groups)
          ? sourceNote.groups
          : [];

        const created = await createNewNote(
          String(options.noteType || "plot"),
          {
            fsPath: String(options.workDir || ""),
            workName: String(options.workName || ""),
            workTitle: String(options.workTitle || ""),
          },
          title,
        );

        await saveNoteFile(created.filePath, {
          ...(created.note || {}),
          title,
          type: String(options.noteType || "plot"),
          groups,
        });

        vscode.window.showInformationMessage(
          `もじごと: ノート「${title}」を作成しました。`,
        );

        panel.dispose();

        const { openNoteWebview } = require("./note-webview");
        await openNoteWebview(context, treeProvider, {
          filePath: created.filePath,
          type: String(options.noteType || "plot"),
          workDir: String(options.workDir || ""),
          workName: String(options.workName || ""),
          workTitle: String(options.workTitle || ""),
        });

        treeProvider?.refresh();
        return;
      }

      if (message?.type === "confirmImportReplace") {
        const existingNotePath = String(options.existingNotePath || "").trim();
        if (!existingNotePath) {
          vscode.window.showErrorMessage("置換対象のノートが見つかりません。");
          return;
        }

        const title =
          String(message?.payload?.title || "").trim() ||
          String(options?.existingNoteTitle || "").trim() ||
          String(options?.previewData?.titleCandidate || "").trim() ||
          "インポートノート";

        const sourceNote = options?.parsedNote || {};
        const replacePayload = {
          title,
          type: String(options.noteType || "plot"),
          groups: Array.isArray(sourceNote?.groups) ? sourceNote.groups : [],
        };

        const picked = await vscode.window.showWarningMessage(
          `ノート「${title}」の内容を置換します。現在のノート内容はすべて上書きされます。`,
          { modal: true },
          "置換する",
        );

        if (picked !== "置換する") {
          return;
        }

        await saveNoteFile(existingNotePath, replacePayload);

        vscode.window.showInformationMessage(
          `もじごと: ノート「${title}」を置換しました。`,
        );

        const { notifyNoteUpdated } = require("./note-webview");
        await notifyNoteUpdated(existingNotePath);

        treeProvider?.refresh();
        panel.dispose();
        return;
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `インポートに失敗しました: ${error.message || error}`,
      );
    }
  });

  panel.onDidDispose(() => {
    if (openImportPanels.get(key) === panel) {
      openImportPanels.delete(key);
    }
  });

  return panel;
}

module.exports = {
  openNoteImportWebview,
};
