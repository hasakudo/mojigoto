const vscode = require("vscode");
const fs = require("fs/promises");
const { createNewNote, readNoteFile, saveNoteFile } = require("../data/note-store");
const { parseMarkdownImport } = require("../import/note-markdown-import");
const { prepareImportedGroups } = require("../import/note-memo-options");
const { getImportedNoteTitle, buildImportedNoteReplacement } = require("../import/note-import-content");
const { getImportHtml } = require("./note-import-html");

function createNoteImportMessageHandler(context, treeProvider, options, panel) {
  return async (message) => {
    try {
      if (message?.type === "cancelImport") {
        panel.dispose();
        return;
      }

      if (message?.type === "openSourceFile") {
        const sourceFilePath = String(options.sourceFilePath || "").trim();
        if (!sourceFilePath) {
          vscode.window.showWarningMessage(
            "読み込み元ファイルのパスを取得できませんでした。",
          );
          return;
        }

        await vscode.window.showTextDocument(vscode.Uri.file(sourceFilePath), {
          preview: false,
          preserveFocus: false,
        });
        return;
      }

      if (message?.type === "reloadImportSource") {
        const sourceFilePath = String(options.sourceFilePath || "").trim();
        if (!sourceFilePath) {
          throw new Error(
            "再読み込みするファイルのパスを取得できませんでした。",
          );
        }

        const sourceText = await fs.readFile(sourceFilePath, "utf8");

        const parsed = parseMarkdownImport(sourceText, {
          filePath: sourceFilePath,
          fileName: String(options.previewData?.source?.fileName || ""),
          noteType: String(options.noteType || "plot"),
          mode: String(options.mode || "tree_create"),
        });

        if (!parsed?.ok) {
          throw new Error(
            parsed?.error?.message ||
              "インポート元ファイルの再読み込みに失敗しました。",
          );
        }

        options.parsedNote = parsed.parsedNote;
        options.previewData = parsed.previewData;
        options.includeItemMemos = message?.payload?.includeItemMemos !== false;

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
          includeItemMemos: options.includeItemMemos,
        });

        return;
      }

      if (message?.type === "confirmImportCreate") {
        const title = getImportedNoteTitle(options, message?.payload);

        const sourceNote = options?.parsedNote || {};
        const groups = prepareImportedGroups(sourceNote?.groups, message?.payload?.includeItemMemos !== false);

        const created = await createNewNote(
          String(options.noteType || "plot"),
          {
            fsPath: String(options.workDir || ""),
            workName: String(options.workName || ""),
            workTitle: String(options.workTitle || ""),
          },
          title,
          "blank",
          { initialGroups: groups },
        );

        vscode.window.showInformationMessage(
          `もじごと: ノート「${title}」を作成しました。`,
        );

        panel.dispose();

        const { openNoteWebview } = require("./note-webview");
        await openNoteWebview(context, treeProvider, {
          filePath: created.filePath,
          type: String(options.noteType || "plot"),
          workDir: String(options.workDir || ""),
          workName: String(options.workName || ""),
          workTitle: String(options.workTitle || ""),
        });

        treeProvider?.refresh();
        return;
      }

      if (message?.type === "confirmImportReplace") {
        const existingNotePath = String(options.existingNotePath || "").trim();
        if (!existingNotePath) {
          vscode.window.showErrorMessage("置換対象のノートが見つかりません。");
          return;
        }

        const title = getImportedNoteTitle(options, message?.payload, true);

        const sourceNote = options?.parsedNote || {};
        const existingNote = await readNoteFile(existingNotePath, String(options.noteType || "plot"));
        const replacePayload = buildImportedNoteReplacement(
          existingNote, sourceNote, options.noteType, title,
          message?.payload?.includeItemMemos !== false,
        );

        const picked = await vscode.window.showWarningMessage(
          `ノート「${title}」の内容を置換します。現在の大分類・項目・項目メモはすべて置き換わります。${message?.payload?.includeItemMemos === false ? "読み込み元の項目メモは取り込みません。" : "読み込み元の項目メモも取り込みます。"}`,
          { modal: true },
          "置換する",
        );

        if (picked !== "置換する") {
          return;
        }

        await saveNoteFile(existingNotePath, replacePayload);

        vscode.window.showInformationMessage(
          `もじごと: ノート「${title}」を置換しました。`,
        );

        const { notifyNoteUpdated } = require("./note-webview");
        await notifyNoteUpdated(existingNotePath);

        treeProvider?.refresh();
        panel.dispose();
        return;
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `インポートに失敗しました: ${error.message || error}`,
      );
    }
  };
}

module.exports = { createNoteImportMessageHandler };
