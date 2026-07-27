const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

const { getReorderEditorHtml } = require("./reorder-webview");
const reorderCore = require("./reorder-core");

function splitLeadingNumberBase(name) {
  const ext = path.extname(name);
  const stem = path.basename(name, ext);
  const m = stem.match(/^\s*(\d+)([._\-\s　]+)?(.*)$/);
  if (!m) return { num: null, rest: stem.trim(), ext };
  return {
    num: Number(m[1]),
    rest: String(m[3] || "").trim() || stem.trim(),
    ext,
  };
}

function compareDirentsByLeadingNumber(a, b) {
  const aa = splitLeadingNumberBase(a.name || "");
  const bb = splitLeadingNumberBase(b.name || "");
  const aHas = Number.isFinite(aa.num);
  const bHas = Number.isFinite(bb.num);

  if (aHas && bHas && aa.num !== bb.num) return aa.num - bb.num;
  if (aHas !== bHas) return aHas ? -1 : 1;
  return String(a.name || "").localeCompare(String(b.name || ""), "ja", {
    numeric: true,
  });
}

function isTextManuscriptFileName(name) {
  const ext = path.extname(String(name || "")).toLowerCase();
  return ext === ".txt" || ext === ".md";
}

function renumberEntriesInDirectory(dirPath, entries, startAt = 1) {
  if (!Array.isArray(entries) || !entries.length) {
    return { changed: 0, total: 0 };
  }

  const width = Math.max(String(startAt + entries.length - 1).length, 2);
  const phase1 = [];
  let changed = 0;

  for (let i = 0; i < entries.length; i++) {
    const ent = entries[i];
    const oldPath = path.join(dirPath, ent.name);
    const ext = ent.isDirectory ? "" : path.extname(ent.name);
    const stemInfo = splitLeadingNumberBase(ent.name);
    const suffixBase =
      stemInfo.rest || (ext ? path.basename(ent.name, ext) : ent.name);
    const num = String(startAt + i).padStart(width, "0");
    const nextName = ext
      ? `${num}. ${suffixBase}${ext}`
      : `${num}. ${suffixBase}`;
    const nextPath = path.join(dirPath, nextName);

    if (nextPath !== oldPath) {
      phase1.push({
        oldPath,
        nextPath,
        tmpPath: `${oldPath}.Mojigoto_tmp_${Date.now()}_${i}`,
      });
    }
  }

  if (!phase1.length) return { changed: 0, total: entries.length };

  for (const item of phase1) {
    fs.renameSync(item.oldPath, item.tmpPath);
  }
  for (const item of phase1) {
    fs.renameSync(item.tmpPath, item.nextPath);
    changed += 1;
  }

  return { changed, total: entries.length };
}

function listReorderableEntries(dirPath) {
  let ents = [];
  try {
    ents = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  return ents
    .filter(
      (e) =>
        e.isDirectory() || (e.isFile() && isTextManuscriptFileName(e.name)),
    )
    .sort(compareDirentsByLeadingNumber)
    .map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      isFile: e.isFile(),
    }));
}

function collectReorderableDirectories(rootDir) {
  const out = [];
  const stack = [rootDir];

  while (stack.length) {
    const cur = stack.pop();
    out.push(cur);

    let ents = [];
    try {
      ents = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }

    const dirs = ents
      .filter((e) => e.isDirectory())
      .sort(compareDirentsByLeadingNumber);

    for (let i = dirs.length - 1; i >= 0; i--) {
      stack.push(path.join(cur, dirs[i].name));
    }
  }

  return out;
}

