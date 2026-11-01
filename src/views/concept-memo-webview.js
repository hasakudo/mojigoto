const { createConceptMemoMessageHandler } = require("./concept-memo/host-actions");
const { createConceptMemoPanelLifecycle } = require("./concept-memo/host-lifecycle");
const { buildConceptMemoDataFromMessage } = require("./concept-memo/edit-message");
const vscode = require("vscode");
const { registerRestorableWebview, withRestoredWebviews, webviewFileKey } = require("./shared/restored-webviews");
const path = require("path");
const { isSingleMode } = require("../core/mojigoto-context");
const { triggerStatsRefresh } = require("../stats/stats-utils");
const {
  createEmptyConceptMemos,
  createConceptMemoDraft,
  readConceptMemos,
  writeConceptMemos,
} = require("../data/concept-memo-store");
const { applyConceptMemoToNoteItem, readNoteFile } = require("../data/note-store");
const { refreshConceptSourceStatuses } = require("../data/concept-source-status");
const { readConceptNoteIndex } = require("../data/concept-note-order");
const { notePayloadFromConcept, syncFingerprint } = require("../data/concept-sync");
const { isConceptMemoAutoSyncEnabled } = require("../data/memo-auto-sync");
const {
  readCommonTodoItems,
  writeCommonTodoItems,
} = require("../data/common-todo-store");
const {
  getMojigotoDirForSingle,
  getMojigotoDirForWork,
} = require("../core/mojigoto-paths");
const {
  getConceptMemoWebviewHtml,
} = require("./concept-memo/concept-memo-html");
const { resolveActualNotePath } = require("../core/mojigoto-paths");
const { setWebviewPanelThemeIcon } = require("./shared/webview-panel-icon");
const { MOJIGOTO_ICONS } = require("../ui/mojigoto-icons");
const {
  getWorkSettingsForDirectory,
} = require("../work/work-settings");
const {
  createStructuredBackup,
  openStructuredBackupHistory,
} = require("../backup/structured-data-backup");

const openConceptMemoPanels = new Map();

function getWebviewUiSettings() {
  const config = vscode.workspace.getConfiguration("mojigoto");
  const fontScalePercent = Math.min(
    160,
    Math.max(80, Number(config.get("webviewFontScalePercent", 100)) || 100),
  );
  const autoSaveDelaySeconds = Math.min(
    30,
    Math.max(0.3, Number(config.get("webviewAutoSaveDelaySeconds", 0.8)) || 0.8),
  );

  return {
    fontScale: fontScalePercent / 100,
    autoSaveEnabled: config.get("webviewAutoSaveEnabled", true) !== false,
    autoSaveDelayMs: Math.round(autoSaveDelaySeconds * 1000),
    conceptMemoAutoSyncDefault:
      config.get("conceptMemoAutoSyncEnabled", false) === true,
  };
}

async function readConceptMemosWithSharedTodo(filePath) {
  const data = await refreshConceptSourceStatuses(await readConceptMemos(filePath), {
    readNoteFile,
    resolveNotePath: (notePath, type) => resolveActualNotePath(notePath, path.dirname(path.dirname(filePath)), type),
  });
  let commonTodoItems;

  try {
    commonTodoItems = await readCommonTodoItems({
      legacyConceptMemoPaths: [filePath],
    });
  } catch (error) {
    console.error("[mojigoto] shared common TODO read failed:", error);
    commonTodoItems = Array.isArray(data?.commonTodoItems)
      ? data.commonTodoItems
      : [];
  }

  return {
    ...data,
    commonTodoItems,
  };
}

function resolveConceptMemoFilePath(workDir = "") {
  const mojigotoDir = isSingleMode()
    ? getMojigotoDirForSingle()
    : getMojigotoDirForWork(workDir);

  return path.join(mojigotoDir, "concept-memos.json");
}

function buildConceptMemoBootState(options = {}) {
  const initialQuickFilters = options?.initialQuickFilters || null;
  const legacyQuickFilter = String(options?.initialQuickFilter || "").trim();

  return {
    filePath: String(options?.filePath || ""),
    workDir: String(options?.workDir || ""),
    workTitle: String(options?.workTitle || ""),
    selectedMemoId: String(options?.selectedMemoId || ""),
    initialQuickFilters: initialQuickFilters || {
      type: legacyQuickFilter === "text" ? "text" : "",
      state: legacyQuickFilter === "archived" ? ["archived"] : [],
      source:
        legacyQuickFilter === "hasSource" ||
        legacyQuickFilter === "cleared" ||
        legacyQuickFilter === "missing"
          ? legacyQuickFilter
          : "",
    },
    data: options?.data || createEmptyConceptMemos(),
    uiSettings: getWebviewUiSettings(),
  };
}

