import { discoverWorkCatalog } from "../web/lib/catalog-delta.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { discoverWorks } from "../web/lib/work-discovery.mjs";

const app = fs.readFileSync(new URL("../web/app.mjs", import.meta.url), "utf8");
function source(name) {
  const start = new RegExp(`^(?:async )?function ${name}\\(`,"m").exec(app).index;
  const rest = app.slice(start);
  return rest.slice(0, /\r?\n}\r?\n/.exec(rest).index + 3);
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes,no) => { resolve=yes; reject=no; });
  return {promise,resolve,reject};
}
function fixture({ cached = true, pendingRoute = false } = {}) {
  const discovery = deferred(), metrics = deferred();
  const calls = {renders:[],history:0,persist:[],notices:[],samples:[]};
  const cachedWork = {id:"work",title:"保存済み作品",status:"draft"};
  const state = {provider:{},cloudKind:"oneDrive",worksLoadToken:0,workMetricsLoadToken:0,workMetricsEnabled:true,
    workSettingsSummaries:new Map(),workSharedMetrics:new Map(),works:[],historyInitialized:false};
  const element=()=>({hidden:false,disabled:false,textContent:"",classList:{remove(){}},lastElementChild:{textContent:""}});
  const elements = Object.fromEntries(["workSortField","workSortDirection","workMetricsToggle","connectionPanel","browserSection","filesSection","notesSection","noteEditorSection","worksSection","workRootLabel","worksLoadingStatus","worksCount","worksList"].map(k=>[k,element()]));
  let owner="owner";
  const context = vm.createContext({state,elements,
    discoverWorkCatalog, readWorkCatalogDelta:()=>null,
    readWorkCatalog:()=>cached?[cachedWork]:null,
    beginPerformanceMeasurement:label=>extra=>calls.samples.push({label,...extra}),
    workCatalogOwner:()=>owner,rootStorageKey:()=>"root",localStorage:{setItem(){}},
    history:{state:pendingRoute?{mojigotoRoute:{kind:"note-editor",workId:"work"}}:null},
    isRestorableWorkSnapshot:()=>false,hasPendingInitialViewRestore:()=>pendingRoute,
    showInitialViewRestoreLoading(){},hideConceptViews(){},renderInputAssistVisibility(){},cloudLabel:()=>"OneDrive",
    showEmpty:(el,text)=>{el.textContent=text;},setListCount(){},
    renderWorksList:()=>calls.renders.push(state.works.map(work=>work.title)),
    initializeViewHistory:()=>{calls.history++;state.historyInitialized=true;},finishViewRestoreLoading(){},
    discoverWorks:()=>discovery.promise,loadWorkMetrics:async(_works,_token,{onStableDisplay})=>{await metrics.promise;onStableDisplay();},
    persistWorkSettingsSummaries(){},persistWorkSharedMetrics(){},
    persistWorkCatalog:(root,works)=>calls.persist.push({root:root.id,works:works.map(w=>w.id)}),
    basicWorkMetrics:()=>({skipped:true}),notify:(text)=>calls.notices.push(text),
  });
  vm.runInContext(source("loadWorks"),context);
  return {state,elements,context,calls,discovery,metrics,cachedWork,setOwner(value){owner=value;}};
}

test("保存済み一覧は作品再取得や集計を待たずに表示し、先行表示を記録する",async()=>{
  const f=fixture();
  const loading=f.context.loadWorks({id:"root",name:"作品"});
  assert.deepEqual(f.calls.renders,[["保存済み作品"]]);
  assert.equal(f.state.worksOrderPending,false);
  assert.equal(f.calls.history,1);
  assert.ok(f.calls.samples.some(s=>s.source==="cache"));
  f.state.selectedWork=f.cachedWork;
  f.elements.worksSection.hidden=true;
  f.state.currentNote={raw:"保存済み",data:{body:"未保存の本文"}};
  f.state.dirty=true;
  f.discovery.resolve([{id:"work",title:"最新作品"}]);
  f.metrics.resolve();await loading;
  assert.equal(f.calls.history,1,"バックグラウンド完了で編集画面の履歴を一覧へ戻さない");
  assert.equal(f.elements.worksSection.hidden,true);
  assert.equal(f.state.currentNote.data.body,"未保存の本文");
  assert.equal(f.state.currentNote.raw,"保存済み");
  assert.equal(f.state.dirty,true);
});

test("キャッシュなしや前回の編集画面を復元する場合は仮のキャッシュ一覧を表示しない",async()=>{
  for(const options of [{cached:false},{pendingRoute:true}]) {
    const f=fixture(options);
    const loading=f.context.loadWorks({id:"root"});
    assert.equal(f.calls.renders.length,0);
    assert.equal(f.calls.history,0);
    f.discovery.resolve([{id:"work",title:"最新作品"}]);f.metrics.resolve();await loading;
    assert.equal(f.calls.history,1);
    assert.ok(!f.calls.samples.some(s=>s.source==="cache"));
  }
});

test("先行一覧の再取得に失敗しても一覧と下書きを残し、エラーを通知する",async()=>{
  const f=fixture();const loading=f.context.loadWorks({id:"root"});
  f.state.dirty=true;
  f.discovery.reject(new Error("通信失敗"));await loading;
  assert.equal(f.state.works[0].title,"保存済み作品");
  assert.equal(f.state.dirty,true);
  assert.equal(f.elements.workSortField.disabled,false);
  assert.match(f.elements.worksLoadingStatus.lastElementChild.textContent,/前回の一覧/);
  assert.deepEqual(f.calls.notices,["通信失敗"]);
  assert.equal(f.calls.persist.length,0,"取得失敗を空の最新カタログとして保存しない");
});

