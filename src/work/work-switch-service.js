const { createWorkFolderRename } = require("./work-folder-rename");
const { createWorkSwitchDirtyGuard } = require("./work-switch-dirty-guard");
const { createWorkSwitchCandidates } = require("./work-switch-candidates");
const vscode = require("vscode");
const fsp = require("fs/promises");
const fs = require("fs");
const path = require("path");

const { setCurrentWorkName } = require("./work-meta-service");
const { replaceJunction, switchManuscriptRoot } = require("./manuscript-switch");

// -------------------------------
// Switch Work (junction) - integrated
// -------------------------------
async function pathExists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(p) {
  try {
    return (await fsp.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function rmForce(p) {
  await fsp.rm(p, { recursive: true, force: true });
}

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

const { getWorkRoot, getExcludeList, getManuscriptCandidates, getPickLimit,
  collectWorkCandidates } = createWorkSwitchCandidates({ vscode, fs, fsp, isDirectory });

async function createJunction(linkPath, targetPath) {
  await replaceJunction(linkPath, targetPath);
}

async function selectManuscriptRoot(linkPath, targetPath) {
  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const result = await switchManuscriptRoot({
    linkPath, targetPath,
    configuredRoot: String(cfg.get("manuscriptRoot", "") || "").trim(),
    updateRoot: (root) => cfg.update("manuscriptRoot", root, vscode.ConfigurationTarget.Workspace),
  });
  if (result.fallback) vscode.window.showInformationMessage("この保存先では原稿リンクを作成できないため、作品の原稿フォルダを直接参照します。");
  return result;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function refreshExplorer() {
  try {
    await vscode.commands.executeCommand(
      "workbench.files.action.refreshFilesExplorer",
    );
    await sleep(150);
    await vscode.commands.executeCommand(
      "workbench.files.action.refreshFilesExplorer",
    );
  } catch {}
}

async function closeEditorsUnderManuscriptRoot() {
  try {
    const cfg = vscode.workspace.getConfiguration("mojigoto");
    const root = String(cfg.get("manuscriptRoot", "") || "").trim();
    if (!root) return;

    // VS Code Tab API があればそれを使う
    const tg = vscode.window.tabGroups;
    if (tg && Array.isArray(tg.all) && typeof tg.close === "function") {
      const tabsToClose = [];
      for (const g of tg.all) {
        for (const t of g.tabs || []) {
          const input = t.input;
          const uri =
            input && input.uri
              ? input.uri
              : input && input.modified
                ? input.modified
                : null;
          const fsPath = uri && uri.fsPath ? uri.fsPath : "";
          if (fsPath && _isUnderDir(fsPath, root)) {
            tabsToClose.push(t);
          }
        }
      }
      if (tabsToClose.length) {
        await tg.close(tabsToClose);
      }
      return;
    }

    // フォールバック：表示中のエディタだけ閉じる
    const editors = vscode.window.visibleTextEditors || [];
    for (const ed of editors) {
      const fsPath = ed?.document?.uri?.fsPath || "";
      if (fsPath && _isUnderDir(fsPath, root)) {
        try {
          await vscode.window.showTextDocument(ed.document, {
            preview: false,
            preserveFocus: false,
          });
          await vscode.commands.executeCommand(
            "workbench.action.closeActiveEditor",
          );
        } catch {}
      }
    }
  } catch {}
}

const { _normPath, _isUnderDir, guardDirtyDocsBeforeSwitch } =
  createWorkSwitchDirtyGuard({ vscode, fs, ensureDir });

function isMultiMode() {
  const mode = String(
    vscode.workspace.getConfiguration("mojigoto").get("mode", "") || "",
  ).trim();
  return mode === "multi";
}

const { handleRenamedWorkFolders } = createWorkFolderRename({
  vscode, fs, fsp, ensureDir, isMultiMode, getWorkRoot, getManuscriptCandidates,
  isDirectory, selectManuscriptRoot, setCurrentWorkName, refreshExplorer,
});

async function switchWorkImpl(context, deps = {}) {
  const { itemWork = null } = deps;

  if (!isMultiMode()) {
    vscode.window.showInformationMessage(
      "もじごと: このモードでは作品切替は不要です（mode=single）。",
    );
    return false;
  }

  const root = getWorkRoot();
  if (!root || !fs.existsSync(root)) {
    vscode.window.showErrorMessage(
      `もじごと: work root not found: ${root || "(empty)"}`,
    );
    return false;
  }

  const exclude = getExcludeList();
  const manuNames = getManuscriptCandidates();
  const limit = getPickLimit();

  const workDir = path.join(root, "_WORK");
  const linkPath = path.join(workDir, "manuscript");

  await ensureDir(workDir);

  const picked = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "もじごと: scanning works...",
    },
    async () => {
      const all = await collectWorkCandidates(root, exclude, manuNames);
      const cands = all.slice(0, limit);

      if (cands.length === 0) {
        vscode.window.showWarningMessage(
          `もじごと: no candidates.\nROOT=${root}\nMake sure each work folder contains a manuscript folder.`,
        );
        return null;
      }

      return await vscode.window.showQuickPick(cands, {
        title: "もじごと: Switch Work",
        placeHolder: "作品フォルダを選択（_WORK/manuscript を差し替え）",
        matchOnDescription: true,
      });
    },
  );

  if (!picked) return false;

  const currentRoot = String(vscode.workspace.getConfiguration("mojigoto").get("manuscriptRoot", "") || "").trim() || linkPath;
  const okToSwitch = await guardDirtyDocsBeforeSwitch(currentRoot);
  if (!okToSwitch) return false;

  try {
    await selectManuscriptRoot(linkPath, picked.manuPath);
    await refreshExplorer();
  } catch (e) {
    vscode.window.showErrorMessage(
      `もじごと: failed to create junction: ${String(e)}`,
    );
    return false;
  }

  await setCurrentWorkName(context, picked.workName || picked.label);

  await vscode.commands.executeCommand("mojigoto.refreshWorkTree");

  if (typeof deps.onAfterSwitch === "function") {
    await deps.onAfterSwitch({
      picked,
      linkPath,
      manuPath: picked.manuPath,
    });
  }

  return true;
}

module.exports = {
  getWorkRoot,
  getExcludeList,
  getManuscriptCandidates,
  getPickLimit,
  pathExists,
  isDirectory,
  rmForce,
  ensureDir,
  collectWorkCandidates,
  createJunction,
  selectManuscriptRoot,
  sleep,
  refreshExplorer,
  closeEditorsUnderManuscriptRoot,
  _normPath,
  _isUnderDir,
  guardDirtyDocsBeforeSwitch,
  isMultiMode,
  switchWorkImpl,
  handleRenamedWorkFolders,
};
