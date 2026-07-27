const vscode = require("vscode");
const path = require("path");
const { isSingleMode } = require("../core/mojigoto-context");
const { triggerStatsRefresh } = require("../stats/stats-utils");
const {
  createEmptyConceptMemos,
  createConceptMemoDraft,
  readConceptMemos,
  writeConceptMemos,
} = require("../data/concept-memo-store");
const { applyConceptMemoToNoteItem } = require("../data/note-store");
const {
  getMojigotoDirForSingle,
  getMojigotoDirForWork,
} = require("../core/mojigoto-paths");
const {
  getConceptMemoWebviewHtml,
} = require("./concept-memo/concept-memo-html");
const { resolveActualNotePath } = require("../core/mojigoto-paths");

const openConceptMemoPanels = new Map();

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

  const conceptMemoFilePathKey = path.normalize(filePath);

  openConceptMemoPanels.set(filePath, panel);
  openConceptMemoPanels.set(conceptMemoFilePathKey, panel);

  panel.webview.options = {
    enableScripts: true,
    retainContextWhenHidden: true,
  };

  panel.title = title;
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

  panel.onDidDispose(() => {
    openConceptMemoPanels.delete(filePath);
    if (openConceptMemoPanels.get(conceptMemoFilePathKey) === panel) {
      openConceptMemoPanels.delete(conceptMemoFilePathKey);
    }
  });

  let currentData = initialData;

  panel.webview.onDidReceiveMessage(async (message) => {
    if (!message || typeof message !== "object") return;

    switch (message.type) {
      case "ready":
        panel.webview.postMessage({
          type: "loadConceptMemos",
          payload: {
            filePath,
            workDir,
            workTitle,
            data: currentData,
            selectedMemoId,
            initialQuickFilters,
          },
        });
        break;

      case "createMemo": {
        const memos = Array.isArray(currentData?.memos)
          ? [...currentData.memos]
          : [];
        const nextMemo = createConceptMemoDraft({
          order: memos.length,
          title: "新規メモ",
        });

        memos.unshift(nextMemo);
        currentData = {
          ...currentData,
          updatedAt: new Date().toISOString(),
          memos,
        };

        panel.webview.postMessage({
          type: "loadConceptMemos",
          payload: {
            filePath,
            workDir,
            workTitle,
            data: currentData,
            selectedMemoId: nextMemo.id,
            initialQuickFilters,
          },
        });

        panel.webview.postMessage({
          type: "showToast",
          message: "新規メモを追加しました。",
        });
        break;
      }

      case "saveConceptMemos": {
        try {
          const nextData = {
            version: 1,
            updatedAt: new Date().toISOString(),
            memos: Array.isArray(message.payload?.memos)
              ? message.payload.memos
              : [],
          };

          currentData = await writeConceptMemos(filePath, nextData);

          panel.webview.postMessage({
            type: "conceptMemosSaved",
            payload: {
              filePath,
              workDir,
              workTitle,
              data: currentData,
              selectedMemoId: message.payload?.selectedMemoId || "",
            },
          });

          await triggerStatsRefresh();

          if (!message.payload?.silentToast) {
            panel.webview.postMessage({
              type: "showToast",
              message: "保存しました。",
            });
          }
        } catch (error) {
          panel.webview.postMessage({
            type: "conceptMemosSaveError",
            message: error.message || String(error),
          });

          panel.webview.postMessage({
            type: "showToast",
            message: "保存に失敗しました。",
            isError: true,
          });
        }
        break;
      }

      case "applyConceptMemoToNoteItem": {
        try {
          const payload = message.payload || {};
          const resolvedNotePath = resolveActualNotePath(
            String(payload.notePath || ""),
            workDir,
            String(payload.noteType || "plot"),
          );

          await applyConceptMemoToNoteItem({
            ...payload,
            notePath: resolvedNotePath,
          });

          const { notifyNoteUpdated } = require("./note-webview");
          await notifyNoteUpdated(resolvedNotePath);

          panel.webview.postMessage({
            type: "conceptMemoAppliedToNoteItem",
            payload: {
              autoSaveAfterApply: Boolean(message?.payload?.autoSaveAfterApply),
            },
          });
        } catch (error) {
          panel.webview.postMessage({
            type: "showToast",
            message: `項目メモへの反映に失敗しました: ${error.message || String(error)}`,
            isError: true,
          });
        }
        break;
      }

      case "openSourceNoteFromConceptMemo": {
        try {
          const payload = message.payload || {};
          const resolvedNotePath = resolveActualNotePath(
            String(payload.notePath || ""),
            workDir,
            String(payload.noteType || "plot"),
          );

          const { openNoteWebview } = require("./note-webview");

          await openNoteWebview(context, treeProvider, {
            filePath: resolvedNotePath,
            type: String(payload.noteType || "plot"),
            workDir,
            workName: workTitle,
            focusGroupId: String(payload.groupId || ""),
            focusItemId: String(payload.itemId || ""),
            openItemMemo: true,
          });
        } catch (error) {
          panel.webview.postMessage({
            type: "showToast",
            message: `ノートを開けませんでした: ${error.message || String(error)}`,
            isError: true,
          });
        }
        break;
      }

      case "confirmDeleteMemo": {
        const titleText = String(message.payload?.title || "無題メモ");
        const picked = await vscode.window.showWarningMessage(
          `「${titleText}」を削除しますか？`,
          { modal: true },
          "削除",
          "キャンセル",
        );

        if (picked === "削除") {
          panel.webview.postMessage({
            type: "deleteMemoConfirmed",
            memoId: message.payload?.memoId || "",
          });
        }
        break;
      }

      case "confirmBulkDeleteMemos": {
        const memoIds = Array.isArray(message.payload?.memoIds)
          ? message.payload.memoIds
          : [];
        const count = Number(message.payload?.count || memoIds.length || 0);

        if (!memoIds.length) {
          break;
        }

        const picked = await vscode.window.showWarningMessage(
          `選択した ${count} 件のメモを削除しますか？`,
          { modal: true },
          "削除",
          "キャンセル",
        );

        if (picked === "削除") {
          panel.webview.postMessage({
            type: "bulkDeleteMemosConfirmed",
            payload: {
              memoIds,
            },
          });
        }
        break;
      }

      case "confirmCloseConceptMemos": {
        const dirty = Boolean(message.payload?.isDirty);

        if (!dirty) {
          panel.dispose();
          break;
        }

        const picked = await vscode.window.showWarningMessage(
          "未保存の変更があります。このまま閉じますか？",
          { modal: true },
          "閉じる",
          "キャンセル",
        );

        if (picked === "閉じる") {
          panel.dispose();
        }
        break;
      }

      case "copyConceptMemoText": {
        try {
          const text = String(message.payload?.text || "");
          if (!text.trim()) {
            panel.webview.postMessage({
              type: "showToast",
              message: "本文が空のためコピーできません。",
              isError: true,
            });
            break;
          }

          await vscode.env.clipboard.writeText(text);

          panel.webview.postMessage({
            type: "showToast",
            message:
              "メモをコピーしました。貼り付けたい場所で Ctrl+V / Cmd+V を押してください。",
          });
        } catch (error) {
          panel.webview.postMessage({
            type: "showToast",
            message: `コピーに失敗しました: ${error.message || String(error)}`,
            isError: true,
          });
        }
        break;
      }

      default:
        break;
    }
  });
}

