import { OneDriveConflictError } from "../storage/onedrive-provider.mjs?v=1.0.1";
import { hasSameExternalContent, writeTextWithBaseline as writeWithBaseline } from "./editor-sync.mjs";

// Own concept document saves; the app supplies view, backup and synchronization effects.
export function createConceptSaveController({
  state, elements, cancelAutoSave, scheduleAutoSave, setConceptStatus, rememberTags,
  maybeCreateWebAutomaticBackup, conceptMemoBackupTarget, notify, cloudLabel,
  syncCurrentConceptMemo, setConceptSyncStatus, renderConceptEditorList,
  onStateChange = () => {}, writeTextWithBaseline = writeWithBaseline, measure = (_label, operation) => operation(),
}) {
  async function saveCurrentConceptMemo({ automatic = false, skipSync = false } = {}) {
    cancelAutoSave();
    if (!state.currentConceptMemo || state.saving || (state.syncing && !skipSync) || !state.dirty) return;
    if (state.externalConflict) {
      setConceptStatus("外部更新あり", "error");
      if (!elements.conflictDialog.open) elements.conflictDialog.showModal();
      return;
    }
    state.saving = true;
    setConceptStatus(automatic ? "自動保存中…" : "保存中…", "saving");
    elements.saveConceptMemoButton.disabled = true;
    const draftSnapshot = structuredClone(state.conceptDocument);
    const snapshot = structuredClone(draftSnapshot);
    const currentMemoId = state.currentConceptMemo.id;
    snapshot.updatedAt = new Date().toISOString();
    const content = `${JSON.stringify(snapshot, null, 2)}\n`;
    let backupPromise = null;
    let backupFinished = true;
    let shouldSync = false;
    let savedSuccessfully = false;
    const contentChanged = !hasSameExternalContent(state.conceptOriginalContent, content, "concept");
    try {
      const saved = await measure(skipSync ? "構想保存・同期情報書込" : "構想保存・本文書込", () => writeTextWithBaseline(state.provider, state.conceptFile, content, state.conceptOriginalContent, "concept"));
      savedSuccessfully = true;
      const changedWhileSaving = JSON.stringify(state.conceptDocument) !== JSON.stringify(draftSnapshot);
      if (!changedWhileSaving) state.conceptDocument = snapshot;
      state.conceptFile = { ...state.conceptFile, ...saved };
      state.conceptOriginalContent = content;
      state.selectedWork.conceptFile = state.conceptFile;
      state.selectedWork.contentUpdatedAt = state.conceptFile.lastModifiedDateTime || snapshot.updatedAt || state.selectedWork.contentUpdatedAt;
      state.conceptLoadedAt = Date.now();
      state.currentConceptMemo = state.conceptDocument.memos.find((memo) => memo.id === currentMemoId);
      rememberTags(state.currentConceptMemo?.tags || []);
      state.dirty = changedWhileSaving;
      setConceptStatus(changedWhileSaving ? "保存中・未保存あり" : "保存中…", "saving");
      shouldSync = !changedWhileSaving && !skipSync && (state.memoAutoReflectDefaults
          ? state.currentConceptMemo?.source?.kind === "noteItem"
          : Boolean(state.currentConceptMemo?.source?.autoSyncToNoteItem)
            && (state.conceptToNoteAutoReflect !== false || state.noteToConceptAutoReflect !== false));
      if (!changedWhileSaving) {
        backupFinished = false;
        backupPromise = measure("構想保存・バックアップ", () => maybeCreateWebAutomaticBackup(content, conceptMemoBackupTarget(content))).catch((error) => {
          notify(`構想メモは保存しましたが、バックアップを作成できませんでした: ${error.message}`, true);
        }).finally(() => { backupFinished = true; });
      }
      if (!automatic && contentChanged) notify(`構想メモを${cloudLabel()}へ保存しました。`);
    } catch (error) {
      if (error instanceof OneDriveConflictError || error?.code === "conflict") {
        state.externalConflict = true;
        setConceptStatus("競合あり", "error");
        elements.conflictDialog.showModal();
      } else {
        setConceptStatus("保存失敗", "error");
        notify(error.message || "構想メモを保存できませんでした。", true);
      }
    } finally {
      state.saving = false;
      onStateChange();
      elements.saveConceptMemoButton.disabled = Boolean(state.conceptSyncPending) || !state.dirty;
      if (savedSuccessfully && state.dirty) scheduleAutoSave();
    }
    let syncFailed = false;
    if (shouldSync && !state.dirty) {
      await measure("構想保存・項目反映", () => syncCurrentConceptMemo({ automatic: true })).catch((error) => {
        syncFailed = true;
        setConceptSyncStatus("同期を停止しました", "error");
        notify(error.message || "項目メモと同期できませんでした。", true);
      });
    }
    if (backupPromise && !backupFinished) {
      // Sync may finish before the backup; preserve navigation protection in that tail.
      state.saving = true;
      elements.saveConceptMemoButton.disabled = true;
      if (!syncFailed && !state.conceptSyncBlocked && !state.externalConflict) setConceptStatus("バックアップ中…", "saving");
      try { await backupPromise; } finally {
        state.saving = false;
      onStateChange();
        elements.saveConceptMemoButton.disabled = Boolean(state.conceptSyncPending) || !state.dirty;
        if (state.dirty) scheduleAutoSave();
      }
    }
    if (savedSuccessfully && !syncFailed && !state.conceptSyncBlocked && !state.externalConflict) {
      setConceptStatus(state.dirty ? "未保存" : "保存済み", state.dirty ? "dirty" : "");
    }
    renderConceptEditorList();
    return savedSuccessfully && !state.dirty && (!shouldSync || !state.conceptSyncBlocked);
  }

  return { saveCurrentConceptMemo };
}
