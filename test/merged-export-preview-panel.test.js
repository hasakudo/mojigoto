const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const panelState = require("../src/export/merged-manuscript-panel-state");
const panelSettings = require("../src/export/merged-manuscript-panel-settings");
const panelHtml = require("../src/export/merged-manuscript-panel-html");
const source = fs.readFileSync(path.resolve(__dirname, "../src/export/merged-manuscript-browser-panel.js"), "utf8");

function loadPanel() {
  const messages = [], panels = [], warnings = [], logs = [];
  function createPanel() {
    const disposals=[];
    const panel={disposed:false,reveals:0,messages:[],disposeCalls:0,
      reveal(){assert.equal(this.disposed,false);this.reveals++;},
      dispose(){this.disposeCalls++;if(this.disposed)return;this.disposed=true;disposals.forEach(fn=>fn());},
      onDidDispose(fn){disposals.push(fn);},fireDisposeAgain(){disposals.forEach(fn=>fn());}};
    const webview={cspSource:"test:",postMessage(m){
      assert.equal(panel.disposed,false);panel.messages.push(m);messages.push(m);
      if(panel.postError)return Promise.reject(Error("post failed"));
      return Promise.resolve(true);
    },onDidReceiveMessage(fn){panel.receive=fn;}};
    Object.defineProperty(panel,"webview",{get(){assert.equal(panel.disposed,false);return webview;}});
    panels.push(panel);return panel;
  }
  const module = {exports:{}};
  vm.runInNewContext(source, {
    module, console:{...console,warn:(...args)=>logs.push(args)}, require(request) {
      if (request === "vscode") return {ViewColumn:{Active:1}, window:{createWebviewPanel:createPanel,
        showWarningMessage:message=>warnings.push(message),showInformationMessage:async()=>{}}};
      if (request === "./merged-manuscript-panel-state") return panelState;
      if (request === "./merged-manuscript-panel-settings") return panelSettings;
      if (request === "./merged-manuscript-panel-html") return panelHtml;
      if (request === "../views/shared/webview-panel-icon") return {setWebviewPanelThemeIcon() {}};
      throw new Error(`Unexpected dependency: ${request}`);
    },
  });
  const html=s => panelHtml.getPanelHtml({},panelState.normalizePanelState(s),panelState.normalizePanelState(s));
  return {api:{...module.exports,html},get panel(){return panels.at(-1);},panels,messages,warnings,logs,receive:m=>panels.at(-1).receive(m)};
}

function deferred() {
  let resolve,reject;
  const promise=new Promise((a,b)=>{resolve=a;reject=b;});
  return {promise,resolve,reject};
}

test("章セレクトは名前を安全に表示し、画面のスクリプトが構文エラーなく生成される", () => {
  const h=loadPanel();
  const html=h.api.html({previewChapters:[{id:"",title:"章なし"},{id:'a"<>',title:'<章&名>'}]});
  assert.match(html, /<option value="">章なし<\/option>/);
  assert.match(html, /value="a&quot;&lt;&gt;">&lt;章&amp;名&gt;/);
  assert.match(html, /id="openSimplePreviewButton"/);
  new vm.Script(html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1]);
  assert.doesNotMatch(h.api.html({}), /id="previewChapterSelect"/);
});

test("ホストはプレビューの成功・失敗どちらも要求番号を返す", async () => {
  const h=loadPanel();
  const opened=h.api.openMergedManuscriptBrowserPanel({}, {}, {onPreview:async payload => {
    if(payload.fail) throw Error("テスト失敗");
    return {html:"<p>第2章</p>",message:"第2章"};
  }});
  await h.receive({type:"requestRealPrintPreview", requestId:12, payload:{}});
  await h.receive({type:"requestRealPrintPreview", requestId:13, payload:{fail:true}});
  assert.equal(h.messages[0].requestId,12); assert.equal(h.messages[0].ok,true);
  assert.equal(h.messages[1].requestId,13); assert.equal(h.messages[1].ok,false);
  h.panel.dispose(); await opened;
});