function getConceptMemoPanelTitle(options = {}) {
  const workTitle = String(options?.workTitle || "").trim();
  if (workTitle) {
    return `構想メモ: ${workTitle}`;
  }

  const workDir = String(options?.workDir || "").trim();
  if (workDir) {
    const folderName = path.basename(workDir).trim();
    if (folderName) {
      return `構想メモ: ${folderName}`;
    }
  }

  return "構想メモ";
}

function resolveConceptMemoWorkIdentity(options = {}) {
  let workDir = String(options.workDir || "").trim();
  if (!workDir && options.filePath) {
    const dataDir = path.dirname(options.filePath);
    if (path.basename(dataDir).toLowerCase() === ".mojigoto") workDir = path.dirname(dataDir);
  }
  // Resolve the restored tab's own work, independently of the currently active work.
  const settings = workDir ? getWorkSettingsForDirectory(workDir) : null;
  const workTitle = String(settings?.title || "").trim()
    || String(settings?.folderName || "").trim()
    || String(options.workTitle || "").trim()
    || (workDir ? path.basename(workDir) : "");
  return { workDir, workTitle };
}

function attachConceptMemoPanel(context, treeProvider, panel, options = {}) {
  const {
    filePath,
    workDir = "",
    workTitle = "",
    title = getConceptMemoPanelTitle(options),
    initialData = createEmptyConceptMemos(),
    selectedMemoId = "",
    initialQuickFilters = {
      type: "",
      state: [],
      source: "",
    },
  } = options;

  setWebviewPanelThemeIcon(panel, MOJIGOTO_ICONS.conceptMemo);

  const conceptMemoFilePathKey = path.normalize(filePath);

  openConceptMemoPanels.set(filePath, panel);
  openConceptMemoPanels.set(conceptMemoFilePathKey, panel);

  panel.webview.options = {
    enableScripts: true,
    retainContextWhenHidden: true,
  };

  panel.title = title;
  panel.__mojigotoConceptMemoFilePath = filePath;
  panel.__mojigotoConceptMemoWorkDir = workDir;
  panel.__mojigotoConceptMemoWorkTitle = workTitle;
  panel.webview.html = getConceptMemoWebviewHtml(
    panel.webview,
    buildConceptMemoBootState({
      filePath,
      workDir,
      workTitle,
      selectedMemoId,
      initialQuickFilters,
      data: initialData,
    }),
  );

  const lifecycle = createConceptMemoPanelLifecycle(panel);
  panel.__mojigotoConceptMemoLifecycle = lifecycle;
  function postMessage(message) { return lifecycle.postMessage(message); }
  let autoSaveTimer = null;
  const settingsDisposable = vscode.workspace.onDidChangeConfiguration((event) => {
    if (lifecycle.disposed) return;
    if (
      event.affectsConfiguration("mojigoto.webviewFontScalePercent") ||
      event.affectsConfiguration("mojigoto.conceptMemoAutoSyncEnabled") ||
      event.affectsConfiguration("mojigoto.webviewAutoSaveEnabled") ||
      event.affectsConfiguration("mojigoto.webviewAutoSaveDelaySeconds")
    ) {
      postMessage({
        type: "webviewUiSettingsChanged",
        payload: getWebviewUiSettings(),
      });
    }
    if (
      event.affectsConfiguration("mojigoto.webviewAutoSaveEnabled") &&
      !getWebviewUiSettings().autoSaveEnabled
    ) {
      if (autoSaveTimer) lifecycle.clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
  });

  panel.onDidDispose(() => {
    lifecycle.dispose();
    settingsDisposable.dispose();
    if (openConceptMemoPanels.get(filePath) === panel) openConceptMemoPanels.delete(filePath);
    if (openConceptMemoPanels.get(conceptMemoFilePathKey) === panel) {
      openConceptMemoPanels.delete(conceptMemoFilePathKey);
    }
  });

  let currentData = initialData;
  let saveQueue = Promise.resolve();
  const ownConceptRevisions = new Set();

  function resolveLatestWorkTitle() {
    return resolveConceptMemoWorkIdentity({
      filePath, workDir, workTitle: panel.__mojigotoConceptMemoWorkTitle,
    }).workTitle;
  }

  function buildDataFromMessage(message) {
    return buildConceptMemoDataFromMessage(message, currentData, ownConceptRevisions);
  }

  async function syncEnabledConceptMemosToNoteItems(data) {
    const updatedNotePaths = new Set();
    const errors = [];
    let reflectedCount = 0;
    let metadataChanged = false;
    for (const memo of Array.isArray(data?.memos) ? data.memos : []) {
      const source = memo?.source || {};
      if (
        String(source.kind || "") !== "noteItem" ||
        !isConceptMemoAutoSyncEnabled(
          source,
          getWebviewUiSettings().conceptMemoAutoSyncDefault,
        ) ||
        ["missing", "cleared"].includes(String(source.status || "active"))
      ) {
        continue;
      }

      try {
        const resolvedNotePath = resolveActualNotePath(
          String(source.notePath || ""),
          workDir,
          String(source.noteType || "plot"),
        );
        const syncPayload = notePayloadFromConcept(memo);
        if (syncFingerprint(syncPayload) === String(source.syncFingerprint || "")) continue;
        const result = await applyConceptMemoToNoteItem({
          memoId: String(memo?.id || ""),
          notePath: resolvedNotePath,
          noteType: String(source.noteType || "plot"),
          groupId: String(source.groupId || ""),
          itemId: String(source.itemId || ""),
          memoBody: syncPayload.body,
          memoType: syncPayload.type,
          memoTags: syncPayload.tags,
          syncFingerprint: syncFingerprint(syncPayload),
          baseSyncFingerprint: String(source.syncFingerprint || ""),
          requireSyncBaseline: true,
        });
        if (result?.updated) {
          updatedNotePaths.add(resolvedNotePath);
          reflectedCount += 1;
        }
        const fingerprint = syncFingerprint(syncPayload);
        if (source.syncFingerprint !== fingerprint) {
          memo.source = { ...source, syncFingerprint: fingerprint, syncedAt: new Date().toISOString(), status: "active" };
          metadataChanged = true;
        }
      } catch (error) {
        errors.push(error);
      }
    }
    if (metadataChanged) {
      try {
        const saved = await writeConceptMemos(filePath, data);
        Object.assign(data, saved);
        ownConceptRevisions.add(saved.storageRevision);
      } catch (error) {
        errors.push(error);
      }
    }

    if (updatedNotePaths.size) {
      const { notifyNoteUpdated } = require("./note-webview");
      await Promise.all(
        [...updatedNotePaths].map((notePath) => notifyNoteUpdated(notePath)),
      );
    }
    return { errors, reflectedCount };
  }

  async function persistConceptMemos(message, notifyWebview = true) {
    const revision = Number(message?.revision || 0);
    const nextCommonTodoItems = Array.isArray(
      message?.payload?.commonTodoItems,
    )
      ? message.payload.commonTodoItems
      : [];
    saveQueue = saveQueue
      .catch(() => undefined)
      .then(async () => {
        const draft = buildDataFromMessage(message);
        const savedConceptMemos = await writeConceptMemos(filePath, draft);
        ownConceptRevisions.add(message?.payload?.storageRevision || draft.storageRevision);
        ownConceptRevisions.add(savedConceptMemos.storageRevision);
        currentData = { ...currentData, ...savedConceptMemos };
        const savedCommonTodoItems = await writeCommonTodoItems(nextCommonTodoItems);

        const nextData = {
          ...savedConceptMemos,
          commonTodoItems: savedCommonTodoItems,
        };
        const syncResult = await syncEnabledConceptMemosToNoteItems(nextData);
        currentData = nextData;
        if (syncResult.errors.length) {
          postMessage({
            type: "showToast",
            message: `出典元への反映または同期情報の保存が${syncResult.errors.length}件完了していません。`,
            isError: true,
          });
        }
        return { data: nextData, reflectedCount: syncResult.reflectedCount, syncErrorCount: syncResult.errors.length };
      });
    const saveResult = await saveQueue;
    currentData = saveResult.data;
    const savedData = saveResult.data;
    const backupIntervalMinutes = Number(vscode.workspace.getConfiguration("mojigoto").get("backupIntervalMinutes", 0));
    await createStructuredBackup({
      filePath,
      targetType: "conceptMemo",
      reason: "automatic",
      intervalMinutes: backupIntervalMinutes,
      content: `${JSON.stringify(savedData, null, 2)}\n`,
    }).catch((error) => console.warn("[mojigoto] automatic concept memo backup failed", error));
    await notifyCommonTodoUpdated(panel);

    if (notifyWebview) {
      postMessage({
        type: "conceptMemosSaved",
        payload: {
          filePath,
          workDir,
          workTitle,
          data: savedData,
          reflectedCount: saveResult.reflectedCount,
          syncErrorCount: saveResult.syncErrorCount,
          selectedMemoId: message.payload?.selectedMemoId || "",
          revision,
          autoSave: Boolean(message.autoSave),
          successMessage: String(message.payload?.successMessage || ""),
        },
      });
    }
    return savedData;
  }

  const session = {
    get currentData() { return currentData; },
    set currentData(value) { currentData = value; },
    get saveQueue() { return saveQueue; },
    get autoSaveTimer() { return autoSaveTimer; },
    set autoSaveTimer(value) { autoSaveTimer = value; },
  };
  panel.webview.onDidReceiveMessage(createConceptMemoMessageHandler({
    vscode, path, context, treeProvider, panel, filePath, workDir, workTitle, title,
    selectedMemoId, initialQuickFilters, createConceptMemoDraft, readConceptNoteIndex,
    readConceptMemosWithSharedTodo, resolveLatestWorkTitle, getConceptMemoPanelTitle,
    getWebviewUiSettings, persistConceptMemos, openStructuredBackupHistory,
    triggerStatsRefresh, resolveActualNotePath, applyConceptMemoToNoteItem,
    postMessage, lifecycle, session,
    getNoteWebview: () => require("./note-webview"),
    isCurrentPanel: () => openConceptMemoPanels.get(filePath) === panel,
  }));
}

async function openConceptMemoWebview(context, treeProvider, options = {}) {
  return withRestoredWebviews(vscode, "mojigotoConceptMemos", () => openConceptMemoWebviewReady(context, treeProvider, options));
}

async function openConceptMemoWebviewReady(context, treeProvider, options = {}) {
  options = { ...options, ...resolveConceptMemoWorkIdentity(options) };
  const {
    filePath,
    workDir = "",
    workTitle = "",
    title = getConceptMemoPanelTitle(options),
    selectedMemoId = "",
    initialQuickFilters = null,
    initialQuickFilter = "",
    viewColumn = vscode.ViewColumn.Active,
    preserveFocus = true,
  } = options;

  const resolvedInitialQuickFilters = initialQuickFilters || {
    type: initialQuickFilter === "text" ? "text" : "",
    state: initialQuickFilter === "archived" ? ["archived"] : [],
    source:
      initialQuickFilter === "hasSource" ||
      initialQuickFilter === "cleared" ||
      initialQuickFilter === "missing"
        ? initialQuickFilter
        : "",
  };

  if (!filePath) {
    vscode.window.showWarningMessage(
      "もじごと: 構想メモの保存ファイルを取得できませんでした。",
    );
    return;
  }

  const existingPanel = openConceptMemoPanels.get(filePath) || [...openConceptMemoPanels.values()].find(panel => webviewFileKey(panel.__mojigotoConceptMemoFilePath) === webviewFileKey(filePath));
  if (existingPanel) {
    existingPanel.title = title;
    existingPanel.__mojigotoConceptMemoWorkDir = workDir;
    existingPanel.__mojigotoConceptMemoWorkTitle = workTitle;
    existingPanel.reveal(viewColumn, preserveFocus);

    try {
      const nextData = await readConceptMemosWithSharedTodo(filePath);
      existingPanel.__mojigotoConceptMemoLifecycle?.postMessage({
        type: "loadConceptMemos",
        payload: {
          filePath,
          workDir,
          workTitle,
          data: nextData,
          selectedMemoId,
          initialQuickFilters: resolvedInitialQuickFilters,
        },
      });
    } catch {}

    return existingPanel;
  }

  let initialData;
  try {
    initialData = await readConceptMemosWithSharedTodo(filePath);
  } catch (error) {
    vscode.window.showErrorMessage(
      `もじごと: 構想メモの読み込みに失敗しました: ${error.message || String(error)}`,
    );
    initialData = createEmptyConceptMemos();
  }

  const panel = vscode.window.createWebviewPanel(
    "mojigotoConceptMemos",
    title,
    viewColumn,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    },
  );

  attachConceptMemoPanel(context, treeProvider, panel, {
    filePath,
    workDir,
    workTitle,
    title,
    initialData,
    selectedMemoId,
    initialQuickFilters: resolvedInitialQuickFilters,
  });

  return panel;
}

