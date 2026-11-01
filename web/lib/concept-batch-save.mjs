// List replacement still saves the shared document once, then checks every affected link.
// The current memo is only an internal sync target while the editor is hidden.
export function createConceptBatchSaveController({ state, save, sync, prepareMemo, changed, status, notify, cancelAutoSave }) {
  let pending = new Set(), owner = null;
  const sameOwner = () => owner && owner.provider === state.provider && owner.work === state.selectedWork
    && owner.file === state.conceptFile?.id && owner.baseline === state.conceptOriginalContent;
  function queue(ids) {
    if (!sameOwner()) pending.clear();
    owner = { provider: state.provider, work: state.selectedWork, file: state.conceptFile?.id, baseline: state.conceptOriginalContent };
    ids.forEach(id => pending.add(id));
  }
  async function saveBatch(options = {}) {
    // Synchronization persists its fingerprint through the ordinary save, without recursion.
    if (options.skipSync || !sameOwner() || !pending.size) return save(options);
    if (state.conceptBatchSaving || state.saving || state.syncing || state.externalConflict) return false;
    const originalId = state.currentConceptMemo?.id;
    state.conceptBatchSaving = true;
    const wasSwitching = state.conceptSwitchPending;
    state.conceptSwitchPending = true;
    cancelAutoSave();
    let ok = true;
    try {
      if (state.dirty && !await save({ ...options, skipSync: true })) return false;
      owner.baseline = state.conceptOriginalContent;
      for (const id of [...pending]) {
        const memo = state.conceptDocument.memos.find(memo => memo.id === id);
        if (!memo) { pending.delete(id); continue; }
        state.currentConceptMemo = memo;
        state.conceptSyncContext = null;
        state.conceptSyncBlocked = false;
        prepareMemo(memo);
        try {
          await sync({ automatic: true });
          owner.baseline = state.conceptOriginalContent;
          if (state.dirty || state.conceptSyncBlocked) {
            ok = false;
            notify(`${memo.title || '名称未設定'}：反映が完了していません。メモを開いて同期状態を確認してください。`, true);
            if (state.dirty || state.externalConflict) break;
          } else pending.delete(id);
        } catch (error) {
          ok = false;
          owner.baseline = state.conceptOriginalContent;
          notify(`${memo.title || '名称未設定'}：${error.message || '反映に失敗しました。'}`, true);
          if (state.dirty || state.externalConflict) break;
        }
      }
      return ok && !state.dirty;
    } finally {
      state.currentConceptMemo = state.conceptDocument.memos.find(memo => memo.id === originalId) || state.conceptDocument.memos[0] || null;
      if (state.currentConceptMemo) prepareMemo(state.currentConceptMemo);
      state.conceptSyncContext = null;
      state.conceptBatchSaving = false;
      state.conceptSwitchPending = wasSwitching;
      // Per-memo conflicts are resolved in their editor; do not block unrelated list operations.
      state.conceptSyncBlocked = false;
      status(state.externalConflict ? '競合あり' : state.dirty ? '未保存' : pending.size ? '保存済み・反映未完了' : '保存済み', state.externalConflict || pending.size ? 'error' : state.dirty ? 'dirty' : '');
      changed();
    }
  }
  return { queue, save: saveBatch, hasPending: () => Boolean(sameOwner() && pending.size > 0), reset: () => { pending.clear(); owner = null; } };
}
