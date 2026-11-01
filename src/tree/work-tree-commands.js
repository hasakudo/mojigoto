const { createWorkTreeWorkDeleteActions } = require("./work-tree-work-delete-actions");
const { createWorkTreeTrashActions } = require("./work-tree-trash-actions");
const { createWorkTreeMoveActions } = require("./work-tree-move-actions");
const { createWorkTreeRenameActions } = require("./work-tree-rename-actions");
const { createWorkTreeCreationActions } = require("./work-tree-creation-actions");
const { createWorkTreeEditorActions } = require("./work-tree-editor-actions");
const { createWorkTreeMetadataActions } = require("./work-tree-metadata-actions");
const vscode = require("vscode");
const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const { handleRenamedWorkFolders } = require("../work/work-switch-service");
const { isSingleMode, getWorkRoot } = require("../core/mojigoto-context");
const {
  openSettingsWebview,
  closeSettingsWebviewsUnderFolder,
} = require("../views/settings-webview");
const { createNewNote, moveNoteInOrder } = require("../data/note-store");
const { exportTreeItem } = require("../export/export-service");
const {
  openConceptMemoWebview,
  closeConceptMemoWebviewsUnderFolder,
} = require("../views/concept-memo-webview");
const { getCurrentWorkDisplayName } = require("../work/work-settings");
const { getCurrentWorkName } = require("../core/mojigoto-context");
const {
  moveToTrash,
  restoreTrashItem,
  getTrashDirForSingle,
  getTrashDirForWork,
} = require("../core/mojigoto-trash");
const {
  getPreferredManuscriptDirName,
  getConceptMemosPathForWork,
  getConceptMemosPathForSingle,
  resolveActualWorkDir,
} = require("../core/mojigoto-paths");
const {
  openNoteWebview,
  closeNoteWebviewByPath,
  closeNoteWebviewsUnderFolder,
} = require("../views/note-webview");
const {
  exportViewBundle,
  exportTargetWorkBundle,
  exportNoteTypeBundle,
} = require("../export/export-bundle-service");
const {
  readSettingsFile,
  writeSettingsFile,
  resolveSettingsTarget,
  WORK_STATUS_OPTIONS,
  getWorkStatusLabel,
} = require("../data/settings-store");
const { WORK_STATUS_EMPTY_FILTER } = require("./work-tree-provider");
const {
  findManuscriptRootFromPath,
  resolveManuscriptRootForTreeItem,
  updateWritingMemoFilePathForRenameOrMove,
  updateWritingMemoPathsForFolderRename,
} = require("../writing-memo/writing-memo-tracker");
const {
  normalizeFsPath,
  isSameOrChildPath,
} = require("../writing-memo/writing-memo-resolver");
const {
  keyDailyByWorkName,
  keyFilesByWorkName,
  keyEventsByWorkName,
  keyEventsLastSendAtByWorkName,
  keyEventsLastRemindAtByWorkName,
  keyEventsLastLoggedAtByWorkName,
} = require("../stats/stats-keys");
const { launchExport } = require("../export/export-launcher");
const {
  saveDisplayNameChanges,
} = require("../reorder/reorder-display-names");
const { migrateManuscriptBackupsForMove } = require("../backup/manuscript-backup");

async function migrateManuscriptBackupPath(oldPath, newPath) {
  try {
    await migrateManuscriptBackupsForMove(oldPath, newPath);
  } catch (error) {
    console.warn("[mojigoto] manuscript backup path migration failed:", error);
    vscode.window.showWarningMessage(
      "もじごと: 原稿は移動しましたが、バックアップ履歴の保存先更新に失敗しました。履歴を開くと内容一致から再検出を試みます。",
    );
  }
}

