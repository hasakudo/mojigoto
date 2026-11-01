import { normalizeRecentViews, homeRecentViews, recentViewsForWork, isRecentEditorRoute, updateRecentViews, updateWorkRecentViews } from "./recent-views.mjs";

// Persist safe screen references; rendering and concrete route restoration stay in the app.
export function createRecentViewHistory({
  state, localStorage, RECENT_VIEWS_KEY, WORK_RECENT_VIEWS_KEY,
  workCatalogOwner, readJson, routeWorkSnapshot, createWorkCatalogSnapshot,
  safeDriveItemSnapshot, renderRecentViews,
}) {
  function recentViewsStorageKey() {
    return `${RECENT_VIEWS_KEY}.${workCatalogOwner()}.${state.cloudKind}`;
  }

  function readRecentViews() {
    try {
      const storageKey = recentViewsStorageKey();
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) return normalizeRecentViews(readJson(saved), state.cloudKind);
      // 旧版の混在した履歴から、このクラウドの分だけを引き継ぐ。
      const legacy = readJson(localStorage.getItem(`${RECENT_VIEWS_KEY}.${workCatalogOwner()}`));
      const entries = normalizeRecentViews(legacy, state.cloudKind);
      if (entries.length) {
        try { localStorage.setItem(storageKey, JSON.stringify(entries)); } catch { /* 保存できない場合も表示する。 */ }
      }
      return entries;
    }
    catch { return []; }
  }

  function workRecentViewsStorageKey() {
    return `${WORK_RECENT_VIEWS_KEY}.${JSON.stringify([workCatalogOwner(), state.cloudKind, state.workRoot?.id, state.selectedWork?.id])}`;
  }

  function readHomeRecentViews() {
    const histories = [];
    try {
      const prefix = `${WORK_RECENT_VIEWS_KEY}.`;
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (!key?.startsWith(prefix)) continue;
        const identity = readJson(key.slice(prefix.length));
        if (!Array.isArray(identity) || identity[0] !== workCatalogOwner() || identity[1] !== state.cloudKind) continue;
        histories.push(recentViewsForWork(readJson(localStorage.getItem(key)), identity[1], identity[2], identity[3]));
      }
    } catch { /* 保存先を列挙できない場合は既存の履歴を表示する。 */ }
    return homeRecentViews(readRecentViews(), histories);
  }

  function readWorkRecentViews() {
    try {
      const saved = localStorage.getItem(workRecentViewsStorageKey());
      const entries = saved === null ? readRecentViews() : readJson(saved);
      return recentViewsForWork(entries, state.cloudKind, state.workRoot?.id, state.selectedWork?.id);
    } catch { return []; }
  }

  function recordRecentView(route) {
    if (!isRecentEditorRoute(route) || !state.workRoot?.id) return;
    // 本文・認証情報は保存せず、画面を再読込するための参照だけを残す。
    const entry = {
      cloudKind: state.cloudKind,
      root: { id: state.workRoot.id, name: state.workRoot.name, googleDriveScope: state.workRoot.googleDriveScope },
      route: {
        kind: route.kind,
        workId: route.workId,
        work: routeWorkSnapshot(createWorkCatalogSnapshot([route.work])[0]),
        noteType: route.noteType,
        noteTitle: route.kind === "note-editor" ? state.currentNote?.data?.title || "無題のノート" : undefined,
        item: safeDriveItemSnapshot(route.item),
        folder: safeDriveItemSnapshot(route.folder),
        trail: (route.trail || []).map(safeDriveItemSnapshot).filter(Boolean),
        memoId: route.memoId,
        memoTitle: route.kind === "concept-editor" ? state.currentConceptMemo?.title : undefined,
      },
      openedAt: new Date().toISOString(),
    };
    try { localStorage.setItem(workRecentViewsStorageKey(), JSON.stringify(updateWorkRecentViews(readWorkRecentViews(), entry))); }
    catch { /* 作品ごとの履歴を保存できなくても編集を続ける。 */ }
    try { localStorage.setItem(recentViewsStorageKey(), JSON.stringify(updateRecentViews(readRecentViews(), entry))); }
    catch { /* 履歴の保存失敗で編集を止めない。 */ }
    renderRecentViews();
  }
  return { recentViewsStorageKey, readRecentViews, workRecentViewsStorageKey, readHomeRecentViews, readWorkRecentViews, recordRecentView };
}

export function createRecentViewRestorer({
  state, localStorage, sessionStorage, PENDING_RECENT_VIEW_KEY, CLOUD_KIND_KEY,
  activateCloud, rootStorageKey, renderConnectedCloud, restoreRoute, showWorksHome,
  canDiscardDraft, cancelAutoSave, stopExternalMonitor, cloudAuth, workCatalogOwner,
}) {
  async function restoreRecentView(entry) {
    activateCloud(entry.cloudKind);
    state.worksLoadToken += 1;
    state.workMetricsLoadToken += 1;
    state.notesLoadToken += 1;
    state.works = []; // 別クラウドの同名IDを復元先に使わない。
    state.recentWorkCatalogPending = true;
    state.selectedWork = null;
    state.viewRoutes.clear();
    state.noteEntriesCache.clear();
    state.relatedNoteEntries.clear();
    state.workSettingsDocuments.clear();
    state.workRoot = entry.root;
    localStorage.setItem(rootStorageKey(), JSON.stringify(entry.root));
    renderConnectedCloud();
    state.historyInitialized = true;
    try {
      await state.provider.getItemMetadata(entry.route.work.folder);
      await restoreRoute(entry.route);
    } catch (error) {
      showWorksHome();
      throw new Error(`履歴の画面を開けませんでした。移動・削除やクラウドの接続先を確認してください。${error.message || ""}`);
    }
  }

  async function openRecentView(entry) {
    if (state.openingRecentView || !canDiscardDraft()) return false;
    state.openingRecentView = true;
    cancelAutoSave();
    stopExternalMonitor();
    state.dirty = false;
    try {
      const auth = cloudAuth(entry.cloudKind);
      if (!auth?.clientId) throw new Error("クラウドの接続設定を確認してください。");
      if (!await auth.getAccessToken()) {
        if (["oneDrive", "dropbox"].includes(entry.cloudKind)) {
          sessionStorage.setItem(PENDING_RECENT_VIEW_KEY, JSON.stringify({ owner: workCatalogOwner(), entry }));
          localStorage.setItem(CLOUD_KIND_KEY, entry.cloudKind);
          await auth.signIn();
          return;
        }
        await auth.signIn();
      }
      await restoreRecentView(entry);
      return true;
    } catch (error) {
      sessionStorage.removeItem(PENDING_RECENT_VIEW_KEY);
      throw error;
    } finally {
      state.openingRecentView = false;
    }
  }
  return { restoreRecentView, openRecentView };
}
