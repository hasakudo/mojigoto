const test = require('node:test');
const assert = require('node:assert/strict');
const { insertRuby, monoInputDraft } = require('../src/editor/ruby-insert');
const { resolveRubyTarget } = require('../src/editor/ruby-edit-core');

class Range { constructor(start, end) { Object.assign(this, { start, end }); } }
class Selection extends Range { get isEmpty() { return this.start === this.end; } }
function fixture(source, pairs, config = {}) {
  let text = source;
  const calls = { edits: [], warnings: [], inputs: [], replies: [], panels: [] };
  const document = { uri: { toString: () => uri }, version: 1, isClosed: false,
    offsetAt: value => value, positionAt: value => value,
    getText: range => range ? text.slice(range.start, range.end) : text };
  const uri = `file:ruby-insert-${Math.random()}`;
  const editor = { document, selections: pairs.map(pair => new Selection(...pair)),
    async edit(callback, options) {
      const edits = []; callback({ replace: (range, value) => edits.push({ range, value }) });
      calls.edits.push({ edits, options });
      if (calls.editFailure) return false;
      for (const { range, value } of edits.sort((a,b) => b.range.start - a.range.start)) text = text.slice(0, range.start) + value + text.slice(range.end);
      document.version++; return true;
    } };
  const vscode = { Range, Selection, ViewColumn: { Beside: 2 },
    workspace: { getConfiguration: () => ({ get: (key, fallback) => config[key] ?? fallback }), onDidChangeTextDocument: () => ({ dispose() {} }) },
    window: { activeTextEditor: editor, showWarningMessage: message => calls.warnings.push(message),
      async showInputBox(options) { calls.inputs.push(options); return typeof calls.reply === 'function' ? calls.reply(options) : calls.replies.shift(); },
      createWebviewPanel() {
        const panel = { messages: [], webview: { postMessage: value => panel.messages.push(value), onDidReceiveMessage: callback => { panel.receive = callback; return { dispose() {} }; } },
          onDidDispose: callback => { panel.disposing = callback; }, dispose() { this.disposing?.(); } };
        calls.panels.push(panel); return panel;
      } } };
  return { vscode, editor, document, calls, text: () => text, change(value) { text = value; document.version++; }, silentlyChange(value) { text = value; } };
}

test('新規グループはパネルを開かず従来の「よみ」を原稿内で選択する', async () => {
  const f = fixture('東京\n大阪', [[3,5],[0,2]], { rubyPipeStyle: 'full' });
  await insertRuby(f.vscode, { subscriptions: [] });
  assert.equal(f.text(), '｜東京《よみ》\n｜大阪《よみ》');
  assert.deepEqual(f.editor.selections.map(range => f.document.getText(range)), ['よみ','よみ']);
  assert.equal(f.calls.inputs.length, 0); assert.equal(f.calls.panels.length, 0);
  assert.equal(f.calls.edits.length, 1);
  assert.deepEqual(f.calls.edits[0].options, { undoStopBefore: true, undoStopAfter: true });
});

test('新規単一は小さな入力欄1回で指定された当て字を区切って挿入する', async () => {
  const f = fixture('人族の国', [[0,4]], { rubyDefaultMode: 'mono' });
  f.calls.reply = options => {
    assert.match(options.validateInput('レイオン'), /4個/);
    assert.equal(options.validateInput('レイ/オン/テール/王国'), undefined);
    return 'レイ/オン/テール/王国';
  };
  await insertRuby(f.vscode, { subscriptions: [] });
  assert.equal(f.text(), '|人《レイ》|族《オン》|の《テール》|国《王国》');
  assert.equal(f.calls.inputs.length, 1); assert.equal(f.calls.panels.length, 0);
  assert.equal(f.editor.selections[0].start, f.text().length);
  assert.equal(f.editor.selections[0].isEmpty, true);
});