async function migrateManuscriptDisplayNamePath(oldPath, newPath, item = null) {
  const manuscriptRoot =
    resolveManuscriptRootForTreeItem(item, oldPath, newPath) ||
    findManuscriptRootFromPath(oldPath);
  if (!manuscriptRoot) return;

  try {
    await saveDisplayNameChanges(manuscriptRoot, [], {
      moves: [{ from: oldPath, to: newPath }],
    });
  } catch (error) {
    console.warn("[mojigoto] display-name path migration failed:", error);
    vscode.window.showWarningMessage(
      "もじごと: 実名は変更しましたが、作品ツリーの表示名を引き継げませんでした。原稿構成エディタで再設定してください。",
    );
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function closeEditorsByPaths(targetPaths = []) {
  const normalizedTargets = targetPaths
    .filter(Boolean)
    .map((fsPath) => normalizeFsPath(fsPath));

  if (!normalizedTargets.length) {
    return;
  }

  const tabsToClose = [];

  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input;

      // 通常のテキストタブ
      if (input instanceof vscode.TabInputText) {
        const tabPath = input.uri?.fsPath || "";
        if (normalizedTargets.includes(normalizeFsPath(tabPath))) {
          tabsToClose.push(tab);
        }
        continue;
      }

      // 差分表示などで元/先の両方を持つ場合
      if (input instanceof vscode.TabInputTextDiff) {
        const originalPath = input.original?.fsPath || "";
        const modifiedPath = input.modified?.fsPath || "";

        if (
          normalizedTargets.includes(normalizeFsPath(originalPath)) ||
          normalizedTargets.includes(normalizeFsPath(modifiedPath))
        ) {
          tabsToClose.push(tab);
        }
      }
    }
  }

  if (tabsToClose.length) {
    await vscode.window.tabGroups.close(tabsToClose);
  }
}

async function closeEditorsUnderFolder(folderPath) {
  const normalizedFolderPath = normalizeFsPath(folderPath);
  if (!normalizedFolderPath) {
    return;
  }

  const tabsToClose = [];

  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input;

      if (input instanceof vscode.TabInputText) {
        const tabPath = input.uri?.fsPath || "";
        if (isSameOrChildPath(tabPath, normalizedFolderPath)) {
          tabsToClose.push(tab);
        }
        continue;
      }

      if (input instanceof vscode.TabInputTextDiff) {
        const originalPath = input.original?.fsPath || "";
        const modifiedPath = input.modified?.fsPath || "";

        if (
          isSameOrChildPath(originalPath, normalizedFolderPath) ||
          isSameOrChildPath(modifiedPath, normalizedFolderPath)
        ) {
          tabsToClose.push(tab);
        }
      }
    }
  }

  if (tabsToClose.length) {
    await vscode.window.tabGroups.close(tabsToClose);
  }
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function renameFsEntry(oldPath, newPath) {
  await fs.rename(oldPath, newPath);
}

async function revealTreeItemByPath(
  treeProvider,
  workTreeView,
  targetPath,
  options = {},
) {
  try {
    await vscode.commands.executeCommand("workbench.view.extension.mojigoto");
  } catch {}

  const normalizedTarget = normalizeFsPath(targetPath);

  for (let i = 0; i < 6; i += 1) {
    await sleep(100);

    try {
      const ok = await treeProvider?.revealByFsPath?.(
        workTreeView,
        normalizedTarget,
        {
          expand: options.expand ?? true,
          focus: options.focus ?? true,
          select: options.select ?? true,
        },
      );

      if (ok) return true;
    } catch {}
  }

  return false;
}

async function collectChapterFolderItems(treeProvider, parentItem) {
  const result = [];
  const children = await treeProvider?.getChildren?.(parentItem);

  for (const child of Array.isArray(children) ? children : []) {
    if (child?.kind !== "chapterFolder") continue;
    result.push(child);
    result.push(...(await collectChapterFolderItems(treeProvider, child)));
  }

  return result;
}

