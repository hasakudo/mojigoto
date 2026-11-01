const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const vm = require("node:vm");
const fs = require("node:fs");
const { NoteDisplayManager, getDisplayHtml } = require("../src/views/note-display-webview");
const { createNoteDisplayRenderer } = require("../src/views/note-webview/display-renderer");
const { getDisplaySyncScript } = require("../src/views/note-webview/script-display-sync");
const { getViewStateScript } = require("../src/views/note-webview/script-view-state");
const { getNavigationScript } = require("../src/views/note-webview/script-navigation");

function panel(filePath = "") {
  const messages = [], disposals = [], listeners = [];
  return { __mojigotoFilePath:filePath, messages, reveals:0, disposed:false,
    webview:{ cspSource:"https://local.test", postMessage:m => messages.push(structuredClone(m)),
      onDidReceiveMessage:fn => listeners.push(fn) },
    onDidDispose:fn => disposals.push(fn), reveal(){ this.reveals++; },
    dispose(){ if (this.disposed) return; this.disposed = true; disposals.forEach(fn => fn()); },
    receive(message){ return Promise.all(listeners.map(fn => fn(message))); },
  };
}
function fixture() {
  const created = [], assets = path.resolve(".review-baseline/test-temp/display-assets");
  const context = {subscriptions:[]};
  const manager = new NoteDisplayManager({css:"", getNonce:() => "nonce", getAssetsRoot:() => assets,
    attachImages:(note, target) => ({...note, groups:note.groups.map(g => ({...g, images:g.images.map(i => ({...i, webviewUri:`https://local.test/${created.indexOf(target)}/${i.relativePath}`}))}))}),
    vscode:{Uri:{file:val => val},ViewColumn:{Beside:2},window:{createWebviewPanel:(_type,_title,column,options) => {
      assert.equal(column,2); assert.deepEqual(options.localResourceRoots,[assets]);
      const p = panel(); created.push(p); return p;
    }}}});
  function attach(file = "note.json", title = "ノート") {
    const p = panel(path.resolve(assets,file));
    const session = manager.attach(p,{context,filePath:p.__mojigotoFilePath,workDir:assets,workTitle:"元の作品",type:"plot",note:{title,groups:[]}});
    return {p, session, send:(note,dirty=true,sequence=1,warning="") => manager.accept(p,{session,sequence,note,dirty,warning})};
  }
  return {manager, created, attach, assets, context};
}

test("表示は準備完了後に下書きを受信し、同じノート・表示種別を再利用する", () => {
  const f = fixture(), a = f.attach();
  assert.equal(f.manager.open(a.p,"list"),true);
  assert.equal(f.manager.open(a.p,"list"),true);
  assert.equal(f.created.length,1); assert.equal(f.created[0].reveals,1);
  assert.equal(f.created[0].messages.length,0);
  f.created[0].receive({type:"noteDisplay.ready"});
  assert.equal(a.p.messages.at(-1).type,"noteDisplay.request");
  a.send({title:"保存前の変更",groups:[]});
  assert.equal(f.created[0].messages.at(-1).note.title,"保存前の変更");
  assert.equal(f.created[0].messages.at(-1).dirty,true);
  f.manager.open(a.p,"board"); assert.equal(f.created.length,2);
  f.created[1].receive({type:"noteDisplay.ready"});
  a.send({title:"保存済み",groups:[]},false,2);
  assert.equal(f.created[1].messages.at(-1).dirty,false);
  assert.ok(f.created[1].messages.at(-1).sequence > f.created[0].messages.at(-1).sequence);
});

test("別ノート・古いセッション・古い連番・表示側からの編集メッセージを採用しない", () => {
  const f = fixture(), a = f.attach(), b = f.attach("other.json");
  f.manager.open(a.p,"list"); const view = f.created[0];view.receive({type:"noteDisplay.ready"});
  a.send({title:"最新",groups:[]},true,3);
  assert.equal(a.send({title:"古い",groups:[]},false,2),false);
  assert.equal(f.manager.accept(b.p,{session:a.session,sequence:4,note:{groups:[]}}),false);
  view.receive({type:"save",note:{title:"不正"}});
  assert.equal(view.messages.at(-1).note.title,"最新");
  f.manager.editorReady(a.p);
  assert.equal(a.send({title:"前の文書",groups:[]},false,4),false);
  const session = a.p.messages.at(-1).session;
  assert.equal(f.manager.accept(a.p,{session,sequence:1,note:{title:"再接続",groups:[]}}),true);
  assert.equal(view.messages.at(-1).note.title,"再接続");
});

