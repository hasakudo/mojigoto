import { conceptAutoReflectEnabled, noteAutoReflectEnabled, isConceptMemoAutoSyncEnabled, isNoteMemoAutoSyncEnabled } from "./memo-auto-reflect.mjs";
import { hasExternalVersion } from "./editor-sync.mjs";
import { createNoteEntry } from "./notes.mjs";
import { memoEditableText } from "./concept-memos.mjs";
import { analyzeConceptNoteSync, applyNotePayloadToConcept, notePayloadFromConcept } from "./concept-sync.mjs";

// Own source comparison and two-way writes; keep source lookup and editor effects in the app.
export function createConceptMemoSyncController({
  state, elements, findConceptSourceEntry, setConceptSyncStatus, notify, cacheConceptSourceEntry = () => {},
  cancelAutoSave, saveCurrentConceptMemo, updateConceptBodyLabel,
  setConceptStatus = () => {}, scheduleAutoSave = () => {},
}) {
  async function refreshConceptSyncStatus() {
    const memo = state.currentConceptMemo;
    if (!memo?.source || memo.source.kind !== "noteItem") return;
    const work = state.selectedWork;
    const provider = state.provider;
    const context = { ...(await findConceptSourceEntry(memo)), memo };
    if (state.currentConceptMemo?.id !== memo.id || state.selectedWork !== work || state.provider !== provider) return;
    context.analysis = analyzeConceptNoteSync(memo, context.item.memo);
    state.conceptSyncContext = context;
    const labels = {
      synced: ["同期済み", "success"],
      "concept-changed": ["構想メモに未反映の変更があります", "dirty"],
      "note-changed": ["項目メモに未反映の変更があります", "dirty"],
      conflict: ["両方に変更あり：反映したい側のボタンを押してください", "error"],
      untracked: ["初回同期：反映したい側のボタンを押してください", "dirty"],
    };
    setConceptSyncStatus(...(labels[context.analysis.status] || ["同期状態を確認できません", "error"]));
    return context;
  }

  async function checkConceptSourceUpdate() {
    const sourceItem = state.conceptSyncContext?.entry?.item;
    if (!sourceItem) return;
    const metadata = await state.provider.getItemMetadata(sourceItem);
    if (!hasExternalVersion(sourceItem, metadata)) return;
    const previous = state.conceptSyncContext?.analysis;
    const context = await refreshConceptSyncStatus();
    const analysis = context?.analysis;
    if (!analysis) return;
    const changed = analysis.status !== previous?.status
      || analysis.noteFingerprint !== previous?.noteFingerprint
      || analysis.conceptFingerprint !== previous?.conceptFingerprint;
    if (changed && ["conflict", "untracked"].includes(analysis.status)) {
      notify("リンク先の項目メモとの同期を停止しました。反映したい側のボタンを押してください。", true);
    }
  }

  async function writeConceptToNote({ entry, item, memo, analysis }, { automatic = false } = {}) {
    const draft = JSON.stringify(state.conceptDocument);
    const stagedEntry = structuredClone(entry);
    const stagedItem = stagedEntry.data.groups.flatMap((group) => group.items || []).find((candidate) => candidate.id === item.id);
    const payload = notePayloadFromConcept(memo);
    const now = new Date().toISOString();
    stagedItem.memo ||= createNoteEntry().memo;
    Object.assign(stagedItem.memo, payload, {
      updatedAt: now,
      linkedConceptMemoIds: [...new Set([...(stagedItem.memo.linkedConceptMemoIds || []), memo.id])],
      conceptMemoSyncFingerprint: analysis.conceptFingerprint,
      conceptMemoSyncedAt: now,
    });
    stagedEntry.data.updatedAt = now;
    const content = `${JSON.stringify(stagedEntry.data, null, 2)}\n`;
    const saved = await state.provider.writeText(entry.item, content, entry.item.eTag);
    Object.assign(item.memo ||= {}, stagedItem.memo);
    entry.data.updatedAt = now;
    entry.item = { ...entry.item, ...saved };
    entry.raw = content;
    cacheConceptSourceEntry(memo, entry);
    memo.source = { ...memo.source, syncFingerprint: analysis.conceptFingerprint, syncedAt: now, status: "active" };
    state.dirty = true;
    // Keep input entered during the note write as an unsaved draft.
    const currentWithoutSync = structuredClone(state.conceptDocument);
    const originalSource = JSON.parse(draft).memos.find((candidate) => candidate.id === memo.id)?.source;
    currentWithoutSync.memos.find((candidate) => candidate.id === memo.id).source = originalSource;
    if (JSON.stringify(currentWithoutSync) !== draft) {
      throw new Error("項目メモへ反映しました。同期中の追加入力は未保存です。構想メモを保存してください。");
    }
    if (!await saveCurrentConceptMemo({ automatic: true, skipSync: true })) {
      throw new Error("項目メモへ反映しましたが、構想メモ側の同期情報は未保存です。構想メモを保存してください。");
    }
    setConceptSyncStatus("同期済み", "success");
    if (!automatic) notify("構想メモを項目メモへ安全に同期しました。");
  }

  async function writeNoteToConcept({ entry, item, memo, analysis }, { automatic = false } = {}) {
    const now = new Date().toISOString();
    applyNotePayloadToConcept(memo, item.memo);
    memo.updatedAt = now;
    memo.source = { ...memo.source, syncFingerprint: analysis.noteFingerprint, syncedAt: now, status: "active" };
    state.dirty = true;
    elements.conceptMemoTypeSelect.value = memo.type;
    elements.conceptMemoBodyInput.value = memoEditableText(memo);
    elements.conceptMemoTagsInput.value = (memo.tags || []).join(", ");
    updateConceptBodyLabel();
    if (!await saveCurrentConceptMemo({ automatic: true, skipSync: true })) {
      throw new Error("構想メモを保存できなかったため、ノート側の同期情報の更新を停止しました。");
    }

    const stagedEntry = structuredClone(entry);
    const stagedItem = stagedEntry.data.groups.flatMap((group) => group.items || []).find((candidate) => candidate.id === item.id);
    stagedItem.memo.conceptMemoSyncFingerprint = analysis.noteFingerprint;
    stagedItem.memo.conceptMemoSyncedAt = now;
    stagedEntry.data.updatedAt = now;
    const content = `${JSON.stringify(stagedEntry.data, null, 2)}\n`;
    const saved = await state.provider.writeText(entry.item, content, entry.item.eTag);
    Object.assign(item.memo, stagedItem.memo);
    entry.data.updatedAt = now;
    entry.item = { ...entry.item, ...saved };
    entry.raw = content;
    cacheConceptSourceEntry(memo, entry);
    setConceptSyncStatus("同期済み", "success");
    if (!automatic) notify("項目メモを構想メモへ安全に同期しました。");
  }

  async function syncCurrentConceptMemo({ forceDirection = "", automatic = false } = {}) {
    if (state.saving || state.syncing || state.externalConflict) return;
    if (automatic && !state.memoAutoReflectDefaults && state.conceptToNoteAutoReflect === false && state.noteToConceptAutoReflect === false) return { status: "disabled" };
    const memo = state.currentConceptMemo;
    if (!memo?.source || memo.source.kind !== "noteItem") return { status: "unlinked" };
    const provider = state.provider;
    const work = state.selectedWork;
    const draft = JSON.stringify(state.conceptDocument);
    const previous = state.conceptSyncContext?.analysis;
    state.syncing = true;
    state.conceptSyncPending = true;
    cancelAutoSave();
    elements.saveConceptMemoButton.disabled = true;
    setConceptStatus("項目メモへ反映中…", "saving");
    let failed = false;
    try {
      const context = { ...(await findConceptSourceEntry(memo)), memo };
      if (state.provider !== provider || state.selectedWork !== work || state.currentConceptMemo !== memo
        || state.saving || state.externalConflict || JSON.stringify(state.conceptDocument) !== draft) return;
      const analysis = analyzeConceptNoteSync(memo, context.item.memo);
      context.analysis = analysis;
      state.conceptSyncContext = context;

      if (analysis.status === "synced") {
        setConceptSyncStatus("同期済み", "success");
        return analysis;
      }

      let direction = forceDirection;
      const conceptAuto = conceptAutoReflectEnabled(state, memo.source);
      const noteAuto = noteAutoReflectEnabled(state, context.item.memo);
      if (!direction && analysis.status === "concept-changed" && (conceptAuto || !automatic)) direction = "concept-to-note";
      if (!direction && analysis.status === "note-changed" && (noteAuto || !automatic)) direction = "note-to-concept";
      if (!direction && analysis.status === "untracked") {
        const conceptInitial = isConceptMemoAutoSyncEnabled(memo.source, state.memoAutoReflectDefaults?.confirmed_concept !== false && state.memoAutoReflectDefaults?.concept);
        const noteInitial = isNoteMemoAutoSyncEnabled(context.item.memo, state.memoAutoReflectDefaults?.confirmed_note !== false && state.memoAutoReflectDefaults?.note);
        if (conceptInitial && !noteInitial) direction = "concept-to-note";
        if (noteInitial && !conceptInitial) direction = "note-to-concept";
      }

      if (automatic && ((!conceptAuto && !noteAuto)
          || (analysis.status === "concept-changed" && !conceptAuto)
          || (analysis.status === "note-changed" && !noteAuto)
          || (direction === "concept-to-note" && !conceptAuto)
          || (direction === "note-to-concept" && !noteAuto))) return { ...analysis, automaticDisabled: true };

      if (!direction) {
        const label = analysis.status === "conflict"
          ? "両方に変更あり：反映したい側のボタンを押してください"
          : analysis.status === "note-changed" ? "項目メモに未反映の変更があります"
            : analysis.status === "concept-changed" ? "構想メモに未反映の変更があります"
              : "初回同期：反映したい側のボタンを押してください";
        setConceptSyncStatus(label, "error");
        if (automatic && ["conflict", "untracked"].includes(analysis.status)
          && (analysis.status !== previous?.status || analysis.noteFingerprint !== previous?.noteFingerprint
            || analysis.conceptFingerprint !== previous?.conceptFingerprint)) {
          notify("項目メモとの同期を停止しました。反映したい側のボタンを押してください。", true);
        }
        return analysis;
      }

      if (direction === "concept-to-note") await writeConceptToNote(context, { automatic });
      else await writeNoteToConcept(context, { automatic });
      context.analysis = analyzeConceptNoteSync(state.currentConceptMemo || memo, context.item.memo);
      return analysis;
    } catch (error) {
      failed = true;
      setConceptSyncStatus("同期を停止しました", "error");
      setConceptStatus(state.dirty ? "反映失敗・未保存あり" : "構想メモ保存済み・反映失敗", "error");
      throw error;
    } finally {
      state.conceptSyncPending = false;
      state.syncing = false;
      if (state.provider === provider && state.selectedWork === work && state.currentConceptMemo?.id === memo.id) {
        elements.saveConceptMemoButton.disabled = !state.dirty;
        if (!failed) {
          setConceptStatus(state.externalConflict ? "競合あり" : state.conceptSyncBlocked ? "同期競合あり" : state.dirty ? "未保存" : "保存済み",
            state.externalConflict || state.conceptSyncBlocked ? "error" : state.dirty ? "dirty" : "");
        }
        if (state.dirty && !failed) scheduleAutoSave();
      }
    }
  }

  return { refreshConceptSyncStatus, checkConceptSourceUpdate, writeConceptToNote, writeNoteToConcept, syncCurrentConceptMemo };
}
