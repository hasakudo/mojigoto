import { OneDriveConflictError } from "../storage/onedrive-provider.mjs?v=1.0.1";

// The app supplies view, history, backup and progress effects; this owns manuscript save sequencing.
export function createManuscriptSaveController({
  state, elements, cancelAutoSave, scheduleAutoSave, setEditorStatus, updateReaderMeta,
  captureRecentManuscriptContext, recordRecentManuscript, countCharacters, makeWritingEvent,
  appendWritingEvent, updateSharedWorkMetrics, maybeCreateWebAutomaticBackup, notify, cloudLabel, onStateChange = () => {},
}) {
  async function saveCurrentFile({ automatic = false } = {}) {
    cancelAutoSave();
    if (state.externalConflict) {
      setEditorStatus("外部更新あり", "error");
      if (!elements.conflictDialog.open) elements.conflictDialog.showModal();
      return;
    }
    if (!state.currentFile || state.saving || !state.dirty) return;
    const snapshot = elements.readerContent.value;
    const beforeContent = state.originalContent;
    const recentContext = captureRecentManuscriptContext();
    state.saving = true;
    let savedSuccessfully = false;
    elements.saveFileButton.disabled = true;
    setEditorStatus(automatic ? "自動保存中…" : "保存中…", "saving");
    try {
      const saved = await state.provider.writeText(
        state.currentFile,
        snapshot,
        state.currentFile.eTag,
      );
      state.currentFile = { ...state.currentFile, ...saved };
      state.originalContent = snapshot;
      savedSuccessfully = true;
      state.dirty = elements.readerContent.value !== snapshot;
      updateReaderMeta(state.currentFile);
      if (snapshot !== beforeContent) recordRecentManuscript(state.currentFile, recentContext);
      setEditorStatus(state.dirty ? "未保存" : "保存済み", state.dirty ? "dirty" : "");
      const relativePath = [...state.manuscriptTrail.map((item) => item.name), state.currentFile.name].join("/");
      const event = makeWritingEvent({
        file: relativePath,
        beforeCount: countCharacters(beforeContent),
        afterCount: countCharacters(snapshot),
      });
      appendWritingEvent(state.provider, state.selectedWork?.mojigoto, event).catch((error) => {
        notify(`原稿は保存しましたが、執筆記録を保存できませんでした: ${error.message}`, true);
      });
      updateSharedWorkMetrics({ beforeContent, afterContent: snapshot });
      maybeCreateWebAutomaticBackup(snapshot);
      if (!automatic) notify(`${cloudLabel()}へ保存しました。`);
    } catch (error) {
      if (error instanceof OneDriveConflictError || error?.code === "conflict") {
        state.externalConflict = true;
        setEditorStatus("競合あり", "error");
        elements.conflictDialog.showModal();
      } else {
        setEditorStatus("保存失敗", "error");
        notify(error.message || "保存できませんでした。", true);
      }
    } finally {
      state.saving = false;
      onStateChange();
      elements.saveFileButton.disabled = !state.dirty;
      if (savedSuccessfully && state.dirty) scheduleAutoSave();
    }
  }

  return { saveCurrentFile };
}
