const path = require("path");

// Work-folder deletion dialogs and OS recycle-bin sequencing.
function createWorkTreeWorkDeleteActions({ vscode, spawn, context, treeProvider,
  isSingleMode, getCurrentWorkName, closeEditorsUnderFolder,
  closeNoteWebviewsUnderFolder, closeConceptMemoWebviewsUnderFolder,
  closeSettingsWebviewsUnderFolder }) {
  function movePathToSystemTrash(targetPath) {
    return new Promise((resolve, reject) => {
      const fullPath = String(targetPath || "").trim();
      if (!fullPath) {
        reject(new Error("ゴミ箱へ移動するパスが空です。"));
        return;
      }
  
      if (process.platform === "win32") {
        const escaped = fullPath.replace(/'/g, "''");
        const script =
          "Add-Type -AssemblyName Microsoft.VisualBasic; " +
          `[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory('${escaped}', 'OnlyErrorDialogs', 'SendToRecycleBin')`;
  
        const child = spawn(
          "powershell.exe",
          ["-NoProfile", "-NonInteractive", "-Command", script],
          { stdio: "ignore" },
        );
  
        child.on("error", (error) => reject(error));
        child.on("exit", (code) => {
          if (code === 0) {
            resolve();
            return;
          }
          reject(new Error(`PowerShell exited with code ${code}`));
        });
        return;
      }
  
      reject(new Error("このOSの作品削除はまだ未対応です。"));
    });
  }
  
  
  async function deleteWork(item) {
    try {
      if (isSingleMode()) {
        vscode.window.showWarningMessage(
          "もじごと: single モードでは作品削除は使いません。",
        );
        return false;
      }

      if (!item?.fsPath) {
        vscode.window.showWarningMessage(
          "もじごと: 削除する作品フォルダを取得できませんでした。",
        );
        return false;
      }

      const currentViewWorkName = String(
        getCurrentWorkName(context) || "",
      ).trim();
      const targetWorkName = String(
        item.workName || path.basename(item.fsPath) || "",
      ).trim();

      if (currentViewWorkName && currentViewWorkName === targetWorkName) {
        vscode.window.showWarningMessage(
          "もじごと: View連携中の作品は削除できません。作品を切り替えるか、連携を外してから削除してください。",
        );
        return false;
      }

      const displayName = String(
        targetWorkName || path.basename(item.fsPath),
      ).trim();

      const answer = await vscode.window.showWarningMessage(
        `作品「${displayName}」をOSのごみ箱へ移動しますか？\n原稿・ノート・作品設定を含む作品フォルダ全体が移動されます。`,
        { modal: true },
        "OSのごみ箱へ移動",
      );

      if (answer !== "OSのごみ箱へ移動") {
        return false;
      }

      await closeEditorsUnderFolder(item.fsPath);

      await movePathToSystemTrash(item.fsPath);

      await Promise.all([
        closeNoteWebviewsUnderFolder(item.fsPath),
        closeConceptMemoWebviewsUnderFolder(item.fsPath),
        closeSettingsWebviewsUnderFolder(item.fsPath),
      ]);

      treeProvider?.refresh();

      vscode.window.showInformationMessage(
        `もじごと: 作品「${displayName}」をOSのごみ箱へ移動しました。`,
      );

      return true;
    } catch (error) {
      vscode.window.showErrorMessage(
        `もじごと: 作品削除に失敗しました: ${String(error.message || error)}`,
      );
      return false;
    }
  }

  return { deleteWork };
}

module.exports = { createWorkTreeWorkDeleteActions };
