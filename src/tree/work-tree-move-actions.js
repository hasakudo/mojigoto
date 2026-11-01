const path = require("path");

// Manuscript move selection and sequencing. Shared migration helpers remain in the host.
function createWorkTreeMoveActions({ vscode, fs, normalizeFsPath,
  resolveManuscriptRootForTreeItem, findManuscriptRootFromPath, pathExists, renameFsEntry,
  migrateManuscriptBackupPath, migrateManuscriptDisplayNamePath,
  updateWritingMemoFilePathForRenameOrMove, closeEditorsByPaths, sleep, revealTreeItemByPath }) {
  async function listChapterFolderTargets(rootDir) {
    const result = [];
  
    async function walk(dirPath) {
      let entries = [];
      try {
        entries = await fs.readdir(dirPath, { withFileTypes: true });
      } catch {
        return;
      }
  
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
  
        const fullPath = path.join(dirPath, entry.name);
  
        // .mojigoto などは対象外
        if (entry.name.startsWith(".")) continue;
  
        // 現在ファイル自身の親フォルダも出してよいが、
        // 同じ場所への移動を防ぎたいならここで除外してもOK
        result.push({
          label: entry.name,
          description: path.relative(rootDir, fullPath) || entry.name,
          targetPath: fullPath,
        });
  
        await walk(fullPath);
      }
    }
  
    await walk(rootDir);
  
    result.sort((a, b) =>
      String(a.description || "").localeCompare(
        String(b.description || ""),
        "ja",
        {
          numeric: true,
          sensitivity: "base",
        },
      ),
    );
  
    return result;
  }
  
  async function pickMoveTargetForManuscriptFile(item) {
    const filePath = item?.fsPath || "";
    if (!filePath) return null;
  
    const parentDir = path.dirname(filePath);
    const rootDir =
      resolveManuscriptRootForTreeItem(item, filePath) ||
      findManuscriptRootFromPath(filePath);
  
    if (!rootDir) return null;
  
    const folders = await listChapterFolderTargets(rootDir, filePath);
  
    const picks = [
      {
        label: "原稿ルート直下",
        description: rootDir,
        targetPath: rootDir,
      },
      ...folders,
    ];
  
    const picked = await vscode.window.showQuickPick(picks, {
      title: "移動先を選択",
      placeHolder: "原稿ファイルの移動先を選んでください",
      matchOnDescription: true,
      ignoreFocusOut: true,
    });
  
    if (!picked) return null;
  
    const targetPath = picked.targetPath;
  
    if (normalizeFsPath(targetPath) === normalizeFsPath(parentDir)) {
      vscode.window.showInformationMessage(
        "もじごと: すでにそのフォルダにあります。",
      );
      return null;
    }
  
    return targetPath;
  }
  
  async function moveManuscriptFileToTarget(item, treeProvider, workTreeView) {
    if (!item?.fsPath) {
      vscode.window.showWarningMessage(
        "もじごと: 移動する原稿ファイルを取得できませんでした。",
      );
      return;
    }
  
    const oldPath = item.fsPath;
    const fileName = path.basename(oldPath);
  
    const targetDir = await pickMoveTargetForManuscriptFile(item);
    if (!targetDir) return;
  
    const newPath = path.join(targetDir, fileName);
  
    if (await pathExists(newPath)) {
      vscode.window.showWarningMessage(
        `もじごと: 移動先に同名ファイルがすでに存在します: ${fileName}`,
      );
      return;
    }
  
    await renameFsEntry(oldPath, newPath);
    await migrateManuscriptBackupPath(oldPath, newPath);
    await migrateManuscriptDisplayNamePath(oldPath, newPath, item);
    await updateWritingMemoFilePathForRenameOrMove(item, oldPath, newPath);
    await closeEditorsByPaths([oldPath]);
  
    treeProvider?.refresh();
    await sleep(120);
  
    await revealTreeItemByPath(treeProvider, workTreeView, newPath, {
      expand: true,
      focus: true,
      select: true,
    });
  
    vscode.window.showInformationMessage(
      `もじごと: 原稿ファイルを移動しました: ${fileName}`,
    );
  }
  
  
  return { moveManuscriptFileToTarget };
}

module.exports = { createWorkTreeMoveActions };
