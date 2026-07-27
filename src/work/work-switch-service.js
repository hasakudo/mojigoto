const vscode = require("vscode");
const fsp = require("fs/promises");
const fs = require("fs");
const path = require("path");

const { setCurrentWorkName } = require("./work-meta-service");

// -------------------------------
// Switch Work (junction) - integrated
// -------------------------------
function getWorkRoot() {
  // 1) 設定があればそれを優先
  const v = String(
    vscode.workspace.getConfiguration("mojigoto").get("workRoot", "") || "",
  ).trim();
  if (v) return v;

  // 2) 無ければ manuscriptRoot の親を推測（.../_WORK/manuscript の root）
  const mr = String(
    vscode.workspace.getConfiguration("mojigoto").get("manuscriptRoot", "") ||
      "",
  ).trim();
  if (mr) {
    const workDir = path.dirname(mr);
    const root = path.dirname(workDir);
    return root;
  }

  return "";
}

function getExcludeList() {
  return (
    vscode.workspace.getConfiguration("mojigoto").get("workExclude", null) || [
      ".vscode",
      "CSS",
      "node_modules",
      "publish",
      "tools",
      "_WORK",
      "docs",
      "Doc",
      "Doc(s)",
      "temp",
      "tmp",
      "dist",
      ".git",
    ]
  );
}

function getManuscriptCandidates() {
  return (
    vscode.workspace
      .getConfiguration("mojigoto")
      .get("manuscriptCandidates", null) || ["manuscript", "原稿"]
  );
}

function getPickLimit() {
  const n = Number(
    vscode.workspace.getConfiguration("mojigoto").get("workPickLimit", 20),
  );
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 20;
}

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

async function collectWorkCandidates(root, exclude, manuNames) {
  const entries = await fsp.readdir(root, { withFileTypes: true });
  const cands = [];

  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const name = e.name;

    if (exclude.includes(name)) continue;

    const base = path.join(root, name);

    for (const m of manuNames) {
      const manuPath = path.join(base, m);
      if (await isDirectory(manuPath)) {
        let title = "";

        try {
          const workJsonPath = path.join(base, ".mojigoto", "work.json");
          if (fs.existsSync(workJsonPath)) {
            const raw = JSON.parse(await fsp.readFile(workJsonPath, "utf8"));
            title = String(raw?.title || "").trim();
          }
        } catch {
          // noop
        }

        const displayTitle = title || name;

        cands.push({
          label: displayTitle,
          description:
            displayTitle !== name
              ? `フォルダ名: ${name}`
              : `原稿フォルダ: ${m}`,
          detail: displayTitle !== name ? `原稿フォルダ: ${m}` : "",
          workName: name,
          manuPath,
        });
        break;
      }
    }
  }

  cands.sort((a, b) =>
    String(a.label || "").localeCompare(String(b.label || ""), "ja", {
      numeric: true,
      sensitivity: "base",
    }),
  );

  return cands;
}

