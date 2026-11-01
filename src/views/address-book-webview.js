const vscode = require("vscode");
const fsp = require("fs/promises");
const path = require("path");
const { registerRestorableWebview, withRestoredWebviews } = require("./shared/restored-webviews");
const { isSingleMode, getWorkspaceRoot } = require("../core/mojigoto-context");
const { listWorkDirectories } = require("../core/mojigoto-paths");
const {
  getCurrentWorkTitleFromSettings,
  inferWorkNameFromManuscriptRoot,
} = require("../work/work-settings");
const {
  buildAddressBookExport,
} = require("../data/address-book-store");
const { createAddressBookSession } = require("./address-book-session");
const { getHtml } = require("./address-book/html");
const { createAddressBookMessageHandler } = require("./address-book/host-actions");
const { setWebviewPanelThemeIcon } = require("./shared/webview-panel-icon");
const { MOJIGOTO_ICONS } = require("../ui/mojigoto-icons");

const panels = new Map();

function isPathInside(filePath, dirPath) {
  if (!filePath || !dirPath) return false;
  const relative = path.relative(path.resolve(dirPath), path.resolve(filePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function buildWorkQuickPickItems(works) {
  return (Array.isArray(works) ? works : []).map((work) => ({
    label: String(work?.title || work?.name || "作品"),
    description:
      work?.title && work?.name && work.title !== work.name
        ? `フォルダ: ${work.name}`
        : String(work?.fsPath || ""),
    detail: String(work?.fsPath || ""),
    work,
  }));
}

async function resolveTargetWork(context) {
  if (isSingleMode()) {
    return {
      key: getWorkspaceRoot(),
      workDir: getWorkspaceRoot(),
      title: String(getCurrentWorkTitleFromSettings(context) || "").trim() || "作品",
    };
  }

  const works = listWorkDirectories();
  const activePath = vscode.window.activeTextEditor?.document?.uri?.fsPath || "";
  let work = works.find((entry) => isPathInside(activePath, entry.fsPath));

  if (!work) {
    const currentName = String(inferWorkNameFromManuscriptRoot() || "").trim() ||
      String(context.globalState.get("mojigoto.currentWorkName", "") || "").trim();
    work = works.find(
      (entry) => entry.name.toLocaleLowerCase() === currentName.toLocaleLowerCase(),
    );
  }

  if (!work && works.length === 1) work = works[0];
  if (!work && works.length > 1) {
    const picked = await vscode.window.showQuickPick(buildWorkQuickPickItems(works), {
      title: "もじごと: 呼び名一覧を開く作品",
      placeHolder: "作品を選択してください",
      matchOnDescription: true,
      matchOnDetail: true,
    });
    work = picked?.work || null;
  }
  if (!work) {
    vscode.window.showWarningMessage(
      works.length
        ? "呼び名一覧を開く作品が選択されませんでした。"
        : "作品フォルダが見つかりませんでした。もじごとのMulti設定を確認してください。",
    );
    return null;
  }
  return { key: path.normalize(work.fsPath), workDir: work.fsPath, title: work.title || work.name };
}

function safeFileName(value) {
  return String(value || "呼び名一覧").replace(/[\\/:*?"<>|]/g, "_");
}

async function openAddressBook(context, options = {}) {
  return withRestoredWebviews(vscode, "mojigoto.addressBook", () => openAddressBookReady(context, options));
}

async function openAddressBookReady(context, options = {}, restoredPanel = null) {
  const target = options.workDir ? {
    key: path.resolve(options.workDir), workDir: path.resolve(options.workDir),
    title: String(options.workTitle || path.basename(options.workDir)),
  } : await resolveTargetWork(context);
  if (!target) return;
  if (!target.key) return;
  target.key = process.platform === "win32" ? path.resolve(target.key).toLowerCase() : path.resolve(target.key);
  const existing = panels.get(target.key);
  if (existing) {
    if (restoredPanel && restoredPanel !== existing) { restoredPanel.dispose(); return; }
    existing.reveal();
    existing.webview.postMessage({ type: "addressBookRefreshRequested" });
    return;
  }

  const panel = restoredPanel || vscode.window.createWebviewPanel(
    "mojigoto.addressBook",
    `呼び名一覧: ${target.title}`,
    options.viewColumn ?? vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  panel.webview.options = { enableScripts: true };
  setWebviewPanelThemeIcon(panel, MOJIGOTO_ICONS.addressBook);
  panels.set(target.key, panel);
  const session = createAddressBookSession(panel, target.workDir, {
    confirmReload: async () => await vscode.window.showWarningMessage(
      "呼び名一覧の未保存の入力を破棄して、最新の内容を読み直しますか？必要な入力は先にコピーしてください。",
      { modal: true }, "破棄して読み直す",
    ) === "破棄して読み直す",
  });

  panel.onDidDispose(() => { if (panels.get(target.key) === panel) panels.delete(target.key); });
  panel.webview.onDidReceiveMessage(createAddressBookMessageHandler({
    vscode, fsp, path, panel, session, target, getWorkspaceRoot, safeFileName, buildAddressBookExport,
  }));

  panel.webview.html = getHtml(target.title, target.workDir);
}

function registerAddressBookWebview(context) {
  context.subscriptions.push(registerRestorableWebview(vscode, "mojigoto.addressBook", {
    async deserializeWebviewPanel(panel, saved) {
      if (!saved?.workDir || !path.isAbsolute(saved.workDir)) { panel.dispose(); return; }
      await openAddressBookReady(context, saved, panel);
    },
  }));
  const command = vscode.commands.registerCommand(
    "mojigoto.openAddressBook",
    () => openAddressBook(context),
  );
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 105);
  status.command = "mojigoto.openAddressBook";
  status.text = "$(account) 呼び名";
  status.tooltip = "呼び名一覧を開く（Ctrl+Alt+N）";

  const updateVisibility = () => {
    const filePath = vscode.window.activeTextEditor?.document?.uri?.fsPath || "";
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".txt" || ext === ".md") status.show();
    else status.hide();
  };
  context.subscriptions.push(
    command,
    status,
    vscode.window.onDidChangeActiveTextEditor(updateVisibility),
  );
  updateVisibility();
}

module.exports = {
  buildWorkQuickPickItems,
  getHtml,
  openAddressBook,
  registerAddressBookWebview,
};