function createConceptMemoSerializer(context, treeProvider) {
  return registerRestorableWebview(vscode, "mojigotoConceptMemos", {
    async deserializeWebviewPanel(webviewPanel, webviewState) {
      const state = webviewState || {};
      const filePath = String(state?.filePath || "").trim();

      if (!filePath) {
        webviewPanel.dispose();
        return;
      }

      const { workDir, workTitle } = resolveConceptMemoWorkIdentity({ ...state, filePath });

      let initialData;
      try {
        initialData = await readConceptMemosWithSharedTodo(filePath);
      } catch (error) {
        initialData = createEmptyConceptMemos();
      }

      attachConceptMemoPanel(context, treeProvider, webviewPanel, {
        filePath,
        workDir,
        workTitle,
        title: getConceptMemoPanelTitle({ workDir, workTitle }),
        initialData,
      });
    },
  });
}

async function notifyConceptMemoUpdated(conceptMemoFilePath, { sourceNamesOnly = false } = {}) {
  if (!conceptMemoFilePath) return false;

  const conceptMemoFilePathKey = path.normalize(conceptMemoFilePath);

  const panel =
    openConceptMemoPanels.get(conceptMemoFilePath) ||
    openConceptMemoPanels.get(conceptMemoFilePathKey);

  if (!panel) return false;

  if (sourceNamesOnly) {
    const data = await refreshConceptSourceStatuses(await readConceptMemos(conceptMemoFilePath), {
      readNoteFile,
      resolveNotePath: (notePath, type) => resolveActualNotePath(notePath, path.dirname(path.dirname(conceptMemoFilePath)), type),
    });
    await panel.__mojigotoConceptMemoLifecycle?.postMessage({
      type: "conceptMemoSourceNamesUpdated",
      payload: { memos: data.memos.map((memo) => ({ id: memo.id, source: memo.source })) },
    });
    return true;
  }

  const nextData = await readConceptMemosWithSharedTodo(conceptMemoFilePath);

  panel.__mojigotoConceptMemoLifecycle?.postMessage({
    type: "conceptMemosReloaded",
    payload: {
      filePath: conceptMemoFilePath,
      workDir: String(panel.__mojigotoConceptMemoWorkDir || ""),
      workTitle: String(panel.__mojigotoConceptMemoWorkTitle || ""),
      data: nextData,
    },
  });

  return true;
}

