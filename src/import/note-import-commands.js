const vscode = require("vscode");
const path = require("path");
const fs = require("fs/promises");

const { openNoteImportWebview } = require("../views/note-import-webview");
const { resolveTargetWorkContext } = require("../core/mojigoto-paths");
const {
  resolveExportDirForTargetIfConfigured,
} = require("../export/export-utils");
const {
  parseMarkdownImport,
  parseMarkdownEntriesImport,
  parsePlainTextImport,
} = require("./note-markdown-import");

async function pickImportFile({ filters, openLabel, defaultDir = "" }) {
  const dialogOptions = {
    canSelectMany: false,
    openLabel: openLabel || "ファイルを選択",
    filters,
  };

  const normalizedDefaultDir = String(defaultDir || "").trim();
  if (normalizedDefaultDir) {
    dialogOptions.defaultUri = vscode.Uri.file(normalizedDefaultDir);
  }

  const result = await vscode.window.showOpenDialog(dialogOptions);
  if (!result || !result.length) {
    return null;
  }

  return result[0].fsPath;
}

async function runPartialReplaceImportFlow(
  context,
  treeProvider,
  options = {},
) {
  const targetWork = resolveTargetWorkContext({
    workDir: options.workDir,
    workName: options.workName,
    workTitle: options.workTitle,
  });

  const defaultImportDir =
    (await resolveExportDirForTargetIfConfigured(
      targetWork,
      "ノート書き出し",
    )) || "";

  const filePath = await pickImportFile({
    openLabel: "読み込む .md を選択",
    filters: { Markdown: ["md"] },
    defaultDir: defaultImportDir,
  });

  if (!filePath) {
    return { ok: false, cancelled: true };
  }

  const fileRead = await readMarkdownFile(filePath);
  if (!fileRead.ok) {
    return { ok: false, error: fileRead.error };
  }

  const parsed = parseMarkdownImport(fileRead.text, {
    filePath,
    fileName: path.basename(filePath),
    noteType: String(options.noteType || "plot"),
    mode: String(options.mode || "partial_replace"),
  });

  return {
    ok: true,
    sourceFilePath: filePath,
    sourceFileName: path.basename(filePath),
    parsedNote: parsed.parsedNote,
    previewData: parsed.previewData,
  };
}

async function runNoteItemAppendImportFlow(
  context,
  treeProvider,
  options = {},
) {
  const targetWork = resolveTargetWorkContext({
    workDir: options.workDir,
    workName: options.workName,
    workTitle: options.workTitle,
  });

  const defaultImportDir =
    (await resolveExportDirForTargetIfConfigured(
      targetWork,
      "ノート書き出し",
    )) || "";

  const filePath = await pickImportFile({
    openLabel: "読み込む .md を選択",
    filters: { Markdown: ["md"] },
    defaultDir: defaultImportDir,
  });

  if (!filePath) return { ok: false, cancelled: true };

  const fileRead = await readMarkdownFile(filePath);
  if (!fileRead.ok) {
    return { ok: false, error: fileRead.error };
  }

  const parsed = parseMarkdownEntriesImport(fileRead.text, {
    filePath,
    fileName: path.basename(filePath),
  });

  return parsed;
}

async function runNoteItemReplaceImportFlow(
  context,
  treeProvider,
  options = {},
) {
  const targetWork = resolveTargetWorkContext({
    workDir: options.workDir,
    workName: options.workName,
    workTitle: options.workTitle,
  });

  const defaultImportDir =
    (await resolveExportDirForTargetIfConfigured(
      targetWork,
      "ノート書き出し",
    )) || "";

  const filePath = await pickImportFile({
    openLabel: "読み込む .md / .txt を選択",
    filters: {
      Text: ["txt", "md"],
    },
    defaultDir: defaultImportDir,
  });

  if (!filePath) return { ok: false, cancelled: true };

  const fileRead = await readMarkdownFile(filePath);
  if (!fileRead.ok) {
    return { ok: false, error: fileRead.error };
  }

  return parsePlainTextImport(fileRead.text, {
    filePath,
    fileName: path.basename(filePath),
  });
}

