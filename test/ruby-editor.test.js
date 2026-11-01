const test = require("node:test");
const assert = require("node:assert/strict");
const { characters, resolveRubyTarget, serializeRubyEdit } = require("../src/editor/ruby-edit-core");
const { openRubyEditor } = require("../src/editor/ruby-editor");

test("新規の既定と既存のルビ種類を区別し、編集前には原稿を変更しない", () => {
  const plain = resolveRubyTarget("東京", 0, 2, { defaultMode: "mono", pipe: "｜" });
  assert.equal(plain.draft.mode, "mono");
  assert.deepEqual(plain.draft.readings, ["", ""]);
  assert.equal(plain.pipe, "｜");
  const existing = resolveRubyTarget("｜東京《とうきょう》", 0, 10, { defaultMode: "mono" });
  assert.equal(existing.draft.mode, "group");
  assert.equal(serializeRubyEdit(existing, existing.draft), "｜東京《とうきょう》");
});

test("カーソルや記法の途中選択から組全体を扱い、別の文字を巻き込まない", () => {
  const text = "前｜東京《とうきょう》後";
  for (const [start,end] of [[3,3],[2,3],[6,7]]) {
    const target = resolveRubyTarget(text, start, end);
    assert.equal(target.start, 1);
    assert.equal(target.end, text.length - 1);
    assert.equal(target.base, "東京");
  }
  assert.throws(() => resolveRubyTarget(text, 0, 0), /選択/);
  assert.throws(() => resolveRubyTarget("東京\n大阪", 0, 4), /改行/);
  assert.equal(resolveRubyTarget("\n東京", 1, 3).base, "東京");
});

test("グループを単一へ分配せず、指定した当て字・漢字・英字をそのまま適用する", () => {
  const target = resolveRubyTarget("|運命《デスティニー》", 0, 11);
  assert.deepEqual(target.draft.readings, ["", ""]);
  assert.equal(serializeRubyEdit(target, { ...target.draft, mode: "mono", readings: ["デス", "ティニー"] }), "|運《デス》|命《ティニー》");
  assert.equal(serializeRubyEdit(target, { ...target.draft, mode: "mono", readings: ["亜", "Night"] }), "|運《亜》|命《Night》");
  assert.equal(serializeRubyEdit(target, { ...target.draft, mode: "mono", readings: ["デスティニー", ""] }), "|運《デスティニー》命");
  assert.throws(() => serializeRubyEdit(target, { ...target.draft, mode: "mono" }), /入力/);
});

test("連続する単一ルビは既存の対応を読み、グループへ連結できる", () => {
  const text = "｜東《とう》｜京《きょう》";
  const target = resolveRubyTarget(text, 0, text.length);
  assert.equal(target.draft.mode, "mono");
  assert.deepEqual(target.draft.readings, ["とう", "きょう"]);
  assert.equal(serializeRubyEdit(target, target.draft), text);
  assert.equal(serializeRubyEdit(target, { ...target.draft, mode: "group" }), "｜東京《とうきょう》");
  const implicit = resolveRubyTarget("東京《とうきょう》", 1, 1);
  assert.equal(serializeRubyEdit(implicit, implicit.draft), "東京《とうきょう》");
});

test("異体字・結合文字・サロゲートペアを途中で分断しない", () => {
  const base = "𠮷葛\u{E0100}か\u3099";
  const target = resolveRubyTarget(base, 0, base.length);
  assert.deepEqual(characters(base), ["𠮷", "葛\u{E0100}", "か\u3099"]);
  const result = serializeRubyEdit(target, { ...target.draft, mode: "mono", readings: ["よし", "かつ", "が"] });
  assert.equal(result, "|𠮷《よし》|葛\u{E0100}《かつ》|か\u3099《が》");
  assert.throws(() => resolveRubyTarget(base, 1, 2), /文字/);
  assert.throws(() => resolveRubyTarget(base, 2, 3), /文字/);
});

