const { getConceptMemoEditorActionsScript } = require("./script-editor-actions");

function getConceptMemoEditorScript() {
  return `
    function setEditorMode(type) {
      const textEditorBox = document.getElementById("textEditorBox");
      const listEditorBox = document.getElementById("listEditorBox");
      const todoEditorBox = document.getElementById("todoEditorBox");

      if (textEditorBox) {
        textEditorBox.style.display = type === "text" ? "" : "none";
      }

      if (listEditorBox) {
        listEditorBox.style.display = type === "list" ? "" : "none";
      }

      if (todoEditorBox) {
        todoEditorBox.style.display = type === "todo" ? "" : "none";
      }
    }

    function renderEditorMenuPanel(memo) {
      const panel = document.getElementById("memoEditorMenuPanel");
      const typeSubmenu = document.getElementById("memoTypeSubmenu");
      const tagsSubmenu = document.getElementById("memoTagsSubmenu");
      const folderSubmenu = document.getElementById("memoFolderSubmenu");

      const openSourceNoteButton = document.getElementById("openSourceNoteButton");
      const applyToNoteButton = document.getElementById("applyToNoteButton");
      const unlinkSourceButton = document.getElementById("unlinkSourceButton");
      const copyMemoButton = document.getElementById("copyMemoButton");

      const typeValue = document.getElementById("memoTypeMenuValue");
      const tagsValue = document.getElementById("memoTagsMenuValue");
      const folderValue = document.getElementById("memoFolderMenuValue");

      if (!panel) return;

      const canOpen = canOpenSourceNote(memo);
      const canApply = canApplyToNoteItem(memo);
      const canUnlink = canUnlinkSourceNote(memo);
      const canCopy = ["text", "list"].includes(String(memo?.type || "text"));
      const tags = Array.isArray(memo?.tags) ? memo.tags : [];

      panel.hidden = !isEditorMenuOpen;

      if (typeSubmenu) {
        typeSubmenu.hidden = !(isEditorMenuOpen && openEditorSubmenu === "type");
      }

      if (tagsSubmenu) {
        tagsSubmenu.hidden = !(isEditorMenuOpen && openEditorSubmenu === "tags");
      }

      if (folderSubmenu) {
        folderSubmenu.hidden = !(isEditorMenuOpen && openEditorSubmenu === "folder");
      }

      if (openSourceNoteButton) {
        openSourceNoteButton.style.display = canOpen ? "" : "none";
      }

      if (applyToNoteButton) {
        applyToNoteButton.style.display = canApply ? "" : "none";
      }

      if (unlinkSourceButton) {
        unlinkSourceButton.style.display = canUnlink ? "" : "none";
      }

      if (copyMemoButton) {
        copyMemoButton.style.display = canCopy ? "" : "none";
      }

      if (typeValue) {
        typeValue.textContent = getMemoTypeLabel(memo?.type || "text");
      }

      if (tagsValue) {
        tagsValue.textContent = tags.length ? tags.join(", ") : "未設定";
      }

      if (folderValue) {
        const folderNames = getMemoFolderNames(memo);
        folderValue.textContent = folderNames.length ? folderNames.join("、") : "未分類";
      }
    }

    function syncEditorMenuUi() {
      renderEditorMenuPanel(getSelectedMemo());
    }

    function renderTodoChecklist(memo) {
      const listEl = document.getElementById("memoTodoChecklist");
      const summaryEl = document.getElementById("todoSummary");
      if (!listEl) return;

      const items = Array.isArray(memo?.todoItems) ? memo.todoItems : [];
      const doneCount = items.filter((item) => item?.done).length;

      if (summaryEl) {
        summaryEl.textContent = "完了 " + doneCount + " / " + items.length;
      }

      if (!items.length) {
        listEl.innerHTML = '<div class="memoItem muted">TODOはまだありません。</div>';
        return;
      }

      listEl.innerHTML = items.map((item, itemIndex) => {
        const text = item?.text || "";
        const done = Boolean(item?.done);
        return ''
          + '<div class="todoItemRow" data-todo-id="' + escapeHtml(item.id) + '">'
          +   '<input type="checkbox" class="todoToggle" data-todo-id="' + escapeHtml(item.id) + '"' + (done ? ' checked' : '') + ' />'
          +   '<input class="todoItemTextInput' + (done ? ' isDone' : '') + '" data-todo-edit-id="' + escapeHtml(item.id) + '" value="' + escapeHtml(text) + '" aria-label="TODOの文言" />'
          +   '<button class="iconButton todoMoveButton" type="button" data-todo-move-id="' + escapeHtml(item.id) + '" data-todo-move-direction="up" title="上へ移動" aria-label="上へ移動"' + (itemIndex === 0 ? ' disabled' : '') + '>↑</button>'
          +   '<button class="iconButton todoMoveButton" type="button" data-todo-move-id="' + escapeHtml(item.id) + '" data-todo-move-direction="down" title="下へ移動" aria-label="下へ移動"' + (itemIndex === items.length - 1 ? ' disabled' : '') + '>↓</button>'
          +   '<button class="iconButton todoDeleteButton" type="button" data-todo-delete-id="' + escapeHtml(item.id) + '">削除</button>'
          + '</div>';
      }).join("");

      listEl.querySelectorAll(".todoToggle").forEach((el) => {
        el.addEventListener("change", () => {
          toggleTodoItemDone(el.dataset.todoId || "");
        });
      });

      listEl.querySelectorAll(".todoDeleteButton").forEach((el) => {
        el.addEventListener("click", () => {
          deleteTodoItem(el.dataset.todoDeleteId || "");
        });
      });

      listEl.querySelectorAll("[data-todo-move-id]").forEach((el) => {
        el.addEventListener("click", () => {
          moveTodoItem(
            el.dataset.todoMoveId || "",
            el.dataset.todoMoveDirection || "",
          );
        });
      });

      listEl.querySelectorAll("[data-todo-edit-id]").forEach((el) => {
        el.addEventListener("change", () => {
          updateTodoItemText(el.dataset.todoEditId || "", el.value);
        });
      });
    }

    function renderCommonTodoChecklist() {
      const root = document.getElementById("commonTodoChecklist");
      const summary = document.getElementById("commonTodoSummary");
      if (!root) return;
      const items = Array.isArray(currentState?.data?.commonTodoItems)
        ? currentState.data.commonTodoItems
        : [];
      const doneCount = items.filter((item) => item?.done).length;
      if (summary) summary.textContent = "完了 " + doneCount + " / " + items.length;
      root.innerHTML = items.length
        ? items.map((item, itemIndex) => ''
          + '<div class="todoItemRow">'
          +   '<input type="checkbox" data-common-todo-toggle="' + escapeHtml(item.id) + '"' + (item.done ? ' checked' : '') + ' />'
          +   '<input class="todoItemTextInput' + (item.done ? ' isDone' : '') + '" data-common-todo-edit="' + escapeHtml(item.id) + '" value="' + escapeHtml(item.text || '') + '" />'
          +   '<button class="iconButton todoMoveButton" type="button" data-common-todo-move="' + escapeHtml(item.id) + '" data-common-todo-direction="up" title="上へ移動" aria-label="上へ移動"' + (itemIndex === 0 ? ' disabled' : '') + '>↑</button>'
          +   '<button class="iconButton todoMoveButton" type="button" data-common-todo-move="' + escapeHtml(item.id) + '" data-common-todo-direction="down" title="下へ移動" aria-label="下へ移動"' + (itemIndex === items.length - 1 ? ' disabled' : '') + '>↓</button>'
          +   '<button class="iconButton" type="button" data-common-todo-delete="' + escapeHtml(item.id) + '">削除</button>'
          + '</div>').join("")
        : '<div class="muted">共通TODOはまだありません。</div>';

      root.querySelectorAll("[data-common-todo-toggle]").forEach((el) => {
        el.addEventListener("change", () => patchCommonTodo(el.dataset.commonTodoToggle, { done: el.checked }));
      });
      root.querySelectorAll("[data-common-todo-edit]").forEach((el) => {
        el.addEventListener("change", () => patchCommonTodo(el.dataset.commonTodoEdit, { text: el.value.trim() }));
      });
      root.querySelectorAll("[data-common-todo-delete]").forEach((el) => {
        el.addEventListener("click", () => {
          currentState.data.commonTodoItems = items.filter((item) => item.id !== el.dataset.commonTodoDelete);
          currentState.data.updatedAt = new Date().toISOString();
          setDirty(true);
          renderCommonTodoChecklist();
        });
      });
      root.querySelectorAll("[data-common-todo-move]").forEach((el) => {
        el.addEventListener("click", () => {
          moveCommonTodo(
            el.dataset.commonTodoMove || "",
            el.dataset.commonTodoDirection || "",
          );
        });
      });
    }

    function renderEditor() {
      const editorEmpty = document.getElementById("editorEmpty");
      const editorPanel = document.getElementById("editorPanel");
      const pinButton = document.getElementById("pinButton");
      const archiveButton = document.getElementById("archiveButton");
      const dashboardButton = document.getElementById("dashboardButton");
      const sourceAutoSyncControl = document.getElementById("sourceAutoSyncControl");
      const sourceAutoSyncToggle = document.getElementById("sourceAutoSyncToggle");
      const memo = getSelectedMemo();

      if (!memo) {
        if (editorEmpty) editorEmpty.style.display = "";
        if (editorPanel) editorPanel.style.display = "none";
        [pinButton, archiveButton, dashboardButton].forEach((button) => {
          if (!button) return;
          button.disabled = true;
          button.classList.remove("isActive");
        });
        setConceptActionState(pinButton, "ピン留め", false);
        setConceptActionState(archiveButton, "アーカイブする", false);
        setConceptActionState(dashboardButton, "Dashboardに表示する", false);
        if (sourceAutoSyncControl) sourceAutoSyncControl.style.display = "none";
        return;
      }

      if (editorEmpty) editorEmpty.style.display = "none";
      if (editorPanel) editorPanel.style.display = "";

      const memoTitle = document.getElementById("memoTitle");
      const memoType = document.getElementById("memoType");
      const memoBody = document.getElementById("memoBody");
      const memoListItems = document.getElementById("memoListItems");
      const memoTags = document.getElementById("memoTags");
      const metaText = document.getElementById("metaText");
      const filePathView = document.getElementById("filePathView");
      const sourceSummary = getSourceSummaryFull(memo);
      const hasNoteItemSource = String(memo?.source?.kind || "") === "noteItem";

      [pinButton, archiveButton, dashboardButton].forEach((button) => {
        if (button) button.disabled = false;
      });

      if (pinButton) {
        setConceptActionState(pinButton, memo?.isPinned ? "ピン留めを解除する" : "ピン留め", Boolean(memo?.isPinned));
      }
      if (archiveButton) {
        setConceptActionState(archiveButton, memo?.isArchived ? "アーカイブを解除する" : "アーカイブする", Boolean(memo?.isArchived));
      }
      if (dashboardButton) {
        setConceptActionState(dashboardButton, memo?.showInDashboard ? "Dashboardの表示を解除する" : "Dashboardに表示する", Boolean(memo?.showInDashboard));
      }

      if (sourceAutoSyncControl) {
        sourceAutoSyncControl.style.display = hasNoteItemSource ? "" : "none";
      }
      if (sourceAutoSyncToggle) {
        sourceAutoSyncToggle.checked = isConceptMemoAutoSyncEnabled(memo?.source);
        sourceAutoSyncToggle.disabled = !canApplyToNoteItem(memo);
      }

      if (memoTitle) memoTitle.value = memo.title || "";
      if (memoType) memoType.value = memo.type || "text";
      if (memoBody) memoBody.value = memo.body || "";

      if (memoListItems) {
        memoListItems.value = Array.isArray(memo.listItems)
          ? memo.listItems.map((item) => item?.text || "").join("\\n")
          : "";
      }

      setEditorMode(memo.type || "text");

      renderTodoChecklist(memo);

      if (metaText) {
        const baseMetaHtml =
          '<span class="memoMetaLabel">種別:</span> ' +
          '<span class="memoMetaValue">' +
          escapeHtml(getMemoTypeLabel(memo.type || "text")) +
          "</span>" +
          '<span class="memoMetaSeparator"> / </span>' +
          '<span class="memoMetaLabel">更新:</span> ' +
          '<span class="memoMetaValue">' +
          escapeHtml(formatJstDateTime(memo.updatedAt || "")) +
          "</span>";

        const sourceStatusBadgeHtml = getSourceStatusBadgeHtml(memo);

        metaText.innerHTML = sourceSummary
          ? baseMetaHtml +
            "<br>" +
            '<span id="conceptMemoSourceSummary" class="' + getSourceSummaryClassName(memo) + '">' +
            escapeHtml(sourceSummary) +
            "</span>" +
            sourceStatusBadgeHtml
          : baseMetaHtml;
      }

      if (filePathView) {
        filePathView.textContent = currentState.workTitle
          ? "作品: " + currentState.workTitle
          : "";
      }

      if (memoTags) memoTags.value = formatTagsInput(memo.tags || []);
      renderEditorMenuPanel(memo);
      renderBodyCharCount(memo);
      renderTagSuggestions(memo);
    }

    function renderBodyCharCount(memo) {
      const bodyCountEl = document.getElementById("memoBodyCharCount");
      const listCountEl = document.getElementById("memoListItemCount");
      const type = String(memo?.type || "text");

      if (bodyCountEl) {
        bodyCountEl.textContent = "";
        bodyCountEl.style.display = "none";
      }

      if (listCountEl) {
        listCountEl.textContent = "";
        listCountEl.style.display = "none";
      }

      if (type === "text") {
        if (!bodyCountEl) return;

        const count = String(memo?.body || "").replace(/\\r?\\n/g, "").length;
        bodyCountEl.textContent = "文字数: " + count + "文字";
        bodyCountEl.style.display = "";
        return;
      }

      if (type === "list") {
        if (!listCountEl) return;

        const items = Array.isArray(memo?.listItems) ? memo.listItems : [];
        listCountEl.textContent = "項目数: " + items.length + "件";
        listCountEl.style.display = "";
      }
    }

    function collectAvailableTags() {
      const memos = Array.isArray(currentState?.data?.memos)
        ? currentState.data.memos
        : [];

      const tags = new Set();

      for (const memo of memos) {
        const values = Array.isArray(memo?.tags) ? memo.tags : [];
        for (const tag of values) {
          const normalized = String(tag || "").trim();
          if (normalized) tags.add(normalized);
        }
      }

      return [...tags].sort((a, b) => a.localeCompare(b, "ja"));
    }

    function renderTagSuggestions(memo) {
      const input = document.getElementById("memoTags");
      const matchedWrap = document.getElementById("memoTagsSuggestionsInput");
      const matchedRoot = document.getElementById("memoTagsSuggestionsMatched");
      const allWrap = document.getElementById("memoTagsSuggestionsReuse");
      const allRoot = document.getElementById("memoTagsSuggestionsAll");

      if (!input || !matchedWrap || !matchedRoot || !allWrap || !allRoot) return;

      const rawValue = String(input.value || "");
      const hasTrailingComma = /,\s*$/.test(rawValue);

      const normalizedAll = normalizeTags(rawValue);

      let committedTags = normalizedAll;
      let editingPart = "";

      if (!hasTrailingComma) {
        const lastCommaIndex = rawValue.lastIndexOf(",");
        if (lastCommaIndex >= 0) {
          committedTags = normalizeTags(rawValue.slice(0, lastCommaIndex));
          editingPart = rawValue.slice(lastCommaIndex + 1).trim().toLowerCase();
        } else {
          committedTags = [];
          editingPart = rawValue.trim().toLowerCase();
        }
      }

      const committedSet = new Set(committedTags);
      const reusableTags = collectAvailableTags().filter((tag) => !committedSet.has(tag));

      const matchedCandidates = editingPart
        ? reusableTags.filter((tag) => tag.toLowerCase().includes(editingPart))
        : [];

      function bindSuggestionClicks(root, getNextTags) {
        root.querySelectorAll("[data-tag-suggestion]").forEach((el) => {
          el.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();

            const picked = String(el.dataset.tagSuggestion || "").trim();
            if (!picked) return;

            const nextTags = getNextTags(picked);
            input.value = nextTags.join(", ");

            isEditorMenuOpen = true;
            openEditorSubmenu = "tags";

            updateSelectedMemo({
              tags: normalizeTags(nextTags),
            });

            renderEditorMenuPanel(getSelectedMemo());
            renderTagSuggestions(getSelectedMemo());
            input.focus();
          });
        });
      }

      if (matchedCandidates.length) {
        matchedRoot.innerHTML = matchedCandidates
          .map(
            (tag) =>
              '<button type="button" class="tagSuggestionChip" data-tag-suggestion="' +
              escapeHtml(tag) +
              '">' +
              escapeHtml(tag) +
              "</button>",
          )
          .join("");
        matchedWrap.style.display = "";
        bindSuggestionClicks(matchedRoot, (picked) => [...committedTags, picked]);
      } else {
        matchedRoot.innerHTML = "";
        matchedWrap.style.display = "none";
      }

      if (reusableTags.length) {
        allRoot.innerHTML = reusableTags
          .map(
            (tag) =>
              '<button type="button" class="tagSuggestionChip" data-tag-suggestion="' +
              escapeHtml(tag) +
              '">' +
              escapeHtml(tag) +
              "</button>",
          )
          .join("");
        allWrap.style.display = "";
        bindSuggestionClicks(allRoot, (picked) => {
          const base = normalizeTags(input.value);
          return [...base, picked];
        });
      } else {
        allRoot.innerHTML = "";
        allWrap.style.display = "none";
      }
    }

    ${getConceptMemoEditorActionsScript()}
  `;
}

module.exports = {
  getConceptMemoEditorScript,
};
