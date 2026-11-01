// Dashboard memo, TODO and visibility operations. Store implementations stay separate.
function createDashboardMemoActions({ vscode, context, refresh,
  resolveConceptMemoPath, resolveConceptMemoTarget, readConceptMemos, writeConceptMemos,
  readCommonTodoItems, writeCommonTodoItems, notifyConceptMemoUpdated,
  notifyCommonTodoUpdated, openConceptMemoWebview }) {
  async function setDashboardMemoVisibility(msg) {
    const key = String(msg.key || "").trim();
    const enabled = Boolean(msg.enabled);

    const cfg = vscode.workspace.getConfiguration("mojigoto");

    if (key === "progressGraph") {
      await cfg.update(
        "dashboardShowProgressGraph",
        enabled,
        vscode.ConfigurationTarget.Workspace,
      );
    } else if (key === "progressGraphMode") {
      const mode = String(msg.value || "daily") === "total"
        ? "total"
        : "daily";
      await cfg.update(
        "dashboardProgressGraphMode",
        mode,
        vscode.ConfigurationTarget.Workspace,
      );
    } else if (key === "commonTodo") {
      await cfg.update(
        "dashboardShowCommonTodo",
        enabled,
        vscode.ConfigurationTarget.Workspace,
      );
    } else if (key === "text") {
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

  async function toggleDashboardTodo(msg) {
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

  async function toggleDashboardCommonTodo(msg) {
    try {
      const items = await readCommonTodoItems();
      const itemIndex = items.findIndex(
        (item) => String(item?.id || "") === String(msg.itemId || ""),
      );
      if (itemIndex < 0) return;

      items[itemIndex] = {
        ...items[itemIndex],
        done: !items[itemIndex]?.done,
        updatedAt: new Date().toISOString(),
      };

      await writeCommonTodoItems(items);
      await notifyCommonTodoUpdated();
      await refresh();
    } catch (error) {
      console.error("[mojigoto] toggleDashboardCommonTodo error:", error);
      vscode.window.showErrorMessage(
        `もじごと: 作品共通TODOの更新に失敗しました: ${error.message || String(error)}`,
      );
    }
    return;
  }

  async function toggleDashboardVisibility(msg) {
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

  async function openConceptMemoFromDashboard(msg) {
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

  return { setDashboardMemoVisibility, toggleDashboardTodo, toggleDashboardCommonTodo,
    toggleDashboardVisibility, openConceptMemoFromDashboard };
}

module.exports = { createDashboardMemoActions };
