const { createDashboardMemoActions } = require("./dashboard-memo-actions");
const { createDashboardHighlightActions } = require("./dashboard-highlight-actions");
const { createDashboardEvents } = require("./dashboard-events");
const vscode = require("vscode");
const { createDashboardStatsCorrectionActions } = require("./dashboard-stats-correction-actions");
const { createDashboardProgressImageActions } = require("./dashboard-progress-image-actions");
const { createDashboardWritingMemoActions } = require("./dashboard-writing-memo-actions");
const { createDashboardWritingMemoOperations } = require("./dashboard-writing-memo-operations");
const { createDashboardWritingMemoNavigation } = require("./dashboard-writing-memo-navigation");
const { createDashboardSettingsActions } = require("./dashboard-settings-actions");
const { registerRestorableWebview, withRestoredWebviews } = require("../views/shared/restored-webviews");
const { getWebviewSaveSettings, updateWebviewSaveSetting } = require("../data/webview-save-settings");
const webMarkdown = require("../export/web-note-markdown");
const { setWebviewPanelThemeIcon } = require("../views/shared/webview-panel-icon");
const fs = require("fs");
const path = require("path");
const { makeStatsHtml } = require("./stats-html");
const {
  getWorkName,
  getCurrentWorkTitleFromSettings,
  getCurrentWorkSettingsPath,
} = require("../work/work-settings");
const { isSingleMode } = require("../core/mojigoto-context");
const { setStatsRefreshHandler } = require("./stats-utils");
const {
  triggerWritingMemoDecorationRefresh,
} = require("../editor/writing-memo-decorations");
const {
  listWorkDirectories,
  getConceptMemosPathForWork,
  getConceptMemosPathForSingle,
  getWritingMemosPathForWork,
  getWritingMemosPathForSingle,
  getWorkManuscriptRoot,
} = require("../core/mojigoto-paths");
const {
  readConceptMemos,
  writeConceptMemos,
} = require("../data/concept-memo-store");
const {
  readCommonTodoItems,
  writeCommonTodoItems,
} = require("../data/common-todo-store");
const {
  openConceptMemoWebview,
  notifyConceptMemoUpdated,
  notifyCommonTodoUpdated,
} = require("../views/concept-memo-webview");
const {
  readWritingMemos,
  writeWritingMemos,
} = require("../writing-memo/writing-memo-store");
const {
  resolveWritingMemoAbsolutePathFlexible,
  isSameOrChildPath,
  toMemoRelativePath,
  getConfiguredManuscriptRoot,
} = require("../writing-memo/writing-memo-resolver");
const {
  getStatsCorrectionStatus,
  rebaseStatsToCurrentManuscripts,
  correctTodayDelta,
  resetStatsRecords,
  undoLastStatsCorrection,
} = require("./stats-correction");
const HIDE_ZERO_GROUPS_KEY = "mojigoto.stats.hideZeroGroups";

