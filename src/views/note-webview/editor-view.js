const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { actionIcon } = require("../shared/action-icons");
const { getNonce, escapeHtml } = require("../../core/path-utils");
const css = fs.readFileSync(
  path.join(__dirname, "note-webview.css"),
  "utf8",
);
const {
  getTemplatePanelScript,
} = require("./script-template-panel");
const { getPreviewScript } = require("./script-preview");
const { getPreviewLayoutScript } = require("./script-preview-layout");
const { getNoteMemoVisibilityScript } = require("./script-memo-visibility");
const { getNoteDisplayRendererScript } = require("./display-renderer");
const { getDisplaySyncScript } = require("./script-display-sync");
const { getUtilsScript } = require("./script-utils");
const { getGroupsScript } = require("./script-groups");
const { getEventsScript } = require("./script-events");
const { getViewStateScript } = require("./script-view-state");
const { getUiPanelsScript } = require("./script-ui-panels");
const { getNavigationScript } = require("./script-navigation");
const { getNoteReplaceHtml, getNoteReplaceScript } = require("./script-search-replace");
const { getBoardScript } = require("./script-board");
const { getNoteTocScript } = require("./script-toc");
const {
  getReferenceLinksScript,
} = require("./script-reference-links");
const {
  getAddressBookScript,
} = require("./script-address-book");
const {
  getInputAssistToolbarCss,
  getInputAssistToolbarHtml,
  getInputAssistToolbarScript,
} = require("../shared/input-assist-toolbar");

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

function getWebviewUiSettings() {
  const config = vscode.workspace.getConfiguration("mojigoto");
  const fontScalePercent = Math.min(
    160,
    Math.max(80, Number(config.get("webviewFontScalePercent", 100)) || 100),
  );
  const autoSaveDelaySeconds = Math.min(
    30,
    Math.max(0.3, Number(config.get("webviewAutoSaveDelaySeconds", 0.8)) || 0.8),
  );

  return {
    fontScale: fontScalePercent / 100,
    autoSaveEnabled: config.get("webviewAutoSaveEnabled", true) !== false,
    autoSaveDelayMs: Math.round(autoSaveDelaySeconds * 1000),
    noteMemoAutoSyncDefault:
      config.get("noteMemoAutoSyncEnabled", false) === true,
  };
}

