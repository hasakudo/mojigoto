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
        folderValue.textContent = getMemoFolderName(memo?.folderId || "") || "未分類";
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
      const folderSubmenu = document.getElementById("memoFolderSubmenu");
      const openTypeButton = document.getElementById("openMemoTypeMenuButton");
      const openTagsButton = document.getElementById("openMemoTagsMenuButton");
      const openFolderButton = document.getElementById("openMemoFolderMenuButton");

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

      if (openFolderButton) {
        openFolderButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleEditorSubmenu("folder");
        });
      }

      document.addEventListener("click", (event) => {
        if (!isEditorMenuOpen) return;

        const inButton = button && button.contains(event.target);
        const inPanel = panel && panel.contains(event.target);
        const inTypeSubmenu = typeSubmenu && typeSubmenu.contains(event.target);
        const inTagsSubmenu = tagsSubmenu && tagsSubmenu.contains(event.target);
        const inFolderSubmenu = folderSubmenu && folderSubmenu.contains(event.target);

        if (inButton || inPanel || inTypeSubmenu || inTagsSubmenu || inFolderSubmenu) {
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
    }

    function moveTodoItem(todoId, direction) {
      const memo = getSelectedMemo();
      if (!memo || !todoId) return;
      const items = Array.isArray(memo.todoItems) ? [...memo.todoItems] : [];
      const index = items.findIndex((item) => item.id === todoId);
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || targetIndex < 0 || targetIndex >= items.length) return;
      const [movedItem] = items.splice(index, 1);
      items.splice(targetIndex, 0, movedItem);
      updateSelectedMemo({ todoItems: items });
      renderAll();
    }

    function updateTodoItemText(todoId, text) {
      const value = String(text || "").trim();
      if (!todoId || !value) {
        renderTodoChecklist(getSelectedMemo());
        return;
      }
      const memo = getSelectedMemo();
      if (!memo) return;
      const items = Array.isArray(memo.todoItems) ? [...memo.todoItems] : [];
      const index = items.findIndex((item) => item.id === todoId);
      if (index < 0 || items[index].text === value) return;
      items[index] = { ...items[index], text: value };
      updateSelectedMemo({ todoItems: items });
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

    function patchCommonTodo(id, patch) {
      const items = Array.isArray(currentState.data.commonTodoItems)
        ? [...currentState.data.commonTodoItems]
        : [];
      const index = items.findIndex((item) => item.id === id);
      if (index < 0 || (Object.prototype.hasOwnProperty.call(patch, "text") && !patch.text)) {
        renderCommonTodoChecklist();
        return;
      }
      items[index] = { ...items[index], ...patch };
      currentState.data.commonTodoItems = items;
      currentState.data.updatedAt = new Date().toISOString();
      setDirty(true);
      renderCommonTodoChecklist();
    }

    function moveCommonTodo(id, direction) {
      const items = Array.isArray(currentState.data.commonTodoItems)
        ? [...currentState.data.commonTodoItems]
        : [];
      const index = items.findIndex((item) => item.id === id);
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || targetIndex < 0 || targetIndex >= items.length) return;
      const [movedItem] = items.splice(index, 1);
      items.splice(targetIndex, 0, movedItem);
      currentState.data.commonTodoItems = items;
      currentState.data.updatedAt = new Date().toISOString();
      setDirty(true);
      renderCommonTodoChecklist();
    }

    function addCommonTodo(text) {
      const value = String(text || "").trim();
      if (!value) return;
      const items = Array.isArray(currentState.data.commonTodoItems)
        ? [...currentState.data.commonTodoItems]
        : [];
      items.push({
        id: "ctd_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
        text: value,
        done: false,
      });
      currentState.data.commonTodoItems = items;
      currentState.data.updatedAt = new Date().toISOString();
      const input = document.getElementById("commonTodoNewItem");
      if (input) input.value = "";
      setDirty(true);
      renderCommonTodoChecklist();
    }

    function bindCommonTodoActions() {
      const button = document.getElementById("addCommonTodoButton");
      const input = document.getElementById("commonTodoNewItem");
      button?.addEventListener("click", () => addCommonTodo(input?.value || ""));
      input?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          addCommonTodo(input.value);
        }
      });
    }

    function renderEditor() {
      const editorEmpty = document.getElementById("editorEmpty");
      const editorPanel = document.getElementById("editorPanel");
      const pinButton = document.getElementById("pinButton");
      const archiveButton = document.getElementById("archiveButton");
      const dashboardButton = document.getElementById("dashboardButton");
      const memo = getSelectedMemo();

      if (!memo) {
        if (editorEmpty) editorEmpty.style.display = "";
        if (editorPanel) editorPanel.style.display = "none";
        [pinButton, archiveButton, dashboardButton].forEach((button) => {
          if (!button) return;
          button.disabled = true;
          button.classList.remove("isActive");
        });
        if (pinButton) pinButton.textContent = "ピン留め";
        if (archiveButton) {
          archiveButton.textContent = "保管";
          archiveButton.title = "アーカイブする";
        }
        if (dashboardButton) {
          dashboardButton.textContent = "ダッシュボード";
          dashboardButton.title = "Dashboardの表示";
        }
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

      [pinButton, archiveButton, dashboardButton].forEach((button) => {
        if (button) button.disabled = false;
      });

      if (pinButton) {
        pinButton.textContent = memo?.isPinned ? "ピン解除" : "ピン留め";
        pinButton.classList.toggle("isActive", Boolean(memo?.isPinned));
      }
      if (archiveButton) {
        archiveButton.textContent = memo?.isArchived ? "保管解除" : "保管";
        archiveButton.title = memo?.isArchived
          ? "アーカイブを解除する"
          : "アーカイブする";
        archiveButton.classList.toggle("isActive", Boolean(memo?.isArchived));
      }
      if (dashboardButton) {
        dashboardButton.textContent = memo?.showInDashboard
          ? "表示解除"
          : "ダッシュボード";
        dashboardButton.title = memo?.showInDashboard
          ? "Dashboardの表示を解除する"
          : "Dashboardの表示";
        dashboardButton.classList.toggle(
          "isActive",
          Boolean(memo?.showInDashboard),
        );
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
      const dashboardButton = document.getElementById("dashboardButton");
      const closeButton = document.getElementById("closeButton");
      const copyMemoButton = document.getElementById("copyMemoButton");

      if (createMemoButton) {
        createMemoButton.addEventListener("click", () => {
          vscode.postMessage({
            type: "createMemo",
            payload: {
              folderId: activeFolderId === "__all__" ? "" : activeFolderId,
            },
          });
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

      if (dashboardButton) {
        dashboardButton.addEventListener("click", () => {
          toggleSelectedMemoDashboard();
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

      const memoBody = String(memo?.type || "text") === "list"
        ? (Array.isArray(memo.listItems) ? memo.listItems : [])
            .map((item) => String(item?.text || "").trim())
            .filter(Boolean)
            .join("\\n")
        : String(memo.body || "");

      vscode.postMessage({
        type: "applyConceptMemoToNoteItem",
        payload: {
          memoId: String(memo.id || ""),
          notePath,
          noteType,
          groupId,
          itemId,
          memoBody,
          memoType: String(memo?.type || "text") === "list" ? "list" : "text",
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

      const text = String(memo?.type || "text") === "list"
        ? (Array.isArray(memo.listItems) ? memo.listItems : [])
            .map((item) => String(item?.text || "").trim())
            .filter(Boolean)
            .join("\\n")
        : String(memo?.body || "");
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

      saveCurrentMemos({
        silentToast: true,
        skipDirtyFlash: true,
        successMessage: "メモを削除しました。",
      });
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