test("保存直後の追加入力と警告を保ち、編集終了後も最後の内容を表示する", () => {
  const f = fixture(), a = f.attach(); f.manager.open(a.p,"list");
  const view = f.created[0];view.receive({type:"noteDisplay.ready"});
  a.send({title:"下書き",groups:[]},true,1,"外部更新があります");
  f.manager.captureDraft(a.p,{title:"終了直前の入力",groups:[]});
  f.manager.detach(a.p);
  assert.equal(view.messages.at(-1).closed,true);
  assert.equal(view.messages.at(-1).dirty,true);
  assert.equal(view.messages.at(-1).note.title,"終了直前の入力");
  assert.match(view.messages.at(-1).warning,/外部更新/);
  const reopened = f.attach();
  view.receive({type:"noteDisplay.ready"});
  reopened.send({title:"編集再開",groups:[]},false);
  assert.equal(view.messages.at(-1).closed,false);
  assert.equal(view.messages.at(-1).note.title,"編集再開");
});

test("最後の表示を閉じると通知を止め、ノート・作品の削除対象から表示を漏らさない", () => {
  const f = fixture(), a = f.attach(); f.manager.open(a.p,"list"); f.manager.open(a.p,"board");
  f.created[0].dispose(); assert.notEqual(a.p.messages.at(-1)?.active,false);
  f.created[1].dispose(); assert.equal(a.p.messages.at(-1).active,false); assert.equal(a.p.disposed,false);
  f.manager.open(a.p,"list");
  const b = f.attach("../display-assets-other/note.json"); f.manager.open(b.p,"list");
  assert.equal(f.manager.closeUnderFolder(f.assets),1);
  assert.equal(f.created.at(-1).disposed,false);
  assert.equal(f.manager.closeByPath(b.p.__mojigotoFilePath),1);
});

test("画像は表示先ごとに変換し、クライアント指定の作品や範囲外画像を採用しない", () => {
  const f = fixture(), a = f.attach();
  f.manager.getAssetsRoot = () => { throw new Error("作品切替後のルートへ変更しない"); };
  f.manager.open(a.p,"list"); f.manager.open(a.p,"board");
  f.created.forEach(p => p.receive({type:"noteDisplay.ready"}));
  a.send({title:"画像",workTitle:"別の作品",groups:[{images:[{relativePath:"note-images/a.png",webviewUri:"https://external.test"},{relativePath:"../outside.png"},{relativePath:path.resolve("outside.png")}]}]});
  f.created.forEach((p,i) => {
    const {note} = p.messages.at(-1);assert.equal(note.workTitle,"元の作品");
    assert.equal(note.groups[0].images.length,1);
    assert.equal(note.groups[0].images[0].webviewUri,`https://local.test/${i}/note-images/a.png`);
  });
});

