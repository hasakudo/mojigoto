const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

const { getReorderEditorHtml } = require("./reorder-webview");
const reorderCore = require("./reorder-core");
const {
  saveDisplayNameChanges,
  readDisplayNames,
  getDisplayNameFromData,
} = require("./reorder-display-names");
const {
  updateWritingMemoFilePathForRenameOrMove,
  updateWritingMemoPathsForFolderRename,
} = require("../writing-memo/writing-memo-tracker");

let activeReorderPanel = null;
let openingReorderEditor = null;

function normalizeComparablePath(value) {
  const normalized = path.normalize(String(value || "").trim());
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isSameOrChildPath(candidate, parent) {
  const childPath = normalizeComparablePath(candidate);
  const parentPath = normalizeComparablePath(parent);
  if (!childPath || !parentPath) return false;
  return childPath === parentPath || childPath.startsWith(`${parentPath}${path.sep}`);
}

function isPathInsideRoot(candidate, rootDir) {
  const relative = path.relative(
    path.resolve(String(rootDir || "")),
    path.resolve(String(candidate || "")),
  );
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function splitEditableEntryName(entryPath, kind) {
  const actualName = path.basename(entryPath);
  const ext = kind === "file" ? path.extname(actualName) : "";
  const stem = ext ? actualName.slice(0, -ext.length) : actualName;
  const prefixMatch = stem.match(/^(\s*\d+[._\- ]+)(.*)$/);
  return {
    actualName,
    prefix: prefixMatch ? prefixMatch[1] : "",
    editableName: prefixMatch
      ? String(prefixMatch[2] || "").trim()
      : stem.trim(),
    ext,
  };
}

function validateEditableEntryName(value) {
  const name = String(value || "").trim();
  if (!name) return "名前を入力してください。";
  if (name === "." || name === "..") return "この名前は使用できません。";
  if (/[<>:\"/\\|?*`\u0000-\u001f]/.test(name)) {
    return "使用できない記号が含まれています: / ? < > \\ : * | \" `";
  }
  if (/[. ]$/.test(name)) return "末尾にピリオドや空白は使用できません。";

  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
  if (reserved.test(name)) return "Windowsで予約されている名前は使用できません。";
  return null;
}

function hasDirtyDocumentAtPath(targetPath, kind) {
  return (vscode.workspace.textDocuments || []).some((document) => {
    if (!document?.isDirty || document.uri?.scheme !== "file") return false;
    const documentPath = document.uri.fsPath;
    return kind === "folder"
      ? isSameOrChildPath(documentPath, targetPath)
      : normalizeComparablePath(documentPath) === normalizeComparablePath(targetPath);
  });
}

function getHeadingCandidateName(displayData, rootDir, targetPath, kind) {
  const displayName = getDisplayNameFromData(
    displayData,
    rootDir,
    targetPath,
  );
  if (displayName) return displayName;

  const actualName = path.basename(targetPath);
  const ext = kind === "file" ? path.extname(actualName) : "";
  const stem = ext ? actualName.slice(0, -ext.length) : actualName;
  return reorderCore.stripOrderPrefix(stem) || stem;
}

function getReorderEditorUiSettings() {
  const config = vscode.workspace.getConfiguration("mojigoto");
  const fontScalePercent = Math.min(
    160,
    Math.max(80, Number(config.get("webviewFontScalePercent", 100)) || 100),
  );
  return { fontScale: fontScalePercent / 100 };
}

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

async function openReorderEditorImpl(context, deps = {}) {
  const {
    scheduleRecalc = () => {},
    refreshExplorer = async () => {},
    refreshStatsPanel = async () => {},
  } = deps;

  const rootDir = reorderCore.resolveReorderRoot();

  if (
    !rootDir ||
    !fs.existsSync(rootDir) ||
    !fs.statSync(rootDir).isDirectory()
  ) {
    vscode.window.showWarningMessage(
      "もじごと: 原稿構成エディタを開くための原稿フォルダが見つかりません。manuscriptRoot を設定してから実行してください。",
    );
    return;
  }

  const folders = await reorderCore.buildFolderViewModel(rootDir);
  const selectedFolderPath = (folders[0] && folders[0].path) || rootDir;
  const files = await reorderCore.buildFileViewModel(
    selectedFolderPath,
    1,
    rootDir,
  );

  const webviewPanel = vscode.window.createWebviewPanel(
    "mojigoto.reorderEditor",
    "原稿構成エディタ",
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
      uiSettings: getReorderEditorUiSettings(),
    },
  );
  activeReorderPanel = webviewPanel;

  const settingsDisposable = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (event.affectsConfiguration("mojigoto.webviewFontScalePercent")) {
        webviewPanel.webview.postMessage({
          type: "webviewUiSettingsChanged",
          payload: getReorderEditorUiSettings(),
        });
      }
    },
  );
  context.subscriptions.push(settingsDisposable);
  webviewPanel.onDidDispose(
    () => {
      settingsDisposable.dispose();
      if (activeReorderPanel === webviewPanel) {
        activeReorderPanel = null;
      }
    },
    null,
    context.subscriptions,
  );

  async function handleRenameEntry(msg) {
    const kind = msg.kind === "folder" ? "folder" : "file";
    const oldPath = path.resolve(String(msg.entryPath || "").trim());
    const rootPath = path.resolve(rootDir);

    if (
      !oldPath ||
      oldPath === rootPath ||
      !isPathInsideRoot(oldPath, rootPath) ||
      !fs.existsSync(oldPath)
    ) {
      throw new Error("実名変更の対象が見つかりません。");
    }

    const stat = fs.statSync(oldPath);
    if ((kind === "folder" && !stat.isDirectory()) || (kind === "file" && !stat.isFile())) {
      throw new Error("実名変更の対象種別が一致しません。");
    }

    const nameParts = splitEditableEntryName(oldPath, kind);
    const inputName = await vscode.window.showInputBox({
      title: kind === "folder"
        ? "もじごと: フォルダの実名を変更"
        : "もじごと: ファイルの実名を変更",
      prompt: kind === "folder"
        ? `連番「${nameParts.prefix || "なし"}」は維持されます。使用できない記号: / ? < > \\ : * | \" \``
        : `連番「${nameParts.prefix || "なし"}」と拡張子「${nameParts.ext}」は維持されます。使用できない記号: / ? < > \\ : * | \" \``,
      value: nameParts.editableName,
      ignoreFocusOut: true,
      validateInput: (value) => {
        const invalid = validateEditableEntryName(value);
        if (invalid) return invalid;

        const newName = `${nameParts.prefix}${String(value || "").trim()}${nameParts.ext}`;
        const newPath = path.join(path.dirname(oldPath), newName);
        if (
          normalizeComparablePath(newPath) !== normalizeComparablePath(oldPath) &&
          fs.existsSync(newPath)
        ) {
          return "同じ名前のファイルまたはフォルダがすでにあります。";
        }
        return null;
      },
    });

    if (inputName == null) return;
    const cleanName = String(inputName).trim();
    const newName = `${nameParts.prefix}${cleanName}${nameParts.ext}`;
    const newPath = path.join(path.dirname(oldPath), newName);
    if (newPath === oldPath) return;

    if (hasDirtyDocumentAtPath(oldPath, kind)) {
      vscode.window.showWarningMessage(
        kind === "folder"
          ? "もじごと: フォルダ内に未保存の原稿があります。保存してから実名を変更してください。"
          : "もじごと: この原稿に未保存の変更があります。保存してから実名を変更してください。",
      );
      return;
    }

    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.renameFile(
      vscode.Uri.file(oldPath),
      vscode.Uri.file(newPath),
      { overwrite: false, ignoreIfExists: false },
    );
    const applied = await vscode.workspace.applyEdit(workspaceEdit);
    if (!applied) throw new Error("実名を変更できませんでした。");

    const trackerItem = {
      fsPath: newPath,
      workDir: path.dirname(rootDir),
    };

    try {
      await saveDisplayNameChanges(rootDir, [], {
        moves: [{ from: oldPath, to: newPath }],
      });
    } catch (error) {
      console.warn("[mojigoto] reorder display-name migration failed:", error);
      vscode.window.showWarningMessage(
        "もじごと: 実名は変更しましたが、作品ツリーの表示名を引き継げませんでした。表示名を再設定してください。",
      );
    }

    try {
      if (kind === "folder") {
        await updateWritingMemoPathsForFolderRename(
          trackerItem,
          oldPath,
          newPath,
        );
      } else {
        await updateWritingMemoFilePathForRenameOrMove(
          trackerItem,
          oldPath,
          newPath,
        );
      }
    } catch (error) {
      console.warn("[mojigoto] reorder writing-memo migration failed:", error);
      vscode.window.showWarningMessage(
        "もじごと: 実名は変更しましたが、関連する執筆メモの参照先を更新できませんでした。",
      );
    }

    const previousSelectedPath = String(msg.selectedFolderPath || rootDir);
    let selectedFolderPath = previousSelectedPath;
    if (kind === "folder" && isSameOrChildPath(previousSelectedPath, oldPath)) {
      selectedFolderPath = path.join(
        newPath,
        path.relative(oldPath, previousSelectedPath),
      );
    }

    const folders = await reorderCore.buildFolderViewModel(rootDir);
    const files = await reorderCore.buildFileViewModel(
      selectedFolderPath,
      1,
      rootDir,
    );

    await refreshMojigotoTreeAfterReorder();
    scheduleRecalc("reorderEditorEntryRename");
    await refreshStatsPanel();

    webviewPanel.webview.postMessage({
      type: "entry-renamed",
      kind,
      oldPath,
      newPath,
      selectedFolderPath,
      folders,
      files,
    });

    vscode.window.showInformationMessage(
      `もじごと: ${kind === "folder" ? "フォルダ" : "ファイル"}の実名を変更しました: ${nameParts.actualName} → ${newName}`,
    );
  }

  async function handleInsertHeading(msg) {
    const filePath = path.resolve(String(msg.filePath || "").trim());
    const rootPath = path.resolve(rootDir);

    if (
      !filePath ||
      filePath === rootPath ||
      !isPathInsideRoot(filePath, rootPath) ||
      !fs.existsSync(filePath)
    ) {
      throw new Error("見出しを挿入する原稿ファイルが見つかりません。");
    }

    const stat = fs.statSync(filePath);
    if (!stat.isFile() || !isTextManuscriptFileName(filePath)) {
      throw new Error("見出しを挿入できるのは .txt / .md の原稿ファイルです。");
    }

    if (hasDirtyDocumentAtPath(filePath, "file")) {
      vscode.window.showWarningMessage(
        "もじごと: この原稿に未保存の変更があります。保存してから見出しを挿入してください。",
      );
      return;
    }

    const displayData = await readDisplayNames(rootDir);
    const fileTitle = getHeadingCandidateName(
      displayData,
      rootDir,
      filePath,
      "file",
    );
    const folderPath = path.dirname(filePath);
    const folderTitle = getHeadingCandidateName(
      displayData,
      rootDir,
      folderPath,
      "folder",
    );

    const sourcePicked = await vscode.window.showQuickPick(
      [
        {
          label: "ファイル名を使う",
          description: fileTitle,
          value: fileTitle,
        },
        {
          label: "フォルダ名を使う",
          description: folderTitle,
          value: folderTitle,
        },
      ],
      {
        title: "もじごと: ファイル先頭へ見出しを挿入",
        placeHolder: "見出しに使う名前を選んでください",
        ignoreFocusOut: true,
        matchOnDescription: true,
      },
    );
    if (!sourcePicked) return;

    const levelPicked = await vscode.window.showQuickPick(
      [
        { label: "# 大見出し", description: sourcePicked.value, value: 1 },
        { label: "## 中見出し", description: sourcePicked.value, value: 2 },
        { label: "### 小見出し", description: sourcePicked.value, value: 3 },
      ],
      {
        title: "もじごと: 見出しの種類を選択",
        placeHolder: "挿入する見出しレベルを選んでください",
        ignoreFocusOut: true,
      },
    );
    if (!levelPicked) return;

    const document = await vscode.workspace.openTextDocument(
      vscode.Uri.file(filePath),
    );
    if (document.isDirty) {
      vscode.window.showWarningMessage(
        "もじごと: この原稿に未保存の変更があります。保存してから見出しを挿入してください。",
      );
      return;
    }

    const title = String(sourcePicked.value || "").trim();
    if (!title) throw new Error("見出しに使う名前を取得できませんでした。");

    const heading = `${"#".repeat(Number(levelPicked.value) || 1)} ${title}`;
    let firstContentLine = -1;
    for (let index = 0; index < document.lineCount; index += 1) {
      if (document.lineAt(index).text.trim()) {
        firstContentLine = index;
        break;
      }
    }

    let replaceExisting = false;
    if (firstContentLine >= 0) {
      const firstLine = document.lineAt(firstContentLine);
      const firstText = firstLine.text.trim();
      if (/^#{1,6}(?:\s+|$)/.test(firstText)) {
        if (firstText === heading) {
          vscode.window.showInformationMessage(
            `もじごと: 同じ見出しがすでにあります: ${heading}`,
          );
          return;
        }

        const choice = await vscode.window.showWarningMessage(
          `先頭に既存の見出し「${firstText}」があります。`,
          { modal: true },
          "置き換える",
          "さらに先頭へ追加",
        );
        if (!choice) return;
        replaceExisting = choice === "置き換える";
      }
    }

    const workspaceEdit = new vscode.WorkspaceEdit();
    if (replaceExisting) {
      workspaceEdit.replace(
        document.uri,
        document.lineAt(firstContentLine).range,
        heading,
      );
    } else {
      const eol = document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
      workspaceEdit.insert(
        document.uri,
        new vscode.Position(0, 0),
        `${heading}${eol}`,
      );
    }

    const applied = await vscode.workspace.applyEdit(workspaceEdit);
    if (!applied) throw new Error("見出しを挿入できませんでした。");
    const saved = await document.save();
    if (!saved) throw new Error("見出しを挿入しましたが、原稿を保存できませんでした。");

    scheduleRecalc("reorderEditorHeadingInsert");
    vscode.window.showInformationMessage(
      `もじごと: ${path.basename(filePath)} に見出し「${heading}」を${replaceExisting ? "設定" : "挿入"}しました。`,
    );
  }

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
        const files = await reorderCore.buildFileViewModel(folderPath, 1, rootDir);
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
        const files = await reorderCore.buildFileViewModel(folderPath, 1, rootDir);
        webviewPanel.webview.postMessage({
          type: "folder-data",
          selectedFolderPath: folderPath,
          files,
        });
        return;
      }

      if (msg.type === "save-folder-order") {
        const orderedFolders = Array.isArray(msg.orderedFolders)
          ? msg.orderedFolders
          : [];
        const orderChanged = msg.orderChanged === true;
        let folders;

        if (orderChanged) {
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

          folders = await reorderCore.saveFolderListOrder(
            rootDir,
            orderedFolders,
            Number(startPicked.value ?? 1),
          );
        } else {
          folders = await reorderCore.saveFolderDisplayNames(
            rootDir,
            orderedFolders,
          );
        }

        await refreshMojigotoTreeAfterReorder();
        scheduleRecalc("reorderEditorFolderSave");
        await refreshStatsPanel();

        const previousSelectedPath = String(msg.selectedFolderPath || "").trim();
        let nextSelectedPath = previousSelectedPath || rootDir;
        if (orderChanged && previousSelectedPath !== rootDir) {
          const sourceFolders = orderedFolders.filter(
            (item) =>
              item?.kind === "folder" &&
              (Number(item.depth) === 1 || path.dirname(item.path) === rootDir),
          );
          const selectedIndex = sourceFolders.findIndex((item) =>
            isSameOrChildPath(previousSelectedPath, item?.path),
          );
          const savedFolders = folders.filter(
            (item) => item?.kind === "folder" && Number(item.depth) === 1,
          );
          if (selectedIndex >= 0 && savedFolders[selectedIndex]?.path) {
            const oldTopLevelPath = sourceFolders[selectedIndex].path;
            nextSelectedPath = path.join(
              savedFolders[selectedIndex].path,
              path.relative(oldTopLevelPath, previousSelectedPath),
            );
          }
        }
        const files = await reorderCore.buildFileViewModel(
          nextSelectedPath,
          1,
          rootDir,
        );

        webviewPanel.webview.postMessage({
          type: "folder-order-saved",
          folders,
          selectedFolderPath: nextSelectedPath,
          files,
        });

        vscode.window.showInformationMessage(
          orderChanged
            ? "もじごと: フォルダ順と表示名を保存しました。"
            : "もじごと: フォルダの表示名を保存しました。",
        );

        const promptKey = "mojigoto.reorderHideChapterNumberPrompted";
        const wasPrompted = !!context.globalState.get(promptKey, false);
        if (orderChanged && !wasPrompted) {
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

      if (msg.type === "rename-entry") {
        await handleRenameEntry(msg);
        return;
      }

      if (msg.type === "insert-heading") {
        await handleInsertHeading(msg);
        return;
      }

      if (msg.type === "save-order") {
        const folderPath = String(msg.folderPath || "").trim();
        const orderedItems = Array.isArray(msg.orderedItems)
          ? msg.orderedItems
          : [];
        const orderChanged = msg.orderChanged === true;
        let files;

        if (orderChanged) {
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

          files = await reorderCore.saveFolderOrder(
            folderPath,
            orderedItems,
            Number(startPicked.value ?? 1),
            rootDir,
          );
        } else {
          files = await reorderCore.saveFileDisplayNames(rootDir, orderedItems);
        }

        await refreshMojigotoTreeAfterReorder();
        scheduleRecalc("reorderEditorSave");
        await refreshStatsPanel();

        webviewPanel.webview.postMessage({
          type: "saved",
          files,
          message: "保存しました",
        });

        vscode.window.showInformationMessage(
          orderChanged
            ? "もじごと: 並び順と表示名を保存しました。"
            : "もじごと: ファイルの表示名を保存しました。",
        );
      }
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      webviewPanel.webview.postMessage({ type: "error", message });
      vscode.window.showErrorMessage(
        `もじごと: 原稿構成エディタでエラーが発生しました: ${message}`,
      );
    }
  });

  return webviewPanel;
}

async function openReorderEditor(context, deps = {}) {
  if (activeReorderPanel) {
    activeReorderPanel.reveal(vscode.ViewColumn.Active);
    return activeReorderPanel;
  }

  if (!openingReorderEditor) {
    openingReorderEditor = openReorderEditorImpl(context, deps);
  }

  try {
    const panel = await openingReorderEditor;
    panel?.reveal(vscode.ViewColumn.Active);
    return panel;
  } finally {
    openingReorderEditor = null;
  }
}

function registerReorderCommands(context, deps = {}) {
  const {
    scheduleRecalc = () => {},
    refreshExplorer = async () => {},
    refreshStatsPanel = async () => {},
  } = deps;

  context.subscriptions.push(
    vscode.commands.registerCommand("mojigoto.openReorderEditor", async () => {
      await openReorderEditor(context, {
        scheduleRecalc,
        refreshExplorer,
        refreshStatsPanel,
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
