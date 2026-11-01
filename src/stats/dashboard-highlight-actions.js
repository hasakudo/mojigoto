const path = require("path");

// Dashboard analysis operations. Rendering and tab lifetime stay in the controller.
function createDashboardHighlightActions({ vscode, refresh, normalizeComparablePath, getHighlightManagerSafe,
  getPreferredHighlightEditor, toggleHighlightsEnabled, applyHighlightGroupEnabled }) {
  async function handleHighlightJump(msg) {
    try {
      const editor = getPreferredHighlightEditor();
      if (!editor) return;

      const doc = editor.document;
      const start = new vscode.Position(
        Number(msg.startLine || 0),
        Number(msg.startCharacter || 0),
      );
      const end = new vscode.Position(
        Number(msg.endLine || 0),
        Number(msg.endCharacter || 0),
      );
      const range = new vscode.Range(start, end);

      await vscode.window.showTextDocument(doc, {
        preview: false,
        viewColumn: editor.viewColumn || vscode.ViewColumn.One,
        preserveFocus: false,
      });

      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        activeEditor.selection = new vscode.Selection(start, end);
        activeEditor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      }
    } catch {
      vscode.window.showErrorMessage(
        "もじごと: ハイライト箇所へ移動できませんでした。",
      );
    }
  }

  function resolveHeadingBatchEditor(filePath) {
    const targetPath = normalizeComparablePath(filePath);
    if (!targetPath) return null;

    const candidates = [
      vscode.window.activeTextEditor,
      ...(vscode.window.visibleTextEditors || []),
      typeof getPreferredHighlightEditor === "function"
        ? getPreferredHighlightEditor()
        : null,
    ].filter(Boolean);

    return candidates.find((editor) =>
      normalizeComparablePath(editor?.document?.uri?.fsPath) === targetPath,
    ) || null;
  }

  async function handleApplyParagraphPrefixBatch(msg) {
    const isIndent = msg.type === "applyIndentBatch";
    const prefixLabel = isIndent ? "全角スペース" : "見出し記号";
    try {
      const highlightManager = getHighlightManagerSafe();
      const editor = resolveHeadingBatchEditor(msg.filePath);
      if (!editor) {
        vscode.window.showWarningMessage(
          "もじごと: 分析対象の原稿が現在のエディタに表示されていません。原稿を開いてから再度実行してください。",
        );
        return;
      }

      const document = editor.document;
      const level = Math.max(1, Math.min(3, Number(msg.level || 1)));
      const marker = isIndent ? "　" : `${"#".repeat(level)} `;
      const documentVersion = document.version;
      const targets = Array.isArray(msg.targets) ? msg.targets : [];
      const seenLines = new Set();
      const eligible = [];

      for (const target of targets) {
        const lineNumber = Number(target?.startLine);
        if (!Number.isInteger(lineNumber) || lineNumber < 0) continue;
        if (lineNumber >= document.lineCount || seenLines.has(lineNumber)) continue;
        seenLines.add(lineNumber);

        const line = document.lineAt(lineNumber);
        const currentText = String(line.text || "");
        const analyzedText = String(target?.preview || "");
        if (!currentText.trim()) continue;
        if (/^\s*#{1,6}(?:\s|$)/.test(currentText)) continue;
        if (isIndent && /^\s/.test(currentText)) continue;
        if (currentText !== analyzedText) continue;

        eligible.push({
          lineNumber,
          position: new vscode.Position(lineNumber, 0),
        });
      }

      if (!eligible.length) {
        vscode.window.showWarningMessage(
          `もじごと: 変更できる行がありません。分析後に本文が変わった行や既存の見出し${isIndent ? "、字下げ済みの行" : ""}は除外されます。`,
        );
        return;
      }

      const skippedCount = Math.max(0, targets.length - eligible.length);
      const skippedText = skippedCount
        ? `\n${skippedCount}件は本文変更・重複・既存見出し${isIndent ? "・字下げ済み" : ""}などのため除外されます。`
        : "";
      const confirmed = await vscode.window.showWarningMessage(
        `${path.basename(document.fileName)} の${eligible.length}行の先頭に${isIndent ? "全角スペース1文字" : `「${marker}」`}を付与します。${skippedText}`,
        { modal: true },
        "付与する",
      );
      if (confirmed !== "付与する") return;

      if (document.isClosed || document.version !== documentVersion) {
        vscode.window.showWarningMessage(
          "もじごと: 確認中に原稿が変更されたため中止しました。再度分析して実行してください。",
        );
        return;
      }

      const applied = await editor.edit(
        (editBuilder) => {
          for (const target of eligible) {
            editBuilder.insert(target.position, marker);
          }
        },
        {
          undoStopBefore: true,
          undoStopAfter: true,
        },
      );

      if (!applied) {
        vscode.window.showErrorMessage(
          `もじごと: ${prefixLabel}を付与できませんでした。`,
        );
        return;
      }

      await vscode.window.showTextDocument(document, {
        preview: false,
        viewColumn: editor.viewColumn || vscode.ViewColumn.One,
        preserveFocus: false,
      });

      if (highlightManager) {
        highlightManager.refreshEditor(editor);
      }
      await refresh();

      vscode.window.showInformationMessage(
        `もじごと: ${eligible.length}行に${prefixLabel}を付与しました。`,
      );
    } catch (error) {
      console.error("[mojigoto] applyParagraphPrefixBatch error:", error);
      vscode.window.showErrorMessage(
        `もじごと: ${prefixLabel}の一括付与に失敗しました: ${error.message || String(error)}`,
      );
    }
  }

  async function handleMessage(msg, highlightManager) {
    if (msg.type === "toggleHighlights") {
      if (typeof toggleHighlightsEnabled === "function") {
        await toggleHighlightsEnabled();
      }

      const editor = getPreferredHighlightEditor();
      if (editor && highlightManager) {
        highlightManager.refreshEditor(editor);
      }

      refresh();
      return true;
    }

    if (msg.type === "toggleHighlightDecorations") {
      try {
        const cfg = vscode.workspace.getConfiguration("mojigoto");
        const current = Boolean(cfg.get("highlightDecorationsEnabled", true));
        const next = !current;

        await cfg.update(
          "highlightDecorationsEnabled",
          next,
          vscode.ConfigurationTarget.Workspace,
        );

        if (highlightManager) {
          const editor =
            typeof getPreferredHighlightEditor === "function"
              ? getPreferredHighlightEditor()
              : null;

          if (editor) {
            highlightManager.refreshEditor(editor);
          } else {
            highlightManager.clearAllEditors();
          }
        }

        await refresh();
      } catch (error) {
        console.error("[mojigoto] toggleHighlightDecorations error:", error);
        vscode.window.showErrorMessage(
          `もじごと: ハイライト装飾の切り替えに失敗しました: ${error.message || String(error)}`,
        );
      }
      return true;
    }

    if (msg.type === "refreshHighlights") {
      const editor = getPreferredHighlightEditor();
      if (editor && highlightManager) {
        highlightManager.refreshEditor(editor);
      } else {
        await vscode.commands.executeCommand("mojigoto.refreshHighlights");
      }

      refresh();
      return true;
    }

    if (msg.type === "toggleHighlightGroup") {
      if (typeof applyHighlightGroupEnabled === "function") {
        await applyHighlightGroupEnabled(msg.name, msg.enabled);
      }

      refresh();
      return true;
    }

    if (msg.type === "highlightJump") {
      await handleHighlightJump(msg);
      return true;
    }

    if (msg.type === "applyHeadingBatch" || msg.type === "applyIndentBatch") {
      await handleApplyParagraphPrefixBatch(msg);
      return true;
    }

    if (msg.type === "openHighlightSettings") {
      await vscode.commands.executeCommand("mojigoto.openHighlightSettings");
      return true;
    }

    return false;
  }

  return { handleMessage };
}

module.exports = { createDashboardHighlightActions };