test("傍点・未完記法・改行やルビ記号の注入を止める", () => {
  for (const source of ["《《強調》》", "|東京《途中", "東京《》途中《"]) assert.throws(() => resolveRubyTarget(source, 0, source.length));
  const target = resolveRubyTarget("東京", 0, 2);
  for (const reading of ["とう\nきょう", "とう《きょう》", "a|b"]) assert.throws(() => serializeRubyEdit(target, { ...target.draft, groupReading: reading }), /含め/);
  assert.throws(() => serializeRubyEdit(target, { mode: "mono", readings: ["x"], groupReading: "x" }), /確認/);
});

class Range { constructor(start,end) { Object.assign(this,{start,end}); } }
function fixture(text = "東京", pairs = [[0,2]], config = {}) {
  const calls = { warnings:[], edits:[], shown:[], commands:[], panels:[] };
  const document = { uri: { toString: () => `file:note-${Math.random()}` }, version: 1, isClosed: false,
    getText: range => range ? text.slice(range.start,range.end) : text,
    offsetAt: value => value, positionAt: value => value };
  const selection = ([start,end]) => ({start,end,isEmpty:start===end});
  const editor = { document, viewColumn:1, selections:pairs.map(selection), async edit(callback, options) {
    const operations=[]; callback({replace:(range,value)=>operations.push({range,value})});
    calls.edits.push({operations,options});
    if (calls.editFailure) return false;
    for (const operation of operations.sort((a,b)=>b.range.start-a.range.start)) text=text.slice(0,operation.range.start)+operation.value+text.slice(operation.range.end);
    document.version++; calls.change?.({document}); return true;
  } };
  const vscode = { Range, ViewColumn:{Beside:2}, commands:{executeCommand:async(...args)=>calls.commands.push(args)},
    workspace:{getConfiguration:()=>({get:(name,fallback)=>config[name]??fallback}),onDidChangeTextDocument:callback=>{calls.change=callback;return {dispose:()=>{calls.change=null;}};}},
    window:{activeTextEditor:editor,showWarningMessage:message=>calls.warnings.push(message),showTextDocument:async(...args)=>calls.shown.push(args),createWebviewPanel:()=>{
      const panel={messages:[],reveals:0,disposed:false,webview:{postMessage:message=>panel.messages.push(structuredClone(message)),
        onDidReceiveMessage:callback=>{panel.receive=callback;return{dispose(){}};}},reveal(){this.reveals++;},
        onDidDispose:callback=>{panel.disposeCallback=callback;},dispose(){if(this.disposed)return;this.disposed=true;panel.disposeCallback?.();}};
      calls.panels.push(panel);return panel;
    }} };
  // A stable URI is necessary to model the same document across commands.
  const uri=`file:note-${Math.random()}`; document.uri.toString=()=>uri;
  const panel=openRubyEditor(vscode,{subscriptions:[]});
  return {calls,document,editor,vscode,panel,text:()=>text,change(value){text=value;document.version++;calls.change?.({document});}};
}
const groupDraft = reading => ({mode:"group",groupReading:reading,readings:["",""]});

test("取消は編集せず、複数選択の適用は1回のUndo単位になる", async () => {
  const cancel=fixture(); await cancel.panel.receive({type:"ruby.cancel"});
  assert.equal(cancel.text(),"東京"); assert.equal(cancel.calls.edits.length,0);
  const f=fixture("東京 大阪",[[0,2],[3,5]]);
  await f.panel.receive({type:"ruby.ready"});
  assert.equal(f.panel.messages[0].targets.length,2);
  await f.panel.receive({type:"ruby.apply",drafts:[groupDraft("とうきょう"),groupDraft("おおさか")]});
  assert.equal(f.text(),"|東京《とうきょう》 |大阪《おおさか》");
  assert.equal(f.calls.edits.length,1);
  assert.deepEqual(f.calls.edits[0].options,{undoStopBefore:true,undoStopAfter:true});
  assert.equal(f.panel.disposed,true);
});

