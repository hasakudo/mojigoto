const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const openNotePanels = new Map();
const openNotePanelsByPath = new Map();
let activeNotePanel = null;
const { isSingleMode } = require("../core/mojigoto-context");
const {
  getMojigotoDirForSingle,
  getMojigotoDirForWork,
} = require("../core/mojigoto-paths");
const {
  getCurrentWorkDisplayName,
  getCurrentWorkTitleFromSettings,
} = require("../work/work-settings");
const { notifyConceptMemoUpdated } = require("./concept-memo-webview");
const {
  createConceptMemoFromNoteItem,
  updateConceptMemoSourceStatus,
  markConceptMemosMissingByNotePath,
} = require("../data/concept-memo-store");
const {
  saveUserTemplate,
  saveUserGroupTemplate,
  listUserTemplates,
  deleteUserTemplateById,
} = require("../data/user-note-templates");
const { readNoteFile, saveNoteFile } = require("../data/note-store");
const {
  getInputAssistToolbarCss,
  getInputAssistToolbarHtml,
  getInputAssistToolbarScript,
} = require("./shared/input-assist-toolbar");
const { getTemplateItems } = require("../data/note-templates");
const { exportTreeItem } = require("../export/export-service");
const css = fs.readFileSync(
  path.join(__dirname, "note-webview/note-webview.css"),
  "utf8",
);
const {
  getTemplatePanelScript,
} = require("./note-webview/script-template-panel");
const { getPreviewScript } = require("./note-webview/script-preview");
const { getUtilsScript } = require("./note-webview/script-utils");
const { getGroupsScript } = require("./note-webview/script-groups");
const { getEventsScript } = require("./note-webview/script-events");
const { getViewStateScript } = require("./note-webview/script-view-state");
const { getUiPanelsScript } = require("./note-webview/script-ui-panels");
const { getNavigationScript } = require("./note-webview/script-navigation");
const { getBoardScript } = require("./note-webview/script-board");
const { getNonce, escapeHtml } = require("../core/path-utils");

function escapeScriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function getPanelTitle(note) {
  const kind = note.type === "plot" ? "プロット" : "資料";
  return note.title ? `${kind}: ${note.title}` : kind;
}

function getNoteWebviewHtml(note, webview) {
  const nonce = getNonce();
  const noteJson = escapeScriptJson(note);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(getPanelTitle(note))}</title>