test("表示専用の描画はルビ・メモ・関連印を共用し、入力をHTMLとして実行しない", () => {
  const r = createNoteDisplayRenderer();
  assert.match(r.body("｜漢字《かんじ》\n《《強調》》"),/<ruby>漢字<rt>かんじ/);
  assert.match(r.body('<img onerror="alert(1)">'),/&lt;img/);
  assert.match(r.related(3),/<svg/);assert.doesNotMatch(r.related(3),/🔗/);
  const tagOnly = r.memo({id:"tags",memo:{tags:["資料","#人物","<危険>"]}});
  assert.match(tagOnly,/#資料/);assert.match(tagOnly,/#人物/);assert.match(tagOnly,/#&lt;危険&gt;/);
  assert.doesNotMatch(tagOnly,/##人物|詳細未入力/);
  const note = {groups:[{id:'g" onclick="bad',title:"大分類",items:[{id:"a",heading:"名前",headingRuby:"なまえ",body:"本文",memo:{body:"メモ",tags:["資料"]},relatedReferences:[{}]},{kind:"divider",label:"区分",value:"補足"}]}]};
  for (const board of [false,true]) {
    const html = r.groups(note,board);
    assert.match(html,/項目メモ/); assert.match(html,/<rt>なまえ/);assert.match(html,/関連ノート 1件/);
    assert.match(html,/補足/);assert.doesNotMatch(html,/<input|<textarea|draggable=|data-action=/);
    assert.ok(html.includes("g&quot; onclick=&quot;bad"));
  }
  const html = getDisplayHtml({webview:{cspSource:"https://local.test"},css:"",nonce:"nonce",mode:"board"});
  assert.match(html,/default-src 'none'/);
  assert.doesNotThrow(() => new vm.Script(html.match(/<script nonce="nonce">([\s\S]*?)<\/script>/)[1]));
});

test("編集側は連続入力を150msでまとめ、停止・再開・保存状態を反映する", () => {
  const listeners = {}, messages = [], timers = new Map(); let next = 0;
  const context = vm.createContext({window:{addEventListener:(name,fn) => listeners[name]=fn},
    document:{getElementById:() => null},vscode:{postMessage:message => messages.push(message)},
    collectPayload:() => ({title:"最新入力",groups:[]}),dirty:true,
    toastStatusEl:{classList:{contains:() => true}},toastStatusTextEl:{textContent:"保存失敗"},
    setTimeout:(fn,ms) => {assert.equal(ms,150);timers.set(++next,fn);return next;},clearTimeout:id => timers.delete(id)});
  vm.runInContext(getDisplaySyncScript(),context);
  context.queueNoteDisplaySnapshot();assert.equal(timers.size,0);
  listeners.message({data:{type:"noteDisplay.request",session:"new",active:true}});
  assert.equal(messages[0].dirty,true);assert.equal(messages[0].warning,"保存失敗");
  for (let n=0;n<10;n++) context.queueNoteDisplaySnapshot();assert.equal(timers.size,1);
  context.dirty=false;[...timers.values()][0]();assert.equal(messages.at(-1).dirty,false);
  assert.equal(messages.at(-1).sequence,2);
  listeners.message({data:{type:"noteDisplay.request",session:"new",active:false}});
  context.queueNoteDisplaySnapshot();assert.equal(timers.size,0);
});

test("全画面ボードは別タブを開けた場合だけ閉じ、通常プレビューの操作では閉じない", () => {
  let receive, closed = 0;
  const messages = [];
  const context = vm.createContext({window:{addEventListener:(_,fn) => receive=fn},
    document:{getElementById:() => null},vscode:{postMessage:m => messages.push(m)},
    closeBoard:() => closed++,setTimeout,clearTimeout});
  vm.runInContext(getDisplaySyncScript(),context);
  context.openNoteDisplayTab("board",true);
  assert.equal(messages[0].returnToEditor,true);assert.equal(closed,0);
  receive({data:{type:"noteDisplay.opened",opened:false,returnToEditor:true}});assert.equal(closed,0);
  receive({data:{type:"noteDisplay.opened",opened:true,returnToEditor:false}});assert.equal(closed,0);
  receive({data:{type:"noteDisplay.opened",opened:true,returnToEditor:true}});assert.equal(closed,1);
});

test("目次から登録された元ノートの編集位置だけを開き、表示側の内容を書き戻さない", async () => {
  const f=fixture(),a=f.attach();
  a.send({title:"下書き",groups:[{id:"g",items:[{id:"i"}]}]});
  f.manager.editorReady(a.p);
  f.manager.open(a.p,"list");const view=f.created[0];
  await view.receive({type:"noteDisplay.navigate",groupId:"g",itemId:"i",filePath:"unrelated.json"});
  assert.equal(a.p.messages.at(-1).type,"noteDisplay.focus");
  assert.deepEqual(a.p.messages.at(-1).target,{groupId:"g",itemId:"i"});
  assert.equal(a.p.reveals,1);
  await view.receive({type:"noteDisplay.navigate",groupId:"g",itemId:"deleted"});
  assert.match(view.messages.at(-1).message,/見つかりません/);
  assert.equal(a.p.reveals,1);
});

test("編集終了後の目次は保存済み対象を確認して再開し、準備完了までジャンプを保留する", async () => {
  const f=fixture(),a=f.attach();
  const note={groups:[{id:"g",items:[{id:"i"}]}]};a.send(note);
  f.manager.open(a.p,"board");const view=f.created[0];f.manager.detach(a.p);
  let reopened;
  f.manager.readNote=async()=>note;
  f.manager.openEditor=async()=>{reopened=f.attach();return reopened.p;};
  await view.receive({type:"noteDisplay.navigate",groupId:"g",itemId:"i"});
  assert.ok(reopened);
  assert.equal(reopened.p.messages.some(m=>m.type==="noteDisplay.focus"),false);
  f.manager.editorReady(reopened.p);
  assert.equal(reopened.p.messages.at(-1).type,"noteDisplay.focus");
});

test("元ファイル消失・保存前だけの項目・解除済み表示からは編集を再作成しない", async () => {
  const f=fixture(),a=f.attach();
  a.send({groups:[{id:"g",items:[{id:"unsaved"}]}]});
  f.manager.open(a.p,"list");const view=f.created[0];f.manager.detach(a.p);
  let opened=0;f.manager.openEditor=async()=>{opened++;};
  f.manager.readNote=async()=>({groups:[{id:"g",items:[]}]});
  await view.receive({type:"noteDisplay.navigate",groupId:"g",itemId:"unsaved"});
  assert.equal(opened,0);
  f.manager.readNote=async()=>{throw Error("file missing");};
  await view.receive({type:"noteDisplay.navigate",groupId:"g"});
  assert.match(view.messages.at(-1).message,/file missing/);assert.equal(opened,0);
  view.dispose();await view.receive({type:"noteDisplay.navigate",groupId:"g"});assert.equal(opened,0);
});

test("目次は見出しをエスケープし、編集側では有効な移動だけ全画面を閉じて実行する", () => {
  const r=createNoteDisplayRenderer();
  const note={groups:[{id:"g",title:"<分類>",items:[{id:"i",heading:"<項目>"},{id:"d",kind:"divider",label:"区分"}]}]};
  assert.match(r.toc(note),/&lt;分類&gt;/);assert.match(r.toc(note),/data-display-item="d"/);
  assert.match(r.memo({id:"i",memo:{body:"メモ"}},true),/<summary>項目メモ<button[^>]*title="項目メモを編集"/);
  let receive;const actions=[];
  vm.runInNewContext(getDisplaySyncScript(),{window:{addEventListener:(_,fn)=>receive=fn},document:{getElementById:()=>null},
    state:note,closeBoard:()=>actions.push("close"),scrollToEditorNavId:id=>actions.push(id),setStatus:msg=>actions.push(msg),setTimeout,clearTimeout});
  receive({data:{type:"noteDisplay.focus",target:{groupId:"g",itemId:"i"}}});assert.deepEqual(actions,["close","item:i"]);
  actions.length=0;receive({data:{type:"noteDisplay.focus",target:{groupId:"g"}}});assert.deepEqual(actions,["close","group:g"]);
  actions.length=0;receive({data:{type:"noteDisplay.focus",target:{groupId:"g",itemId:"deleted"}}});
  assert.equal(actions.length,1);assert.match(actions[0],/見つかりません/);
});

test("ノート終了後にviewColumnが読めなくても、表示を終了状態にして再接続できる", () => {
  const f=fixture(),a=f.attach();f.manager.open(a.p,"list");const view=f.created[0];view.receive({type:"noteDisplay.ready"});
  Object.defineProperty(a.p,"viewColumn",{get(){throw Error("Webview is disposed");}});
  assert.doesNotThrow(()=>f.manager.detach(a.p));assert.equal(view.messages.at(-1).closed,true);
  const next=f.attach();assert.ok(next.session);assert.equal(view.disposed,false);
});

test("閉じた表示への通知が失敗しても、編集元の終了処理を止めない", () => {
  const f=fixture(),a=f.attach();f.manager.open(a.p,"list");const view=f.created[0];view.receive({type:"noteDisplay.ready"});
  Object.defineProperty(view,"title",{set(){throw Error("Webview is disposed");}});
  assert.doesNotThrow(()=>f.manager.detach(a.p));assert.equal(f.manager.views.size,0);assert.equal(f.manager.sources.size,0);
});

test("破棄済みのノート登録は除去して再読込へ進み、別のエラーは握りつぶさない", async () => {
  const text=fs.readFileSync(path.join(__dirname,"../src/views/note-webview.js"),"utf8");
  const fn=text.slice(text.indexOf("async function openNoteWebview("),text.indexOf("function createNoteSerializer("));
  const file=path.resolve("stale-note.json"),stale={reveal(){throw Error("Webview is disposed");}};
  const editors=new Map([[file,stale]]),byPath=new Map([[file,stale]]);let detached=0,reads=0;
  const ctx=vm.createContext({path,vscode:{},...require("../src/views/shared/restored-webviews"),openNotePanels:editors,openNotePanelsByPath:byPath,noteDisplays:{detach(){detached++;}},
    readNoteFile:async()=>{reads++;throw Error("reached disk read");}});
  vm.runInContext(fn,ctx);
  await assert.rejects(ctx.openNoteWebview({},null,{filePath:file,type:"plot"}),/reached disk read/);
  assert.equal(editors.size,0);assert.equal(byPath.size,0);assert.equal(detached,1);assert.equal(reads,1);
  editors.set(file,{reveal(){throw Error("unrelated failure");}});
  await assert.rejects(ctx.openNoteWebview({},null,{filePath:file,type:"plot"}),/unrelated failure/);assert.equal(reads,1);
});

test("目次ジャンプ後に起動時の復元が遅れて届いても編集位置を戻さない", () => {
  function scenario(skip=false,claim=false) {
    const frames=[],editor={scrollTop:0,scrollHeight:2000,clientHeight:200},preview={scrollTop:0,scrollHeight:2000,clientHeight:200};
    const ctx=vm.createContext({localStorage:{getItem:()=>JSON.stringify({editor:400,preview:80})},scrollStorageKey:"note",requestAnimationFrame:fn=>frames.push(fn)});
    vm.runInContext(getViewStateScript({skipEditorScrollRestore:skip}),ctx);
    ctx.getEditorScrollEl=()=>editor;ctx.getPreviewScrollEl=()=>preview;
    ctx.loadScrollPositions();
    if(claim){ctx.claimEditorScrollForNavigation();editor.scrollTop=900;}
    while(frames.length)frames.shift()();
    return {editor:editor.scrollTop,preview:preview.scrollTop};
  }
  assert.deepEqual(scenario(),{editor:400,preview:80});
  assert.deepEqual(scenario(true),{editor:0,preview:80});
  assert.deepEqual(scenario(false,true),{editor:900,preview:80});
});

test("表示タブの目次は編集領域だけを即時移動し、通常ジャンプのsmoothは維持する", () => {
  const frames=[],moves=[],focused=[];
  const target={classList:{add(){},remove(){}},offsetWidth:1,querySelector:()=>({focus:options=>focused.push(options)})};
  const ctx=vm.createContext({groupsRoot:{querySelector:()=>target},requestAnimationFrame:fn=>frames.push(fn)});
  vm.runInContext(getNavigationScript(),ctx);
  ctx.revealEditorPaneBeforeJump=fn=>fn();ctx.getGroupIdForNavId=()=>"g";ctx.openGroup=()=>false;
  ctx.scrollEditorElementIntoView=(_target,align,behavior)=>moves.push({align,behavior});
  ctx.claimEditorScrollForNavigation=()=>{};
  ctx.scrollToEditorNavId("item:i",{immediate:true});while(frames.length)frames.shift()();
  ctx.scrollToEditorNavId("group:g");while(frames.length)frames.shift()();
  assert.deepEqual(moves,[{align:"center",behavior:"instant"},{align:"start",behavior:"smooth"}]);
  assert.equal(focused[0].preventScroll,true);
});

test("サムネイルはモーダルで拡大し、閉じたら画像参照を解除する", () => {
  const nodes=new Map();
  function node(id){if(!nodes.has(id))nodes.set(id,{handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},setAttribute(name,value){this[name]=value;},removeAttribute(name){delete this[name];}});return nodes.get(id);}
  const dialog=node("displayImageModal");dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;dialog.handlers.close();};
  const html=getDisplayHtml({webview:{cspSource:"https://local.test"},css:"",nonce:"test",mode:"list"});
  vm.runInNewContext(html.match(/<script nonce="test">([\s\S]*?)<\/script>/)[1],{document:{getElementById:node},window:{addEventListener(){}},acquireVsCodeApi:()=>({postMessage(){}})});
  const image={src:"https://local.test/a.png",alt:"資料画像"};
  node("displayContent").handlers.click({target:{closest:()=>({querySelector:()=>image})}});
  assert.equal(dialog.open,true);assert.equal(node("displayImageLarge").src,image.src);assert.equal(node("displayImageCaption").textContent,"資料画像");
  node("closeDisplayImage").handlers.click();assert.equal(dialog.open,false);assert.equal(node("displayImageLarge").src,undefined);
});