for(const change of ["provider","owner","root"]) {
  test(`一覧取得中に${change}が変わったら古い結果を描画・保存しない`,async()=>{
    const f=fixture();const loading=f.context.loadWorks({id:"root"});
    if(change==="provider")f.state.provider={};
    if(change==="owner")f.setOwner("other");
    if(change==="root")f.state.workRoot={id:"other-root"};
    f.state.works=[{id:"other",title:"移動先"}];
    f.discovery.resolve([{id:"old",title:"古い結果"}]);await loading;
    assert.equal(f.state.works[0].title,"移動先");
    assert.equal(f.calls.persist.length,0);
    assert.equal(f.calls.renders.length,1);
  });
}

test("集計待ちの間に新しい一覧へ移動したら古いカタログを保存しない",async()=>{
  const f=fixture();const loading=f.context.loadWorks({id:"root"});
  f.discovery.resolve([{id:"work",title:"最新作品"}]);
  await new Promise(resolve=>setImmediate(resolve));
  const persisted=f.calls.persist.length;
  f.state.worksLoadToken++;
  f.state.workMetricsLoadToken++;
  f.state.workRoot={id:"other"};f.state.works=[{id:"other"}];
  f.metrics.resolve();await loading;
  assert.equal(f.calls.persist.length,persisted);
});

test("集計の一括取得失敗後にクラウドが変わっていたら新しいプロバイダーで再試行しない",async()=>{
  const pending=deferred();let fallback=0;
  const state={provider:{},workMetricsEnabled:true,workMetricsLoadToken:1,workMetricSummaries:new Map()};
  const context=vm.createContext({state,elements:{workSortField:{value:"updatedAt"},worksLoadingStatus:{hidden:true,lastElementChild:{}}},
    beginPerformanceMeasurement:()=>()=>{},workMetricSummaryKey:()=>"",collectWorkIndexes:()=>pending.promise,collectWorkIndex:()=>{fallback++;},
  });
  vm.runInContext(source("loadWorkMetrics"),context);
  const loading=context.loadWorkMetrics([{id:"work"}],1);
  state.provider={};pending.reject(new Error("切替前の失敗"));await loading;
  assert.equal(fallback,0);
});

test("Single作品の原稿フォルダを作品候補のために余分に取得しない",async()=>{
  const reads=[],phases=[];
  const provider={listChildren:async id=>{reads.push(id);if(id==="root")return [{id:"meta",name:".mojigoto",folder:{}},{id:"text",name:"manuscript",folder:{}}];if(id==="meta")return [];throw Error("原稿の内容一覧は作品検出には不要");}};
  const works=await discoverWorks(provider,{id:"root",name:"作品"},{measure:label=>()=>phases.push(label)});
  assert.deepEqual(reads,["root","meta"]);
  assert.equal(works[0].manuscript.id,"text");
  assert.deepEqual(phases,["作品検出・ルート一覧","作品検出・子フォルダ一覧","作品検出・管理フォルダ一覧","作品検出・設定と共有集計"]);
});

test("接続段階の計測は結果を変えず、失敗時もトークンや本文を記録しない",async()=>{
  const samples=[];
  const context=vm.createContext({beginPerformanceMeasurement:label=>details=>samples.push({label,...details})});
  vm.runInContext(source("measureConnectionStep"),context);
  assert.equal(await context.measureConnectionStep("認証",async()=>"secret-token"),"secret-token");
  await assert.rejects(context.measureConnectionStep("設定",async()=>{throw Error("secret-body");}),/secret-body/);
  assert.equal(samples.length,2);
  assert.equal(samples[1].failed,true);
  assert.doesNotMatch(JSON.stringify(samples),/secret/);
});

test("壊れた一覧キャッシュや別利用者・別ルートの一覧を先行表示へ使わない",()=>{
  let catalog={schemaVersion:2,owner:"owner",rootId:"root",works:[null]};
  const context=vm.createContext({readJson:value=>JSON.parse(value),localStorage:{getItem:()=>JSON.stringify(catalog)},workCatalogStorageKey:()=>"catalog",workCatalogOwner:()=>"owner"});
  vm.runInContext(source("readWorkCatalog"),context);
  assert.equal(context.readWorkCatalog({id:"root"}),null);
  catalog.works=[{id:"work",folder:{id:"work"},title:["不正なタイトル"]}];
  assert.equal(context.readWorkCatalog({id:"root"}),null);
  catalog.works=[{id:"work",folder:{id:"work"},title:"作品"}];
  assert.equal(context.readWorkCatalog({id:"root"}).length,1);
  assert.equal(context.readWorkCatalog({id:"other-root"}),null);
  catalog.owner="other";assert.equal(context.readWorkCatalog({id:"root"}),null);
});

test("フォルダ選択へ移動したら取得中の作品一覧と集計を無効にする",async()=>{
  const pending=deferred();
  const state={worksLoadToken:3,workMetricsLoadToken:5,worksOrderPending:true,folderTrail:[],provider:{listChildren:()=>pending.promise}};
  const el=()=>({hidden:false});
  const elements=Object.fromEntries(["browserSection","worksSection","filesSection","readerSection","notesSection","noteEditorSection","folderList","breadcrumbs"].map(key=>[key,el()]));
  const context=vm.createContext({state,elements,hideConceptViews(){},renderInputAssistVisibility(){},showEmpty(){},sortDriveItems:()=>[],cloudLabel:()=>"OneDrive",document:{createElement:()=>({addEventListener(){}})}});
  vm.runInContext(source("showFolder"),context);
  const loading=context.showFolder({id:"root"},[]);
  assert.equal(state.worksLoadToken,4);assert.equal(state.workMetricsLoadToken,6);assert.equal(state.worksOrderPending,false);
  elements.breadcrumbs.replaceChildren=()=>{};
  pending.resolve([]);await loading;
});
