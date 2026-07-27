const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

const {
  readNoteFile,
  saveNoteFile,
  listNotesWithMeta,
} = require("../data/note-store");

const { getNonce, escapeHtml } = require("../core/path-utils");
const { notifyNoteUpdated } = require("./note-webview");
const { getCopyPanelScript } = require("./note-webview/script-copy-panel");

const copyPanels = new Map();

const css = fs.readFileSync(
  path.join(__dirname, "note-webview", "note-copy-webview.css"),
  "utf8",
);

function escapeScriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function getCopyPanelTitle(note) {
  const kind = note.type === "plot" ? "プロット" : "資料";
  const title = String(note.title || "").trim();
  return title ? `${kind}コピー: ${title}` : `${kind}コピー`;
}

function buildCopyBootState(note, options = {}) {
  return {
    ...note,
    filePath: String(options.filePath || ""),
    type: String(options.type || note.type || "plot"),
    noteType: String(options.type || note.noteType || "plot"),
    workDir: String(options.workDir || ""),
    workName: String(options.workName || ""),
    workTitle: String(options.workTitle || ""),
    openMode: String(options.openMode || "same"),
    layoutMode: String(options.layoutMode || "full"),
  };
}

function getCopyPanelKey(filePath, openMode = "same") {
  return `${String(filePath || "")}::${String(openMode || "same")}`;
}

