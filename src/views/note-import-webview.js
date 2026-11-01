const vscode = require("vscode");
const { setWebviewPanelThemeIcon } = require("./shared/webview-panel-icon");
const { getImportHtml, getImportPanelTitle } = require("./note-import-html");
const { createNoteImportMessageHandler } = require("./note-import-actions");

const openImportPanels = new Map();

function getImportPanelKey(options = {}) {
  return [
    String(options.noteType || ""),
    String(options.mode || ""),
    String(options.sourceFilePath || ""),
    String(options.existingNotePath || ""),
  ].join("::");
}

async function openNoteImportWebview(context, treeProvider, options = {}) {
  const key = getImportPanelKey(options);
  const existing = openImportPanels.get(key);

  if (existing) {
    existing.reveal(undefined, true);
    return existing;
  }

  const panel = vscode.window.createWebviewPanel(
    "mojigoto.noteImport",
    getImportPanelTitle(options.noteType),
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    },
  );
  setWebviewPanelThemeIcon(panel, "go-to-file");

  openImportPanels.set(key, panel);

  panel.webview.html = getImportHtml({
    sourceFilePath: String(options.sourceFilePath || ""),
    noteType: String(options.noteType || "plot"),
    mode: String(options.mode || "tree_create"),
    existingNotePath: String(options.existingNotePath || ""),
    existingNoteTitle: String(options.existingNoteTitle || ""),
    workDir: String(options.workDir || ""),
    workName: String(options.workName || ""),
    workTitle: String(options.workTitle || ""),
    previewData: options.previewData || {},
    parsedNote: options.parsedNote || {},
    includeItemMemos: options.includeItemMemos !== false,
  });

  panel.webview.onDidReceiveMessage(
    createNoteImportMessageHandler(context, treeProvider, options, panel),
  );

  panel.onDidDispose(() => {
    if (openImportPanels.get(key) === panel) {
      openImportPanels.delete(key);
    }
  });

  return panel;
}

module.exports = {
  openNoteImportWebview,
};
