const { resolveRubyTargets, serializeRubyEdit } = require('./ruby-edit-core');
const { parseMonoReadings, formatMonoReadings } = require('./ruby-reading-input');

function monoInputDraft(target, value) {
  const readings = parseMonoReadings(value);
  if (readings.length !== target.chars.length) {
    throw new Error(`親文字${target.chars.length}字に合わせて、ルビを${target.chars.length}個に / で区切ってください。`);
  }
  const draft = { ...target.draft, mode: 'mono', readings };
  serializeRubyEdit(target, draft);
  return draft;
}

async function insertRuby(vscode, context, { opposite = false } = {}) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const document = editor.document;
  const version = document.version;
  const text = document.getText();
  const config = vscode.workspace.getConfiguration('mojigoto', document.uri);
  const defaultMode = config.get('rubyDefaultMode', 'group') === 'mono' ? 'mono' : 'group';
  const pipe = config.get('rubyPipeStyle', 'half') === 'full' ? '｜' : '|';
  const stale = () => document.isClosed || document.version !== version;
  try {
    const ranges = (editor.selections || [editor.selection]).filter(Boolean).map(selection => ({
      start: document.offsetAt(selection.start), end: document.offsetAt(selection.end),
    }));
    const targets = resolveRubyTargets(text, ranges, { defaultMode, pipe });
    const replacements = [];
    for (const [index, target] of targets.entries()) {
      const currentMode = target.hasRuby ? target.draft.mode : defaultMode;
      const mode = opposite ? (currentMode === 'group' ? 'mono' : 'group') : currentMode;
      let draft = { ...target.draft, mode, groupReading: target.hasRuby ? target.draft.groupReading : 'よみ' };
      const placeholder = !target.hasRuby && mode === 'group';
      if (!placeholder) {
        const readings = target.draft.readings.slice();
        // The one known correspondence is reusable, but a group reading
        // must never be divided among several base characters automatically.
        if (mode === 'mono' && target.chars.length === 1) readings[0] = target.draft.groupReading;
        const initialValue = mode === 'mono' ? formatMonoReadings(readings) : target.draft.groupReading;
        const value = await vscode.window.showInputBox({
          title: `${mode === 'mono' ? '単一' : 'グループ'}ルビ${targets.length > 1 ? `（${index + 1}/${targets.length}）` : ''}：${target.base.length > 40 ? target.base.slice(0, 40) + '…' : target.base}`,
          prompt: mode === 'mono'
            ? `親文字${target.chars.length}字の順に / で区切ります。空欄はルビなし。/ 自体は \\/ と入力。${opposite && target.hasRuby ? ` 元のルビ：${target.originalReading}` : ''}`
            : '範囲全体のルビを入力してください。Enterで適用、Escで取り消します。',
          value: initialValue,
          placeHolder: mode === 'mono' ? target.chars.slice(0, 8).map(() => 'よみ').join('/') : '範囲全体のルビ',
          ignoreFocusOut: true,
          validateInput: value => {
            if (stale()) return '原稿が変更されたか閉じられました。入力を控えて取り消し、最新の原稿からやり直してください。';
            try {
              const input = mode === 'mono' ? monoInputDraft(target, value) : { ...target.draft, mode, groupReading: value };
              serializeRubyEdit(target, input);
            } catch (error) { return error.message; }
          },
        });
        if (value === undefined) return;
        draft = mode === 'mono' ? monoInputDraft(target, value) : { ...target.draft, mode, groupReading: value };
      }
      replacements.push({ target, text: serializeRubyEdit(target, draft), placeholder });
    }
    if (stale()) throw new Error('原稿が変更されたか閉じられたため、挿入を中止しました。最新の原稿からやり直してください。');
    for (const { target } of replacements) {
      const range = new vscode.Range(document.positionAt(target.start), document.positionAt(target.end));
      if (document.getText(range) !== target.source) throw new Error('対象の内容が変わったため、挿入を中止しました。');
    }
    const changes = replacements.filter(item => item.text !== item.target.source);
    if (!changes.length) return true;
    const saved = await editor.edit(edit => {
      for (const { target, text } of changes) {
        edit.replace(new vscode.Range(document.positionAt(target.start), document.positionAt(target.end)), text);
      }
    }, { undoStopBefore: true, undoStopAfter: true });
    if (!saved) throw new Error('ルビを挿入できませんでした。原稿の状態を確認してください。');
    let delta = 0;
    editor.selections = replacements.map(({ target, text, placeholder }) => {
      const offset = target.start + delta;
      delta += text.length - target.source.length;
      const start = offset + (placeholder ? `${target.pipe}${target.base}《`.length : text.length);
      const end = start + (placeholder ? 'よみ'.length : 0);
      return new vscode.Selection(document.positionAt(start), document.positionAt(end));
    });
    return true;
  } catch (error) {
    vscode.window.showWarningMessage(`もじごと: ${error.message || 'ルビを挿入できませんでした。'}`);
  }
}

module.exports = { insertRuby, monoInputDraft };
