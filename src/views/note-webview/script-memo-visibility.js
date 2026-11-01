function getNoteMemoVisibilityScript() {
  return `
    const openNoteItemMemoIds = new Set();
    function isNoteItemMemoOpen(itemId) { return openNoteItemMemoIds.has(String(itemId || "")); }
    function setNoteItemMemoOpen(itemId, open) {
      const id = String(itemId || "");
      if (!id) return;
      if (open) openNoteItemMemoIds.add(id);
      else openNoteItemMemoIds.delete(id);
    }
    function noteMemoEntries() {
      return (state.groups || []).flatMap(group => (group.items || []).filter(item => item.kind !== "divider"));
    }
    function updateNoteMemoVisibilityControls() {
      const entries = noteMemoEntries();
      const known = new Set(entries.map(item => String(item.id)));
      for (const id of openNoteItemMemoIds) if (!known.has(id)) openNoteItemMemoIds.delete(id);
      const memos = entries.filter(item => String(item.memo?.body || "").trim() || item.memo?.tags?.length);
      document.querySelectorAll('[data-note-memo-action="open"]').forEach(button => {
        button.disabled = !memos.some(item => !isNoteItemMemoOpen(item.id));
      });
      document.querySelectorAll('[data-note-memo-action="close"]').forEach(button => {
        button.disabled = !openNoteItemMemoIds.size;
      });
    }
    function restoreNoteListMemoState() {
      previewRoot.querySelectorAll(".noteDisplayMemo").forEach(detail => {
        const id = String(detail.dataset.displayKey || "").slice("memo:".length);
        detail.open = isNoteItemMemoOpen(id);
      });
    }
    function setAllNoteItemMemosOpen(open) {
      if (open) {
        noteMemoEntries().forEach(item => {
          if (String(item.memo?.body || "").trim() || item.memo?.tags?.length) setNoteItemMemoOpen(item.id, true);
        });
      } else openNoteItemMemoIds.clear();
      renderGroups();
      renderPreview();
    }
    function registerNoteMemoVisibilityEvents() {
      document.querySelectorAll("[data-note-memo-action]").forEach(button => {
        button.addEventListener("click", () => setAllNoteItemMemosOpen(button.dataset.noteMemoAction === "open"));
      });
      previewRoot.addEventListener("toggle", event => {
        const detail = event.target;
        if (!detail.matches?.("details.noteDisplayMemo") || !previewRoot.contains(detail)) return;
        const key = String(detail.dataset.displayKey || "");
        if (!key.startsWith("memo:")) return;
        const id = key.slice("memo:".length);
        if (isNoteItemMemoOpen(id) === detail.open) return;
        setNoteItemMemoOpen(id, detail.open);
        renderGroups();
        updateNoteMemoVisibilityControls();
      }, true);
      updateNoteMemoVisibilityControls();
    }
  `;
}

module.exports = { getNoteMemoVisibilityScript };