test("表示タブだけの復元は保存済みノートを読み、リストとボードを同じ元ノートへ登録する", async () => {
  const f=fixture();const file=path.join(f.assets,".mojigoto","plots","saved.json");let reads=0;
  let serializer;
  f.manager.vscode.window.registerWebviewPanelSerializer=(type,handler)=>{assert.equal(type,"mojigoto.noteDisplay");serializer=handler;return {dispose(){}};};
  assert.ok(f.manager.registerSerializer(f.context,null));
  f.manager.readNote=async options=>{reads++;assert.equal(options.assetsRoot,path.dirname(path.dirname(file)));return {title:"保存済みノート",groups:[]};};
  for(const mode of ["list","board"]){
    const p=panel();await serializer.deserializeWebviewPanel(p,{version:1,filePath:file,type:"plot",mode});
    await p.receive({type:"noteDisplay.ready"});
    assert.equal(p.messages.at(-1).note.title,"保存済みノート");assert.equal(p.messages.at(-1).closed,true);assert.equal(p.messages.at(-1).dirty,false);
    assert.equal(p.messages[0].identity.mode,mode);
    for(const disposable of f.context.subscriptions) disposable.dispose();
    assert.equal(p.disposed,false);
  }
  assert.equal(reads,2);assert.equal(f.manager.views.size,2);assert.equal(f.manager.sources.size,1);
});

