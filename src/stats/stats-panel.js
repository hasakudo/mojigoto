const vscode = require("vscode");
const fs = require("fs");
const { makeStatsHtml } = require("./stats-html");
const {
  getWorkName,
  getCurrentWorkTitleFromSettings,
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
} = require("../core/mojigoto-paths");
const {
  readConceptMemos,
  writeConceptMemos,
} = require("../data/concept-memo-store");
const {
  openConceptMemoWebview,
  notifyConceptMemoUpdated,
} = require("../views/concept-memo-webview");
const {
  readWritingMemos,
  writeWritingMemos,
} = require("../writing-memo/writing-memo-store");
const {
  resolveWritingMemoAbsolutePathFlexible,
} = require("../writing-memo/writing-memo-resolver");

function createStatsPanelController(options) {
  const {
    context,
    buildStatsState,
    getHighlightManager,
    exportStatsCsv,
    exportMergedManuscript,
    sendUnsyncedMojigotoEventsToWebhook,
    getPreferredHighlightEditor,
    toggleHighlightsEnabled,
    applyHighlightGroupEnabled,
  } = options;

  let statsPanel = null;
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

  async function postToPanel(payload) {
    try {
      if (statsPanel) {
        await statsPanel.webview.postMessage(payload);
      }
    } catch {}
  }

  async function openWritingMemoTab(payload = {}) {
    const absoluteFilePath = String(payload.absoluteFilePath || "").trim();

    if (absoluteFilePath) {
      lastWritingMemoTargetFsPath = absoluteFilePath;
    }

    writingMemoScope = "file";
    selectedWritingMemoWorkId = "";
    selectedWritingMemoWorkTitle = "";

    lastOpenedWritingMemoWorkId = "";
    lastOpenedWritingMemoWorkTitle = "";

    if (!statsPanel) {
      open();
    } else {
      statsPanel.reveal(vscode.ViewColumn.Beside, false);
    }

    await refresh();

    await postToPanel({
      type: "openWritingMemoTab",
      memoId: String(payload.memoId || ""),
    });
  }

  async function handleHighlightJump(msg) {
    try {
      const editor = getPreferredHighlightEditor();
      if (!editor) return;

      const doc = editor.document;
      const start = new vscode.Position(
        Number(msg.startLine || 0),
        Number(msg.startCharacter || 0),
      );
      const end = new vscode.Position(
        Number(msg.endLine || 0),
        Number(msg.endCharacter || 0),
      );
      const range = new vscode.Range(start, end);

      await vscode.window.showTextDocument(doc, {
        preview: false,
        viewColumn: editor.viewColumn || vscode.ViewColumn.One,
        preserveFocus: false,
      });

      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        activeEditor.selection = new vscode.Selection(start, end);
        activeEditor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      }
    } catch {
      vscode.window.showErrorMessage(
        "もじごと: ハイライト箇所へ移動できませんでした。",
      );
    }
  }

  function findWritingMemoRangeByExcerpt(doc, excerpt = "", fallback = {}) {
    const needle = String(excerpt || "").trim();
    if (!doc || !needle) return null;

    const fullText = doc.getText();

    const storedLine = Math.max(0, Number(fallback?.startLine || 0));
    const storedCharacter = Math.max(0, Number(fallback?.startCharacter || 0));

    let storedOffset = 0;
    try {
      storedOffset = doc.offsetAt(
        new vscode.Position(storedLine, storedCharacter),
      );
    } catch {
      storedOffset = 0;
    }

    const indexes = [];
    let from = 0;

    while (from <= fullText.length) {
      const index = fullText.indexOf(needle, from);
      if (index < 0) break;

      indexes.push(index);
      from = index + Math.max(1, needle.length);
    }

    if (!indexes.length) return null;

    const bestIndex = indexes.sort(
      (a, b) => Math.abs(a - storedOffset) - Math.abs(b - storedOffset),
    )[0];

    const start = doc.positionAt(bestIndex);
    const end = doc.positionAt(bestIndex + needle.length);

    return new vscode.Range(start, end);
  }

  async function handleWritingMemoJump(msg) {
    try {
      const absPath = resolveWritingMemoAbsolutePathFlexible(
        context,
        msg.filePath,
        {
          absoluteFilePath: msg.absoluteFilePath,
          writingMemoFilePath: msg.writingMemoFilePath,
          excerpt: msg.excerpt,
        },
      );

      if (!absPath) {
        vscode.window.showWarningMessage(
          "もじごと: 執筆メモの対象ファイルを見つけられませんでした。",
        );
        return;
      }

      const doc = await vscode.workspace.openTextDocument(absPath);

      const storedStart = new vscode.Position(
        Number(msg.startLine || 0),
        Number(msg.startCharacter || 0),
      );
      const storedEnd = new vscode.Position(
        Number(msg.endLine || 0),
        Number(msg.endCharacter || 0),
      );

      const excerptRange = findWritingMemoRangeByExcerpt(doc, msg.excerpt, {
        startLine: msg.startLine,
        startCharacter: msg.startCharacter,
      });
      const range = excerptRange || new vscode.Range(storedStart, storedEnd);

      const start = range.start;
      const end = range.end;

      const editor = await vscode.window.showTextDocument(doc, {
        preview: false,
        viewColumn: vscode.ViewColumn.One,
        preserveFocus: false,
      });

      editor.selection = new vscode.Selection(start, end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

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

      await refresh();

      await postToPanel({
        type: "openWritingMemoTab",
        memoId: String(msg.memoId || ""),
      });
    } catch (error) {
      vscode.window.showErrorMessage(
        `もじごと: 執筆メモの箇所へ移動できませんでした: ${error.message || String(error)}`,
      );
    }
  }

  async function handleWebviewMessage(msg) {
    if (!msg) return;

    const highlightManager = getHighlightManagerSafe();

    if (msg.type === "exportCsv") {
      await exportStatsCsv(context);
      return;
    }

    if (msg.type === "refresh") {
      refresh();
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
      const key = String(msg.key || "").trim();
      const enabled = Boolean(msg.enabled);

      const cfg = vscode.workspace.getConfiguration("mojigoto");

      if (key === "text") {
        await cfg.update(
          "dashboardShowTextMemos",
          enabled,
          vscode.ConfigurationTarget.Workspace,
        );
      } else if (key === "list") {
        await cfg.update(
          "dashboardShowListMemos",
          enabled,
          vscode.ConfigurationTarget.Workspace,
        );
      } else if (key === "todo") {
        await cfg.update(
          "dashboardShowTodoMemos",
          enabled,
          vscode.ConfigurationTarget.Workspace,
        );
      }

      await refresh();
      return;
    }

    if (msg.type === "mojigoto.sendMojigotoEvents") {
      try {
        const r = await sendUnsyncedMojigotoEventsToWebhook(context);
        await postToPanel({
          type: "mojigoto.sendMojigotoEvents.result",
          ok: true,
          sent: r?.sent ?? 0,
        });
      } catch (e) {
        await postToPanel({
          type: "mojigoto.sendMojigotoEvents.result",
          ok: false,
          error: String(e),
        });
      }
      return;
    }

    if (msg.type === "openMojigotoSettings") {
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "@ext:hasakudo.mojigoto",
      );
      return;
    }

    if (msg.type === "toggleHighlights") {
      if (typeof toggleHighlightsEnabled === "function") {
        await toggleHighlightsEnabled();
      }

      const editor = getPreferredHighlightEditor();
      if (editor && highlightManager) {
        highlightManager.refreshEditor(editor);
      }

      refresh();
      return;
    }

    if (msg.type === "toggleHighlightDecorations") {
      try {
        const cfg = vscode.workspace.getConfiguration("mojigoto");
        const current = Boolean(cfg.get("highlightDecorationsEnabled", true));
        const next = !current;

        await cfg.update(
          "highlightDecorationsEnabled",
          next,
          vscode.ConfigurationTarget.Workspace,
        );

        if (highlightManager) {
          const editor =
            typeof getPreferredHighlightEditor === "function"
              ? getPreferredHighlightEditor()
              : null;

          if (editor) {
            highlightManager.refreshEditor(editor);
          } else {
            highlightManager.clearAllEditors();
          }
        }

        await refresh();
      } catch (error) {
        console.error("[mojigoto] toggleHighlightDecorations error:", error);
        vscode.window.showErrorMessage(
          `もじごと: ハイライト装飾の切り替えに失敗しました: ${error.message || String(error)}`,
        );
      }
      return;
    }

    if (msg.type === "refreshHighlights") {
      const editor = getPreferredHighlightEditor();
      if (editor && highlightManager) {
        highlightManager.refreshEditor(editor);
      } else {
        await vscode.commands.executeCommand("mojigoto.refreshHighlights");
      }

      refresh();
      return;
    }

    if (msg.type === "toggleHighlightGroup") {
      if (typeof applyHighlightGroupEnabled === "function") {
        await applyHighlightGroupEnabled(msg.name, msg.enabled);
      }

      refresh();
      return;
    }

    if (msg.type === "highlightJump") {
      await handleHighlightJump(msg);
    }

    if (msg.type === "openHighlightSettings") {
      await vscode.commands.executeCommand("mojigoto.openHighlightSettings");
      return;
    }

    if (msg.type === "toggleDashboardTodo") {
      try {
        const filePath = resolveConceptMemoPath();
        if (!filePath) return;

        const data = await readConceptMemos(filePath);
        const memos = Array.isArray(data?.memos) ? data.memos : [];

        const memoIndex = memos.findIndex((m) => m.id === msg.memoId);
        if (memoIndex < 0) return;

        const memo = memos[memoIndex];
        if (!Array.isArray(memo.todoItems)) return;

        const itemIndex = memo.todoItems.findIndex((i) => i.id === msg.itemId);
        if (itemIndex < 0) return;

        const item = memo.todoItems[itemIndex];

        memo.todoItems[itemIndex] = {
          ...item,
          done: !item.done,
        };

        memo.updatedAt = new Date().toISOString();
        data.updatedAt = new Date().toISOString();

        await writeConceptMemos(filePath, data);

        await notifyConceptMemoUpdated(filePath);

        refresh();
      } catch (err) {
        console.error("[mojigoto] toggleDashboardTodo error:", err);
      }
    }

    if (msg.type === "toggleDashboardVisibility") {
      try {
        const target = resolveConceptMemoTarget();
        if (!target.filePath) return;

        const data = await readConceptMemos(target.filePath);
        const memos = Array.isArray(data?.memos) ? [...data.memos] : [];

        const memoIndex = memos.findIndex(
          (memo) => String(memo?.id || "") === String(msg.memoId || ""),
        );
        if (memoIndex < 0) return;

        const currentMemo = memos[memoIndex] || {};
        memos[memoIndex] = {
          ...currentMemo,
          showInDashboard: !currentMemo.showInDashboard,
          updatedAt: new Date().toISOString(),
        };

        await writeConceptMemos(target.filePath, {
          ...data,
          memos,
        });

        await notifyConceptMemoUpdated(target.filePath);

        await refresh();
      } catch (error) {
        console.error("[mojigoto] toggleDashboardVisibility error:", error);
        vscode.window.showErrorMessage(
          `もじごと: Dashboard表示の更新に失敗しました: ${error.message || String(error)}`,
        );
      }
      return;
    }

    if (msg.type === "copyWritingMemoToConceptMemo") {
      try {
        const target = resolveConceptMemoTargetByWorkId(
          String(msg.returnWorkId || "").trim(),
        );

        if (!target.filePath) {
          vscode.window.showWarningMessage(
            "もじごと: 構想メモの保存先を取得できませんでした。",
          );
          return;
        }

        const body = String(msg.body || "").trim();
        if (!body) {
          vscode.window.showWarningMessage(
            "もじごと: 構想メモへコピーする本文がありません。",
          );
          return;
        }

        const excerpt = String(msg.excerpt || "").trim();
        const filePath = String(msg.filePath || "").trim();

        const title = excerpt || "執筆メモからコピー";
        const data = await readConceptMemos(target.filePath);
        const memos = Array.isArray(data?.memos) ? [...data.memos] : [];

        const nextMemo = {
          id: `cm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          type: "text",
          title,
          body,
          tags: [],
          isPinned: false,
          isArchived: false,
          showInDashboard: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          source: {
            kind: "writingMemo",
            filePath,
            excerpt,
            memoId: String(msg.memoId || ""),
          },
        };

        memos.unshift(nextMemo);

        await writeConceptMemos(target.filePath, {
          ...data,
          memos,
          updatedAt: new Date().toISOString(),
        });

        await notifyConceptMemoUpdated(target.filePath);

        vscode.window.showInformationMessage(
          "もじごと: 執筆メモを構想メモへコピーしました。",
        );
      } catch (error) {
        console.error("[mojigoto] copyWritingMemoToConceptMemo error:", error);
        vscode.window.showErrorMessage(
          `もじごと: 構想メモへのコピーに失敗しました: ${error.message || String(error)}`,
        );
      }
      return;
    }

    if (msg.type === "openConceptMemoFromDashboard") {
      try {
        const target = resolveConceptMemoTarget();
        if (!target.filePath) {
          vscode.window.showWarningMessage(
            "もじごと: 構想メモの保存先を取得できませんでした。",
          );
          return;
        }

        await openConceptMemoWebview(context, null, {
          filePath: target.filePath,
          workDir: target.workDir,
          workTitle: target.workTitle,
          title:
            target.workTitle && target.workTitle !== "構想メモ"
              ? `構想メモ: ${target.workTitle}`
              : "構想メモ",
          selectedMemoId: String(msg.memoId || ""),
          viewColumn: vscode.ViewColumn.One,
          preserveFocus: false,
        });
      } catch (error) {
        console.error("[mojigoto] openConceptMemoFromDashboard error:", error);
        vscode.window.showErrorMessage(
          `もじごと: 構想メモを開けませんでした: ${error.message || String(error)}`,
        );
      }
      return;
    }

    if (msg.type === "writingMemoJump") {
      await handleWritingMemoJump(msg);
      return;
    }

    if (msg.type === "setWritingMemoStatus") {
      try {
        const filePath =
          String(msg.writingMemoFilePath || "").trim() ||
          resolveWritingMemoPath();
        if (!filePath) return;

        const nextStatus = String(msg.status || "").trim();
        if (!["active", "hold", "done", "archive"].includes(nextStatus)) {
          return;
        }

        const data = await readWritingMemos(filePath);
        const memos = Array.isArray(data?.memos) ? [...data.memos] : [];

        const memoIndex = memos.findIndex(
          (memo) => String(memo?.id || "") === String(msg.memoId || ""),
        );
        if (memoIndex < 0) return;

        const currentMemo = memos[memoIndex] || {};

        if (nextStatus === "archive") {
          memos[memoIndex] = {
            ...currentMemo,
            isArchived: true,
            updatedAt: new Date().toISOString(),
          };
        } else {
          memos[memoIndex] = {
            ...currentMemo,
            status: nextStatus,
            isArchived: false,
            updatedAt: new Date().toISOString(),
          };
        }

        await writeWritingMemos(filePath, {
          ...data,
          memos,
        });

        await refresh();
        await triggerWritingMemoDecorationRefresh();
      } catch (error) {
        console.error("[mojigoto] setWritingMemoStatus error:", error);
        vscode.window.showErrorMessage(
          `もじごと: 執筆メモのステータス更新に失敗しました: ${error.message || String(error)}`,
        );
      }
      return;
    }

    if (msg.type === "archiveDoneWritingMemos") {
      try {
        const filePath = resolveWritingMemoPath();
        if (!filePath) return;

        const confirmed = await vscode.window.showWarningMessage(
          "完了状態の執筆メモをアーカイブします。よろしいですか？",
          { modal: true },
          "アーカイブする",
        );

        if (confirmed !== "アーカイブする") {
          return;
        }

        const data = await readWritingMemos(filePath);
        const memos = Array.isArray(data?.memos) ? [...data.memos] : [];

        let changed = false;

        const nextMemos = memos.map((memo) => {
          if (String(memo?.status || "") !== "done") {
            return memo;
          }
          if (memo?.isArchived) {
            return memo;
          }

          changed = true;
          return {
            ...memo,
            isArchived: true,
            updatedAt: new Date().toISOString(),
          };
        });

        if (!changed) {
          vscode.window.showInformationMessage(
            "もじごと: アーカイブ対象の完了メモはありませんでした。",
          );
          return;
        }

        await writeWritingMemos(filePath, {
          ...data,
          memos: nextMemos,
        });

        await refresh();
        await triggerWritingMemoDecorationRefresh();

        vscode.window.showInformationMessage(
          "もじごと: 完了メモをアーカイブしました。",
        );
      } catch (error) {
        console.error("[mojigoto] archiveDoneWritingMemos error:", error);
        vscode.window.showErrorMessage(
          `もじごと: 完了メモのアーカイブに失敗しました: ${error.message || String(error)}`,
        );
      }
      return;
    }

    if (msg.type === "clearArchivedWritingMemos") {
      try {
        const filePath = resolveWritingMemoPath();
        if (!filePath) return;

        const confirmed = await vscode.window.showWarningMessage(
          "アーカイブされた執筆メモをすべて削除します。元に戻せません。",
          { modal: true },
          "削除する",
        );

        if (confirmed !== "削除する") {
          return;
        }

        const data = await readWritingMemos(filePath);
        const memos = Array.isArray(data?.memos) ? [...data.memos] : [];

        const nextMemos = memos.filter((memo) => !memo?.isArchived);

        if (nextMemos.length === memos.length) {
          vscode.window.showInformationMessage(
            "もじごと: 削除対象のアーカイブメモはありませんでした。",
          );
          return;
        }

        await writeWritingMemos(filePath, {
          ...data,
          memos: nextMemos,
        });

        await refresh();
        await triggerWritingMemoDecorationRefresh();

        vscode.window.showInformationMessage(
          "もじごと: アーカイブメモを一括削除しました。",
        );
      } catch (error) {
        console.error("[mojigoto] clearArchivedWritingMemos error:", error);
        vscode.window.showErrorMessage(
          `もじごと: アーカイブメモの一括削除に失敗しました: ${error.message || String(error)}`,
        );
      }
      return;
    }

    if (msg.type === "restoreWritingMemo") {
      try {
        const filePath = resolveWritingMemoPath();
        if (!filePath) return;

        const data = await readWritingMemos(filePath);
        const memos = Array.isArray(data?.memos) ? [...data.memos] : [];

        const memoIndex = memos.findIndex(
          (memo) => String(memo?.id || "") === String(msg.memoId || ""),
        );
        if (memoIndex < 0) return;

        const currentMemo = memos[memoIndex] || {};
        memos[memoIndex] = {
          ...currentMemo,
          isArchived: false,
          updatedAt: new Date().toISOString(),
        };

        await writeWritingMemos(filePath, {
          ...data,
          memos,
        });

        await refresh();
        await triggerWritingMemoDecorationRefresh();
      } catch (error) {
        console.error("[mojigoto] restoreWritingMemo error:", error);
        vscode.window.showErrorMessage(
          `もじごと: 執筆メモの復元に失敗しました: ${error.message || String(error)}`,
        );
      }
      return;
    }

    if (msg.type === "deleteWritingMemo") {
      try {
        const filePath = resolveWritingMemoPath();
        if (!filePath) return;

        const confirmed = await vscode.window.showWarningMessage(
          "この執筆メモを削除します。元に戻せません。",
          { modal: true },
          "削除する",
        );

        if (confirmed !== "削除する") {
          return;
        }

        const data = await readWritingMemos(filePath);
        const memos = Array.isArray(data?.memos) ? data.memos : [];

        const nextMemos = memos.filter(
          (memo) => String(memo?.id || "") !== String(msg.memoId || ""),
        );

        await writeWritingMemos(filePath, {
          ...data,
          memos: nextMemos,
        });

        await refresh();
        await triggerWritingMemoDecorationRefresh();
      } catch (error) {
        console.error("[mojigoto] deleteWritingMemo error:", error);
        vscode.window.showErrorMessage(
          `もじごと: 執筆メモの削除に失敗しました: ${error.message || String(error)}`,
        );
      }
      return;
    }

    if (msg.type === "updateWritingMemo") {
      try {
        const filePath =
          String(msg.writingMemoFilePath || "").trim() ||
          resolveWritingMemoPath();
        if (!filePath) return;

        const body = String(msg.body || "").trim();
        if (!body) {
          await postToPanel({
            type: "updateWritingMemo.result",
            ok: false,
            error: "本文を入力してください。",
          });
          return;
        }

        const data = await readWritingMemos(filePath);
        const memos = Array.isArray(data?.memos) ? [...data.memos] : [];

        const memoIndex = memos.findIndex(
          (memo) => String(memo?.id || "") === String(msg.memoId || ""),
        );
        if (memoIndex < 0) {
          await postToPanel({
            type: "updateWritingMemo.result",
            ok: false,
            error: "対象の執筆メモが見つかりません。",
          });
          return;
        }

        const currentMemo = memos[memoIndex] || {};
        memos[memoIndex] = {
          ...currentMemo,
          body,
          updatedAt: new Date().toISOString(),
        };

        await writeWritingMemos(filePath, {
          ...data,
          memos,
        });

        editingWritingMemoId = "";

        await refresh();
        await triggerWritingMemoDecorationRefresh();

        await postToPanel({
          type: "updateWritingMemo.result",
          ok: true,
          memoId: String(msg.memoId || ""),
        });
      } catch (error) {
        console.error("[mojigoto] updateWritingMemo error:", error);

        await postToPanel({
          type: "updateWritingMemo.result",
          ok: false,
          error: error.message || String(error),
        });

        vscode.window.showErrorMessage(
          `もじごと: 執筆メモの更新に失敗しました: ${error.message || String(error)}`,
        );
      }
      return;
    }

    if (msg.type === "startEditingWritingMemo") {
      editingWritingMemoId = String(msg.memoId || "");
      await refresh();
      return;
    }

    if (msg.type === "cancelEditingWritingMemo") {
      editingWritingMemoId = "";
      await refresh();
      return;
    }

    if (msg.type === "refreshWritingMemos") {
      try {
        await refresh();
        await triggerWritingMemoDecorationRefresh();

        await postToPanel({
          type: "refreshWritingMemos.result",
          ok: true,
        });
      } catch (error) {
        console.error("[mojigoto] refreshWritingMemos error:", error);

        await postToPanel({
          type: "refreshWritingMemos.result",
          ok: false,
          error: error?.message || String(error),
        });
      }
      return;
    }

    if (msg.type === "toggleWritingMemoDecorations") {
      try {
        const cfg = vscode.workspace.getConfiguration("mojigoto");
        const current = Boolean(cfg.get("writingMemoDecorationsEnabled", true));
        const next = !current;

        await cfg.update(
          "writingMemoDecorationsEnabled",
          next,
          vscode.ConfigurationTarget.Workspace,
        );

        const editor = vscode.window.activeTextEditor;
        if (editor) {
          await triggerWritingMemoDecorationRefresh(editor);
        } else {
          await triggerWritingMemoDecorationRefresh();
        }

        await refresh();

        await postToPanel({
          type: "toggleWritingMemoDecorations.result",
          ok: true,
          enabled: next,
        });
      } catch (error) {
        console.error("[mojigoto] toggleWritingMemoDecorations error:", error);

        await postToPanel({
          type: "toggleWritingMemoDecorations.result",
          ok: false,
          error: error?.message || String(error),
        });

        vscode.window.showErrorMessage(
          `もじごと: 執筆メモ表示の切り替えに失敗しました: ${error?.message || String(error)}`,
        );
      }
      return;
    }

    if (msg.type === "showWritingMemoWorkIndex") {
      writingMemoScope = "workIndex";
      selectedWritingMemoWorkId = "";
      selectedWritingMemoWorkTitle = "";
      await refresh();
      return;
    }

    if (msg.type === "openWritingMemoWork") {
      writingMemoScope = "work";
      selectedWritingMemoWorkId = String(msg.workId || "").trim();
      selectedWritingMemoWorkTitle = String(msg.workTitle || "").trim();

      lastOpenedWritingMemoWorkId = selectedWritingMemoWorkId;
      lastOpenedWritingMemoWorkTitle = selectedWritingMemoWorkTitle;

      await refresh();
      return;
    }

    if (msg.type === "showCurrentFileWritingMemos") {
      writingMemoScope = "file";
      selectedWritingMemoWorkId = "";
      selectedWritingMemoWorkTitle = "";

      const returnWorkId = String(msg.returnWorkId || "").trim();
      const returnWorkTitle = String(msg.returnWorkTitle || "").trim();

      if (returnWorkId) {
        lastOpenedWritingMemoWorkId = returnWorkId;
        lastOpenedWritingMemoWorkTitle = returnWorkTitle;
      } else {
        lastOpenedWritingMemoWorkId = "";
        lastOpenedWritingMemoWorkTitle = "";
      }

      await refresh();
      return;
    }
  }

  function attach(panelInstance) {
    panelInstance.webview.onDidReceiveMessage(handleWebviewMessage);

    panelInstance.onDidDispose(() => {
      if (statsPanel === panelInstance) {
        statsPanel = null;
      }
    });
  }

  const activeEditorChangeDisposable =
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      const prevTarget = lastWritingMemoTargetFsPath;

      if (editor) {
        updateLastWritingMemoTarget(editor);
      }

      if (statsPanel && prevTarget !== lastWritingMemoTargetFsPath) {
        refresh();
      }
    });

  const visibleEditorsChangeDisposable =
    vscode.window.onDidChangeVisibleTextEditors(() => {
      if (statsPanel) {
        refresh();
      }
    });

  const configurationChangeDisposable =
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("mojigoto.sheetsEnabled") ||
        e.affectsConfiguration("mojigoto.webhookEventsMode") ||
        e.affectsConfiguration("mojigoto.webhookEventsRemindMode") ||
        e.affectsConfiguration("mojigoto.eventLogIntervalMinutes") ||
        e.affectsConfiguration("mojigoto.eventsMaxCount") ||
        e.affectsConfiguration("mojigoto.eventsRetentionDays") ||
        e.affectsConfiguration("mojigoto.dailyRetentionDays") ||
        e.affectsConfiguration("mojigoto.countMode")
      ) {
        refresh();
      }
    });

  async function refresh() {
    if (!statsPanel) return;

    const highlightManager = getHighlightManagerSafe();
    const state = await buildStatsState(context, highlightManager, {
      writingMemoTargetFsPath: lastWritingMemoTargetFsPath,
      editingWritingMemoId,
      writingMemoScope,
      selectedWritingMemoWorkId,
      selectedWritingMemoWorkTitle,
      lastOpenedWritingMemoWorkId,
      lastOpenedWritingMemoWorkTitle,
    });

    statsPanel.webview.html = makeStatsHtml(state);
  }

  function open() {
    if (statsPanel) {
      statsPanel.reveal(vscode.ViewColumn.Beside, false);
      refresh();
      return;
    }

    statsPanel = vscode.window.createWebviewPanel(
      "mojigoto.stats",
      "もじごと: Dashboard",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true },
    );

    attach(statsPanel);
    refresh();
  }

  function createSerializer() {
    return vscode.window.registerWebviewPanelSerializer("mojigoto.stats", {
      async deserializeWebviewPanel(webviewPanel) {
        statsPanel = webviewPanel;

        webviewPanel.webview.options = {
          enableScripts: true,
          retainContextWhenHidden: true,
        };

        attach(webviewPanel);
        refresh();
      },
    });
  }

  setStatsRefreshHandler(refresh);

  return {
    open,
    openWritingMemoTab,
    refresh,
    getPanel,
    createSerializer,
    dispose() {
      activeEditorChangeDisposable.dispose();
      visibleEditorsChangeDisposable?.dispose?.();
      configurationChangeDisposable.dispose();
    },
  };
}

module.exports = {
  createStatsPanelController,
};