function createStatsPanelController(options) {
  const {
    context,
    buildStatsState,
    getHighlightManager,
    exportStatsCsv,
    exportMergedManuscript,
    sendUnsyncedMojigotoEventsToWebhook,
    sendInitialProgressToWebhook,
    getPreferredHighlightEditor,
    toggleHighlightsEnabled,
    applyHighlightGroupEnabled,
  } = options;

  let controllerDisposed = false;
  let statsPanel = null;
  let hideZeroGroups = context.globalState?.get(HIDE_ZERO_GROUPS_KEY);
  if (typeof hideZeroGroups !== "boolean") hideZeroGroups = undefined;
  let displayedRenderId = "";
  let displayedMarkdownDir = "";
  function currentMarkdownDir() {
    const file = typeof getCurrentWorkSettingsPath === "function" ? getCurrentWorkSettingsPath(context) : "";
    return file ? path.dirname(file) : "";
  }
  let hideZeroWriteQueue = Promise.resolve();
  async function persistHideZeroGroups(enabled) {
    hideZeroGroups = enabled;
    hideZeroWriteQueue = hideZeroWriteQueue.catch(() => {}).then(() => context.globalState?.update(HIDE_ZERO_GROUPS_KEY, enabled));
    try { await hideZeroWriteQueue; }
    catch (error) {
      vscode.window.showWarningMessage?.(`もじごと: 「0件を隠す」の表示設定を保存できませんでした。${String(error.message || error)}`);
    }
  }
  let refreshSequence = 0;
  let performanceOutput = null;
  const renderTimings = new Map();
  function logTiming(text) {
    try {
      performanceOutput ||= vscode.window.createOutputChannel?.("もじごと: Dashboard 計測");
      performanceOutput?.appendLine(text);
    } catch {}
  }
  let revealSaveSettings = false;
  let lastWritingMemoTargetFsPath = "";
  let editingWritingMemoId = "";
  let writingMemoScope = "file";
  let selectedWritingMemoWorkId = "";
  let selectedWritingMemoWorkTitle = "";
  let lastOpenedWritingMemoWorkId = "";
  let lastOpenedWritingMemoWorkTitle = "";

  function getPanel() {
    return statsPanel;
  }

  function getHighlightManagerSafe() {
    try {
      return typeof getHighlightManager === "function"
        ? getHighlightManager()
        : null;
    } catch {
      return null;
    }
  }

  function resolveConceptMemoPath() {
    if (isSingleMode()) {
      return getConceptMemosPathForSingle();
    }

    const currentWorkName = String(getWorkName(context) || "").trim();
    if (!currentWorkName) return "";

    const work = listWorkDirectories().find(
      (item) => String(item?.name || "") === currentWorkName,
    );

    if (!work?.fsPath) return "";

    return getConceptMemosPathForWork(work.fsPath);
  }

  function resolveConceptMemoTarget() {
    if (isSingleMode()) {
      const title = String(
        getCurrentWorkTitleFromSettings(context) || "",
      ).trim();

      return {
        filePath: getConceptMemosPathForSingle(),
        workDir: "",
        workTitle: title,
      };
    }

    const currentWorkName = String(getWorkName(context) || "").trim();
    if (!currentWorkName) {
      return {
        filePath: "",
        workDir: "",
        workTitle: "",
      };
    }

    const work = listWorkDirectories().find(
      (item) => String(item?.name || "") === currentWorkName,
    );

    if (!work?.fsPath) {
      return {
        filePath: "",
        workDir: "",
        workTitle: "",
      };
    }

    return {
      filePath: getConceptMemosPathForWork(work.fsPath),
      workDir: work.fsPath,
      workTitle: String(work?.title || work?.name || "").trim(),
    };
  }

  function resolveConceptMemoTargetByWorkId(workId = "") {
    const safeWorkId = String(workId || "").trim();

    if (isSingleMode()) {
      const title = String(
        getCurrentWorkTitleFromSettings(context) || "",
      ).trim();

      return {
        filePath: getConceptMemosPathForSingle(),
        workDir: "",
        workTitle: title,
      };
    }

    if (!safeWorkId) {
      return resolveConceptMemoTarget();
    }

    const work = listWorkDirectories().find(
      (item) => String(item?.name || "").trim() === safeWorkId,
    );

    if (!work?.fsPath) {
      return {
        filePath: "",
        workDir: "",
        workTitle: "",
      };
    }

    return {
      filePath: getConceptMemosPathForWork(work.fsPath),
      workDir: work.fsPath,
      workTitle: String(work?.title || work?.name || "").trim(),
    };
  }

  function resolveWritingMemoPath() {
    if (isSingleMode()) {
      return getWritingMemosPathForSingle();
    }

    const currentWorkName = String(getWorkName(context) || "").trim();
    if (!currentWorkName) return "";

    const work = listWorkDirectories().find(
      (item) => String(item?.name || "") === currentWorkName,
    );

    if (!work?.fsPath) return "";
    return getWritingMemosPathForWork(work.fsPath);
  }

  function isWritingMemoTargetEditor(editor) {
    const fsPath = editor?.document?.uri?.fsPath || "";
    if (!fsPath) return false;

    const lower = fsPath.toLowerCase();
    return lower.endsWith(".txt") || lower.endsWith(".md");
  }

  function updateLastWritingMemoTarget(editor) {
    if (!isWritingMemoTargetEditor(editor)) return;
    lastWritingMemoTargetFsPath = editor.document.uri.fsPath;
  }

  async function postToPanel(payload, targetPanel = statsPanel) {
    if (controllerDisposed) return;
    try {
      if (targetPanel && targetPanel === statsPanel) {
        await targetPanel.webview.postMessage(payload);
      }
    } catch {}
  }

  async function openWritingMemoTab(payload = {}) {
    if (controllerDisposed) return;
    return writingMemoActions.openWritingMemoTab(payload);
  }

  function normalizeComparablePath(value) {
    const normalized = path.normalize(String(value || "").trim());
    return process.platform === "win32" ? normalized.toLowerCase() : normalized;
  }

  const highlightActions = createDashboardHighlightActions({
    vscode, refresh, normalizeComparablePath, getHighlightManagerSafe, getPreferredHighlightEditor,
    toggleHighlightsEnabled, applyHighlightGroupEnabled,
  });

  const statsCorrectionActions = createDashboardStatsCorrectionActions({
    vscode, context, refresh, sendInitialProgressToWebhook,
    getStatsCorrectionStatus, rebaseStatsToCurrentManuscripts,
    correctTodayDelta, resetStatsRecords, undoLastStatsCorrection,
  });

  const progressImageActions = createDashboardProgressImageActions({
    vscode, context, postToPanel, getCurrentWorkTitleFromSettings, getWorkName,
  });

  const writingMemoActions = createDashboardWritingMemoActions({
    vscode, context, open, refresh, postToPanel,
    resolveConceptMemoTargetByWorkId, readConceptMemos, writeConceptMemos,
    readWritingMemos,
    notifyConceptMemoUpdated, triggerWritingMemoDecorationRefresh,
    state: {
      get lastWritingMemoTargetFsPath() { return lastWritingMemoTargetFsPath; },
      set lastWritingMemoTargetFsPath(value) { lastWritingMemoTargetFsPath = value; },
      get editingWritingMemoId() { return editingWritingMemoId; },
      set editingWritingMemoId(value) { editingWritingMemoId = value; },
      get writingMemoScope() { return writingMemoScope; },
      set writingMemoScope(value) { writingMemoScope = value; },
      get selectedWritingMemoWorkId() { return selectedWritingMemoWorkId; },
      set selectedWritingMemoWorkId(value) { selectedWritingMemoWorkId = value; },
      get selectedWritingMemoWorkTitle() { return selectedWritingMemoWorkTitle; },
      set selectedWritingMemoWorkTitle(value) { selectedWritingMemoWorkTitle = value; },
      get lastOpenedWritingMemoWorkId() { return lastOpenedWritingMemoWorkId; },
      set lastOpenedWritingMemoWorkId(value) { lastOpenedWritingMemoWorkId = value; },
      get lastOpenedWritingMemoWorkTitle() { return lastOpenedWritingMemoWorkTitle; },
      set lastOpenedWritingMemoWorkTitle(value) { lastOpenedWritingMemoWorkTitle = value; },
    },
  });

  const writingMemoOperations = createDashboardWritingMemoOperations({
    vscode, readWritingMemos, writeWritingMemos, resolveWritingMemoPath,
    refresh, triggerWritingMemoDecorationRefresh, postToPanel,
    clearEditingWritingMemo() { editingWritingMemoId = ""; },
  });

  const writingMemoNavigation = createDashboardWritingMemoNavigation({
    vscode, context, fs, path, normalizeComparablePath,
    getConfiguredManuscriptRoot, isSameOrChildPath, isSingleMode,
    getWorkName, listWorkDirectories, getWorkManuscriptRoot,
    toMemoRelativePath, getWritingMemosPathForSingle, getWritingMemosPathForWork,
    readWritingMemos, writeWritingMemos, resolveWritingMemoAbsolutePathFlexible,
    refresh, postToPanel, triggerWritingMemoDecorationRefresh,
    setRelinkTarget(filePath) {
      lastWritingMemoTargetFsPath = filePath;
      editingWritingMemoId = "";
    },
    setJumpTarget(absPath, msg) {
      lastWritingMemoTargetFsPath = absPath;

      const returnWorkId = String(msg.returnWorkId || "").trim();
      const returnWorkTitle = String(msg.returnWorkTitle || "").trim();

      if (returnWorkId) {
        lastOpenedWritingMemoWorkId = returnWorkId;
        lastOpenedWritingMemoWorkTitle = returnWorkTitle;
      } else if (writingMemoScope === "work" && selectedWritingMemoWorkId) {
        lastOpenedWritingMemoWorkId = selectedWritingMemoWorkId;
        lastOpenedWritingMemoWorkTitle = selectedWritingMemoWorkTitle;
      }

      writingMemoScope = "file";
      selectedWritingMemoWorkId = "";
      selectedWritingMemoWorkTitle = "";
    },
  });

  const memoActions = createDashboardMemoActions({
    vscode, context, refresh, resolveConceptMemoPath, resolveConceptMemoTarget,
    readConceptMemos, writeConceptMemos, readCommonTodoItems, writeCommonTodoItems,
    notifyConceptMemoUpdated, notifyCommonTodoUpdated, openConceptMemoWebview,
  });

  const settingsActions = createDashboardSettingsActions({
    context, vscode, webMarkdown, currentMarkdownDir, postToPanel,
    getDisplayedMarkdownDir: () => displayedMarkdownDir,
    getDisplayedRenderId: () => displayedRenderId,
    getWebviewSaveSettings, updateWebviewSaveSetting,
  });

  async function handleWebviewMessage(msg) {
    if (controllerDisposed) return;
    if (msg?.type === "webMarkdownAction") {
      await settingsActions.handleWebMarkdownAction(msg);
      return;
    }
    if (msg?.type === "setHideZeroGroups") {
      if (typeof msg.enabled !== "boolean" || !displayedRenderId || String(msg.renderId) !== displayedRenderId) return;
      if (msg.source === "initial") {
        if (typeof hideZeroGroups === "boolean") return;
      } else if (msg.source !== "change") return;
      await persistHideZeroGroups(msg.enabled);
      return;
    }
    if (msg?.type === "statsViewReady") {
      const timing = renderTimings.get(String(msg.renderId || ""));
      if (timing && !timing.ready) {
        timing.ready = true;
        const scriptMs = Number(msg.scriptMs);
        logTiming("表示 #" + msg.renderId + ": ホスト開始→画面準備 " + (Date.now() - timing.started) + "ms / Webview初期処理 " + (Number.isFinite(scriptMs) ? Math.max(0, Math.round(scriptMs)) : "不明") + "ms");
      }
      return;
    }
    if (!msg) return;

    const highlightManager = getHighlightManagerSafe();

    if (msg.type === "exportCsv") {
      await exportStatsCsv(context);
      return;
    }

    if (msg.type === "saveProgressShareImage") {
      await progressImageActions.saveProgressShareImage(msg);
      return;
    }

    if (msg.type === "refresh") {
      refresh();
      return;
    }

    if (msg.type === "correctStats") {
      await statsCorrectionActions.handleStatsCorrection();
      return;
    }

    if (msg.type === "setWorkGoal") {
      await vscode.commands.executeCommand("mojigoto.setWorkGoal");
      refresh();
      return;
    }

    if (msg.type === "setWorkDeadline") {
      await vscode.commands.executeCommand("mojigoto.setWorkDeadline");
      refresh();
      return;
    }

    if (msg.type === "openExportLauncher") {
      await vscode.commands.executeCommand("mojigoto.openExportLauncher");
      refresh();
      return;
    }

    if (msg.type === "runDoctor") {
      await vscode.commands.executeCommand("mojigoto.doctor");
      return;
    }

    if (msg.type === "setDashboardMemoVisibility") {
      await memoActions.setDashboardMemoVisibility(msg);
      return;
    }

    if (msg.type === "mojigoto.sendMojigotoEvents") {
      const requestPanel = statsPanel;
      try {
        const r = await sendUnsyncedMojigotoEventsToWebhook(context);
        await postToPanel({
          type: "mojigoto.sendMojigotoEvents.result",
          ok: true,
          sent: r?.sent ?? 0,
        }, requestPanel);
      } catch (e) {
        await postToPanel({
          type: "mojigoto.sendMojigotoEvents.result",
          ok: false,
          error: String(e),
        }, requestPanel);
      }
      return;
    }

    if (msg.type === "updateWebviewSaveSetting") {
      await settingsActions.handleSaveSetting(msg);
      return;
    }

    if (msg.type === "openBackupSettings") {
      await settingsActions.openBackupSettings(msg);
      return;
    }

    if (msg.type === "openMojigotoSettings") {
      await settingsActions.openMojigotoSettings(msg);
      return;
    }

    if (await highlightActions.handleMessage(msg, highlightManager)) return;

    if (msg.type === "toggleDashboardTodo") {
      await memoActions.toggleDashboardTodo(msg);
      return;
    }

    if (msg.type === "toggleDashboardCommonTodo") {
      await memoActions.toggleDashboardCommonTodo(msg);
      return;
    }

    if (msg.type === "toggleDashboardVisibility") {
      await memoActions.toggleDashboardVisibility(msg);
      return;
    }

    if (msg.type === "copyWritingMemoToConceptMemo") {
      await writingMemoActions.copyWritingMemoToConceptMemo(msg);
      return;
    }

    if (msg.type === "openConceptMemoFromDashboard") {
      await memoActions.openConceptMemoFromDashboard(msg);
      return;
    }

    if (msg.type === "writingMemoJump") {
      await writingMemoNavigation.handleWritingMemoJump(msg);
      return;
    }

    if (msg.type === "relinkWritingMemo") {
      try {
        await writingMemoNavigation.handleWritingMemoRelink(msg);
      } catch (error) {
        console.error("[mojigoto] relinkWritingMemo error:", error);
        vscode.window.showErrorMessage(
          `もじごと: 執筆メモの連携先を修復できませんでした: ${error.message || String(error)}`,
        );
      }
      return;
    }

    if (msg.type === "setWritingMemoStatus") {
      await writingMemoOperations.setWritingMemoStatus(msg);
      return;
    }

    if (msg.type === "archiveDoneWritingMemos") {
      await writingMemoOperations.archiveDoneWritingMemos(msg);
      return;
    }

    if (msg.type === "clearArchivedWritingMemos") {
      await writingMemoOperations.clearArchivedWritingMemos(msg);
      return;
    }

    if (msg.type === "restoreWritingMemo") {
      await writingMemoOperations.restoreWritingMemo(msg);
      return;
    }

    if (msg.type === "deleteWritingMemo") {
      await writingMemoOperations.deleteWritingMemo(msg);
      return;
    }

    if (msg.type === "updateWritingMemo") {
      await writingMemoOperations.updateWritingMemo(msg);
      return;
    }

    if (msg.type === "startEditingWritingMemo") {
      await writingMemoActions.startEditingWritingMemo(msg);
      return;
    }

    if (msg.type === "cancelEditingWritingMemo") {
      await writingMemoActions.cancelEditingWritingMemo(msg);
      return;
    }

    if (msg.type === "refreshWritingMemos") {
      await writingMemoActions.refreshWritingMemos(msg);
      return;
    }

    if (msg.type === "toggleWritingMemoDecorations") {
      await writingMemoActions.toggleWritingMemoDecorations(msg);
      return;
    }

    if (msg.type === "showWritingMemoWorkIndex") {
      await writingMemoActions.showWritingMemoWorkIndex(msg);
      return;
    }

    if (msg.type === "openWritingMemoWork") {
      await writingMemoActions.openWritingMemoWork(msg);
      return;
    }

    if (msg.type === "showCurrentFileWritingMemos") {
      await writingMemoActions.showCurrentFileWritingMemos(msg);
      return;
    }
  }

  function attach(panelInstance) {
    setWebviewPanelThemeIcon(panelInstance, "dashboard");
    panelInstance.webview.onDidReceiveMessage((msg) => {
      if (statsPanel !== panelInstance) return;
      return handleWebviewMessage(msg);
    });

    panelInstance.onDidDispose(() => {
      if (statsPanel === panelInstance) {
        statsPanel = null;
      }
    });
  }

  const events = createDashboardEvents({
    vscode, webMarkdown, getPanel, currentMarkdownDir, postToPanel, getWebviewSaveSettings, refresh,
    getDisplayedMarkdownDir: () => displayedMarkdownDir,
    getWritingMemoTarget: () => lastWritingMemoTargetFsPath,
    updateWritingMemoTarget: updateLastWritingMemoTarget,
  });

  async function refresh() {
    if (controllerDisposed || !statsPanel) return;
    const panel = statsPanel;
    const renderId = String(++refreshSequence);
    const started = Date.now();
    const phases = [];

    const highlightManager = getHighlightManagerSafe();
    const state = await buildStatsState(context, highlightManager, {
      onTiming: (name, ms) => phases.push(name + " " + ms + "ms"),
      writingMemoTargetFsPath: lastWritingMemoTargetFsPath,
      editingWritingMemoId,
      writingMemoScope,
      selectedWritingMemoWorkId,
      selectedWritingMemoWorkTitle,
      lastOpenedWritingMemoWorkId,
      lastOpenedWritingMemoWorkTitle,
    });

    if (controllerDisposed || statsPanel !== panel || renderId !== String(refreshSequence)) return;
    const stateMs = Date.now() - started;
    const htmlStarted = Date.now();
    displayedMarkdownDir = currentMarkdownDir();
    const html = makeStatsHtml({ ...state, statsRenderId: renderId, openSaveSettings: revealSaveSettings, hideZeroGroups,
      webMarkdown: webMarkdown.getStatus?.(displayedMarkdownDir) });
    renderTimings.set(renderId, { started, ready: false });
    while (renderTimings.size > 4) renderTimings.delete(renderTimings.keys().next().value);
    displayedRenderId = renderId;
    panel.webview.html = html;
    logTiming("表示 #" + renderId + ": データ準備 " + stateMs + "ms / HTML生成 " + (Date.now() - htmlStarted) + "ms / " + phases.join(" / "));
    revealSaveSettings = false;
  }

  function open() {
    if (controllerDisposed) return;
    return withRestoredWebviews(vscode, "mojigoto.stats", openReady);
  }

  function openReady() {
    if (controllerDisposed) return;
    if (statsPanel) {
      statsPanel.reveal(vscode.ViewColumn.Beside, false);
      return refresh();
    }

    statsPanel = vscode.window.createWebviewPanel(
      "mojigoto.stats",
      "もじごと: Dashboard",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true },
    );

    attach(statsPanel);
    return refresh();
  }

  async function openSaveSettings() {
    if (controllerDisposed) return;
    revealSaveSettings = true;
    await open();
  }

  function createSerializer() {
    return registerRestorableWebview(vscode, "mojigoto.stats", {
      async deserializeWebviewPanel(webviewPanel, savedState) {
        if (controllerDisposed) return;
        statsPanel = webviewPanel;

        webviewPanel.webview.options = {
          enableScripts: true,
          retainContextWhenHidden: true,
        };

        attach(webviewPanel);
        if (typeof hideZeroGroups !== "boolean" && typeof savedState?.hideZeroGroups === "boolean") {
          await persistHideZeroGroups(savedState.hideZeroGroups);
        }
        await refresh();
      },
    });
  }

  const refreshRegistration = setStatsRefreshHandler(refresh);

  function dispose() {
    if (controllerDisposed) return;
    controllerDisposed = true;
    refreshSequence++;
    statsPanel = null;
    displayedRenderId = "";
    displayedMarkdownDir = "";
    events.dispose();
    refreshRegistration?.dispose();
    performanceOutput?.dispose();
    performanceOutput = null;
    renderTimings.clear();
  }
  context.subscriptions?.push({ dispose });

  return {
    open,
    openSaveSettings,
    openWritingMemoTab,
    refresh,
    getPanel,
    createSerializer,
    dispose,
  };
}

module.exports = {
  createStatsPanelController,
};
