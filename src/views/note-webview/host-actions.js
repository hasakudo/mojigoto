// The host owns persistence and panel lifetime; this handler routes editor operations.
function createNoteMessageHandler(environment) {
  const {
    session,
    vscode,
    path,
    fsp,
    context,
    treeProvider,
    panel,
    filePath,
    type,
    workDir,
    workName,
    workTitle,
    noteDisplays,
    withRestoredWebviews,
    getPanelTitle,
    updateWebviewSaveSetting,
    getWebviewUiSettings,
    persistNoteMessage,
    readNoteFile,
    saveNoteFile,
    resolveLatestWorkTitle,
    buildNoteBootState,
    resolveWorkDirForCurrentNote,
    attachNoteImageWebviewUris,
    openStructuredBackupHistory,
    openAddressBook,
    currentWorkDirForAssets,
    addressBookSession,
    resolveWorkTitle,
    safeAssetName,
    resolveExportDirForTarget,
    buildAddressBookExport,
    searchNotesByType,
    resolveRelatedNoteTarget,
    openNoteWebview,
    markConceptMemosMissingByNotePath,
    resolveConceptMemoFilePath,
    notifyConceptMemoUpdated,
    getTemplateItems,
    pickTemplateScope,
    saveUserTemplate,
    saveUserGroupTemplate,
    listUserTemplates,
    deleteUserTemplateById,
    handleUploadGroupImage,
    handleDeleteGroupImage,
    handleRenameGroupImage,
    createConceptMemoFromNoteItem,
    exportTreeItem,
    insertEntriesAfterItem,
    replaceItemBody,
    insertItemAtPosition,
    insertGroupAtPosition,
    normalizeImportedItemMemo,
    updateConceptMemoSourceStatus,
    updateConceptMemoSourceAutoSync,
    setTimeout,
    clearTimeout,
  } = environment;

  return async (message) => {
    try {
      if (message?.type === "noteDisplay.editorReady") {
        noteDisplays.editorReady(panel);
        return;
      }
      if (message?.type === "noteDisplay.open") {
        const opened = await withRestoredWebviews(vscode, "mojigoto.noteDisplay", () => noteDisplays.open(panel, message.mode));
        panel.webview.postMessage({type:"noteDisplay.opened", opened, returnToEditor:message.returnToEditor === true});
        return;
      }
      if (message?.type === "noteDisplay.snapshot") {
        noteDisplays.accept(panel, message);
        return;
      }
      if (message?.type === "scheduleAutoSave") noteDisplays.captureDraft(panel, message.payload);
      if (message?.type === "close") {
        panel.dispose();
        return;
      }
  
      if (message?.type === "dirtyStateChanged") {
        noteDisplays.setDirty(panel, message.dirty === true);
        panel.title = `${message.dirty ? "● " : ""}${getPanelTitle(
          panel.__mojigotoNoteData || session.note,
        )}`;
        return;
      }
  
      if (message?.type === "updateNoteMemoAutoSyncDefault") {
        try {
          const result = await updateWebviewSaveSetting(context, "noteMemoAutoSyncEnabled", message.enabled);
          panel.webview.postMessage({ type: "noteMemoAutoSyncDefaultResult", cancelled: result.cancelled, payload: getWebviewUiSettings() });
        } catch (error) {
          panel.webview.postMessage({ type: "noteMemoAutoSyncDefaultResult", error: String(error.message || error), payload: getWebviewUiSettings() });
        }
        return;
      }
  
      if (message?.type === "requestRefreshNote") {
        if (session.noteAutoSaveTimer) {
          clearTimeout(session.noteAutoSaveTimer);
          session.noteAutoSaveTimer = null;
        }
  
        let saveBeforeRefresh = false;
        if (message.dirty) {
          const picked = await vscode.window.showWarningMessage(
            "未保存の変更があります。保存してから最新情報を読み直しますか？",
            { modal: true },
            "保存して更新",
            "変更を破棄して更新",
          );
          if (!picked) return;
          saveBeforeRefresh = picked === "保存して更新";
        }
  
        if (saveBeforeRefresh) {
          await persistNoteMessage(message, false);
        }
  
        const latest = await readNoteFile(filePath, type);
        const latestWorkTitle = resolveLatestWorkTitle();
        const nextNote = buildNoteBootState(latest, {
          filePath,
          type,
          workDir: resolveWorkDirForCurrentNote(),
          workName,
          workTitle: latestWorkTitle,
        });
        const noteForWebview = attachNoteImageWebviewUris(
          nextNote,
          panel,
          resolveWorkDirForCurrentNote(),
        );
  
        panel.__mojigotoWorkTitle = latestWorkTitle;
        panel.__mojigotoNoteData = noteForWebview;
        panel.title = getPanelTitle(noteForWebview);
        panel.webview.postMessage({
          type: "noteReloaded",
          payload: noteForWebview,
          revision: Number(message.revision || 0),
          resetDirty: true,
          showRefreshStatus: true,
        });
        return;
      }
  
      if (message?.type === "openNoteBackupHistory") {
        if (session.noteAutoSaveTimer) {
          clearTimeout(session.noteAutoSaveTimer);
          session.noteAutoSaveTimer = null;
        }
        if (message.dirty) {
          const picked = await vscode.window.showWarningMessage(
            "未保存の変更があります。保存してからバックアップ履歴を開きますか？",
            { modal: true },
            "保存して開く",
            "キャンセル",
          );
          if (picked !== "保存して開く") return;
          await persistNoteMessage(message, false);
        }
        await openStructuredBackupHistory({
          filePath,
          targetType: "note",
          label: type === "plot" ? "プロット" : "資料",
          onRestored: async () => {
            const latest = await readNoteFile(filePath, type);
            const nextNote = buildNoteBootState(latest, {
              filePath,
              type,
              workDir: resolveWorkDirForCurrentNote(),
              workName,
              workTitle: resolveLatestWorkTitle(),
            });
            const noteForWebview = attachNoteImageWebviewUris(nextNote, panel, resolveWorkDirForCurrentNote());
            panel.__mojigotoNoteData = noteForWebview;
            panel.webview.postMessage({ type: "noteReloaded", payload: noteForWebview, resetDirty: true });
            treeProvider?.refresh();
          },
        });
        return;
      }
  
      if (message?.type === "openAddressBookTab") {
        await openAddressBook(context, {
          workDir: currentWorkDirForAssets,
          workTitle: resolveLatestWorkTitle(),
          viewColumn: vscode.ViewColumn.Beside,
        });
        panel.webview.postMessage({ type: "addressBookTabOpened" });
        return;
      }
      if (await addressBookSession.handle(message)) return;
  
      if (message?.type === "exportAddressBook") {
        const format = message?.format === "csv" ? "csv" : "html";
        const saved = await addressBookSession.exportBook(message);
        const workLabel = resolveWorkTitle(panel, context) || "作品";
        const defaultBase = safeAssetName(`${workLabel}-呼び名一覧`, "呼び名一覧");
        const currentWorkDir = resolveWorkDirForCurrentNote();
        const workName = String(panel.__mojigotoWorkName || "").trim() || (currentWorkDir ? path.basename(currentWorkDir) : "");
        const baseDir = await resolveExportDirForTarget(
          context,
          { workTitle: workLabel, workName },
          "ノート書き出し",
        );
        if (!baseDir) return;
        const uri = await vscode.window.showSaveDialog({
          title: `もじごと: 呼び名一覧を${format.toUpperCase()}で書き出し`,
          defaultUri: baseDir
            ? vscode.Uri.file(path.join(baseDir, `${defaultBase}.${format}`))
            : undefined,
          filters: format === "csv"
            ? { CSV: ["csv"] }
            : { HTML: ["html", "htm"] },
        });
        if (!uri) return;
        await fsp.writeFile(
          uri.fsPath,
          buildAddressBookExport(saved, format, workLabel),
          "utf8",
        );
        panel.webview.postMessage({ type: "addressBookExported", format });
        return;
      }
  
      if (message?.type === "searchReferences" || message?.type === "searchRelatedNotes") {
        const requestId = Number(message.requestId || 0);
        try {
          const results = await searchNotesByType(
            { fsPath: resolveWorkDirForCurrentNote() },
            message.noteType === "plot" ? "plot" : "reference",
            String(message.query || ""),
            {
              excludeNoteId: String(session.note?.id || ""),
              excludeFilePath: filePath,
            },
          );
          panel.webview.postMessage({
            type: "referenceSearchResults",
            requestId,
            results,
          });
        } catch (error) {
          panel.webview.postMessage({
            type: "referenceSearchResults",
            requestId,
            results: [],
          });
          panel.webview.postMessage({
            type: "error",
            message: `ノートの検索に失敗しました: ${String(error?.message || error)}`,
          });
        }
        return;
      }
  
      if (message?.type === "chooseRelatedNoteLabel") {
        const target = await resolveRelatedNoteTarget(
          { fsPath: resolveWorkDirForCurrentNote() }, message.target,
        );
        if (!target?.item || target.item.kind !== "divider") {
          panel.webview.postMessage({ type: "error", message: "関連する区分が見つかりません。" });
          return;
        }
        const choices = [
          { label: "区分名", description: String(target.item.label || "").trim() },
          { label: "補足", description: String(target.item.value || "").trim() },
        ].filter((choice) => choice.description);
        const selected = await vscode.window.showQuickPick(choices, {
          title: "関連リンクに表示する名前", placeHolder: "区分名または補足を選択（リンク先は変わりません）",
        });
        if (!panel.__mojigotoDisposed) panel.webview.postMessage({
          type: "relatedNoteLabelChosen", requestId: message.requestId,
          itemLabel: selected?.description,
        });
        return;
      }

      if (message?.type === "openReferenceTarget" || message?.type === "openRelatedNoteTarget") {
        const target = await resolveRelatedNoteTarget(
          { fsPath: resolveWorkDirForCurrentNote() },
          message.target,
        );
        if (!target) {
          panel.webview.postMessage({
            type: "error",
            message: "関連するノートが見つかりません。削除または変更された可能性があります。",
          });
          return;
        }
  
        await openNoteWebview(context, treeProvider, {
          filePath: target.filePath,
          type: target.note?.type === "plot" ? "plot" : "reference",
          workDir: resolveWorkDirForCurrentNote(),
          workName,
          workTitle: resolveWorkTitle(panel, context),
          focusGroupId: String(target.group?.id || ""),
          focusItemId: String(target.item?.id || ""),
          viewColumn: vscode.ViewColumn.Beside,
        });
        return;
      }
  
      if (message?.type === "scheduleAutoSave") {
        if (session.noteAutoSaveTimer) clearTimeout(session.noteAutoSaveTimer);
        const uiSettings = getWebviewUiSettings();
        if (!uiSettings.autoSaveEnabled) {
          session.noteAutoSaveTimer = null;
          return;
        }
        const pendingMessage = {
          payload: message.payload || {},
          revision: Number(message.revision || 0),
        };
        session.noteAutoSaveTimer = setTimeout(() => {
          session.noteAutoSaveTimer = null;
          persistNoteMessage(pendingMessage, true).catch((error) => {
            panel.webview.postMessage({ type: "error", message: `自動保存に失敗しました: ${error.message || String(error)}` });
          });
        }, uiSettings.autoSaveDelayMs);
        return;
      }
  
      if (message?.type === "requestClose") {
        if (session.isCloseConfirmOpen) {
          return;
        }
  
        session.isCloseConfirmOpen = true;
  
        try {
          const picked = await vscode.window.showWarningMessage(
            "未保存の変更があります。閉じますか？",
            { modal: true },
            "閉じる",
          );
  
          if (picked === "閉じる") {
            panel.dispose();
          }
        } finally {
          session.isCloseConfirmOpen = false;
        }
  
        return;
      }
  
      if (message?.type === "delete") {
        const noteTitle = String(
          message?.title || session.note?.title || "このノート",
        ).trim();
  
        try {
          const deleted = await vscode.commands.executeCommand(
            "mojigoto.deleteNote",
            {
              fsPath: filePath,
              workDir: session.note?.workDir || "",
              workName: session.note?.workName || "",
              noteType: session.note?.type || session.note?.noteType || "",
              title: noteTitle,
            },
          );
  
          if (deleted) {
            noteDisplays.closeByPath(filePath);
            try {
              const currentWorkDir = resolveWorkDirForCurrentNote();
              const conceptMemoFilePath =
                resolveConceptMemoFilePath(currentWorkDir);
  
              await markConceptMemosMissingByNotePath(
                conceptMemoFilePath,
                filePath,
              );
  
              await notifyConceptMemoUpdated(conceptMemoFilePath);
            } catch (e) {
              console.warn("[mojigoto] mark missing failed:", e);
            }
  
            panel.dispose();
          } else {
            panel.webview.postMessage({
              type: "info",
              message: "ノート削除をキャンセルしました。",
            });
          }
        } catch (error) {
          panel.webview.postMessage({
            type: "error",
            message: `ノート削除に失敗しました: ${error.message || error}`,
          });
        }
        return;
      }
  
      if (message?.type === "requestTemplateList") {
        const currentWorkDir = resolveWorkDirForCurrentNote();
        const items = await getTemplateItems(type, { workDir: currentWorkDir });
        panel.webview.postMessage({
          type: "templateList",
          items,
        });
        return;
      }
  
      if (message?.type === "saveTemplate") {
        const currentNote = {
          ...session.note,
          ...message.payload,
          type,
        };
  
        const templateName = await vscode.window.showInputBox({
          title: "もじごと: テンプレートとして保存",
          prompt: "テンプレート名を入力してください",
          value: currentNote.title || "",
          ignoreFocusOut: true,
        });
        if (!templateName) {
          panel.webview.postMessage({
            type: "info",
            message: "テンプレート保存をキャンセルしました。",
          });
          return;
        }
  
        const picked = await vscode.window.showQuickPick(
          [
            {
              label: "大枠だけを保存",
              description: "大分類・区分・項目の枠だけ保存します",
              mode: "structureOnly",
            },
            {
              label: "大分類・区分の枠と名前を保存",
              description:
                "大分類名・区分名を保存し、補足を空、項目は保存しません",
              mode: "structureWithDividers",
            },
            {
              label: "大分類・区分・項目の枠と名前を保存",
              description:
                "大分類名・区分名・項目名を保存し、補足と詳細は空にします",
              mode: "structureWithHeadings",
            },
            {
              label: "入力したすべてを保存",
              description: "現在の内容をそのまま保存します",
              mode: "full",
            },
          ],
          {
            title: "もじごと: テンプレート保存内容",
            placeHolder: "何をテンプレートとして残すか選んでください",
            ignoreFocusOut: true,
          },
        );
  
        if (!picked) {
          panel.webview.postMessage({
            type: "info",
            message: "テンプレート保存をキャンセルしました。",
          });
          return;
        }
  
        const currentWorkDir = resolveWorkDirForCurrentNote();
        const templateScope = await pickTemplateScope(currentWorkDir);
        if (!templateScope) {
          panel.webview.postMessage({
            type: "info",
            message: "テンプレート保存をキャンセルしました。",
          });
          return;
        }
  
        await saveUserTemplate(currentNote, templateName, picked.mode, {
          scope: templateScope,
          workDir: currentWorkDir,
        });
  
        vscode.window.showInformationMessage(
          `もじごと: テンプレート「${templateName}」を保存しました。`,
        );
        panel.webview.postMessage({ type: "templateSaved" });
        return;
      }
  
      if (message?.type === "uploadGroupImage") {
        await handleUploadGroupImage(message);
        return;
      }
  
      if (message?.type === "deleteGroupImage") {
        await handleDeleteGroupImage(message);
        return;
      }
  
      if (message?.type === "renameGroupImage") {
        await handleRenameGroupImage(message);
        return;
      }
  
      if (message?.type === "saveGroupTemplate") {
        const payload = message?.payload || {};
        const groupId = String(payload?.groupId || "").trim();
  
        const currentNote = {
          ...session.note,
          ...message.payload,
          type,
        };
  
        const groups = Array.isArray(currentNote?.groups)
          ? currentNote.groups
          : [];
        const targetGroup = groups.find(
          (group) => String(group?.id || "") === groupId,
        );
  
        if (!targetGroup) {
          panel.webview.postMessage({
            type: "error",
            message: "保存対象の大分類を取得できませんでした。",
          });
          return;
        }
  
        const defaultName =
          String(payload?.groupTitle || "").trim() ||
          String(targetGroup?.title || "").trim() ||
          "大分類テンプレート";
  
        const templateName = await vscode.window.showInputBox({
          title: "もじごと: 大分類をテンプレートとして保存",
          prompt: "テンプレート名を入力してください",
          value: defaultName,
          ignoreFocusOut: true,
        });
  
        if (!templateName) {
          panel.webview.postMessage({
            type: "info",
            message: "テンプレート保存をキャンセルしました。",
          });
          return;
        }
  
        const picked = await vscode.window.showQuickPick(
          [
            {
              label: "大枠だけを保存",
              description: "大分類・区分・項目の枠だけ保存します",
              mode: "structureOnly",
            },
            {
              label: "大分類・区分の枠と名前を保存",
              description:
                "大分類名・区分名を保存し、補足を空、項目/詳細は保存しません",
              mode: "structureWithDividers",
            },
            {
              label: "大分類・区分・項目の枠と名前を保存",
              description:
                "大分類名・区分名・項目名を保存し、補足と詳細は空にします",
              mode: "structureWithHeadings",
            },
            {
              label: "入力したすべてを保存",
              description: "現在の内容をそのまま保存します",
              mode: "full",
            },
          ],
          {
            title: "もじごと: 大分類テンプレートの保存内容",
            placeHolder: "何をテンプレートとして残すか選んでください",
            ignoreFocusOut: true,
          },
        );
  
        if (!picked) {
          panel.webview.postMessage({
            type: "info",
            message: "テンプレート保存をキャンセルしました。",
          });
          return;
        }
  
        const currentWorkDir = resolveWorkDirForCurrentNote();
        const templateScope = await pickTemplateScope(currentWorkDir);
        if (!templateScope) {
          panel.webview.postMessage({
            type: "info",
            message: "テンプレート保存をキャンセルしました。",
          });
          return;
        }
  
        await saveUserGroupTemplate(
          currentNote,
          targetGroup,
          templateName,
          picked.mode,
          {
            scope: templateScope,
            workDir: currentWorkDir,
          },
        );
  
        vscode.window.showInformationMessage(
          `もじごと: 大分類テンプレート「${templateName}」を保存しました。`,
        );
        panel.webview.postMessage({ type: "templateSaved" });
        return;
      }
  
      if (message?.type === "deleteTemplate") {
        const templateId = String(message?.templateId || "");
        if (!templateId) {
          panel.webview.postMessage({
            type: "error",
            message: "削除対象のテンプレートIDがありません。",
          });
          return;
        }
  
        const currentWorkDir = resolveWorkDirForCurrentNote();
        const templates = await listUserTemplates(type, { workDir: currentWorkDir });
        const target = templates.find((tpl) => tpl.templateId === templateId);
        const label = target?.label || "このテンプレート";
  
        const picked = await vscode.window.showWarningMessage(
          `テンプレート「${label}」を削除しますか？ この操作は元に戻せません。`,
          { modal: true },
          "削除する",
        );
  
        if (picked !== "削除する") {
          panel.webview.postMessage({
            type: "info",
            message: "テンプレート削除をキャンセルしました。",
          });
          return;
        }
  
        const deleted = await deleteUserTemplateById(type, templateId, {
          workDir: currentWorkDir,
        });
        if (!deleted) {
          panel.webview.postMessage({
            type: "error",
            message: "テンプレートを削除できませんでした。",
          });
          return;
        }
  
        vscode.window.showInformationMessage(
          `もじごと: テンプレート「${label}」を削除しました。`,
        );
  
        panel.webview.postMessage({
          type: "templateDeleted",
          templateId,
        });
        return;
      }
  
      if (message?.type === "createConceptMemoFromNoteItem") {
        if (session.noteAutoSaveTimer) clearTimeout(session.noteAutoSaveTimer);
        session.noteAutoSaveTimer = null;
        await session.noteSaveQueue.catch(() => undefined);
        const payload = message?.payload || {};
        const currentWorkDir = resolveWorkDirForCurrentNote();
        const conceptMemoFilePath =
          resolveConceptMemoFilePath(currentWorkDir);
  
        const created = await createConceptMemoFromNoteItem(
          conceptMemoFilePath,
          { ...payload, forceOverwrite: true },
        );
        const sourceItem = session.note.groups?.find((group) => group.id === payload.groupId)
          ?.items?.find((item) => item.id === payload.itemId);
        if (sourceItem?.memo && created.memo?.source?.syncFingerprint) {
          sourceItem.memo.conceptMemoSyncFingerprint = created.memo.source.syncFingerprint;
        }
  
        await notifyConceptMemoUpdated(conceptMemoFilePath);
  
        panel.webview.postMessage({
          type: "conceptMemoCreatedFromNoteItem",
          payload: {
            conceptMemoId: String(created?.memo?.id || ""),
            title: String(created?.memo?.title || ""),
            groupId: String(payload?.groupId || ""),
            itemId: String(payload?.itemId || ""),
            mode: String(created?.mode || "created"),
            syncFingerprint: String(created?.memo?.source?.syncFingerprint || ""),
          },
        });
  
        return;
      }
  
      if (message?.type === "saveAndExport") {
        const saveResult = await persistNoteMessage(message, false);
        const saved = saveResult.note;
  
        const nextNote = buildNoteBootState(saved, {
          filePath,
          type,
          workDir,
          workName,
        });
  
        panel.__mojigotoNoteData = nextNote;
        panel.title = getPanelTitle(nextNote);
        treeProvider?.refresh();
  
        await exportTreeItem(context, {
          kind: "noteFile",
          contextValue: "noteFile",
          fsPath: filePath,
          workDir: resolveWorkDirForCurrentNote() || "",
          workName,
          noteType: type,
        });
  
        panel.webview.postMessage({
          type: "noteSaved",
          revision: Number(message.revision || 0),
          storageRevision: saved.storageRevision,
          autoConceptSyncUpdates: saveResult.updates,
        });
        if (saveResult.errors.length) {
          panel.webview.postMessage({
            type: "error",
            message: `構想メモへの自動反映に失敗しました: ${saveResult.errors[0]}`,
          });
        }
        return;
      }
  
      if (message?.type === "importNote") {
        const picked = await vscode.window.showQuickPick(
          [
            {
              label: "選択インポート",
              description:
                "大分類・区分・項目の挿入、または項目上書きを選んで実行します",
              action: "partial_import",
            },
            {
              label: "新規/置換インポート",
              description: "新規作成、または現在のノート全体を置換します",
              action: "replace_note",
            },
          ],
          {
            title: "インポート方法を選択",
            placeHolder: "実行したいインポート方法を選んでください",
            ignoreFocusOut: true,
          },
        );
  
        if (!picked) {
          return;
        }
  
        if (picked.action === "replace_note") {
          const {
            runNoteImportFlow,
          } = require("../../import/note-import-commands");
  
          await runNoteImportFlow(context, treeProvider, {
            noteType: type,
            mode: "note_import",
            existingNotePath: filePath,
            existingNoteTitle: String(session.note?.title || "").trim(),
            workDir: resolveWorkDirForCurrentNote() || "",
            workName: workName || "",
            workTitle: resolveWorkTitle(panel, context),
          });
          return;
        }
  
        if (picked.action === "partial_import") {
          message = {
            type: "openPartialImport",
            payload: {
              scopeGroupId: "",
              initialMode: "insert_entry",
            },
          };
        }
      }
  
      if (message?.type === "importEntriesAfterItem") {
        const payload = message?.payload || {};
        const groupId = String(payload?.groupId || "");
        const itemId = String(payload?.itemId || "");
  
        const {
          runNoteItemAppendImportFlow,
        } = require("../../import/note-import-commands");
  
        const result = await runNoteItemAppendImportFlow(
          context,
          treeProvider,
          {
            workDir: resolveWorkDirForCurrentNote() || "",
            workName: workName || "",
            workTitle: resolveWorkTitle(panel, context),
          },
        );
  
        if (result?.cancelled) {
          return;
        }
  
        if (!result?.ok) {
          throw new Error(
            result?.error?.message || "項目インポートに失敗しました。",
          );
        }
  
        const latest = await readNoteFile(filePath, type);
        const nextNoteData = insertEntriesAfterItem(
          buildNoteBootState(latest, {
            filePath,
            type,
            workDir,
            workName,
            workTitle,
          }),
          groupId,
          itemId,
          result.entries,
        );
  
        const saved = await saveNoteFile(filePath, {
          ...nextNoteData,
          type,
        });
  
        const nextNote = buildNoteBootState(saved, {
          filePath,
          type,
          workDir,
          workName,
          workTitle,
        });
  
        panel.__mojigotoNoteData = nextNote;
        panel.title = getPanelTitle(nextNote);
  
        panel.webview.postMessage({
          type: "noteReloaded",
          payload: nextNote,
        });
  
        panel.webview.postMessage({
          type: "info",
          message: `${result.entries.length}件の項目を追加しました。`,
        });
  
        treeProvider?.refresh();
        return;
      }
  
      if (message?.type === "importTextIntoItem") {
        const payload = message?.payload || {};
        const groupId = String(payload?.groupId || "");
        const itemId = String(payload?.itemId || "");
  
        const picked = await vscode.window.showWarningMessage(
          "この項目の詳細をインポート内容で上書きします。",
          { modal: true },
          "上書きする",
        );
  
        if (picked !== "上書きする") {
          return;
        }
  
        const {
          runNoteItemReplaceImportFlow,
        } = require("../../import/note-import-commands");
  
        const result = await runNoteItemReplaceImportFlow(
          context,
          treeProvider,
          {
            workDir: resolveWorkDirForCurrentNote() || "",
            workName: workName || "",
            workTitle: resolveWorkTitle(panel, context),
          },
        );
  
        if (result?.cancelled) {
          return;
        }
  
        if (!result?.ok) {
          throw new Error(
            result?.error?.message || "本文インポートに失敗しました。",
          );
        }
  
        const latest = await readNoteFile(filePath, type);
        const nextNoteData = replaceItemBody(
          buildNoteBootState(latest, {
            filePath,
            type,
            workDir,
            workName,
            workTitle,
          }),
          groupId,
          itemId,
          result.body,
        );
  
        const saved = await saveNoteFile(filePath, {
          ...nextNoteData,
          type,
        });
  
        const nextNote = buildNoteBootState(saved, {
          filePath,
          type,
          workDir,
          workName,
          workTitle,
        });
  
        panel.__mojigotoNoteData = nextNote;
        panel.title = getPanelTitle(nextNote);
  
        panel.webview.postMessage({
          type: "noteReloaded",
          payload: nextNote,
        });
  
        panel.webview.postMessage({
          type: "info",
          message: "この項目の詳細をインポート内容で上書きしました。",
        });
  
        treeProvider?.refresh();
        return;
      }
  
      if (message?.type === "openPartialImport") {
        const payload = message?.payload || {};
        const scopeGroupId = String(payload?.scopeGroupId || "");
        const initialMode =
          String(payload?.initialMode || "").trim() === "replace_entry_body"
            ? "replace_entry_body"
            : "insert_entry";
  
        const {
          runPartialReplaceImportFlow,
        } = require("../../import/note-import-commands");
        const {
          openNotePartialImportWebview,
        } = require("../note-partial-import-webview");
  
        const result = await runPartialReplaceImportFlow(
          context,
          treeProvider,
          {
            noteType: type,
            mode: "insert_entry",
            workDir: resolveWorkDirForCurrentNote() || "",
            workName: workName || "",
            workTitle: resolveWorkTitle(panel, context),
          },
        );
  
        if (result?.cancelled) {
          return;
        }
  
        if (!result?.ok) {
          throw new Error(
            result?.error?.message ||
              "部分インポートの読み込みに失敗しました。",
          );
        }
  
        const latest = await readNoteFile(filePath, type);
        const nextNote = buildNoteBootState(latest, {
          filePath,
          type,
          workDir,
          workName,
          workTitle,
        });
  
        await openNotePartialImportWebview(context, treeProvider, {
          initialMode,
          notePath: filePath,
          noteData: nextNote,
          sourceFilePath: result.sourceFilePath,
          sourceFileName: result.sourceFileName,
          parsedNote: result.parsedNote,
          previewData: result.previewData,
          scopeGroupId,
          defaultTargetGroupId:
            scopeGroupId || String((nextNote.groups || [])[0]?.id || ""),
          noteTitle: String(nextNote.title || "").trim(),
          noteTypeLabel: type === "plot" ? "プロット" : "資料",
          scopeGroupTitle: scopeGroupId
            ? String(
                (nextNote.groups || []).find(
                  (g) => String(g?.id || "") === String(scopeGroupId || ""),
                )?.title || "",
              ).trim()
            : "",
          onApply: async (applyPayload) => {
            const source = applyPayload?.source || {};
            const sourceType = String(source?.sourceType || "");
  
            const latestNote = await readNoteFile(filePath, type);
            const boot = buildNoteBootState(latestNote, {
              filePath,
              type,
              workDir,
              workName,
              workTitle,
            });
  
            let updated;
            let successMessage = "";
  
            if (String(applyPayload?.operation || initialMode) === "replace_entry_body") {
              const targetGroupId = String(
                applyPayload?.target?.groupId || "",
              );
              const targetItemId = String(applyPayload?.target?.itemId || "");
              const sourceBody = String(applyPayload?.source?.body || "");
  
              updated = replaceItemBody(
                boot,
                targetGroupId,
                targetItemId,
                sourceBody,
                { replaceItemMemo: applyPayload?.replaceItemMemo === true, memo: source.memo, expectedTarget: applyPayload?.target },
              );
              successMessage = applyPayload?.replaceItemMemo === true && source.memo
                ? "詳細本文と項目メモを上書きしました。" : "詳細本文を上書きしました。項目メモは保持しました。";
            } else {
              const targetGroupId = String(
                applyPayload?.target?.groupId || "",
              );
              const insertIndex = Number(
                applyPayload?.target?.insertIndex || 0,
              );
  
              updated =
                sourceType === "group"
                  ? insertGroupAtPosition(
                      boot,
                      Number(applyPayload?.target?.groupInsertIndex || 0),
                      {
                        title: String(source.title || ""),
                        items: Array.isArray(source.items)
                          ? source.items
                          : [],
                      },
                    )
                  : insertItemAtPosition(
                      boot,
                      targetGroupId,
                      insertIndex,
                      sourceType === "divider"
                        ? {
                            kind: "divider",
                            label: String(source.label || ""),
                            value: String(source.value || ""),
                          }
                        : {
                            kind: "entry",
                            heading: String(source.heading || ""),
                            body: String(source.body || ""),
                            ...(source.memo ? { memo: normalizeImportedItemMemo(source.memo) } : {}),
                          },
                    );
  
              successMessage =
                sourceType === "group"
                  ? "選択した大分類を挿入しました。"
                  : sourceType === "divider"
                    ? "選択した区分を挿入しました。"
                    : "選択した項目を挿入しました。";
            }
  
            const saved = await saveNoteFile(filePath, {
              ...updated,
              type,
            });
  
            const reloaded = buildNoteBootState(saved, {
              filePath,
              type,
              workDir,
              workName,
              workTitle,
            });
  
            panel.__mojigotoNoteData = reloaded;
            panel.title = getPanelTitle(reloaded);
  
            panel.webview.postMessage({
              type: "noteReloaded",
              payload: reloaded,
            });
  
            panel.webview.postMessage({
              type: "info",
              message: successMessage,
            });
  
            treeProvider?.refresh();
  
            return {
              message: successMessage,
              sourceItemId: String(source?.sourceItemId || ""),
              noteData: reloaded,
            };
          },
        });
  
        return;
      }
  
      if (message?.type === "markConceptMemoClearedFromNoteItem") {
        const payload = message?.payload || {};
        const currentWorkDir = resolveWorkDirForCurrentNote();
        const conceptMemoFilePath =
          resolveConceptMemoFilePath(currentWorkDir);
  
        const ids = Array.isArray(payload?.conceptMemoIds)
          ? payload.conceptMemoIds
          : [];
  
        for (const memoId of ids) {
          await updateConceptMemoSourceStatus(
            conceptMemoFilePath,
            memoId,
            "cleared",
          );
        }
  
        await notifyConceptMemoUpdated(conceptMemoFilePath);
        return;
      }
  
      if (message?.type === "markConceptMemoMissingFromNoteItem") {
        const payload = message?.payload || {};
        const currentWorkDir = resolveWorkDirForCurrentNote();
        const conceptMemoFilePath =
          resolveConceptMemoFilePath(currentWorkDir);
  
        const ids = Array.isArray(payload?.conceptMemoIds)
          ? payload.conceptMemoIds
          : [];
  
        for (const memoId of ids) {
          await updateConceptMemoSourceStatus(
            conceptMemoFilePath,
            memoId,
            "missing",
          );
        }
  
        await notifyConceptMemoUpdated(conceptMemoFilePath);
        return;
      }
  
      if (message?.type === "openConceptMemoFromNoteItem") {
        const payload = message?.payload || {};
        const currentWorkDir = resolveWorkDirForCurrentNote();
        const conceptMemoFilePath =
          resolveConceptMemoFilePath(currentWorkDir);
  
        await updateConceptMemoSourceAutoSync(conceptMemoFilePath, payload);
  
        const linkedIds = Array.isArray(payload?.conceptMemoIds)
          ? payload.conceptMemoIds
              .map((id) => String(id || "").trim())
              .filter(Boolean)
          : [];
  
        let selectedMemoId = String(linkedIds[0] || "");
  
        if (!selectedMemoId) {
          const { readConceptMemos } = require("../../data/concept-memo-store");
          const conceptData = await readConceptMemos(conceptMemoFilePath);
          const memos = Array.isArray(conceptData?.memos)
            ? conceptData.memos
            : [];
  
          const matched = memos.find((memo) => {
            const source = memo?.source || {};
            return (
              String(source.kind || "") === "noteItem" &&
              String(source.notePath || "") ===
                String(payload?.notePath || "") &&
              String(source.groupId || "") ===
                String(payload?.groupId || "") &&
              String(source.itemId || "") === String(payload?.itemId || "")
            );
          });
  
          selectedMemoId = String(matched?.id || "");
        }
  
        const { openConceptMemoWebview } = require("../concept-memo-webview");
  
        await openConceptMemoWebview(context, treeProvider, {
          filePath: conceptMemoFilePath,
          workDir: currentWorkDir,
          workTitle: resolveWorkTitle(panel, context),
          selectedMemoId,
          preserveFocus: false,
          viewColumn: vscode.ViewColumn.Beside,
        });
  
        panel.webview.postMessage({
          type: "restoreEditorPosition",
          payload: payload?.editorPosition || {},
        });
  
        return;
      }
  
      if (message?.type === "openConceptMemoForCopy") {
        const payload = message?.payload || {};
        const currentWorkDir = resolveWorkDirForCurrentNote();
        const conceptMemoFilePath =
          resolveConceptMemoFilePath(currentWorkDir);
  
        const { openConceptMemoWebview } = require("../concept-memo-webview");
  
        await openConceptMemoWebview(context, treeProvider, {
          filePath: conceptMemoFilePath,
          workDir: currentWorkDir,
          workTitle: resolveWorkTitle(panel, context),
          preserveFocus: false,
          viewColumn: vscode.ViewColumn.Beside,
          initialQuickFilters: {
            type: "",
            state: [],
            source: "",
          },
        });
  
        panel.webview.postMessage({
          type: "info",
          message:
            "構想メモを開きました。コピーしたい通常メモまたはリストメモを選んでください。",
        });
  
        panel.webview.postMessage({
          type: "restoreEditorPosition",
          payload: payload?.editorPosition || {},
        });
  
        return;
      }
  
      if (message?.type === "openDedicatedCopyPanel") {
        const picked = await vscode.window.showQuickPick(
          [
            {
              label: "そのまま開く",
              description: "専用コピー画面として開く",
              openMode: "same",
              layoutMode: "full",
            },
            {
              label: "右側に開く",
              description: "ノートを見ながら操作する",
              openMode: "beside",
              layoutMode: "compact",
            },
          ],
          {
            title: "コピー画面の開き方",
            placeHolder: "開き方を選んでください",
            ignoreFocusOut: true,
          },
        );
  
        if (!picked) {
          return;
        }
  
        const { openNoteCopyWebview } = require("../note-copy-webview");
  
        await openNoteCopyWebview(context, treeProvider, {
          filePath,
          type,
          workDir,
          workName,
          workTitle,
          openMode: picked.openMode,
          layoutMode: picked.layoutMode,
        });
        return;
      }
  
      if (message?.type === "save") {
        if (session.noteAutoSaveTimer) {
          clearTimeout(session.noteAutoSaveTimer);
          session.noteAutoSaveTimer = null;
        }
        await persistNoteMessage(message, true);
        return;
      }
    } catch (e) {
      panel.webview.postMessage({
        type: "error",
        message: `処理に失敗しました: ${String(e)}`,
      });
    }
  };
}

module.exports = { createNoteMessageHandler };