<style>
${css}
${getInputAssistToolbarCss()}
</style>
</head>
<body>
  <div id="noteShell" class="noteShell">
    <div class="paneHeader paneHeaderGlobal">
      <div class="paneHeaderLeft">
        <h1 class="paneTitle">
          ${escapeHtml(note.type === "plot" ? "プロット" : "資料")}編集
          <span id="dirtyMark" class="dirtyMark" hidden>*</span>
        </h1>

        <div class="topbarGroupActions">
          <button class="secondary" type="button" id="expandAllBtn">すべて開く <span class="kbdHint">Alt+Shift+P</span></button>
          <button class="secondary" type="button" id="collapseAllBtn">すべて畳む <span class="kbdHint">Alt+Shift+L</span></button>
        </div>

        <div class="menuWrap">
          <button class="secondary menuButton" type="button" id="moreMenuBtn" aria-label="メニュー">
            ︙
          </button>

          <div id="moreMenuPanel" class="moreMenuPanel" hidden>
            <button class="menuItem" type="button" data-menu-action="saveTemplate">
              テンプレートとして保存
            </button>
            <button class="menuItem" type="button" data-menu-action="toggleTemplateList">
              テンプレート一覧
              <span class="kbdHint">Ctrl/Cmd+Alt+T</span>
            </button>
            <button class="menuItem" type="button" data-menu-action="toggleSearch">
              ノート検索
              <span class="kbdHint">Ctrl/Cmd+F</span>
            </button>
            <button class="menuItem" type="button" data-menu-action="toggleCopyPanel">
              他ノートからコピー
              <span class="kbdHint">Alt+Shift+N</span>
            </button>
            
            <div class="menuDivider"></div>

            <button class="menuItem" type="button" data-menu-action="exportNote">
              書き出し…
              <span class="kbdHint">.txt/.md/.csv/.html</span>
            </button>

            <button
              class="menuItem"
              type="button"
              id="importNoteBtn"
              data-menu-action="importNote"
            >
              インポート…
              <span class="kbdHint">.md</span>
            </button>

            <div class="menuDivider"></div>

            <button class="menuItem" type="button" data-menu-action="closeNote">
              ノートを閉じる
              <span class="kbdHint">Ctrl/Cmd+W</span>
            </button>
            <button class="menuItem menuItemDanger" type="button" data-menu-action="deleteNote">
              ノートを削除
            </button>
          </div>
        </div>
      </div>

      <div class="paneHeaderRight">
        <div id="dirtyBadge" class="dirtyBadge" hidden>未保存</div>
        <button
          class="secondary previewJumpBtn"
          type="button"
          id="jumpToPreviewTopBtn"
          title="プレビュー先頭へ移動"
        >
          プレビューへ
        </button>

        <button
          class="secondary"
          type="button"
          id="toggleEditorPaneBtn"
          title="編集ペインの表示を切り替え"
        >
          編集を隠す
        </button>
      </div>
    </div>

    <div id="toastStatus" class="toastStatus" aria-live="polite"></div>
    <div id="globalPanelsRoot" class="globalPanelsRoot">
      <div id="searchPanel" class="searchPanel" hidden>
        <div class="searchRow">
          <input
            id="noteSearchInput"
            type="text"
            placeholder="大分類名・区分・項目名・詳細を検索"
          />

          <div class="searchActions">
            <button class="secondary" type="button" id="clearSearchBtn">クリア</button>
            <button class="secondary" type="button" id="closeSearchBtn">
            閉じる
            <span class="kbdHint">Esc</span>
            </button>
          </div>
        </div>
      </div>

      <div id="templatePanel" class="templatePanel" hidden>
        <div class="templatePanelInner">
          <div class="templatePanelHead">
            <div class="templatePanelTitle">テンプレート一覧</div>
            <button class="secondary" type="button" id="closeTemplatePanelBtn">
            閉じる
            <span class="kbdHint">Esc</span>
            </button>
          </div>
          <div id="templatePanelMessage" class="templatePanelMessage" hidden></div>
          <div class="templateInsertTarget" id="templateInsertTarget"></div>
          <div id="templateList" class="templateList"></div>
          <div class="templateHelp">置き換えはテンプレートの内容ですべて上書きされます。</div>
        </div>
      </div>
    </div>

    <div id="noteAppRoot" class="layout">
      <section class="card editorPane">
        <div class="row">
            <label class="label" for="noteTitle">タイトル</label>
            <input id="noteTitle" class="noteTitleInput" type="text" />
        </div>

        <div class="toolbar">
          <button class="secondary" type="button" id="addGroupBtn">＋大分類</button>
          <button
            class="secondary"
            type="button"
            id="toggleAllImagesBtn"
            title="このノート全体の画像一覧を開く"
          >
            画像一覧
          </button>
        </div>

        <div class="panelMeta" id="editorCounts"></div>
        <div class="searchNotice" id="editorSearchNotice" hidden></div>
        <div id="groups"></div>

        <div class="actions">
          <button class="secondary" type="button" id="addGroupBtnBottom">＋大分類</button>
        </div>
      </section>

      <aside class="card previewPane">
        <div class="previewHead">
          <div class="previewHeadInfo">
            <div class="panelTitle">プレビュー</div>
            <div class="panelHint">項目をクリックすると編集位置へ移動します</div>
            <div class="panelMeta" id="previewCounts"></div>
          </div>

          <div class="previewModeToggle">
            <button class="secondary isActive" type="button" id="previewListBtn">リスト</button>
            <button class="secondary" type="button" id="previewBoardBtn">ボード</button>
            <button class="secondary" type="button" id="openBoardBtn" title="ボードを全画面で表示">全画面</button>
          </div>

          <div class="searchNotice previewSearchNotice" id="previewSearchNotice" hidden></div>
        </div>
        <div id="preview"></div>
        <div id="previewBoardRoot" class="noteBoardRoot noteBoardRootInline" hidden></div>
      </aside>
    </div>

    <div id="noteBoardPanel" class="noteBoardPanel" hidden>
      <header class="noteBoardHead">
        <div class="noteBoardHeadText">
          <div class="noteBoardTitle">ノートボード</div>
          <div class="noteBoardHint">大分類ごとにカードを横並びで確認します。カード本文はクリックで開閉できます。</div>
        </div>

        <div class="noteBoardSearch">
          <input
            id="noteBoardSearchInput"
            type="text"
            placeholder="ボード内を検索"
          />
          <button
            class="secondary"
            type="button"
            id="clearBoardSearchBtn"
          >
            検索クリア
          </button>
        </div>

        <div class="noteBoardSaveArea">
          <div id="boardDirtyBadge" class="dirtyBadge noteBoardDirtyBadge" hidden>
            未保存
          </div>

          <button
            class="primary noteBoardSaveBtn"
            type="button"
            id="boardSaveBtn"
          >
            保存
            <span class="kbdHint">Ctrl/Cmd+S</span>
          </button>
        </div>

        <div class="noteBoardCloseArea">
          <button
            class="secondary noteBoardCloseBtn"
            type="button"
            id="closeBoardBtn"
            data-action="closeBoard"
          >
            ボードを閉じる
            <span class="kbdHint">Esc</span>
          </button>
        </div>
      </header>

      <div id="noteBoardSearchNotice" class="noteBoardSearchNotice" hidden></div>

      <div id="noteBoardRoot" class="noteBoardRoot"></div>
    </div>

    <footer class="noteFooterBar">
      <button class="primary" type="button" id="saveBtn">
        保存
        <span class="kbdHint">Ctrl/Cmd+S</span>
      </button>
      <button class="secondary" type="button" id="closeBtn">
        閉じる
        <span class="kbdHint">Ctrl/Cmd+W</span>
      </button>

      <button
        class="secondary"
        type="button"
        id="toggleInputAssistBtn"
        aria-expanded="false"
      >
        入力補助
      </button>

      <button class="danger" type="button" id="deleteNoteBtn">ノートを削除</button>

      <div id="noteAssistPanel" class="noteAssistPanel" hidden>
        ${getInputAssistToolbarHtml({
          rootId: "noteInputAssistToolbar",
          title: "入力補助",
          showToggle: false,
          showHeader: false,
          collapsed: false,
        })}
      </div>
    </footer>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const initial = ${noteJson};
    const groupsRoot = document.getElementById("groups");
    const previewRoot = document.getElementById("preview");

    const noteAppRoot = document.getElementById("noteAppRoot");
    const toggleEditorPaneBtn = document.getElementById("toggleEditorPaneBtn");
    const jumpToPreviewTopBtn = document.getElementById("jumpToPreviewTopBtn");

    const toastStatusEl = document.getElementById("toastStatus");
    const titleInput = document.getElementById("noteTitle");

    const dirtyBadgeEl = document.getElementById("dirtyBadge");
    const dirtyMarkEl = document.getElementById("dirtyMark");

    const moreMenuBtn = document.getElementById("moreMenuBtn");
    const moreMenuPanel = document.getElementById("moreMenuPanel");
    const importNoteBtn = document.getElementById("importNoteBtn");

    const templatePanelEl = document.getElementById("templatePanel");
    const closeTemplatePanelBtn = document.getElementById("closeTemplatePanelBtn");
    const templateListRoot = document.getElementById("templateList");
    const templatePanelMessageEl = document.getElementById("templatePanelMessage");

    const searchPanelEl = document.getElementById("searchPanel");
    const noteSearchInput = document.getElementById("noteSearchInput");
    const clearSearchBtn = document.getElementById("clearSearchBtn");
    const closeSearchBtn = document.getElementById("closeSearchBtn");

    const previewListBtn = document.getElementById("previewListBtn");
    const previewBoardBtn = document.getElementById("previewBoardBtn");
    const toggleAllImagesBtn = document.getElementById("toggleAllImagesBtn");

    const previewBoardRoot = document.getElementById("previewBoardRoot");
    const previewPane = document.querySelector(".previewPane");

    const openBoardBtn = document.getElementById("openBoardBtn");
    const noteBoardPanel = document.getElementById("noteBoardPanel");
    const noteBoardRoot = document.getElementById("noteBoardRoot");
    const closeBoardBtn = document.getElementById("closeBoardBtn");

    const noteBoardSearchInput = document.getElementById("noteBoardSearchInput");
    const clearBoardSearchBtn = document.getElementById("clearBoardSearchBtn");

    const noteBoardSearchNoticeEl = document.getElementById("noteBoardSearchNotice");

    const boardDirtyBadgeEl = document.getElementById("boardDirtyBadge");
    const boardSaveBtn = document.getElementById("boardSaveBtn");

    const previewCountsEl = document.getElementById("previewCounts");
    const editorCountsEl = document.getElementById("editorCounts");
    const editorSearchNoticeEl = document.getElementById("editorSearchNotice");
    const previewSearchNoticeEl = document.getElementById("previewSearchNotice");

    const previewModeStorageKey = (() => {
      const filePath = String(initial?.filePath || "").trim();
      const noteType = String(initial?.type || initial?.noteType || "").trim();
      const fallbackTitle = String(initial?.title || "").trim();

      if (filePath) {
        return \`mojigoto.previewMode:\${filePath}\`;
      }

      return \`mojigoto.previewMode:\${noteType}:\${fallbackTitle}\`;
    })();

    const collapsedGroupsStorageKey = (() => {
      const filePath = String(initial?.filePath || "").trim();
      const noteType = String(initial?.type || initial?.noteType || "").trim();
      const fallbackTitle = String(initial?.title || "").trim();

      if (filePath) {
        return \`mojigoto.collapsedGroups:\${filePath}\`;
      }

      return \`mojigoto.collapsedGroups:\${noteType}:\${fallbackTitle}\`;
    })();

    const scrollStorageKey = (() => {
      const filePath = String(initial?.filePath || "").trim();
      const noteType = String(initial?.type || initial?.noteType || "").trim();
      const fallbackTitle = String(initial?.title || "").trim();

      if (filePath) {
        return \`mojigoto.scroll:\${filePath}\`;
      }

      return \`mojigoto.scroll:\${noteType}:\${fallbackTitle}\`;
    })();

    const previewOnlyStorageKey = (() => {
      const filePath = String(initial?.filePath || "").trim();
      const noteType = String(initial?.type || initial?.noteType || "").trim();
      const fallbackTitle = String(initial?.title || "").trim();

      if (filePath) {
        return \`mojigoto.previewOnly:\${filePath}\`;
      }

      return \`mojigoto.previewOnly:\${noteType}:\${fallbackTitle}\`;
    })();

    let dirty = false;
    let collapsedGroupIds = new Set();
    let isMoreMenuOpen = false;
    
    let isTemplatePanelOpen = false;
    let templateListState = [];
    let openTemplatePreviewId = "";
    let templateTargetGroupId = "";
    let templatePreviewId = "";
    let templateInsertMode = "group";

    let lastActiveGroupId = "";
    let openGroupMoreMenuId = "";
    let openItemMoreMenuId = "";
    let openItemMemoId = "";
    let openImageGalleryGroupId = "";

    let pendingTemplateInsertAfterGroupId = "";
    let pendingTemplateInsertAfterGroupTitle = "";

    let pendingTemplateInsertIntoGroupId = "";
    let pendingTemplateInsertIntoGroupTitle = "";

    let pendingTemplateInsertAfterItemId = "";
    let pendingTemplateInsertAfterItemTitle = "";
    let pendingTemplateInsertAfterItemGroupId = "";
    let pendingTemplateInsertAfterItemGroupTitle = "";

    let hasShownMenuHint = false;
    let searchQuery = "";
    let isSearchOpen = false;

    let movePickerState = {
      groupId: "",
      itemId: "",
      targetGroupId: "",
      insertIndex: "",
    };

    let previewMode = "list";
    let isPreviewOnly = false;

    let isBoardOpen = false;
    let expandedBoardItemIds = new Set();

    let boardMovePickerState = {
      groupId: "",
      itemId: "",
      targetGroupId: "",
      insertPosition: "end",
    };

    let boardDividerMovePickerState = {
      groupId: "",
      dividerId: "",
      targetGroupId: "",
      insertPosition: "end",
    };

    let boardDragState = {
      groupId: "",
      itemId: "",
      overItemId: "",
      dropPosition: "",
    };

    let boardDividerDragState = {
      groupId: "",
      dividerId: "",
      overDividerId: "",
      dropPosition: "",
    };

    let toastTimer = null;
    let suppressNextNoteSavedMessage = false;

    let state = {
      ...initial,
      groups: Array.isArray(initial?.groups)
        ? initial.groups.map(normalizeGroup)
        : [],
    };

    if (!state.groups.length) {
      state.groups = [createGroup()];
    }

    titleInput.value = state.title || "";

    persistWebviewState();

    // =========================
    // Script Modules
    // =========================

    // core
    ${getUtilsScript()}
    ${getViewStateScript()}
    ${getUiPanelsScript()}

    // panels
    ${getTemplatePanelScript()}

    // editor / preview
    ${getGroupsScript()}
    ${getNavigationScript()}
    ${getPreviewScript()}
    ${getBoardScript()}

    // events (最後)
    ${getEventsScript()}

    // =========================
    // Core UI / State Functions
    // =========================

    function updateSearchNotice(targetEl, options = {}) {
      if (!targetEl) return;

      const text = buildSearchNoticeText(options);
      const visible = !!text;

      targetEl.hidden = !visible;
      targetEl.textContent = visible ? text : "";
    }

    function updateSearchNotices() {
      updateSearchNotice(editorSearchNoticeEl);
      updateSearchNotice(previewSearchNoticeEl, { includeCardHint: true });
    }

    function updateEditorCounts(groups) {
      if (!editorCountsEl) return;
      editorCountsEl.textContent = buildCountsText(groups);
      updateSearchNotices();
    }

    function updateDirtyUi() {
      if (dirtyBadgeEl) dirtyBadgeEl.hidden = !dirty;
      if (dirtyMarkEl) dirtyMarkEl.hidden = !dirty;
      if (boardDirtyBadgeEl) boardDirtyBadgeEl.hidden = !dirty;
    }

    function markDirty() {
      dirty = true;
      updateDirtyUi();
    }

    function clearDirty() {
      dirty = false;
      updateDirtyUi();
    }

    function refreshViewsAfterItemMemoChange(itemId, updatedAt = "") {
      if (itemId && typeof updateItemMemoMeta === "function") {
        updateItemMemoMeta(itemId, updatedAt);
      }

      renderPreview();

      if (isBoardOpen) {
        renderBoard();
      }
    }

    function setStatus(message, useToast = false) {
      if (!toastStatusEl) return;

      if (!useToast || !message) {
        toastStatusEl.classList.remove("isVisible");
        toastStatusEl.textContent = "";
        return;
      }

      if (toastTimer) {
        clearTimeout(toastTimer);
        toastTimer = null;
      }

      toastStatusEl.textContent = message;
      toastStatusEl.classList.add("isVisible");

      toastTimer = setTimeout(() => {
        toastStatusEl.classList.remove("isVisible");
        toastStatusEl.textContent = "";
      }, 1800);
    }

    function clearStatus() {
      if (!toastStatusEl) return;
      toastStatusEl.classList.remove("isVisible");
      toastStatusEl.textContent = "";
    }

    function collectPayload() {
      return {
        ...state,
        title: titleInput.value,
        groups: state.groups
      };
    }

    function saveCurrentNote(options = {}) {
      const { silentStatus = false } = options;

      if (!silentStatus) {
        setStatus("保存中...", true);
      }

      vscode.postMessage({
        type: "save",
        payload: collectPayload()
      });
    }

    function stabilizePreviewRender() {
      const rerender = () => {
        renderPreview();
        loadScrollPositions();
      };

      rerender();

      requestAnimationFrame(() => {
        rerender();

        requestAnimationFrame(() => {
          rerender();
        });
      });

      setTimeout(rerender, 80);
      setTimeout(rerender, 180);
    }

    getEditorScrollEl()?.addEventListener("scroll", saveScrollPositions);
    getPreviewScrollEl()?.addEventListener("scroll", saveScrollPositions);

    // addons
    ${getInputAssistToolbarScript({
      rootId: "noteInputAssistToolbar",
      targetSelector: [
        "#noteTitle",
        ".groupTitleInput",
        ".dividerLabelInput",
        ".dividerValueInput",
        ".itemHeadingInput",
        ".itemBodyInput",
        ".itemMemoBodyInput",
        ".itemMemoTagsInput",
      ].join(", "),
      toastFunctionName: "setStatus",
    })}

    const noteAssistPanel = document.getElementById("noteAssistPanel");
    const toggleInputAssistBtn = document.getElementById("toggleInputAssistBtn");
    const INPUT_ASSIST_STATE_KEY = "note.inputAssist.open";

    function setInputAssistOpen(isOpen) {
      if (!noteAssistPanel || !toggleInputAssistBtn) return;

      noteAssistPanel.hidden = !isOpen;
      toggleInputAssistBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
      toggleInputAssistBtn.classList.toggle("isActive", isOpen);

      try {
        localStorage.setItem(INPUT_ASSIST_STATE_KEY, isOpen ? "1" : "0");
      } catch {}
    }

    toggleInputAssistBtn?.addEventListener("click", () => {
      const nextOpen = noteAssistPanel?.hidden !== false;
      setInputAssistOpen(nextOpen);
    });

    registerNoteEvents();

    const noteInputAssist = createInputAssistController();

    try {
      const saved = localStorage.getItem(INPUT_ASSIST_STATE_KEY);
      setInputAssistOpen(saved === "1");
    } catch {
      setInputAssistOpen(false);
    }

    if (!hasShownMenuHint) {
      hasShownMenuHint = true;
      setStatus("検索や書き出し、テンプレート適用などは「︙」から行えます。", true);
    }

    setMoreMenuOpen(false);
    setTemplatePanelOpen(false);
    setSearchOpen(false);

    loadPreviewMode();
    loadCollapsedGroups();
    loadPreviewOnly();

    renderGroups();
    updateDirtyUi();
    applyPreviewOnly();

    stabilizePreviewRender();

    setTimeout(() => {
      if (!document.hidden) {
        stabilizePreviewRender();
      }
    }, 300);

    persistWebviewState();
  </script>
</body>
</html>`;
}

function resolveWorkTitle(panel, context) {
  return (
    String(panel.__mojigotoWorkTitle || "").trim() ||
    String(getCurrentWorkTitleFromSettings(context) || "").trim() ||
    String(getCurrentWorkDisplayName(context) || "").trim()
  );
}

async function closeNoteWebviewByPath(filePath) {
  if (!filePath) return false;

  const normalizedFilePath = path.normalize(filePath);
  const panel = openNotePanelsByPath.get(normalizedFilePath);

  if (!panel) {
    return false;
  }

  try {
    panel.dispose();
    return true;
  } catch {
    return false;
  }
}

async function notifyNoteUpdated(filePath) {
  if (!filePath) return false;

  const normalizedFilePath = path.normalize(filePath);
  const panel = openNotePanelsByPath.get(normalizedFilePath);
  if (!panel) {
    return false;
  }

  const fallbackType = panel.__mojigotoNoteType || "plot";
  const latestNote = await readNoteFile(filePath, fallbackType);

  const nextNote = {
    ...latestNote,
    filePath,
    type: fallbackType,
    noteType: fallbackType,
    workDir: panel.__mojigotoWorkDir || "",
    workName: panel.__mojigotoWorkName || "",
    workTitle: panel.__mojigotoWorkTitle || "",
  };

  const currentWorkDir = panel.__mojigotoWorkDir || "";
  const noteForWebview = attachNoteImageWebviewUris(
    nextNote,
    panel,
    currentWorkDir,
  );

  panel.__mojigotoNoteData = noteForWebview;
  panel.title = getPanelTitle(noteForWebview);

  panel.webview.postMessage({
    type: "noteReloaded",
    payload: noteForWebview,
  });

  return true;
}

function getPreferredNoteViewColumn() {
  return (
    vscode.window.activeTextEditor?.viewColumn ||
    vscode.window.activeNotebookEditor?.viewColumn ||
    vscode.ViewColumn.Active
  );
}

function buildNoteBootState(note, options = {}) {
  const {
    filePath = "",
    type = "plot",
    workDir = "",
    workName = "",
    workTitle = "",
  } = options;

  return {
    ...note,
    filePath,
    type,
    noteType: type,
    workDir,
    workName,
    workTitle,
  };
}

function safeAssetName(value, fallback = "note") {
  const text = String(value || "").trim() || fallback;
  return text
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

function getNoteAssetsRoot(workDir = "") {
  return isSingleMode()
    ? getMojigotoDirForSingle()
    : getMojigotoDirForWork(workDir);
}

function getNoteImageRelativeDir(noteFilePath, groupId) {
  const noteBaseName = safeAssetName(
    path.basename(
      String(noteFilePath || "note"),
      path.extname(String(noteFilePath || "")),
    ),
    "note",
  );

  const safeGroupId = safeAssetName(groupId, "group");

  return path.join("note-images", noteBaseName, safeGroupId);
}

function attachNoteImageWebviewUris(noteData, panel, workDir = "") {
  const assetsRoot = getNoteAssetsRoot(workDir);
  const groups = Array.isArray(noteData?.groups) ? noteData.groups : [];

  return {
    ...noteData,
    groups: groups.map((group) => {
      const images = Array.isArray(group?.images) ? group.images : [];

      return {
        ...group,
        images: images.map((image) => {
          const relativePath = String(image?.relativePath || "").trim();
          if (!relativePath) {
            return {
              ...image,
              webviewUri: "",
            };
          }

          const absolutePath = path.join(assetsRoot, relativePath);

          return {
            ...image,
            webviewUri: panel.webview
              .asWebviewUri(vscode.Uri.file(absolutePath))
              .toString(),
          };
        }),
      };
    }),
  };
}

function insertEntriesAfterItem(noteData, groupId, itemId, entries) {
  const groups = Array.isArray(noteData?.groups) ? noteData.groups : [];
  const group = groups.find(
    (g) => String(g?.id || "") === String(groupId || ""),
  );
  if (!group) {
    throw new Error("挿入先の大分類を取得できませんでした。");
  }

  const items = Array.isArray(group.items) ? group.items : [];
  const targetIndex = items.findIndex(
    (item) => String(item?.id || "") === String(itemId || ""),
  );
  if (targetIndex < 0) {
    throw new Error("挿入先の項目を取得できませんでした。");
  }

  const nextEntries = Array.isArray(entries)
    ? entries.filter((item) => item && item.kind === "entry")
    : [];

  if (!nextEntries.length) {
    throw new Error("追加できる項目がありませんでした。");
  }

  items.splice(targetIndex + 1, 0, ...nextEntries);
  group.items = items;

  return noteData;
}

function replaceItemBody(noteData, groupId, itemId, body) {
  const groups = Array.isArray(noteData?.groups) ? noteData.groups : [];
  const group = groups.find(
    (g) => String(g?.id || "") === String(groupId || ""),
  );
  if (!group) {
    throw new Error("対象の大分類を取得できませんでした。");
  }

  const item = (Array.isArray(group.items) ? group.items : []).find(
    (entry) => String(entry?.id || "") === String(itemId || ""),
  );

  if (!item || item.kind !== "entry") {
    throw new Error("対象の項目を取得できませんでした。");
  }

  item.body = String(body || "");
  return noteData;
}

function insertItemAtPosition(noteData, targetGroupId, insertIndex, item) {
  const groups = Array.isArray(noteData?.groups) ? noteData.groups : [];
  const group = groups.find(
    (g) => String(g?.id || "") === String(targetGroupId || ""),
  );
  if (!group) {
    throw new Error("挿入先の大分類を取得できませんでした。");
  }

  const items = Array.isArray(group.items) ? group.items : [];
  const normalizedIndex = Math.max(
    0,
    Math.min(Number(insertIndex), items.length),
  );

  const nextItem =
    item?.kind === "divider"
      ? {
          id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          kind: "divider",
          label: String(item?.label || "").trim() || "無題区分",
          value: String(item?.value || ""),
        }
      : {
          id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          kind: "entry",
          heading: String(item?.heading || "").trim() || "無題項目",
          body: String(item?.body || ""),
        };

  items.splice(normalizedIndex, 0, nextItem);
  group.items = items;
  return noteData;
}

function insertGroupAtPosition(noteData, insertIndex, groupData) {
  const groups = Array.isArray(noteData?.groups) ? noteData.groups : [];
  const normalizedIndex = Math.max(
    0,
    Math.min(Number(insertIndex), groups.length),
  );

  const rawItems = Array.isArray(groupData?.items) ? groupData.items : [];

  const nextGroup = {
    id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: String(groupData?.title || "").trim() || "無題大分類",
    items: rawItems.map((item) => {
      if (item?.kind === "divider") {
        return {
          id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          kind: "divider",
          label: String(item?.label || "").trim() || "無題区分",
          value: String(item?.value || ""),
        };
      }

      return {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        kind: "entry",
        heading: String(item?.heading || "").trim() || "無題項目",
        body: String(item?.body || ""),
      };
    }),
  };

  groups.splice(normalizedIndex, 0, nextGroup);
  noteData.groups = groups;
  return noteData;
}

function attachNotePanel(context, treeProvider, panel, options) {
  const {
    filePath,
    type,
    workDir = "",
    workName = "",
    workTitle = "",
    note,
  } = options;

  const normalizedFilePath = path.normalize(filePath);

  panel.__mojigotoNoteType = type;
  panel.__mojigotoWorkDir = workDir;
  panel.__mojigotoWorkName = workName;
  panel.__mojigotoWorkTitle = workTitle;
  panel.__mojigotoFilePath = filePath;
  panel.__mojigotoNoteData = note;
  panel.__mojigotoRestoredAt = Date.now();

  openNotePanelsByPath.set(normalizedFilePath, panel);
  openNotePanels.set(filePath, panel);

  activeNotePanel = panel;

  panel.onDidChangeViewState(
    (event) => {
      if (event.webviewPanel.active) {
        activeNotePanel = panel;
      }
    },
    null,
    context.subscriptions,
  );

  const currentWorkDirForAssets = resolveWorkDirForCurrentNote();
  const assetsRootForPanel = getNoteAssetsRoot(currentWorkDirForAssets);

  panel.webview.options = {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [vscode.Uri.file(assetsRootForPanel)],
  };

  panel.title = getPanelTitle(note);
  const noteForWebview = attachNoteImageWebviewUris(
    note,
    panel,
    currentWorkDirForAssets,
  );

  panel.__mojigotoNoteData = noteForWebview;
  panel.webview.html = getNoteWebviewHtml(noteForWebview, panel.webview);

  function resolveWorkDirForCurrentNote() {
    if (workDir) return workDir;

    if (!filePath) return "";
    return path.dirname(path.dirname(path.dirname(filePath)));
  }

  async function handleUploadGroupImage(message) {
    const payload = message?.payload || {};
    const groupId = String(payload?.groupId || "").trim();

    if (!groupId) {
      panel.webview.postMessage({
        type: "error",
        message: "画像を追加する大分類を取得できませんでした。",
      });
      return;
    }

    const picked = await vscode.window.showOpenDialog({
      title: "ノートに追加する画像を選択",
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        Images: ["png", "jpg", "jpeg", "webp", "gif"],
      },
    });

    const sourceUri = picked?.[0];
    if (!sourceUri?.fsPath) {
      return;
    }

    const sourcePath = sourceUri.fsPath;
    const ext = path.extname(sourcePath).toLowerCase() || ".png";

    const allowed = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
    if (!allowed.has(ext)) {
      panel.webview.postMessage({
        type: "error",
        message: "対応している画像形式は png / jpg / jpeg / webp / gif です。",
      });
      return;
    }

    const latest = {
      ...note,
      ...payload.note,
      type,
    };

    const groups = Array.isArray(latest.groups) ? [...latest.groups] : [];
    const groupIndex = groups.findIndex(
      (group) => String(group?.id || "") === groupId,
    );

    if (groupIndex < 0) {
      panel.webview.postMessage({
        type: "error",
        message: "画像を追加する大分類が見つかりませんでした。",
      });
      return;
    }

    const imageId = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fileName = `${imageId}${ext}`;

    const currentWorkDir = resolveWorkDirForCurrentNote();
    const assetsRoot = getNoteAssetsRoot(currentWorkDir);
    const relativeDir = getNoteImageRelativeDir(filePath, groupId);
    const relativePath = path.join(relativeDir, fileName).replace(/\\/g, "/");

    const destDir = path.join(assetsRoot, relativeDir);
    const destPath = path.join(destDir, fileName);

    await fsp.mkdir(destDir, { recursive: true });
    await fsp.copyFile(sourcePath, destPath);

    const defaultName = path.basename(sourcePath, path.extname(sourcePath));

    const nextGroup = {
      ...groups[groupIndex],
      images: [
        ...(Array.isArray(groups[groupIndex]?.images)
          ? groups[groupIndex].images
          : []),
        {
          id: imageId,
          name: defaultName,
          fileName,
          relativePath,
          createdAt: new Date().toISOString(),
        },
      ],
    };

    groups[groupIndex] = nextGroup;

    const saved = await saveNoteFile(filePath, {
      ...latest,
      groups,
      type,
    });

    const nextNote = buildNoteBootState(saved, {
      filePath,
      type,
      workDir,
      workName,
      workTitle,
    });

    const noteForWebview = attachNoteImageWebviewUris(
      nextNote,
      panel,
      currentWorkDir,
    );

    panel.__mojigotoNoteData = noteForWebview;
    panel.title = getPanelTitle(noteForWebview);

    panel.webview.postMessage({
      type: "noteReloaded",
      payload: noteForWebview,
    });

    panel.webview.postMessage({
      type: "info",
      message: "画像を追加しました。",
    });

    treeProvider?.refresh();
  }

  async function handleDeleteGroupImage(message) {
    const payload = message?.payload || {};
    const groupId = String(payload?.groupId || "").trim();
    const imageId = String(payload?.imageId || "").trim();

    if (!groupId || !imageId) {
      panel.webview.postMessage({
        type: "error",
        message: "削除する画像を取得できませんでした。",
      });
      return;
    }

    const latest = {
      ...note,
      ...payload.note,
      type,
    };

    const groups = Array.isArray(latest.groups) ? [...latest.groups] : [];
    const groupIndex = groups.findIndex(
      (group) => String(group?.id || "") === groupId,
    );

    if (groupIndex < 0) {
      panel.webview.postMessage({
        type: "error",
        message: "画像を削除する大分類が見つかりませんでした。",
      });
      return;
    }

    const currentGroup = groups[groupIndex] || {};
    const images = Array.isArray(currentGroup.images)
      ? currentGroup.images
      : [];

    const targetImage = images.find(
      (image) => String(image?.id || "") === imageId,
    );

    if (!targetImage) {
      panel.webview.postMessage({
        type: "error",
        message: "削除する画像が見つかりませんでした。",
      });
      return;
    }

    const picked = await vscode.window.showWarningMessage(
      `画像「${String(targetImage.name || targetImage.fileName || "画像")}」を削除しますか？`,
      { modal: true },
      "削除する",
    );

    if (picked !== "削除する") {
      panel.webview.postMessage({
        type: "info",
        message: "画像削除をキャンセルしました。",
      });
      return;
    }

    const nextImages = images.filter(
      (image) => String(image?.id || "") !== imageId,
    );

    groups[groupIndex] = {
      ...currentGroup,
      images: nextImages,
    };

    const currentWorkDir = resolveWorkDirForCurrentNote();
    const assetsRoot = getNoteAssetsRoot(currentWorkDir);
    const relativePath = String(targetImage.relativePath || "").trim();

    if (relativePath) {
      const absolutePath = path.join(assetsRoot, relativePath);

      try {
        await fsp.unlink(absolutePath);
      } catch (error) {
        // JSON上の削除は続行する。
        // ファイルが既にない場合や削除できない場合でも、参照だけは消す。
        console.warn("[mojigoto] delete note image file failed:", error);
      }
    }

    const saved = await saveNoteFile(filePath, {
      ...latest,
      groups,
      type,
    });

    const nextNote = buildNoteBootState(saved, {
      filePath,
      type,
      workDir,
      workName,
      workTitle,
    });

    const noteForWebview = attachNoteImageWebviewUris(
      nextNote,
      panel,
      currentWorkDir,
    );

    panel.__mojigotoNoteData = noteForWebview;
    panel.title = getPanelTitle(noteForWebview);

    panel.webview.postMessage({
      type: "noteReloaded",
      payload: noteForWebview,
    });

    panel.webview.postMessage({
      type: "info",
      message: "画像を削除しました。",
    });

    treeProvider?.refresh();
  }

  async function handleRenameGroupImage(message) {
    const payload = message?.payload || {};
    const groupId = String(payload?.groupId || "").trim();
    const imageId = String(payload?.imageId || "").trim();
    const currentName = String(payload?.currentName || "").trim();

    if (!groupId || !imageId) {
      panel.webview.postMessage({
        type: "error",
        message: "名前を変更する画像を取得できませんでした。",
      });
      return;
    }

    const latest = {
      ...note,
      ...payload.note,
      type,
    };

    const groups = Array.isArray(latest.groups) ? [...latest.groups] : [];
    const groupIndex = groups.findIndex(
      (group) => String(group?.id || "") === groupId,
    );

    if (groupIndex < 0) {
      panel.webview.postMessage({
        type: "error",
        message: "画像名を変更する大分類が見つかりませんでした。",
      });
      return;
    }

    const currentGroup = groups[groupIndex] || {};
    const images = Array.isArray(currentGroup.images)
      ? currentGroup.images
      : [];

    const imageIndex = images.findIndex(
      (image) => String(image?.id || "") === imageId,
    );

    if (imageIndex < 0) {
      panel.webview.postMessage({
        type: "error",
        message: "名前を変更する画像が見つかりませんでした。",
      });
      return;
    }

    const targetImage = images[imageIndex] || {};
    const defaultName =
      currentName ||
      String(targetImage.name || targetImage.fileName || "画像").trim();

    const nextName = await vscode.window.showInputBox({
      title: "もじごと: 画像名を変更",
      prompt: "画像の表示名を入力してください",
      value: defaultName,
      ignoreFocusOut: true,
    });

    if (nextName === undefined) {
      panel.webview.postMessage({
        type: "info",
        message: "画像名の変更をキャンセルしました。",
      });
      return;
    }

    const trimmedName = String(nextName || "").trim();

    if (!trimmedName) {
      panel.webview.postMessage({
        type: "error",
        message: "画像名は空にできません。",
      });
      return;
    }

    const nextImages = [...images];
    nextImages[imageIndex] = {
      ...targetImage,
      name: trimmedName,
    };

    groups[groupIndex] = {
      ...currentGroup,
      images: nextImages,
    };

    const saved = await saveNoteFile(filePath, {
      ...latest,
      groups,
      type,
    });

    const nextNote = buildNoteBootState(saved, {
      filePath,
      type,
      workDir,
      workName,
      workTitle,
    });

    const currentWorkDir = resolveWorkDirForCurrentNote();
    const noteForWebview = attachNoteImageWebviewUris(
      nextNote,
      panel,
      currentWorkDir,
    );

    panel.__mojigotoNoteData = noteForWebview;
    panel.title = getPanelTitle(noteForWebview);

    panel.webview.postMessage({
      type: "noteReloaded",
      payload: noteForWebview,
    });

    panel.webview.postMessage({
      type: "info",
      message: "画像名を変更しました。",
    });

    treeProvider?.refresh();
  }

  let isCloseConfirmOpen = false;

  panel.webview.onDidReceiveMessage(
    async (message) => {
      try {
        if (message?.type === "close") {
          panel.dispose();
          return;
        }

        if (message?.type === "requestClose") {
          if (isCloseConfirmOpen) {
            return;
          }

          isCloseConfirmOpen = true;

          try {
            const picked = await vscode.window.showWarningMessage(
              "未保存の変更があります。閉じますか？",
              { modal: true },
              "閉じる",
            );

            if (picked === "閉じる") {
              panel.dispose();
            }
          } finally {
            isCloseConfirmOpen = false;
          }

          return;
        }

        if (message?.type === "delete") {
          const noteTitle = String(
            message?.title || note?.title || "このノート",
          ).trim();

          try {
            const deleted = await vscode.commands.executeCommand(
              "mojigoto.deleteNote",
              {
                fsPath: filePath,
                workDir: note?.workDir || "",
                workName: note?.workName || "",
                noteType: note?.type || note?.noteType || "",
                title: noteTitle,
              },
            );

            if (deleted) {
              try {
                const currentWorkDir = resolveWorkDirForCurrentNote();
                const conceptMemoFilePath =
                  resolveConceptMemoFilePath(currentWorkDir);

                await markConceptMemosMissingByNotePath(
                  conceptMemoFilePath,
                  filePath,
                );

                await notifyConceptMemoUpdated(conceptMemoFilePath);
              } catch (e) {
                console.warn("[mojigoto] mark missing failed:", e);
              }

              panel.dispose();
            } else {
              panel.webview.postMessage({
                type: "info",
                message: "ノート削除をキャンセルしました。",
              });
            }
          } catch (error) {
            panel.webview.postMessage({
              type: "error",
              message: `ノート削除に失敗しました: ${error.message || error}`,
            });
          }
          return;
        }

        if (message?.type === "requestTemplateList") {
          const items = await getTemplateItems(type);
          panel.webview.postMessage({
            type: "templateList",
            items,
          });
          return;
        }

        if (message?.type === "saveTemplate") {
          const currentNote = {
            ...note,
            ...message.payload,
            type,
          };

          const templateName = await vscode.window.showInputBox({
            title: "もじごと: テンプレートとして保存",
            prompt: "テンプレート名を入力してください",
            value: currentNote.title || "",
            ignoreFocusOut: true,
          });
          if (!templateName) {
            panel.webview.postMessage({
              type: "info",
              message: "テンプレート保存をキャンセルしました。",
            });
            return;
          }

          const picked = await vscode.window.showQuickPick(
            [
              {
                label: "大枠だけを保存",
                description: "大分類・区分・項目の枠だけ保存します",
                mode: "structureOnly",
              },
              {
                label: "大分類・区分の枠と名前を保存",
                description:
                  "大分類名・区分名を保存し、補足を空、項目は保存しません",
                mode: "structureWithDividers",
              },
              {
                label: "大分類・区分・項目の枠と名前を保存",
                description:
                  "大分類名・区分名・項目名を保存し、補足と詳細は空にします",
                mode: "structureWithHeadings",
              },
              {
                label: "入力したすべてを保存",
                description: "現在の内容をそのまま保存します",
                mode: "full",
              },
            ],
            {
              title: "もじごと: テンプレート保存内容",
              placeHolder: "何をテンプレートとして残すか選んでください",
              ignoreFocusOut: true,
            },
          );

          if (!picked) {
            panel.webview.postMessage({
              type: "info",
              message: "テンプレート保存をキャンセルしました。",
            });
            return;
          }

          await saveUserTemplate(currentNote, templateName, picked.mode);

          vscode.window.showInformationMessage(
            `もじごと: テンプレート「${templateName}」を保存しました。`,
          );
          panel.webview.postMessage({ type: "templateSaved" });
          return;
        }

        if (message?.type === "uploadGroupImage") {
          await handleUploadGroupImage(message);
          return;
        }

        if (message?.type === "deleteGroupImage") {
          await handleDeleteGroupImage(message);
          return;
        }

        if (message?.type === "renameGroupImage") {
          await handleRenameGroupImage(message);
          return;
        }

        if (message?.type === "saveGroupTemplate") {
          const payload = message?.payload || {};
          const groupId = String(payload?.groupId || "").trim();

          const currentNote = {
            ...note,
            ...message.payload,
            type,
          };

          const groups = Array.isArray(currentNote?.groups)
            ? currentNote.groups
            : [];
          const targetGroup = groups.find(
            (group) => String(group?.id || "") === groupId,
          );

          if (!targetGroup) {
            panel.webview.postMessage({
              type: "error",
              message: "保存対象の大分類を取得できませんでした。",
            });
            return;
          }

          const defaultName =
            String(payload?.groupTitle || "").trim() ||
            String(targetGroup?.title || "").trim() ||
            "大分類テンプレート";

          const templateName = await vscode.window.showInputBox({
            title: "もじごと: 大分類をテンプレートとして保存",
            prompt: "テンプレート名を入力してください",
            value: defaultName,
            ignoreFocusOut: true,
          });

          if (!templateName) {
            panel.webview.postMessage({
              type: "info",
              message: "テンプレート保存をキャンセルしました。",
            });
            return;
          }

          const picked = await vscode.window.showQuickPick(
            [
              {
                label: "大枠だけを保存",
                description: "大分類・区分・項目の枠だけ保存します",
                mode: "structureOnly",
              },
              {
                label: "大分類・区分の枠と名前を保存",
                description:
                  "大分類名・区分名を保存し、補足を空、項目/詳細は保存しません",
                mode: "structureWithDividers",
              },
              {
                label: "大分類・区分・項目の枠と名前を保存",
                description:
                  "大分類名・区分名・項目名を保存し、補足と詳細は空にします",
                mode: "structureWithHeadings",
              },
              {
                label: "入力したすべてを保存",
                description: "現在の内容をそのまま保存します",
                mode: "full",
              },
            ],
            {
              title: "もじごと: 大分類テンプレートの保存内容",
              placeHolder: "何をテンプレートとして残すか選んでください",
              ignoreFocusOut: true,
            },
          );

          if (!picked) {
            panel.webview.postMessage({
              type: "info",
              message: "テンプレート保存をキャンセルしました。",
            });
            return;
          }

          await saveUserGroupTemplate(
            currentNote,
            targetGroup,
            templateName,
            picked.mode,
          );

          vscode.window.showInformationMessage(
            `もじごと: 大分類テンプレート「${templateName}」を保存しました。`,
          );
          panel.webview.postMessage({ type: "templateSaved" });
          return;
        }

        if (message?.type === "deleteTemplate") {
          const templateId = String(message?.templateId || "");
          if (!templateId) {
            panel.webview.postMessage({
              type: "error",
              message: "削除対象のテンプレートIDがありません。",
            });
            return;
          }

          const templates = await listUserTemplates(type);
          const target = templates.find((tpl) => tpl.templateId === templateId);
          const label = target?.label || "このテンプレート";

          const picked = await vscode.window.showWarningMessage(
            `テンプレート「${label}」を削除しますか？ この操作は元に戻せません。`,
            { modal: true },
            "削除する",
          );

          if (picked !== "削除する") {
            panel.webview.postMessage({
              type: "info",
              message: "テンプレート削除をキャンセルしました。",
            });
            return;
          }

          const deleted = await deleteUserTemplateById(type, templateId);
          if (!deleted) {
            panel.webview.postMessage({
              type: "error",
              message: "テンプレートを削除できませんでした。",
            });
            return;
          }

          vscode.window.showInformationMessage(
            `もじごと: テンプレート「${label}」を削除しました。`,
          );

          panel.webview.postMessage({
            type: "templateDeleted",
            templateId,
          });
          return;
        }

        if (message?.type === "createConceptMemoFromNoteItem") {
          const payload = message?.payload || {};
          const currentWorkDir = resolveWorkDirForCurrentNote();
          const conceptMemoFilePath =
            resolveConceptMemoFilePath(currentWorkDir);

          const created = await createConceptMemoFromNoteItem(
            conceptMemoFilePath,
            payload,
          );

          await notifyConceptMemoUpdated(conceptMemoFilePath);

          panel.webview.postMessage({
            type: "conceptMemoCreatedFromNoteItem",
            payload: {
              conceptMemoId: String(created?.memo?.id || ""),
              title: String(created?.memo?.title || ""),
              groupId: String(payload?.groupId || ""),
              itemId: String(payload?.itemId || ""),
              mode: String(created?.mode || "created"),
            },
          });

          return;
        }

        if (message?.type === "saveAndExport") {
          const saved = await saveNoteFile(filePath, {
            ...note,
            ...message.payload,
            type,
          });

          const nextNote = buildNoteBootState(saved, {
            filePath,
            type,
            workDir,
            workName,
          });

          panel.__mojigotoNoteData = nextNote;
          panel.title = getPanelTitle(nextNote);
          treeProvider?.refresh();

          await exportTreeItem(context, {
            kind: "noteFile",
            contextValue: "noteFile",
            fsPath: filePath,
            workDir: resolveWorkDirForCurrentNote() || "",
            workName,
            noteType: type,
          });

          panel.webview.postMessage({ type: "noteSaved" });
          return;
        }

        if (message?.type === "importNote") {
          const picked = await vscode.window.showQuickPick(
            [
              {
                label: "選択インポート",
                description:
                  "大分類・区分・項目の挿入、または項目上書きを選んで実行します",
                action: "partial_import",
              },
              {
                label: "新規/置換インポート",
                description: "新規作成、または現在のノート全体を置換します",
                action: "replace_note",
              },
            ],
            {
              title: "インポート方法を選択",
              placeHolder: "実行したいインポート方法を選んでください",
              ignoreFocusOut: true,
            },
          );

          if (!picked) {
            return;
          }

          if (picked.action === "replace_note") {
            const {
              runNoteImportFlow,
            } = require("../import/note-import-commands");

            await runNoteImportFlow(context, treeProvider, {
              noteType: type,
              mode: "note_import",
              existingNotePath: filePath,
              existingNoteTitle: String(note?.title || "").trim(),
              workDir: resolveWorkDirForCurrentNote() || "",
              workName: workName || "",
              workTitle: resolveWorkTitle(panel, context),
            });
            return;
          }

          if (picked.action === "partial_import") {
            message = {
              type: "openPartialImport",
              payload: {
                scopeGroupId: "",
                initialMode: "insert_entry",
              },
            };
          }
        }

        if (message?.type === "importEntriesAfterItem") {
          const payload = message?.payload || {};
          const groupId = String(payload?.groupId || "");
          const itemId = String(payload?.itemId || "");

          const {
            runNoteItemAppendImportFlow,
          } = require("../import/note-import-commands");

          const result = await runNoteItemAppendImportFlow(
            context,
            treeProvider,
            {
              workDir: resolveWorkDirForCurrentNote() || "",
              workName: workName || "",
              workTitle: resolveWorkTitle(panel, context),
            },
          );

          if (result?.cancelled) {
            return;
          }

          if (!result?.ok) {
            throw new Error(
              result?.error?.message || "項目インポートに失敗しました。",
            );
          }

          const latest = await readNoteFile(filePath, type);
          const nextNoteData = insertEntriesAfterItem(
            buildNoteBootState(latest, {
              filePath,
              type,
              workDir,
              workName,
              workTitle,
            }),
            groupId,
            itemId,
            result.entries,
          );

          const saved = await saveNoteFile(filePath, {
            ...nextNoteData,
            type,
          });

          const nextNote = buildNoteBootState(saved, {
            filePath,
            type,
            workDir,
            workName,
            workTitle,
          });

          panel.__mojigotoNoteData = nextNote;
          panel.title = getPanelTitle(nextNote);

          panel.webview.postMessage({
            type: "noteReloaded",
            payload: nextNote,
          });

          panel.webview.postMessage({
            type: "info",
            message: `${result.entries.length}件の項目を追加しました。`,
          });

          treeProvider?.refresh();
          return;
        }

        if (message?.type === "importTextIntoItem") {
          const payload = message?.payload || {};
          const groupId = String(payload?.groupId || "");
          const itemId = String(payload?.itemId || "");

          const picked = await vscode.window.showWarningMessage(
            "この項目の詳細をインポート内容で上書きします。",
            { modal: true },
            "上書きする",
          );

          if (picked !== "上書きする") {
            return;
          }

          const {
            runNoteItemReplaceImportFlow,
          } = require("../import/note-import-commands");

          const result = await runNoteItemReplaceImportFlow(
            context,
            treeProvider,
            {
              workDir: resolveWorkDirForCurrentNote() || "",
              workName: workName || "",
              workTitle: resolveWorkTitle(panel, context),
            },
          );

          if (result?.cancelled) {
            return;
          }

          if (!result?.ok) {
            throw new Error(
              result?.error?.message || "本文インポートに失敗しました。",
            );
          }

          const latest = await readNoteFile(filePath, type);
          const nextNoteData = replaceItemBody(
            buildNoteBootState(latest, {
              filePath,
              type,
              workDir,
              workName,
              workTitle,
            }),
            groupId,
            itemId,
            result.body,
          );

          const saved = await saveNoteFile(filePath, {
            ...nextNoteData,
            type,
          });

          const nextNote = buildNoteBootState(saved, {
            filePath,
            type,
            workDir,
            workName,
            workTitle,
          });

          panel.__mojigotoNoteData = nextNote;
          panel.title = getPanelTitle(nextNote);

          panel.webview.postMessage({
            type: "noteReloaded",
            payload: nextNote,
          });

          panel.webview.postMessage({
            type: "info",
            message: "この項目の詳細をインポート内容で上書きしました。",
          });

          treeProvider?.refresh();
          return;
        }

        if (message?.type === "openPartialImport") {
          const payload = message?.payload || {};
          const scopeGroupId = String(payload?.scopeGroupId || "");
          const initialMode =
            String(payload?.initialMode || "").trim() === "replace_entry_body"
              ? "replace_entry_body"
              : "insert_entry";

          const {
            runPartialReplaceImportFlow,
          } = require("../import/note-import-commands");
          const {
            openNotePartialImportWebview,
          } = require("./note-partial-import-webview");

          const result = await runPartialReplaceImportFlow(
            context,
            treeProvider,
            {
              noteType: type,
              mode: "insert_entry",
              workDir: resolveWorkDirForCurrentNote() || "",
              workName: workName || "",
              workTitle: resolveWorkTitle(panel, context),
            },
          );

          if (result?.cancelled) {
            return;
          }

          if (!result?.ok) {
            throw new Error(
              result?.error?.message ||
                "部分インポートの読み込みに失敗しました。",
            );
          }

          const latest = await readNoteFile(filePath, type);
          const nextNote = buildNoteBootState(latest, {
            filePath,
            type,
            workDir,
            workName,
            workTitle,
          });

          await openNotePartialImportWebview(context, treeProvider, {
            initialMode,
            notePath: filePath,
            noteData: nextNote,
            sourceFilePath: result.sourceFilePath,
            sourceFileName: result.sourceFileName,
            parsedNote: result.parsedNote,
            previewData: result.previewData,
            scopeGroupId,
            defaultTargetGroupId:
              scopeGroupId || String((nextNote.groups || [])[0]?.id || ""),
            noteTitle: String(nextNote.title || "").trim(),
            noteTypeLabel: type === "plot" ? "プロット" : "資料",
            scopeGroupTitle: scopeGroupId
              ? String(
                  (nextNote.groups || []).find(
                    (g) => String(g?.id || "") === String(scopeGroupId || ""),
                  )?.title || "",
                ).trim()
              : "",
            onApply: async (applyPayload) => {
              const source = applyPayload?.source || {};
              const sourceType = String(source?.sourceType || "");

              const latestNote = await readNoteFile(filePath, type);
              const boot = buildNoteBootState(latestNote, {
                filePath,
                type,
                workDir,
                workName,
                workTitle,
              });

              let updated;
              let successMessage = "";

              if (String(initialMode) === "replace_entry_body") {
                const targetGroupId = String(
                  applyPayload?.target?.groupId || "",
                );
                const targetItemId = String(applyPayload?.target?.itemId || "");
                const sourceBody = String(applyPayload?.source?.body || "");

                updated = replaceItemBody(
                  boot,
                  targetGroupId,
                  targetItemId,
                  sourceBody,
                );
                successMessage = "選択した項目内容で詳細を上書きしました。";
              } else {
                const targetGroupId = String(
                  applyPayload?.target?.groupId || "",
                );
                const insertIndex = Number(
                  applyPayload?.target?.insertIndex || 0,
                );

                updated =
                  sourceType === "group"
                    ? insertGroupAtPosition(
                        boot,
                        Number(applyPayload?.target?.groupInsertIndex || 0),
                        {
                          title: String(source.title || ""),
                          items: Array.isArray(source.items)
                            ? source.items
                            : [],
                        },
                      )
                    : insertItemAtPosition(
                        boot,
                        targetGroupId,
                        insertIndex,
                        sourceType === "divider"
                          ? {
                              kind: "divider",
                              label: String(source.label || ""),
                              value: String(source.value || ""),
                            }
                          : {
                              kind: "entry",
                              heading: String(source.heading || ""),
                              body: String(source.body || ""),
                            },
                      );

                successMessage =
                  sourceType === "group"
                    ? "選択した大分類を挿入しました。"
                    : sourceType === "divider"
                      ? "選択した区分を挿入しました。"
                      : "選択した項目を挿入しました。";
              }

              const saved = await saveNoteFile(filePath, {
                ...updated,
                type,
              });

              const reloaded = buildNoteBootState(saved, {
                filePath,
                type,
                workDir,
                workName,
                workTitle,
              });

              panel.__mojigotoNoteData = reloaded;
              panel.title = getPanelTitle(reloaded);

              panel.webview.postMessage({
                type: "noteReloaded",
                payload: reloaded,
              });

              panel.webview.postMessage({
                type: "info",
                message: successMessage,
              });

              treeProvider?.refresh();

              return {
                message: successMessage,
                sourceItemId: String(source?.sourceItemId || ""),
              };
            },
          });

          return;
        }

        if (message?.type === "markConceptMemoClearedFromNoteItem") {
          const payload = message?.payload || {};
          const currentWorkDir = resolveWorkDirForCurrentNote();
          const conceptMemoFilePath =
            resolveConceptMemoFilePath(currentWorkDir);

          const ids = Array.isArray(payload?.conceptMemoIds)
            ? payload.conceptMemoIds
            : [];

          for (const memoId of ids) {
            await updateConceptMemoSourceStatus(
              conceptMemoFilePath,
              memoId,
              "cleared",
            );
          }

          await notifyConceptMemoUpdated(conceptMemoFilePath);
          return;
        }

        if (message?.type === "markConceptMemoMissingFromNoteItem") {
          const payload = message?.payload || {};
          const currentWorkDir = resolveWorkDirForCurrentNote();
          const conceptMemoFilePath =
            resolveConceptMemoFilePath(currentWorkDir);

          const ids = Array.isArray(payload?.conceptMemoIds)
            ? payload.conceptMemoIds
            : [];

          for (const memoId of ids) {
            await updateConceptMemoSourceStatus(
              conceptMemoFilePath,
              memoId,
              "missing",
            );
          }

          await notifyConceptMemoUpdated(conceptMemoFilePath);
          return;
        }

        if (message?.type === "openConceptMemoFromNoteItem") {
          const payload = message?.payload || {};
          const currentWorkDir = resolveWorkDirForCurrentNote();
          const conceptMemoFilePath =
            resolveConceptMemoFilePath(currentWorkDir);

          const linkedIds = Array.isArray(payload?.conceptMemoIds)
            ? payload.conceptMemoIds
                .map((id) => String(id || "").trim())
                .filter(Boolean)
            : [];

          let selectedMemoId = String(linkedIds[0] || "");

          if (!selectedMemoId) {
            const { readConceptMemos } = require("../data/concept-memo-store");
            const conceptData = await readConceptMemos(conceptMemoFilePath);
            const memos = Array.isArray(conceptData?.memos)
              ? conceptData.memos
              : [];

            const matched = memos.find((memo) => {
              const source = memo?.source || {};
              return (
                String(source.kind || "") === "noteItem" &&
                String(source.notePath || "") ===
                  String(payload?.notePath || "") &&
                String(source.groupId || "") ===
                  String(payload?.groupId || "") &&
                String(source.itemId || "") === String(payload?.itemId || "")
              );
            });

            selectedMemoId = String(matched?.id || "");
          }

          const { openConceptMemoWebview } = require("./concept-memo-webview");

          await openConceptMemoWebview(context, treeProvider, {
            filePath: conceptMemoFilePath,
            workDir: currentWorkDir,
            workTitle: resolveWorkTitle(panel, context),
            selectedMemoId,
            preserveFocus: false,
            viewColumn: vscode.ViewColumn.Beside,
          });

          return;
        }

        if (message?.type === "openConceptMemoForCopy") {
          const currentWorkDir = resolveWorkDirForCurrentNote();
          const conceptMemoFilePath =
            resolveConceptMemoFilePath(currentWorkDir);

          const { openConceptMemoWebview } = require("./concept-memo-webview");

          await openConceptMemoWebview(context, treeProvider, {
            filePath: conceptMemoFilePath,
            workDir: currentWorkDir,
            workTitle: resolveWorkTitle(panel, context),
            preserveFocus: false,
            viewColumn: vscode.ViewColumn.Beside,
            initialQuickFilters: {
              type: "text",
              state: [],
              source: "",
            },
          });

          panel.webview.postMessage({
            type: "info",
            message:
              "構想メモを開きました。コピーしたい通常メモを選んでください。",
          });

          return;
        }

        if (message?.type === "openDedicatedCopyPanel") {
          const picked = await vscode.window.showQuickPick(
            [
              {
                label: "そのまま開く",
                description: "専用コピー画面として開く",
                openMode: "same",
                layoutMode: "full",
              },
              {
                label: "右側に開く",
                description: "ノートを見ながら操作する",
                openMode: "beside",
                layoutMode: "compact",
              },
            ],
            {
              title: "コピー画面の開き方",
              placeHolder: "開き方を選んでください",
              ignoreFocusOut: true,
            },
          );

          if (!picked) {
            return;
          }

          const { openNoteCopyWebview } = require("./note-copy-webview");

          await openNoteCopyWebview(context, treeProvider, {
            filePath,
            type,
            workDir,
            workName,
            workTitle,
            openMode: picked.openMode,
            layoutMode: picked.layoutMode,
          });
          return;
        }

        if (message?.type === "save") {
          const saved = await saveNoteFile(filePath, {
            ...note,
            ...message.payload,
            type,
          });

          const nextNote = buildNoteBootState(saved, {
            filePath,
            type,
            workDir,
            workName,
          });

          panel.__mojigotoNoteData = nextNote;
          panel.title = getPanelTitle(nextNote);
          panel.webview.postMessage({ type: "noteSaved" });
          treeProvider?.refresh();
          return;
        }
      } catch (e) {
        panel.webview.postMessage({
          type: "error",
          message: `処理に失敗しました: ${String(e)}`,
        });
      }
    },
    null,
    context.subscriptions,
  );

  panel.onDidDispose(
    () => {
      if (activeNotePanel === panel) {
        activeNotePanel = null;
      }

      if (openNotePanels.get(filePath) === panel) {
        openNotePanels.delete(filePath);
      }

      openNotePanelsByPath.delete(normalizedFilePath);
    },
    null,
    context.subscriptions,
  );
}

function resolveConceptMemoFilePath(workDir = "") {
  const mojigotoDir = isSingleMode()
    ? getMojigotoDirForSingle()
    : getMojigotoDirForWork(workDir);

  return path.join(mojigotoDir, "concept-memos.json");
}

async function openNoteWebview(context, treeProvider, options) {
  const {
    filePath,
    type,
    workDir = "",
    workName = "",
    workTitle = "",
    focusGroupId = "",
    focusItemId = "",
    openItemMemo = false,
  } = options;

  const postFocusMessage = (panel) => {
    if (!panel || !focusItemId) return;

    setTimeout(() => {
      panel.webview.postMessage({
        type: openItemMemo ? "openNoteItemMemo" : "focusNoteItem",
        payload: {
          groupId: String(focusGroupId || ""),
          itemId: String(focusItemId || ""),
        },
      });
    }, 80);
  };

  const existing = openNotePanels.get(filePath);
  if (existing) {
    existing.reveal(undefined, false);
    postFocusMessage(existing);
    return existing;
  }

  const rawNote = await readNoteFile(filePath, type);

  const note = buildNoteBootState(rawNote, {
    filePath,
    type,
    workDir,
    workName,
    workTitle,
  });

  const panel = vscode.window.createWebviewPanel(
    "mojigoto.noteEditor",
    getPanelTitle(note),
    getPreferredNoteViewColumn(),
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    },
  );

  attachNotePanel(context, treeProvider, panel, {
    filePath,
    type,
    workDir,
    workName,
    workTitle,
    note,
  });

  postFocusMessage(panel);

  return panel;
}

function createNoteSerializer(context, treeProvider) {
  return vscode.window.registerWebviewPanelSerializer("mojigoto.noteEditor", {
    async deserializeWebviewPanel(webviewPanel, webviewState) {
      try {
        const state = webviewState || {};
        const filePath = String(state?.filePath || "").trim();
        const type =
          String(state?.type || state?.noteType || "plot").trim() || "plot";
        const workDir = String(state?.workDir || "").trim();
        const workName = String(state?.workName || "").trim();
        const workTitle = String(state?.workTitle || "").trim();

        if (!filePath) {
          webviewPanel.webview.options = {
            enableScripts: true,
            retainContextWhenHidden: true,
          };

          webviewPanel.title = "ノート復元エラー";
          webviewPanel.webview.html = `
            <!DOCTYPE html>
            <html lang="ja">
            <body style="font-family:sans-serif;padding:16px;">
              <p>ノートの復元に必要な状態が見つかりませんでした。</p>
              <p>filePath が保存されていないため、このタブは自動復元できません。</p>
            </body>
            </html>
          `;
          return;
        }

        const rawNote = await readNoteFile(filePath, type);
        const note = buildNoteBootState(rawNote, {
          filePath,
          type,
          workDir,
          workName,
          workTitle,
        });

        attachNotePanel(context, treeProvider, webviewPanel, {
          filePath,
          type,
          workDir,
          workName,
          workTitle,
          note,
        });
      } catch (error) {
        console.error("[mojigoto] note deserialize failed:", error);

        try {
          webviewPanel.webview.html = `
            <!DOCTYPE html>
            <html lang="ja">
            <body style="font-family:sans-serif;padding:16px;">
              <p>ノートの復元に失敗しました。</p>
              <pre style="white-space:pre-wrap;">${escapeHtml(String(error?.message || error || ""))}</pre>
            </body>
            </html>
          `;
        } catch {}

        // すぐ dispose すると原因が見えなくなるので、ここでは閉じない
      }
    },
  });
}

function registerNoteWebviewCommands(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "mojigoto.noteEditor.closeFromShortcut",
      async () => {
        if (activeNotePanel) {
          activeNotePanel.webview.postMessage({
            type: "shortcutCloseNote",
          });
          return;
        }

        await vscode.commands.executeCommand(
          "workbench.action.closeActiveEditor",
        );
      },
    ),
  );
}

module.exports = {
  openNoteWebview,
  closeNoteWebviewByPath,
  notifyNoteUpdated,
  createNoteSerializer,
  registerNoteWebviewCommands,
};
