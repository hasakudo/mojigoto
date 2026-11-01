import { OneDriveConflictError } from "../storage/onedrive-provider.mjs?v=1.0.1";
import { normalizeNote } from "./notes.mjs";
import { normalizeConceptDocument } from "./concept-memos.mjs";

export function createBackupRestoreController({
  state, elements, window, requestAnimationFrame, currentBackupTarget, noteBackupTarget, conceptMemoBackupTarget, manuscriptBackupTarget,
  cancelAutoSave, setBusy, readWebBackupSnapshot, formatDate, createWebManuscriptBackup, notify, setEditorStatus,
  renderNoteEditor, setNoteStatus, updateNoteIndex, openConceptMemo, refreshConceptFilterOptions, renderConceptMemosList,
  commitRoute, routeForWork, setConceptStatus, updateReaderMeta, makeWritingEvent, countCharacters, appendWritingEvent,
  updateSharedWorkMetrics, renderManuscriptBackupHistory, onManuscriptRestored = () => {},
}) {
  async function restoreWebManuscriptBackup(storage, entry, triggerButton = null) {
    if (state.saving || state.syncing) return;
    const provider = state.provider;
    const work = state.selectedWork;
    const initialTarget = currentBackupTarget();
    const restoreConceptList = initialTarget.targetType === "conceptMemo" && !elements.conceptMemosSection.hidden;
    const freshTarget = () => initialTarget.targetType === "note" ? noteBackupTarget()
      : initialTarget.targetType === "conceptMemo" ? conceptMemoBackupTarget() : manuscriptBackupTarget();
    const target = freshTarget();
    const isCurrentTarget = () => state.provider === provider && state.selectedWork === work
      && freshTarget().item?.id === target.item?.id;
    state.syncing = true;
    cancelAutoSave();
    const button = triggerButton || elements.restoreComparedBackupButton;
    const previousStatus = elements.manuscriptBackupStatus.textContent;
    setBusy(button, true, "読込中…");
    elements.manuscriptBackupStatus.textContent = "復元するバックアップを読み込んでいます…";
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const snapshot = await readWebBackupSnapshot(storage, entry);
      if (!isCurrentTarget() || freshTarget().content !== target.content) throw new Error("復元の読込中に編集内容が変わりました。入力を保持して復元を中止しました。");
      if (!window.confirm(`${formatDate(entry.createdAt)} の内容へ復元します。\n現在の内容は復元直前バックアップとして保存されます。`)) return;
      setBusy(button, true, "復元中…");
      elements.manuscriptBackupStatus.textContent = "バックアップから復元しています…";
      await createWebManuscriptBackup("before-restore", target.content, target);
      if (!isCurrentTarget() || freshTarget().content !== target.content) throw new Error("復元前の退避中に編集内容が変わりました。入力を保持して復元を中止しました。");
      const restoredContent = String(snapshot.content || "");
      const saved = await provider.writeText(target.item, restoredContent, target.item.eTag);
      if (!isCurrentTarget()) throw new Error("復元は保存しましたが、表示対象が変わったため画面は更新していません。作品を読み直してください。");
      if (freshTarget().content !== target.content) {
        if (target.targetType === "note") {
          state.currentNote.item = { ...target.item, ...saved };
          state.currentNote.raw = restoredContent;
        } else if (target.targetType === "conceptMemo") {
          state.conceptFile = { ...target.item, ...saved };
          work.conceptFile = state.conceptFile;
          state.conceptOriginalContent = restoredContent;
        } else {
          state.currentFile = { ...target.item, ...saved };
          state.originalContent = restoredContent;
        }
        state.dirty = true;
        notify("復元は保存しましたが、処理中の追加入力は未保存として保持しています。内容を確認して保存してください。", true);
        return;
      }
      if (target.targetType === "note") {
        const data = normalizeNote(JSON.parse(restoredContent), state.noteType);
        state.currentNote = { item: { ...target.item, ...saved }, data, raw: restoredContent };
        state.dirty = false;
        state.externalConflict = false;
        elements.saveNoteButton.disabled = true;
        renderNoteEditor();
        setNoteStatus("保存済み");
        updateNoteIndex(state.currentNote.item, data);
      } else if (target.targetType === "conceptMemo") {
        const currentMemoId = state.currentConceptMemo?.id;
        state.conceptFile = { ...target.item, ...saved };
        state.conceptDocument = normalizeConceptDocument(JSON.parse(restoredContent));
        state.conceptOriginalContent = restoredContent;
        state.selectedWork.conceptFile = state.conceptFile;
        state.dirty = false;
        state.externalConflict = false;
        const restoredMemo = state.conceptDocument.memos.find((memo) => memo.id === currentMemoId) || state.conceptDocument.memos[0];
        if (restoredMemo && !restoreConceptList) openConceptMemo(restoredMemo.id, { resetScroll: false });
        else {
          state.currentConceptMemo = null;
          elements.conceptMemoEditorSection.hidden = true;
          elements.conceptMemosSection.hidden = false;
          refreshConceptFilterOptions();
          renderConceptMemosList();
          commitRoute(routeForWork("concept-list"));
        }
        setConceptStatus("保存済み");
      } else {
        const beforeContent = state.originalContent;
        state.currentFile = { ...target.item, ...saved };
        state.originalContent = restoredContent;
        state.dirty = false;
        state.externalConflict = false;
        elements.readerContent.value = restoredContent;
        onManuscriptRestored();
        elements.saveFileButton.disabled = true;
        updateReaderMeta(state.currentFile);
        setEditorStatus("保存済み");
        const event = makeWritingEvent({ file: target.relativePath, beforeCount: countCharacters(beforeContent), afterCount: countCharacters(restoredContent) });
        appendWritingEvent(provider, work?.mojigoto, event).catch((error) => {
          notify(`原稿は復元しましたが、執筆記録を保存できませんでした: ${error.message}`, true);
        });
        updateSharedWorkMetrics({ beforeContent, afterContent: restoredContent });
      }
      state.activeBackupTarget = target.targetType === "note"
        ? noteBackupTarget()
        : target.targetType === "conceptMemo"
          ? conceptMemoBackupTarget()
          : manuscriptBackupTarget();
      notify(`バックアップから${target.targetType === "conceptMemo" ? "構想メモ" : target.targetType === "note" ? "ノート" : "原稿"}を復元しました。`);
      refreshBackupHistoryAfterSave("復元しました。");
    } catch (error) {
      if (error instanceof OneDriveConflictError || error?.code === "conflict") {
        state.externalConflict = true;
        setEditorStatus("競合あり", "error");
        elements.manuscriptBackupDialog.close();
        elements.conflictDialog.showModal();
      } else {
        notify(error.message || "バックアップを復元できませんでした。", true);
      }
    } finally {
      state.syncing = false;
      setBusy(button, false);
      if (["復元するバックアップを読み込んでいます…", "バックアップから復元しています…"].includes(elements.manuscriptBackupStatus.textContent)) {
        elements.manuscriptBackupStatus.textContent = previousStatus;
      }
    }
  }

  function refreshBackupHistoryAfterSave(message) {
    const provider = state.provider;
    const work = state.selectedWork;
    elements.manuscriptBackupStatus.textContent = `${message} 履歴を更新しています…`;
    renderManuscriptBackupHistory().catch((error) => {
      if (state.provider !== provider || state.selectedWork !== work || !elements.manuscriptBackupDialog.open) return;
      elements.manuscriptBackupStatus.textContent = `${message} 履歴の更新に失敗しました。`;
      notify(`${message}\n履歴を更新できませんでした。パネルを開き直してください。\n${error.message || String(error)}`, true);
    });
  }
  return { restoreWebManuscriptBackup, refreshBackupHistoryAfterSave };
}