test("原稿の途中変更・閉鎖では適用せず、入力画面に理由を残す", async () => {
  for (const kind of ["change","closed"]) {
    const f=fixture();
    if(kind==="change")f.change("原稿の追加入力");else f.document.isClosed=true;
    await f.panel.receive({type:"ruby.apply",drafts:[groupDraft("とうきょう")]});
    assert.equal(f.calls.edits.length,0);
    assert.equal(f.panel.disposed,false);
    assert.match(f.panel.messages.at(-1).message,/変更されたか閉じ/);
    f.panel.dispose();
  }
});

test("不正な入力と適用失敗は原稿を変えず再入力画面を保持する", async () => {
  const f=fixture();
  await f.panel.receive({type:"ruby.apply",drafts:[{...groupDraft("とう"),base:"改ざん",readings:[]}]});
  assert.equal(f.calls.edits.length,0);
  f.calls.editFailure=true;
  await f.panel.receive({type:"ruby.apply",drafts:[groupDraft("とうきょう")]});
  assert.equal(f.text(),"東京"); assert.equal(f.panel.disposed,false);
  assert.match(f.panel.messages.at(-1).message,/適用できません/);
  f.panel.dispose();
});

test("既定の単一と全角記号を渡し、同じ文書の画面を重複して開かない", async () => {
  const f=fixture("東京",[[0,2]],{rubyDefaultMode:"mono",rubyPipeStyle:"full"});
  await f.panel.receive({type:"ruby.ready"});
  assert.equal(f.panel.messages[0].defaultMode,"mono");
  assert.equal(f.panel.messages[0].targets[0].draft.mode,"mono");
  assert.equal(openRubyEditor(f.vscode),f.panel);
  assert.equal(f.panel.reveals,1);
  await f.panel.receive({type:"ruby.apply",drafts:[{mode:"mono",groupReading:"",readings:["とう","きょう"]}]});
  assert.equal(f.text(),"｜東《とう》｜京《きょう》");
});

test("重なる選択は止め、同じルビへの複数カーソルは一つにまとめる", async () => {
  const bad=fixture("東京大阪",[[0,3],[2,4]]);
  assert.equal(bad.panel,undefined); assert.match(bad.calls.warnings[0],/重なって/);
  const good=fixture("｜東京《とうきょう》",[[3,3],[5,5]]);
  await good.panel.receive({type:"ruby.ready"});
  assert.equal(good.panel.messages[0].targets.length,1);
  good.panel.dispose();
});

test("適用中の連打を重ねず、ホストの親文字や範囲をメッセージから変更できない", async () => {
  const f=fixture();
  let finish;
  const edit=f.editor.edit.bind(f.editor);
  f.editor.edit=async(...args)=>{await new Promise(resolve=>{finish=resolve;});return edit(...args);};
  const message={type:"ruby.apply",drafts:[{...groupDraft("とうきょう"),base:"別の文字",start:999}]};
  const applying=f.panel.receive(message);
  await f.panel.receive(message);
  finish(); await applying;
  assert.equal(f.calls.edits.length,1);
  assert.equal(f.text(),"|東京《とうきょう》");
});

test("編集せずに既存ルビを適用しても書き換えず、設定の入口は新規既定を開く", async () => {
  const f=fixture("｜東京《とうきょう》",[[3,3]]);
  await f.panel.receive({type:"ruby.ready"});
  const draft=f.panel.messages[0].targets[0].draft;
  await f.panel.receive({type:"ruby.settings"});
  assert.deepEqual(f.calls.commands,[["workbench.action.openSettings","mojigoto.rubyDefaultMode"]]);
  await f.panel.receive({type:"ruby.apply",drafts:[draft]});
  assert.equal(f.calls.edits.length,0);
  assert.equal(f.text(),"｜東京《とうきょう》");
});