function getNoteCopyWebviewHtml(note) {
  const nonce = getNonce();
  const noteJson = escapeScriptJson(note);
  const rootLayoutClass =
    note.layoutMode === "compact"
      ? "copyStandaloneRoot isCompact"
      : "copyStandaloneRoot";

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(getCopyPanelTitle(note))}</title>
<style>
${css}
</style>
</head>
<body>
  <div class="noteShell">
    <div class="paneHeader paneHeaderGlobal">
      <div class="paneHeaderLeft">
        <h1 class="paneTitle">他ノートからコピー</h1>
      </div>
      <div class="paneHeaderRight">
        <button class="secondary" type="button" id="closeCopyPanelBtn">
          閉じる
          <span class="kbdHint">Esc</span>
        </button>
      </div>
    </div>

    <div id="toastStatus" class="toastStatus" aria-live="polite"></div>

    <div class="${rootLayoutClass}">
      <div class="copyPanelDialogBody">
        <aside class="copyPanelControls">
          <div class="copyPanelSummaryCard copyOpenSummary" id="copyPanelSummary"></div>
          <div class="copyPanelSettings" id="copyPanelSettings">
            <div class="copySettingsSection">
              <div class="copySettingsSectionTitle">コピー元</div>
              <div class="row">
                <select id="copySourceSelect"></select>
              </div>
            </div>

            <div class="copySettingsSection">
              <div class="copySettingsSectionTitle">項目・区分のコピー先</div>
              <div class="row">
                <label class="label" for="copyTargetGroupSelect">コピー先大分類</label>
                <select id="copyTargetGroupSelect"></select>
              </div>

              <div class="row">
                <label class="label" for="copyTargetPositionSelect">挿入位置</label>
                <select id="copyTargetPositionSelect"></select>
              </div>
            </div>

            <div class="copySettingsSection">
              <div class="copySettingsSectionTitle">大分類コピーの位置</div>
              <div class="row">
                <label class="label" for="copyGroupInsertPositionSelect">大分類の挿入位置</label>
                <select id="copyGroupInsertPositionSelect"></select>
              </div>
            </div>
          </div>

          <div class="inlineMessage" id="copyPanelMessage" hidden></div>
        </aside>

        <section class="copyPanelSource">
          <div id="copySourceContent" class="templateList copyPanelBody"></div>
        </section>

        <aside class="copyPanelPreview" id="copyPanelPreviewPane">
          <div class="copyPreviewModeToggle">
            <button class="secondary isActive" type="button" id="copyPreviewItemBtn">項目位置</button>
            <button class="secondary" type="button" id="copyPreviewGroupBtn">大分類位置</button>
          </div>

          <div class="copyPanelSummaryCard" id="copyTargetPreview"></div>
          <div id="copyPanelActionStatus" class="copyPanelActionStatus" hidden></div>

          <div class="copyPanelPreviewActions">
            <button class="secondary" type="button" id="copyUndoBtn" disabled>
              直前のコピーを取り消す
            </button>
            <button class="primary" type="button" id="copyPanelSaveBtn">
              ノートを保存
            </button>
          </div>
        </aside>
      </div>
    </div>
  </div>

    <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const initial = ${noteJson};

    const toastStatusEl = document.getElementById("toastStatus");

    const copyUndoBtn = document.getElementById("copyUndoBtn");
    const copyPanelActionStatus = document.getElementById("copyPanelActionStatus");
    const copyPanelSaveBtn = document.getElementById("copyPanelSaveBtn");
    const closeCopyPanelBtn = document.getElementById("closeCopyPanelBtn");
    const copyPanelMessageEl = document.getElementById("copyPanelMessage");
    const copySourceContentEl = document.getElementById("copySourceContent");
    const copyPanelSummaryEl = document.getElementById("copyPanelSummary");
    const copyTargetPreviewEl = document.getElementById("copyTargetPreview");
    const copyPanelSettingsEl = document.getElementById("copyPanelSettings");
    const copyPreviewItemBtn = document.getElementById("copyPreviewItemBtn");
    const copyPreviewGroupBtn = document.getElementById("copyPreviewGroupBtn");
    const copySourceSelect = document.getElementById("copySourceSelect");
    const copyTargetGroupSelect = document.getElementById("copyTargetGroupSelect");
    const copyTargetPositionSelect = document.getElementById("copyTargetPositionSelect");
    const copyGroupInsertPositionSelect = document.getElementById("copyGroupInsertPositionSelect");

    let copySourceListState = [];
    let copySourceNotePath = "";
    let copySourceNoteState = null;
    let copyTargetGroupId = "";
    let copyTargetPositionValue = "end";
    let copyGroupInsertPositionValue = "end";
    let isCopySettingsOpen = true;
    let copyUndoState = null;
    let copyPreviewMode = "item";
    let copyPanelActionStatusTimer = null;
    let toastTimer = null;
    let dirty = false;

    let state = {
      ...initial,
      groups: Array.isArray(initial?.groups) ? initial.groups : [],
    };

    function esc(v) {
      return String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function normalizeGroup(group) {
      const next = { ...group };
      next.id = String(next.id || crypto.randomUUID());
      next.title = String(next.title || "");
      next.items = Array.isArray(next.items) ? next.items.map(normalizeItem) : [];
      return next;
    }

    function normalizeItem(item) {
      const next = { ...item };
      next.id = String(next.id || crypto.randomUUID());
      next.kind = next.kind === "divider" ? "divider" : "entry";
      return next;
    }

    state.groups = Array.isArray(state.groups) ? state.groups.map(normalizeGroup) : [];

    function setStatus(message, useToast = false) {
      if (!toastStatusEl) return;

      if (!useToast || !message) {
        toastStatusEl.classList.remove("isVisible");
        toastStatusEl.textContent = "";
        return;
      }

      if (toastTimer) clearTimeout(toastTimer);
      toastStatusEl.textContent = message;
      toastStatusEl.classList.add("isVisible");
      toastTimer = setTimeout(() => {
        toastStatusEl.classList.remove("isVisible");
        toastStatusEl.textContent = "";
      }, 1800);
    }

    function clearStatus() {
      setStatus("", false);
    }

    function markDirty() {
      dirty = true;
    }

    function refreshCopyUiAfterChange() {
      renderCopyTargetOptions();
      renderCopyGroupInsertPositionOptions();
      renderCopyPanelSummary();
      renderCopyTargetPreview();
    }

    function shouldApplyImmediately() {
      return String(state?.layoutMode || initial?.layoutMode || "") === "compact";
    }

    function requestApplyCopyDraft() {
      if (!shouldApplyImmediately()) return;

      vscode.postMessage({
        type: "applyCopyDraft",
        payload: {
          ...state,
          title: String(state?.title || initial?.title || ""),
          groups: state.groups,
        },
      });
    }

    function applyIncomingNoteState(next) {
      state = {
        ...state,
        ...next,
        groups: Array.isArray(next?.groups)
          ? next.groups.map(normalizeGroup)
          : [],
      };

      refreshCopyUiAfterChange();
    }

    function renderGroups() {}
    function renderPreview() {}

    ${getCopyPanelScript()}

    function registerCopyEvents() {
      copySourceSelect?.addEventListener("change", () => {
        copySourceNotePath = copySourceSelect.value || "";
        copySourceNoteState = null;
        renderCopyPanel();
        renderCopyPanelSummary();

        if (copySourceNotePath) {
          requestCopySourceNote(copySourceNotePath);
        }
      });

      copyTargetGroupSelect?.addEventListener("change", () => {
        copyTargetGroupId = copyTargetGroupSelect.value || "";
        copyTargetPositionValue = "end";
        renderCopyTargetPositionOptions();
        renderCopyPanelSummary();
        renderCopyTargetPreview();
        showCopyPanelMessage("");
      });

      copyTargetPositionSelect?.addEventListener("change", () => {
        copyTargetPositionValue = copyTargetPositionSelect.value || "";
        renderCopyPanelSummary();
        renderCopyTargetPreview();
        showCopyPanelMessage("");
      });

      copyGroupInsertPositionSelect?.addEventListener("change", () => {
        copyGroupInsertPositionValue = copyGroupInsertPositionSelect.value || "";
        renderCopyPanelSummary();
        renderCopyTargetPreview();
        showCopyPanelMessage("");
      });

      copyUndoBtn?.addEventListener("click", () => {
        undoLastCopyAction();
      });

      copyPreviewItemBtn?.addEventListener("click", () => {
        copyPreviewMode = "item";
        renderCopyTargetPreview();
      });

      copyPreviewGroupBtn?.addEventListener("click", () => {
        copyPreviewMode = "group";
        renderCopyTargetPreview();
      });

      copyPanelSaveBtn?.addEventListener("click", () => {
        vscode.postMessage({
          type: "saveCopiedNote",
          payload: {
            ...state,
            title: state.title || "",
            groups: state.groups,
          },
        });
      });

      closeCopyPanelBtn?.addEventListener("click", () => {
        vscode.postMessage({ type: "close" });
      });

      window.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          vscode.postMessage({ type: "close" });
          return;
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          vscode.postMessage({
            type: "saveCopiedNote",
            payload: {
              ...state,
              title: state.title || "",
              groups: state.groups,
            },
          });
        }
      });

      window.addEventListener("message", (event) => {
        const msg = event.data;
        if (!msg) return;

        if (msg.type === "copySourceList") {
          copySourceListState = Array.isArray(msg.items) ? msg.items : [];

          const currentPathExists = copySourceListState.some(
            (item) => item.fsPath === copySourceNotePath,
          );

          if (!currentPathExists) {
            copySourceNotePath = copySourceListState[0]?.fsPath || "";
            copySourceNoteState = null;
          }

          renderCopyPanel();

          if (copySourceNotePath) {
            requestCopySourceNote(copySourceNotePath);
          }
          return;
        }

        if (msg.type === "copySourceLoaded") {
          copySourceNoteState = msg.note || null;
          renderCopyPanel();
          return;
        }

        if (msg.type === "copyDraftApplied") {
          applyIncomingNoteState(msg.payload || {});
          dirty = false;
          setStatus("ノートへ反映しました。", true);
          showCopyPanelActionStatus("反映しました。");
          return;
        }

        if (msg.type === "noteSaved") {
          applyIncomingNoteState(msg.payload || {});
          dirty = false;
          setStatus("保存しました。", true);
          showCopyPanelActionStatus("保存しました。");
          return;
        }

        if (msg.type === "error") {
          setStatus(msg.message || "処理に失敗しました。", true);
          return;
        }
      });
    }

    registerCopyEvents();
    renderCopyTargetOptions();
    renderCopyGroupInsertPositionOptions();
    renderCopyPanelSummary();
    renderCopyTargetPreview();
    requestCopySourceList();
  </script>
