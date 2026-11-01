import test from "node:test";
import assert from "node:assert/strict";
import { createViewNavigationController } from "../web/lib/view-navigation.mjs";
function harness({ discard = true, document, setTimeout, clearTimeout } = {}) {
 const work={id:"work",name:"作品",title:"作品",folder:{id:"work",folder:{}},mojigoto:{id:"meta"},manuscript:{id:"manuscript",folder:{}}};
 const state={provider:{},works:[work],selectedWork:work,viewRoutes:new Map(),navigationDestination:"reference",navigationDetailEditor:false,dirty:false};
 const calls={history:[],load:[],notify:[],shell:0,cancel:0,finish:0,reset:0,forward:0},frames=[];
 const elements={readerContent:{scrollTop:17,selectionStart:3,selectionEnd:8,setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}}};
 const history={state:null,replaceState(value){calls.history.push(["replace",value]);this.state=value;},pushState(value){calls.history.push(["push",value]);this.state=value;},forward(){calls.forward++;}};
 const window={scrollY:90,scrollTo({top}){this.scrollY=top;}};
 state.provider.getItemMetadata=async item=>{calls.load.push(["metadata",item.id]);return{eTag:"latest"};};
 const controller=createViewNavigationController({state,elements,history,window,document,setTimeout,clearTimeout,requestAnimationFrame:cb=>frames.push(cb),updateShellContext(){calls.shell++;},recordRecentView:route=>calls.load.push(["recent",route.kind]),resetReaderNoteReference(){calls.reset++;},showWorksHome:()=>calls.load.push(["home"]),showManuscriptRouteLoading:()=>calls.load.push(["manuscript-loading"]),showNoteEditorLoading:()=>calls.load.push(["note-loading"]),openManuscriptFolder:async(...args)=>calls.load.push(["manuscript-list",...args]),openFile:async item=>calls.load.push(["file",item]),openNotes:async type=>calls.load.push(["notes",type]),openNote:async entry=>calls.load.push(["note",entry]),openConceptMemos:async options=>{calls.load.push(["concept-list",options]);state.conceptDocument={memos:[{id:"memo"}]};},openConceptMemo:(id,options)=>calls.load.push(["concept",id,options]),openWorkSettings:async()=>calls.load.push(["settings"]),canDiscardDraft:()=>discard,cancelAutoSave(){calls.cancel++;},notify:(...args)=>calls.notify.push(args),finishViewRestoreLoading(){calls.finish++;}});
 return{state,work,elements,history,window,calls,flushFrames:()=>{while(frames.length)frames.shift()();},...controller};
}
test("画面移動時に元のスクロールと選択位置を保存し移動先だけ履歴へ追加する",()=>{
 const h=harness();h.history.state={custom:"keep",mojigotoRoute:{kind:"manuscript-file",workId:"work",item:{id:"first"}}};
 h.commitRoute({kind:"note-editor",workId:"work",noteType:"plot",item:{id:"note"}});
 assert.equal(h.calls.history[0][0],"replace");assert.equal(h.calls.history[0][1].custom,"keep");
 assert.deepEqual(h.calls.history[0][1].mojigotoRoute.position,{windowScrollY:90,editorScrollTop:17,selectionStart:3,selectionEnd:8});
 assert.equal(h.calls.history[1][0],"push");assert.equal(h.state.viewRoutes.get("work:manuscript").item.id,"first");
 assert.equal(h.state.viewRoutes.get("work:plot").item.id,"note");
 h.calls.history.length=0;h.commitRoute({kind:"note-editor",workId:"work",noteType:"plot",item:{id:"note"}});
 assert.ok(h.calls.history.every(([kind])=>kind==="replace"));
});
test("復元中に画面が呼ぶ履歴記録では新しいブラウザ履歴を追加しない",()=>{
 const h=harness();h.state.navigationRestoring=true;h.commitRoute({kind:"settings",workId:"work"});
 assert.equal(h.calls.history.length,0);assert.equal(h.calls.shell,1);
});
for(const kind of ["manuscript-list","manuscript-file","notes-list","note-editor","concept-list","concept-editor","settings"]){
 test(kind+"をブラウザ履歴から対応する画面へ復元する",async()=>{
  const h=harness(),route={kind,workId:"work",folder:h.work.manuscript,trail:[h.work.manuscript],item:{id:"file",eTag:"old"},memoId:"memo",noteType:"reference",position:{windowScrollY:44,editorScrollTop:33,selectionStart:2,selectionEnd:5}};
  await h.restoreRoute(route,{fromHistory:true});h.flushFrames();
  const expected={"manuscript-list":"manuscript-list","manuscript-file":"file","notes-list":"notes","note-editor":"note","concept-list":"concept-list","concept-editor":"concept","settings":"settings"}[kind];
  assert.ok(h.calls.load.some(([type])=>type===expected));assert.equal(h.calls.history.length,0);
  assert.equal(h.state.navigationRestoring,false);assert.equal(h.state.navigationDestination,"reference");assert.equal(h.state.navigationDetailEditor,false);assert.equal(h.window.scrollY,44);
  if(kind==="manuscript-file"){assert.equal(h.calls.load.find(([type])=>type==="file")[1].eTag,"latest");assert.equal(h.elements.readerContent.scrollTop,33);assert.equal(h.elements.readerContent.selectionStart,2);assert.equal(h.elements.readerContent.selectionEnd,5);}
  if(kind==="note-editor")assert.equal(h.state.noteType,"reference");
 });
}
test("作品一覧にない保存済み参照から別作品へ切り替え編集用状態を初期化する",async()=>{
 const h=harness(),other={id:"other",folder:{id:"other",folder:{}},mojigoto:{id:"other-meta"}};h.state.conceptDocument={old:true};h.state.notes=[{}];h.state.manuscriptBackupStorage={old:true};
 assert.equal(await h.selectRouteWork({workId:"other",work:other}),true);assert.equal(h.state.selectedWork,other);assert.equal(h.state.conceptDocument,null);assert.deepEqual(h.state.notes,[]);assert.equal(h.state.manuscriptBackupStorage,null);assert.equal(h.calls.reset,1);
 assert.equal(await h.selectRouteWork({workId:"missing",work:{id:"other"}}),false);
});
test("復元の通信失敗でも復元中フラグと一時的な表示先を解除する",async()=>{
 const h=harness();h.state.provider.getItemMetadata=async()=>{throw new Error("offline");};
 await assert.rejects(h.restoreRoute({kind:"manuscript-file",workId:"work",item:{id:"file"}}),/offline/);
 assert.equal(h.state.navigationRestoring,false);assert.equal(h.state.navigationDestination,"reference");assert.equal(h.state.navigationDetailEditor,false);assert.equal(h.calls.history.length,0);
});
test("未保存の編集を破棄しない場合の戻る操作は画面復元を実行しない",()=>{
 const h=harness({discard:false});h.state.dirty=true;h.handlePopState({state:{mojigotoRoute:{kind:"settings",workId:"work"}}});
 assert.equal(h.calls.forward,1);assert.equal(h.calls.cancel,0);assert.equal(h.state.dirty,true);assert.equal(h.calls.load.length,0);
});
test("許可された戻る操作は自動保存予約を取り消し履歴を増やさず復元する",async()=>{
 const h=harness();h.state.dirty=true;h.handlePopState({state:{mojigotoRoute:{kind:"settings",workId:"work"}}});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(h.calls.cancel,1);assert.equal(h.state.dirty,false);assert.equal(h.calls.history.length,0);assert.ok(h.calls.load.some(([type])=>type==="settings"));
});
test("再読み込み時の作品参照が消えていたら作品一覧へ履歴を置き換える",()=>{
 const h=harness();h.history.state={mojigotoRoute:{kind:"settings",workId:"deleted"}};h.initializeViewHistory();
 assert.equal(h.calls.finish,1);assert.equal(h.history.state.mojigotoRoute.kind,"works");assert.ok(h.calls.history.every(([type])=>type==="replace"));
});
test("作品内メニューは記憶した編集画面を復元し一時的な移動先を残さない",async()=>{
 const h=harness();h.state.viewRoutes.set("work:settings",{kind:"settings",workId:"work"});
 await h.navigateWorkDestination("settings");assert.ok(h.calls.load.some(([type])=>type==="settings"));
 assert.equal(h.state.navigationDestination,"reference");
 const fresh=harness();await fresh.navigateWorkDestination("plot");assert.equal(fresh.state.navigationDestination,"");assert.ok(fresh.calls.load.some(([type])=>type==="notes"));
});

