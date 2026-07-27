const vscode = require("vscode");
const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const { handleRenamedWorkFolders } = require("../work/work-switch-service");
const { isSingleMode, getWorkRoot } = require("../core/mojigoto-context");
const { openSettingsWebview } = require("../views/settings-webview");
const { createNewNote } = require("../data/note-store");
const { exportTreeItem } = require("../export/export-service");
const { openConceptMemoWebview } = require("../views/concept-memo-webview");
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
} = require("../views/note-webview");
const {
  exportViewBundle,
  exportTargetWorkBundle,
  exportNoteTypeBundle,
} = require("../export/export-bundle-service");
const {
  readSettingsFile,
  WORK_STATUS_OPTIONS,
  getWorkStatusLabel,
} = require("../data/settings-store");
const {
  getWorkStatusFilterLabel,
  WORK_STATUS_NOT_HOLD_COMPLETE_FILTER,
} = require("./work-tree-provider");
const {
  findManuscriptRootFromPath,
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

function applyDefaultExtension(fileName) {
  const cfg = vscode.workspace.getConfiguration("mojigoto");

  const defaultExtension = String(
    cfg.get("defaultFileExtension", ".txt") || ".txt",
  );

  const name = String(fileName || "").trim();
  if (!name) return "";

  if (/\.[^./\\]+$/.test(name)) {
    return name;
  }

  return name + defaultExtension;
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function createManuscriptFile(targetDir) {
  const name = await vscode.window.showInputBox({
    title: "新規原稿ファイル",
    prompt: "ファイル名を入力してください",
    placeHolder: "例: 第1話",
    ignoreFocusOut: true,
  });

  if (!name) return;

  const fileName = applyDefaultExtension(name);
  const fullPath = path.join(targetDir, fileName);

  try {
    await fs.access(fullPath);
    vscode.window.showWarningMessage(
      `もじごと: 同名ファイルがすでに存在します: ${fileName}`,
    );
    return;
  } catch {
    // 存在しなければ作成続行
  }

  await fs.writeFile(fullPath, "", "utf8");

  const uri = vscode.Uri.file(fullPath);
  await vscode.commands.executeCommand("vscode.open", uri);

  vscode.window.showInformationMessage(`原稿を作成しました: ${fileName}`);
}

async function createManuscriptFolder(targetDir) {
  const name = await vscode.window.showInputBox({
    title: "新規章フォルダ",
    prompt: "フォルダ名を入力してください",
    ignoreFocusOut: true,
  });

  if (!name) return;

  const dirPath = path.join(targetDir, name.trim());

  await fs.mkdir(dirPath, { recursive: true });

  vscode.window.showInformationMessage(`フォルダを作成しました: ${name}`);
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

async function renameFsEntry(oldPath, newPath) {
  await fs.rename(oldPath, newPath);
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
    const inputName = await promptRenameTarget(
      oldName,
      "原稿ファイルの名前変更",
    );
    if (!inputName || inputName === oldName) return;

    const newName = applyDefaultExtension(inputName);
    const newPath = path.join(path.dirname(oldPath), newName);

    if (await pathExists(newPath)) {
      vscode.window.showWarningMessage(
        `もじごと: 同名ファイルがすでに存在します: ${newName}`,
      );
      return;
    }

    await renameFsEntry(oldPath, newPath);
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
  const rootDir = findManuscriptRootFromPath(filePath);

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

async function registerMojigotoTreeCommands(
  context,
  treeProvider,
  workTreeView,
) {
  context.subscriptions.push(
    vscode.commands.registerCommand("mojigoto.refreshWorkTree", () => {
      treeProvider.refresh();
    }),

    vscode.commands.registerCommand(
      "mojigoto.filterWorksByStatus",
      async () => {
        try {
          const current = treeProvider?.getWorkStatusFilter?.() || "";

          const items = [
            {
              label: current ? "すべて表示" : "すべて表示 ✓",
              description: "状態で絞り込まない",
              value: "",
            },
            {
              label:
                current === WORK_STATUS_NOT_HOLD_COMPLETE_FILTER
                  ? "保留・完結以外 ✓"
                  : "保留・完結以外",
              description: "保留・完結ではない作品",
              value: WORK_STATUS_NOT_HOLD_COMPLETE_FILTER,
            },
            ...WORK_STATUS_OPTIONS.filter((item) => item.value).map((item) => {
              return {
                label: item.value === current ? `${item.label} ✓` : item.label,
                description: `状態: ${item.label}`,
                value: item.value,
              };
            }),
          ];

          const picked = await vscode.window.showQuickPick(items, {
            title: "作品一覧の状態絞り込み",
            placeHolder: `現在: ${getWorkStatusFilterLabel(current)}`,
            ignoreFocusOut: true,
          });

          if (!picked) return;

          await treeProvider?.setWorkStatusFilter?.(picked.value || "");
        } catch (e) {
          vscode.window.showErrorMessage(
            `もじごと: 作品一覧の絞り込みに失敗しました: ${String(e.message || e)}`,
          );
        }
      },
    ),

    vscode.commands.registerCommand("mojigoto.filterWorksByGenre", async () => {
      try {
        const current = treeProvider?.getWorkGenreFilter?.() || "";

        const works =
          typeof treeProvider?.getAllWorksForFilter === "function"
            ? treeProvider.getAllWorksForFilter()
            : [];

        const genreInfo =
          typeof treeProvider?.getAvailableWorkGenres === "function"
            ? treeProvider.getAvailableWorkGenres()
            : { genres: [], hasEmpty: false };

        const items = [
          {
            label: current ? "すべて表示" : "すべて表示 ✓",
            description: "ジャンルで絞り込まない",
            value: "",
          },
        ];

        if (genreInfo.hasEmpty) {
          items.push({
            label: current === "__empty__" ? "未設定 ✓" : "未設定",
            description: "ジャンル未設定の作品",
            value: "__empty__",
          });
        }

        for (const genre of genreInfo.genres) {
          items.push({
            label: genre === current ? `${genre} ✓` : genre,
            description: `ジャンル: ${genre}`,
            value: genre,
          });
        }

        const picked = await vscode.window.showQuickPick(items, {
          title: "作品一覧のジャンル絞り込み",
          placeHolder: `現在: ${
            current ? (current === "__empty__" ? "未設定" : current) : "すべて"
          }`,
          ignoreFocusOut: true,
        });

        if (!picked) return;

        await treeProvider?.setWorkGenreFilter?.(picked.value || "");
      } catch (e) {
        vscode.window.showErrorMessage(
          `もじごと: 作品一覧のジャンル絞り込みに失敗しました: ${String(e.message || e)}`,
        );
      }
    }),

    vscode.commands.registerCommand(
      "mojigoto.treeRenameEntry",
      async (item) => {
        try {
          await handleTreeRename(item, context, treeProvider, workTreeView);
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
          await moveManuscriptFileToTarget(item, treeProvider, workTreeView);
        } catch (e) {
          vscode.window.showErrorMessage(
            `もじごと: 原稿ファイルの移動に失敗しました: ${String(e.message || e)}`,
          );
        }
      },
    ),

    vscode.commands.registerCommand(
      "mojigoto.treeOpenNote",
      async (noteItem) => {
        try {
          if (!noteItem?.fsPath) {
            vscode.window.showWarningMessage(
              "もじごと: ノートファイルの場所を取得できませんでした。",
            );
            return;
          }

          await openNoteWebview(context, treeProvider, {
            filePath: noteItem.fsPath,
            type: noteItem.type || noteItem.noteType || "plot",
            workDir: noteItem.workDir || "",
          });
        } catch (e) {
          vscode.window.showErrorMessage(
            `もじごと: ノートを開けませんでした: ${String(e)}`,
          );
        }
      },
    ),

    vscode.commands.registerCommand(
      "mojigoto.createEmptyConceptMemos",
      async (item) => {
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
      },
    ),

    vscode.commands.registerCommand(
      "mojigoto.treeOpenSettings",
      async (item) => {
        try {
          await openSettingsWebview(context, treeProvider, item);
        } catch (e) {
          vscode.window.showErrorMessage(
            `もじごと: 作品設定画面を開けませんでした: ${String(e)}`,
          );
        }
      },
    ),

    vscode.commands.registerCommand("mojigoto.openVsCodeSettings", async () => {
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
    }),

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

    vscode.commands.registerCommand("mojigoto.treeCreatePlot", async (item) => {
      try {
        const created = await createNewNote("plot", item, "");

        treeProvider.refresh();

        await openNoteWebview(context, treeProvider, {
          filePath: created.filePath,
          type: "plot",
        });
      } catch (e) {
        vscode.window.showErrorMessage(
          `もじごと: プロットを作成できませんでした: ${String(e)}`,
        );
      }
    }),

    vscode.commands.registerCommand(
      "mojigoto.treeCreateReference",
      async (item) => {
        try {
          const created = await createNewNote("reference", item, "");

          treeProvider.refresh();

          await openNoteWebview(context, treeProvider, {
            filePath: created.filePath,
            type: "reference",
          });
        } catch (e) {
          vscode.window.showErrorMessage(
            `もじごと: 資料を作成できませんでした: ${String(e)}`,
          );
        }
      },
    ),

    vscode.commands.registerCommand("mojigoto.treeCreateWork", async () => {
      if (isSingleMode()) {
        vscode.window.showWarningMessage(
          "もじごと: single モードでは新規作品作成は使いません。",
        );
        return;
      }

      const workRoot = getWorkRoot();
      if (!workRoot) {
        vscode.window.showWarningMessage("もじごと: workRoot が未設定です。");
        return;
      }

      const workName = await vscode.window.showInputBox({
        title: "もじごと: 新規作品",
        prompt: "作品フォルダ名を入力してください",
        ignoreFocusOut: true,
      });
      if (!workName) return;

      const workDir = path.join(workRoot, workName);
      const manuscriptDir = path.join(workDir, getPreferredManuscriptDirName());
      const vpDir = path.join(workDir, ".mojigoto");

      try {
        await fs.mkdir(manuscriptDir, { recursive: true });
        await fs.mkdir(path.join(vpDir, "plots"), { recursive: true });
        await fs.mkdir(path.join(vpDir, "references"), { recursive: true });

        const workJson = path.join(vpDir, "work.json");
        const payload = {
          schemaVersion: 1,
          folderName: workName,
          title: workName,
          genre: "",
          genres: [],
          status: "draft",
          targetChars: 0,
          deadline: "",
          summary: "",
        };
        await fs.writeFile(workJson, JSON.stringify(payload, null, 2), "utf8");

        treeProvider.refresh();

        const createdWorkItem = {
          kind: "work",
          fsPath: workDir,
          workDir,
          workName,
        };

        await openSettingsWebview(context, treeProvider, createdWorkItem);

        vscode.window.showInformationMessage(
          `もじごと: 作品「${workName}」を作成しました。`,
        );
      } catch (e) {
        vscode.window.showErrorMessage(
          `もじごと: 新規作品の作成に失敗しました: ${String(e)}`,
        );
      }
    }),

    vscode.commands.registerCommand(
      "mojigoto.createManuscriptFile",
      async (item) => {
        await createManuscriptFile(item.fsPath);
        treeProvider.refresh();
      },
    ),

    vscode.commands.registerCommand(
      "mojigoto.createManuscriptFolder",
      async (item) => {
        await createManuscriptFolder(item.fsPath);
        treeProvider.refresh();
      },
    ),

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
      "mojigoto.deleteManuscriptFile",
      async (item) => {
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
      },
    ),

    vscode.commands.registerCommand(
      "mojigoto.deleteChapterFolder",
      async (item) => {
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
      },
    ),

    vscode.commands.registerCommand("mojigoto.deleteNote", async (item) => {
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
    }),

    vscode.commands.registerCommand("mojigoto.deleteWork", async (item) => {
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
    }),

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

    vscode.commands.registerCommand(
      "mojigoto.openTrashFolder",
      async (item) => {
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
      },
    ),

    vscode.commands.registerCommand(
      "mojigoto.restoreTrashItem",
      async (item) => {
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
      },
    ),

    vscode.commands.registerCommand("mojigoto.openTrashEntry", async (item) => {
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
    }),

    vscode.commands.registerCommand(
      "mojigoto.revealTrashEntryInExplorer",
      async (item) => {
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
      },
    ),

    vscode.commands.registerCommand("mojigoto.emptyTrash", async (item) => {
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
    }),
  );
}

module.exports = {
  registerMojigotoTreeCommands,
};