async function createJunction(linkPath, targetPath) {
  // 既存があれば消す（junction/dir/ファイル全部OK）
  if (await pathExists(linkPath)) {
    await rmForce(linkPath);
  }
  // junction 作成（Windows）
  await fsp.symlink(targetPath, linkPath, "junction");
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
    const rootNorm = path.resolve(root) + path.sep;

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
          if (fsPath && path.resolve(fsPath).startsWith(rootNorm)) {
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
      if (fsPath && path.resolve(fsPath).startsWith(rootNorm)) {
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

function _normPath(p) {
  return path.resolve(String(p || "")).replace(/[\\\/]+$/, "") + path.sep;
}

function _isUnderDir(filePath, dirPath) {
  const f = path.resolve(String(filePath || ""));
  const d = _normPath(dirPath);
  const fn = process.platform === "win32" ? f.toLowerCase() : f;
  const dn = process.platform === "win32" ? d.toLowerCase() : d;
  return fn.startsWith(dn);
}

/**
 * Switch Work safety:
 * - If there are dirty (unsaved) documents under manuscriptRoot, ask the user to Save / Discard / Cancel.
 * - "リンク元に保存" writes to the current junction target (realpath) explicitly and then reverts/closes the editor
 *   so it won't be accidentally saved into the *new* work after the junction switch.
 */
async function guardDirtyDocsBeforeSwitch(manuscriptRoot) {
  try {

    if (!manuscriptRoot) return true;

    const rootNorm = _normPath(manuscriptRoot);

    const dirtyDocs = vscode.workspace.textDocuments.filter((d) => {
      if (!d || !d.isDirty) return false;
      if (!d.uri || d.uri.scheme !== "file") return false;
      const fp = String(d.uri.fsPath || "");
      if (!fp) return false;
      return _isUnderDir(fp, rootNorm);
    });

    if (!dirtyDocs.length) return true;

    // --- helpers ---
    async function revertAndCloseDoc(doc) {
      try {
        await vscode.window.showTextDocument(doc, {
          preview: false,
          preserveFocus: false,
        });
        // revert (discard) then close to avoid later accidental save
        await vscode.commands.executeCommand(
          "workbench.action.revertAndCloseActiveEditor",
        );
      } catch (_) {
        // ignore
      }
    }

    async function writeToRealRoot(doc, realRoot) {
      const rel = path.relative(manuscriptRoot, doc.uri.fsPath);
      const target = path.join(realRoot, rel);
      await ensureDir(path.dirname(target));
      await fs.promises.writeFile(target, doc.getText(), "utf8");
    }

    // Per-file action selection (QuickPick loop)
    // action: "save" | "discard"
    const actionByPath = new Map();
    for (const d of dirtyDocs) actionByPath.set(d.uri.fsPath, "save");

    const relOf = (doc) => {
      try {
        const rel = path.relative(manuscriptRoot, doc.uri.fsPath);
        return rel && rel !== doc.uri.fsPath
          ? rel
          : path.basename(doc.uri.fsPath);
      } catch {
        return path.basename(doc.uri.fsPath);
      }
    };

    function iconFor(a) {
      if (a === "save") return "💾";
      if (a === "discard") return "🗑️";
    }

    function labelFor(doc) {
      const a = actionByPath.get(doc.uri.fsPath) || "save";
      return `${iconFor(a)} ${path.basename(doc.uri.fsPath)}`;
    }

    function detailFor(doc) {
      const a = actionByPath.get(doc.uri.fsPath) || "save";
      if (a === "save") return "保存して閉じる（切替前の作品側）";
      if (a === "discard") return "破棄して閉じる";
    }

    function countActions() {
      let s = 0,
        d = 0;
      for (const v of actionByPath.values()) {
        if (v === "save") s++;
        else d++;
      }
      return { s, d };
    }

    async function pickPerFileActions() {
      while (true) {
        const cnt = countActions();
        const items = [];

        // Bulk actions execute immediately (no need to press "完了")
        items.push({
          label: "✅ この内容で切替（実行）",
          description: "保存/破棄を反映して作品を切り替えます",
        });
        items.push({
          label: "💾 すべて保存して切替",
          description: "一括で保存→切替",
        });
        items.push({
          label: "🗑️ すべて破棄して切替",
          description: "一括で破棄→切替",
        });
        items.push({ label: "↩ キャンセル", description: "作品切替を中止" });
        items.push({ label: "", kind: vscode.QuickPickItemKind.Separator });

        for (const d of dirtyDocs) {
          items.push({
            label: labelFor(d),
            description: relOf(d),
            detail: detailFor(d),
            __doc: d,
          });
        }

        const picked = await vscode.window.showQuickPick(items, {
          title: `もじごと: 未保存ファイルの処理（${dirtyDocs.length}件 / 💾保存 ${cnt.s} / 🗑️破棄 ${cnt.d}）`,
          placeHolder:
            "ファイルを選ぶと「保存↔破棄」を切り替えます。上の一括は即実行。",
          matchOnDescription: true,
          ignoreFocusOut: true,
        });

        if (!picked) return { ok: false, cancel: true };

        if (picked.label === "↩ キャンセル") return { ok: false, cancel: true };

        if (picked.label === "💾 すべて保存して切替") {
          for (const d of dirtyDocs) actionByPath.set(d.uri.fsPath, "save");
          return { ok: true, cancel: false };
        }
        if (picked.label === "🗑️ すべて破棄して切替") {
          for (const d of dirtyDocs) actionByPath.set(d.uri.fsPath, "discard");
          return { ok: true, cancel: false };
        }

        if (picked.label === "✅ この内容で切替（実行）")
          return { ok: true, cancel: false };

        // file item: cycle action
        const doc = picked.__doc;
        if (doc && doc.uri && doc.uri.fsPath) {
          const cur = actionByPath.get(doc.uri.fsPath) || "save";
          const next = cur === "save" ? "discard" : "save";
          actionByPath.set(doc.uri.fsPath, next);
          continue;
        }
      }
    }

    const sel = await pickPerFileActions();
    if (!sel.ok) return false;

    // NOTE: スキップは廃止（誤保存事故が増えるため）

    // If there are any "save", ask which save method to use.
    const hasSave = Array.from(actionByPath.values()).some((a) => a === "save");
    let saveMethod = "normal"; // "normal" | "real"
    let realRoot = null;

    if (hasSave) {
      const pickedSave = await vscode.window.showQuickPick(
        [
          {
            label: "通常保存（VS Codeの保存）",
            description: "切替前の作品側へ保存して閉じる",
          },
          {
            label: "リンク元に保存（安全）",
            description: "junctionの実体（realpath）へ直接書き込み→閉じる",
          },
        ],
        {
          title: "もじごと: 保存方法を選択",
          placeHolder: "どちらの方法で保存しますか？",
          ignoreFocusOut: true,
        },
      );
      if (!pickedSave) return false;

      if (pickedSave.label.startsWith("リンク元に保存")) {
        saveMethod = "real";
        try {
          realRoot = await fs.promises.realpath(manuscriptRoot);
        } catch (_) {
          realRoot = null;
        }
        if (!realRoot) {
          vscode.window.showErrorMessage(
            "もじごと: リンク元の解決に失敗しました（realpath）",
          );
          return false;
        }
      }
    }

    // Execute actions
    for (const d of dirtyDocs) {
      const a = actionByPath.get(d.uri.fsPath) || "save";

      if (a === "discard") {
        await revertAndCloseDoc(d);
        continue;
      }

      if (a === "save") {
        try {
          if (saveMethod === "real") {
            await writeToRealRoot(d, realRoot);
            await revertAndCloseDoc(d);
          } else {
            await d.save();
            // close to avoid later accident
            if (!d.isDirty) await revertAndCloseDoc(d);
          }
        } catch (e) {
          vscode.window.showErrorMessage(
            `もじごと: 保存に失敗: ${path.basename(d.uri.fsPath)} / ${String(e)}`,
          );
          return false;
        }
        continue;
      }

      // no-op
    }

    return true;
  } catch (e) {
    vscode.window.showErrorMessage(
      `もじごと: dirty guard failed: ${String(e)}`,
    );
    return false;
  }
}

function isMultiMode() {
  const mode = String(
    vscode.workspace.getConfiguration("mojigoto").get("mode", "") || "",
  ).trim();
  return mode === "multi";
}

function readJsonFileSafe(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeJsonFileSafe(filePath, data) {
  try {
    await ensureDir(path.dirname(filePath));
    await fsp.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
}

function getDirectChildWorkName(workRoot, targetPath) {
  const root = path.resolve(String(workRoot || ""));
  const full = path.resolve(String(targetPath || ""));

  if (!root || !full) return "";

  const parent = path.dirname(full);
  if (parent !== root) return "";

  const name = path.basename(full);
  if (!name || name === "_WORK") return "";

  return name;
}

async function resolveWorkManuscriptDir(workDir, manuNames) {
  for (const m of manuNames) {
    const p = path.join(workDir, m);
    if (await isDirectory(p)) return p;
  }
  return path.join(workDir, manuNames[0] || "manuscript");
}

async function updateWorkJsonFolderName(workDir, folderName) {
  const settingsPath = path.join(workDir, ".mojigoto", "work.json");
  const current = readJsonFileSafe(settingsPath) || {};

  const next = {
    schemaVersion: Number(current.schemaVersion || 1) || 1,
    folderName: String(folderName || "").trim(),
    title: String(current.title || "").trim(),
    genre: String(current.genre || "").trim(),
    targetChars: Number(current.targetChars || 0) || 0,
    deadline: String(current.deadline || "").trim(),
    summary: String(current.summary || "").trim(),
    memo: String(current.memo || "").trim(),
    updatedAt: new Date().toISOString(),
  };

  return await writeJsonFileSafe(settingsPath, next);
}

async function handleRenamedWorkFolders(context, renameEvent, deps = {}) {
  const { onAfterRename = async () => {} } = deps;

  if (!isMultiMode()) return false;

  const workRoot = getWorkRoot();
  if (!workRoot || !fs.existsSync(workRoot)) return false;

  const manuNames = getManuscriptCandidates();
  const currentWorkName = String(
    context.globalState.get("mojigoto.currentWorkName", "") || "",
  ).trim();

  let changed = false;

  for (const file of renameEvent?.files || []) {
    const oldPath = file?.oldUri?.fsPath || "";
    const newPath = file?.newUri?.fsPath || "";
    if (!oldPath || !newPath) continue;

    const oldName = getDirectChildWorkName(workRoot, oldPath);
    const newName = getDirectChildWorkName(workRoot, newPath);

    // workRoot直下の作品フォルダ rename だけ対象
    if (!oldName || !newName) continue;
    if (oldName === newName) continue;

    const newWorkDir = path.join(workRoot, newName);
    if (!(await isDirectory(newWorkDir))) continue;

    // work.json の folderName を追従
    await updateWorkJsonFolderName(newWorkDir, newName);

    // 現在作品なら currentWorkName と junction も追従
    if (currentWorkName && currentWorkName === oldName) {
      const workDir = path.join(workRoot, "_WORK");
      const linkPath = path.join(workDir, "manuscript");
      const manuPath = await resolveWorkManuscriptDir(newWorkDir, manuNames);

      await ensureDir(workDir);
      await createJunction(linkPath, manuPath);
      await setCurrentWorkName(context, newName);
    }

    changed = true;
  }

  if (!changed) return false;

  await refreshExplorer();

  try {
    await vscode.commands.executeCommand("mojigoto.refreshWorkTree");
  } catch {}

  try {
    await vscode.commands.executeCommand("mojigoto.refreshStats");
  } catch {}

  try {
    await vscode.commands.executeCommand("mojigoto.refreshWorkStatus");
  } catch {}

  await onAfterRename();

  return true;
}

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

  const okToSwitch = await guardDirtyDocsBeforeSwitch(linkPath);
  if (!okToSwitch) return false;

  try {
    await createJunction(linkPath, picked.manuPath);
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