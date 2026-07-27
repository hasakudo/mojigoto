const vscode = require("vscode");

// ===============================
// Settings / Guards
// ===============================
function isAutoIndentEnabled() {
  try {
    return !!vscode.workspace
      .getConfiguration("mojigoto")
      .get("autoIndentEnabled", false);
  } catch {
    return false;
  }
}

function isTextLikeDocument(doc) {
  if (!doc || !doc.uri || doc.uri.scheme !== "file") return false;
  const fsPath = String(doc.uri.fsPath || "").toLowerCase();
  return fsPath.endsWith(".txt") || fsPath.endsWith(".md");
}

// ===============================
// Main
// ===============================
function registerAutoIndent(context) {
  // ---- 状態 ----
  let lastEnterModifiers = {
    shift: false,
    ctrl: false,
    alt: false,
    ts: 0,
  };

  let running = false;
  let lastInsertedLine = -1;
  let lastInsertedDoc = "";

  // -----------------------------
  // type command（修飾キー検知）
  // -----------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "mojigoto.typeWithAutoIndent",
      async (args) => {
        const text = String(args?.text || "");

        if (text === "\n" || text === "\r\n") {
          lastEnterModifiers = {
            shift: !!args?.shift,
            ctrl: !!args?.ctrl,
            alt: !!args?.alt,
            ts: Date.now(),
          };
        }

        await vscode.commands.executeCommand("default:type", args);
      },
    ),
  );

  // -----------------------------
  // 本体（改行検知）
  // -----------------------------
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(async (event) => {
      try {
        if (running) return;
        if (!isAutoIndentEnabled()) return;

        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        if (event.document !== editor.document) return;
        if (!isTextLikeDocument(event.document)) return;

        if (
          !Array.isArray(event.contentChanges) ||
          event.contentChanges.length !== 1
        )
          return;

        const change = event.contentChanges[0];
        const insertedText = String(change.text || "");

        // -----------------------------
        // Enter入力後
        // -----------------------------
        if (insertedText === "\n" || insertedText === "\r\n") {
          // 修飾キー付きはスキップ
          if (Date.now() - lastEnterModifiers.ts < 1500) {
            if (
              lastEnterModifiers.shift ||
              lastEnterModifiers.ctrl ||
              lastEnterModifiers.alt
            ) {
              return;
            }
          }

          const newLine = change.range.start.line + 1;
          if (newLine >= event.document.lineCount) return;

          const lineText = event.document.lineAt(newLine).text;

          // すでに全角スペースあり
          if (lineText.startsWith("　")) {
            lastInsertedLine = newLine;
            lastInsertedDoc = String(event.document.uri.toString());
            return;
          }

          running = true;

          await editor.edit((editBuilder) => {
            editBuilder.insert(new vscode.Position(newLine, 0), "　");
          });

          const nextPos = new vscode.Position(newLine, 1);
          editor.selection = new vscode.Selection(nextPos, nextPos);

          lastInsertedLine = newLine;
          lastInsertedDoc = String(event.document.uri.toString());
        }
      } catch (e) {
        console.error("[mojigoto] autoIndent error:", e);
      } finally {
        running = false;
      }
    }),
  );
}

// ===============================
module.exports = {
  registerAutoIndent,
};
