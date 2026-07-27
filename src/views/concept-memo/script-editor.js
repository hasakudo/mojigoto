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

      const openSourceNoteButton = document.getElementById("openSourceNoteButton");
      const applyToNoteButton = document.getElementById("applyToNoteButton");
      const unlinkSourceButton = document.getElementById("unlinkSourceButton");
      const copyMemoButton = document.getElementById("copyMemoButton");

      const typeValue = document.getElementById("memoTypeMenuValue");
      const tagsValue = document.getElementById("memoTagsMenuValue");

      if (!panel) return;

      const canOpen = canOpenSourceNote(memo);
      const canApply = canApplyToNoteItem(memo);
      const canUnlink = canUnlinkSourceNote(memo);
      const canCopy = String(memo?.type || "text") === "text";
      const tags = Array.isArray(memo?.tags) ? memo.tags : [];

      panel.hidden = !isEditorMenuOpen;

      if (typeSubmenu) {
        typeSubmenu.hidden = !(isEditorMenuOpen && openEditorSubmenu === "type");
      }

      if (tagsSubmenu) {
        tagsSubmenu.hidden = !(isEditorMenuOpen && openEditorSubmenu === "tags");
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
    }

    function syncEditorMenuUi() {
      renderEditorMenuPanel(getSelectedMemo());
    }

    function closeEditorMenu() {
      isEditorMenuOpen = false;
      openEditorSubmenu = "";
      syncEditorMenuUi();
    }

    function toggleEditorMenu(forceOpen = null) {
      if (typeof forceOpen === "boolean") {
        isEditorMenuOpen = forceOpen;
      } else {
        isEditorMenuOpen = !isEditorMenuOpen;
      }

      if (!isEditorMenuOpen) {
        openEditorSubmenu = "";
      }

      syncEditorMenuUi();
    }

    function toggleEditorSubmenu(name) {
      if (!isEditorMenuOpen) {
        isEditorMenuOpen = true;
      }

      openEditorSubmenu = openEditorSubmenu === name ? "" : name;
      syncEditorMenuUi();
    }

    function bindEditorMenuActions() {
      const button = document.getElementById("memoEditorMoreButton");
      const panel = document.getElementById("memoEditorMenuPanel");
      const typeSubmenu = document.getElementById("memoTypeSubmenu");
      const tagsSubmenu = document.getElementById("memoTagsSubmenu");
      const openTypeButton = document.getElementById("openMemoTypeMenuButton");
      const openTagsButton = document.getElementById("openMemoTagsMenuButton");

      if (button) {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleEditorMenu();
        });
      }

      if (openTypeButton) {
        openTypeButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleEditorSubmenu("type");
        });
      }

      if (openTagsButton) {
        openTagsButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleEditorSubmenu("tags");
        });
      }

      document.addEventListener("click", (event) => {
        if (!isEditorMenuOpen) return;

        const inButton = button && button.contains(event.target);
        const inPanel = panel && panel.contains(event.target);
        const inTypeSubmenu = typeSubmenu && typeSubmenu.contains(event.target);
        const inTagsSubmenu = tagsSubmenu && tagsSubmenu.contains(event.target);

        if (inButton || inPanel || inTypeSubmenu || inTagsSubmenu) {
          return;
        }

        closeEditorMenu();
      });

      window.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && isEditorMenuOpen) {
          closeEditorMenu();

          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
        }
      });
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

      listEl.innerHTML = items.map((item) => {
        const text = item?.text || "";
        const done = Boolean(item?.done);
        return ''
          + '<div class="todoItemRow" data-todo-id="' + escapeHtml(item.id) + '">'
          +   '<input type="checkbox" class="todoToggle" data-todo-id="' + escapeHtml(item.id) + '"' + (done ? ' checked' : '') + ' />'
          +   '<div class="todoItemText' + (done ? ' isDone' : '') + '">' + escapeHtml(text) + '</div>'
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
    }

    function toggleTodoItemDone(todoId) {
      if (!todoId) return;

      const memo = getSelectedMemo();
      if (!memo) return;

      const items = Array.isArray(memo.todoItems) ? [...memo.todoItems] : [];
      const index = items.findIndex((item) => item.id === todoId);
      if (index < 0) return;

      items[index] = {
        ...items[index],
        done: !items[index].done,
      };

      updateSelectedMemo({
        todoItems: items,
      });
      renderAll();
    }

    function addTodoItem(text) {
      const memo = getSelectedMemo();
      if (!memo) return;

      const value = String(text || "").trim();
      if (!value) return;

      const items = Array.isArray(memo.todoItems) ? [...memo.todoItems] : [];
      items.push({
        id: "td_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
        text: value,
        done: false,
      });

      updateSelectedMemo({
        todoItems: items,
      });

      const input = document.getElementById("memoTodoNewItem");
      if (input) {
        input.value = "";
      }

      renderAll();
      showToast("TODOを追加しました。");
    }

    function deleteTodoItem(todoId) {
      if (!todoId) return;

      const memo = getSelectedMemo();
      if (!memo) return;

      const items = Array.isArray(memo.todoItems) ? [...memo.todoItems] : [];
      const nextItems = items.filter((item) => item.id !== todoId);
      if (nextItems.length === items.length) return;

      updateSelectedMemo({
        todoItems: nextItems,
      });
      renderAll();
      showToast("TODOを削除しました。");
    }

    function renderEditor() {
      const editorEmpty = document.getElementById("editorEmpty");
      const editorPanel = document.getElementById("editorPanel");
      const memo = getSelectedMemo();

      if (!memo) {
        if (editorEmpty) editorEmpty.style.display = "";
        if (editorPanel) editorPanel.style.display = "none";
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
      const pinButton = document.getElementById("pinButton");
      const archiveButton = document.getElementById("archiveButton");
      const filePathView = document.getElementById("filePathView");
      const sourceSummary = getSourceSummaryFull(memo);
      const editorStateBadges = document.getElementById("editorStateBadges");

      if (editorStateBadges) {
        const badges = [];

        badges.push(
          '<button type="button" class="stateBadge isClickable ' +
            (memo?.isPinned ? 'isPinned isOn' : 'isOff') +
            '" data-state-action="togglePinned" title="' +
            (memo?.isPinned ? 'ピン留めを解除' : 'ピン留めする') +
            '">📌 ' +
            (memo?.isPinned ? 'ピン留め中' : 'ピン留め') +
          '</button>'
        );

        badges.push(
          '<button type="button" class="stateBadge isClickable ' +
            (memo?.showInDashboard ? 'isOn' : 'isOff') +
            '" data-state-action="toggleDashboard" title="' +
            (memo?.showInDashboard ? 'ダッシュボード表示を解除' : 'ダッシュボードに表示') +
            '">' +
            (memo?.showInDashboard ? 'ダッシュボード表示中' : 'ダッシュボード表示') +
          '</button>'
        );

        badges.push(
          '<button type="button" class="stateBadge isClickable ' +
            (memo?.isArchived ? 'isArchived isOn' : 'isOff') +
            '" data-state-action="toggleArchived" title="' +
            (memo?.isArchived ? 'アーカイブを解除' : 'アーカイブする') +
            '">' +
            (memo?.isArchived ? '保管中' : '保管') +
          '</button>'
        );

        editorStateBadges.innerHTML = badges.join("");

        editorStateBadges.querySelectorAll("[data-state-action]").forEach((el) => {
          el.addEventListener("click", () => {
            const action = el.dataset.stateAction || "";
            if (action === "togglePinned") {
              toggleSelectedMemoPinned();
            }
            if (action === "toggleDashboard") {
              toggleSelectedMemoDashboard();
            }
            if (action === "toggleArchived") {
              toggleSelectedMemoArchived();
            }
          });
        });
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
        const baseMeta =
          "種別: " + getMemoTypeLabel(memo.type || "text") +
          " / 更新: " + formatJstDateTime(memo.updatedAt || "");

        const sourceStatusBadgeHtml = getSourceStatusBadgeHtml(memo);

        metaText.innerHTML = sourceSummary
          ? escapeHtml(baseMeta) +
            "<br>" +
            '<span class="' + getSourceSummaryClassName(memo) + '">' +
            escapeHtml(sourceSummary) +
            "</span>" +
            sourceStatusBadgeHtml
          : escapeHtml(baseMeta);
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

    function toggleSelectedMemoPinned() {
      const memo = getSelectedMemo();
      if (!memo) return;

      const index = currentState.data.memos.findIndex((item) => item.id === memo.id);
      if (index < 0) return;

      const nextPinned = !memo.isPinned;

      currentState.data.memos[index] = {
        ...memo,
        isPinned: nextPinned,
        updatedAt: new Date().toISOString(),
      };
      currentState.data.updatedAt = new Date().toISOString();

      renderAll();
      showToast(nextPinned ? "ピン留めしました。" : "ピン留めを解除しました。");
      saveCurrentMemos({ silentToast: true, skipDirtyFlash: true });
    }

    function toggleSelectedMemoArchived() {
      const memo = getSelectedMemo();
      if (!memo) return;

      const index = currentState.data.memos.findIndex((item) => item.id === memo.id);
      if (index < 0) return;

      const nextArchived = !memo.isArchived;
      const isArchivedView =
        Array.isArray(activeQuickFilters?.state) &&
        activeQuickFilters.state.includes("archived");

      currentState.data.memos[index] = {
        ...memo,
        isArchived: nextArchived,
        updatedAt: new Date().toISOString(),
      };
      currentState.data.updatedAt = new Date().toISOString();

      if (!isArchivedView && nextArchived) {
        const visibleMemos = getFilteredMemos().filter((item) => item.id !== memo.id);
        selectedMemoId = visibleMemos[0]?.id || "";
      }

      if (isArchivedView && !nextArchived) {
        const visibleMemos = getFilteredMemos().filter((item) => item.id !== memo.id);
        selectedMemoId = visibleMemos[0]?.id || "";
      }

      renderAll();
      showToast(nextArchived ? "アーカイブしました。" : "アーカイブを解除しました。");
      saveCurrentMemos({ silentToast: true, skipDirtyFlash: true });
    }

    function toggleSelectedMemoDashboard() {
      const memo = getSelectedMemo();
      if (!memo) return;

      const index = currentState.data.memos.findIndex((item) => item.id === memo.id);
      if (index < 0) return;

      const nextValue = !memo.showInDashboard;

      currentState.data.memos[index] = {
        ...memo,
        showInDashboard: nextValue,
        updatedAt: new Date().toISOString(),
      };
      currentState.data.updatedAt = new Date().toISOString();

      renderAll();
      showToast(nextValue ? "ダッシュボードに表示します。" : "ダッシュボード表示を解除しました。");
      saveCurrentMemos({ silentToast: true, skipDirtyFlash: true });
    }

    function handleTitleInput() {
      const memoTitle = document.getElementById("memoTitle");
      if (!memoTitle) return;

      memoTitle.addEventListener("input", () => {
        updateSelectedMemo({
          title: memoTitle.value,
        });
      });
    }

    function handleTypeInput() {
      const memoType = document.getElementById("memoType");
      if (!memoType) return;

      memoType.addEventListener("change", () => {
        const nextType = memoType.value || "text";
        const patch = {
          type: nextType,
        };

        if (nextType === "text") {
          patch.body = getSelectedMemo()?.body || "";
        }

        if (nextType === "list" && !Array.isArray(getSelectedMemo()?.listItems)) {
          patch.listItems = [];
        }

        if (nextType === "todo" && !Array.isArray(getSelectedMemo()?.todoItems)) {
          patch.todoItems = [];
        }

        updateSelectedMemo(patch);
        setEditorMode(nextType);
        renderAll();
      });
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

    function handleBodyInput() {
      const memoBody = document.getElementById("memoBody");
      if (!memoBody) return;

      memoBody.addEventListener("input", () => {
        updateSelectedMemo({
          body: memoBody.value,
        });
      });
    }

    function handleListInput() {
      const memoListItems = document.getElementById("memoListItems");
      if (!memoListItems) return;

      memoListItems.addEventListener("input", () => {
        const items = memoListItems.value
          .split(/\\r?\\n/)
          .map((text) => text.trim())
          .filter(Boolean)
          .map((text, index) => ({
            id: "li_" + index + "_" + Date.now(),
            text,
            checked: false,
          }));

        updateSelectedMemo({
          listItems: items,
        });
      });
    }

    function handleTagsInput() {
      const memoTags = document.getElementById("memoTags");
      if (!memoTags) return;

      memoTags.addEventListener("input", () => {
        updateSelectedMemo({
          tags: normalizeTags(memoTags.value),
        });
        renderTagSuggestions(getSelectedMemo());
      });
    }

    function bindTodoActions() {
      const addTodoItemButton = document.getElementById("addTodoItemButton");
      const memoTodoNewItem = document.getElementById("memoTodoNewItem");

      if (addTodoItemButton) {
        addTodoItemButton.addEventListener("click", () => {
          addTodoItem(memoTodoNewItem?.value || "");
        });
      }

      if (memoTodoNewItem) {
        memoTodoNewItem.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            addTodoItem(memoTodoNewItem.value || "");
          }
        });
      }
    }

    function bindButtons() {
      const createMemoButton = document.getElementById("createMemoButton");
      const saveButton = document.getElementById("saveButton");
      const openSourceNoteButton = document.getElementById("openSourceNoteButton");
      const applyToNoteButton = document.getElementById("applyToNoteButton");
      const deleteButton = document.getElementById("deleteButton");

      const pinButton = document.getElementById("pinButton");
      const archiveButton = document.getElementById("archiveButton");
      const closeButton = document.getElementById("closeButton");
      const copyMemoButton = document.getElementById("copyMemoButton");

      if (createMemoButton) {
        createMemoButton.addEventListener("click", () => {
          vscode.postMessage({ type: "createMemo" });
        });
      }

      if (saveButton) {
        saveButton.addEventListener("click", () => {
          saveCurrentMemos();
        });
      }

      const unlinkSourceButton = document.getElementById("unlinkSourceButton");

      if (openSourceNoteButton) {
        openSourceNoteButton.addEventListener("click", () => {
          requestOpenSourceNote();
          closeEditorMenu();
        });
      }

      if (applyToNoteButton) {
        applyToNoteButton.addEventListener("click", () => {
          requestApplySelectedMemoToNoteItem();
          closeEditorMenu();
        });
      }

      if (copyMemoButton) {
        copyMemoButton.addEventListener("click", async () => {
          await copySelectedMemoBody();
          closeEditorMenu();
        });
      }

      if (unlinkSourceButton) {
        unlinkSourceButton.addEventListener("click", () => {
          unlinkSelectedMemoSource();
          closeEditorMenu();
        });
      }

      if (deleteButton) {
        deleteButton.addEventListener("click", () => {
          requestDeleteSelectedMemo();
        });
      }

      if (pinButton) {
        pinButton.addEventListener("click", () => {
          toggleSelectedMemoPinned();
        });
      }

      if (archiveButton) {
        archiveButton.addEventListener("click", () => {
          toggleSelectedMemoArchived();
        });
      }

      if (closeButton) {
        closeButton.addEventListener("click", () => {
          requestCloseConceptMemos();
        });
      }
    }

    function bindShortcuts() {
      window.addEventListener("keydown", (event) => {
        const key = String(event.key || "").toLowerCase();
        const isSave = (event.ctrlKey || event.metaKey) && key === "s";
        const isClose = (event.ctrlKey || event.metaKey) && key === "w";

        if (isSave) {
          event.preventDefault();
          saveCurrentMemos();
          return;
        }

        if (isClose) {
          event.preventDefault();
          requestCloseConceptMemos();
        }
      });
    }

    function requestDeleteSelectedMemo() {
      const memo = getSelectedMemo();
      if (!memo) return;

      vscode.postMessage({
        type: "confirmDeleteMemo",
        payload: {
          memoId: memo.id,
          title: memo.title || "無題メモ",
        },
      });
    }

    function requestApplySelectedMemoToNoteItem() {
      const memo = getSelectedMemo();
      if (!memo) return;

      const source = memo?.source || {};
      if (String(source.kind || "") !== "noteItem") {
        showToast("この構想メモはノート項目に紐づいていません。", { isError: true });
        return;
      }

      const notePath = String(source.notePath || "").trim();
      const noteType = String(source.noteType || "").trim();
      const groupId = String(source.groupId || "").trim();
      const itemId = String(source.itemId || "").trim();

      if (!notePath || !groupId || !itemId) {
        showToast("反映先の項目情報が不足しています。", { isError: true });
        return;
      }

      vscode.postMessage({
        type: "applyConceptMemoToNoteItem",
        payload: {
          memoId: String(memo.id || ""),
          notePath,
          noteType,
          groupId,
          itemId,
          memoBody: String(memo.body || ""),
          memoTags: Array.isArray(memo.tags) ? memo.tags : [],
          autoSaveAfterApply: true,
        },
      });
    }

    function requestOpenSourceNote() {
      const memo = getSelectedMemo();
      if (!memo) return;

      const source = memo?.source || {};
      if (String(source.kind || "") !== "noteItem") {
        showToast("この構想メモはノート項目に紐づいていません。", { isError: true });
        return;
      }

      const notePath = String(source.notePath || "").trim();
      const noteType = String(source.noteType || "").trim();
      const groupId = String(source.groupId || "").trim();
      const itemId = String(source.itemId || "").trim();

      if (!notePath) {
        showToast("ノートの場所を取得できませんでした。", { isError: true });
        return;
      }

      vscode.postMessage({
        type: "openSourceNoteFromConceptMemo",
        payload: {
          memoId: String(memo.id || ""),
          notePath,
          noteType,
          groupId,
          itemId,
        },
      });
    }

    async function copySelectedMemoBody() {
      const memo = getSelectedMemo();
      if (!memo) return;

      if (String(memo?.type || "text") !== "text") {
        showToast("通常メモのみコピーできます。", { isError: true });
        return;
      }

      const text = String(memo?.body || "");
      if (!text.trim()) {
        showToast("本文が空のためコピーできません。", { isError: true });
        return;
      }

      try {
        await navigator.clipboard.writeText(text);
        showToast("メモをコピーしました。貼り付けたい場所で Ctrl+V / Cmd+V を押してください。");
      } catch (error) {
        vscode.postMessage({
          type: "copyConceptMemoText",
          payload: {
            text,
          },
        });
      }
    }

    function requestCloseConceptMemos() {
      vscode.postMessage({
        type: "confirmCloseConceptMemos",
        payload: {
          isDirty,
        },
      });
    }

    function deleteSelectedMemoConfirmed(memoId) {
      if (!memoId) return;

      const index = currentState.data.memos.findIndex((memo) => memo.id === memoId);
      if (index < 0) return;

      currentState.data.memos.splice(index, 1);
      currentState.data.updatedAt = new Date().toISOString();

      const nextMemo =
        currentState.data.memos[index] ||
        currentState.data.memos[index - 1] ||
        null;

      selectedMemoId = nextMemo ? nextMemo.id : "";

      renderAll();
      showToast("メモを削除しました。");

      saveCurrentMemos({ silentToast: true, skipDirtyFlash: true });
    }

    function unlinkSelectedMemoSource() {
      const memo = getSelectedMemo();
      if (!memo) return;

      if (!canUnlinkSourceNote(memo)) {
        showToast("リンク解除できる状態ではありません。", { isError: true });
        return;
      }

      const index = currentState.data.memos.findIndex((item) => item.id === memo.id);
      if (index < 0) return;

      currentState.data.memos[index] = {
        ...memo,
        source: null,
        updatedAt: new Date().toISOString(),
      };
      currentState.data.updatedAt = new Date().toISOString();

      renderAll();
      showToast("リンクを解除しました。");

      saveCurrentMemos({ silentToast: true, skipDirtyFlash: true });
    }

    function requestBulkDeleteSelectedMemos() {
      if (!selectedMemoIdsForDelete.length) return;

      vscode.postMessage({
        type: "confirmBulkDeleteMemos",
        payload: {
          memoIds: [...selectedMemoIdsForDelete],
          count: selectedMemoIdsForDelete.length,
        },
      });
    }
  `;
}

module.exports = {
  getConceptMemoEditorScript,
};
