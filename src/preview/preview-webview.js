const vscode = require("vscode");
const { escapeHtml } = require("../core/path-utils");

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

  return state;
}

function makeWebviewHtml(options = {}) {
  const {
    title = "もじごとプレビュー",
    origin = "",
    serverOk = false,
  } = options;

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; frame-src http: https:; connect-src http: https:; img-src http: https: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';"
  >
  <title>${escapeHtml(title)}</title>
  <style>
    html, body {
      height: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: #111;
    }

    iframe {
      width: 100%;
      height: 100%;
      border: 0;
      display: block;
      background: #fff;
    }

    .badge {
      position: fixed;
      right: 10px;
      top: 10px;
      z-index: 10;
      font: 12px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
      padding: 4px 8px;
      border-radius: 999px;
      background: rgba(0, 0, 0, .55);
      color: #fff;
    }
  </style>
</head>
<body>
  <div class="badge" id="badge">server: ${serverOk ? "ON" : "OFF"}</div>
  <iframe id="frame" src="${escapeHtml(origin || "about:blank")}"></iframe>

  <script>
    (function () {
      const badge = document.getElementById("badge");
      const frame = document.getElementById("frame");
      const vscode = acquireVsCodeApi();

      let origin = ${JSON.stringify(origin || "")};

      function set(ok) {
        badge.textContent = ok ? "server: ON" : "server: OFF";
        badge.style.opacity = ok ? "0.65" : "1";
      }

      function setOrigin(newOrigin) {
        const nextOrigin = String(newOrigin || "");
        if (!nextOrigin) return;

        // origin が同じなら iframe を再読込しない
        if (origin === nextOrigin) return;

        origin = nextOrigin;
        frame.src = origin + "/?ts=" + Date.now();
      }

      function reloadFrame() {
        if (!origin) return;
        frame.src = origin + "/?ts=" + Date.now();
      }

      window.addEventListener("message", (ev) => {
        const d = ev.data;
        if (!d) return;

        if (d.type === "mojigoto-sync-origin") {
          setOrigin(d.origin);
          return;
        }

        if (d.type === "mojigoto-sync-server") {
          set(!!d.ok);
          if (d.ok && d.reload) reloadFrame();
          return;
        }

        if (ev.source === frame.contentWindow && d.type === "open-vscode" && d.path) {
          vscode.postMessage({ type: "openFile", path: d.path });
          return;
        }

        if (ev.source === frame.contentWindow && d.type === "open-external" && d.url) {
          vscode.postMessage({ type: "openExternal", url: d.url });
          return;
        }
      });

      window.addEventListener("message", async (event) => {
        const data = event.data;
        if (!data) return;

        if (data.type === "copy-preview-url") {
          try {
            await navigator.clipboard.writeText(String(data.url || ""));
          } catch (e) {}
          return;
        }
      });

      window.addEventListener("message", async (event) => {
        const data = event.data;
        if (!data) return;

        if (data.type === "set-vertical-punctuation-layout") {
          const value = data.value === "pushout" ? "pushout" : "hanging";

          // ここは既存の拡張側コマンド呼び出しに合わせる
          vscode.postMessage({
            type: "update-setting",
            key: "mojigoto.verticalPunctuationLayout",
            value,
          });
          return;
        }

        if (data.type === "set-use-typography-adjustments") {
          vscode.postMessage({
            type: "update-setting",
            key: "mojigoto.useTypographyAdjustments",
            value: data.value !== false,
          });
          return;
        }
      });

      set(${serverOk ? "true" : "false"});

      try {
        vscode.postMessage({ type: "mojigoto-ready" });
      } catch (e) {}
    })();
  </script>
</body>
</html>`;
}

function notifyWebviewOrigin(state, payload = {}) {
  ensurePreviewState(state);
  if (!state.panel) return false;

  const origin = payload.origin || state.serverUrl || "";

  try {
    state.panel.webview.postMessage({
      type: "mojigoto-sync-origin",
      origin,
    });
    return true;
  } catch {
    return false;
  }
}

function notifyWebviewServerState(state, payload = {}) {
  ensurePreviewState(state);
  if (!state.panel) return false;

  try {
    state.panel.webview.postMessage({
      type: "mojigoto-sync-server",
      ok: !!payload.ok,
      reload: !!payload.reload,
      origin: payload.origin || state.serverUrl || "",
    });
    return true;
  } catch {
    return false;
  }
}

function attachPreviewWebviewHandlers(context, state, options = {}) {
  ensurePreviewState(state);
  if (!state.panel) return;

  const {
    isDebug = false,
    onReady,
    onOpenExternal,
    onOpenFile,
    onReloadRequest,
    onSyncRequest,
  } = options;

  state.panel.webview.onDidReceiveMessage(
    async (msg) => {
      const debug = typeof isDebug === "function" ? !!isDebug() : !!isDebug;
      if (debug) {
        try {
          console.log("[mojigoto] recv from webview:", msg);
        } catch {}
      }

      if (!msg) return;

      if (msg.type === "mojigoto-ready") {
        if (typeof onReady === "function") {
          await onReady(msg);
        }
        return;
      }

      if (msg.type === "reloadRequest") {
        if (typeof onReloadRequest === "function") {
          await onReloadRequest(msg);
        }
        return;
      }

      if (msg.type === "syncRequest") {
        if (typeof onSyncRequest === "function") {
          await onSyncRequest(msg);
        }
        return;
      }

      if (msg.type === "openExternal" && msg.url) {
        if (typeof onOpenExternal === "function") {
          await onOpenExternal(msg.url, msg);
        }
        return;
      }

      if (
        msg.type === "update-setting" &&
        (msg.key === "mojigoto.verticalPunctuationLayout" ||
          msg.key === "mojigoto.useTypographyAdjustments")
      ) {
        await vscode.workspace
          .getConfiguration("mojigoto")
          .update(
            msg.key === "mojigoto.useTypographyAdjustments"
              ? "useTypographyAdjustments"
              : "verticalPunctuationLayout",
            msg.value,
            vscode.ConfigurationTarget.Workspace,
          );
        return;
      }

      if (msg.type === "openFile" && msg.path) {
        if (typeof onOpenFile === "function") {
          await onOpenFile(msg.path, msg);
        }
      }
    },
    undefined,
    context.subscriptions,
  );
}

async function defaultOpenExternal(url) {
  try {
    await vscode.env.openExternal(vscode.Uri.parse(url));
  } catch {}
}

async function defaultOpenFile(filePath) {
  const uri = vscode.Uri.file(filePath);
  const doc = await vscode.workspace.openTextDocument(uri);

  const col =
    vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

  await vscode.window.showTextDocument(doc, {
    preview: false,
    viewColumn: col,
    preserveFocus: false,
  });
}

function getOriginFromState(state) {
  ensurePreviewState(state);
  return state.serverUrl || "";
}

async function openPreviewWebview(context, state, options = {}) {
  ensurePreviewState(state);

  const targetColumn = options.column ?? vscode.ViewColumn.Beside;
  const title = options.title || "もじごとプレビュー";

  if (state.panel) {
    try {
      state.panel.reveal(targetColumn, false);
      state.panel.title = title;
      return state.panel;
    } catch {
      state.panel = null;
    }
  }

  const panel = vscode.window.createWebviewPanel(
    "mojigoto.preview",
    title,
    { viewColumn: targetColumn, preserveFocus: false },
    { enableScripts: true, retainContextWhenHidden: true },
  );

  state.panel = panel;

  panel.webview.html = makeWebviewHtml({
    title,
    origin: getOriginFromState(state),
    serverOk: !!state.serverOk,
  });

  attachPreviewWebviewHandlers(context, state, {
    isDebug: options.isDebug,
    onReady: async () => {
      notifyWebviewOrigin(state, {
        origin: getOriginFromState(state),
      });

      notifyWebviewServerState(state, {
        ok: !!state.serverOk,
        reload: false,
        origin: getOriginFromState(state),
      });

      if (typeof options.onReady === "function") {
        await options.onReady();
      }
    },
    onOpenExternal: options.onOpenExternal || defaultOpenExternal,
    onOpenFile: options.onOpenFile || defaultOpenFile,
    onReloadRequest: options.onReloadRequest,
    onSyncRequest: options.onSyncRequest,
  });

  panel.onDidDispose(
    () => {
      if (state.panel === panel) {
        state.panel = null;
      }
    },
    null,
    context.subscriptions,
  );

  return panel;
}

function createPreviewSerializer(context, state, options = {}) {
  ensurePreviewState(state);

  const title = options.title || "もじごとプレビュー";

  return vscode.window.registerWebviewPanelSerializer("mojigoto.preview", {
    async deserializeWebviewPanel(webviewPanel) {
      state.panel = webviewPanel;

      webviewPanel.webview.options = {
        enableScripts: true,
        retainContextWhenHidden: true,
      };

      webviewPanel.title = title;
      webviewPanel.webview.html = makeWebviewHtml({
        title,
        origin: getOriginFromState(state),
        serverOk: !!state.serverOk,
      });

      attachPreviewWebviewHandlers(context, state, {
        isDebug: options.isDebug,
        onReady: async () => {
          notifyWebviewOrigin(state, {
            origin: getOriginFromState(state),
          });

          notifyWebviewServerState(state, {
            ok: !!state.serverOk,
            reload: false,
            origin: getOriginFromState(state),
          });

          if (typeof options.onReady === "function") {
            await options.onReady();
          }
        },
        onOpenExternal: options.onOpenExternal || defaultOpenExternal,
        onOpenFile: options.onOpenFile || defaultOpenFile,
        onReloadRequest: options.onReloadRequest,
        onSyncRequest: options.onSyncRequest,
      });

      webviewPanel.onDidDispose(
        () => {
          if (state.panel === webviewPanel) {
            state.panel = null;
          }
        },
        null,
        context.subscriptions,
      );
    },
  });
}

module.exports = {
  makeWebviewHtml,
  notifyWebviewOrigin,
  notifyWebviewServerState,
  attachPreviewWebviewHandlers,
  openPreviewWebview,
  createPreviewSerializer,
};