async function registerMojigotoTreeCommands(
  context,
  treeProvider,
  workTreeView,
) {
  const metadataActions = createWorkTreeMetadataActions({
    vscode, treeProvider, WORK_STATUS_OPTIONS, WORK_STATUS_EMPTY_FILTER,
    resolveSettingsTarget, readSettingsFile, writeSettingsFile, getWorkStatusLabel,
  });
  const editorActions = createWorkTreeEditorActions({
    vscode, fs, context, treeProvider, isSingleMode, getCurrentWorkDisplayName,
    resolveManuscriptRootForTreeItem,
    readSettingsFile, createNewNote, openNoteWebview, getConceptMemosPathForSingle,
    getConceptMemosPathForWork, openConceptMemoWebview, openSettingsWebview,
  });
  const creationActions = createWorkTreeCreationActions({
    vscode, fs, context, treeProvider, isSingleMode, getWorkRoot,
    getPreferredManuscriptDirName, openSettingsWebview,
  });
  const renameActions = createWorkTreeRenameActions({
    vscode, fs, pathExists, renameFsEntry, migrateManuscriptBackupPath,
    migrateManuscriptDisplayNamePath, updateWritingMemoFilePathForRenameOrMove,
    updateWritingMemoPathsForFolderRename, closeEditorsByPaths, closeEditorsUnderFolder,
    revealTreeItemByPath, getCurrentWorkName, getWorkRoot, handleRenamedWorkFolders,
    keyDailyByWorkName, keyFilesByWorkName, keyEventsByWorkName,
    keyEventsLastSendAtByWorkName, keyEventsLastRemindAtByWorkName,
    keyEventsLastLoggedAtByWorkName,
  });
  const moveActions = createWorkTreeMoveActions({
    vscode, fs, normalizeFsPath, resolveManuscriptRootForTreeItem,
    findManuscriptRootFromPath, pathExists, renameFsEntry, migrateManuscriptBackupPath,
    migrateManuscriptDisplayNamePath, updateWritingMemoFilePathForRenameOrMove,
    closeEditorsByPaths, sleep, revealTreeItemByPath,
  });
  const trashActions = createWorkTreeTrashActions({
    vscode, fs, spawn, treeProvider, isSingleMode, resolveActualWorkDir,
    getTrashDirForSingle, getTrashDirForWork, moveToTrash, restoreTrashItem,
    closeEditorsByPaths, closeEditorsUnderFolder,
  });
  const workDeleteActions = createWorkTreeWorkDeleteActions({
    vscode, spawn, context, treeProvider, isSingleMode, getCurrentWorkName,
    closeEditorsUnderFolder, closeNoteWebviewsUnderFolder,
    closeConceptMemoWebviewsUnderFolder, closeSettingsWebviewsUnderFolder,
  });
  const expandedChapterPaths = new Set();

  if (workTreeView?.onDidExpandElement) {
    context.subscriptions.push(
      workTreeView.onDidExpandElement(({ element }) => {
        if (element?.kind !== "chapterFolder" || !element?.fsPath) return;
        expandedChapterPaths.add(normalizeFsPath(element.fsPath));
      }),
      workTreeView.onDidCollapseElement(({ element }) => {
        if (element?.contextValue === "currentViewManuscriptRoot") {
          expandedChapterPaths.clear();
          return;
        }
        if (element?.kind !== "chapterFolder" || !element?.fsPath) return;
        expandedChapterPaths.delete(normalizeFsPath(element.fsPath));
      }),
    );
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("mojigoto.refreshWorkTree", () => {
      treeProvider.refresh();
    }),

    vscode.commands.registerCommand("mojigoto.filterWorksByStatus", metadataActions.filterWorksByStatus),

    vscode.commands.registerCommand("mojigoto.filterWorksByGenre", metadataActions.filterWorksByGenre),

    vscode.commands.registerCommand("mojigoto.changeWorkStatus", metadataActions.changeWorkStatus),

    vscode.commands.registerCommand(
      "mojigoto.treeRenameEntry",
      async (item) => {
        try {
          await renameActions.handleTreeRename(item, context, treeProvider, workTreeView);
        } catch (e) {
          vscode.window.showErrorMessage(
            `もじごと: 名前変更に失敗しました: ${String(e.message || e)}`,
          );
        }
      },
    ),

    vscode.commands.registerCommand(
      "mojigoto.moveManuscriptFile",
      async (item) => {
        try {
          await moveActions.moveManuscriptFileToTarget(item, treeProvider, workTreeView);
        } catch (e) {
          vscode.window.showErrorMessage(
            `もじごと: 原稿ファイルの移動に失敗しました: ${String(e.message || e)}`,
          );
        }
      },
    ),

    vscode.commands.registerCommand("mojigoto.treeOpenNote", editorActions.treeOpenNote),
    vscode.commands.registerCommand("mojigoto.searchManuscriptFolder", editorActions.searchManuscriptFolder),
    vscode.commands.registerCommand("mojigoto.searchChapterFolder", editorActions.searchChapterFolder),

    vscode.commands.registerCommand("mojigoto.moveNoteUp", async (item) => {
      try {
        const moved = await moveNoteInOrder(
          item?.noteType || item?.type || "plot",
          { fsPath: item?.workDir || "", workDir: item?.workDir || "" },
          item?.fsPath || "",
          "up",
        );
        if (moved) treeProvider.refresh();
      } catch (e) {
        vscode.window.showErrorMessage(
          `もじごと: ノートを上へ移動できませんでした: ${String(e)}`,
        );
      }
    }),

    vscode.commands.registerCommand("mojigoto.moveNoteDown", async (item) => {
      try {
        const moved = await moveNoteInOrder(
          item?.noteType || item?.type || "plot",
          { fsPath: item?.workDir || "", workDir: item?.workDir || "" },
          item?.fsPath || "",
          "down",
        );
        if (moved) treeProvider.refresh();
      } catch (e) {
        vscode.window.showErrorMessage(
          `もじごと: ノートを下へ移動できませんでした: ${String(e)}`,
        );
      }
    }),

    vscode.commands.registerCommand("mojigoto.createEmptyConceptMemos", editorActions.createEmptyConceptMemos),

    vscode.commands.registerCommand("mojigoto.treeOpenSettings", editorActions.treeOpenSettings),

    vscode.commands.registerCommand("mojigoto.openVsCodeSettings", editorActions.openVsCodeSettings),

    vscode.commands.registerCommand("mojigoto.treeExportItem", async (item) => {
      try {
        if (!item) {
          vscode.window.showWarningMessage(
            "もじごと: 書き出し対象を取得できませんでした。",
          );
          return;
        }

        await exportTreeItem(context, item);
      } catch (e) {
        vscode.window.showErrorMessage(
          `もじごと: 書き出しに失敗しました: ${String(e)}`,
        );
      }
    }),

    vscode.commands.registerCommand("mojigoto.treeCreatePlot", editorActions.treeCreatePlot),

    vscode.commands.registerCommand("mojigoto.treeCreateReference", editorActions.treeCreateReference),

    vscode.commands.registerCommand("mojigoto.treeCreateWork", creationActions.treeCreateWork),

    vscode.commands.registerCommand(
      "mojigoto.excludeWorkFromList",
      async (item) => {
        if (isSingleMode()) {
          vscode.window.showWarningMessage(
            "もじごと: この操作はMultiモードの作品一覧で使用します。",
          );
          return;
        }

        const workName = String(
          item?.workName || path.basename(String(item?.fsPath || "")),
        ).trim();
        if (!workName) {
          vscode.window.showWarningMessage(
            "もじごと: 除外する作品フォルダを取得できませんでした。",
          );
          return;
        }

        const currentWorkName = String(getCurrentWorkName(context) || "").trim();
        if (
          item?.contextValue === "workCurrent" ||
          (currentWorkName &&
            currentWorkName.toLowerCase() === workName.toLowerCase())
        ) {
          vscode.window.showWarningMessage(
            "もじごと: View連携中の作品は一覧から除外できません。",
          );
          return;
        }

        const answer = await vscode.window.showWarningMessage(
          `作品フォルダ「${workName}」を作品一覧と作品切替の候補から除外します。フォルダや原稿は削除されません。`,
          { modal: true },
          "一覧から除外",
        );
        if (answer !== "一覧から除外") return;

        const cfg = vscode.workspace.getConfiguration("mojigoto");
        const currentExclude = cfg.get("workExclude", []);
        const values = Array.isArray(currentExclude)
          ? currentExclude.map((value) => String(value || "").trim()).filter(Boolean)
          : [];
        const keys = new Set(values.map((value) => value.toLowerCase()));
        if (!keys.has(workName.toLowerCase())) {
          values.push(workName);
          await cfg.update(
            "workExclude",
            values,
            vscode.ConfigurationTarget.Workspace,
          );
        }

        treeProvider.refresh();
        vscode.window.showInformationMessage(
          `もじごと: 「${workName}」を一覧から除外しました。再表示するには、VS Code設定の「もじごと: 作品 › Work Exclude」からフォルダ名を削除してください。`,
        );
      },
    ),

    vscode.commands.registerCommand("mojigoto.createManuscriptFile", creationActions.createManuscriptFileFromTree),

    vscode.commands.registerCommand("mojigoto.createManuscriptFolder", creationActions.createManuscriptFolderFromTree),

    vscode.commands.registerCommand("mojigoto.treeOpenReorder", async () => {
      await vscode.commands.executeCommand("mojigoto.openReorderEditor");
    }),

    vscode.commands.registerCommand(
      "mojigoto.exportPlotBundle",
      async (item) => {
        try {
          if (!item) {
            vscode.window.showWarningMessage(
              "もじごと: プロットまとめ書き出し対象を取得できませんでした。",
            );
            return;
          }

          await exportNoteTypeBundle(context, item, "plot");
        } catch (e) {
          vscode.window.showErrorMessage(
            `もじごと: プロットまとめ書き出しに失敗しました: ${String(e)}`,
          );
        }
      },
    ),

    vscode.commands.registerCommand(
      "mojigoto.exportReferenceBundle",
      async (item) => {
        try {
          if (!item) {
            vscode.window.showWarningMessage(
              "もじごと: 資料まとめ書き出し対象を取得できませんでした。",
            );
            return;
          }

          await exportNoteTypeBundle(context, item, "reference");
        } catch (e) {
          vscode.window.showErrorMessage(
            `もじごと: 資料まとめ書き出しに失敗しました: ${String(e)}`,
          );
        }
      },
    ),

    vscode.commands.registerCommand(
      "mojigoto.exportCurrentViewPlotBundle",
      async () => {
        try {
          if (isSingleMode()) {
            await vscode.commands.executeCommand(
              "mojigoto.exportPlotBundle",
              null,
            );
            return;
          }

          const currentViewItem =
            typeof treeProvider?.resolveCurrentViewWork === "function"
              ? treeProvider.resolveCurrentViewWork()
              : null;

          if (!currentViewItem?.workDir) {
            vscode.window.showWarningMessage(
              "もじごと: 現在の View 対象作品を取得できませんでした。",
            );
            return;
          }

          await vscode.commands.executeCommand("mojigoto.exportPlotBundle", {
            fsPath: currentViewItem.workDir,
            workName: currentViewItem.workName || "",
            workDir: currentViewItem.workDir,
          });
        } catch (error) {
          vscode.window.showErrorMessage(
            `もじごと: プロットまとめ書き出しに失敗しました: ${error.message}`,
          );
        }
      },
    ),

    vscode.commands.registerCommand("mojigoto.exportViewBundle", async () => {
      try {
        const { exportViewBundle } = require("../export/export-bundle-service");

        if (isSingleMode()) {
          await exportViewBundle(context, null);
          return;
        }

        const currentViewItem =
          typeof treeProvider?.resolveCurrentViewWork === "function"
            ? treeProvider.resolveCurrentViewWork()
            : null;

        if (!currentViewItem?.workDir) {
          vscode.window.showWarningMessage(
            "もじごと: 現在の View 対象作品を取得できませんでした。",
          );
          return;
        }

        await exportViewBundle(context, {
          fsPath: currentViewItem.workDir,
          workDir: currentViewItem.workDir,
          workName: currentViewItem.workName || "",
          workTitle: currentViewItem.workTitle || "",
          kind: "currentViewRoot",
        });
      } catch (e) {
        vscode.window.showErrorMessage(
          `もじごと: Viewまとめ書き出しに失敗しました: ${String(e.message || e)}`,
        );
      }
    }),

    vscode.commands.registerCommand(
      "mojigoto.exportTargetWorkBundle",
      async (item) => {
        try {
          if (!item?.fsPath && !item?.workDir) {
            vscode.window.showWarningMessage(
              "もじごと: この作品の書き出し対象を取得できませんでした。作品ツリーから実行してください。",
            );
            return;
          }

          await exportTargetWorkBundle(context, item);
        } catch (e) {
          vscode.window.showErrorMessage(
            `もじごと: この作品のまとめ書き出しに失敗しました: ${String(e.message || e)}`,
          );
        }
      },
    ),

    vscode.commands.registerCommand(
      "mojigoto.exportCurrentViewReferenceBundle",
      async () => {
        try {
          if (isSingleMode()) {
            await vscode.commands.executeCommand(
              "mojigoto.exportReferenceBundle",
              null,
            );
            return;
          }

          const currentViewItem =
            typeof treeProvider?.resolveCurrentViewWork === "function"
              ? treeProvider.resolveCurrentViewWork()
              : null;

          if (!currentViewItem?.workDir) {
            vscode.window.showWarningMessage(
              "もじごと: 現在の View 対象作品を取得できませんでした。",
            );
            return;
          }

          await vscode.commands.executeCommand(
            "mojigoto.exportReferenceBundle",
            {
              fsPath: currentViewItem.workDir,
              workName: currentViewItem.workName || "",
              workDir: currentViewItem.workDir,
            },
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `もじごと: 資料まとめ書き出しに失敗しました: ${error.message}`,
          );
        }
      },
    ),

    vscode.commands.registerCommand(
      "mojigoto.openExportLauncher",
      async (item) => {
        try {
          await launchExport(context, treeProvider, item);
        } catch (e) {
          vscode.window.showErrorMessage(
            `もじごと: 書き出しメニューを開けませんでした: ${String(e.message || e)}`,
          );
        }
      },
    ),

    vscode.commands.registerCommand(
      "mojigoto.revealCurrentViewManuscript",
      async () => {
        try {
          await vscode.commands.executeCommand(
            "workbench.view.extension.mojigoto",
          );
          await vscode.commands.executeCommand("mojigoto.refreshWorkTree");

          const item = treeProvider.getCurrentViewManuscriptItem?.();
          if (!item) {
            vscode.window.showWarningMessage(
              "もじごと: View の原稿フォルダを取得できませんでした。",
            );
            return;
          }

          await workTreeView.reveal(item, {
            expand: true,
            focus: true,
            select: false,
          });
        } catch (e) {
          vscode.window.showErrorMessage(
            `もじごと: 原稿フォルダを開けませんでした: ${String(e)}`,
          );
        }
      },
    ),

    vscode.commands.registerCommand(
      "mojigoto.toggleCurrentViewChapterFolders",
      async (rootItem) => {
        try {
          const item =
            rootItem?.contextValue === "currentViewManuscriptRoot"
              ? rootItem
              : treeProvider.getCurrentViewManuscriptItem?.();

          if (!item) {
            vscode.window.showWarningMessage(
              "もじごと: View の原稿フォルダを取得できませんでした。",
            );
            return;
          }

          const chapterItems = await collectChapterFolderItems(
            treeProvider,
            item,
          );

          if (!chapterItems.length) {
            await workTreeView.reveal(item, {
              expand: true,
              focus: false,
              select: false,
            });
            vscode.window.showInformationMessage(
              "もじごと: 開閉する章フォルダがありません。",
            );
            return;
          }

          const allExpanded = chapterItems.every((chapterItem) =>
            expandedChapterPaths.has(normalizeFsPath(chapterItem.fsPath)),
          );

          if (allExpanded) {
            // TreeView API には項目単位の collapse がないため、深い階層から
            // 対象をフォーカスして VS Code 標準のリスト折りたたみを実行する。
            for (const chapterItem of [...chapterItems].reverse()) {
              await workTreeView.reveal(chapterItem, {
                expand: false,
                focus: true,
                select: true,
              });
              await vscode.commands.executeCommand("list.collapse");
              expandedChapterPaths.delete(
                normalizeFsPath(chapterItem.fsPath),
              );
            }

            await workTreeView.reveal(item, {
              expand: true,
              focus: false,
              select: true,
            });
            return;
          }

          await workTreeView.reveal(item, {
            expand: true,
            focus: false,
            select: false,
          });

          for (const chapterItem of chapterItems) {
            await workTreeView.reveal(chapterItem, {
              expand: true,
              focus: false,
              select: false,
            });
            expandedChapterPaths.add(normalizeFsPath(chapterItem.fsPath));
          }
        } catch (e) {
          vscode.window.showErrorMessage(
            `もじごと: 章フォルダを一括開閉できませんでした: ${String(e)}`,
          );
        }
      },
    ),

    vscode.commands.registerCommand("mojigoto.deleteManuscriptFile", trashActions.deleteManuscriptFile),

    vscode.commands.registerCommand("mojigoto.deleteChapterFolder", trashActions.deleteChapterFolder),

    vscode.commands.registerCommand("mojigoto.deleteNote", trashActions.deleteNote),

    vscode.commands.registerCommand("mojigoto.deleteWork", workDeleteActions.deleteWork),

    vscode.commands.registerCommand(
      "mojigoto.closeNoteWebviewByPath",
      async (filePath) => {
        try {
          return await closeNoteWebviewByPath(filePath);
        } catch {
          return false;
        }
      },
    ),

    vscode.commands.registerCommand("mojigoto.openTrashFolder", trashActions.openTrashFolder),

    vscode.commands.registerCommand("mojigoto.restoreTrashItem", trashActions.restoreTrashEntry),

    vscode.commands.registerCommand("mojigoto.openTrashEntry", trashActions.openTrashEntry),

    vscode.commands.registerCommand("mojigoto.revealTrashEntryInExplorer", trashActions.revealTrashEntryInExplorer),

    vscode.commands.registerCommand("mojigoto.emptyTrash", trashActions.emptyTrash),

  );
}

module.exports = {
  registerMojigotoTreeCommands,
};
