const vscode = require("vscode");

/**
 * ルビ記法を除去する
 * 例:
 * ｜漢字《かんじ》 → 漢字
 * |漢字《かんじ》 → 漢字
 * 漢字《かんじ》 → 漢字
 * 《《強調》》 → 強調
 */
function stripRubyNotation(text) {
  return String(text || "")
    .replace(/[|｜]([^\n《》]+?)《[^《》\n]+》/g, "$1")
    .replace(/([^\n|｜《》]+?)《[^《》\n]+》/g, "$1")
    .replace(/《《(.+?)》》/g, "$1");
}

/**
 * 選択範囲のルビを除去
 */
async function stripRubyFromSelection() {
  const ed = vscode.window.activeTextEditor;
  if (!ed) return;

  const sels = ed.selections || [];
  if (!sels.length || sels.every((sel) => sel.isEmpty)) {
    vscode.window.showInformationMessage(
      "もじごと: ルビ解除したい範囲を選択してから実行してください。",
    );
    return;
  }

  await ed.edit((editBuilder) => {
    for (const sel of sels) {
      if (sel.isEmpty) continue;
      const src = ed.document.getText(sel);
      editBuilder.replace(sel, stripRubyNotation(src));
    }
  });
}

/** New ruby uses its default; existing ruby uses a compact input dialog. */
async function insertRubyFromSelection(context) {
  return require("./ruby-insert").insertRuby(vscode, context);
}
/**
 * 選択範囲を《《...》》で囲む（傍点）
 * IME 日本語ON / 全角入力時でも snippet 展開に依存せず安定して挿入する
 */
async function insertSideDotsFromSelection() {
  const ed = vscode.window.activeTextEditor;
  if (!ed) return;

  const sels = ed.selections || [];
  if (!sels.length || sels.every((sel) => sel.isEmpty)) {
    vscode.window.showInformationMessage(
      "もじごと: 傍点を付けたい範囲を選択してから実行してください。",
    );
    return;
  }

  const replacements = sels.map((sel) => {
    const src = ed.document.getText(sel);
    return {
      sel,
      text: `《《${src}》》`,
    };
  });

  const ok = await ed.edit((editBuilder) => {
    for (const item of replacements) {
      editBuilder.replace(item.sel, item.text);
    }
  });

  if (!ok) return;

  const newSelections = replacements.map((item) => {
    const start = item.sel.start;
    const end = start.translate(0, item.text.length);
    return new vscode.Selection(start, end);
  });

  ed.selections = newSelections;
}

/**
 * コマンド登録
 */
function registerRubyCommands(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "mojigoto.stripRubyFromSelection",
      stripRubyFromSelection,
    ),
    vscode.commands.registerCommand(
      "mojigoto.insertRubyFromSelection",
      () => insertRubyFromSelection(context),
    ),
    vscode.commands.registerCommand(
      "mojigoto.editRubyFromSelection",
      () => require("./ruby-editor").openRubyEditor(vscode, context),
    ),
    vscode.commands.registerCommand(
      "mojigoto.insertOppositeRubyFromSelection",
      () => require("./ruby-insert").insertRuby(vscode, context, { opposite: true }),
    ),
    vscode.commands.registerCommand(
      "mojigoto.insertSideDotsFromSelection",
      insertSideDotsFromSelection,
    ),
  );
}

module.exports = {
  stripRubyNotation,
  stripRubyFromSelection,
  insertRubyFromSelection,
  insertSideDotsFromSelection,
  registerRubyCommands,
};
