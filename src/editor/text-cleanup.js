const vscode = require("vscode");

function removeLeadingHalfWidthSpaces(text) {
  return String(text ?? "").replace(/^ +/gm, "");
}

function countLeadingHalfWidthSpaces(text) {
  return String(text ?? "").match(/^ */)?.[0].length || 0;
}

function isTextDocument(document) {
  if (!document) return false;
  const languageId = String(document.languageId || "").toLowerCase();
  const fileName = String(document.fileName || document.uri?.fsPath || "").toLowerCase();
  return (
    languageId === "plaintext" ||
    languageId === "markdown" ||
    languageId === "md" ||
    fileName.endsWith(".txt") ||
    fileName.endsWith(".md")
  );
}

function getTargetLineNumbers(document, selections) {
  const selected = (Array.isArray(selections) ? selections : []).filter(
    (selection) => selection && !selection.isEmpty,
  );
  if (!selected.length) {
    return Array.from({ length: Number(document?.lineCount || 0) }, (_, index) => index);
  }

  const lines = new Set();
  selected.forEach((selection) => {
    const startLine = Number(selection.start.line);
    let endLine = Number(selection.end.line);
    if (selection.end.character === 0 && endLine > startLine) endLine -= 1;
    for (let line = startLine; line <= endLine; line += 1) lines.add(line);
  });
  return [...lines].sort((left, right) => left - right);
}

async function removeLeadingHalfWidthSpacesFromEditor(editor) {
  if (!editor || !isTextDocument(editor.document)) return { lines: 0, spaces: 0 };
  const targetLines = getTargetLineNumbers(editor.document, editor.selections);
  const changes = targetLines
    .map((lineNumber) => {
      const line = editor.document.lineAt(lineNumber);
      const count = countLeadingHalfWidthSpaces(line.text);
      return { lineNumber, count };
    })
    .filter((change) => change.count > 0);

  if (!changes.length) return { lines: 0, spaces: 0 };
  const applied = await editor.edit((editBuilder) => {
    changes.forEach(({ lineNumber, count }) => {
      editBuilder.delete(
        new vscode.Range(
          new vscode.Position(lineNumber, 0),
          new vscode.Position(lineNumber, count),
        ),
      );
    });
  });
  if (!applied) return { lines: 0, spaces: 0 };
  return {
    lines: changes.length,
    spaces: changes.reduce((sum, change) => sum + change.count, 0),
  };
}

function registerTextCleanupCommands(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "mojigoto.removeLeadingHalfWidthSpaces",
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !isTextDocument(editor.document)) {
          vscode.window.showWarningMessage(
            "もじごと: TXTまたはMarkdownの原稿を開いてください。",
          );
          return;
        }
        const result = await removeLeadingHalfWidthSpacesFromEditor(editor);
        if (!result.lines) {
          vscode.window.showInformationMessage(
            "もじごと: 行頭の半角スペースはありませんでした。",
          );
          return;
        }
        vscode.window.showInformationMessage(
          `もじごと: ${result.lines}行から半角スペース${result.spaces}文字を除去しました。`,
        );
      },
    ),
  );
}

module.exports = {
  removeLeadingHalfWidthSpaces,
  countLeadingHalfWidthSpaces,
  getTargetLineNumbers,
  removeLeadingHalfWidthSpacesFromEditor,
  registerTextCleanupCommands,
};
