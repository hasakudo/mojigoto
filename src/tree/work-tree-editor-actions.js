const path = require("path");

// Tree entries that create notes or open editors. Existing stores own persistence.
function createWorkTreeEditorActions({ vscode, fs, context, treeProvider, isSingleMode,
  resolveManuscriptRootForTreeItem,
  getCurrentWorkDisplayName, readSettingsFile, createNewNote, openNoteWebview,
  getConceptMemosPathForSingle, getConceptMemosPathForWork, openConceptMemoWebview,
  openSettingsWebview }) {
  async function searchManuscriptFolder(item, chapterOnly = false) {
    try {
      const allowed = chapterOnly ? ["chapterFolder"] : ["manuscriptRoot", "manuscriptFile"];
      if (!allowed.includes(item?.kind) || !item?.fsPath) {
        vscode.window.showWarningMessage("もじごと: 検索する原稿フォルダーを取得できませんでした。");
        return;
      }
      const folder = item.kind === "manuscriptFile"
        ? resolveManuscriptRootForTreeItem(item, item.fsPath)
        : item.fsPath;
      if (!folder || !path.isAbsolute(folder) || !(await fs.stat(folder)).isDirectory()) {
        vscode.window.showWarningMessage("もじごと: 検索する原稿フォルダーが見つかりません。");
        return;
      }
      // Let VS Code resolve folder search paths, escaping and search-mode preferences.
      await vscode.commands.executeCommand("filesExplorer.findInFolder", vscode.Uri.file(folder));
    } catch (error) {
      vscode.window.showErrorMessage(`もじごと: 原稿フォルダーの検索を開けませんでした: ${String(error.message || error)}`);
    }
  }
  async function resolveConceptMemoWorkTitle(context, item, workDir) {
    if (isSingleMode()) {
      return String(getCurrentWorkDisplayName(context) || "").trim();
    }
  
    const itemWorkName = String(item?.workName || "").trim();
    const dirPath = String(workDir || item?.workDir || item?.fsPath || "").trim();
  
    if (dirPath) {
      try {
        const workJsonPath = path.join(dirPath, ".mojigoto", "work.json");
        const settings = await readSettingsFile(workJsonPath, {
          fsPath: dirPath,
          workName: itemWorkName,
        });
  
        const title = String(settings?.title || "").trim();
        if (title) return title;
  
        const folderName = String(settings?.folderName || "").trim();
        if (folderName) return folderName;
      } catch {
        // 読めなければ後続へ
      }
  
      const dirBaseName = path.basename(dirPath).trim();
      if (dirBaseName) {
        return dirBaseName;
      }
    }
  
    if (itemWorkName) {
      return itemWorkName;
    }
  
    return String(getCurrentWorkDisplayName(context) || "").trim();
  }
  
  
  async function treeOpenNote(noteItem) {
    try {
      if (!noteItem?.fsPath) {
        vscode.window.showWarningMessage(
          "もじごと: ノートファイルの場所を取得できませんでした。",
        );
        return;
      }

      const workDir = noteItem.workDir || "";
      const workTitle = await resolveConceptMemoWorkTitle(
        context,
        noteItem,
        workDir,
      );

      await openNoteWebview(context, treeProvider, {
        filePath: noteItem.fsPath,
        type: noteItem.type || noteItem.noteType || "plot",
        workDir,
        workName: noteItem.workName || "",
        workTitle,
      });
    } catch (e) {
      vscode.window.showErrorMessage(
        `もじごと: ノートを開けませんでした: ${String(e)}`,
      );
    }
  }

  async function createEmptyConceptMemos(item) {
    try {
      let workDir = "";

      if (isSingleMode()) {
        // single は workDir 不要
      } else if (item?.workDir) {
        workDir = item.workDir;
      } else if (item?.fsPath) {
        workDir = item.fsPath;
      } else {
        const currentWork = treeProvider?.resolveCurrentViewWork?.();
        workDir = currentWork?.fsPath || "";
      }

      const conceptMemosPath = isSingleMode()
        ? getConceptMemosPathForSingle()
        : getConceptMemosPathForWork(workDir);

      if (!conceptMemosPath) {
        vscode.window.showWarningMessage(
          "もじごと: 構想メモの保存先を取得できませんでした。",
        );
        return;
      }

      const workTitle = await resolveConceptMemoWorkTitle(
        context,
        item,
        workDir,
      );

      await openConceptMemoWebview(context, treeProvider, {
        filePath: conceptMemosPath,
        workDir,
        workTitle,
      });
    } catch (e) {
      vscode.window.showErrorMessage(
        `もじごと: 構想メモを開けませんでした: ${String(e)}`,
      );
    }
  }

  async function treeOpenSettings(item) {
    try {
      await openSettingsWebview(context, treeProvider, item);
    } catch (e) {
      vscode.window.showErrorMessage(
        `もじごと: 作品設定画面を開けませんでした: ${String(e)}`,
      );
    }
  }

  async function openVsCodeSettings() {
    try {
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "@ext:hasakudo.mojigoto",
      );
    } catch (e) {
      vscode.window.showErrorMessage(
        `もじごと: VS Code 設定を開けませんでした: ${String(e)}`,
      );
    }
  }

  async function treeCreatePlot(item) {
    try {
      const created = await createNewNote("plot", item, "");

      treeProvider.refresh();

      const workDir = item?.fsPath || item?.workDir || "";
      const workTitle = await resolveConceptMemoWorkTitle(
        context,
        item,
        workDir,
      );

      await openNoteWebview(context, treeProvider, {
        filePath: created.filePath,
        type: "plot",
        workDir,
        workName: item?.workName || "",
        workTitle,
      });
    } catch (e) {
      vscode.window.showErrorMessage(
        `もじごと: プロットを作成できませんでした: ${String(e)}`,
      );
    }
  }

  async function treeCreateReference(item) {
    try {
      const created = await createNewNote("reference", item, "");

      treeProvider.refresh();

      const workDir = item?.fsPath || item?.workDir || "";
      const workTitle = await resolveConceptMemoWorkTitle(
        context,
        item,
        workDir,
      );

      await openNoteWebview(context, treeProvider, {
        filePath: created.filePath,
        type: "reference",
        workDir,
        workName: item?.workName || "",
        workTitle,
      });
    } catch (e) {
      vscode.window.showErrorMessage(
        `もじごと: 資料を作成できませんでした: ${String(e)}`,
      );
    }
  }

  return { treeOpenNote, createEmptyConceptMemos, treeOpenSettings, openVsCodeSettings,
    searchManuscriptFolder: item => searchManuscriptFolder(item),
    searchChapterFolder: item => searchManuscriptFolder(item, true),
    treeCreatePlot, treeCreateReference };
}

module.exports = { createWorkTreeEditorActions };