async function notifyCommonTodoUpdated(excludedPanel = null) {
  const panels = new Set(openConceptMemoPanels.values());

  await Promise.all(
    [...panels].map(async (panel) => {
      if (!panel || panel === excludedPanel) return;

      const filePath = String(
        panel.__mojigotoConceptMemoFilePath || "",
      ).trim();
      if (!filePath) return;

      try {
        const data = await readConceptMemosWithSharedTodo(filePath);
        panel.__mojigotoConceptMemoLifecycle?.postMessage({
          type: "conceptMemosReloaded",
          payload: {
            filePath,
            workDir: String(panel.__mojigotoConceptMemoWorkDir || ""),
            workTitle: String(panel.__mojigotoConceptMemoWorkTitle || ""),
            data,
          },
        });
      } catch {}
    }),
  );
}

async function closeConceptMemoWebviewsUnderFolder(folderPath) {
  if (!folderPath) return 0;
  const root = path.resolve(folderPath);
  const panels = new Set(openConceptMemoPanels.values());
  let closed = 0;
  for (const panel of panels) {
    const candidate = String(
      panel?.__mojigotoConceptMemoWorkDir || panel?.__mojigotoConceptMemoFilePath || "",
    ).trim();
    if (!candidate) continue;
    const relative = path.relative(root, path.resolve(candidate));
    if (relative !== "" && (relative.startsWith("..") || path.isAbsolute(relative))) continue;
    panel.dispose();
    closed += 1;
  }
  return closed;
}

module.exports = {
  getConceptMemoPanelTitle,
  resolveConceptMemoFilePath,
  openConceptMemoWebview,
  notifyConceptMemoUpdated,
  notifyCommonTodoUpdated,
  closeConceptMemoWebviewsUnderFolder,
  createConceptMemoSerializer,
};
