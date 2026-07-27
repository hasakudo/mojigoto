const vscode = require("vscode");

const {
  pingServer,
  startVerticalDevIfNeeded,
  stopVerticalDevIfStartedByUs,
  startServerPolling,
  stopServerPolling,
} = require("./server-service");

const {
  sendOpen,
  sendCursor,
  sendScroll,
  sendPreviewSettings,
} = require("./preview-sync");

const {
  openPreviewWebview,
  notifyWebviewOrigin,
  notifyWebviewServerState,
  createPreviewSerializer,
} = require("./preview-webview");

function ensurePreviewState(state) {
  if (!state || typeof state !== "object") {
    throw new Error("preview state is required");
  }

  if (!Object.prototype.hasOwnProperty.call(state, "panel")) state.panel = null;
  if (!Object.prototype.hasOwnProperty.call(state, "serverPort"))
    state.serverPort = null;
  if (!Object.prototype.hasOwnProperty.call(state, "serverUrl"))
    state.serverUrl = null;
  if (!Object.prototype.hasOwnProperty.call(state, "serverOk"))
    state.serverOk = false;
  if (!Object.prototype.hasOwnProperty.call(state, "devProc"))
    state.devProc = null;
  if (!Object.prototype.hasOwnProperty.call(state, "pollingTimer"))
    state.pollingTimer = null;
  if (!Object.prototype.hasOwnProperty.call(state, "startedByUs"))
    state.startedByUs = false;
  if (!Object.prototype.hasOwnProperty.call(state, "enabled"))
    state.enabled = true;

  return state;
}

async function syncActiveEditorToPreview(state, deps = {}) {
  ensurePreviewState(state);

  const { getWorkRoot, getManuscriptRoot } = deps;

  const editor = vscode.window.activeTextEditor;
  if (!editor) return false;

  const document = editor.document;
  if (!document || document.isUntitled) return false;
  if (document.uri.scheme !== "file") return false;

  const filePath = document.uri.fsPath;
  const selection = editor.selection;
  const line = selection?.active?.line ?? 0;
  const column = selection?.active?.character ?? 0;

  const workRoot = typeof getWorkRoot === "function" ? await getWorkRoot() : "";
  const manuscriptRoot =
    typeof getManuscriptRoot === "function" ? await getManuscriptRoot() : "";

  await sendPreviewSettings({
    state,
  });

  await sendOpen({
    state,
    filePath,
    workRoot,
    manuscriptRoot,
  });

  await sendCursor({
    state,
    filePath,
    line,
    column,
    workRoot,
    manuscriptRoot,
  });

  notifyWebviewOrigin(state, {
    origin: state.serverUrl,
  });

  return true;
}

async function handleServerStartResult(result, state, deps = {}) {
  ensurePreviewState(state);

  const { updateServerStatus = () => {} } = deps;

  if (result?.warning) {
    vscode.window.showWarningMessage(`もじごと: ${result.warning}`);
  }

  if (!result?.ok) {
    state.serverOk = false;
    updateServerStatus(state);

    notifyWebviewServerState(state, {
      ok: false,
      serverUrl: state.serverUrl,
      reload: false,
    });

    if (result?.error) {
      if (result?.log) {
        const picked = await vscode.window.showWarningMessage(
          `もじごと: ${result.error}`,
          "詳細を表示",
        );
        if (picked === "詳細を表示") {
          vscode.window.showInformationMessage(result.log.slice(-3000));
        }
      } else {
        vscode.window.showWarningMessage(`もじごと: ${result.error}`);
      }
    }

    return false;
  }

  state.serverOk = true;
  updateServerStatus(state);

  notifyWebviewServerState(state, {
    ok: true,
    serverUrl: state.serverUrl,
    reload: !result.reused,
  });

  return true;
}