function moveArrayItem(arr, fromIndex, toIndex) {
  if (!Array.isArray(arr)) return arr;
  if (fromIndex < 0 || fromIndex >= arr.length) return arr;
  if (toIndex < 0) toIndex = 0;
  if (toIndex >= arr.length) toIndex = arr.length - 1;
  if (fromIndex === toIndex) return arr;

  const next = arr.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

async function pickReorderTargetDirectory(manuscriptRoot) {
  const dirs = collectReorderableDirectories(manuscriptRoot);
  const items = dirs.map((dir) => {
    const rel = path.relative(manuscriptRoot, dir);
    const label = rel ? rel.replace(/\\/g, " /") : "manuscript（ルート）";
    return {
      label,
      description: dir,
      dirPath: dir,
    };
  });

  return vscode.window.showQuickPick(items, {
    title: "もじごと: 並び順を編集するフォルダを選択",
    placeHolder: "manuscript 直下、または章フォルダを選んでください",
    ignoreFocusOut: true,
    matchOnDescription: true,
  });
}

async function reorderDirectoryInteractive(
  dirPath,
  manuscriptRoot,
  startAt = 1,
) {
  let order = listReorderableEntries(dirPath).map((e) => e.name);

  if (!order.length) {
    vscode.window.showInformationMessage(
      "もじごと: このフォルダには並べ替え対象の章フォルダ / .txt / .md がありません。",
    );
    return { action: "switch" };
  }

  while (true) {
    const rel = path.relative(manuscriptRoot, dirPath);
    const titleBase = rel
      ? `もじごと: 並び順を編集 - ${rel}`
      : "もじごと: 並び順を編集 - manuscript";

    const width = Math.max(
      2,
      String(startAt + Math.max(0, order.length - 1)).length,
    );

    const entryPicks = order.map((name, idx) => {
      const full = path.join(dirPath, name);
      let kind = "";
      try {
        kind = fs.statSync(full).isDirectory() ? "フォルダ" : "ファイル";
      } catch {}

      return {
        label: `${String(startAt + idx).padStart(width, "0")}. ${name}`,
        description: kind,
        detail: "ファイル名を選ぶと移動できます",
        action: "entry",
        entryName: name,
        entryIndex: idx,
      };
    });

    const picks = [
      ...entryPicks,
      { kind: vscode.QuickPickItemKind.Separator, label: "操作" },
      {
        label: "保存してファイル名に反映する",
        description: "現在の順番で 01. / 02. ... を付け直します",
        action: "save",
      },
      {
        label: "別のフォルダを選ぶ",
        description: "章フォルダや manuscript ルートを選び直します",
        action: "switch",
      },
      {
        label: "終了",
        description: "変更せずに閉じます",
        action: "cancel",
      },
    ];

    const picked = await vscode.window.showQuickPick(picks, {
      title: titleBase,
      placeHolder: "並び順を確認してください。ファイル名を選ぶと移動できます。",
      ignoreFocusOut: true,
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (!picked || picked.action === "cancel") {
      return { action: "cancel" };
    }
    if (picked.action === "switch") {
      return { action: "switch" };
    }
    if (picked.action === "save") {
      const currentEntries = listReorderableEntries(dirPath);
      const entryMap = new Map(currentEntries.map((e) => [e.name, e]));
      const entries = order.map((name) => entryMap.get(name)).filter(Boolean);
      const res = renumberEntriesInDirectory(dirPath, entries, startAt);
      return { action: "saved", changed: res.changed, total: res.total };
    }
    if (picked.action !== "entry") continue;

    const idx = Number(picked.entryIndex);

    const movePicked = await vscode.window.showQuickPick(
      [
        { label: "上へ", description: "1つ上に移動", action: "up" },
        { label: "5つ上へ", description: "5つ上に移動", action: "up5" },
        { label: "下へ", description: "1つ下に移動", action: "down" },
        { label: "5つ下へ", description: "5つ下に移動", action: "down5" },
        { kind: vscode.QuickPickItemKind.Separator, label: "位置指定" },
        { label: "先頭へ", description: "先頭に移動", action: "top" },
        { label: "末尾へ", description: "末尾に移動", action: "bottom" },
        {
          label: "指定位置へ移動",
          description: `開始番号 ${startAt} から ${startAt + order.length - 1} の範囲で指定します`,
          action: "goto",
        },
        { kind: vscode.QuickPickItemKind.Separator, label: "その他" },
        { label: "戻る", description: "一覧に戻ります", action: "back" },
      ],
      {
        title: `${titleBase} - ${picked.entryName}`,
        placeHolder: "移動方法を選んでください",
        ignoreFocusOut: true,
        matchOnDescription: true,
      },
    );

    if (!movePicked || movePicked.action === "back") continue;

    if (movePicked.action === "up") order = moveArrayItem(order, idx, idx - 1);
    if (movePicked.action === "up5") {
      order = moveArrayItem(order, idx, idx - 5);
    }
    if (movePicked.action === "down") {
      order = moveArrayItem(order, idx, idx + 1);
    }
    if (movePicked.action === "down5") {
      order = moveArrayItem(order, idx, idx + 5);
    }
    if (movePicked.action === "top") order = moveArrayItem(order, idx, 0);
    if (movePicked.action === "bottom") {
      order = moveArrayItem(order, idx, order.length - 1);
    }

    if (movePicked.action === "goto") {
      const dest = await vscode.window.showInputBox({
        title: `${titleBase} - ${picked.entryName}`,
        prompt: `何番目に移動しますか？ (${startAt} 〜 ${startAt + order.length - 1})`,
        value: String(startAt + idx),
        ignoreFocusOut: true,
        validateInput: (value) => {
          const n = Number(value);
          if (!Number.isInteger(n)) return "整数で入力してください。";
          if (n < startAt || n > startAt + order.length - 1) {
            return `${startAt} 〜 ${startAt + order.length - 1} の範囲で入力してください。`;
          }
          return null;
        },
      });

      if (dest == null || dest === "") continue;

      const targetIndex = Number(dest) - startAt;
      if (Number.isInteger(targetIndex)) {
        order = moveArrayItem(order, idx, targetIndex);
      }
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function refreshMojigotoTreeAfterReorder() {
  try {
    await vscode.commands.executeCommand("mojigoto.refreshWorkTree");
  } catch {}

  try {
    await vscode.commands.executeCommand("workbench.view.extension.mojigoto");
  } catch {}

  await sleep(120);

  try {
    await vscode.commands.executeCommand("mojigoto.refreshWorkTree");
  } catch {}
}

async function openReorderEditor(context, deps = {}) {
  const { scheduleRecalc = () => {}, refreshExplorer = async () => {} } = deps;

  const rootDir = reorderCore.resolveReorderRoot();

  if (
    !rootDir ||
    !fs.existsSync(rootDir) ||
    !fs.statSync(rootDir).isDirectory()
  ) {
    vscode.window.showWarningMessage(
      "もじごと: 並び順エディタを開くための原稿フォルダが見つかりません。manuscriptRoot を設定してから実行してください。",
    );
    return;
  }

  const folders = await reorderCore.buildFolderViewModel(rootDir);
  const selectedFolderPath = (folders[0] && folders[0].path) || rootDir;
  const files = await reorderCore.buildFileViewModel(selectedFolderPath, 1);

  const webviewPanel = vscode.window.createWebviewPanel(
    "mojigoto.reorderEditor",
    "並び順エディタ",
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
    },
  );

  webviewPanel.webview.html = getReorderEditorHtml(
    webviewPanel.webview,
    context.extensionUri,
    {
      rootDir,
      folders,
      selectedFolderPath,
      files,
      startIndex: 1,
    },
  );

  webviewPanel.webview.onDidReceiveMessage(async (msg) => {
    try {
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "ready") {
        return;
      }

      if (msg.type === "close") {
        webviewPanel.dispose();
        return;
      }

      if (msg.type === "request-close") {
        const hasFileDirty = !!msg.hasFileDirty;
        const hasFolderDirty = !!msg.hasFolderDirty;

        let message = "";
        if (hasFileDirty && hasFolderDirty) {
          message =
            "フォルダとファイルに未保存の変更があります。\n\n終了しますか？";
        } else if (hasFolderDirty) {
          message = "フォルダに未保存の変更があります。\n\n終了しますか？";
        } else if (hasFileDirty) {
          message = "ファイルに未保存の変更があります。\n\n終了しますか？";
        }

        if (!message) {
          webviewPanel.dispose();
          return;
        }

        const picked = await vscode.window.showWarningMessage(
          message,
          { modal: true },
          "終了する",
          "キャンセル",
        );

        if (picked === "終了する") {
          webviewPanel.dispose();
        }
        return;
      }

      if (msg.type === "select-folder") {
        const folderPath = String(msg.folderPath || "").trim();
        const files = await reorderCore.buildFileViewModel(folderPath, 1);
        webviewPanel.webview.postMessage({
          type: "folder-data",
          selectedFolderPath: folderPath,
          files,
        });
        return;
      }

      if (msg.type === "reload-folder-list") {
        const folders = await reorderCore.buildFolderViewModel(rootDir);
        webviewPanel.webview.postMessage({
          type: "folder-list-data",
          folders,
        });
        return;
      }

      if (msg.type === "reload") {
        const folderPath = String(msg.folderPath || "").trim();
        const files = await reorderCore.buildFileViewModel(folderPath, 1);
        webviewPanel.webview.postMessage({
          type: "folder-data",
          selectedFolderPath: folderPath,
          files,
        });
        return;
      }

      if (msg.type === "save-folder-order") {
        const startPicked = await vscode.window.showQuickPick(
          [
            { label: "1から", value: 1 },
            { label: "0から", value: 0 },
          ],
          {
            title: "もじごと: フォルダ保存時の開始番号",
            placeHolder: "保存時に付ける番号の開始位置を選んでください",
            ignoreFocusOut: true,
          },
        );
        if (!startPicked) return;

        const folderStartIndex = Number(startPicked.value ?? 1);

        const folders = await reorderCore.saveFolderListOrder(
          rootDir,
          Array.isArray(msg.orderedFolders) ? msg.orderedFolders : [],
          folderStartIndex,
        );

        await refreshMojigotoTreeAfterReorder();
        scheduleRecalc("reorderEditorFolderSave");

        webviewPanel.webview.postMessage({
          type: "folder-order-saved",
          folders,
        });

        vscode.window.showInformationMessage(
          "もじごと: フォルダ順を保存しました。",
        );

        const promptKey = "mojigoto.reorderHideChapterNumberPrompted";
        const wasPrompted = !!context.globalState.get(promptKey, false);
        if (!wasPrompted) {
          await context.globalState.update(promptKey, true);

          const answer = await vscode.window.showInformationMessage(
            "作品ツリーの章フォルダに付いた先頭番号を非表示にしますか？",
            { modal: true },
            "はい",
            "いいえ",
          );

          if (answer === "はい") {
            const cfg = vscode.workspace.getConfiguration("mojigoto");
            await cfg.update(
              "hideChapterNumber",
              true,
              vscode.ConfigurationTarget.Workspace,
            );
            await refreshMojigotoTreeAfterReorder();
          }
        }
        return;
      }

      if (msg.type === "save-order") {
        const folderPath = String(msg.folderPath || "").trim();
        const orderedItems = Array.isArray(msg.orderedItems)
          ? msg.orderedItems
          : [];

        const startPicked = await vscode.window.showQuickPick(
          [
            { label: "1から", value: 1 },
            { label: "0から", value: 0 },
          ],
          {
            title: "もじごと: 保存時の開始番号",
            placeHolder: "保存時に付ける番号の開始位置を選んでください",
            ignoreFocusOut: true,
          },
        );
        if (!startPicked) return;

        const files = await reorderCore.saveFolderOrder(
          folderPath,
          orderedItems,
          Number(startPicked.value ?? 1),
        );

        await refreshMojigotoTreeAfterReorder();
        scheduleRecalc("reorderEditorSave");

        webviewPanel.webview.postMessage({
          type: "saved",
          files,
          message: "保存しました",
        });

        vscode.window.showInformationMessage(
          "もじごと: 並び順を保存しました。",
        );
      }
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      webviewPanel.webview.postMessage({ type: "error", message });
      vscode.window.showErrorMessage(
        `もじごと: 並び順エディタでエラーが発生しました: ${message}`,
      );
    }
  });
}

function registerReorderCommands(context, deps = {}) {
  const { scheduleRecalc = () => {}, refreshExplorer = async () => {} } = deps;

  context.subscriptions.push(
    vscode.commands.registerCommand("mojigoto.openReorderEditor", async () => {
      await openReorderEditor(context, {
        scheduleRecalc,
        refreshExplorer,
      });
    }),
  );
}

module.exports = {
  openReorderEditor,
  pickReorderTargetDirectory,
  reorderDirectoryInteractive,
  registerReorderCommands,
};
