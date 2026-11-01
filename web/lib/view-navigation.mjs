// Browser routes and restoration sequencing; screen loaders and UI remain injected.
export function createViewNavigationController({
  state, elements, history, window, requestAnimationFrame, document = window.document,
  setTimeout = (callback, delay) => globalThis.setTimeout(callback, delay), clearTimeout = (id) => globalThis.clearTimeout(id),
  updateShellContext, recordRecentView, resetReaderNoteReference, showWorksHome,
  showManuscriptRouteLoading, showNoteEditorLoading, openManuscriptFolder, openFile,
  openNotes, openNote, openConceptMemos, openConceptMemo, openWorkSettings,
  canDiscardDraft, cancelAutoSave, notify, finishViewRestoreLoading,
}) {
  function routeDestination(route) {
    if (["manuscript-list", "manuscript-file"].includes(route?.kind)) return "manuscript";
    if (["notes-list", "note-editor"].includes(route?.kind)) return route.noteType === "reference" ? "reference" : "plot";
    if (["concept-list", "concept-editor"].includes(route?.kind)) return "concept";
    if (route?.kind === "settings") return "settings";
    return "";
  }

  function routeSignature(route) {
    return [
      route?.kind || "",
      route?.workId || "",
      route?.noteType || "",
      route?.folder?.id || "",
      route?.item?.id || "",
      route?.memoId || "",
    ].join("|");
  }

  function routeWorkSnapshot(work = state.selectedWork) {
    if (!work?.id) return null;
    const keys = [
      "id", "name", "title", "status", "folder", "mojigoto", "manuscript",
      "settingsFile", "metricsFile", "conceptFile", "mojigotoChildren",
      "updatedAt", "manuscriptUpdatedAt", "contentUpdatedAt",
    ];
    return Object.fromEntries(keys.filter((key) => work[key] !== undefined).map((key) => [key, work[key]]));
  }

  function isRestorableWorkSnapshot(work) {
    return Boolean(
      work?.id
      && work?.folder?.id
      && (work?.manuscript?.id || work?.mojigoto?.id),
    );
  }

  function positionSection(route) {
    return route?.kind === "note-editor" ? elements.noteEditorSection
      : route?.kind === "concept-editor" ? elements.conceptMemoEditorSection : null;
  }

  function positionField(route, descriptor) {
    const section = positionSection(route);
    if (!section || !descriptor) return null;
    if (descriptor.id) {
      const field = document?.getElementById(descriptor.id);
      return section.contains(field) ? field : null;
    }
    if (route.kind !== "note-editor") return null;
    return [...section.querySelectorAll("[data-note-field]")].find(field => {
      const group = state.currentNote?.data?.groups?.[Number(field.dataset.groupIndex)];
      const item = group?.items?.[Number(field.dataset.itemIndex)];
      return field.dataset.noteField === descriptor.field && group?.id === descriptor.groupId
        && (!descriptor.itemId || item?.id === descriptor.itemId);
    }) || null;
  }

  function captureRoutePosition(route) {
    const current = history.state?.mojigotoRoute;
    const position = { ...(routeSignature(current) === routeSignature(route) ? current?.position : {}), windowScrollY: window.scrollY };
    if (route?.kind === "manuscript-file") {
      position.editorScrollTop = elements.readerContent.scrollTop;
      position.selectionStart = elements.readerContent.selectionStart;
      position.selectionEnd = elements.readerContent.selectionEnd;
    }
    const section = positionSection(route);
    const active = document?.activeElement;
    if (section?.contains(active) && typeof active.selectionStart === "number") {
      const group = state.currentNote?.data?.groups?.[Number(active.dataset?.groupIndex)];
      const item = group?.items?.[Number(active.dataset?.itemIndex)];
      const descriptor = active.id ? { id: active.id } : group && active.dataset.noteField
        ? { field: active.dataset.noteField, groupId: group.id, itemId: item?.id } : null;
      if (descriptor) {
        position.editorField = descriptor;
        position.fieldSelectionStart = active.selectionStart;
        position.fieldSelectionEnd = active.selectionEnd;
        position.fieldScrollTop = active.scrollTop;
      }
    }
    const field = positionField(route, position.editorField);
    if (field?.getBoundingClientRect) position.fieldViewportTop = field.getBoundingClientRect().top;
    return position;
  }

  function rememberRoute(route) {
    const destination = routeDestination(route);
    if (!destination || !route?.workId) return;
    state.viewRoutes.set(`${route.workId}:${destination}`, route);
  }

  let positionTimer = null;
  function cancelPositionCapture() {
    if (positionTimer !== null) clearTimeout(positionTimer);
    positionTimer = null;
  }
  function scheduleRoutePositionCapture() {
    if (positionTimer !== null) return;
    positionTimer = setTimeout(() => { positionTimer = null; rememberCurrentRoutePosition(); }, 500);
  }
  function rememberCurrentRoutePosition() {
    cancelPositionCapture();
    if (state.navigationRestoring || state.navigationDestination) return;
    const route = history.state?.mojigotoRoute;
    if (!route) return;
    if (route.kind === "manuscript-file" && (elements.readerSection?.hidden
        || state.currentFile?.id !== route.item?.id)) return;
    const positioned = { ...route, position: captureRoutePosition(route) };
    if (JSON.stringify(route.position) === JSON.stringify(positioned.position)) return;
    try {
      history.replaceState({ ...(history.state || {}), mojigotoRoute: positioned }, "");
      rememberRoute(positioned);
    } catch { /* Position persistence must not interrupt editing. */ }
  }

  function commitRoute(route, { replace = false } = {}) {
    updateShellContext();
    if (state.navigationRestoring || !route) return;
    const previous = history.state?.mojigotoRoute;
    if (previous) {
      const positioned = { ...previous, position: previous.position || captureRoutePosition(previous) };
      history.replaceState({ ...(history.state || {}), mojigotoRoute: positioned }, "");
      rememberRoute(positioned);
    }
    const next = { ...route, position: route.position
      || (previous && routeSignature(previous) === routeSignature(route) ? previous.position : null)
      || { windowScrollY: 0 } };
    rememberRoute(next);
    recordRecentView(next);
    if (replace || !previous || routeSignature(previous) === routeSignature(next)) {
      history.replaceState({ ...(history.state || {}), mojigotoRoute: next }, "");
    } else {
      history.pushState({ mojigotoRoute: next }, "");
    }
  }

  function routeForWork(kind, extra = {}) {
    return {
      kind,
      workId: String(state.selectedWork?.id || ""),
      work: routeWorkSnapshot(),
      ...extra,
    };
  }

  async function selectRouteWork(route) {
    if (!route?.workId) return true;
    const work = state.works.find((candidate) => String(candidate.id || "") === String(route.workId))
      || (String(route.work?.id || "") === String(route.workId) && isRestorableWorkSnapshot(route.work)
        ? route.work
        : null);
    if (!work) return false;
    if (state.selectedWork?.id !== work.id) {
      resetReaderNoteReference();
      state.selectedWork = work;
      state.noteFolders = {};
      state.notes = [];
      state.conceptDocument = null;
      state.conceptFile = null;
      state.conceptOriginalContent = "";
      state.conceptWorkId = "";
      state.conceptLoadedAt = 0;
      state.manuscriptBackupStorage = null;
    }
    return true;
  }

  function restoreRoutePosition(route) {
    requestAnimationFrame(() => {
      if (route?.kind === "manuscript-file") {
        const start = Number(route.position?.selectionStart || 0);
        const end = Number(route.position?.selectionEnd ?? start);
        elements.readerContent.setSelectionRange(start, end);
        elements.readerContent.scrollTop = Number(route.position?.editorScrollTop || 0);
      }
      let top = Number(route?.position?.windowScrollY || 0);
      const field = positionField(route, route?.position?.editorField);
      if (field && typeof field.setSelectionRange === "function") {
        for (let parent = field.parentElement; parent && parent !== positionSection(route); parent = parent.parentElement) {
          if (parent.tagName === "DETAILS") parent.open = true;
        }
        field.focus({ preventScroll: true });
        const start = Number(route.position.fieldSelectionStart || 0);
        field.setSelectionRange(start, Number(route.position.fieldSelectionEnd ?? start));
        field.scrollTop = Number(route.position.fieldScrollTop || 0);
        if (Number.isFinite(route.position.fieldViewportTop) && field.getBoundingClientRect) {
          top = window.scrollY + field.getBoundingClientRect().top - route.position.fieldViewportTop;
        }
      }
      window.scrollTo({ top, behavior: "auto" });
    });
  }

  async function restoreRoute(route, { fromHistory = false } = {}) {
    if (!route || !await selectRouteWork(route)) return showWorksHome();
    const previousDestination = state.navigationDestination;
    const previousDetailEditor = state.navigationDetailEditor;
    state.navigationDestination = routeDestination(route);
    state.navigationDetailEditor = ["manuscript-file", "note-editor", "concept-editor", "settings"].includes(route.kind);
    state.navigationRestoring = true;
    updateShellContext();
    try {
      if (route.kind === "works") showWorksHome();
      else if (route.kind === "manuscript-list") await openManuscriptFolder(route.folder || state.selectedWork.manuscript, route.trail || []);
      else if (route.kind === "manuscript-file") {
        state.manuscriptFolder = route.folder || state.selectedWork.manuscript;
        state.manuscriptTrail = route.trail || [];
        showManuscriptRouteLoading(route.item);
        const metadata = await state.provider.getItemMetadata(route.item);
        await openFile({ ...route.item, ...metadata });
      } else if (route.kind === "notes-list") await openNotes(route.noteType);
      else if (route.kind === "note-editor") {
        state.noteType = route.noteType === "reference" ? "reference" : "plot";
        showNoteEditorLoading();
        const metadata = await state.provider.getItemMetadata(route.item);
        await openNote({ item: { ...route.item, ...metadata } });
      } else if (route.kind === "concept-list") await openConceptMemos();
      else if (route.kind === "concept-editor") {
        await openConceptMemos({ reveal: false });
        if (!state.conceptDocument?.memos?.some((memo) => memo.id === route.memoId)) throw new Error("構想メモが見つかりません。");
        openConceptMemo(route.memoId, { resetScroll: false });
      } else if (route.kind === "settings") await openWorkSettings();
      else showWorksHome();
    } finally {
      state.navigationRestoring = false;
      state.navigationDestination = previousDestination;
      state.navigationDetailEditor = previousDetailEditor;
      updateShellContext();
    }
    restoreRoutePosition(route);
    if (!fromHistory) commitRoute(route);
  }

  async function navigateWorkDestination(destination) {
    if (!canDiscardDraft()) return;
    if (state.dirty) {
      cancelAutoSave();
      state.dirty = false;
    }
    const key = `${state.selectedWork?.id || ""}:${destination}`;
    const remembered = state.viewRoutes.get(key);
    if (remembered) return restoreRoute(remembered);
    state.navigationDestination = destination;
    updateShellContext();
    try {
      if (destination === "manuscript") {
        if (!state.selectedWork?.manuscript) return notify("原稿フォルダがありません。", true);
        return await openManuscriptFolder(state.selectedWork.manuscript, []);
      }
      if (destination === "plot" || destination === "reference") return await openNotes(destination);
      if (destination === "concept") return await openConceptMemos();
      if (destination === "settings") return await openWorkSettings();
    } finally {
      state.navigationDestination = "";
      updateShellContext();
    }
  }

  function initializeViewHistory() {
    if (state.historyInitialized) {
      commitRoute({ kind: "works" });
      return;
    }
    state.historyInitialized = true;
    const savedRoute = history.state?.mojigotoRoute;
    if (savedRoute?.kind && savedRoute.kind !== "works") {
      const work = state.works.find((candidate) => String(candidate.id || "") === String(savedRoute.workId || ""));
      if (!work) {
        finishViewRestoreLoading();
        commitRoute({ kind: "works" }, { replace: true });
        return;
      }
      const restoredRoute = { ...savedRoute, work: routeWorkSnapshot(work) };
      history.replaceState({ ...(history.state || {}), mojigotoRoute: restoredRoute }, "");
      restoreRoute(restoredRoute, { fromHistory: true }).catch((error) => {
        notify(error.message || "前回の画面を復元できませんでした。", true);
        showWorksHome();
      }).finally(finishViewRestoreLoading);
      return;
    }
    finishViewRestoreLoading();
    commitRoute({ kind: "works" }, { replace: true });
  }

  function handlePopState(event) {
    cancelPositionCapture();
    const route = event.state?.mojigotoRoute;
    if (!route || !state.provider) return;
    if (!canDiscardDraft()) {
      history.forward();
      return;
    }
    cancelAutoSave();
    state.dirty = false;
    restoreRoute(route, { fromHistory: true }).catch((error) => {
      notify(error.message || "前の画面へ戻れませんでした。", true);
    });
  }
  return { scheduleRoutePositionCapture, rememberCurrentRoutePosition, routeDestination, routeSignature, routeWorkSnapshot, isRestorableWorkSnapshot, captureRoutePosition, rememberRoute, commitRoute, routeForWork, selectRouteWork, restoreRoutePosition, restoreRoute, navigateWorkDestination, initializeViewHistory, handlePopState };
}