test("画面状態の保存を先に行い、その後に書き出し時の設定を確定する", async () => {
  const h=loadPanel(), events=[];
  let stored={rootExtra:"UIで保持",simple:{currentLayoutMode:"single",byLayout:{"2up":{charsPerLine:42}}}};
  const context={workspaceState:{get:key => {
    assert.equal(key,panelSettings.MERGED_MANUSCRIPT_BROWSER_PANEL_STATE_KEY); return stored;
  }, async update(key,value) {
    assert.equal(key,panelSettings.MERGED_MANUSCRIPT_BROWSER_PANEL_STATE_KEY);
    stored=value; events.push("saved");
  }}};
  const opened=h.api.openMergedManuscriptBrowserPanel(context,{}, {onSubmit:async payload => {
    events.push("submit");
    assert.equal(stored.simple.byLayout.single.charsPerLine,37);
    assert.equal(stored.rootExtra,"UIで保持");
    await panelSettings.writeMergedManuscriptBrowserPanelState(context,payload);
    return {message:"書き出し済み"};
  }});
  await h.receive({type:"persistUiState",state:{simpleSavedByLayout:{single:{charsPerLine:35}}}});
  assert.equal(stored.simple.byLayout.single.charsPerLine,35);
  await h.receive({type:"submit",payload:{htmlPrintLayoutMode:"single",charsPerLine:38,
    simpleSavedByLayout:{single:{charsPerLine:37}},realPrintPageSize:"a5",realPrintColumnMode:"two",realPrintFontSizePt:11}});
  assert.deepEqual(events,["saved","saved","submit","saved"]);
  assert.equal(stored.simple.byLayout.single.charsPerLine,38);
  assert.equal(stored.simple.byLayout["2up"].charsPerLine,42);
  assert.equal(stored.realBySize["a5:two"].realPrintFontSizePt,11);
  assert.equal(Object.hasOwn(stored,"rootExtra"),false);
  assert.equal(h.messages.at(-1).type,"submitResult"); assert.equal(h.messages.at(-1).ok,true);
  h.panel.dispose(); await opened;
});

test("プレビューだけの操作と取消では保存を行わない", async () => {
  const h=loadPanel(); let writes=0,submits=0;
  const context={workspaceState:{get:() => ({}),update:async () => {writes++;}}};
  const opened=h.api.openMergedManuscriptBrowserPanel(context,{}, {
    onPreview:async () => ({html:"<p>確認</p>"}),onSubmit:async () => {submits++;},
  });
  await h.receive({type:"requestRealPrintPreview",requestId:3,payload:{previewChapterId:"第2章"}});
  await h.receive({type:"cancel"}); await opened;
  assert.equal(writes,0); assert.equal(submits,0);
});

test("開いているパネルを再利用し、別の設定やコールバックを混ぜない", async () => {
  const h=loadPanel();let original=0,replacement=0;
  assert.equal(h.api.revealMergedManuscriptBrowserPanel(),false);
  const opened=h.api.openMergedManuscriptBrowserPanel({}, {charsPerLine:38}, {onPreview:async()=>{original++;return {html:"元の対象"};}});
  const html=h.panel.webview.html;
  const reused=await h.api.openMergedManuscriptBrowserPanel({workspaceState:{get(){throw Error("読まない");}}}, {}, {onPreview:async()=>{replacement++;}});
  assert.equal(reused.reused,true);assert.equal(h.panels.length,1);assert.equal(h.panel.reveals,1);
  assert.equal(h.panel.webview.html,html);
  await h.receive({type:"requestRealPrintPreview",requestId:1});
  assert.equal(original,1);assert.equal(replacement,0);
  h.panel.dispose();await opened;assert.equal(h.api.revealMergedManuscriptBrowserPanel(),false);
});

test("閉じた後のプレビュー応答と古い終了通知は、新しいパネルへ影響しない", async () => {
  const h=loadPanel(),gate=deferred();
  const opened=h.api.openMergedManuscriptBrowserPanel({}, {}, {onPreview:()=>gate.promise});
  const old=h.panel, pending=old.receive({type:"requestRealPrintPreview",requestId:1});
  old.dispose();assert.equal(await opened,null);
  const reopened=h.api.openMergedManuscriptBrowserPanel();const current=h.panel;
  gate.resolve({html:"古い結果"});await pending;
  old.fireDisposeAgain();await old.receive({type:"cancel"});
  assert.equal(old.messages.length,0);assert.equal(current.disposed,false);
  assert.equal(h.api.revealMergedManuscriptBrowserPanel(),true);
  current.dispose();assert.equal(await reopened,null);
});

