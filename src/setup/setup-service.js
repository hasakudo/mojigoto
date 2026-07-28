const vscode = require("vscode");
const fsp = require("fs/promises");
const path = require("path");
const {
  writeSettingsFile,
  resolveSettingsTarget,
  collectGenreOptions,
  normalizeGenres,
  normalizeWorkStatus,
  DEFAULT_GENRE_OPTIONS,
} = require("../data/settings-store");
const {
  getWorkspaceRoot,
  getRecommendedRoots,
} = require("../core/mojigoto-context");

const {
  collectWorkCandidates,
  createJunction,
  getExcludeList,
  getManuscriptCandidates,
  getPickLimit,
  rmForce,
  ensureDir,
} = require("../work/work-switch-service");

const { setCurrentWorkName } = require("../work/work-meta-service");
const { sanitizeFolderName } = require("../core/path-utils");

async function existsPath(targetPath) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFileSafe(filePath) {
  try {
    if (!filePath) return null;
    const raw = await fsp.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildWorkJsonFromSingleSettings(
  singleSettings,
  folderName,
  fallbackTitle = "",
) {
  const src = singleSettings || {};
  const normalizedFolderName = String(folderName || "").trim();
  const normalizedTitle =
    String(src.title || "").trim() || String(fallbackTitle || "").trim();
  const genres = normalizeGenres(
    Array.isArray(src.genres) && src.genres.length ? src.genres : src.genre,
  );

  return {
    schemaVersion: Number(src.schemaVersion || 1) || 1,
    folderName: normalizedFolderName,
    title: normalizedTitle,
    genre: genres.join(", "),
    genres,
    status: normalizeWorkStatus(src.status),
    targetChars: Number(src.targetChars || 0) || 0,
    deadline: String(src.deadline || "").trim(),
    summary: String(src.summary || "").trim(),
    memo: String(src.memo || "").trim(),
    updatedAt: String(src.updatedAt || "").trim() || new Date().toISOString(),
    exportOptions:
      src.exportOptions && typeof src.exportOptions === "object"
        ? { ...src.exportOptions }
        : undefined,
  };
}

async function getSingleMigrationSource(wsPath) {
  const workspaceRoot = String(wsPath || "").trim();
  if (!workspaceRoot) {
    return {
      workspaceRoot: "",
      manuscriptDir: "",
      mojigotoDir: "",
      settingsPath: "",
      plotsDir: "",
      referencesDir: "",
      hasManuscript: false,
      hasSettings: false,
      hasPlots: false,
      hasReferences: false,
      hasAnySource: false,
      settings: null,
    };
  }

  const manuscriptDir = path.join(workspaceRoot, "manuscript");
  const mojigotoDir = path.join(workspaceRoot, ".mojigoto");
  const settingsPath = path.join(mojigotoDir, "singleWork.json");
  const plotsDir = path.join(mojigotoDir, "plots");
  const referencesDir = path.join(mojigotoDir, "references");

  const hasManuscript = await existsPath(manuscriptDir);
  const hasSettings = await existsPath(settingsPath);
  const hasPlots = await existsPath(plotsDir);
  const hasReferences = await existsPath(referencesDir);

  const settings = hasSettings ? await readJsonFileSafe(settingsPath) : null;

  return {
    workspaceRoot,
    manuscriptDir,
    mojigotoDir,
    settingsPath,
    plotsDir,
    referencesDir,
    hasManuscript,
    hasSettings,
    hasPlots,
    hasReferences,
    hasAnySource: hasManuscript || hasSettings || hasPlots || hasReferences,
    settings,
  };
}

async function hasSingleMigrationSource(wsPath) {
  const source = await getSingleMigrationSource(wsPath);
  return !!source.hasAnySource;
}

async function movePathIfExists(fromPath, toPath) {
  if (!(await existsPath(fromPath))) return false;

  await ensureDir(path.dirname(toPath));
  await rmForce(toPath);
  await fsp.rename(fromPath, toPath);

  return true;
}

async function cleanupDirIfEmpty(dirPath) {
  try {
    const entries = await fsp.readdir(dirPath);
    if (entries.length === 0) {
      await fsp.rmdir(dirPath);
    }
  } catch {
    // noop
  }
}

async function migrateSingleToMultiWork(context, options = {}) {
  const wsPath = String(options.wsPath || "").trim();
  const workRoot = String(options.workRoot || "").trim();
  const workName = String(options.workName || "").trim();
  const fallbackTitle = String(options.fallbackTitle || "").trim();

  if (!wsPath) {
    throw new Error("移行元のワークフォルダが取得できませんでした。");
  }
  if (!workRoot) {
    throw new Error("移行先の workRoot が取得できませんでした。");
  }
  if (!workName) {
    throw new Error("移行先の作品フォルダ名が未入力です。");
  }

  const source = await getSingleMigrationSource(wsPath);
  if (!source.hasAnySource) {
    throw new Error("移行対象の Single データが見つかりませんでした。");
  }

  const newWorkDir = path.join(workRoot, workName);
  const newWorkMojigotoDir = path.join(newWorkDir, ".mojigoto");
  const newWorkManuscriptDir = path.join(newWorkDir, "manuscript");
  const newWorkPlotsDir = path.join(newWorkMojigotoDir, "plots");
  const newWorkReferencesDir = path.join(newWorkMojigotoDir, "references");
  const newWorkSettingsPath = path.join(newWorkMojigotoDir, "work.json");

  const viewWorkDir = path.join(workRoot, "_WORK");
  const viewLinkPath = path.join(viewWorkDir, "manuscript");

  if (await existsPath(newWorkDir)) {
    throw new Error(`移行先の作品フォルダがすでに存在します: ${workName}`);
  }

  await ensureDir(newWorkDir);
  await ensureDir(newWorkMojigotoDir);
  await ensureDir(viewWorkDir);

  // manuscript
  if (source.hasManuscript) {
    await movePathIfExists(source.manuscriptDir, newWorkManuscriptDir);
  } else {
    await ensureDir(newWorkManuscriptDir);
  }

  // plots / references
  if (source.hasPlots) {
    await movePathIfExists(source.plotsDir, newWorkPlotsDir);
  }
  if (source.hasReferences) {
    await movePathIfExists(source.referencesDir, newWorkReferencesDir);
  }

  // settings.json -> work.json
  const workJson = buildWorkJsonFromSingleSettings(
    source.settings,
    workName,
    fallbackTitle || workName,
  );
  await fsp.writeFile(
    newWorkSettingsPath,
    JSON.stringify(workJson, null, 2),
    "utf8",
  );

  // 旧 settings.json は削除
  if (source.hasSettings) {
    await rmForce(source.settingsPath);
  }

  // 空になった旧 .mojigoto を整理
  await cleanupDirIfEmpty(source.mojigotoDir);

  // View を新作品へ向ける
  await rmForce(viewLinkPath);
  await createJunction(viewLinkPath, newWorkManuscriptDir);

  await setCurrentWorkName(context, workName);

  return {
    workName,
    workDir: newWorkDir,
    manuscriptDir: newWorkManuscriptDir,
    settingsPath: newWorkSettingsPath,
  };
}

async function buildInitialSetupState(createWorkNow = true, context = null) {
  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const wsPath = getWorkspaceRoot();
  const mode = String(cfg.get("mode", "single") || "single").trim() || "single";

  const singleRecommended = getRecommendedRoots("single", wsPath);
  const multiRecommended = getRecommendedRoots("multi", wsPath);
  const currentRecommended =
    mode === "multi" ? multiRecommended : singleRecommended;

  const singleMigrationAvailable = await hasSingleMigrationSource(wsPath);
  const genreOptions = await collectGenreOptions([], context);

  return {
    mode,
    workRoot: currentRecommended.workRoot,
    manuscriptRoot: currentRecommended.manuscriptRoot,
    singleRecommendedManuscriptRoot: singleRecommended.manuscriptRoot,
    multiRecommendedWorkRoot: multiRecommended.workRoot,
    multiRecommendedManuscriptRoot: multiRecommended.manuscriptRoot,
    singleMigrationAvailable,
    defaultExtension: String(cfg.get("defaultFileExtension", ".txt") || ".txt"),
    createWorkNow,
    workTitle: "",
    genre: "",
    genres: [],
    genreOptions,
    defaultGenreOptions: DEFAULT_GENRE_OPTIONS,
    targetChars: "",
    deadline: "",
    summary: "",
  };
}

async function revealWorkTreeAfterSetup() {
  await vscode.commands.executeCommand("mojigoto.refreshWorkTree");
  await vscode.commands.executeCommand("mojigoto.refreshStats");

  try {
    await vscode.commands.executeCommand("mojigoto.refreshWorkStatus");
  } catch {
    // noop
  }

  try {
    await vscode.commands.executeCommand("mojigoto.workTree.focus");
  } catch {
    // noop
  }
}

async function pickExistingWorkForInitialSetup(workRoot) {
  const root = String(workRoot || "").trim();
  if (!root) {
    return {
      picked: null,
      skipSelection: false,
      message: "workRoot が未入力です。",
    };
  }

  const candidates = (await existsPath(root))
    ? await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "もじごと: 既存作品を確認しています...",
        },
        async () => {
          const all = await collectWorkCandidates(
            root,
            getExcludeList(),
            getManuscriptCandidates(),
          );
          return all.slice(0, getPickLimit());
        },
      )
    : [];

  const hasCandidates = candidates.length > 0;
  const skipSelectionItem = {
    label: hasCandidates
      ? "作品を選択せず完了"
      : "新規作品をあとで作成して完了",
    description: hasCandidates
      ? "空のViewを作成し、あとから作品ツリーで新規作品を作成します"
      : "認識できる既存作品がありません。完了後に作品ツリーから作成します",
    detail: hasCandidates
      ? ""
      : "既存作品を表示するには、作品フォルダ内に manuscript または 原稿 フォルダが必要です。",
    skipExistingWork: true,
  };

  const picked = await vscode.window.showQuickPick(
    [...candidates, skipSelectionItem],
    {
      title: "もじごと: 初回セットアップで使用する作品",
      placeHolder: "切り替えてセットアップを完了する作品を選択",
      matchOnDescription: true,
    },
  );

  if (picked?.skipExistingWork) {
    return {
      picked: null,
      skipSelection: true,
      message: "",
    };
  }

  return {
    picked: picked || null,
    skipSelection: false,
    message: picked ? "" : "作品の選択をキャンセルしました。",
  };
}

