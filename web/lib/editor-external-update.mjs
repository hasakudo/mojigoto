import { hasExternalVersion, hasSameExternalContent } from "./editor-sync.mjs";

// Common external-update checks; the app supplies the editor-specific view effects.
export function createEditorExternalUpdateController({
  state, elements, document, cancelAutoSave, scheduleAutoSave,
  updateGoogleDriveConnectionNotice, checkConceptSourceUpdate, updateReaderMeta,
  setWorkSettingsStatus, setConceptStatus, setNoteStatus, setEditorStatus,
  reloadWorkSettings, reloadConceptDocument, openNote, openFile,
}) {
  async function checkExternalUpdate() {
    const target = state.currentSettings?.item || (state.currentConceptMemo ? state.conceptFile : state.currentNote?.item || state.currentFile);
    if (
      !target ||
      state.saving || state.syncing ||
      state.checkingExternalUpdate ||
      state.externalConflict ||
      document.hidden
    ) return;

    const checkedFileId = target.id;
    const checkingSettings = Boolean(state.currentSettings);
    const checkingConcept = !checkingSettings && Boolean(state.currentConceptMemo);
    const checkingNote = !checkingSettings && !checkingConcept && Boolean(state.currentNote);
    const provider = state.provider, work = state.selectedWork, root = state.workRoot;
    const editor = checkingSettings ? elements.workSettingsSection : checkingConcept ? elements.conceptMemoEditorSection : checkingNote ? elements.noteEditorSection : elements.readerSection;
    const currentContext = () => state.provider === provider && state.selectedWork === work && state.workRoot === root
      && !state.openingPreviewManuscript && (!editor || !editor.hidden);
    if (!currentContext()) return;
    state.checkingExternalUpdate = true;
    try {
      if (state.cloudKind === "googleDrive" && !await state.googleDriveAuth.getAccessToken()) {
        updateGoogleDriveConnectionNotice();
        return;
      }
      const metadata = await provider.getItemMetadata(target);
      const liveTarget = checkingSettings ? state.currentSettings?.item : checkingConcept ? state.conceptFile : checkingNote ? state.currentNote?.item : state.currentFile;
      if (!currentContext() || state.saving || state.syncing || liveTarget?.id !== checkedFileId || liveTarget !== target || state.provider !== provider) return;
      if (!hasExternalVersion(target, metadata)) {
        if (checkingConcept) await checkConceptSourceUpdate();
        return;
      }

      cancelAutoSave();
      const refreshedTarget = { ...target, ...metadata };
      const remoteContent = await provider.readText(refreshedTarget);
      const latestTarget = checkingSettings ? state.currentSettings?.item : checkingConcept ? state.conceptFile : checkingNote ? state.currentNote?.item : state.currentFile;
      if (!currentContext() || state.saving || state.syncing || latestTarget?.id !== checkedFileId || latestTarget !== target || state.provider !== provider) return;
      const originalContent = checkingSettings
        ? state.currentSettings?.raw
        : checkingConcept
          ? state.conceptOriginalContent
          : checkingNote
            ? state.currentNote?.raw
            : state.originalContent;
      const contentKind = checkingConcept ? "concept" : checkingNote ? "note" : "text";
      if (hasSameExternalContent(originalContent, remoteContent, contentKind)) {
        const status = state.dirty ? ["未保存", "dirty"] : ["保存済み", ""];
        state.externalConflict = false;
        if (checkingSettings) {
          state.currentSettings.item = refreshedTarget;
          state.currentSettings.raw = remoteContent;
          state.selectedWork.settingsFile = refreshedTarget;
          setWorkSettingsStatus(...status);
          elements.saveWorkSettingsButton.disabled = !state.dirty;
        } else if (checkingConcept) {
          state.conceptFile = refreshedTarget;
          state.conceptOriginalContent = remoteContent;
          state.selectedWork.conceptFile = refreshedTarget;
          setConceptStatus(...status);
          elements.saveConceptMemoButton.disabled = !state.dirty;
        } else if (checkingNote) {
          state.currentNote.item = refreshedTarget;
          state.currentNote.raw = remoteContent;
          setNoteStatus(...status);
          elements.saveNoteButton.disabled = !state.dirty;
        } else {
          state.currentFile = refreshedTarget;
          state.originalContent = remoteContent;
          updateReaderMeta(refreshedTarget);
          setEditorStatus(...status);
          elements.saveFileButton.disabled = !state.dirty;
        }
        if (state.dirty) scheduleAutoSave();
        if (checkingConcept) await checkConceptSourceUpdate();
        return;
      }

      if (state.dirty) {
        state.externalConflict = true;
        if (checkingSettings) setWorkSettingsStatus("外部更新あり", "error");
        else if (checkingConcept) setConceptStatus("外部更新あり", "error");
        else if (checkingNote) setNoteStatus("外部更新あり", "error");
        else setEditorStatus("外部更新あり", "error");
        if (!elements.conflictDialog.open) elements.conflictDialog.showModal();
        return;
      }

      if (checkingSettings) await reloadWorkSettings(refreshedTarget);
      else if (checkingConcept) await reloadConceptDocument(refreshedTarget, state.currentConceptMemo.id);
      else if (checkingNote) await openNote({ ...state.currentNote, item: refreshedTarget });
      else await openFile(refreshedTarget, { content: remoteContent });
      // 未編集なら最新版へ静かに追従する。作業中の定期保存で通知が
      // 繰り返し表示されないよう、競合がある場合だけ利用者へ知らせる。
    } catch {
      // A temporary metadata failure should not interrupt editing. Normal save
      // still performs the same eTag check and reports actionable errors.
      if (currentContext() && state.dirty && !state.externalConflict) scheduleAutoSave();
    } finally {
      state.checkingExternalUpdate = false;
    }
  }

  return { checkExternalUpdate };
}