async function openConceptMemoWebview(context, treeProvider, options = {}) {
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

  const existingPanel = openConceptMemoPanels.get(filePath);
  if (existingPanel) {
    existingPanel.title = title;
    existingPanel.reveal(viewColumn, preserveFocus);

    try {
      const nextData = await readConceptMemos(filePath);
      existingPanel.webview.postMessage({
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
    initialData = await readConceptMemos(filePath);
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
  return vscode.window.registerWebviewPanelSerializer("mojigotoConceptMemos", {
    async deserializeWebviewPanel(webviewPanel, webviewState) {
      const state = webviewState || {};
      const filePath = String(state?.filePath || "").trim();
      const workDir = String(state?.workDir || "").trim();
      const workTitle = String(state?.workTitle || "").trim();

      if (!filePath) {
        webviewPanel.dispose();
        return;
      }

      let initialData;
      try {
        initialData = await readConceptMemos(filePath);
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

async function notifyConceptMemoUpdated(conceptMemoFilePath) {
  if (!conceptMemoFilePath) return false;

  const conceptMemoFilePathKey = path.normalize(conceptMemoFilePath);

  const panel =
    openConceptMemoPanels.get(conceptMemoFilePath) ||
    openConceptMemoPanels.get(conceptMemoFilePathKey);

  if (!panel) return false;

  const nextData = await readConceptMemos(conceptMemoFilePath);

  panel.webview.postMessage({
    type: "conceptMemosReloaded",
    payload: {
      filePath: conceptMemoFilePath,
      workDir: "",
      workTitle: "",
      data: nextData,
    },
  });

  return true;
}

module.exports = {
  getConceptMemoPanelTitle,
  resolveConceptMemoFilePath,
  openConceptMemoWebview,
  notifyConceptMemoUpdated,
  createConceptMemoSerializer,
};