test("移動せずカーソルを変えた場合も現在の履歴へ位置を保存する",()=>{
 const h=harness();h.state.navigationDestination="";h.state.currentFile={id:"file"};h.elements.readerSection={hidden:false};
 h.history.state={mojigotoRoute:{kind:"manuscript-file",workId:"work",item:{id:"file"},position:{windowScrollY:0}}};
 h.rememberCurrentRoutePosition();const position=h.history.state.mojigotoRoute.position;
 assert.equal(position.selectionStart,3);assert.equal(position.selectionEnd,8);assert.equal(position.editorScrollTop,17);assert.equal(position.windowScrollY,90);
});
test("移動先を先頭へ初期化しても保存した元の位置で履歴を上書きしない",()=>{
 const h=harness(),position={windowScrollY:230,selectionStart:80,selectionEnd:90,editorScrollTop:150};
 h.history.state={mojigotoRoute:{kind:"manuscript-file",workId:"work",item:{id:"first"},position}};
 h.elements.readerContent.selectionStart=0;h.elements.readerContent.selectionEnd=0;h.elements.readerContent.scrollTop=0;h.window.scrollY=0;
 h.commitRoute({kind:"manuscript-file",workId:"work",item:{id:"second"}});
 assert.deepEqual(h.calls.history[0][1].mojigotoRoute.position,position);
});
test("同じ画面を再記録しても保存済みの復元位置を先頭に戻さない",()=>{
 const h=harness(),position={windowScrollY:80,selectionStart:40,selectionEnd:40};
 h.history.state={mojigotoRoute:{kind:"manuscript-file",workId:"work",item:{id:"file"},position}};
 h.commitRoute({kind:"manuscript-file",workId:"work",item:{id:"file"}});assert.deepEqual(h.history.state.mojigotoRoute.position,position);
});
test("選択設定で内部スクロールが変わる場合も保存したスクロールを最後に戻す",()=>{
 const h=harness();h.elements.readerContent.setSelectionRange=function(start,end){this.selectionStart=start;this.selectionEnd=end;this.scrollTop=999;};
 h.restoreRoutePosition({kind:"manuscript-file",position:{selectionStart:30,selectionEnd:35,editorScrollTop:77}});h.flushFrames();assert.equal(h.elements.readerContent.scrollTop,77);
});
function fieldHarness(kind){
 const document={activeElement:null,getElementById:id=>field.id===id?field:null};
 const h=harness({document});h.state.navigationDestination="";
 const section={contains:node=>node===field,querySelectorAll:()=>[field]};
 const details={tagName:"DETAILS",open:false,parentElement:section};
 const field={id:kind==="concept-editor"?"conceptMemoBodyInput":"",dataset:kind==="note-editor"?{groupIndex:"0",itemIndex:"0",noteField:"entry-memo"}:{},selectionStart:21,selectionEnd:24,scrollTop:88,parentElement:details,value:"PRIVATE-CONTENT",focus(){document.activeElement=this;},setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;},getBoundingClientRect:()=>({top:120})};
 document.activeElement=field;
 if(kind==="note-editor"){h.elements.noteEditorSection=section;h.state.currentNote={data:{groups:[{id:"g",items:[{id:"i"}]}]}};}else h.elements.conceptMemoEditorSection=section;
 h.history.state={mojigotoRoute:{kind,workId:"work",item:{id:"note"},memoId:"memo"}};
 return{...h,field,document,details};
}
for(const kind of ["note-editor","concept-editor"]){
 test(kind+"の保存済み位置を本文を含めず記録し復元する",()=>{
  const h=fieldHarness(kind);h.rememberCurrentRoutePosition();const route=structuredClone(h.history.state.mojigotoRoute);
  assert.doesNotMatch(JSON.stringify(route.position),/PRIVATE-CONTENT/);
  h.field.selectionStart=0;h.field.selectionEnd=0;h.field.scrollTop=0;h.document.activeElement=null;
  h.restoreRoutePosition(route);h.flushFrames();assert.equal(h.field.selectionStart,21);assert.equal(h.field.selectionEnd,24);assert.equal(h.field.scrollTop,88);assert.equal(h.document.activeElement,h.field);
  if(kind==="note-editor")assert.equal(h.details.open,true);
 });
}
test("ノート項目の順番が変わってもIDで保存した入力欄を見つける",()=>{
 const h=fieldHarness("note-editor");h.rememberCurrentRoutePosition();const route=structuredClone(h.history.state.mojigotoRoute);
 h.state.currentNote.data.groups[0].items.unshift({id:"other"});h.field.dataset.itemIndex="1";h.field.selectionStart=0;
 h.restoreRoutePosition(route);h.flushFrames();assert.equal(h.field.selectionStart,21);
});
test("構想の履歴復元では先頭へ戻す遅延処理を開始しない",async()=>{
 const h=harness();await h.restoreRoute({kind:"concept-editor",workId:"work",memoId:"memo"},{fromHistory:true});
 assert.deepEqual(h.calls.load.find(([kind])=>kind==="concept")[2],{resetScroll:false});
});
test("位置保存の失敗や別ファイルの読込中でも編集中の状態を壊さない",()=>{
 const h=harness();h.state.navigationDestination="";h.state.currentFile={id:"file"};h.elements.readerSection={hidden:false};h.history.state={mojigotoRoute:{kind:"manuscript-file",item:{id:"file"}}};
 h.history.replaceState=()=>{throw new Error("unavailable");};assert.doesNotThrow(()=>h.rememberCurrentRoutePosition());
 h.state.currentFile={id:"other"};assert.doesNotThrow(()=>h.rememberCurrentRoutePosition());
});
test("頻繁な位置変更はまとめて保存し、離脱直前の保存は待たずに行う",()=>{
 const timers=new Map();let id=0;
 const h=harness({setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:key=>timers.delete(key)});
 h.state.navigationDestination="";h.history.state={mojigotoRoute:{kind:"concept-list"}};
 h.scheduleRoutePositionCapture();h.scheduleRoutePositionCapture();assert.equal(timers.size,1);
 h.rememberCurrentRoutePosition();assert.equal(timers.size,0);assert.equal(h.history.state.mojigotoRoute.position.windowScrollY,90);
});