test('複数範囲の途中で入力を取り消しても、先の範囲を挿入しない', async () => {
  const f = fixture('東京 大阪', [[0,2],[3,5]], { rubyDefaultMode: 'mono' });
  f.calls.replies = ['とう/きょう', undefined];
  await insertRuby(f.vscode, { subscriptions: [] });
  assert.equal(f.text(), '東京 大阪'); assert.equal(f.calls.edits.length, 0);
  assert.equal(f.calls.warnings.length, 0);
});

test('単一入力は文字単位と空欄を保持し、数の不一致・記法記号・全空欄は止める', () => {
  const base = '𠮷葛\u{E0100}か\u3099';
  const target = resolveRubyTarget(base, 0, base.length);
  assert.deepEqual(monoInputDraft(target, 'よし//亜').readings, ['よし','','亜']);
  for (const value of ['よし/かつ', '//', 'よし/《かつ》/亜', 'よし/かつ/亜\n']) assert.throws(() => monoInputDraft(target, value));
});

test('既存の明示・省略ルビ内は値を表示する入力欄で完結し、無変更なら書き直さない', async () => {
  for (const source of ['｜東京《とうきょう》', '東京《とうきょう》']) {
    const f = fixture(source, [[2,2]], { rubyDefaultMode: 'mono' });
    f.calls.reply = options => { assert.equal(options.value,'とうきょう'); return options.value; };
    await insertRuby(f.vscode, { subscriptions: [] });
    assert.equal(f.calls.inputs.length, 1); assert.equal(f.calls.edits.length, 0);
    assert.equal(f.calls.panels.length, 0); assert.equal(f.text(),source);
  }
});

test('既存単一の一括編集は現在の対応を表示し、1回の編集で変更する', async () => {
  const source='|人《レイ》|族《オン》|の《テール》|国《王国》';
  const f=fixture(source,[[0,source.length]]);
  f.calls.reply=options=>{assert.equal(options.value,'レイ/オン/テール/王国');return 'レイ/オン/テール/国';};
  await insertRuby(f.vscode,{subscriptions:[]});
  assert.equal(f.text(),'|人《レイ》|族《オン》|の《テール》|国《国》');
  assert.equal(f.calls.edits.length,1);assert.equal(f.calls.panels.length,0);
});

test('反対種類の新規挿入は既定を変更せず、グループ／単一を切り替える', async () => {
  const mono=fixture('東京',[[0,2]]);
  mono.calls.replies=['とう/きょう'];
  await insertRuby(mono.vscode,{subscriptions:[]},{opposite:true});
  assert.equal(mono.text(),'|東《とう》|京《きょう》');
  const group=fixture('東京',[[0,2]],{rubyDefaultMode:'mono'});
  await insertRuby(group.vscode,{subscriptions:[]},{opposite:true});
  assert.equal(group.text(),'|東京《よみ》');
  assert.equal(group.document.getText(group.editor.selections[0]),'よみ');
  assert.equal(group.calls.inputs.length,0);
});

test('反対種類コマンドとAlt+Shift+Rを接続し、Ctrl+Alt+Rの再起動は維持する', async () => {
  const f=fixture('東京',[[0,2]]),registered={};
  f.calls.replies=['とう/きょう'];
  f.vscode.commands={registerCommand(id,callback){registered[id]=callback;return{dispose(){}};}};
  const Module=require('node:module'),original=Module._load;
  let tools;
  try {
    Module._load=function(request,parent,...rest){return request==='vscode'?f.vscode:original.call(this,request,parent,...rest);};
    tools=require('../src/editor/ruby-tools');
  } finally {Module._load=original;}
  tools.registerRubyCommands({subscriptions:[]});
  await registered['mojigoto.insertOppositeRubyFromSelection']();
  assert.equal(f.text(),'|東《とう》|京《きょう》');
  const keys=require('../package.json').contributes.keybindings;
  assert.equal(keys.find(key=>key.key==='alt+shift+r').command,'mojigoto.insertOppositeRubyFromSelection');
  assert.equal(keys.find(key=>key.key==='ctrl+alt+r').command,'mojigoto.serverRestart');
});