function getNoteWebviewHtml(note, webview, { skipEditorScrollRestore = false } = {}) {
  const nonce = getNonce();
  const noteJson = escapeScriptJson(note);
  const { fontScale, autoSaveEnabled, noteMemoAutoSyncDefault } = getWebviewUiSettings();

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
<body style="--mojigoto-content-font-scale: ${fontScale};">
  <div id="noteShell" class="noteShell">
    <div class="paneHeader paneHeaderGlobal">
      <div class="paneHeaderLeft">
        <div class="noteTitleBlock">
          <div id="noteWorkTitle" class="noteWorkTitle" title="作品名">
            作品: ${escapeHtml(note.workTitle || note.workName || (note.workDir ? path.basename(note.workDir) : "未設定"))}
          </div>
          <h1 class="paneTitle">
            ${escapeHtml(note.type === "plot" ? "プロット" : "資料")}編集
            <span id="dirtyMark" class="dirtyMark" hidden>*</span>
          </h1>
        </div>

        <div class="topbarGroupActions">
          <button class="secondary" type="button" id="expandAllBtn" title="すべての大分類を開く（Alt+Shift+P）">開く <span class="kbdHint">Alt+Shift+P</span></button>
          <button class="secondary" type="button" id="collapseAllBtn" title="すべての大分類を畳む（Alt+Shift+L）">畳む <span class="kbdHint">Alt+Shift+L</span></button>
          <button
            class="secondary"
            type="button"
            id="toggleAllImagesBtn"
            title="このノート全体の画像一覧を開く"
          >
            画像一覧
          </button>
          <div class="topbarMenuActions">
          <button
            class="secondary"
            type="button"
            id="toggleEditorPaneBtn"
            title="編集ペインの表示を切り替え"
          >
            編集を隠す
          </button>
        <div class="menuWrap">
          <button class="secondary menuButton" type="button" id="moreMenuBtn" aria-label="メニュー" aria-expanded="false" aria-controls="moreMenuPanel">
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
            <button class="menuItem" type="button" data-menu-action="openTocSettings">
              目次・表示設定
            </button>
            <button class="menuItem" type="button" data-menu-action="toggleCopyPanel">
              他ノートからコピー
              <span class="kbdHint">Alt+Shift+N</span>
            </button>
            <button class="menuItem" type="button" data-menu-action="toggleAddressBook">
              呼び名一覧
            </button>
            <div class="menuDivider"></div>
            <button id="noteMemoAutoSyncDefaultBtn" class="menuItem" type="button" data-menu-action="toggleMemoAutoSyncDefault" aria-pressed="${noteMemoAutoSyncDefault}" title="このフォルダの既定値です。項目メモの個別ON／OFFが優先されます。">
              構想メモへの自動反映（既定）: ${noteMemoAutoSyncDefault ? "ON" : "OFF"}
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
        </div>
      </div>

      <div class="paneHeaderRight">
        <div id="autoSaveBadge" class="autoSaveBadge"${autoSaveEnabled ? "" : " hidden"}>自動保存 ON</div>
        <div id="dirtyBadge" class="dirtyBadge" hidden>未保存</div>
        <button class="secondary noteHeaderIconButton" type="button" id="toggleNoteTocBtn" title="ノートの目次を開閉" aria-label="ノートの目次を開閉" aria-expanded="false" aria-controls="noteTocPanel">${actionIcon("toc")}</button>
        <button
          class="secondary refreshNoteBtn noteHeaderIconButton"
          type="button"
          id="refreshNoteBtn"
          title="作品名とノート内容をファイルから読み直す"
          aria-label="作品名とノート内容をファイルから読み直す"
        >
          ${actionIcon("refresh")}
        </button>
        <button class="secondary refreshNoteBtn noteHeaderIconButton" type="button" id="noteBackupBtn" title="ノートのバックアップ履歴を開く" aria-label="ノートのバックアップ履歴を開く">${actionIcon("backup")}</button>
        <button
          class="secondary previewJumpBtn"
          type="button"
          id="jumpToPreviewTopBtn"
          title="プレビュー先頭へ移動"
        >
          プレビューへ
        </button>

      </div>
    </div>

    <div id="toastStatus" class="toastStatus" role="status" aria-live="polite">
      <span id="toastStatusText"></span>
      <button id="dismissStatusBtn" class="secondary" type="button" hidden>閉じる</button>
    </div>
    <div id="globalPanelsRoot" class="globalPanelsRoot">
      <div id="searchPanel" class="searchPanel" hidden>
        <div class="searchRow">
          <input
            id="noteSearchInput"
            type="text"
            placeholder="大分類名・区分・項目名・詳細・項目メモを検索"
          />

          <div class="searchActions">
            <button class="secondary" type="button" id="openNoteReplaceBtn" aria-haspopup="dialog" aria-controls="noteReplacePanel">置換…</button>
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
          <div class="noteMemoVisibilityTools" role="group" aria-label="項目メモの一括開閉">
            <button class="secondary" type="button" data-note-memo-action="open" title="内容のある項目メモをすべて開く">メモを開く</button>
            <button class="secondary" type="button" data-note-memo-action="close" title="項目メモをすべて畳む">メモを畳む</button>
          </div>
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
          </div>

          <div class="previewModeToggle">
            <button class="secondary isActive" type="button" id="previewListBtn">リスト</button>
            <button class="secondary" type="button" id="previewBoardBtn">ボード</button>
            <button class="secondary" type="button" id="openBoardBtn" title="ボードを全画面で表示">全画面</button>
            <button class="secondary" type="button" id="openPreviewTabBtn" title="現在のプレビューを表示専用の別タブで開く">別タブ</button>
          </div>

          <div class="previewHeadHelp">
            <div class="panelHint">項目をクリックすると編集位置へ移動します</div>
            <div class="panelMeta" id="previewCounts"></div>
          </div>

          <div class="searchNotice previewSearchNotice" id="previewSearchNotice" hidden></div>
        </div>
        <div id="previewMemoTools" class="noteMemoVisibilityTools" role="group" aria-label="項目メモの一括開閉（編集側と連動）">
          <button class="secondary" type="button" data-note-memo-action="open" title="内容のある項目メモをすべて開く（編集側と連動）">メモを開く</button>
          <button class="secondary" type="button" data-note-memo-action="close" title="項目メモをすべて畳む（編集側と連動）">メモを畳む</button>
        </div>
        <div id="preview"></div>
        <div id="previewBoardRoot" class="noteBoardRoot noteBoardRootInline" hidden></div>
      </aside>
    </div>

    <aside id="noteTocPanel" class="noteTocPanel" hidden>
      <div class="noteTocHead">
        <div class="noteTocTitle">目次</div>
        <button class="secondary noteTocIconButton" type="button" id="collapseNoteTocBtn" title="目次を折りたたむ">−</button>
        <button class="secondary noteTocIconButton" type="button" id="closeNoteTocBtn" title="目次を閉じる">×</button>
      </div>
      <div class="noteTocBody">
        <div id="noteTocSettings" class="noteTocSettings">
          <span>表示:</span>
          <label><input type="checkbox" id="noteTocShowGroups" checked> 大分類</label>
          <label><input type="checkbox" id="noteTocShowDividers" checked> 区分</label>
          <label><input type="checkbox" id="noteTocShowItems" checked> 項目</label>
          <label><input type="checkbox" id="noteTocShowDividerValues" checked> 区分の補足</label>
        </div>
        <nav id="noteTocList" class="noteTocList" aria-label="ノート目次"></nav>
      </div>
    </aside>

    <aside id="addressBookPanel" class="addressBookPanel" hidden>
      <div class="addressBookDialog">
        <div class="addressBookHead">
          <div>
            <div class="addressBookTitle">呼び名一覧</div>
            <div class="panelHint">対角セルは一人称、交差セルは相手への呼び方です。</div>
          </div>
          <div class="addressBookHeadActions">
            <button class="secondary" type="button" id="addressOpenTabBtn" title="この作品の呼び名一覧を別タブで編集します">別タブで開く</button>
            <button class="secondary" type="button" id="closeAddressBookBtn">閉じる</button>
          </div>
        </div>
        <div class="addressBookCandidateArea">
          <div class="addressBookCandidateSearch">
            <input id="addressCandidateSearch" type="search" placeholder="人物名・ノート名・分類名を検索" autocomplete="off">
            <select id="addressCandidateSelect" aria-label="追加する人物"></select>
            <button class="secondary" type="button" id="addressAddBtn">人物を追加</button>
          </div>
          <div class="addressCandidateFilters" role="group" aria-label="人物候補の絞り込み">
            <span>ノート:</span>
            <label><input type="checkbox" id="addressSourceReference" checked> 資料</label>
            <label><input type="checkbox" id="addressSourcePlot"> プロット</label>
            <span>種類:</span>
            <label><input type="checkbox" id="addressKindGroup" checked> 大分類</label>
            <label><input type="checkbox" id="addressKindDivider" checked> 区分</label>
            <label><input type="checkbox" id="addressKindItem" checked> 項目</label>
            <label class="addressDividerNameChoice">区分の名前:
              <select id="addressDividerNameSource">
                <option value="value">補足</option>
                <option value="label">区分名</option>
              </select>
            </label>
            <span id="addressCandidateCount" class="panelMeta"></span>
          </div>
        </div>
        <div class="addressBookToolbar">
          <span id="addressCount" class="panelMeta"></span>
          <span id="addressStatus" class="panelMeta">保存済み</span>
          <button class="secondary" type="button" id="addressReloadBtn">最新を読み直す</button>
          <button class="secondary" type="button" id="addressPreviewBtn">全体プレビュー</button>
          <button class="secondary" type="button" id="addressExportHtmlBtn">HTML書き出し</button>
          <button class="secondary" type="button" id="addressExportCsvBtn">CSV書き出し</button>
        </div>
        <div class="addressBookFilters">
          <label>表示する行
            <select id="addressFocusSelect"></select>
          </label>
          <details class="addressVisibilityPicker">
            <summary>表示する人物を絞る</summary>
            <div id="addressVisibleOptions" class="addressVisibleOptions"></div>
            <button class="secondary addressShowAllBtn" type="button" id="addressShowAllBtn">すべて表示</button>
          </details>
          <details class="addressTermManager">
            <summary>呼び名候補を整理</summary>
            <div id="addressTermManagerList" class="addressTermManagerList"></div>
          </details>
        </div>
        <div id="addressMatrixRoot" class="addressMatrixRoot"></div>
        <div id="addressTermPicker" class="addressTermPicker" hidden></div>
        <div class="addressBookHint">入力済みの呼び方は、ほかのセルでも候補から選択できます。</div>
      </div>
      <aside id="addressPreviewPanel" class="addressPreviewPanel" hidden>
        <div class="addressPreviewDialog">
          <div class="addressPreviewHead">
            <div>
              <div class="addressBookTitle">呼び名一覧プレビュー</div>
              <div class="panelHint">絞り込みに関係なく、登録されている人物と呼び名をすべて表示します。</div>
            </div>
            <button class="secondary" type="button" id="closeAddressPreviewBtn">閉じる</button>
          </div>
          <div id="addressPreviewRoot" class="addressPreviewRoot"></div>
        </div>
      </aside>
    </aside>

    <aside id="referenceSearchPanel" class="referenceSearchPanel" hidden>
      <div class="referenceSearchHead">
        <div>
          <div class="referenceSearchTitle">ノートを検索・関連付け</div>
          <div id="referenceSearchSource" class="referenceSearchSource"></div>
        </div>
        <button class="secondary" type="button" id="closeReferenceSearchBtn">閉じる</button>
      </div>
      <div class="referenceSearchTypeTabs" role="group" aria-label="検索するノート種別">
        <button class="secondary" type="button" data-reference-search-type="reference">資料</button>
        <button class="secondary" type="button" data-reference-search-type="plot">プロット</button>
      </div>
      <div class="referenceSearchControls">
        <input id="referenceSearchInput" type="search" placeholder="ノートから語句や名前を検索" autocomplete="off" />
        <button class="secondary" type="button" id="clearReferenceSearchBtn">クリア</button>
      </div>
      <div id="referenceSearchStatus" class="referenceSearchStatus"></div>
      <div id="referenceSearchResults" class="referenceSearchResults"></div>
      <div class="referenceSearchHint">このパネルを開いたままノートを編集できます。</div>
    </aside>

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
          <button class="secondary" type="button" id="openBoardTabBtn">別タブで開く</button>
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
  ${getNoteReplaceHtml()}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const initial = ${noteJson};
    const groupsRoot = document.getElementById("groups");
    const previewRoot = document.getElementById("preview");

    const noteAppRoot = document.getElementById("noteAppRoot");
    const toggleEditorPaneBtn = document.getElementById("toggleEditorPaneBtn");
    const jumpToPreviewTopBtn = document.getElementById("jumpToPreviewTopBtn");

    const toastStatusEl = document.getElementById("toastStatus");
    const toastStatusTextEl = document.getElementById("toastStatusText");
    const dismissStatusBtn = document.getElementById("dismissStatusBtn");
    dismissStatusBtn?.addEventListener("click", () => clearStatus({ force: true }));
    const titleInput = document.getElementById("noteTitle");

    const dirtyBadgeEl = document.getElementById("dirtyBadge");
    const dirtyMarkEl = document.getElementById("dirtyMark");
    const autoSaveBadgeEl = document.getElementById("autoSaveBadge");
    const noteWorkTitleEl = document.getElementById("noteWorkTitle");

    const moreMenuBtn = document.getElementById("moreMenuBtn");
    const moreMenuPanel = document.getElementById("moreMenuPanel");
    const importNoteBtn = document.getElementById("importNoteBtn");

    const templatePanelEl = document.getElementById("templatePanel");
    const closeTemplatePanelBtn = document.getElementById("closeTemplatePanelBtn");
    const templateListRoot = document.getElementById("templateList");
    const templatePanelMessageEl = document.getElementById("templatePanelMessage");
    const addressBookPanel = document.getElementById("addressBookPanel");
    const closeAddressBookBtn = document.getElementById("closeAddressBookBtn");
    const addressCandidateSearch = document.getElementById("addressCandidateSearch");
    const addressCandidateSelect = document.getElementById("addressCandidateSelect");
    const addressAddBtn = document.getElementById("addressAddBtn");
    const addressSourceReference = document.getElementById("addressSourceReference");
    const addressSourcePlot = document.getElementById("addressSourcePlot");
    const addressKindGroup = document.getElementById("addressKindGroup");
    const addressKindDivider = document.getElementById("addressKindDivider");
    const addressKindItem = document.getElementById("addressKindItem");
    const addressDividerNameSource = document.getElementById("addressDividerNameSource");
    const addressCandidateCount = document.getElementById("addressCandidateCount");
    const addressFocusSelect = document.getElementById("addressFocusSelect");
    const addressVisibleOptionsEl = document.getElementById("addressVisibleOptions");
    const addressShowAllBtn = document.getElementById("addressShowAllBtn");
    const addressMatrixRoot = document.getElementById("addressMatrixRoot");
    const addressPreviewBtn = document.getElementById("addressPreviewBtn");
    const addressPreviewPanel = document.getElementById("addressPreviewPanel");
    const closeAddressPreviewBtn = document.getElementById("closeAddressPreviewBtn");
    const addressPreviewRoot = document.getElementById("addressPreviewRoot");
    const addressTermManagerList = document.getElementById("addressTermManagerList");
    const addressTermPicker = document.getElementById("addressTermPicker");
    const addressCountEl = document.getElementById("addressCount");
    const addressStatusEl = document.getElementById("addressStatus");
    const addressExportHtmlBtn = document.getElementById("addressExportHtmlBtn");
    const addressExportCsvBtn = document.getElementById("addressExportCsvBtn");

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
    let changeRevision = 0;
    let collapsedGroupIds = new Set();
    let activeEditingItemId = "";
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
    let isAddressBookOpen = false;
    let addressVisibleIds = new Set();

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
    ${getNoteDisplayRendererScript()}
    ${getDisplaySyncScript()}
    ${getUtilsScript()}
    ${getNoteReplaceScript()}
    ${getViewStateScript({skipEditorScrollRestore})}
    ${getUiPanelsScript()}
    ${getNoteTocScript()}
    ${getReferenceLinksScript()}
    ${getAddressBookScript()}
    ${getNoteMemoVisibilityScript()}

    // panels
    ${getTemplatePanelScript()}

    // editor / preview
    ${getGroupsScript()}
    ${getNavigationScript()}
    ${getPreviewScript()}
    ${getPreviewLayoutScript()}
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
      if (typeof queueNoteDisplaySnapshot === "function") queueNoteDisplaySnapshot();
    }

    function markDirty() {
      changeRevision += 1;
      if (typeof invalidateNoteReplacePlan === "function") invalidateNoteReplacePlan();
      dirty = true;
      updateDirtyUi();
      vscode.postMessage({ type: "dirtyStateChanged", dirty: true });
      vscode.postMessage({
        type: "scheduleAutoSave",
        payload: collectPayload(),
        revision: changeRevision,
      });
    }

    function clearDirty(savedRevision = changeRevision) {
      if (Number(savedRevision) < changeRevision) return;
      dirty = false;
      updateDirtyUi();
      vscode.postMessage({ type: "dirtyStateChanged", dirty: false });
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

    function setStatus(message, useToast = false, isError = false) {
      if (!toastStatusEl) return;
      if (!isError && toastStatusEl.classList.contains("isVisible") && toastStatusEl.classList.contains("isError")) return;

      if (!useToast || !message) {
        clearStatus();
        return;
      }

      if (toastTimer) {
        clearTimeout(toastTimer);
        toastTimer = null;
      }

      toastStatusTextEl.textContent = message;
      dismissStatusBtn.hidden = !isError;
      toastStatusEl.setAttribute("role", isError ? "alert" : "status");
      toastStatusEl.classList.toggle("isError", Boolean(isError));
      toastStatusEl.classList.add("isVisible");
      if (typeof queueNoteDisplaySnapshot === "function") queueNoteDisplaySnapshot();

      if (!isError) toastTimer = setTimeout(() => clearStatus(), 1800);
    }

    function clearStatus({ force = false } = {}) {
      if (!toastStatusEl) return;
      if (!force && toastStatusEl.classList.contains("isError")) return;
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = null;
      toastStatusEl.classList.remove("isVisible");
      toastStatusEl.classList.remove("isError");
      toastStatusTextEl.textContent = "";
      dismissStatusBtn.hidden = true;
      toastStatusEl.setAttribute("role", "status");
      if (typeof queueNoteDisplaySnapshot === "function") queueNoteDisplaySnapshot();
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
        payload: collectPayload(),
        revision: changeRevision,
      });
    }

    [
      document.querySelector(".editorPane"),
      document.querySelector(".previewPane"),
      document.querySelector(".layout"),
    ].forEach((scrollEl) => {
      scrollEl?.addEventListener("scroll", saveScrollPositions);
    });

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
    const noteShell = document.getElementById("noteShell");
    const noteFooter = document.querySelector(".noteFooterBar");

    function updateNoteBottomClearance() {
      if (!noteShell || !noteFooter) return;
      const footerRect = noteFooter.getBoundingClientRect();
      if (!footerRect.height) return;
      const footerOffset = Math.max(0, window.innerHeight - footerRect.top);
      noteShell.style.setProperty("--note-footer-offset", (footerOffset + 8) + "px");
      const assistRect = noteAssistPanel?.hidden === false ? noteAssistPanel.getBoundingClientRect() : null;
      const coveredHeight = assistRect?.height ? Math.max(footerOffset, window.innerHeight - assistRect.top) : footerOffset;
      noteShell.style.setProperty("--note-bottom-clearance", (Math.ceil(coveredHeight) + 8) + "px");
    }

    if (typeof ResizeObserver === "function") {
      const bottomObserver = new ResizeObserver(updateNoteBottomClearance);
      if (noteFooter) bottomObserver.observe(noteFooter);
      if (noteAssistPanel) bottomObserver.observe(noteAssistPanel);
    }
    window.addEventListener("resize", updateNoteBottomClearance);

    function setInputAssistOpen(isOpen) {
      if (!noteAssistPanel || !toggleInputAssistBtn) return;

      noteAssistPanel.hidden = !isOpen;
      toggleInputAssistBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
      toggleInputAssistBtn.classList.toggle("isActive", isOpen);
      updateNoteBottomClearance();

      try {
        localStorage.setItem(INPUT_ASSIST_STATE_KEY, isOpen ? "1" : "0");
      } catch {}
    }

    toggleInputAssistBtn?.addEventListener("click", () => {
      const nextOpen = noteAssistPanel?.hidden !== false;
      setInputAssistOpen(nextOpen);
    });

    registerNoteEvents();
    registerNoteReplaceEvents();
    bindNoteTocEvents();
    registerNoteMemoVisibilityEvents();
    registerReferenceLinkEvents();
    registerAddressBookEvents();

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

    renderPreview();
    stabilizePreviewRender();

    persistWebviewState();
    vscode.postMessage({type:"noteDisplay.editorReady"});
  </script>
</body>
</html>`;
}

module.exports = { getNoteWebviewHtml, getPanelTitle, getWebviewUiSettings, css };
