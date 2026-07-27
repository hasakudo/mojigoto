const vscode = require("vscode");
const { registerEncodingWarning } = require("./src/editor/encoding-warning");
const path = require("path");
const { HighlightManager } = require("./src/highlight/highlight-manager");
const { readHighlightGroups } = require("./src/highlight/highlight-core");
const { MojigotoWorkTreeProvider } = require("./src/tree/work-tree-provider");
const { createServerStatusBarItem } = require("./src/statusbar/server-status");
const { createWorkStatusController } = require("./src/statusbar/work-status");
const { getCurrentWorkDisplayName } = require("./src/work/work-settings");
const { registerAutoIndent } = require("./src/editor/auto-indent");
const { registerInputAssist } = require("./src/editor/input-assist");
const { registerRubyCommands } = require("./src/editor/ruby-tools");
const { registerPreviewCommands } = require("./src/preview/preview-commands");
const { registerWorkCommands } = require("./src/work/work-commands");
const { handleRenamedWorkFolders } = require("./src/work/work-switch-service");
const { registerReorderCommands } = require("./src/reorder/reorder-commands");
const { createBuildStatsState } = require("./src/stats/stats-state");
const { createStatsPanelController } = require("./src/stats/stats-panel");
const { registerStatsCommands } = require("./src/stats/stats-commands");
const { maybeRemindEventsSend } = require("./src/stats/stats-reminder");
const { nowJstParts, gsGet } = require("./src/stats/stats-utils");
const { getOrPickExportRoot } = require("./src/export/manuscript-export");
const { registerAppCommands } = require("./src/commands/app-commands");
const { runDoctor, ensureEnvironment } = require("./src/debug/doctor");
const { openGuideWebview } = require("./src/views/guide-webview");
const {
  openNoteWebview,
  createNoteSerializer,
  notifyNoteUpdated,
  registerNoteWebviewCommands,
} = require("./src/views/note-webview");
const {
  registerNoteImportCommands,
} = require("./src/import/note-import-commands");
const {
  createWritingMemoDecorationController,
} = require("./src/editor/writing-memo-decorations");
const {
  registerWritingMemoCommands,
} = require("./src/writing-memo/writing-memo-commands");
const {
  createConceptMemoSerializer,
} = require("./src/views/concept-memo-webview");
const {
  countLikeCountChars,
  getCountMode,
  getCountModeLabel,
} = require("./src/core/text-count");
const {
  listTextFiles,
  safeRead,
  detectChapter,
} = require("./src/core/manuscript-helpers");
const {
  registerMojigotoTreeCommands,
} = require("./src/tree/work-tree-commands");
const {
  registerTreeRefreshWatchers,
} = require("./src/tree/work-tree-watchers");
const {
  registerSetupCommands,
  firstRunSetup,
} = require("./src/setup/setup-commands.js");
const {
  logOnSave,
  sendUnsyncedMojigotoEventsToWebhook,
  ensureProjectNameFilled,
} = require("./src/stats/stats-service");
const {
  sheetsEnabled,
  webhookEventsMode,
  getStatsRetentionSettings,
} = require("./src/stats/stats-config");
const {
  exportStatsCsv,
  sendPendingMojigotoEvents,
} = require("./src/export/stats-export");
const {
  exportMergedManuscript,
} = require("./src/export/merged-manuscript-export-ui");
const {
  createCountsStatusController,
} = require("./src/statusbar/counts-status");
const {
  getWorkName,
  diffKeyForWork,
  getCurrentWorkTitleFromSettings,
  getCurrentWorkGoal,
  getCurrentWorkDeadline,
  getDaysLeftText,
} = require("./src/work/work-settings");
const {
  getPreferredHighlightEditor,
  registerHighlightCommands,
  registerHighlightPanelSync,
  applyHighlightGroupEnabled,
  toggleHighlightsEnabled,
} = require("./src/highlight/highlight-commands");
const {
  registerHighlightStatsSync,
} = require("./src/highlight/highlight-stats-sync");
const {
  stopServerPolling,
  stopVerticalDevIfStartedByUs,
  pingServer,
  isPortOpen,
  resolveVerticalDevPath,
} = require("./src/preview/server-service");
const {
  isStatusBarCountsEnabled,
  shouldShowWorkStatusBar,
} = require("./src/statusbar/statusbar-config");
const {
  listWorkDirectories,
  getWorkManuscriptRoot,
} = require("./src/core/mojigoto-paths");
const {
  updateWritingMemoPathsForRenameEvent,
} = require("./src/writing-memo/writing-memo-tracker");

let scheduleRecalc = () => {};
let previewStateRef = null;

