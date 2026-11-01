function getPreviewLayoutScript() {
  return `
    let previewLayoutFrame = null;
    let initialNoteScrollRestoreStarted = false;
    function stabilizePreviewRender() {
      if (document.hidden || previewLayoutFrame !== null) return;
      previewLayoutFrame = requestAnimationFrame(() => {
        previewLayoutFrame = null;
        if (document.hidden) return;
        ensurePreviewScrollInRange();
        if (!initialNoteScrollRestoreStarted) {
          initialNoteScrollRestoreStarted = true;
          loadScrollPositions();
        }
      });
    }
  `;
}

module.exports = { getPreviewLayoutScript };
