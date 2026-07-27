const {
  getInputAssistToolbarCss,
  getInputAssistToolbarHtml,
  getInputAssistToolbarScript,
} = require("../shared/input-assist-toolbar");
const { getConceptMemoStyles } = require("./concept-memo-styles");
const { getConceptMemoUtilsScript } = require("./script-utils");
const { getConceptMemoStateScript } = require("./script-state");
const { getConceptMemoListScript } = require("./script-list");
const { getConceptMemoLayoutScript } = require("./script-layout");
const { getConceptMemoEditorScript } = require("./script-editor");
const { getConceptMemoEventsScript } = require("./script-events");

function getConceptMemoWebviewHtml(webview, bootState) {
  const nonce = String(Date.now());
  const bootJson = JSON.stringify(bootState).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>構想メモ</title>
  <style>
  ${getConceptMemoStyles()}
  ${getInputAssistToolbarCss()}
  </style>
</head>
<body>
  <div id="toastMessage" class="toastMessage" aria-live="polite"></div>
  <div class="app" id="conceptMemoApp">
    <aside class="sidebar" id="memoSidebar">
            <div class="row">
        <h1 class="title">構想メモ</h1>
        <div class="spacer"></div>
        <button class="iconButton pushButton" id="toggleSidebarButton" title="メモ一覧を折りたたむ">←</button>
        <div class="memoListMenuArea">
          <button class="iconButton pushButton" id="openSearchPanelButton" title="検索">⌕</button>
          <button class="iconButton pushButton" id="openSortPanelButton" title="並び順">⇅</button>
          <button class="iconButton pushButton" id="openFilterPanelButton" title="絞り込み">▤</button>
          <button class="iconButton pushButton" id="openBulkDeletePanelButton" title="選択削除">☑</button>

          <div class="listMenuPopover" id="memoSearchPanel" hidden>
            <div class="row" style="margin-bottom:8px;">
              <label class="muted" for="memoSearchInput">検索</label>
              <div class="spacer"></div>
              <button class="button secondary" id="clearSearchButton">クリア</button>
            </div>
            <input
              class="input"
              id="memoSearchInput"
              type="text"
              placeholder="タイトル・本文・タグなどを検索"
            />
          </div>

          <div class="listMenuPopover" id="memoSortPanel" hidden>
            <div class="row" style="margin-bottom:8px;">
              <label class="muted">並び順</label>
            </div>
            <div class="row sortPanelRow">
              <div class="sortDirectionRadios" id="memoSortDirectionRadios">
                <label class="sortRadioOption">
                  <input type="radio" name="memoSortDirection" value="desc" id="memoSortDirectionDesc" />
                  <span>降順</span>
                </label>
                <label class="sortRadioOption">
                  <input type="radio" name="memoSortDirection" value="asc" id="memoSortDirectionAsc" />
                  <span>昇順</span>
                </label>
              </div>

              <select class="input" id="memoSortFieldSelect">
                <option value="updated">更新</option>
                <option value="created">作成</option>
                <option value="title">タイトル</option>
              </select>
            </div>
          </div>

          <div class="listMenuPopover" id="memoFilterPanel" hidden>
            <div class="row" style="margin-bottom:8px;">
              <label class="muted" for="memoFilterSelect">絞り込み</label>
            </div>
            <div class="row" style="margin-bottom:8px;">
              <label class="muted">絞り込み</label>
              <div class="spacer"></div>
              <button class="button secondary" id="clearQuickFilterButton">解除</button>
            </div>

            <div class="filterGroup">
              <div class="filterGroupLabel">種別</div>
              <div class="filterChipRow" id="memoTypeFilterRow">
                <button type="button" class="filterChip" data-filter-group="type" data-filter-value="text">通常メモ</button>
                <button type="button" class="filterChip" data-filter-group="type" data-filter-value="list">リストメモ</button>
                <button type="button" class="filterChip" data-filter-group="type" data-filter-value="todo">TODOメモ</button>
              </div>
            </div>

            <div class="filterGroup">
              <div class="filterGroupLabel">状態</div>
              <div class="filterChipRow" id="memoStateFilterRow">
                <button type="button" class="filterChip" data-filter-group="state" data-filter-value="dashboard">ダッシュボード</button>
                <button type="button" class="filterChip" data-filter-group="state" data-filter-value="archived">アーカイブ</button>
                <button type="button" class="filterChip" data-filter-group="state" data-filter-value="pinned">ピン留め</button>
              </div>
            </div>

            <div class="filterGroup">
              <div class="filterGroupLabel">出典状態</div>
              <div class="filterChipRow" id="memoSourceFilterRow">
                <button type="button" class="filterChip" data-filter-group="source" data-filter-value="hasSource">出典あり</button>
                <button type="button" class="filterChip" data-filter-group="source" data-filter-value="cleared">元メモなし</button>
                <button type="button" class="filterChip" data-filter-group="source" data-filter-value="missing">リンク切れ</button>
              </div>
            </div>
          </div>

          <div class="listMenuPopover" id="memoBulkDeletePanel" hidden>
            <div class="row">
              <label class="muted">選択削除</label>
              <div class="spacer"></div>
              <button class="button secondary" id="toggleBulkDeleteButton">選択</button>
              <button class="button secondary dangerButton" id="executeBulkDeleteButton" hidden>削除</button>
            </div>
          </div>
        </div>
        <button class="button" id="createMemoButton">＋ 新規</button>
      </div>

      <div class="box countSummaryStrong">
        <div class="muted" id="memoCountText">件数を集計中…</div>
        <div class="muted" id="memoCountSubText" style="margin-top:4px;"></div>
        <div class="muted" id="memoSortModeText" style="margin-top:4px;"></div>
      </div>

      <div class="box" id="tagFilterBox" style="display:none;">
        <div class="row">
          <span class="muted">タグ絞り込み:</span>
          <span class="tagChip" id="activeTagFilterLabel"></span>
          <div class="spacer"></div>
          <button class="button secondary" id="clearTagFilterButton">解除</button>
        </div>
      </div>

      <div class="memoLists">
        <div class="memoList" id="memoList"></div>
      </div>
    </aside>

    <main class="main" id="memoMain">
      <div class="editorHeader">
        <div class="row editorHeaderTop">
          <div class="row editorHeaderLeft">
            <button class="iconButton pushButton" id="toggleSidebarButtonMain" title="メモ一覧を折りたたむ">←</button>
            <h2 class="title">編集</h2>
            <div id="statusText" class="saveStatus">保存済み</div>
          </div>

          <div class="spacer"></div>

          <div class="row editorHeaderActions">
            <button class="button secondary compactActionButton" id="saveButton">
              <span>保存</span>
              <span class="shortcutHint">Ctrl+S</span>
            </button>
            <button class="button secondary compactActionButton" id="closeButton">
              <span>閉じる</span>
              <span class="shortcutHint">Ctrl+W</span>
            </button>
            <button class="button secondary compactActionButton dangerButton" id="deleteButton">削除</button>
          </div>
        </div>

        <div class="row editorHeaderBottom">
          <div class="row stateBadgeRow" id="editorStateBadges"></div>
        </div>
      </div>

      <div id="editorContent">
        <div class="box" id="editorEmpty">
          <div class="empty">左側の「＋ 新規」からメモを作成できます。</div>
        </div>

        <div id="editorPanel" style="display:none;">
          <div class="box" id="memoTitleBox">
            <div class="row memoTitleRow">
              <div class="memoTitleField">
                <div class="row" style="margin-bottom:8px;">
                  <label class="muted" for="memoTitle">タイトル</label>
                </div>
                <input class="input" id="memoTitle" type="text" placeholder="メモタイトル" />
              </div>

              <div class="memoEditorMenuArea">
                <button class="iconButton" id="memoEditorMoreButton" title="メモ設定と操作">︙</button>

                <div id="memoEditorMenuPanel" class="editorMenuPopover" hidden>
                  <button type="button" class="menuItemButton" id="openMemoTypeMenuButton">
                    <span>種別</span>
                    <span class="menuItemValue" id="memoTypeMenuValue">通常メモ</span>
                  </button>

                  <button type="button" class="menuItemButton" id="openMemoTagsMenuButton">
                    <span>タグ</span>
                    <span class="menuItemValue" id="memoTagsMenuValue">未設定</span>
                  </button>

                  <button type="button" class="menuItemButton" id="copyMemoButton">
                    本文をコピー
                  </button>

                  <button type="button" class="menuItemButton" id="openSourceNoteButton" style="display:none;">
                    出典元：ノートを開く
                  </button>

                  <button type="button" class="menuItemButton" id="applyToNoteButton" style="display:none;">
                    出典元：項目メモへ反映
                  </button>

                  <button type="button" class="menuItemButton" id="unlinkSourceButton" style="display:none;">
                    出典元：リンクを解除
                  </button>
                </div>

                <div id="memoTypeSubmenu" class="editorSubmenu" hidden>
                  <div class="submenuTitle">種別</div>
                  <select class="input" id="memoType">
                    <option value="text">通常メモ</option>
                    <option value="list">リストメモ</option>
                    <option value="todo">TODOメモ</option>
                  </select>
                </div>

                <div id="memoTagsSubmenu" class="editorSubmenu" hidden>
                  <div class="submenuTitle">タグ</div>
                  <input
                    class="input"
                    id="memoTags"
                    type="text"
                    placeholder="例: 着想, シーン, 台詞, 保留"
                  />
                  <div class="muted compactHelpText">カンマ区切りで入力</div>
                  <div id="memoTagsSuggestionsInput" class="tagSuggestionsBlock" style="display:none;">
                    <div class="muted tagSuggestionLabel">入力中候補</div>
                    <div id="memoTagsSuggestionsMatched" class="tagSuggestions"></div>
                  </div>

                  <div id="memoTagsSuggestionsReuse" class="tagSuggestionsBlock">
                    <div class="muted tagSuggestionLabel">再利用候補</div>
                    <div id="memoTagsSuggestionsAll" class="tagSuggestions"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="box" id="textEditorBox">
            <div class="row" style="margin-bottom:8px;">
              <label class="muted" for="memoBody">本文</label>
            </div>
            <textarea class="textarea" id="memoBody" placeholder="ここにメモを書きます"></textarea>
            <div class="muted" id="memoBodyCharCount" style="margin-top:8px;"></div>

            ${getInputAssistToolbarHtml({
              rootId: "conceptInputAssistToolbar",
              title: "入力補助",
              collapsed: true,
            })}
          </div>

          <div class="box" id="listEditorBox" style="display:none;">
            <div class="row" style="margin-bottom:8px;">
              <label class="muted" for="memoListItems">リスト項目（1行につき1項目）</label>
            </div>
            <textarea class="textarea" id="memoListItems" placeholder="1行につき1項目"></textarea>
            <div class="muted" id="memoListItemCount" style="margin-top:8px;"></div>
          </div>

          <div class="box" id="todoEditorBox" style="display:none;">
            <div class="row" style="margin-bottom:8px;">
              <label class="muted">TODO項目</label>
            </div>

            <div class="row" style="margin-bottom:10px;">
              <input
                class="input"
                id="memoTodoNewItem"
                type="text"
                placeholder="TODOを入力して追加"
              />
              <button class="button secondary" id="addTodoItemButton">追加</button>
            </div>

            <div class="muted" id="todoSummary" style="margin-bottom:8px;"></div>
            <div id="memoTodoChecklist" class="memoList"></div>
          </div>

          <div class="box compactBox">
            <div class="muted" id="metaText"></div>
            <div class="muted workTitleLabel" id="filePathView" style="margin-top:6px;"></div>
          </div>
        </div>
      </div>
    </main>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const bootState = ${bootJson};
    const persistedUiState = vscode.getState() || {};

    const MEMO_TYPE_LABELS = {
      text: "通常メモ",
      list: "リストメモ",
      todo: "TODOメモ",
    };

    let currentState = normalizeState(bootState);
    let selectedMemoId = persistedUiState.selectedMemoId || currentState.data.memos[0]?.id || "";
    let isDirty = false;
    let searchQuery = persistedUiState.searchQuery || "";
    let activeQuickFilters = {
      type:
        persistedUiState.activeQuickFilters?.type ||
        bootState.initialQuickFilters?.type ||
        "",
      state: Array.isArray(persistedUiState.activeQuickFilters?.state)
        ? persistedUiState.activeQuickFilters.state
        : Array.isArray(bootState.initialQuickFilters?.state)
          ? bootState.initialQuickFilters.state
          : [],
      source:
        persistedUiState.activeQuickFilters?.source ||
        bootState.initialQuickFilters?.source ||
        "",
    };
    let activeTagFilter = persistedUiState.activeTagFilter || "";
    let sortField =
      localStorage.getItem(getSortFieldStorageKey()) ||
      persistedUiState.sortField ||
      "updated";
    let sortDirection =
      localStorage.getItem(getSortDirectionStorageKey()) ||
      persistedUiState.sortDirection ||
      "desc";
    let isSidebarCollapsed = Boolean(persistedUiState.isSidebarCollapsed);
    let toastTimer = null;
    let autoSaveAfterApplyToNote = Boolean(persistedUiState.autoSaveAfterApplyToNote);

    let isBulkDeleteMode = false;
    let selectedMemoIdsForDelete = [];

    let openListPanel = persistedUiState.openListPanel || "";
    let isNarrowLayout = false;
    let isEditorMenuOpen = false;
    let openEditorSubmenu = "";

    ${getConceptMemoUtilsScript()}
    ${getConceptMemoStateScript()}
    ${getConceptMemoListScript()}
    ${getConceptMemoLayoutScript()}
    ${getConceptMemoEditorScript()}
    ${getConceptMemoEventsScript()}
    ${getInputAssistToolbarScript({
      rootId: "conceptInputAssistToolbar",
      targetSelector:
        "#memoTitle, #memoTags, #memoBody, #memoListItems, #memoTodoNewItem",
      toastFunctionName: "showToast",
    })}

    const conceptInputAssist = createInputAssistController();

    function renderAll() {
      renderSidebarState();
      renderSearchInput();
      renderQuickFilter();
      renderTagFilter();
      renderSortSelect();
      renderMemoCounts();
      renderBulkDeleteActions();
      renderListPanels();
      renderMemoList();
      renderEditor();
      persistUiState();
      persistWebviewState();
    }

    bindButtons();
    bindShortcuts();
    bindTodoActions();
    bindQuickFilter();
    bindListPanelActions();
    bindTagFilterActions();
    bindSortActions();
    bindSidebarActions();
    bindResponsiveLayout();
    bindEditorMenuActions();
    bindBulkDeleteActions();
    handleSearchInput();
    handleTitleInput();
    handleTypeInput();
    handleBodyInput();
    handleListInput();
    handleTagsInput();
    renderAll();

    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
}

module.exports = {
  getConceptMemoWebviewHtml,
};
