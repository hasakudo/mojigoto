const vscode = require("vscode");
const { setWebviewPanelThemeIcon } = require("../views/shared/webview-panel-icon");
const { normalizePanelState } = require("./merged-manuscript-panel-state");
const { getPanelHtml } = require("./merged-manuscript-panel-html");
const {
  MERGED_MANUSCRIPT_BROWSER_PANEL_STATE_KEY: PANEL_PERSIST_KEY,
  normalizePersistedPanelState, updatePersistedPanelUiState,
} = require("./merged-manuscript-panel-settings");

let mergedManuscriptBrowserPanelRef = null;

function revealMergedManuscriptBrowserPanel() {
  if (!mergedManuscriptBrowserPanelRef) return false;
  mergedManuscriptBrowserPanelRef.reveal(vscode.ViewColumn.Active);
  return true;
}

function openMergedManuscriptBrowserPanel(
  context,
  initialState = {},
  handlers = {},
) {
  if (revealMergedManuscriptBrowserPanel()) {
    return Promise.resolve({ reused: true });
  }

  const persistedState = normalizePersistedPanelState(
    context?.workspaceState?.get(PANEL_PERSIST_KEY) || {},
  );

  const state = normalizePanelState({
    ...persistedState,
    ...initialState,
  });

  const resetState = normalizePanelState(
    initialState.resetState || initialState,
  );

  return new Promise((resolve, reject) => {
    const panel = vscode.window.createWebviewPanel(
      "mojigotoMergedManuscriptBrowserPanel",
      "縦書きHTML書き出し",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );
    mergedManuscriptBrowserPanelRef = panel;

    let settled = false;
    let submitting = false;
    let previewVersion = 0;

    function finish(result, options = {}) {
      const { disposePanel = true } = options;
      if (settled) return;
      settled = true;

      if (mergedManuscriptBrowserPanelRef === panel) {
        mergedManuscriptBrowserPanelRef = null;
      }

      if (disposePanel) {
        try { panel.dispose(); } catch {}
      }
      if ("error" in options) reject(options.error);
      else resolve(result);
    }

    async function postResult(message) {
      if (settled) return;
      try { await panel.webview.postMessage(message); }
      catch (error) {
        if (!settled) console.warn("mojigoto: export panel response failed", error);
      }
    }

    panel.onDidDispose(() => finish(null, { disposePanel: false }));

    try {
      setWebviewPanelThemeIcon(panel, "export");
      panel.webview.html = getPanelHtml(panel.webview, state, resetState);

      panel.webview.onDidReceiveMessage(
        async (message) => {
          if (settled) return;
          const type = String(message?.type || "");

          if (type === "requestRealPrintPreview") {
            const version = ++previewVersion;
            try {
              if (typeof handlers.onPreview === "function") {
                const result = await handlers.onPreview(message?.payload || {});

                if (version !== previewVersion) return;
                await postResult({
                  type: "realPrintPreviewResult",
                  requestId: message.requestId,
                  ok: true,
                  html: result?.html || "",
                  message: result?.message || "",
                });
                return;
              }

              await postResult({
                type: "realPrintPreviewResult",
                requestId: message.requestId,
                ok: false,
                message: "プレビュー生成処理が未設定です。",
              });
            } catch (error) {
              if (version !== previewVersion) return;
              await postResult({
                type: "realPrintPreviewResult",
                requestId: message.requestId,
                ok: false,
                message:
                  error?.message ||
                  String(error || "プレビュー生成に失敗しました。"),
              });
            }

            return;
          }

          if (type === "showSimplePrintGuide") {
            const guideMessage = String(message?.message || "").trim();

            await vscode.window.showInformationMessage(
              guideMessage || "体裁の目安を取得できませんでした。",
              { modal: true },
            );

            return;
          }

          if (type === "persistUiState") {
            try {
              await updatePersistedPanelUiState(context, message?.state || {});
            } catch (error) {
              if (!settled) vscode.window.showWarningMessage(
                `もじごと: 書き出し設定を保存できませんでした。${error?.message || String(error)}`,
              );
            }
            return;
          }

          if (type === "cancel") {
            finish(null);
            return;
          }

          if (type === "submit") {
            if (submitting) return;
            submitting = true;
            const payload = message?.payload || {};
            const nextState = {
              ...state,
              ...payload,
            };

            try {
              await updatePersistedPanelUiState(context, nextState);
              if (settled) return;
              if (typeof handlers.onSubmit === "function") {
                const result = await handlers.onSubmit(nextState);
                await postResult({
                  type: "submitResult",
                  ok: true,
                  message: result?.message || "書き出しました。",
                });
              } else {
                await postResult({
                  type: "submitResult",
                  ok: true,
                  message: "書き出しました。",
                });
              }
            } catch (error) {
              await postResult({
                type: "submitResult",
                ok: false,
                message:
                  error?.message || String(error || "書き出しに失敗しました。"),
              });
            } finally {
              submitting = false;
            }

            return;
          }
        },
        null,
        [],
      );

    } catch (error) {
      finish(null, { error });
    }
  });
}

module.exports = {
  openMergedManuscriptBrowserPanel,
  revealMergedManuscriptBrowserPanel,
};