test("古いプレビューの成功・失敗は新しい結果の後に送らない", async () => {
  for(const fail of [false,true]) {
    const h=loadPanel(),first=deferred(),second=deferred();
    const opened=h.api.openMergedManuscriptBrowserPanel({}, {}, {onPreview:p=>p.order===1?first.promise:second.promise});
    const a=h.receive({type:"requestRealPrintPreview",requestId:1,payload:{order:1}});
    const b=h.receive({type:"requestRealPrintPreview",requestId:2,payload:{order:2}});
    second.resolve({html:"新しい結果"});await b;
    if(fail)first.reject(Error("古い失敗"));else first.resolve({html:"古い結果"});
    await a;assert.equal(h.messages.length,1);assert.equal(h.messages[0].requestId,2);
    h.panel.dispose();await opened;
  }
});

test("保存待ちを含め書き出し中の重複要求を防ぎ、完了後は再実行できる", async () => {
  const h=loadPanel(),gate=deferred();let writes=0,submits=0;
  const context={workspaceState:{get:()=>({}),update:async()=>{writes++;await gate.promise;}}};
  const opened=h.api.openMergedManuscriptBrowserPanel(context,{}, {onSubmit:async()=>{submits++;}});
  const first=h.receive({type:"submit"});await h.receive({type:"submit"});
  assert.equal(writes,1);assert.equal(submits,0);
  gate.resolve();await first;assert.equal(submits,1);assert.equal(h.messages.length,1);
  await h.receive({type:"submit"});assert.equal(submits,2);assert.equal(writes,2);
  h.panel.dispose();await opened;
});

test("設定保存の待機中に閉じた場合、書き出し処理を開始しない", async () => {
  const h=loadPanel(),gate=deferred();let submits=0;
  const context={workspaceState:{get:()=>({}),update:()=>gate.promise}};
  const opened=h.api.openMergedManuscriptBrowserPanel(context,{}, {onSubmit:async()=>{submits++;}});
  const pending=h.receive({type:"submit"});h.panel.dispose();await opened;
  gate.resolve();await pending;
  assert.equal(submits,0);assert.equal(h.messages.length,0);
});

test("書き出し前の設定保存が失敗しても失敗応答を返し、再試行できる", async () => {
  const h=loadPanel();let fail=true,submits=0;
  const context={workspaceState:{get:()=>({}),update:async()=>{if(fail)throw Error("設定の保存失敗");}}};
  const opened=h.api.openMergedManuscriptBrowserPanel(context,{}, {onSubmit:async()=>{submits++;}});
  await h.receive({type:"submit"});assert.equal(submits,0);
  assert.equal(h.messages[0].ok,false);assert.match(h.messages[0].message,/設定の保存失敗/);
  fail=false;await h.receive({type:"submit"});assert.equal(submits,1);assert.equal(h.messages[1].ok,true);
  h.panel.dispose();await opened;
});

test("書き出し開始後に閉じても処理完了を待ち、結果を閉じた画面へ返さない", async () => {
  const h=loadPanel(),gate=deferred(),started=deferred();
  const opened=h.api.openMergedManuscriptBrowserPanel({}, {}, {onSubmit:()=>{started.resolve();return gate.promise;}});
  const pending=h.receive({type:"submit"});await started.promise;
  h.panel.dispose();await opened;
  const reopened=h.api.openMergedManuscriptBrowserPanel();
  gate.resolve({message:"完了"});await pending;
  assert.equal(h.messages.length,0);assert.equal(h.panel.disposed,false);
  h.panel.dispose();await reopened;
});

test("画面操作中の保存失敗を通知し、閉じた後の失敗は通知しない", async () => {
  const h=loadPanel(),gate=deferred();let delayed=false;
  const context={workspaceState:{get:()=>({}),update:()=>delayed?gate.promise:Promise.reject(Error("保存できない"))}};
  const opened=h.api.openMergedManuscriptBrowserPanel(context);
  await h.receive({type:"persistUiState"});assert.equal(h.warnings.length,1);assert.match(h.warnings[0],/保存できない/);
  delayed=true;const pending=h.receive({type:"persistUiState"});h.panel.dispose();await opened;
  gate.reject(Error("閉じた後の失敗"));await pending;assert.equal(h.warnings.length,1);
});

