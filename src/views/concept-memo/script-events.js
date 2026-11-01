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

      if (message.type === "conceptMemoSourceNamesUpdated") {
        let changed = false;
        for (const updated of message.payload?.memos || []) {
          const memo = currentState.data.memos.find((candidate) => candidate.id === updated.id);
          const source = memo?.source;
          const next = updated.source;
          if (source?.kind !== "noteItem" || next?.kind !== "noteItem" ||
              ["notePath", "groupId", "itemId"].some((key) => source[key] !== next[key]) ||
              String(source.noteType || "plot") !== String(next.noteType || "plot")) continue;
          for (const key of ["noteTitle", "groupTitle", "itemHeading"]) {
            if (typeof next[key] === "string" && source[key] !== next[key]) {
              source[key] = next[key];
              changed = true;
            }
          }
        }
        if (changed) {
          renderMemoList();
          const summary = document.getElementById("conceptMemoSourceSummary");
          if (summary) summary.textContent = getSourceSummaryFull(getSelectedMemo());
        }
        return;
      }

      if (message.type === "conceptNoteIndexLoaded") {
        conceptNoteIndex = message.payload?.notes || [];
        conceptNoteIndexLoading = false;
        const status = document.getElementById("memoNoteFilterStatus");
        if (status) status.textContent = message.payload?.failedCount ? "一部のノートを読み込めませんでした。再度絞り込みを開くと確認します。" : "";
        // Only refresh the list; never re-render an editor with unsaved input.
        renderNoteFilter();
        renderMemoList();
        renderMemoCounts();
        return;
      }

      if (message.type === "webviewUiSettingsChanged") {
        const scale = Number(message.payload?.fontScale || 1);
        document.body.style.setProperty(
          "--mojigoto-content-font-scale",
          String(Math.min(1.6, Math.max(0.8, scale))),
        );
        bootState.uiSettings = {
          ...(bootState.uiSettings || {}),
          ...(message.payload || {}),
        };
        const autoSaveBadge = document.getElementById("conceptAutoSaveBadge");
        if (autoSaveBadge) {
          autoSaveBadge.hidden = !Boolean(message.payload?.autoSaveEnabled);
        }
        renderEditor();
        return;
      }

      if (message.type === "loadConceptMemos") {
        requestConceptNoteIndex();
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
        if (message.payload?.data?.storageRevision) currentState.data.storageRevision = message.payload.data.storageRevision;
        for (const savedMemo of message.payload?.data?.memos || []) {
          const liveMemo = currentState.data.memos.find((memo) => memo.id === savedMemo.id);
          if (liveMemo?.source?.itemId && liveMemo.source.itemId === savedMemo.source?.itemId) {
            liveMemo.source.syncFingerprint = savedMemo.source.syncFingerprint;
            liveMemo.source.syncedAt = savedMemo.source.syncedAt;
          }
        }
        const savedCurrentRevision =
          Number(message.payload?.revision || 0) >= changeRevision;
        if (savedCurrentRevision) {
          setDirty(false);
          const savedLabel = message.payload?.autoSave ? "自動保存しました。" : "保存しました。";
          if (message.payload?.syncErrorCount) {
            showToast("構想メモは保存しましたが、項目メモへの反映または同期情報の保存が一部完了していません。", { isError: true });
            return;
          }
          showToast(
            String(message.payload?.successMessage || "") ||
              (message.payload?.reflectedCount ? "項目メモへ反映し、" + savedLabel : savedLabel),
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
        const memo = currentState.data.memos.find((candidate) => candidate.id === message.payload?.memoId);
        if (memo?.source && message.payload?.syncFingerprint) {
          memo.source.syncFingerprint = message.payload.syncFingerprint;
          memo.source.syncedAt = message.payload.syncedAt;
          memo.source.status = "active";
        }
        showToast("項目メモへ反映しました。");
        saveCurrentMemos({ silentToast: true, successMessage: "項目メモへ反映し、構想メモを保存しました。" });
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
        requestConceptNoteIndex();
        if (isDirty && (message.resetDirty !== true || (message.revision !== undefined && Number(message.revision) < changeRevision))) {
          showToast("外部更新があります。未保存内容を退避してから最新の内容へ更新してください。", { isError: true });
          return;
        }
        currentState = normalizeState(message.payload);
        selectPreferredMemo(selectedMemoId);
        if (message.resetDirty === true) {
          setDirty(false);
        }
        renderAll();
        if (message.showRefreshStatus === true) {
          showToast("最新の内容へ更新しました。");
        }
        return;
      }
    });
  `;
}

module.exports = {
  getConceptMemoEventsScript,
};
