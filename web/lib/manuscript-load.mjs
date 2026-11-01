// Preserve the current editor while reading, then apply only a still-current response.
export function createManuscriptLoadController({
  state, elements, beginPerformanceMeasurement, cancelAutoSave, stopExternalMonitor,
  hideConceptViews, formatSize, formatDate, renderInputAssistVisibility, updateReaderMeta,
  setEditorStatus, startExternalMonitor, commitRoute, routeForWork,
  onLoaded = () => {},
  requestAnimationFrame = (callback) => globalThis.requestAnimationFrame(callback),
}) {
  async function openFile(file, { content: loadedContent, location } = {}) {
    if (state.saving || state.deleting) return false;
    const provider = state.provider;
    const previousTarget = state.currentSettings || state.currentConceptMemo || state.currentNote || state.currentFile;
    const previousWork = state.selectedWork;
    const previousContent = elements.readerContent.value;
    const request = ++state.fileLoadRequest;
    const finishMeasurement = beginPerformanceMeasurement("原稿ファイル表示", {
      size: Number(file?.size || 0),
    });
    // Keep the current editor intact until the new content is available. A late
    // response must not replace input, a completed save, or a newer navigation.
    let content;
    try {
      content = loadedContent ?? await provider.readText(file);
    } catch (error) {
      finishMeasurement();
      throw error;
    }
    const liveTarget = state.currentSettings || state.currentConceptMemo || state.currentNote || state.currentFile;
    if (request !== state.fileLoadRequest || state.provider !== provider || liveTarget !== previousTarget
        || state.selectedWork !== previousWork || state.saving || elements.readerContent.value !== previousContent) {
      finishMeasurement();
      return false;
    }
    cancelAutoSave();
    stopExternalMonitor();
    elements.browserSection.hidden = true;
    elements.worksSection.hidden = true;
    elements.filesSection.hidden = true;
    elements.notesSection.hidden = true;
    elements.noteEditorSection.hidden = true;
    hideConceptViews();
    elements.readerSection.hidden = false;
    elements.readerTitle.textContent = file.name;
    elements.readerMeta.textContent = `${formatSize(file.size)} ・ ${formatDate(file.lastModifiedDateTime)}`;
    elements.readerContent.disabled = true;
    setEditorStatus("読み込み中", "saving");
    onLoaded();
    if (location) { state.manuscriptFolder = location.folder; state.manuscriptTrail = [...location.trail]; }
    state.currentFile = file;
    state.currentNote = null;
    state.activeAssistTarget = elements.readerContent;
    state.originalContent = content;
    state.dirty = false;
    state.externalConflict = false;
    elements.readerContent.value = content;
    elements.readerContent.disabled = false;
    elements.saveFileButton.disabled = true;
    elements.readerContent.classList.remove("is-scrolling");
    elements.readerJumpControls.classList.remove("is-scrolling");
    elements.autoSaveToggle.checked = state.autoSaveEnabled;
    elements.readerCountMode.value = state.countMode;
    renderInputAssistVisibility();
    updateReaderMeta(file);
    setEditorStatus("保存済み");
    elements.readerContent.focus({ preventScroll: true });
    elements.readerContent.setSelectionRange(0, 0);
    elements.readerContent.scrollTop = 0;
    requestAnimationFrame(() => {
      if (state.currentFile?.id !== file.id) return;
      elements.readerContent.setSelectionRange(0, 0);
      elements.readerContent.scrollTop = 0;
    });
    finishMeasurement();
    startExternalMonitor();
    commitRoute(routeForWork("manuscript-file", {
      item: state.currentFile,
      folder: state.manuscriptFolder,
      trail: state.manuscriptTrail,
    }));
    return true;
  }

  return { openFile };
}
