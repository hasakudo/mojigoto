function getDisplaySyncScript() {
  return `
    let noteDisplaySession = "";
    let noteDisplaySequence = 0;
    let noteDisplayActive = false;
    let noteDisplayTimer = null;
    function sendNoteDisplaySnapshot() {
      if (noteDisplayTimer) clearTimeout(noteDisplayTimer);
      noteDisplayTimer = null;
      if (!noteDisplayActive) return;
      vscode.postMessage({ type:"noteDisplay.snapshot", session:noteDisplaySession,
        sequence:++noteDisplaySequence, note:collectPayload(), dirty,
        warning:toastStatusEl?.classList.contains("isError") ? toastStatusTextEl.textContent : "" });
    }
    function queueNoteDisplaySnapshot() {
      if (!noteDisplayActive || noteDisplayTimer) return;
      noteDisplayTimer = setTimeout(sendNoteDisplaySnapshot, 150);
    }
    window.addEventListener("message", ({data}) => {
      if (data?.type === "noteDisplay.focus") {
        const target = data.target || {};
        const group = state.groups.find(group => group.id === target.groupId);
        if (!group || (target.itemId && !group.items?.some(item => item.id === target.itemId))) {
          setStatus("対象の項目が見つかりません。目次を確認し直してください。", true, true);
          return;
        }
        closeBoard();
        scrollToEditorNavId(target.itemId ? "item:" + target.itemId : "group:" + target.groupId, { immediate:true });
        return;
      }
      if (data?.type === "noteDisplay.opened") {
        if (data.opened === true && data.returnToEditor === true) closeBoard();
        return;
      }
      if (data?.type !== "noteDisplay.request") return;
      if (noteDisplaySession !== data.session) { noteDisplaySession = data.session; noteDisplaySequence = 0; }
      noteDisplayActive = data.active === true;
      sendNoteDisplaySnapshot();
    });
    document.getElementById("openPreviewTabBtn")?.addEventListener("click", () => openNoteDisplayTab(previewMode));
    document.getElementById("openBoardTabBtn")?.addEventListener("click", () => openNoteDisplayTab("board", true));
    function openNoteDisplayTab(mode, returnToEditor = false) {
      vscode.postMessage({type:"noteDisplay.open", mode, returnToEditor});
    }
  `;
}
module.exports = { getDisplaySyncScript };
