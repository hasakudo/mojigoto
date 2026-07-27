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
        isSidebarCollapsed,
        openListPanel,
      });

      localStorage.setItem(getSortFieldStorageKey(), sortField || "updated");
      localStorage.setItem(getSortDirectionStorageKey(), sortDirection || "desc");
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
        isSidebarCollapsed,
        openListPanel,
      });
    }

    function getSelectedMemo() {
      return currentState.data.memos.find((memo) => memo.id === selectedMemoId) || null;
    }

    function setDirty(value) {
      isDirty = Boolean(value);

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
      } = options;

      if (!skipDirtyFlash) {
        setDirty(true);
      }

      vscode.postMessage({
        type: "saveConceptMemos",
        payload: {
          selectedMemoId,
          memos: currentState.data.memos,
          silentToast,
        },
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