test("編集タブが先・後どちらで復元されても、表示から編集内容を上書きせず再接続する", async () => {
  for(const editorFirst of [true,false]){
    const f=fixture(),relative=path.join(".mojigoto","plots","saved.json"),file=path.join(f.assets,relative);
    f.manager.readNote=async()=>({title:"ディスクの内容",groups:[]});
    let a;if(editorFirst){a=f.attach(relative);a.send({title:"編集中の内容",groups:[]});}
    const p=panel();await f.manager.restore(f.context,null,p,{version:1,filePath:file,type:"plot",mode:"list"});
    await p.receive({type:"noteDisplay.ready"});
    if(!editorFirst)a=f.attach(relative);
    f.manager.editorReady(a.p);const session=a.p.messages.at(-1).session;
    assert.equal(f.manager.accept(a.p,{session,sequence:1,note:{title:"編集中の内容",groups:[]},dirty:true}),true);
    assert.equal(p.messages.at(-1).note.title,"編集中の内容");assert.equal(p.messages.at(-1).dirty,true);assert.equal(p.messages.at(-1).closed,false);
  }
});

test("復元用情報の欠落・保存先不正・ファイル消失では作成せず、原因をタブに表示する", async () => {
  const f=fixture();let reads=0;f.manager.readNote=async()=>{reads++;throw Error("missing <note>");};
  for(const state of [null,{version:1,filePath:path.join(f.assets,"outside.json"),mode:"list",type:"plot"}]){
    const p=panel();await f.manager.restore(f.context,null,p,state);assert.match(p.webview.html,/復元できません/);assert.equal(p.webview.options.enableScripts,false);
  }
  assert.equal(reads,0);
  const p=panel();await f.manager.restore(f.context,null,p,{version:1,filePath:path.join(f.assets,".mojigoto","plots","missing.json"),mode:"board",type:"plot"});
  assert.match(p.webview.html,/missing &lt;note&gt;/);assert.equal(f.manager.sources.size,0);assert.equal(f.manager.views.size,0);
});

