const { resolveRubyTargets, serializeRubyEdit } = require("./ruby-edit-core");
const { getRubyEditorHtml } = require("./ruby-editor-html");
const { getNonce } = require("../core/path-utils");
const panels = new Map();

function openRubyEditor(vscode, context) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const document = editor.document;
  const key = document.uri.toString();
  const existing = panels.get(key);
  if (existing) { existing.reveal(); return existing; }
  const text = document.getText();
  const version = document.version;
  const config = vscode.workspace.getConfiguration("mojigoto", document.uri);
  const defaultMode = config.get("rubyDefaultMode", "group") === "mono" ? "mono" : "group";
  const pipe = config.get("rubyPipeStyle", "half") === "full" ? "｜" : "|";
  let targets;
  try {
    const ranges = (editor.selections || [editor.selection]).filter(Boolean).map(selection => ({
      start: document.offsetAt(selection.start), end: document.offsetAt(selection.end),
    }));
    targets = resolveRubyTargets(text, ranges, { defaultMode, pipe });
  } catch (error) { vscode.window.showWarningMessage(`もじごと: ${error.message}`); return; }
  const panel = vscode.window.createWebviewPanel("mojigoto.rubyEditor", "ルビを編集", vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] });
  panels.set(key, panel);
  context?.subscriptions.push(panel);
  let disposed = false, applying = false, changed = false;
  const send = message => {
    if (disposed) return;
    try { Promise.resolve(panel.webview.postMessage(message)).catch(() => {}); } catch {}
  };
  const fail = message => send({ type: "ruby.error", message });
  const changes = vscode.workspace.onDidChangeTextDocument(event => {
    if (event.document !== document || applying) return;
    changed = true;
    send({ type: "ruby.stale", message: "原稿が変更されました。入力内容を控えてこの画面を閉じ、最新の原稿から開き直してください。原稿には適用していません。" });
  });
  const receiver = panel.webview.onDidReceiveMessage(async message => {
    if (disposed || !message || typeof message !== "object") return;
    if (message.type === "ruby.ready") {
      send({ type: "ruby.init", defaultMode, targets });
      if (changed || document.isClosed || document.version !== version) send({ type: "ruby.stale", message: "原稿が変更されたか閉じられました。最新の原稿から開き直してください。" });
    } else if (message.type === "ruby.cancel") {
      if (!applying) panel.dispose();
    } else if (message.type === "ruby.settings") {
      await vscode.commands.executeCommand("workbench.action.openSettings", "mojigoto.rubyDefaultMode");
    } else if (message.type === "ruby.apply" && !applying) {
      try {
        if (changed || document.isClosed || document.version !== version) throw new Error("原稿が変更されたか閉じられました。最新の原稿から開き直してください。");
        if (!Array.isArray(message.drafts) || message.drafts.length !== targets.length) throw new Error("ルビの入力内容を確認してください。");
        const replacements = targets.map((target, index) => {
          const range = new vscode.Range(document.positionAt(target.start), document.positionAt(target.end));
          if (document.getText(range) !== target.source) throw new Error("対象の内容が変わりました。原稿から開き直してください。");
          return { range, text: serializeRubyEdit(target, message.drafts[index]), source: target.source };
        }).filter(replacement => replacement.text !== replacement.source);
        if (!replacements.length) { panel.dispose(); return; }
        applying = true;
        const saved = await editor.edit(edit => {
          for (const replacement of replacements) edit.replace(replacement.range, replacement.text);
        }, { undoStopBefore: true, undoStopAfter: true });
        if (!saved) throw new Error("原稿へ適用できませんでした。原稿の状態を確認してください。入力内容はこの画面に残しています。");
        panel.dispose();
        await vscode.window.showTextDocument(document, { viewColumn: editor.viewColumn, preserveFocus: false });
      } catch (error) { fail(error.message || "ルビを適用できませんでした。"); }
      finally { applying = false; }
    }
  });
  panel.onDidDispose(() => {
    disposed = true;
    if (panels.get(key) === panel) panels.delete(key);
    changes.dispose(); receiver.dispose();
  });
  panel.webview.html = getRubyEditorHtml(getNonce());
  return panel;
}

module.exports = { openRubyEditor };
