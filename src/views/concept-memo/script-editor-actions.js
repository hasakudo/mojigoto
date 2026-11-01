function getConceptMemoEditorActionsScript() {
  return `
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
      const refreshConceptMemosButton = document.getElementById("refreshConceptMemosButton");
      const openSourceNoteButton = document.getElementById("openSourceNoteButton");
      const applyToNoteButton = document.getElementById("applyToNoteButton");
      const deleteButton = document.getElementById("deleteButton");

      const pinButton = document.getElementById("pinButton");
      const archiveButton = document.getElementById("archiveButton");
      const dashboardButton = document.getElementById("dashboardButton");
      const closeButton = document.getElementById("closeButton");
      const copyMemoButton = document.getElementById("copyMemoButton");
      const sourceAutoSyncToggle = document.getElementById("sourceAutoSyncToggle");

      if (createMemoButton) {
        createMemoButton.addEventListener("click", () => {
          const selectedFolderIds = (Array.isArray(activeFolderIds) ? activeFolderIds : [])
            .filter(Boolean);
          vscode.postMessage({
            type: "createMemo",
            payload: {
              folderIds: selectedFolderIds,
              folderId: selectedFolderIds[0] || "",
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

      refreshConceptMemosButton?.addEventListener("click", () => {
        vscode.postMessage({
          type: "requestRefreshConceptMemos",
          dirty: isDirty,
          payload: {
            storageRevision: currentState.data.storageRevision,
            selectedMemoId,
            memos: currentState.data.memos,
            folders: currentState.data.folders,
            commonTodoItems: currentState.data.commonTodoItems,
            autoSyncToNoteItemDefault: Boolean(currentState.data.autoSyncToNoteItemDefault),
          },
          revision: changeRevision,
        });
      });

      document.getElementById("conceptMemoBackupButton")?.addEventListener("click", () => {
        vscode.postMessage({
          type: "openConceptMemoBackupHistory",
          dirty: isDirty,
          payload: {
            selectedMemoId,
            memos: currentState.data.memos,
            folders: currentState.data.folders,
            commonTodoItems: currentState.data.commonTodoItems,
            autoSyncToNoteItemDefault: Boolean(currentState.data.autoSyncToNoteItemDefault),
          },
          revision: changeRevision,
        });
      });

      sourceAutoSyncToggle?.addEventListener("change", () => {
        setSelectedMemoAutoSyncToNoteItem(sourceAutoSyncToggle.checked);
      });

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

    function setSelectedMemoAutoSyncToNoteItem(enabled) {
      const memo = getSelectedMemo();
      const source = memo?.source || {};
      if (!memo || String(source.kind || "") !== "noteItem") return;

      currentState.data.memos = currentState.data.memos.map((entry) => {
        const entrySource = entry?.source || {};
        if (String(entrySource.kind || "") !== "noteItem") return entry;
        const isSelected = String(entry.id || "") === String(memo.id || "");
        if (!isSelected) return entry;
        return {
          ...entry,
          updatedAt: new Date().toISOString(),
          source: {
            ...entrySource,
            autoSyncToNoteItem: Boolean(enabled),
            autoSyncToNoteItemOverride: Boolean(enabled),
          },
        };
      });
      currentState.data.updatedAt = new Date().toISOString();
      setDirty(true);
      renderEditor();
      renderMemoList();
      showToast(
        enabled
          ? "この構想メモの自動反映をONにしました。"
          : "この構想メモの自動反映をOFFにしました。",
        { duration: 1800 },
      );
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

module.exports = { getConceptMemoEditorActionsScript };