test("復元待ちに閉じたパネルや、同じ表示の二重復元を残さない", async () => {
  const f=fixture(),state={version:1,filePath:path.join(f.assets,".mojigoto","plots","saved.json"),mode:"list",type:"plot"};
  let finish;f.manager.readNote=()=>new Promise(resolve=>{finish=resolve;});
  const p=panel(),pending=f.manager.restore(f.context,null,p,state);p.dispose();finish({groups:[]});await pending;assert.equal(f.manager.views.size,0);
  f.manager.readNote=async()=>({groups:[]});const first=panel();await f.manager.restore(f.context,null,first,state);
  const duplicate=panel();await f.manager.restore(f.context,null,duplicate,state);assert.equal(duplicate.disposed,true);assert.equal(first.disposed,false);assert.equal(f.manager.views.size,1);
});

test("復元状態は本文を含めず、目次と表示位置を戻してから保存する", () => {
  const nodes=new Map();let receive;const states=[];
  function node(id){if(!nodes.has(id))nodes.set(id,{handlers:{},scrollTop:0,scrollLeft:0,addEventListener(name,fn){this.handlers[name]=fn;},setAttribute(){},querySelectorAll:()=>[]});return nodes.get(id);}
  const identity={version:1,filePath:"saved.json",type:"plot",mode:"list"};
  const html=getDisplayHtml({webview:{cspSource:"https://local.test"},css:"",nonce:"test",mode:"list"});
  vm.runInNewContext(html.match(/<script nonce="test">([\s\S]*?)<\/script>/)[1],{document:{getElementById:node},window:{addEventListener:(_,fn)=>receive=fn},clearTimeout,setTimeout,
    acquireVsCodeApi:()=>({getState:()=>({ui:{tocOpen:true,top:200,left:15,tocTop:7}}),setState:state=>states.push(state),postMessage(){}})});
  receive({data:{type:"noteDisplay.identity",identity}});
  receive({data:{type:"noteDisplay.snapshot",sequence:1,note:{title:"本文を保存しない",groups:[{id:"g",items:[{heading:"見出し",body:"never-persist-body"}]}]}}});
  assert.equal(node("displayToc").hidden,false);assert.equal(node("displayContent").scrollTop,200);assert.equal(node("displayContent").scrollLeft,15);
  assert.equal(states.at(-1).filePath,"saved.json");assert.doesNotMatch(JSON.stringify(states),/never-persist-body|本文を保存しない|見出し/);
});

