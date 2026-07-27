const vscode = require("vscode");

// 自動補完は IME で安定しやすいものだけに限定
const AUTO_CLOSE_PAIRS = {
  "「": "」",
  "（": "）",
};

// 囲みコマンドでは全種類を使う
const WRAP_PAIRS = {
  "「": "」",
  "『": "』",
  "（": "）",
  "【": "】",
  "〈": "〉",
  "《": "》",
  "〝": "〟",
};

const AUTO_OPENERS = new Set(Object.keys(AUTO_CLOSE_PAIRS));
const AUTO_CLOSERS = new Map(
  Object.entries(AUTO_CLOSE_PAIRS).map(([openCh, closeCh]) => [
    closeCh,
    openCh,
  ]),
);

let isApplyingAutoAssist = false;

function isSupportedEditor(editor) {
  if (!editor) return false;

  const doc = editor.document;
  if (!doc) return false;

  const lang = String(doc.languageId || "").toLowerCase();

  return (
    lang === "plaintext" ||
    lang === "markdown" ||
    lang === "md" ||
    lang === "txt" ||
    lang === "scminput"
  );
}

function isAutoCloseAssistEnabled() {
  try {
    const cfg = vscode.workspace.getConfiguration("mojigoto");
    return cfg.get("autoCloseAssistEnabled", false) === true;
  } catch {
    return false;
  }
}

function getActiveEditorForDocument(document) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;
  if (editor.document !== document) return null;
  if (!isSupportedEditor(editor)) return null;
  return editor;
}

async function insertWrappedPair(editor, openCh, closeCh) {
  if (!editor) return false;

  const selections = editor.selections || [];
  if (!selections.length) return false;

  await editor.edit((editBuilder) => {
    for (const sel of selections) {
      const selectedText = editor.document.getText(sel);

      if (!sel.isEmpty) {
        editBuilder.replace(sel, `${openCh}${selectedText}${closeCh}`);
      } else {
        editBuilder.insert(sel.start, `${openCh}${closeCh}`);
      }
    }
  });

  const nextSelections = selections.map((sel) => {
    if (!sel.isEmpty) {
      const start = sel.start.translate(0, openCh.length);
      const end = sel.end.translate(0, openCh.length);
      return new vscode.Selection(start, end);
    }

    const pos = sel.start.translate(0, openCh.length);
    return new vscode.Selection(pos, pos);
  });

  editor.selections = nextSelections;
  return true;
}

async function insertTextToSelections(editor, text) {
  if (!editor) return false;

  const selections = editor.selections || [];

  await editor.edit((editBuilder) => {
    for (const sel of selections) {
      editBuilder.replace(sel, text);
    }
  });

  const nextSelections = selections.map((sel) => {
    const pos = sel.start.translate(0, text.length);
    return new vscode.Selection(pos, pos);
  });

  editor.selections = nextSelections;
  return true;
}

async function wrapSelections(editor, openCh, closeCh) {
  return insertWrappedPair(editor, openCh, closeCh);
}

function isSmallInsertChange(change) {
  if (!change) return false;
  if (typeof change.text !== "string") return false;
  if (change.text.length === 0) return false;
  if (change.text.length > 4) return false;
  if (change.rangeLength !== 0) return false;
  return true;
}

function lineContainsAutoOpener(text) {
  for (const ch of text) {
    if (AUTO_OPENERS.has(ch)) return true;
  }
  return false;
}

function getMissingAutoClosersForLine(text) {
  const stack = [];

  for (const ch of text) {
    if (AUTO_OPENERS.has(ch)) {
      stack.push(ch);
      continue;
    }

    const expectedOpen = AUTO_CLOSERS.get(ch);
    if (!expectedOpen) continue;

    if (stack.length > 0 && stack[stack.length - 1] === expectedOpen) {
      stack.pop();
    }
  }

  if (!stack.length) return "";

  let suffix = "";
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    suffix += AUTO_CLOSE_PAIRS[stack[i]] || "";
  }
  return suffix;
}

async function handleDocumentChange(event) {
  if (isApplyingAutoAssist) return;
  if (!isAutoCloseAssistEnabled()) return;
  if (!event?.document) return;
  if (
    !Array.isArray(event.contentChanges) ||
    event.contentChanges.length !== 1
  ) {
    return;
  }

  const editor = getActiveEditorForDocument(event.document);
  if (!editor) return;

  const change = event.contentChanges[0];
  if (!isSmallInsertChange(change)) return;

  const selections = editor.selections || [];
  if (selections.length !== 1 || !selections[0].isEmpty) return;

  const active = selections[0].active;
  const lineNumber = active.line;
  const line = editor.document.lineAt(lineNumber);
  const lineText = line.text;

  // 自動補完対象がなければ何もしない
  if (!lineContainsAutoOpener(lineText)) return;

  const suffix = getMissingAutoClosersForLine(lineText);
  if (!suffix) return;

  const originalSelection = editor.selection;

  isApplyingAutoAssist = true;
  try {
    await editor.edit((editBuilder) => {
      editBuilder.insert(line.range.end, suffix);
    });

    editor.selection = originalSelection;
  } finally {
    isApplyingAutoAssist = false;
  }
}

function registerInputAssist(context) {
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      void handleDocumentChange(event);
    }),

    vscode.commands.registerCommand("mojigoto.insertEllipsis", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      await insertTextToSelections(editor, "……");
    }),

    vscode.commands.registerCommand("mojigoto.insertDashPair", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      await insertTextToSelections(editor, "――");
    }),

    vscode.commands.registerCommand("mojigoto.insertHeading1", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      await insertTextToSelections(editor, "# ");
    }),

    vscode.commands.registerCommand("mojigoto.insertHeading2", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      await insertTextToSelections(editor, "## ");
    }),

    vscode.commands.registerCommand("mojigoto.insertHeading3", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      await insertTextToSelections(editor, "### ");
    }),

    vscode.commands.registerCommand(
      "mojigoto.wrapWithDoublePrime",
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        await wrapSelections(editor, "〝", "〟");
      },
    ),

    vscode.commands.registerCommand("mojigoto.wrapWithKagiKakko", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      await wrapSelections(editor, "「", WRAP_PAIRS["「"]);
    }),

    vscode.commands.registerCommand(
      "mojigoto.wrapWithDoubleKagiKakko",
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        await wrapSelections(editor, "『", WRAP_PAIRS["『"]);
      },
    ),

    vscode.commands.registerCommand("mojigoto.wrapWithMaruKakko", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      await wrapSelections(editor, "（", WRAP_PAIRS["（"]);
    }),

    vscode.commands.registerCommand("mojigoto.wrapWithSumiKakko", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      await wrapSelections(editor, "【", WRAP_PAIRS["【"]);
    }),

    vscode.commands.registerCommand("mojigoto.wrapWithAngleKakko", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      await wrapSelections(editor, "〈", WRAP_PAIRS["〈"]);
    }),

    vscode.commands.registerCommand(
      "mojigoto.wrapWithDoubleAngleKakko",
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        await wrapSelections(editor, "《", WRAP_PAIRS["《"]);
      },
    ),
  );
}

module.exports = {
  registerInputAssist,
};