test("初期HTMLの生成に失敗したパネルを片付け、次の起動を妨げない", async () => {
  const h=loadPanel(),cyclic={};cyclic.self=cyclic;
  await assert.rejects(h.api.openMergedManuscriptBrowserPanel({}, {simpleSavedByLayout:cyclic}),/circular/i);
  assert.equal(h.panel.disposed,true);assert.equal(h.api.revealMergedManuscriptBrowserPanel(),false);
  const opened=h.api.openMergedManuscriptBrowserPanel();assert.equal(h.panels.length,2);
  h.panel.dispose();await opened;
});

test("返信のPromiseが失敗しても未処理の例外を残さず、次の要求を処理できる", async () => {
  const h=loadPanel();const opened=h.api.openMergedManuscriptBrowserPanel({}, {}, {onPreview:async()=>({html:"本文"})});
  h.panel.postError=true;await h.receive({type:"requestRealPrintPreview",requestId:1});
  assert.equal(h.logs.length,1);
  h.panel.postError=false;await h.receive({type:"requestRealPrintPreview",requestId:2});
  assert.equal(h.messages.at(-1).requestId,2);assert.equal(h.messages.at(-1).ok,true);
  h.panel.dispose();await opened;
});

test("章変更の遅い応答・閉じた後の応答を捨て、入力エラーで待機を続けない", () => {
  const html=loadPanel().api.html({});
  const script=html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
  const requests=script.slice(script.indexOf("    function requestRealPrintPreview()"),script.indexOf("    function resetToDefaults()"));
  const result=script.slice(script.indexOf('      if (type === "realPrintPreviewResult")'),script.indexOf('      if (type === "submitResult")'));
  const messages=[], errors=[];
  const frame={srcdoc:""},meta={textContent:""},select={value:"第1章"};
  let hidden=false, fail=false, loading=false;
  const runtime=vm.createContext({
    realPreviewRefreshTimerId:null, realPreviewRequestId:0,
    realPreviewFrameEl:frame, realPreviewMetaEl:meta, previewChapterSelectEl:select, realPreviewTitleEl:{},
    realPreviewOverlayEl:{classList:{contains:() => hidden, add:() => {hidden=true;}}},
    showError:e => errors.push(e),clearRealPreviewFrame:() => {frame.srcdoc="";},
    setRealPreviewLoading:v => {loading=v;}, collectPayload:() => {if(fail) throw Error("入力を確認");return {exportMode:"simple"};},
    vscode:{postMessage:m => messages.push(m)},clearTimeout() {}, requestAnimationFrame:fn => fn(),fitRealPreviewFrameToPage() {},
  });
  vm.runInContext(requests + '\nfunction deliver(message) { const type=message.type;\n' + result + '\n}',runtime);
  vm.runInContext("requestRealPrintPreview()",runtime);
  select.value="第2章";
  vm.runInContext("requestRealPrintPreview()",runtime);
  assert.equal(messages[1].payload.previewChapterId,"第2章");
  runtime.message={type:"realPrintPreviewResult",requestId:messages[1].requestId,ok:true,html:"第2章"};
  vm.runInContext("deliver(message)",runtime); assert.equal(frame.srcdoc,"第2章");
  runtime.message={...runtime.message,requestId:messages[0].requestId,html:"第1章"};
  vm.runInContext("deliver(message)",runtime); assert.equal(frame.srcdoc,"第2章");
  vm.runInContext("closeRealPreview()",runtime);
  runtime.message={...runtime.message,requestId:messages[1].requestId,html:"古い結果"};
  vm.runInContext("deliver(message)",runtime); assert.equal(frame.srcdoc,"第2章");
  hidden=false; fail=true;
  vm.runInContext("requestRealPrintPreview()",runtime);
  assert.equal(loading,false); assert.equal(errors.at(-1),"入力を確認");
});