function memoDisplayHarness(mode, saved = {}) {
  const nodes = new Map(), states = [], messages = [], timers = new Map();
  let receive, nextTimer = 0;
  function node(id) {
    if (nodes.has(id)) return nodes.get(id);
    const element = { handlers:{}, details:[], scrollTop:0, scrollLeft:0,
      addEventListener(type, fn) { this.handlers[type] = fn; }, setAttribute() {},
      querySelectorAll(selector) {
        if (selector === "details.noteDisplayMemo") return this.details.filter(detail => detail.memo);
        if (selector === "details" || selector === "details[data-display-key]") return this.details;
        return [];
      },
      set innerHTML(html) {
        this.details = [...html.matchAll(/<details\b([^>]*)>/g)].map(([, attrs]) => ({
          dataset:{ displayKey:attrs.match(/data-display-key="([^"]*)"/)?.[1] },
          open:/\sopen(?:\s|$)/.test(attrs), memo:/class="noteDisplayMemo"/.test(attrs),
        })).filter(detail => detail.dataset.displayKey);
      },
    };
    nodes.set(id, element);
    return element;
  }
  const html = getDisplayHtml({webview:{cspSource:"https://local.test"},css:"",nonce:"test",mode});
  vm.runInNewContext(html.match(/<script nonce="test">([\s\S]*?)<\/script>/)[1], {
    document:{getElementById:node},window:{addEventListener:(_, fn) => { receive = fn; }},
    setTimeout:fn => { timers.set(++nextTimer, fn); return nextTimer; },clearTimeout:id => timers.delete(id),
    acquireVsCodeApi:() => ({getState:() => saved,setState:state => states.push(structuredClone(state)),postMessage:message => messages.push(message)}),
  });
  receive({data:{type:"noteDisplay.identity",identity:{version:1,filePath:"saved.json",type:"plot",mode}}});
  let sequence = 0;
  return {node,states,messages,send:note => receive({data:{type:"noteDisplay.snapshot",sequence:++sequence,note}}),
    flush:() => { for (const fn of timers.values()) fn(); timers.clear(); }};
}

