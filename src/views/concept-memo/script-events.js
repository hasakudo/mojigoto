function getConceptMemoEventsScript() {
  return `
    function selectPreferredMemo(preferredMemoId = "") {
      const preferredId = String(preferredMemoId || "").trim();
      const allMemos = Array.isArray(currentState?.data?.memos)
        ? currentState.data.memos
        : [];

      if (preferredId && allMemos.some((memo) => memo.id === preferredId)) {
        selectedMemoId = preferredId;
        return;
      }

      const filteredMemos = getFilteredMemos();
      if (filteredMemos.length) {
        selectedMemoId = filteredMemos[0].id;
        return;
      }

      selectedMemoId = allMemos[0]?.id || "";
    }

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (!message || typeof message !== "object") return;

      if (message.type === "webviewUiSettingsChanged") {
        const scale = Number(message.payload?.fontScale || 1);
        document.body.style.setProperty(
          "--mojigoto-content-font-scale",
          String(Math.min(1.6, Math.max(0.8, scale))),
        );
        return;
      }

      if (message.type === "loadConceptMemos") {
        currentState = normalizeState(message.payload);

        const nextQuickFilters = message.payload?.initialQuickFilters;
        if (nextQuickFilters && typeof nextQuickFilters === "object") {
          activeQuickFilters = {
            type: String(nextQuickFilters.type || "").trim(),
            state: Array.isArray(nextQuickFilters.state)
              ? nextQuickFilters.state.map((value) => String(value || "").trim()).filter(Boolean)
              : [],
            source: String(nextQuickFilters.source || "").trim(),
          };
        }

        selectPreferredMemo(message.payload?.selectedMemoId || "");
        setDirty(false);
        renderAll();
        return;
      }

      if (message.type === "conceptMemosSaved") {
        const savedCurrentRevision =
          Number(message.payload?.revision || 0) >= changeRevision;
        if (savedCurrentRevision) {
          setDirty(false);
          showToast(
            String(message.payload?.successMessage || "") ||
              (message.payload?.autoSave
                ? "自動保存しました。"
                : "保存しました。"),
          );
        }
        return;
      }

      if (message.type === "conceptMemosSaveError") {
        const statusText = document.getElementById("statusText");
        if (statusText) {
          statusText.textContent = "保存に失敗しました";
          statusText.classList.remove("isDirty");
          statusText.classList.add("isError");
        }
      }

      if (message.type === "showToast") {
        showToast(message.message || "", {
          isError: Boolean(message.isError),
        });
      }

      if (message.type === "conceptMemoAppliedToNoteItem") {
        saveCurrentMemos({ silentToast: true });
        return;
      }

      if (message.type === "deleteMemoConfirmed") {
        deleteSelectedMemoConfirmed(message.memoId || "");
      }

      if (message.type === "bulkDeleteMemosConfirmed") {
        const memoIds = Array.isArray(message.payload?.memoIds)
          ? message.payload.memoIds
          : [];

        if (!memoIds.length) {
          return;
        }

        currentState.data.memos = currentState.data.memos.filter(
          (memo) => !memoIds.includes(memo.id),
        );
        currentState.data.updatedAt = new Date().toISOString();

        if (memoIds.includes(selectedMemoId)) {
          selectedMemoId = currentState.data.memos[0]?.id || "";
        }

        selectedMemoIdsForDelete = [];
        isBulkDeleteMode = false;

        renderAll();
        saveCurrentMemos({
          silentToast: true,
          skipDirtyFlash: true,
          successMessage: "選択したメモを削除しました。",
        });
        return;
      }

      if (message.type === "disposeConceptMemosPanel") {
        showToast("構想メモを閉じます。", { duration: 500 });
      }

      if (message.type === "conceptMemosReloaded") {
        currentState = normalizeState(message.payload);
        selectPreferredMemo(selectedMemoId);
        renderAll();
        return;
      }
    });
  `;
}

module.exports = {
  getConceptMemoEventsScript,
};
