function getConceptMemoStateScript() {
  return `
    function persistUiState() {
      vscode.setState({
        filePath: currentState?.filePath || "",
        workDir: currentState?.workDir || "",
        workTitle: currentState?.workTitle || "",
        selectedMemoId,
        searchQuery,
        sortField,
        sortDirection,
        activeQuickFilters,
        activeTagFilter,
        activeFolderId,
        isFolderManagerOpen,
        isSidebarCollapsed,
        isOverviewCollapsed,
        isCommonTodoCollapsed,
        openListPanel,
      });

      localStorage.setItem(getSortFieldStorageKey(), sortField || "updated");
      localStorage.setItem(getSortDirectionStorageKey(), sortDirection || "desc");
      localStorage.setItem(commonTodoCollapsedStorageKey, String(Boolean(isCommonTodoCollapsed)));
    }

    function persistWebviewState() {
      vscode.setState({
        filePath: currentState?.filePath || "",
        workDir: currentState?.workDir || "",
        workTitle: currentState?.workTitle || "",
        selectedMemoId,
        searchQuery,
        sortField,
        sortDirection,
        activeQuickFilters,
        activeTagFilter,
        activeFolderId,
        isFolderManagerOpen,
        isSidebarCollapsed,
        isOverviewCollapsed,
        isCommonTodoCollapsed,
        openListPanel,
      });
    }

    function getSelectedMemo() {
      return currentState.data.memos.find((memo) => memo.id === selectedMemoId) || null;
    }

    function setDirty(value) {
      const wasDirty = isDirty;
      isDirty = Boolean(value);

      if (isDirty) {
        changeRevision += 1;
        vscode.postMessage({
          type: "scheduleConceptMemosSave",
          payload: {
            selectedMemoId,
            memos: currentState.data.memos,
            folders: currentState.data.folders,
            commonTodoItems: currentState.data.commonTodoItems,
            autoSyncToNoteItemDefault: Boolean(currentState.data.autoSyncToNoteItemDefault),
            silentToast: true,
          },
          revision: changeRevision,
        });
      }

      if (wasDirty !== isDirty) {
        vscode.postMessage({ type: "dirtyStateChanged", dirty: isDirty });
      }

      const statusText = document.getElementById("statusText");
      if (!statusText) return;

      statusText.classList.remove("isDirty", "isError");

      if (isDirty) {
        statusText.textContent = "未保存あり";
        statusText.classList.add("isDirty");
      } else {
        statusText.textContent = "保存済み";
      }
    }

    function showToast(message, options = {}) {
      const toastEl = document.getElementById("toastMessage");
      if (!toastEl) return;

      const isError = Boolean(options.isError);

      toastEl.textContent = String(message || "");
      toastEl.classList.toggle("isError", isError);
      toastEl.classList.add("isVisible");

      if (toastTimer) {
        clearTimeout(toastTimer);
      }

      toastTimer = setTimeout(() => {
        toastEl.classList.remove("isVisible");
        toastEl.classList.remove("isError");
      }, options.duration || 1800);
    }

    function saveCurrentMemos(options = {}) {
      const {
        silentToast = false,
        skipDirtyFlash = false,
        successMessage = "",
      } = options;

      if (!skipDirtyFlash) {
        setDirty(true);
      }

      vscode.postMessage({
        type: "saveConceptMemos",
        payload: {
          selectedMemoId,
          memos: currentState.data.memos,
          folders: currentState.data.folders,
          commonTodoItems: currentState.data.commonTodoItems,
          autoSyncToNoteItemDefault: Boolean(currentState.data.autoSyncToNoteItemDefault),
          silentToast,
          successMessage,
        },
        revision: changeRevision,
      });
    }

    function updateSelectedMemo(patch) {
      const index = currentState.data.memos.findIndex((memo) => memo.id === selectedMemoId);
      if (index < 0) return;

      const prev = currentState.data.memos[index];
      currentState.data.memos[index] = {
        ...prev,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      currentState.data.updatedAt = new Date().toISOString();
      setDirty(true);
      renderMemoList();
    }
  `;
}

module.exports = {
  getConceptMemoStateScript,
};
