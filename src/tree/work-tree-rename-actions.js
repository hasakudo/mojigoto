const path = require("path");

// Rename orchestration; shared tab, migration and reveal helpers remain in the host.
function createWorkTreeRenameActions({ vscode, fs, pathExists, renameFsEntry,
  migrateManuscriptBackupPath, migrateManuscriptDisplayNamePath,
  updateWritingMemoFilePathForRenameOrMove, updateWritingMemoPathsForFolderRename,
  closeEditorsByPaths, closeEditorsUnderFolder, revealTreeItemByPath,
  getCurrentWorkName, getWorkRoot, handleRenamedWorkFolders,
  keyDailyByWorkName, keyFilesByWorkName, keyEventsByWorkName,
  keyEventsLastSendAtByWorkName, keyEventsLastRemindAtByWorkName,
  keyEventsLastLoggedAtByWorkName }) {
  async function promptRenameTarget(oldName, title) {
    const newName = await vscode.window.showInputBox({
      title,
      prompt: "新しい名前を入力してください",
      value: oldName,
      ignoreFocusOut: true,
      validateInput: (value) => {
        const v = String(value || "").trim();
        if (!v) return "名前を入力してください。";
        if (/[\\/:*?"<>|]/.test(v)) {
          return '次の文字は使えません: \\ / : * ? " < > |';
        }
        return null;
      },
    });
  
    return String(newName || "").trim();
  }
  
  async function promptRenameWorkFolder(oldFolderName) {
    const newName = await vscode.window.showInputBox({
      title: "作品フォルダ名の変更",
      prompt: "作品名ではなく、実際のフォルダ名を変更します。",
      value: oldFolderName,
      placeHolder: "現在のフォルダ名を入力",
      ignoreFocusOut: true,
      validateInput: (value) => {
        const v = String(value || "").trim();
        if (!v) return "フォルダ名を入力してください。";
        if (/[\\/:*?"<>|]/.test(v)) {
          return '次の文字は使えません: \\ / : * ? " < > |';
        }
        return null;
      },
    });
  
    return String(newName || "").trim();
  }
  
  
  async function updateWorkFolderNameJson(workDir, folderName) {
    const workJson = path.join(workDir, ".mojigoto", "work.json");
  
    try {
      const raw = await fs.readFile(workJson, "utf8");
      const current = JSON.parse(raw);
  
      const next = {
        ...current,
        folderName,
        updatedAt: new Date().toISOString(),
      };
  
      await fs.writeFile(workJson, JSON.stringify(next, null, 2), "utf8");
      return true;
    } catch {
      return false;
    }
  }
  
  async function updateNoteTitleInJson(filePath, nextTitle) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const data = JSON.parse(raw);
  
      const next = {
        ...data,
        title: String(nextTitle || "").trim(),
        updatedAt: new Date().toISOString(),
      };
  
      await fs.writeFile(filePath, JSON.stringify(next, null, 2), "utf8");
      return true;
    } catch {
      return false;
    }
  }
  
  async function migrateGlobalStateValue(context, oldKey, newKey) {
    const oldValue = context.globalState.get(oldKey);
    if (typeof oldValue === "undefined") {
      return false;
    }
  
    await context.globalState.update(newKey, oldValue);
    await context.globalState.update(oldKey, undefined);
    return true;
  }
  
  async function migrateStatsKeysForRenamedWork(
    context,
    oldWorkName,
    newWorkName,
  ) {
    const oldName = String(oldWorkName || "").trim();
    const newName = String(newWorkName || "").trim();
  
    if (!oldName || !newName || oldName === newName) {
      return false;
    }
  
    let changed = false;
  
    const keyPairs = [
      [keyDailyByWorkName(oldName), keyDailyByWorkName(newName)],
      [keyFilesByWorkName(oldName), keyFilesByWorkName(newName)],
      [keyEventsByWorkName(oldName), keyEventsByWorkName(newName)],
      [
        keyEventsLastSendAtByWorkName(oldName),
        keyEventsLastSendAtByWorkName(newName),
      ],
      [
        keyEventsLastRemindAtByWorkName(oldName),
        keyEventsLastRemindAtByWorkName(newName),
      ],
      [
        keyEventsLastLoggedAtByWorkName(oldName),
        keyEventsLastLoggedAtByWorkName(newName),
      ],
    ];
  
    for (const [oldKey, newKey] of keyPairs) {
      const moved = await migrateGlobalStateValue(context, oldKey, newKey);
      if (moved) {
        changed = true;
      }
    }
  
    return changed;
  }
  
  async function handleTreeRename(item, context, treeProvider, workTreeView) {
    if (!item?.fsPath || !item?.kind) {
      vscode.window.showWarningMessage(
        "もじごと: 名前変更対象を取得できませんでした。",
      );
      return;
    }
  
    const oldPath = item.fsPath;
    const oldName = path.basename(oldPath);
  
    // 原稿ファイル
    if (item.kind === "manuscriptFile") {
      const detectedExt = path.extname(oldName);
      const oldExt = [".txt", ".md"].includes(detectedExt.toLowerCase())
        ? detectedExt
        : "";
      const oldBase = path.basename(oldName, oldExt);
      const inputName = await promptRenameTarget(
        oldBase,
        oldExt
          ? `原稿ファイルの名前変更（${oldExt} は維持されます）`
          : "原稿ファイルの名前変更",
      );
      if (!inputName || inputName === oldBase) return;
  
      const newName = `${inputName}${oldExt}`;
      const newPath = path.join(path.dirname(oldPath), newName);
  
      if (await pathExists(newPath)) {
        vscode.window.showWarningMessage(
          `もじごと: 同名ファイルがすでに存在します: ${newName}`,
        );
        return;
      }
  
      await renameFsEntry(oldPath, newPath);
      await migrateManuscriptBackupPath(oldPath, newPath);
      await migrateManuscriptDisplayNamePath(oldPath, newPath, item);
      await updateWritingMemoFilePathForRenameOrMove(item, oldPath, newPath);
      await closeEditorsByPaths([oldPath]);
  
      treeProvider?.refresh();
      await revealTreeItemByPath(treeProvider, workTreeView, newPath);
  
      vscode.window.showInformationMessage(
        `もじごと: 原稿ファイル名を変更しました: ${oldName} → ${newName}`,
      );
      return;
    }
  
    // ノートファイル
    if (item.kind === "noteFile") {
      const oldExt = path.extname(oldName);
      const oldBase = path.basename(oldName, oldExt);
  
      const inputName = await promptRenameTarget(oldBase, "ノートの名前変更");
      if (!inputName || inputName === oldBase) return;
  
      const newBase = inputName.trim();
      const newName = `${newBase}${oldExt}`;
      const newPath = path.join(path.dirname(oldPath), newName);
  
      if (await pathExists(newPath)) {
        vscode.window.showWarningMessage(
          `もじごと: 同名ノートがすでに存在します: ${newName}`,
        );
        return;
      }
  
      await renameFsEntry(oldPath, newPath);
  
      // JSON 内の title も新しい名前へ更新
      await updateNoteTitleInJson(newPath, newBase);
  
      await closeEditorsByPaths([oldPath]);
      await vscode.commands.executeCommand(
        "mojigoto.closeNoteWebviewByPath",
        oldPath,
      );
  
      treeProvider?.refresh();
      await revealTreeItemByPath(treeProvider, workTreeView, newPath);
  
      vscode.window.showInformationMessage(
        `もじごと: ノート名を変更しました: ${oldName} → ${newName}`,
      );
      return;
    }
  
    // 章フォルダ
    if (item.kind === "chapterFolder") {
      const newName = await promptRenameTarget(oldName, "章フォルダの名前変更");
      if (!newName || newName === oldName) return;
  
      const newPath = path.join(path.dirname(oldPath), newName);
  
      if (await pathExists(newPath)) {
        vscode.window.showWarningMessage(
          `もじごと: 同名フォルダがすでに存在します: ${newName}`,
        );
        return;
      }
  
      await renameFsEntry(oldPath, newPath);
      await migrateManuscriptBackupPath(oldPath, newPath);
      await migrateManuscriptDisplayNamePath(oldPath, newPath, item);
      await updateWritingMemoPathsForFolderRename(item, oldPath, newPath);
      await closeEditorsUnderFolder(oldPath);
  
      treeProvider?.refresh();
      await revealTreeItemByPath(treeProvider, workTreeView, newPath);
  
      vscode.window.showInformationMessage(
        `もじごと: 章フォルダ名を変更しました: ${oldName} → ${newName}`,
      );
      return;
    }
  
    // 作品フォルダ（Multi）
    if (item.kind === "work") {
      const currentViewWorkName = String(
        getCurrentWorkName(context) || "",
      ).trim();
      const targetWorkName = String(
        item.workName || path.basename(oldPath) || "",
      ).trim();
  
      if (currentViewWorkName && currentViewWorkName === targetWorkName) {
        vscode.window.showWarningMessage(
          "もじごと: View連携中の作品フォルダ名は変更できません。作品を切り替えるか、連携を外してから変更してください。",
        );
        return;
      }
  
      const workRoot = getWorkRoot();
      if (!workRoot) {
        vscode.window.showWarningMessage(
          "もじごと: workRoot が未設定のため作品名変更できません。",
        );
        return;
      }
  
      const newName = await promptRenameWorkFolder(oldName);
      if (!newName || newName === oldName) return;
  
      const newPath = path.join(path.dirname(oldPath), newName);
  
      if (await pathExists(newPath)) {
        vscode.window.showWarningMessage(
          `もじごと: 同名作品フォルダがすでに存在します: ${newName}`,
        );
        return;
      }
  
      await renameFsEntry(oldPath, newPath);
  
      await updateWorkFolderNameJson(newPath, newName);
  
      await migrateStatsKeysForRenamedWork(context, oldName, newName);
  
      await handleRenamedWorkFolders(context, {
        files: [
          {
            oldUri: vscode.Uri.file(oldPath),
            newUri: vscode.Uri.file(newPath),
          },
        ],
      });
  
      treeProvider?.refresh();
      await revealTreeItemByPath(treeProvider, workTreeView, newPath);
  
      vscode.window.showInformationMessage(
        `もじごと: 作品フォルダ名を変更しました: ${oldName} → ${newName}`,
      );
      return;
    }
  
    vscode.window.showInformationMessage(
      "もじごと: この項目の名前変更はまだ未対応です。",
    );
  }
  
  
  return { handleTreeRename };
}

module.exports = { createWorkTreeRenameActions };