test('反対種類で既存ルビを変更するときは元の読みを勝手に分割しない', async () => {
  const groupSource='|運命《デスティニー》';
  const group=fixture(groupSource,[[1,1]]);
  group.calls.reply=options=>{
    assert.equal(options.value,'/');assert.match(options.prompt,/デスティニー/);
    return 'デス/ティニー';
  };
  await insertRuby(group.vscode,{subscriptions:[]},{opposite:true});
  assert.equal(group.text(),'|運《デス》|命《ティニー》');
  const monoSource='|東《とう》|京《きょう》';
  const mono=fixture(monoSource,[[0,monoSource.length]]);
  mono.calls.reply=options=>{assert.equal(options.value,'とうきょう');return options.value;};
  await insertRuby(mono.vscode,{subscriptions:[]},{opposite:true});
  assert.equal(mono.text(),'|東京《とうきょう》');
});

test('単一の区切りは / とバックスラッシュ自体を失わず、空欄も保持する', async () => {
  const {parseMonoReadings,formatMonoReadings}=require('../src/editor/ruby-reading-input');
  const readings=['Night/Day','a\\b','','亜'];
  assert.deepEqual(parseMonoReadings(formatMonoReadings(readings)),readings);
  assert.deepEqual(parseMonoReadings('a\\z/b\\'),['a\\z','b\\']);
  const source='|夜《Night/Day》|空《a\\b》';
  const f=fixture(source,[[0,source.length]]);
  f.calls.reply=options=>options.value;
  await insertRuby(f.vscode,{subscriptions:[]});
  assert.equal(f.text(),source);assert.equal(f.calls.edits.length,0);
});

test('単一の入力中に原稿が変更・閉鎖された場合は古い位置へ挿入しない', async () => {
  for (const closed of [true, false]) {
    const f = fixture('東京', [[0,2]], { rubyDefaultMode: 'mono' });
    f.calls.reply = options => {
      if (closed) f.document.isClosed = true; else f.change('原稿の変更');
      assert.match(options.validateInput('とう/きょう'), /変更されたか閉じ/);
      return 'とう/きょう';
    };
    await insertRuby(f.vscode, { subscriptions: [] });
    assert.equal(f.calls.edits.length, 0);
    assert.match(f.calls.warnings[0], /挿入を中止/);
  }
});

test('版が同じでも対象内容の不一致は検出し、不正な入力の返却も止める', async () => {
  const f = fixture('東京', [[0,2]], { rubyDefaultMode: 'mono' });
  f.calls.reply = () => { f.silentlyChange('大阪'); return 'とう/きょう'; };
  await insertRuby(f.vscode, { subscriptions: [] });
  assert.equal(f.calls.edits.length, 0); assert.match(f.calls.warnings[0], /内容が変わった/);
  const invalid = fixture('東京', [[0,2]], { rubyDefaultMode: 'mono' });
  invalid.calls.replies = ['不正な区切り'];
  await insertRuby(invalid.vscode, { subscriptions: [] });
  assert.equal(invalid.calls.edits.length, 0);
});

test('重複範囲は1回にまとめ、重なり・改行・未完の記法は編集前に止める', async () => {
  const dedup = fixture('東京', [[0,2],[0,2],[0,0]]);
  await insertRuby(dedup.vscode, { subscriptions: [] });
  assert.equal(dedup.calls.edits[0].edits.length, 1);
  for (const [source, ranges] of [['東京大阪', [[0,3],[1,4]]],['東京\n大阪',[[0,5]]],['|東京《途中',[[0,6]]]]) {
    const f = fixture(source, ranges);
    await insertRuby(f.vscode, { subscriptions: [] });
    assert.equal(f.calls.edits.length, 0); assert.equal(f.calls.panels.length, 0);
    assert.equal(f.calls.warnings.length, 1);
  }
});

test('原稿への編集が失敗した場合は選択位置を動かさず理由を表示する', async () => {
  const f = fixture('東京', [[0,2]]); f.calls.editFailure = true;
  await insertRuby(f.vscode, { subscriptions: [] });
  assert.equal(f.text(), '東京'); assert.equal(f.editor.selections[0].start, 0);
  assert.match(f.calls.warnings[0], /挿入できません/);
});