</body>
</html>`;
}

async function openNoteCopyWebview(context, treeProvider, options) {
  const {
    filePath,
    type,
    workDir = "",
    workName = "",
    workTitle = "",
    openMode = "same",
    layoutMode = openMode === "beside" ? "compact" : "full",
  } = options;

  const panelKey = getCopyPanelKey(filePath, openMode);
  const targetViewColumn =
    openMode === "beside" ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active;

  const existing = copyPanels.get(panelKey);
  if (existing) {
    existing.reveal(targetViewColumn, false);
    return existing;
  }

  const rawNote = await readNoteFile(filePath, type);
  const note = buildCopyBootState(rawNote, {
    filePath,
    type,
    workDir,
    workName,
    workTitle,
    openMode,
    layoutMode,
  });

  const panel = vscode.window.createWebviewPanel(
    "mojigoto.noteCopyEditor",
    getCopyPanelTitle(note),
    targetViewColumn,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    },
  );

  copyPanels.set(panelKey, panel);
  panel.webview.html = getNoteCopyWebviewHtml(note);

  function resolveWorkDirForCurrentNote() {
    if (workDir) return workDir;

    if (!filePath) return "";
    return path.dirname(path.dirname(path.dirname(filePath)));
  }

  panel.webview.onDidReceiveMessage(
    async (message) => {
      try {
        if (message?.type === "close") {
          panel.dispose();
          return;
        }

        if (message?.type === "requestCopySourceList") {
          const currentWorkDir = resolveWorkDirForCurrentNote();

          const items = await listNotesWithMeta(
            type,
            currentWorkDir ? { fsPath: currentWorkDir } : undefined,
          );

          const filtered = items.filter(
            (item) => String(item.fsPath || "") !== String(filePath),
          );

          panel.webview.postMessage({
            type: "copySourceList",
            items: filtered,
          });
          return;
        }

        if (message?.type === "requestCopySourceNote") {
          const sourcePath = String(message?.filePath || "");
          if (!sourcePath) {
            panel.webview.postMessage({
              type: "error",
              message: "コピー元ノートのパスがありません。",
            });
            return;
          }

          const sourceNote = await readNoteFile(sourcePath, type);
          panel.webview.postMessage({
            type: "copySourceLoaded",
            note: sourceNote,
          });
          return;
        }

        if (message?.type === "applyCopyDraft") {
          const saved = await saveNoteFile(filePath, {
            ...message.payload,
            type,
          });

          const nextNote = buildCopyBootState(saved, {
            filePath,
            type,
            workDir,
            workName,
            workTitle,
            openMode,
            layoutMode,
          });

          panel.webview.postMessage({
            type: "copyDraftApplied",
            payload: nextNote,
          });

          await notifyNoteUpdated(filePath);
          treeProvider?.refresh();
          return;
        }

        if (message?.type === "saveCopiedNote") {
          const saved = await saveNoteFile(filePath, {
            ...message.payload,
            type,
          });

          const nextNote = buildCopyBootState(saved, {
            filePath,
            type,
            workDir,
            workName,
            workTitle,
            openMode,
            layoutMode,
          });

          panel.webview.postMessage({
            type: "noteSaved",
            payload: nextNote,
          });

          await notifyNoteUpdated(filePath);
          treeProvider?.refresh();
          return;
        }
      } catch (error) {
        panel.webview.postMessage({
          type: "error",
          message: `処理に失敗しました: ${error.message || String(error)}`,
        });
      }
    },
    null,
    context.subscriptions,
  );

  panel.onDidDispose(() => {
    if (copyPanels.get(panelKey) === panel) {
      copyPanels.delete(panelKey);
    }
  });

  return panel;
}

module.exports = {
  openNoteCopyWebview,
};
