const vscode = require("vscode");
const { setWebviewPanelThemeIcon } = require("./shared/webview-panel-icon");
const { getHtml, getPanelTitle } = require("./note-partial-import-html");
const { createNotePartialImportMessageHandler } = require("./note-partial-import-actions");
const { flattenTargetGroups, flattenTargetEntries, flattenSourceEntries, flattenSourceInsertables } = require("../import/note-import-preview");

const openPartialImportPanels = new Map();

function getPanelKey(options = {}) {
  return [
    String(options.notePath || ""),
    String(options.scopeGroupId || ""),
    String(options.sourceFilePath || ""),
  ].join("::");
}

async function openNotePartialImportWebview(
  context,
  treeProvider,
  options = {},
) {
  const key = getPanelKey(options);
  const existing = openPartialImportPanels.get(key);

  if (existing) {
    try {
      existing.dispose();
    } catch {}
    openPartialImportPanels.delete(key);
  }

  const panel = vscode.window.createWebviewPanel(
    "mojigoto.notePartialImport",
    getPanelTitle(String(options.mode || "")),
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    },
  );
  setWebviewPanelThemeIcon(panel, "go-to-file");

  openPartialImportPanels.set(key, panel);

  const insertSourceEntries = flattenSourceInsertables(
    options.parsedNote || {},
  );
  const replaceSourceEntries = flattenSourceEntries(options.parsedNote || {});

  const replaceTargetEntries = flattenTargetEntries(
    options.noteData?.groups || [],
    String(options.scopeGroupId || ""),
  );

  const insertTargetGroups = flattenTargetGroups(
    options.noteData?.groups || [],
    String(options.scopeGroupId || ""),
  );

  const defaultTargetGroupId =
    String(options.defaultTargetGroupId || "") ||
    String(options.scopeGroupId || "") ||
    String(insertTargetGroups[0]?.groupId || "");

  panel.webview.html = getHtml({
    initialMode: String(options.initialMode || "insert_entry"),
    notePath: String(options.notePath || ""),
    sourceFilterText: String(options.sourceFilterText || ""),
    sourceFilterType: String(options.sourceFilterType || "all"),
    selectedSourceItemId: String(options.selectedSourceItemId || ""),
    selectedTargetItemId: String(options.selectedTargetItemId || ""),
    selectedTargetGroupId: String(options.selectedTargetGroupId || ""),
    selectedInsertIndex: String(options.selectedInsertIndex || "0"),
    selectedGroupInsertIndex: String(options.selectedGroupInsertIndex || "0"),
    selectedSourceSnapshot: options.selectedSourceSnapshot || null,
    sourceFilePath: String(options.sourceFilePath || ""),
    sourceFileName: String(options.sourceFileName || ""),
    scopeGroupId: String(options.scopeGroupId || ""),
    noteTitle: String(options.noteTitle || ""),
    noteTypeLabel: String(options.noteTypeLabel || ""),
    scopeGroupTitle: String(options.scopeGroupTitle || ""),
    warnings: Array.isArray(options.previewData?.warnings)
      ? options.previewData.warnings
      : [],
    insertSourceEntries,
    replaceSourceEntries,
    insertTargetGroups,
    replaceTargetEntries,
    defaultTargetGroupId,
    defaultInsertIndex: "0",
    includeItemMemos: options.includeItemMemos !== false,
    replaceItemMemo: options.replaceItemMemo === true,
  });

  panel.webview.onDidReceiveMessage(
    createNotePartialImportMessageHandler(context, treeProvider, options, panel),
  );

  panel.onDidDispose(() => {
    if (openPartialImportPanels.get(key) === panel) {
      openPartialImportPanels.delete(key);
    }
  });

  return panel;
}

module.exports = {
  openNotePartialImportWebview,
};
