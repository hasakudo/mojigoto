// Persistence operations for Dashboard writing memos.
// Keep confirmation, write, refresh and decoration order identical to the controller.
function createDashboardWritingMemoOperations({
  vscode, readWritingMemos, writeWritingMemos, resolveWritingMemoPath,
  refresh, triggerWritingMemoDecorationRefresh, postToPanel, clearEditingWritingMemo,
}) {
  async function setWritingMemoStatus(msg) {
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
  }

  async function archiveDoneWritingMemos(msg) {
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
  }

  async function clearArchivedWritingMemos(msg) {
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
  }

  async function restoreWritingMemo(msg) {
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
  }

  async function deleteWritingMemo(msg) {
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
  }

  async function updateWritingMemo(msg) {
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

      clearEditingWritingMemo();

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
  }

  return { setWritingMemoStatus, archiveDoneWritingMemos, clearArchivedWritingMemos, restoreWritingMemo, deleteWritingMemo, updateWritingMemo };
}

module.exports = { createDashboardWritingMemoOperations };