function registerPreviewCommands(context, deps = {}) {
  const {
    state,
    updateServerStatus = () => {},
    isDebug = false,
    ensureEnvironment = async () => {},
    getWorkRoot = async () => "",
    getManuscriptRoot = async () => "",
  } = deps;

  ensurePreviewState(state);

  let lastSelectionChangeAt = 0;
  let scrollSyncTimer = null;
  let pendingScrollEditor = null;
  let pendingScrollLine = 0;
  let lastScrollSyncKey = "";

  const scrollAfterSelectionSuppressMs = 250;
  const scrollSyncDebounceMs = 70;

  function cancelPendingScrollSync() {
    if (scrollSyncTimer) clearTimeout(scrollSyncTimer);
    scrollSyncTimer = null;
    pendingScrollEditor = null;
  }

  function scheduleEditorScrollSync(editor, line) {
    pendingScrollEditor = editor;
    pendingScrollLine = Math.max(0, Number(line || 0));

    if (scrollSyncTimer) clearTimeout(scrollSyncTimer);
    scrollSyncTimer = setTimeout(async () => {
      scrollSyncTimer = null;

      const targetEditor = pendingScrollEditor;
      pendingScrollEditor = null;

      if (!targetEditor) return;
      if (vscode.window.activeTextEditor !== targetEditor) return;
      if (!state.serverOk || !state.enabled) return;

      const document = targetEditor.document;
      if (!document || document.isUntitled) return;
      if (document.uri.scheme !== "file") return;

      const filePath = document.uri.fsPath;
      const key = `${String(filePath).toLowerCase()}:${pendingScrollLine}`;
      if (key === lastScrollSyncKey) return;

      try {
        const sent = await sendScroll({
          state,
          filePath,
          line: pendingScrollLine,
        });
        if (sent) lastScrollSyncKey = key;
      } catch {
        // 一時的なサーバー切断は次の可視範囲イベントで再試行する。
      }
    }, scrollSyncDebounceMs);
  }

  const debugOption =
    typeof isDebug === "function" ? { isDebug } : { isDebug: !!isDebug };

  async function restartPreviewServer() {
    stopServerPolling(state);
    await stopVerticalDevIfStartedByUs(state, debugOption);

    const startResult = await startVerticalDevIfNeeded(context, state, {
      ...debugOption,
    });

    const ok = await handleServerStartResult(startResult, state, {
      updateServerStatus,
    });

    if (!ok) return false;

    startServerPolling(state, {
      ...debugOption,
      intervalMs: 900,
      onStateChange: async (okNow) => {
        state.serverOk = okNow;
        updateServerStatus(state);

        notifyWebviewServerState(state, {
          ok: okNow,
          serverUrl: state.serverUrl,
          reload: okNow,
        });

        if (okNow && state.enabled) {
          await syncActiveEditorToPreview(state, {
            getWorkRoot,
            getManuscriptRoot,
          });
        }
      },
    });

    if (state.enabled) {
      await syncActiveEditorToPreview(state, {
        getWorkRoot,
        getManuscriptRoot,
      });
    }

    return true;
  }

  async function openPreviewCore(targetColumn = vscode.ViewColumn.Beside) {
    const envOk = await ensureEnvironment();
    if (envOk === false) return;

    await openPreviewWebview(context, state, {
      column: targetColumn,
      isDebug,
      onReloadRequest: async () => {
        await restartPreviewServer();
      },
      onSyncRequest: async () => {
        await syncActiveEditorToPreview(state, {
          getWorkRoot,
          getManuscriptRoot,
        });
      },
    });

    const startResult = await startVerticalDevIfNeeded(context, state, {
      ...debugOption,
    });

    const ok = await handleServerStartResult(startResult, state, {
      updateServerStatus,
    });

    if (!ok) return;

    const pingOk = await pingServer(state, debugOption);
    state.serverOk = pingOk;

    updateServerStatus(state);
    notifyWebviewServerState(state, {
      ok: pingOk,
      serverUrl: state.serverUrl,
      reload: false,
    });

    if (pingOk && state.enabled) {
      await syncActiveEditorToPreview(state, {
        getWorkRoot,
        getManuscriptRoot,
      });
    }

    startServerPolling(state, {
      ...debugOption,
      intervalMs: 900,
      onStateChange: async (okNow) => {
        state.serverOk = okNow;
        updateServerStatus(state);

        notifyWebviewServerState(state, {
          ok: okNow,
          serverUrl: state.serverUrl,
          reload: okNow,
        });

        if (okNow && state.enabled) {
          await syncActiveEditorToPreview(state, {
            getWorkRoot,
            getManuscriptRoot,
          });
        }
      },
    });
  }

  async function stopPreviewServer() {
    stopServerPolling(state);
    await stopVerticalDevIfStartedByUs(state, debugOption);

    state.serverOk = false;
    updateServerStatus(state);

    notifyWebviewServerState(state, {
      ok: false,
      serverUrl: state.serverUrl,
      reload: false,
    });
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("mojigoto.openPreviewBeside", async () => {
      await openPreviewCore(vscode.ViewColumn.Beside);
    }),

    vscode.commands.registerCommand("mojigoto.serverRestart", async () => {
      await restartPreviewServer();
    }),

    vscode.commands.registerCommand("mojigoto.serverStop", async () => {
      await stopPreviewServer();
    }),

    vscode.commands.registerCommand("mojigoto.ping", async () => {
      const ok = await pingServer(state, debugOption);
      state.serverOk = ok;

      updateServerStatus(state);
      notifyWebviewServerState(state, {
        ok,
        serverUrl: state.serverUrl,
        reload: false,
      });

      vscode.window.showInformationMessage(
        ok
          ? "もじごと: プレビューサーバーは到達可能です。"
          : "もじごと: プレビューサーバーに接続できませんでした。",
      );
    }),

    vscode.commands.registerCommand("mojigoto.toggle", async () => {
      state.enabled = !state.enabled;

      vscode.window.showInformationMessage(
        state.enabled
          ? "もじごと: プレビュー自動同期を ON にしました。"
          : "もじごと: プレビュー自動同期を OFF にしました。",
      );

      if (state.enabled && state.serverOk) {
        await syncActiveEditorToPreview(state, {
          getWorkRoot,
          getManuscriptRoot,
        });
      }
    }),

    vscode.commands.registerCommand(
      "mojigoto.syncPreviewToActiveEditor",
      async () => {
        if (!state.serverOk) {
          const ok = await pingServer(state, debugOption);
          state.serverOk = ok;
        }

        if (!state.serverOk) {
          vscode.window.showWarningMessage(
            "もじごと: プレビューサーバーが起動していません。",
          );
          return;
        }

        await syncActiveEditorToPreview(state, {
          getWorkRoot,
          getManuscriptRoot,
        });
      },
    ),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (!editor) return;
      if (!state.serverOk) return;
      if (!state.enabled) return;

      lastSelectionChangeAt = Date.now();
      cancelPendingScrollSync();

      await syncActiveEditorToPreview(state, {
        getWorkRoot,
        getManuscriptRoot,
      });
    }),

    vscode.window.onDidChangeTextEditorSelection(async (event) => {
      if (!event?.textEditor) return;
      if (vscode.window.activeTextEditor !== event.textEditor) return;
      if (!state.serverOk) return;
      if (!state.enabled) return;

      lastSelectionChangeAt = Date.now();
      cancelPendingScrollSync();

      await syncActiveEditorToPreview(state, {
        getWorkRoot,
        getManuscriptRoot,
      });
    }),

    vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
      if (!event?.textEditor) return;
      if (vscode.window.activeTextEditor !== event.textEditor) return;
      if (!state.serverOk) return;
      if (!state.enabled) return;

      // カーソル移動でエディタが自動スクロールした直後は、既存の
      // カーソル追従を優先し、可視範囲イベントで上書きしない。
      if (Date.now() - lastSelectionChangeAt < scrollAfterSelectionSuppressMs) {
        return;
      }

      const firstVisibleRange = Array.isArray(event.visibleRanges)
        ? event.visibleRanges[0]
        : null;
      const topLine = firstVisibleRange?.start?.line;
      if (!Number.isFinite(topLine)) return;

      scheduleEditorScrollSync(event.textEditor, topLine);
    }),

    {
      dispose() {
        cancelPendingScrollSync();
        stopServerPolling(state);
      },
    },
  );
  updateServerStatus(state);

  const serializer = createPreviewSerializer(context, state, {
    isDebug,
    onReloadRequest: async () => {
      await restartPreviewServer();
    },
    onSyncRequest: async () => {
      await syncActiveEditorToPreview(state, {
        getWorkRoot,
        getManuscriptRoot,
      });
    },
  });

  return {
    serializer,
  };
}

module.exports = {
  registerPreviewCommands,
  syncActiveEditorToPreview,
};
