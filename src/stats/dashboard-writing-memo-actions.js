const { createWritingMemoConceptCopier } = require("./writing-memo-concept-copy");

// Dashboard writing memo list/edit actions and copying into concept memos.
// The live state facade belongs to stats-panel; no state is cached here.
function createDashboardWritingMemoActions({
  vscode, context, state, open, refresh, postToPanel,
  resolveConceptMemoTargetByWorkId, readConceptMemos, writeConceptMemos,
  readWritingMemos,
  notifyConceptMemoUpdated, triggerWritingMemoDecorationRefresh,
}) {
  const conceptCopier = createWritingMemoConceptCopier({ vscode, readConceptMemos, writeConceptMemos });

  async function openWritingMemoTab(payload = {}) {
    const absoluteFilePath = String(payload.absoluteFilePath || "").trim();

    if (absoluteFilePath) {
      state.lastWritingMemoTargetFsPath = absoluteFilePath;
    }

    state.writingMemoScope = "file";
    state.selectedWritingMemoWorkId = "";
    state.selectedWritingMemoWorkTitle = "";

    state.lastOpenedWritingMemoWorkId = "";
    state.lastOpenedWritingMemoWorkTitle = "";

    await open();

    await postToPanel({
      type: "openWritingMemoTab",
      memoId: String(payload.memoId || ""),
    });
  }

  async function copyWritingMemoToConceptMemo(msg) {
    try {
      const target = resolveConceptMemoTargetByWorkId(
        String(msg.returnWorkId || "").trim(),
      );
      if (msg.savedOnly === true) {
        const sourcePath = String(msg.writingMemoFilePath || "").trim();
        const memoId = String(msg.memoId || "");
        if (!sourcePath || !memoId) {
          vscode.window.showWarningMessage("もじごと: 執筆メモの保存元を取得できませんでした。一覧を更新してください。");
          return;
        }
        const data = await readWritingMemos(sourcePath);
        const matches = (Array.isArray(data?.memos) ? data.memos : []).filter((memo) => String(memo?.id || "") === memoId);
        if (matches.length !== 1) {
          vscode.window.showWarningMessage("もじごと: 保存済みの執筆メモが見つかりません。一覧を更新してください。");
          return;
        }
        msg = { ...msg, body: matches[0].body, excerpt: matches[0].excerpt, filePath: matches[0].filePath };
      }
      if (!target.filePath) {
        vscode.window.showWarningMessage(
          "もじごと: 構想メモの保存先を取得できませんでした。",
        );
        return;
      }

      const body = String(msg.body || "").trim();
      if (!body) {
        vscode.window.showWarningMessage(
          "もじごと: 構想メモへ反映する本文がありません。",
        );
        return;
      }

      const excerpt = String(msg.excerpt || "").trim();
      const filePath = String(msg.filePath || "").trim();

      const title = excerpt || "執筆メモからコピー";
      const result = await conceptCopier.copy(target.filePath, {
        title, body, excerpt, filePath, memoId: String(msg.memoId || ""),
        writingMemoFilePath: String(msg.writingMemoFilePath || "").trim(),
      });
      if (!result) return;

      await notifyConceptMemoUpdated(target.filePath);

      vscode.window.showInformationMessage(
        result.updated ? "もじごと: 構想メモを執筆メモの内容で更新しました。" : "もじごと: 執筆メモを構想メモへコピーしました。",
      );
    } catch (error) {
      console.error("[mojigoto] copyWritingMemoToConceptMemo error:", error);
      vscode.window.showErrorMessage(
        `もじごと: 構想メモへの反映に失敗しました: ${error.message || String(error)}`,
      );
    }
  }

  async function startEditingWritingMemo(msg) {
    state.editingWritingMemoId = String(msg.memoId || "");
    await refresh();
  }

  async function cancelEditingWritingMemo(msg) {
    state.editingWritingMemoId = "";
    await refresh();
  }

  async function refreshWritingMemos(msg) {
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
  }

  async function toggleWritingMemoDecorations(msg) {
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
  }

  async function showWritingMemoWorkIndex(msg) {
    state.writingMemoScope = "workIndex";
    state.selectedWritingMemoWorkId = "";
    state.selectedWritingMemoWorkTitle = "";
    await refresh();
  }

  async function openWritingMemoWork(msg) {
    state.writingMemoScope = "work";
    state.selectedWritingMemoWorkId = String(msg.workId || "").trim();
    state.selectedWritingMemoWorkTitle = String(msg.workTitle || "").trim();

    state.lastOpenedWritingMemoWorkId = state.selectedWritingMemoWorkId;
    state.lastOpenedWritingMemoWorkTitle = state.selectedWritingMemoWorkTitle;

    await refresh();
  }

  async function showCurrentFileWritingMemos(msg) {
    state.writingMemoScope = "file";
    state.selectedWritingMemoWorkId = "";
    state.selectedWritingMemoWorkTitle = "";

    const returnWorkId = String(msg.returnWorkId || "").trim();
    const returnWorkTitle = String(msg.returnWorkTitle || "").trim();

    if (returnWorkId) {
      state.lastOpenedWritingMemoWorkId = returnWorkId;
      state.lastOpenedWritingMemoWorkTitle = returnWorkTitle;
    } else {
      state.lastOpenedWritingMemoWorkId = "";
      state.lastOpenedWritingMemoWorkTitle = "";
    }

    await refresh();
  }

  return { openWritingMemoTab, copyWritingMemoToConceptMemo, startEditingWritingMemo, cancelEditingWritingMemo, refreshWritingMemos, toggleWritingMemoDecorations, showWritingMemoWorkIndex, openWritingMemoWork, showCurrentFileWritingMemos };
}

module.exports = { createDashboardWritingMemoActions };