test("プレビューとボードのメモ一括開閉は親の開閉を変えず、個別操作と内容更新も維持する", () => {
  for (const mode of ["list", "board"]) {
    const h = memoDisplayHarness(mode);
    const note = {groups:[{id:"g",items:[{id:"a",body:"本文",memo:{body:"メモ本文"}},
      {id:"b",memo:{tags:["資料"]}},{id:"c",body:"メモなし"}]}]};
    h.send(note);
    const root = h.node("displayContent"), open = h.node("openDisplayMemos"), close = h.node("closeDisplayMemos");
    const memos = () => root.querySelectorAll("details.noteDisplayMemo");
    assert.equal(memos().length, 2);
    assert.ok(memos().every(memo => !memo.open));
    assert.equal(open.disabled, false); assert.equal(close.disabled, true);
    const parent = root.details.find(detail => !detail.memo);
    parent.open = false;
    open.handlers.click();
    assert.ok(memos().every(memo => memo.open)); assert.equal(parent.open, false);
    assert.equal(open.disabled, true); assert.equal(close.disabled, false);
    memos()[0].open = false;
    root.handlers.toggle(); h.flush();
    assert.equal(open.disabled, false); assert.equal(close.disabled, false);
    note.groups[0].items[0].body += "更新";
    h.send(note);
    assert.equal(memos()[0].open, false); assert.equal(memos()[1].open, true);
    close.handlers.click();
    assert.ok(memos().every(memo => !memo.open));
    assert.equal(close.disabled, true);
    assert.equal(h.messages.some(message => message.type !== "noteDisplay.ready"), false);
    h.send({groups:[]});
    assert.equal(open.disabled, true); assert.equal(close.disabled, true);
  }
});

test("一括開閉後の再起動でもメモの個別状態を復元し、新規メモは閉じて表示する", () => {
  for (const mode of ["list", "board"]) {
    const note = {groups:[{id:"g",items:[{id:"a",memo:{body:"本文を状態に保存しない"}},{id:"b",memo:{tags:["資料"]}}]}]};
    const first = memoDisplayHarness(mode);
    first.send(note);
    first.node("openDisplayMemos").handlers.click();
    first.node("displayContent").querySelectorAll("details.noteDisplayMemo")[1].open = false;
    first.node("displayContent").handlers.toggle(); first.flush();
    const saved = first.states.at(-1);
    assert.doesNotMatch(JSON.stringify(saved), /本文を状態に保存しない/);
    note.groups[0].items.push({id:"new",memo:{body:"追加したメモ"}});
    const restored = memoDisplayHarness(mode, saved);
    restored.send(note);
    assert.deepEqual(restored.node("displayContent").querySelectorAll("details.noteDisplayMemo").map(memo => memo.open), [true, false, false]);
    assert.equal(restored.node("openDisplayMemos").disabled, false);
    assert.equal(restored.node("closeDisplayMemos").disabled, false);
  }
});