function activate(context) {
  const highlightManager = new HighlightManager();
  context.subscriptions.push({
    dispose: () => highlightManager.dispose(),
  });

  const treeProvider = new MojigotoWorkTreeProvider(context);

  const workTreeView = vscode.window.createTreeView("mojigoto.workTree", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  context.subscriptions.push(workTreeView);

  registerTreeRefreshWatchers(context, treeProvider);

  (async () => {
    await registerMojigotoTreeCommands(context, treeProvider, workTreeView);
    await firstRunSetup(context);
    await maybeRemindEventsSend(context, "activate");
  })().catch((e) => {
    console.error("Mojigoto activate error:", e);
  });

  registerAutoIndent(context);
  registerRubyCommands(context);
  registerInputAssist(context);
  registerSetupCommands(context);
  registerWritingMemoCommands(context);
  registerNoteImportCommands(context, treeProvider);
  registerNoteWebviewCommands(context);
  
  const previewState = {
    panel: null,
    serverPort: null,
    serverUrl: null,
    serverOk: false,
    devProc: null,
    pollingTimer: null,
    startedByUs: false,
    enabled: true,
  };

  previewStateRef = previewState;

  const refreshExplorer = async () => {
    await vscode.commands.executeCommand(
      "workbench.files.action.refreshFilesExplorer",
    );
  };

  const runDoctorWithDeps = async (ctx) =>
    runDoctor(ctx, {
      firstRunSetup,
      refreshExplorer,
      resolveVerticalDevPath,
      isPortOpen,
      pingServer,
      previewState,
    });

  const serverStatusBar = createServerStatusBarItem(context);
  serverStatusBar.update(previewState);

  const previewController = registerPreviewCommands(context, {
    state: previewState,
    updateServerStatus: (state) => serverStatusBar.update(state),
    isDebug: false,
    ensureEnvironment: async () => {
      return await ensureEnvironment(context, {
        firstRunSetup,
        runDoctorImpl: runDoctorWithDeps,
      });
    },
    getWorkRoot: async () => {
      const cfg = vscode.workspace.getConfiguration("mojigoto");
      return String(cfg.get("workRoot", "") || "").trim();
    },
    getManuscriptRoot: async () => {
      const cfg = vscode.workspace.getConfiguration("mojigoto");
      return String(cfg.get("manuscriptRoot", "") || "").trim();
    },
  });

  if (previewController?.serializer) {
    context.subscriptions.push(previewController.serializer);
  }

  const buildStatsState = createBuildStatsState({
    nowJstParts,
    gsGet,
    getStatsRetentionSettings,
    getCurrentWorkTitleFromSettings,
    getCurrentWorkGoal,
    getCurrentWorkDeadline,
    getDaysLeftText,
    getWorkName,
    sheetsEnabled,
    webhookEventsMode,
    getCountModeLabel,
  });

  const statsPanelController = createStatsPanelController({
    context,
    buildStatsState,
    getHighlightManager: () => highlightManager,
    exportStatsCsv,
    exportMergedManuscript,
    sendUnsyncedMojigotoEventsToWebhook,
    readHighlightGroups,
    getPreferredHighlightEditor,
    toggleHighlightsEnabled: () =>
      toggleHighlightsEnabled({ highlightManager }),
    applyHighlightGroupEnabled: (name, enabled) =>
      applyHighlightGroupEnabled(name, enabled, { highlightManager }),
  });

  const refreshStatsPanel = () => statsPanelController.refresh();

  const workStatusController = createWorkStatusController(context, {
    getCurrentWorkName: () =>
      String(
        context.globalState.get("mojigoto.currentWorkName", "") || "",
      ).trim(),
    getCurrentWorkDisplayName,
    shouldShowWorkStatusBar,
  });

  workStatusController.initialize();

  context.subscriptions.push(
    vscode.commands.registerCommand("mojigoto.refreshWorkStatus", () => {
      try {
        workStatusController?.refresh?.();
      } catch {}
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "mojigoto.openWritingMemoFromHover",
      async (payload = {}) => {
        try {
          await statsPanelController.openWritingMemoTab(payload || {});
        } catch (error) {
          vscode.window.showErrorMessage(
            `もじごと: 執筆メモを開けませんでした: ${error.message || String(error)}`,
          );
        }
      },
    ),
  );

  registerWorkCommands(context, {
    itemWork: workStatusController?.items?.itemWork ?? null,
    ensureProjectNameFilled,
    restartServer: true,
    previewState,
    refreshStatsPanel,
    scheduleRecalc: (reason) => scheduleRecalc(reason),
  });

  context.subscriptions.push(
    vscode.workspace.onDidRenameFiles(async (event) => {
      try {
        await handleRenamedWorkFolders(context, event);
      } catch (e) {
        try {
          console.log("[mojigoto] handleRenamedWorkFolders error:", String(e));
        } catch {}
      }

      try {
        const changed = await updateWritingMemoPathsForRenameEvent(
          context,
          event,
        );
        if (changed) {
          try {
            scheduleRecalc("writingMemoRename");
          } catch {}
        }
      } catch (e) {
        try {
          console.log(
            "[mojigoto] updateWritingMemoPathsForRenameEvent error:",
            String(e),
          );
        } catch {}
      }
    }),
  );

  registerStatsCommands(context, {
    panelController: statsPanelController,
    logOnSave,
    exportStatsCsv,
    exportMergedManuscript,
  });

  const countsStatusController = createCountsStatusController(context, {
    countChars: countLikeCountChars,
    getCountModeLabel,
    safeRead,
    listTextFiles,
    detectChapter,
    getCurrentWorkGoal,
    getDiffKeyForWork: diffKeyForWork,
    isEnabled: isStatusBarCountsEnabled,
    getCurrentWorkName: () =>
      String(
        context.globalState.get("mojigoto.currentWorkName", "") || "",
      ).trim(),
    listWorkDirectories,
    getWorkManuscriptRoot,
    getManuscriptRoot: () => {
      try {
        const conf = vscode.workspace.getConfiguration("mojigoto");
        const mode = String(conf.get("mode", "") || "").trim();
        const workRoot = String(conf.get("workRoot", "") || "").trim();
        const mr = String(conf.get("manuscriptRoot", "") || "").trim();

        if (mode === "single") return mr;
        if (workRoot) return path.join(workRoot, "_WORK", "manuscript");
        if (mr) return mr;

        const wf = vscode.workspace.workspaceFolders?.[0];
        return wf ? path.join(wf.uri.fsPath, "_WORK", "manuscript") : "";
      } catch {
        return "";
      }
    },
  });

  countsStatusController.initialize();
  scheduleRecalc = (reason) => countsStatusController.scheduleRecalc(reason);

  context.subscriptions.push(
    createNoteSerializer(context, treeProvider),
    createConceptMemoSerializer(context, treeProvider),
  );

  const writingMemoDecorationController =
    createWritingMemoDecorationController(context);

  context.subscriptions.push({
    dispose() {
      writingMemoDecorationController.dispose();
    },
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("mojigoto.selectCountMode", async () => {
      const cfg = vscode.workspace.getConfiguration("mojigoto");
      const current = getCountMode();

      const items = [
        {
          label: "ルビ/見出し記号/空白/改行を含まない",
          value: "default",
          description: current === "default" ? "現在の設定" : "",
        },
        {
          label: "ルビ/見出し記号/改行を含まず、全角空白を含む",
          value: "withFullWidthSpaces",
          description: current === "withFullWidthSpaces" ? "現在の設定" : "",
        },
        {
          label: "ルビ/見出し記号/空白を含まず、改行を含む",
          value: "withNewlines",
          description: current === "withNewlines" ? "現在の設定" : "",
        },
        {
          label: "ルビ/見出し記号を含まず、空白/改行を含む",
          value: "withSpacesAndNewlines",
          description: current === "withSpacesAndNewlines" ? "現在の設定" : "",
        },
        {
          label: "ルビ/見出し記号/空白/改行、すべてを含む",
          value: "allInclusive",
          description: current === "allInclusive" ? "現在の設定" : "",
        },
        {
          label: "ルビ/見出し記号/空白を含み、改行を除く",
          value: "allExceptNewlines",
          description: current === "allExceptNewlines" ? "現在の設定" : "",
        },
      ];

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: `文字数カウント方式を選択（現在: ${getCountModeLabel(current)}）`,
        matchOnDescription: true,
      });

      if (!picked) return;
      if (picked.value === current) return;

      await cfg.update(
        "countMode",
        picked.value,
        vscode.ConfigurationTarget.Workspace,
      );

      countsStatusController.scheduleRecalc("countModeChanged");
      refreshStatsPanel();

      vscode.window.setStatusBarMessage(
        `もじごと: 文字数カウント方式を「${picked.label}」に変更しました。`,
        2500,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("mojigoto.openGuide", () => {
      openGuideWebview(context);
    }),
  );

  registerReorderCommands(context, {
    scheduleRecalc: (reason) => scheduleRecalc(reason),
    refreshExplorer,
  });

  registerHighlightCommands(context, {
    highlightManager,
  });

  registerHighlightPanelSync(context, {
    highlightManager,
    refreshStatsPanel,
    getContext: () => context,
  });

  registerHighlightStatsSync(context, {
    highlightManager,
    refreshStatsPanel,
  });

  registerAppCommands(context, {
    getOrPickExportRoot,
    sheetsEnabled,
    webhookEventsMode,
    sendPendingMojigotoEvents,
    getPreviewUrl: () => {
      const port = previewState.serverPort;
      return previewState.serverUrl || (port ? `http://127.0.0.1:${port}` : "");
    },
    runDoctor: runDoctorWithDeps,
  });

  registerEncodingWarning(context);

  // ---- Events ----
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() =>
      scheduleRecalc("activeEditor"),
    ),
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => logOnSave(context, doc)),
  );

  writingMemoDecorationController.refreshWritingMemoDecorations(
    vscode.window.activeTextEditor,
  );

  scheduleRecalc("init");
  highlightManager.refreshActiveEditor();
  refreshStatsPanel();
}

function deactivate() {
  if (!previewStateRef) return;
  stopServerPolling(previewStateRef);
  stopVerticalDevIfStartedByUs(previewStateRef);
}

exports.activate = activate;
module.exports = { activate, deactivate };