async function applyInitialSetup(context, payload) {
  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const wsPath = getWorkspaceRoot();

  const mode = payload?.mode === "multi" ? "multi" : "single";
  const defaultExtension = payload?.defaultExtension === ".md" ? ".md" : ".txt";
  const createWorkNow = !!payload?.createWorkNow;
  const migrateSingleToMulti = !!payload?.migrateSingleToMulti;

  if (migrateSingleToMulti && createWorkNow) {
    throw new Error(
      "Single データの移行と新規作品作成は同時に実行できません。移行画面の「移行して完了」を使用してください。",
    );
  }
  const selectExistingWork =
    mode === "multi" &&
    !createWorkNow &&
    !migrateSingleToMulti &&
    payload?.selectExistingWork === true;

  let selectedExistingWork = null;

  // 「ここで完了」の既存作品選択は、設定やViewを変更する前に確定する。
  // キャンセル時は初回セットアップ画面をそのまま残す。
  if (selectExistingWork) {
    const selection = await pickExistingWorkForInitialSetup(payload?.workRoot);
    if (!selection.picked && !selection.skipSelection) {
      return {
        cancelled: true,
        message: selection.message,
      };
    }
    selectedExistingWork = selection.picked || null;
  }

  let createdWork = false;
  let createdWorkTitle = "";
  let createdWorkName = "";
  let linkedToView = false;

  const work = payload?.work || {};
  const workTitle = String(work.title || "").trim();
  const genres = normalizeGenres(
    Array.isArray(work.genres) && work.genres.length
      ? work.genres
      : work.genre,
  );
  const genre = genres.join(", ");
  const targetChars = Number(work.targetChars || 0) || 0;
  const deadline = String(work.deadline || "").trim();
  const summary = String(work.summary || "").trim();

  const recommended = getRecommendedRoots(mode, wsPath);

  await cfg.update(
    "defaultFileExtension",
    defaultExtension,
    vscode.ConfigurationTarget.Workspace,
  );

  await setCurrentWorkName(context, "");

  if (typeof context.globalState?.update === "function") {
    await context.globalState.update("mojigoto.currentWorkName", "");
  }

  if (mode === "multi") {
    const workRoot = String(payload?.workRoot || "").trim();
    if (!workRoot) {
      throw new Error("workRoot が未入力です。");
    }

    const workDir = path.join(workRoot, "_WORK");
    const linkPath = path.join(workDir, "manuscript");

    await ensureDir(workDir);
    await rmForce(linkPath);

    await cfg.update(
      "workRoot",
      workRoot,
      vscode.ConfigurationTarget.Workspace,
    );
    await cfg.update(
      "manuscriptRoot",
      linkPath,
      vscode.ConfigurationTarget.Workspace,
    );
    await cfg.update("mode", "multi", vscode.ConfigurationTarget.Workspace);

    const migrationWorkName = String(payload?.migrationWorkName || "").trim();

    if (migrateSingleToMulti) {
      const safeWorkName = sanitizeFolderName(migrationWorkName || workTitle);

      if (!safeWorkName) {
        throw new Error("移行先の作品フォルダ名が未入力です。");
      }

      const result = await migrateSingleToMultiWork(context, {
        wsPath,
        workRoot,
        workName: safeWorkName,
        fallbackTitle: workTitle,
      });

      await cfg.update("mode", "multi", vscode.ConfigurationTarget.Workspace);
      await cfg.update(
        "workRoot",
        workRoot,
        vscode.ConfigurationTarget.Workspace,
      );
      await cfg.update(
        "manuscriptRoot",
        path.join(workRoot, "_WORK", "manuscript"),
        vscode.ConfigurationTarget.Workspace,
      );

      vscode.window.showInformationMessage(
        `もじごと: Single データを作品「${safeWorkName}」へ移行しました。`,
      );

      await revealWorkTreeAfterSetup();
      return;
    }

    if (createWorkNow) {
      const safeWorkName = sanitizeFolderName(workTitle);

      if (!safeWorkName) {
        throw new Error("作品名が未入力です。");
      }

      const newWorkDir = path.join(workRoot, safeWorkName);
      const newWorkManuscriptDir = path.join(newWorkDir, "manuscript");

      await fsp.mkdir(newWorkManuscriptDir, { recursive: true });

      const settingsItem = {
        fsPath: newWorkDir,
        workName: safeWorkName,
      };
      const target = await resolveSettingsTarget(settingsItem);

      await writeSettingsFile(target.path, {
        folderName: safeWorkName,
        title: workTitle || safeWorkName,
        genre,
        genres,
        status: "planning",
        targetChars,
        deadline,
        summary,
        memo: "",
      });

      await createJunction(linkPath, newWorkManuscriptDir);
      await setCurrentWorkName(context, safeWorkName);

      createdWork = true;
      createdWorkTitle = workTitle || safeWorkName;
      createdWorkName = safeWorkName;
      linkedToView = true;
    } else if (selectedExistingWork) {
      await createJunction(linkPath, selectedExistingWork.manuPath);
      await setCurrentWorkName(
        context,
        selectedExistingWork.workName || selectedExistingWork.label,
      );

      createdWorkTitle = selectedExistingWork.label || "";
      createdWorkName =
        selectedExistingWork.workName || selectedExistingWork.label || "";
      linkedToView = true;
    } else {
      await fsp.mkdir(linkPath, { recursive: true });
      await setCurrentWorkName(context, "");
    }

    vscode.window.showInformationMessage(
      createWorkNow
        ? "もじごと: 初回セットアップが完了しました。Multi モードを設定し、_WORK/manuscript と作品を作成しました。作品切り替えで View 対象を変更できます。"
        : selectedExistingWork
          ? `もじごと: 初回セットアップが完了しました。作品「${createdWorkTitle || createdWorkName}」へ切り替えました。`
          : "もじごと: 初回セットアップが完了しました。Multi モードを設定し、_WORK/manuscript を作成しました。既存作品には manuscript を用意してから作品切り替えを使ってください。",
    );
  } else {
    const manuscriptRoot =
      String(payload?.manuscriptRoot || "").trim() ||
      recommended.manuscriptRoot;

    if (!manuscriptRoot) {
      throw new Error("manuscriptRoot が未入力です。");
    }

    await fsp.mkdir(manuscriptRoot, { recursive: true });

    await cfg.update(
      "manuscriptRoot",
      manuscriptRoot,
      vscode.ConfigurationTarget.Workspace,
    );
    await cfg.update("mode", "single", vscode.ConfigurationTarget.Workspace);
    await cfg.update("workRoot", "", vscode.ConfigurationTarget.Workspace);

    if (createWorkNow) {
      const settingsItem = null;
      const target = await resolveSettingsTarget(settingsItem);

      await writeSettingsFile(target.path, {
        folderName: workTitle || "",
        title: workTitle || "",
        genre,
        genres,
        status: "planning",
        targetChars,
        deadline,
        summary,
        memo: "",
      });

      createdWork = true;
      createdWorkTitle = workTitle || "作品";
      createdWorkName = workTitle || "";
      linkedToView = false;
    }

    vscode.window.showInformationMessage(
      createWorkNow
        ? "もじごと: 初回セットアップが完了しました。Single モードを設定し、manuscript と作品設定を作成しました。作品ツリーの「設定」から内容を編集できます。"
        : "もじごと: 初回セットアップが完了しました。Single モードを設定し、manuscript を作成しました。既存原稿は manuscript に入れてください。",
    );
  }

  await revealWorkTreeAfterSetup();
  await context.globalState.update("mojigoto.firstRunSetupDone", true);

  return {
    mode,
    createWorkNow,
    createdWork,
    workTitle: createdWorkTitle,
    workName: createdWorkName,
    linkedToView,
    selectedExistingWork: !!selectedExistingWork,
    needsCreateWork:
      mode === "multi" && !createWorkNow && !selectedExistingWork,
  };
}

module.exports = {
  sanitizeFolderName,
  buildInitialSetupState,
  revealWorkTreeAfterSetup,
  pickExistingWorkForInitialSetup,
  applyInitialSetup,
  buildWorkJsonFromSingleSettings,
  getSingleMigrationSource,
  hasSingleMigrationSource,
  migrateSingleToMultiWork,
};
