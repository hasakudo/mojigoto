// Shared timer routing for manuscript, note, concept memo and work settings editors.
export function createEditorSaveScheduler({
  state, updateGoogleDriveConnectionNotice, saveCurrentFile, saveCurrentNote,
  saveCurrentConceptMemo, saveCurrentWorkSettings, checkExternalUpdate,
  autoSaveDelay, externalCheckInterval, timers = globalThis,
}) {
  const AUTO_SAVE_DELAY = autoSaveDelay;
  const EXTERNAL_CHECK_INTERVAL = externalCheckInterval;
  function cancelAutoSave() {
    timers.clearTimeout(state.autoSaveTimer);
    state.autoSaveTimer = null;
  }

  function scheduleAutoSave() {
    cancelAutoSave();
    if (!state.autoSaveEnabled || !state.dirty || state.saving || state.syncing || state.externalConflict || state.conceptSwitchPending || state.relatedOpening || state.openingRecentManuscript || state.openingPreviewManuscript) return;
    if (state.cloudKind === "googleDrive" && state.googleDriveAuth?.connectionStatus?.()?.connected === false) {
      updateGoogleDriveConnectionNotice();
      return;
    }
    state.autoSaveTimer = timers.setTimeout(() => {
      if (state.currentSettings) saveCurrentWorkSettings({ automatic: true });
      else if (state.currentConceptMemo) saveCurrentConceptMemo({ automatic: true });
      else if (state.currentNote) saveCurrentNote({ automatic: true });
      else saveCurrentFile({ automatic: true });
    }, AUTO_SAVE_DELAY);
  }

  function stopExternalMonitor() {
    timers.clearInterval(state.externalCheckTimer);
    state.externalCheckTimer = null;
  }

  function startExternalMonitor() {
    stopExternalMonitor();
    state.externalCheckTimer = timers.setInterval(checkExternalUpdate, EXTERNAL_CHECK_INTERVAL);
  }

  return { cancelAutoSave, scheduleAutoSave, stopExternalMonitor, startExternalMonitor };
}
