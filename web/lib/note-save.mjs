import { shouldReflectNoteItem } from "./memo-auto-reflect.mjs";
import { syncNoteWithGlobalDefaults } from "./note-auto-link.mjs";
import { OneDriveConflictError } from "../storage/onedrive-provider.mjs?v=1.0.1";
import { hasSameExternalContent, writeTextWithBaseline as writeWithBaseline } from "./editor-sync.mjs";
import { NOTE_TYPES, createNoteEntry } from "./notes.mjs";
import { normalizeConceptDocument } from "./concept-memos.mjs";
import { ensureNoteItemConcept } from "./note-concept-link.mjs";
import { analyzeConceptNoteSync, applyNotePayloadToConcept, noteMemoPayload, notePayloadFromConcept, syncFingerprint } from "./concept-sync.mjs";

// Own note-save sequencing and outbound concept reflection; the app supplies view and storage effects.
export function createNoteSaveController({
  state, elements, cancelAutoSave, scheduleAutoSave, setNoteStatus, refreshNoteDerivedViews,
  recordRecentView, routeForWork, rememberTags, updateSharedWorkMetrics, updateNoteIndex,
  maybeCreateWebAutomaticBackup, noteBackupTarget, notify, cloudLabel, renderNoteEditor,
  writeTextWithBaseline = writeWithBaseline, refreshNoteAutoReflectActions = () => {},
  measure = (_label, operation) => operation(),
}) {
  async function saveCurrentNote({ automatic = false, skipConceptSync = false } = {}) {
    cancelAutoSave();
    if (!state.currentNote || state.saving || state.noteConceptSyncPending || (state.syncing && !skipConceptSync) || !state.dirty) return;
    if (state.externalConflict) {
      setNoteStatus("外部更新あり", "error");
      if (!elements.conflictDialog.open) elements.conflictDialog.showModal();
      return;
    }
    state.saving = true;
    elements.saveNoteButton.disabled = true;
    setNoteStatus(automatic ? "自動保存中…" : "保存中…", "saving");
    const pendingReflectionIds = new Set(state.currentNote.reflectionPendingIds || []);
    let previousItems = [];
    try { previousItems = JSON.parse(state.currentNote.raw).groups.flatMap(group => group.items || []); } catch { /* An unknown baseline requires a fresh comparison. */ }
    const reflectionIds = state.currentNote.data.groups.flatMap(group => group.items || []).filter(item => {
      if (!shouldReflectNoteItem(state, item)) return false;
      const previous = previousItems.find(candidate => candidate.id === item.id);
      const memo = item.memo;
      return pendingReflectionIds.has(item.id) || !previous || !memo.linkedConceptMemoIds?.some(Boolean)
        || syncFingerprint(noteMemoPayload(previous.memo)) !== syncFingerprint(noteMemoPayload(memo))
        || JSON.stringify(previous.memo?.linkedConceptMemoIds) !== JSON.stringify(memo.linkedConceptMemoIds)
        || previous.memo?.autoSyncToConceptMemo !== memo.autoSyncToConceptMemo
        || previous.memo?.autoSyncToConceptMemoOverride !== memo.autoSyncToConceptMemoOverride;
    }).map(item => item.id);
    const draftSnapshot = structuredClone(state.currentNote.data);
    const snapshot = structuredClone(draftSnapshot);
    snapshot.title = String(snapshot.title || "").trim() || "無題のノート";
    snapshot.updatedAt = new Date().toISOString();
    const content = `${JSON.stringify(snapshot, null, 2)}\n`;
    let backupPromise = null;
    let shouldSyncConcepts = false;
    let savedSuccessfully = false;
    const contentChanged = !hasSameExternalContent(state.currentNote.raw, content, "note");
    try {
      const saved = await measure("ノート保存・本文書込", () => writeTextWithBaseline(state.provider, state.currentNote.item, content, state.currentNote.raw, "note"));
      savedSuccessfully = true;
      const liveData = state.currentNote.data;
      const changedWhileSaving = JSON.stringify(liveData) !== JSON.stringify(draftSnapshot);
      state.currentNote = {
        item: { ...state.currentNote.item, ...saved },
        data: changedWhileSaving ? liveData : snapshot,
        raw: content,
        reflectionPendingIds: [...new Set([...pendingReflectionIds, ...reflectionIds])],
      };
      state.dirty = changedWhileSaving;
      setNoteStatus(changedWhileSaving ? "保存中・未保存あり" : "保存中…", "saving");
      elements.saveNoteButton.disabled = !changedWhileSaving;
      refreshNoteDerivedViews();
      shouldSyncConcepts = !changedWhileSaving && !skipConceptSync;
      if (!changedWhileSaving) {
        recordRecentView(routeForWork("note-editor", { noteType: state.noteType, item: state.currentNote.item }));
        rememberTags(snapshot.groups.flatMap((group) => (group.items || []).flatMap((item) => item.memo?.tags || [])));
        state.noteEntriesCache.delete(`${state.selectedWork?.id || ""}:${state.noteType}`);
        updateSharedWorkMetrics();
        updateNoteIndex(state.currentNote.item, snapshot);
        backupPromise = measure("ノート保存・バックアップ", () => maybeCreateWebAutomaticBackup(content, noteBackupTarget(content))).catch((error) => {
          notify(`ノートは保存しましたが、バックアップを作成できませんでした: ${error.message}`, true);
        });
      }
      if (!automatic && contentChanged) notify(`ノートを${cloudLabel()}へ保存しました。`);
    } catch (error) {
      if (error instanceof OneDriveConflictError || error?.code === "conflict") {
        state.externalConflict = true;
        setNoteStatus("競合あり", "error");
        elements.conflictDialog.showModal();
      } else {
        setNoteStatus("保存失敗", "error");
        notify(error.message || "ノートを保存できませんでした。", true);
      }
    } finally {
      state.saving = false;
      elements.saveNoteButton.disabled = Boolean(state.noteManualSyncPending || state.noteConceptSyncPending) || !state.dirty;
      if (savedSuccessfully && state.dirty) scheduleAutoSave();
    }
    const hasLinkedAutoReflectItem = reflectionIds.length > 0;
    let reflectionAttempted = false;
    if (shouldSyncConcepts && !state.dirty
        && hasLinkedAutoReflectItem) {
      reflectionAttempted = true;
      // Keep navigation and external checks blocked after the note itself is saved.
      state.syncing = true;
      state.noteConceptSyncPending = true;
      cancelAutoSave();
      elements.saveNoteButton.disabled = true;
      setNoteStatus("構想メモへ反映中…", "saving");
      let reflectionFailed = false;
      let reflectionConflicts = false;
      state.currentNote.reflectionPendingIds = [...new Set([...pendingReflectionIds, ...reflectionIds])];
      try {
        const result = await measure("ノート保存・構想反映", () => syncSavedNoteToConceptMemos(state.currentNote, reflectionIds));
        refreshNoteAutoReflectActions();
        reflectionConflicts = Boolean(result?.conflicts);
        if (!reflectionConflicts) state.currentNote.reflectionPendingIds = [];
        if (result?.conflicts) {
          setNoteStatus("同期競合あり", "error");
          notify("構想メモとの同期を" + result.conflicts + "件停止しました。反映したい側の画面で反映ボタンを押してください。", true);
        } else {
          setNoteStatus(state.dirty ? "未保存" : "保存済み", state.dirty ? "dirty" : "");
        }
      } catch (error) {
        reflectionFailed = true;
        refreshNoteAutoReflectActions();
        setNoteStatus("ノート保存済み・反映失敗", "error");
        notify(error.message || "構想メモと同期できませんでした。", true);
      } finally {
        // Keep reflection/navigation protection until both independent writes finish.
        if (backupPromise) await backupPromise;
        state.noteConceptSyncPending = false;
        state.syncing = false;
        if (!reflectionFailed && !reflectionConflicts) {
          setNoteStatus(state.dirty ? "未保存" : "保存済み", state.dirty ? "dirty" : "");
        }
        elements.saveNoteButton.disabled = !state.dirty;
        if (state.dirty && !reflectionFailed) scheduleAutoSave();
      }
    }
    if (!reflectionAttempted && backupPromise) {
      state.saving = true;
      elements.saveNoteButton.disabled = true;
      try { await backupPromise; } finally {
        state.saving = false;
        elements.saveNoteButton.disabled = !state.dirty;
        if (state.dirty) scheduleAutoSave();
      }
    }
    if (savedSuccessfully && !reflectionAttempted && !state.externalConflict) {
      setNoteStatus(state.dirty ? "未保存" : "保存済み", state.dirty ? "dirty" : "");
    }
    return savedSuccessfully && !state.dirty;
  }

  async function createConceptFromNoteItem(groupIndex, itemIndex) {
    if (!state.currentNote || state.saving || state.syncing || state.dirty || state.externalConflict) return;
    const noteEntry = state.currentNote;
    const snapshot = structuredClone(noteEntry.data);
    const sourceItem = snapshot.groups[groupIndex]?.items?.[itemIndex];
    if (!sourceItem || !state.selectedWork?.mojigoto) throw new Error("項目メモの保存先を確認できませんでした。");
    state.saving = true;
    cancelAutoSave();
    try {
      const children = await state.provider.listChildren(state.selectedWork.mojigoto.id);
      const file = children.find((entry) => entry?.file && entry.name === "concept-memos.json");
      if (!file && state.cloudKind === "googleDrive") {
        throw new Error("構想メモのファイルを確認できません。Google Driveの設定ページで .mojigoto 内の concept-memos.json を追加許可し、作品一覧を再読み込みしてください。まだファイルがない場合はVS Codeで構想メモを作成し、同期後に許可してください。重複を防ぐため、新規作成していません。");
      }
      const document = normalizeConceptDocument(file ? JSON.parse(await state.provider.readText(file)) : {});
      const notePath = `.mojigoto/${NOTE_TYPES[snapshot.type].folder}/${noteEntry.item.name}`;
      const result = ensureNoteItemConcept(document, snapshot, groupIndex, itemIndex, notePath);
      if (result.created) {
        const content = `${JSON.stringify(document, null, 2)}\n`;
        const saved = file
          ? await state.provider.writeText(file, content, file.eTag)
          : await state.provider.createTextFile(state.selectedWork.mojigoto, "concept-memos.json", content);
        state.selectedWork.conceptFile = { ...(file || {}), ...saved };
      }
      const liveItem = noteEntry.data.groups.flatMap((group) => group.items || []).find((item) => item.id === sourceItem.id);
      if (!liveItem) throw new Error("構想メモは作成しましたが、元の項目が見つかりません。ノートを確認してください。");
      const memo = liveItem.memo ||= createNoteEntry().memo;
      memo.linkedConceptMemoIds = [...new Set([...(memo.linkedConceptMemoIds || []), result.memo.id])];
      memo.conceptMemoSyncFingerprint = result.memo.source.syncFingerprint || "";
      memo.conceptMemoSyncedAt = sourceItem.memo?.updatedAt || "";
      state.conceptLoadedAt = 0;
      state.dirty = true;
    } finally {
      state.saving = false;
      if (state.dirty) scheduleAutoSave();
    }
    await saveCurrentNote({ automatic: true, skipConceptSync: true });
    renderNoteEditor();
    refreshNoteDerivedViews();
    notify(state.dirty ? "構想メモは作成しました。ノート側のリンク情報は未保存です。もう一度保存してください。" : "項目メモと構想メモをリンクしました。", state.dirty);
  }

  async function reflectNoteItemToConceptMemos(groupIndex, itemIndex) {
    if (state.saving || state.syncing || state.externalConflict) return;
    if (state.dirty && !await saveCurrentNote({ automatic: true, skipConceptSync: true })) return;
    const noteEntry = state.currentNote;
    const provider = state.provider;
    const work = state.selectedWork;
    const snapshot = structuredClone(noteEntry?.data);
    const group = snapshot?.groups?.[groupIndex];
    const item = group?.items?.[itemIndex];
    const linkedIds = Array.isArray(item?.memo?.linkedConceptMemoIds)
      ? item.memo.linkedConceptMemoIds.filter(Boolean)
      : [];
    if (!item || !linkedIds.length) throw new Error("リンク済みの構想メモがありません。");

    state.syncing = true;
    state.noteManualSyncPending = true;
    let completed = false;
    let reflectedDocument;
    elements.saveNoteButton.disabled = true;
    setNoteStatus("構想メモへ反映中…", "saving");
    cancelAutoSave();
    try {
      const children = await provider.listChildren(work.mojigoto.id);
      const file = children.find((entry) => entry?.file && entry.name === "concept-memos.json");
      if (!file) throw new Error("構想メモファイルが見つかりません。");
      const document = normalizeConceptDocument(JSON.parse(await provider.readText(file)));
      reflectedDocument = document;
      const now = new Date().toISOString();
      const fingerprint = syncFingerprint(noteMemoPayload(item.memo));
      let updated = 0;
      let matched = 0;
      for (const id of linkedIds) {
        const memo = document.memos.find((candidate) => candidate.id === id);
        if (!memo) continue;
        matched += 1;
        if (syncFingerprint(notePayloadFromConcept(memo)) === fingerprint) continue;
        applyNotePayloadToConcept(memo, item.memo);
        memo.updatedAt = now;
        memo.source = {
          ...(memo.source || {}),
          syncFingerprint: fingerprint,
          syncedAt: now,
          status: "active",
        };
        updated += 1;
      }
      if (!matched) throw new Error("リンク済みの構想メモが見つかりません。");
      if (!updated) { completed = true; return; }

      document.updatedAt = now;
      await provider.writeText(file, `${JSON.stringify(document, null, 2)}\n`, file.eTag);
      state.conceptLoadedAt = 0;
      const liveItem = noteEntry.data.groups.flatMap((entry) => entry.items || []).find((entry) => entry.id === item.id);
      if (!liveItem) throw new Error("構想メモへ反映しましたが、元の項目が見つかりません。ノートを確認してください。");
      liveItem.memo.conceptMemoSyncFingerprint = fingerprint;
      liveItem.memo.conceptMemoSyncedAt = now;
      state.dirty = true;
      if (syncFingerprint(noteMemoPayload(liveItem.memo)) !== fingerprint) {
        throw new Error("構想メモへ反映しました。通信中の追加入力は未保存です。ノートを保存してください。");
      }
      if (!await saveCurrentNote({ automatic: true, skipConceptSync: true })) {
        throw new Error("構想メモへ反映しましたが、ノート側の同期情報は未保存です。ノートを保存してください。");
      }
      completed = true;
      notify(`${updated}件の構想メモへ項目メモを反映しました。`);
    } finally {
      state.noteManualSyncPending = false;
      state.syncing = false;
      elements.saveNoteButton.disabled = !state.dirty;
      if (completed) {
        const remainingConflict = state.currentNote.data.groups.some((group) => (group.items || []).some((item) =>
          shouldReflectNoteItem(state, item) && (item.memo.linkedConceptMemoIds || []).some((id) => {
            const memo = reflectedDocument.memos.find((memo) => memo.id === id);
            return !memo || !["synced", "note-changed"].includes(analyzeConceptNoteSync(memo, item.memo).status);
          })));
        setNoteStatus(remainingConflict ? "同期競合あり" : state.dirty ? "未保存" : "保存済み",
          remainingConflict ? "error" : state.dirty ? "dirty" : "");
      } else if (!state.externalConflict) {
        setNoteStatus(state.dirty ? "反映失敗・未保存あり" : "ノート保存済み・反映失敗", "error");
      }
    }
  }

  async function syncSavedNoteToConceptMemos(noteEntry, itemIds = null) {
    if (state.memoAutoReflectDefaults && state.memoAutoReflectDefaults.confirmed_note !== false) return syncNoteWithGlobalDefaults({ state, noteEntry, itemIds, writeTextWithBaseline, measure });
    if (state.noteToConceptAutoReflect === false) return { updated: 0, conflicts: 0 };
    const provider = state.provider;
    const work = state.selectedWork;
    noteEntry = structuredClone(noteEntry);
    const linkedItems = [];
    for (const group of noteEntry?.data?.groups || []) {
      for (const item of group?.items || []) {
        const ids = Array.isArray(item?.memo?.linkedConceptMemoIds) ? item.memo.linkedConceptMemoIds : [];
        if ((!itemIds || itemIds.includes(item.id)) && item?.kind === "entry" && item.memo?.autoSyncToConceptMemo && ids.length) linkedItems.push({ item, ids });
      }
    }
    if (!linkedItems.length || !state.selectedWork?.mojigoto) return { updated: 0, conflicts: 0 };

    const children = await provider.listChildren(work.mojigoto.id);
    const file = children.find((item) => item?.file && item.name === "concept-memos.json");
    if (!file) return { updated: 0, conflicts: 0 };
    const document = normalizeConceptDocument(JSON.parse(await provider.readText(file)));
    let updated = 0;
    let conflicts = 0;
    for (const linked of linkedItems) {
      for (const id of linked.ids) {
        const memo = document.memos.find((candidate) => candidate.id === id);
        if (!memo) continue;
        const analysis = analyzeConceptNoteSync(memo, linked.item.memo);
        if (analysis.status === "synced") continue;
        if (analysis.status !== "note-changed") {
          conflicts += 1;
          continue;
        }
        applyNotePayloadToConcept(memo, linked.item.memo);
        memo.updatedAt = new Date().toISOString();
        memo.source = {
          ...(memo.source || {}),
          syncFingerprint: analysis.noteFingerprint,
          syncedAt: memo.updatedAt,
          status: "active",
        };
        updated += 1;
      }
    }
    if (updated) {
      if (state.noteToConceptAutoReflect === false) return { updated: 0, conflicts: 0 };
      document.updatedAt = new Date().toISOString();
      await provider.writeText(file, `${JSON.stringify(document, null, 2)}\n`, file.eTag);
      if (state.selectedWork === work && state.provider === provider) state.conceptLoadedAt = 0;
    }
    return { updated, conflicts };
  }

  return { saveCurrentNote, createConceptFromNoteItem, reflectNoteItemToConceptMemos, syncSavedNoteToConceptMemos };
}
