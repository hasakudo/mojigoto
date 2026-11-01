const vscode = require("vscode");
const fs = require("fs/promises");
const { readNoteFile } = require("../data/note-store");
const { parseMarkdownImport } = require("../import/note-markdown-import");
const { prepareImportedSource } = require("../import/note-memo-options");
const { flattenTargetGroups, flattenTargetEntries, flattenSourceEntries, flattenSourceInsertables, findSourceItemIdBySnapshot } = require("../import/note-import-preview");
const { getHtml } = require("./note-partial-import-html");

function createNotePartialImportMessageHandler(context, treeProvider, options, panel) {
  async function refreshTargetCandidates(result) {
    const latest = result?.noteData || await readNoteFile(String(options.notePath || ""),
      String(options.noteData?.type || options.noteData?.noteType || "plot"));
    options.noteData = { ...options.noteData, ...latest };
    return {
      insertTargetGroups: flattenTargetGroups(latest.groups || [], String(options.scopeGroupId || "")),
      replaceTargetEntries: flattenTargetEntries(latest.groups || [], String(options.scopeGroupId || "")),
    };
  }

  return async (message) => {
    try {
      if (message?.type === "cancelPartialImport") {
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

        const nextSourceFilterText = String(
          message?.payload?.sourceFilterText || "",
        );
        const nextSourceFilterType = String(
          message?.payload?.sourceFilterType || "all",
        );
        const nextSelectedSourceItemId = String(
          message?.payload?.selectedSourceItemId || "",
        );
        const nextSelectedTargetItemId = String(
          message?.payload?.selectedTargetItemId || "",
        );
        const nextSelectedTargetGroupId = String(
          message?.payload?.selectedTargetGroupId || "",
        );
        const nextSelectedInsertIndex = String(
          message?.payload?.selectedInsertIndex || "0",
        );
        const nextSelectedGroupInsertIndex = String(
          message?.payload?.selectedGroupInsertIndex || "0",
        );

        const nextSelectedSourceSnapshot =
          message?.payload?.selectedSourceSnapshot || null;

        const nextInitialMode =
          String(message?.payload?.currentMode || "").trim() || "insert_entry";

        const parsed = parseMarkdownImport(sourceText, {
          filePath: sourceFilePath,
          fileName: String(options.sourceFileName || ""),
          noteType: String(
            options.noteData?.type || options.noteData?.noteType || "plot",
          ),
          mode: "insert_entry",
        });

        if (!parsed?.ok) {
          throw new Error(
            parsed?.error?.message ||
              "部分インポートの再読み込みに失敗しました。",
          );
        }

        const nextInsertSourceEntries = flattenSourceInsertables(
          parsed.parsedNote || {},
        );
        const nextReplaceSourceEntries = flattenSourceEntries(
          parsed.parsedNote || {},
        );

        const resolvedSelectedSourceItemId =
          nextInitialMode === "insert_entry"
            ? findSourceItemIdBySnapshot(
                nextSelectedSourceSnapshot,
                nextInsertSourceEntries,
              )
            : findSourceItemIdBySnapshot(
                nextSelectedSourceSnapshot,
                nextReplaceSourceEntries,
              );

        const latestNote = await readNoteFile(
          String(options.notePath || ""),
          String(
            options.noteData?.type || options.noteData?.noteType || "plot",
          ),
        );

        const nextNote = {
          ...options.noteData,
          ...latestNote,
        };

        const nextInsertTargetGroups = flattenTargetGroups(
          nextNote.groups || [],
          String(options.scopeGroupId || ""),
        );

        const nextReplaceTargetEntries = flattenTargetEntries(
          nextNote.groups || [],
          String(options.scopeGroupId || ""),
        );

        const nextDefaultTargetGroupId =
          String(options.defaultTargetGroupId || "") ||
          String(options.scopeGroupId || "") ||
          String(nextInsertTargetGroups[0]?.groupId || "");

        panel.webview.html = getHtml({
          initialMode: nextInitialMode,
          includeItemMemos: message?.payload?.includeItemMemos !== false,
          replaceItemMemo: message?.payload?.replaceItemMemo === true,
          notePath: String(options.notePath || ""),
          sourceFilterText: nextSourceFilterText,
          sourceFilterType: nextSourceFilterType,
          selectedSourceItemId:
            resolvedSelectedSourceItemId || nextSelectedSourceItemId,
          selectedTargetItemId: nextSelectedTargetItemId,
          selectedTargetGroupId: nextSelectedTargetGroupId,
          selectedInsertIndex: nextSelectedInsertIndex,
          selectedGroupInsertIndex: nextSelectedGroupInsertIndex,
          sourceFilePath,
          sourceFileName: String(options.sourceFileName || ""),
          scopeGroupId: String(options.scopeGroupId || ""),
          noteTitle: String(options.noteTitle || ""),
          noteTypeLabel: String(options.noteTypeLabel || ""),
          scopeGroupTitle: String(options.scopeGroupTitle || ""),
          warnings: Array.isArray(parsed.previewData?.warnings)
            ? parsed.previewData.warnings
            : [],
          insertSourceEntries: nextInsertSourceEntries,
          replaceSourceEntries: nextReplaceSourceEntries,
          insertTargetGroups: nextInsertTargetGroups,
          replaceTargetEntries: nextReplaceTargetEntries,
          defaultTargetGroupId: nextDefaultTargetGroupId,
          defaultInsertIndex: "0",
        });

        options.initialMode = nextInitialMode;
        options.includeItemMemos = message?.payload?.includeItemMemos !== false;
        options.replaceItemMemo = message?.payload?.replaceItemMemo === true;
        options.parsedNote = parsed.parsedNote;
        options.previewData = parsed.previewData;
        options.noteData = nextNote;

        options.sourceFilterText = nextSourceFilterText;
        options.sourceFilterType = nextSourceFilterType;
        options.selectedSourceItemId =
          resolvedSelectedSourceItemId || nextSelectedSourceItemId;
        options.selectedSourceSnapshot = nextSelectedSourceSnapshot;
        options.selectedTargetItemId = nextSelectedTargetItemId;
        options.selectedTargetGroupId = nextSelectedTargetGroupId;
        options.selectedInsertIndex = nextSelectedInsertIndex;
        options.selectedGroupInsertIndex = nextSelectedGroupInsertIndex;
        return;
      }

      if (message?.type === "applyPartialReplaceImport") {
        const replaceMemo = message?.payload?.replaceItemMemo === true && !!message?.payload?.source?.memo;
        const result =
          typeof options.onApply === "function"
            ? await options.onApply({ ...message?.payload, operation: "replace_entry_body", replaceItemMemo: replaceMemo })
            : null;
        const targetCandidates = await refreshTargetCandidates(result);

        panel.webview.postMessage({
          type: "partialImportApplied",
          payload: {
            ...targetCandidates,
            keepOpen: !!message?.payload?.keepOpen,
            sourceItemId: String(
              result?.sourceItemId ||
                message?.payload?.source?.sourceItemId ||
                "",
            ),
            message: String(result?.message || "反映しました。"),
          },
        });

        if (!message?.payload?.keepOpen) {
          panel.dispose();
        }

        return;
      }

      if (message?.type === "applyPartialInsertItem") {
        const result =
          typeof options.onApply === "function"
            ? await options.onApply({ ...message?.payload, operation: "insert_entry",
                source: prepareImportedSource(message?.payload?.source || {}, message?.payload?.includeItemMemos !== false) })
            : null;
        const targetCandidates = await refreshTargetCandidates(result);

        panel.webview.postMessage({
          type: "partialImportApplied",
          payload: {
            ...targetCandidates,
            keepOpen: !!message?.payload?.keepOpen,
            sourceItemId: String(
              result?.sourceItemId ||
                message?.payload?.source?.sourceItemId ||
                "",
            ),
            message: String(result?.message || "反映しました。"),
          },
        });

        if (!message?.payload?.keepOpen) {
          panel.dispose();
        }

        return;
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `部分インポートに失敗しました: ${error.message || error}`,
      );
    }
  };
}

module.exports = { createNotePartialImportMessageHandler };
