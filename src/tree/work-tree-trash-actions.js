const path = require("path");

// Local trash dialogs and sequencing. The trash store owns moves and restoration.
function createWorkTreeTrashActions({ vscode, fs, spawn, treeProvider, isSingleMode,
  resolveActualWorkDir, getTrashDirForSingle, getTrashDirForWork, moveToTrash,
  restoreTrashItem, closeEditorsByPaths, closeEditorsUnderFolder }) {
  function openFolderInSystemExplorer(targetPath) {
    return new Promise((resolve, reject) => {
      const fullPath = String(targetPath || "").trim();
      if (!fullPath) {
        reject(new Error("開くフォルダのパスが空です。"));
        return;
      }
  
      if (process.platform === "win32") {
        try {
          const child = spawn("explorer.exe", [fullPath], {
            detached: true,
            stdio: "ignore",
          });
  
          child.on("error", (error) => {
            reject(error);
          });
  
          child.unref();
          resolve();
        } catch (error) {
          reject(error);
        }
        return;
      }
  
      const command = process.platform === "darwin" ? "open" : "xdg-open";
  
      const child = spawn(command, [fullPath], {
        detached: true,
        stdio: "ignore",
      });
  
      child.on("error", (error) => {
        reject(error);
      });
  
      child.unref();
      resolve();
    });
  }
  
  function isTrashFolderPath(targetPath) {
    const value = String(targetPath || "").trim();
    if (!value) return false;
  
    const normalized = path.normalize(value);
    const marker = `${path.sep}.mojigoto${path.sep}trash`;
  
    return (
      normalized.endsWith(marker) || normalized.endsWith(`${marker}${path.sep}`)
    );
  }
  
  function resolveTrashFolderPath(item) {
    const fsPath = String(item?.fsPath || "").trim();
    if (isTrashFolderPath(fsPath)) {
      return fsPath;
    }
  
    if (isSingleMode()) {
      return getTrashDirForSingle();
    }
  
    const workDir = resolveActualWorkDir(String(item?.workDir || "").trim());
    if (workDir) {
      return getTrashDirForWork(workDir);
    }
  
    return "";
  }
  
  
  async function deleteManuscriptFile(item) {
    try {
      if (!item?.fsPath) {
        vscode.window.showWarningMessage(
          "もじごと: 削除する原稿ファイルを取得できませんでした。",
        );
        return;
      }

      const fileName = path.basename(item.fsPath);

      const answer = await vscode.window.showWarningMessage(
        `原稿ファイル「${fileName}」をゴミ箱へ移動しますか？`,
        { modal: true },
        "ゴミ箱へ移動",
      );

      if (answer !== "ゴミ箱へ移動") {
        return;
      }

      await moveToTrash(item.fsPath, item);
      await closeEditorsByPaths([item.fsPath]);

      treeProvider?.refresh();

      vscode.window.showInformationMessage(
        `もじごと: 原稿ファイル「${fileName}」をゴミ箱へ移動しました。`,
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `もじごと: 原稿ファイルの移動に失敗しました: ${error.message}`,
      );
    }
  }

  async function deleteChapterFolder(item) {
    try {
      if (!item?.fsPath) {
        vscode.window.showWarningMessage(
          "もじごと: 削除する章フォルダを取得できませんでした。",
        );
        return;
      }

      const folderName = path.basename(item.fsPath);

      const answer = await vscode.window.showWarningMessage(
        `章フォルダ「${folderName}」をゴミ箱へ移動しますか？配下の原稿も移動されます。`,
        { modal: true },
        "ゴミ箱へ移動",
      );

      if (answer !== "ゴミ箱へ移動") {
        return;
      }

      await moveToTrash(item.fsPath, item);
      await closeEditorsUnderFolder(item.fsPath);

      treeProvider?.refresh();

      vscode.window.showInformationMessage(
        `もじごと: 章フォルダ「${folderName}」をゴミ箱へ移動しました。`,
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `もじごと: 章フォルダの移動に失敗しました: ${error.message}`,
      );
    }
  }

  async function deleteNote(item) {
    try {
      if (!item?.fsPath) {
        vscode.window.showWarningMessage(
          "もじごと: 削除するノートを取得できませんでした。",
        );
        return false;
      }

      const noteName = String(
        item?.title || path.basename(item.fsPath),
      ).trim();

      const answer = await vscode.window.showWarningMessage(
        `ノート「${noteName}」をゴミ箱へ移動しますか？`,
        { modal: true },
        "ゴミ箱へ移動",
      );

      if (answer !== "ゴミ箱へ移動") {
        return false;
      }

      await moveToTrash(item.fsPath, item);
      await closeEditorsByPaths([item.fsPath]);
      await vscode.commands.executeCommand(
        "mojigoto.closeNoteWebviewByPath",
        item.fsPath,
      );

      treeProvider?.refresh();

      vscode.window.showInformationMessage(
        `もじごと: ノート「${noteName}」をゴミ箱へ移動しました。`,
      );

      return true;
    } catch (error) {
      vscode.window.showErrorMessage(
        `もじごと: ノートの移動に失敗しました: ${error.message}`,
      );
      return false;
    }
  }

  async function openTrashFolder(item) {
    try {
      const trashDir = resolveTrashFolderPath(item);

      if (!trashDir) {
        vscode.window.showWarningMessage(
          "もじごと: ゴミ箱フォルダを取得できませんでした。",
        );
        return;
      }

      await fs.mkdir(trashDir, { recursive: true });
      await openFolderInSystemExplorer(trashDir);
    } catch (e) {
      vscode.window.showErrorMessage(
        `もじごと: ゴミ箱フォルダを開けませんでした: ${String(e.message || e)}`,
      );
    }
  }

  async function restoreTrashEntry(item) {
    try {
      if (!item?.fsPath) {
        vscode.window.showWarningMessage(
          "もじごと: 復元対象を取得できませんでした。",
        );
        return;
      }

      const itemName = path.basename(item.fsPath);

      const answer = await vscode.window.showWarningMessage(
        `「${item.label || itemName}」を元の場所へ戻しますか？`,
        { modal: true },
        "元に戻す",
      );

      if (answer !== "元に戻す") {
        return;
      }

      const restored = await restoreTrashItem(item);

      treeProvider?.refresh();

      vscode.window.showInformationMessage(
        `もじごと: 「${item.label || itemName}」を元に戻しました。`,
      );
    } catch (e) {
      vscode.window.showErrorMessage(
        `もじごと: 復元に失敗しました: ${String(e.message || e)}`,
      );
    }
  }

  async function openTrashEntry(item) {
    try {
      if (!item?.fsPath) {
        vscode.window.showWarningMessage(
          "もじごと: 開くゴミ箱内ファイルを取得できませんでした。",
        );
        return;
      }

      const uri = vscode.Uri.file(item.fsPath);
      await vscode.commands.executeCommand("vscode.open", uri);
    } catch (e) {
      vscode.window.showErrorMessage(
        `もじごと: ゴミ箱内ファイルを開けませんでした: ${String(e.message || e)}`,
      );
    }
  }

  async function revealTrashEntryInExplorer(item) {
    try {
      if (!item?.fsPath) {
        vscode.window.showWarningMessage(
          "もじごと: 表示するゴミ箱内フォルダを取得できませんでした。",
        );
        return;
      }

      const uri = vscode.Uri.file(item.fsPath);

      await vscode.commands.executeCommand("revealInExplorer", uri);
    } catch (e) {
      vscode.window.showErrorMessage(
        `もじごと: ゴミ箱内フォルダを表示できませんでした: ${String(e.message || e)}`,
      );
    }
  }

  async function emptyTrash(item) {
    try {
      if (!item?.fsPath) {
        vscode.window.showWarningMessage(
          "もじごと: ゴミ箱フォルダを取得できませんでした。",
        );
        return;
      }

      await fs.mkdir(item.fsPath, { recursive: true });

      const answer = await vscode.window.showWarningMessage(
        "ゴミ箱内の項目をすべて削除しますか？この操作は元に戻せません。",
        { modal: true },
        "ゴミ箱を空にする",
      );

      if (answer !== "ゴミ箱を空にする") {
        return;
      }

      const entries = await fs.readdir(item.fsPath, { withFileTypes: true });

      for (const entry of entries) {
        const targetPath = path.join(item.fsPath, entry.name);
        await fs.rm(targetPath, { recursive: true, force: true });
      }

      treeProvider?.refresh();

      vscode.window.showInformationMessage(
        "もじごと: ゴミ箱を空にしました。",
      );
    } catch (e) {
      vscode.window.showErrorMessage(
        `もじごと: ゴミ箱を空にできませんでした: ${String(e.message || e)}`,
      );
    }
  }

  return { deleteManuscriptFile, deleteChapterFolder, deleteNote, openTrashFolder,
    restoreTrashEntry, openTrashEntry, revealTrashEntryInExplorer, emptyTrash };
}

module.exports = { createWorkTreeTrashActions };
