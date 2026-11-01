// Dashboard correction dialogs and follow-up notifications.
// Statistics persistence and calculation remain in stats-correction.
function createDashboardStatsCorrectionActions({
  vscode, context, refresh, sendInitialProgressToWebhook,
  getStatsCorrectionStatus, rebaseStatsToCurrentManuscripts,
  correctTodayDelta, resetStatsRecords, undoLastStatsCorrection,
}) {
  async function offerCorrectionSheetsSync(message) {
    const sheetsEnabled = Boolean(
      vscode.workspace.getConfiguration("mojigoto").get("sheetsEnabled", false),
    );
    const canSend =
      sheetsEnabled && typeof sendInitialProgressToWebhook === "function";
    const picked = await vscode.window.showInformationMessage(
      message,
      ...(canSend ? ["Sheetsへ補正値を送信"] : []),
    );

    if (picked !== "Sheetsへ補正値を送信") return;

    try {
      const result = await sendInitialProgressToWebhook(context);
      vscode.window.showInformationMessage(
        `もじごと: Sheetsへ補正値を送信しました（総文字数 ${Number(result?.total || 0).toLocaleString("ja-JP")}文字・今日 ${Number(result?.daily || 0).toLocaleString("ja-JP")}文字）`,
      );
    } catch (error) {
      vscode.window.showWarningMessage(
        `もじごと: Sheetsへの補正値送信に失敗しました: ${String(error?.message || error)}`,
      );
    }
  }

  async function handleStatsCorrection() {
    let status;
    try {
      status = await getStatsCorrectionStatus(context);
    } catch (error) {
      vscode.window.showErrorMessage(
        `もじごと: 執筆記録を確認できませんでした: ${String(error?.message || error)}`,
      );
      return;
    }

    const choices = [
      {
        label: "$(refresh) 現在の原稿から再集計",
        description: "現在の総文字数を基準にし、今日の差分を0にします",
        action: "rebase",
      },
      {
        label: "$(edit) 今日の差分を補正",
        description: "移行分を除外し、実際に執筆した文字数へ変更します",
        action: "delta",
      },
      {
        label: "$(clear-all) 執筆記録をリセット",
        description: "今日または全期間の履歴を削除して現在値から再開します",
        action: "reset",
      },
    ];

    if (status.hasBackup) {
      choices.push({
        label: "$(discard) 前回の補正を元に戻す",
        description: "直前の補正前に保存した記録を復元します",
        action: "undo",
      });
    }

    const picked = await vscode.window.showQuickPick(choices, {
      title: "もじごと: 執筆記録を補正",
      placeHolder: `現在 ${status.total.toLocaleString("ja-JP")}文字 / 記録 ${status.recordedTotal.toLocaleString("ja-JP")}文字`,
      ignoreFocusOut: true,
    });
    if (!picked) return;

    try {
      let result;
      let successMessage = "";

      if (picked.action === "rebase") {
        const detail = [
          `現在の原稿: ${status.total.toLocaleString("ja-JP")}文字（${status.fileCount}ファイル）`,
          `記録上の総文字数: ${status.recordedTotal.toLocaleString("ja-JP")}文字`,
          `存在しないファイルの履歴: ${status.missingFileHistoryCount}件`,
          "今日の差分を0にして、次回保存から差分を記録します。",
        ].join("\n");
        const confirmed = await vscode.window.showWarningMessage(
          detail,
          { modal: true },
          "再集計する",
        );
        if (confirmed !== "再集計する") return;

        result = await rebaseStatsToCurrentManuscripts(context);
        successMessage =
          `もじごと: 現在の原稿を${result.total.toLocaleString("ja-JP")}文字として再集計しました。` +
          (result.removedFileHistoryCount
            ? ` 古いファイル履歴を${result.removedFileHistoryCount}件整理しました。`
            : "");
      } else if (picked.action === "delta") {
        const input = await vscode.window.showInputBox({
          title: "もじごと: 今日の差分を補正",
          prompt: `現在の総文字数 ${status.total.toLocaleString("ja-JP")}文字は維持されます。今日実際に執筆した差分を入力してください。`,
          value: "0",
          placeHolder: "例: 0 または 1250",
          ignoreFocusOut: true,
          validateInput: (value) => {
            if (!/^-?\d+$/.test(String(value || "").trim())) {
              return "整数で入力してください。";
            }
            return null;
          },
        });
        if (input === undefined) return;

        const desiredDelta = Number(input);
        const confirmed = await vscode.window.showWarningMessage(
          `総文字数を${status.total.toLocaleString("ja-JP")}文字のまま、今日の差分を${desiredDelta.toLocaleString("ja-JP")}文字へ変更します。`,
          { modal: true },
          "補正する",
        );
        if (confirmed !== "補正する") return;

        result = await correctTodayDelta(context, desiredDelta);
        successMessage = `もじごと: 今日の差分を${result.delta.toLocaleString("ja-JP")}文字へ補正しました。`;
      } else if (picked.action === "reset") {
        const resetScope = await vscode.window.showQuickPick(
          [
            {
              label: "今日の記録をリセット",
              description: "今日の日別記録・更新ファイル・日時ログを消去します",
              scope: "today",
            },
            {
              label: "全期間の記録をリセット",
              description: "すべての日別記録・更新ファイル・日時ログを消去します",
              scope: "all",
            },
          ],
          {
            title: "もじごと: リセット範囲",
            placeHolder: "原稿ファイルと作品設定は削除されません",
            ignoreFocusOut: true,
          },
        );
        if (!resetScope) return;

        const scopeLabel = resetScope.scope === "all" ? "全期間" : "今日";
        const confirmed = await vscode.window.showWarningMessage(
          `${scopeLabel}の執筆記録をリセットします。原稿ファイルは変更せず、現在の${status.total.toLocaleString("ja-JP")}文字を新しい基準にします。`,
          { modal: true },
          "リセットする",
        );
        if (confirmed !== "リセットする") return;

        result = await resetStatsRecords(context, resetScope.scope);
        successMessage = `もじごと: ${scopeLabel}の執筆記録をリセットし、現在の原稿から記録を再開しました。`;
      } else if (picked.action === "undo") {
        const confirmed = await vscode.window.showWarningMessage(
          "直前の補正前に保存した執筆記録へ戻します。",
          { modal: true },
          "元に戻す",
        );
        if (confirmed !== "元に戻す") return;

        result = await undoLastStatsCorrection(context);
        successMessage = "もじごと: 前回の執筆記録補正を元に戻しました。";
      }

      await refresh();
      await offerCorrectionSheetsSync(successMessage);
      return result;
    } catch (error) {
      vscode.window.showErrorMessage(
        `もじごと: 執筆記録の補正に失敗しました: ${String(error?.message || error)}`,
      );
    }
  }

  return { handleStatsCorrection };
}

module.exports = { createDashboardStatsCorrectionActions };