async function pickMarkdownFile(defaultDir = "") {
  const dialogOptions = {
    canSelectMany: false,
    openLabel: "読み込む .md を選択",
    filters: {
      Markdown: ["md"],
    },
  };

  const normalizedDefaultDir = String(defaultDir || "").trim();
  if (normalizedDefaultDir) {
    dialogOptions.defaultUri = vscode.Uri.file(normalizedDefaultDir);
  }

  const result = await vscode.window.showOpenDialog(dialogOptions);

  if (!result || !result.length) {
    return null;
  }

  return result[0].fsPath;
}

async function readMarkdownFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return { ok: true, text: raw };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "IMPORT_FILE_READ_FAILED",
        message:
          "ファイルをテキストとして読み込めませんでした。UTF-8 の .md ファイルを選択してください。",
        cause: error,
      },
    };
  }
}

async function runNoteImportFlow(context, treeProvider, options = {}) {
  const {
    noteType,
    mode,
    existingNotePath = "",
    existingNoteTitle = "",
    workDir = "",
    workName = "",
    workTitle = "",
  } = options;

  const targetWork = resolveTargetWorkContext({
    workDir,
    workName,
    workTitle,
  });

  const defaultImportDir =
    (await resolveExportDirForTargetIfConfigured(
      targetWork,
      "ノート書き出し",
    )) || "";

  const filePath = await pickMarkdownFile(defaultImportDir);
  if (!filePath) {
    return;
  }

  const fileRead = await readMarkdownFile(filePath);
  if (!fileRead.ok) {
    vscode.window.showErrorMessage(fileRead.error.message);
    return;
  }

  const parsed = parseMarkdownImport(fileRead.text, {
    filePath,
    fileName: path.basename(filePath),
    noteType,
    mode,
    existingNotePath,
    existingNoteTitle,
  });

  if (!parsed.ok) {
    vscode.window.showErrorMessage(parsed.error.message);
    return;
  }

  await openNoteImportWebview(context, treeProvider, {
    sourceFilePath: filePath,
    workDir: targetWork.workDir,
    workName: targetWork.workName,
    workTitle: targetWork.workTitle,
    noteType,
    mode,
    existingNotePath,
    existingNoteTitle,
    parsedNote: parsed.parsedNote,
    previewData: parsed.previewData,
  });
}

function registerNoteImportCommands(context, treeProvider) {
  context.subscriptions.push(
    vscode.commands.registerCommand("mojigoto.importPlotNote", async (item) => {
      const targetWork = resolveTargetWorkContext({
        workDir: String(item?.workDir || item?.fsPath || ""),
        workName: String(item?.workName || ""),
        workTitle: String(item?.workTitle || ""),
      });

      await runNoteImportFlow(context, treeProvider, {
        noteType: "plot",
        mode: "tree_create",
        workDir: targetWork.workDir,
        workName: targetWork.workName,
        workTitle: targetWork.workTitle,
      });
    }),

    vscode.commands.registerCommand(
      "mojigoto.importReferenceNote",
      async (item) => {
        const targetWork = resolveTargetWorkContext({
          workDir: String(item?.workDir || item?.fsPath || ""),
          workName: String(item?.workName || ""),
          workTitle: String(item?.workTitle || ""),
        });

        await runNoteImportFlow(context, treeProvider, {
          noteType: "reference",
          mode: "tree_create",
          workDir: targetWork.workDir,
          workName: targetWork.workName,
          workTitle: targetWork.workTitle,
        });
      },
    ),

    vscode.commands.registerCommand(
      "mojigoto.importIntoCurrentNote",
      async (payload) => {
        await runNoteImportFlow(context, treeProvider, {
          noteType: String(payload?.noteType || "plot"),
          mode: "note_import",
          existingNotePath: String(payload?.filePath || ""),
          existingNoteTitle: String(payload?.title || ""),
          workDir: String(payload?.workDir || ""),
          workName: String(payload?.workName || ""),
          workTitle: String(payload?.workTitle || ""),
        });
      },
    ),
  );
}

module.exports = {
  registerNoteImportCommands,
  runNoteImportFlow,
  runPartialReplaceImportFlow,
  runNoteItemAppendImportFlow,
  runNoteItemReplaceImportFlow,
};
