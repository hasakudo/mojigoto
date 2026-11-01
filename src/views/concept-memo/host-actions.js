function createConceptMemoMessageHandler(environment) {
  const {
    vscode,
    path,
    context,
    treeProvider,
    panel,
    filePath,
    workDir,
    workTitle,
    title,
    selectedMemoId,
    initialQuickFilters,
    createConceptMemoDraft,
    readConceptNoteIndex,
    readConceptMemosWithSharedTodo,
    resolveLatestWorkTitle,
    getConceptMemoPanelTitle,
    getWebviewUiSettings,
    persistConceptMemos,
    openStructuredBackupHistory,
    triggerStatsRefresh,
    resolveActualNotePath,
    applyConceptMemoToNoteItem,
    getNoteWebview,
    isCurrentPanel,
    postMessage,
    lifecycle,
    session,
  } = environment;
  return async (message) => {
    if (!message || typeof message !== "object" || lifecycle.disposed) return;

    try {

    switch (message.type) {
      case "requestConceptNoteIndex": {
        const payload = await readConceptNoteIndex(path.dirname(filePath))
          .catch(() => ({ notes: [], failedCount: 1 }));
        if (isCurrentPanel()) {
          postMessage({ type: "conceptNoteIndexLoaded", payload });
        }
        break;
      }
      case "ready":
        postMessage({
          type: "loadConceptMemos",
          payload: {
            filePath,
            workDir,
            workTitle,
            data: session.currentData,
            selectedMemoId,
            initialQuickFilters,
          },
        });
        break;

      case "createMemo": {
        const memos = Array.isArray(session.currentData?.memos)
          ? [...session.currentData.memos]
          : [];
        const nextMemo = createConceptMemoDraft({
          order: memos.length,
          title: "新規メモ",
          folderIds: Array.isArray(message.payload?.folderIds)
            ? message.payload.folderIds
            : undefined,
          folderId: String(message.payload?.folderId || "").trim(),
        });

        memos.unshift(nextMemo);
        session.currentData = {
          ...session.currentData,
          updatedAt: new Date().toISOString(),
          memos,
        };

        postMessage({
          type: "loadConceptMemos",
          payload: {
            filePath,
            workDir,
            workTitle,
            data: session.currentData,
            selectedMemoId: nextMemo.id,
            initialQuickFilters,
          },
        });

        break;
      }

      case "requestRefreshConceptMemos": {
        if (session.autoSaveTimer) {
          lifecycle.clearTimeout(session.autoSaveTimer);
          session.autoSaveTimer = null;
        }

        let saveBeforeRefresh = false;
        if (message.dirty) {
          const picked = await vscode.window.showWarningMessage(
            "未保存の変更があります。保存してから最新情報を読み直しますか？",
            { modal: true },
            "保存して更新",
            "変更を破棄して更新",
          );
          if (lifecycle.disposed) return;
          if (!picked) break;
          saveBeforeRefresh = picked === "保存して更新";
        }

        try {
          if (saveBeforeRefresh) {
            await persistConceptMemos(message, false);
          }

          session.currentData = await readConceptMemosWithSharedTodo(filePath);
          if (lifecycle.disposed) return;
          const latestWorkTitle = resolveLatestWorkTitle();
          panel.__mojigotoConceptMemoWorkTitle = latestWorkTitle;
          panel.title = getConceptMemoPanelTitle({ workDir, workTitle: latestWorkTitle });
          postMessage({
            type: "conceptMemosReloaded",
            payload: {
              filePath,
              workDir,
              workTitle: latestWorkTitle,
              data: session.currentData,
            },
            resetDirty: true,
            revision: Number(message.revision || 0),
            showRefreshStatus: true,
          });
        } catch (error) {
          postMessage({
            type: "showToast",
            message: `更新に失敗しました: ${error.message || String(error)}`,
            isError: true,
          });
        }
        break;
      }

      case "openConceptMemoBackupHistory": {
        if (session.autoSaveTimer) {
          lifecycle.clearTimeout(session.autoSaveTimer);
          session.autoSaveTimer = null;
        }
        if (message.dirty) {
          const picked = await vscode.window.showWarningMessage(
            "未保存の変更があります。保存してからバックアップ履歴を開きますか？",
            { modal: true },
            "保存して開く",
            "キャンセル",
          );
          if (lifecycle.disposed) return;
          if (picked !== "保存して開く") break;
          await persistConceptMemos(message, false);
        }
        if (lifecycle.disposed) return;
        await openStructuredBackupHistory({
          filePath,
          targetType: "conceptMemo",
          label: "構想メモ",
          onRestored: async () => {
            session.currentData = await readConceptMemosWithSharedTodo(filePath);
            postMessage({
              type: "conceptMemosReloaded",
              payload: { filePath, workDir, workTitle: resolveLatestWorkTitle(), data: session.currentData },
              resetDirty: true,
            });
            await triggerStatsRefresh();
          },
        });
        break;
      }

      case "saveConceptMemos": {
        try {
          if (session.autoSaveTimer) {
            lifecycle.clearTimeout(session.autoSaveTimer);
            session.autoSaveTimer = null;
          }
          await persistConceptMemos(message, true);

          await triggerStatsRefresh();

        } catch (error) {
          postMessage({
            type: "conceptMemosSaveError",
            message: error.message || String(error),
          });

          postMessage({
            type: "showToast",
            message: "保存に失敗しました。",
            isError: true,
          });
        }
        break;
      }

      case "scheduleConceptMemosSave": {
        if (session.autoSaveTimer) lifecycle.clearTimeout(session.autoSaveTimer);
        const uiSettings = getWebviewUiSettings();
        if (!uiSettings.autoSaveEnabled) {
          session.autoSaveTimer = null;
          break;
        }
        const pendingMessage = {
          payload: message.payload || {},
          revision: Number(message.revision || 0),
          autoSave: true,
        };
        session.autoSaveTimer = lifecycle.setTimeout(() => {
          session.autoSaveTimer = null;
          persistConceptMemos(pendingMessage, true)
            .then(() => triggerStatsRefresh())
            .catch((error) => {
              postMessage({ type: "conceptMemosSaveError", message: error.message || String(error) });
              postMessage({ type: "showToast", message: `自動保存に失敗しました: ${error.message || String(error)}`, isError: true });
            });
        }, uiSettings.autoSaveDelayMs);
        break;
      }

      case "dirtyStateChanged":
        panel.title = `${message.dirty ? "● " : ""}${title}`;
        break;

      case "applyConceptMemoToNoteItem": {
        try {
          if (session.autoSaveTimer) lifecycle.clearTimeout(session.autoSaveTimer);
          session.autoSaveTimer = null;
          await session.saveQueue.catch(() => undefined);
          if (lifecycle.disposed) return;
          const payload = message.payload || {};
          const resolvedNotePath = resolveActualNotePath(
            String(payload.notePath || ""),
            workDir,
            String(payload.noteType || "plot"),
          );

          const result = await applyConceptMemoToNoteItem({
            ...payload,
            notePath: resolvedNotePath,
            forceOverwrite: true,
          });
          const syncedMemo = result.note?.groups?.find((group) => group.id === payload.groupId)
            ?.items?.find((item) => item.id === payload.itemId)?.memo;
          const sourceMemo = session.currentData.memos.find((memo) => memo.id === payload.memoId);
          if (sourceMemo?.source?.itemId === payload.itemId && syncedMemo?.conceptMemoSyncFingerprint) {
            sourceMemo.source = { ...sourceMemo.source,
              syncFingerprint: syncedMemo.conceptMemoSyncFingerprint, syncedAt: syncedMemo.updatedAt, status: "active",
            };
          }

          const { notifyNoteUpdated } = getNoteWebview();
          await notifyNoteUpdated(resolvedNotePath);

          postMessage({
            type: "conceptMemoAppliedToNoteItem",
            payload: {
              memoId: payload.memoId,
              syncFingerprint: syncedMemo?.conceptMemoSyncFingerprint,
              syncedAt: syncedMemo?.updatedAt,
              autoSaveAfterApply: Boolean(message?.payload?.autoSaveAfterApply),
            },
          });
        } catch (error) {
          postMessage({
            type: "showToast",
            message: `項目メモへの反映に失敗しました: ${error.message || String(error)}`,
            isError: true,
          });
        }
        break;
      }

      case "openSourceNoteFromConceptMemo": {
        try {
          const payload = message.payload || {};
          const resolvedNotePath = resolveActualNotePath(
            String(payload.notePath || ""),
            workDir,
            String(payload.noteType || "plot"),
          );

          const { openNoteWebview } = getNoteWebview();

          await openNoteWebview(context, treeProvider, {
            filePath: resolvedNotePath,
            type: String(payload.noteType || "plot"),
            workDir,
            workName: workTitle,
            focusGroupId: String(payload.groupId || ""),
            focusItemId: String(payload.itemId || ""),
            openItemMemo: true,
          });
        } catch (error) {
          postMessage({
            type: "showToast",
            message: `ノートを開けませんでした: ${error.message || String(error)}`,
            isError: true,
          });
        }
        break;
      }

      case "confirmDeleteMemo": {
        const titleText = String(message.payload?.title || "無題メモ");
        const picked = await vscode.window.showWarningMessage(
          `「${titleText}」を削除しますか？`,
          { modal: true },
          "削除",
          "キャンセル",
        );
        if (lifecycle.disposed) return;

        if (picked === "削除") {
          postMessage({
            type: "deleteMemoConfirmed",
            memoId: message.payload?.memoId || "",
          });
        }
        break;
      }

      case "confirmBulkDeleteMemos": {
        const memoIds = Array.isArray(message.payload?.memoIds)
          ? message.payload.memoIds
          : [];
        const count = Number(message.payload?.count || memoIds.length || 0);

        if (!memoIds.length) {
          break;
        }

        const picked = await vscode.window.showWarningMessage(
          `選択した ${count} 件のメモを削除しますか？`,
          { modal: true },
          "削除",
          "キャンセル",
        );
        if (lifecycle.disposed) return;

        if (picked === "削除") {
          postMessage({
            type: "bulkDeleteMemosConfirmed",
            payload: {
              memoIds,
            },
          });
        }
        break;
      }

      case "confirmCloseConceptMemos": {
        const dirty = Boolean(message.payload?.isDirty);

        if (!dirty) {
          panel.dispose();
          break;
        }

        const picked = await vscode.window.showWarningMessage(
          "未保存の変更があります。このまま閉じますか？",
          { modal: true },
          "閉じる",
          "キャンセル",
        );
        if (lifecycle.disposed) return;

        if (picked === "閉じる") {
          if (session.autoSaveTimer) lifecycle.clearTimeout(session.autoSaveTimer);
          session.autoSaveTimer = null;
          panel.dispose();
        }
        break;
      }

      case "copyConceptMemoText": {
        try {
          const text = String(message.payload?.text || "");
          if (!text.trim()) {
            postMessage({
              type: "showToast",
              message: "本文が空のためコピーできません。",
              isError: true,
            });
            break;
          }

          await vscode.env.clipboard.writeText(text);

          postMessage({
            type: "showToast",
            message:
              "メモをコピーしました。貼り付けたい場所で Ctrl+V / Cmd+V を押してください。",
          });
        } catch (error) {
          postMessage({
            type: "showToast",
            message: `コピーに失敗しました: ${error.message || String(error)}`,
            isError: true,
          });
        }
        break;
      }

      default:
        break;
    }
    } catch (error) {
      postMessage({ type: "showToast", message: `操作に失敗しました: ${error.message || String(error)}`, isError: true });
    }
  };
}

module.exports = { createConceptMemoMessageHandler };
