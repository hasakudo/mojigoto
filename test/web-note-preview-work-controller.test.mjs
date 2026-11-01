import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { createNotePreviewWorkController } from "../web/lib/note-preview-work-controller.mjs";
import { referenceWorkKey } from "../web/lib/shared-note-reader.mjs";
const app = await readFile(new URL("../web/app.mjs", import.meta.url), "utf8");
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
function fn(name) {
  const start = new RegExp(`^(?:async )?function ${name}\\(`,"m").exec(app).index;
  const end = /\r?\n}\r?\n/.exec(app.slice(start)); return app.slice(start,start+end.index+end[0].length);
}
function fixture() {
  const node=()=>({value:"",open:false,disabled:false,textContent:"",children:[],options:[],listeners:{},scrollTop:0,
    classList:{toggle(){}},replaceChildren(...children){this.children=children;this.options=children;},
    addEventListener(type,callback){this.listeners[type]=callback;},setAttribute(name,value){(this.attributes ||= {})[name]=value;},querySelectorAll(){return [];},
    show(){this.open=true;},close(){this.open=false;this.listeners.close?.();}});
  const elements=Object.fromEntries(["notePreviewOptions", "notePreviewOptionsLoading", "notePreviewSelectionSummary", "notePreviewSourceLoading","notePreviewSourceLoadingHelp","notePreviewWorkSelect","notePreviewReferenceStatus","notePreviewTypeSelect","notePreviewSelect","notePreviewDialog","notePreviewContent","notePreviewTitle","notePreviewHelp","noteToc","noteTocToggle","notePreviewButton","closeNotePreviewButton"].map(id=>[id,node()]));
  elements.notePreviewTypeSelect.options=[{value:"current"},{value:"plot"},{value:"reference"}];
  const a={id:"a",title:"作品A"},b={id:"b",title:"作品B"};
  const sources=[{work:a,key:referenceWorkKey(a),relation:"current"},{work:b,key:referenceWorkKey(b),relation:"mutual"}];
  const note={item:{id:"same-id"},data:{title:"未保存の下書き",type:"plot",groups:[]}};
  const state={provider:{},works:[a,b],selectedWork:a,cloudKind:"oneDrive",noteType:"plot",currentNote:note,dirty:true,originalContent:"保存前",notePreviewOwner:null,notePreviewLoadToken:0,notePreviewEntries:[],notePreviewReferenceId:""};
  let scope="account/root",reads=0;const rendered=[];
  const options={state,elements,Option:class {constructor(text,value){Object.assign(this,{text,value});}},scopeKey:()=>scope,
    showLoading:(el,text)=>{el.textContent=text;},showEmpty:(el,text)=>{el.textContent=text;},
    readSources:async()=>({sources,notice:""}),readNotes:async(ctx,source,type)=>{reads++;return [{item:{id:"same-id",name:"note.json"},data:{title:source.work.title+type},referenceKey:JSON.stringify([source.key,type,"same-id"])}];}};
  const context={state,elements,Option:options.Option,showLoading:options.showLoading,showEmpty:options.showEmpty,
    renderReaderNoteReference:entry=>{rendered.push(entry);elements.notePreviewContent.textContent=entry?.data?.title||"";},
    makeElement:()=>node(),loadNoteEntriesForType:async()=>[],sortNoteEntries:entries=>entries};
  vm.createContext(context);
  vm.runInContext(["readerNoteReferenceKey","isNotePreviewOwnerCurrent","renderNotePreviewReference","loadNotePreviewReferences","openNotePreview"].map(fn).join("\n"),context);
  Object.assign(options,{isNotePreviewOwnerCurrent:context.isNotePreviewOwnerCurrent,openNotePreview:context.openNotePreview,renderNotePreviewReference:context.renderNotePreviewReference});
  const controller=createNotePreviewWorkController(options);context.notePreviewWorkController=controller;
  const start=app.indexOf('elements.notePreviewWorkSelect?.addEventListener');
  vm.runInContext(app.slice(start,app.indexOf('elements.closeAddressBookButton.addEventListener',start)),context);
  return {state,elements,options,sources,note,context,controller,rendered,setScope:value=>{scope=value;},get reads(){return reads;},
    async open(){context.openNotePreview();await tick();},choose(index){elements.notePreviewWorkSelect.value=sources[index].key;controller.chooseSource();},
    type(value){elements.notePreviewTypeSelect.value=value;elements.notePreviewTypeSelect.listeners.change();}};
}
test("候補の確認中も編集中を表示し、関連参照と自作品への復帰で下書き・保存先を変えない",async()=>{
  const h=fixture(),waiting=deferred();h.options.readSources=()=>waiting.promise;
  // Recreate to inject the deferred source reader before opening.
  h.context.notePreviewWorkController=createNotePreviewWorkController({...h.options,isNotePreviewOwnerCurrent:h.context.isNotePreviewOwnerCurrent,openNotePreview:h.context.openNotePreview,renderNotePreviewReference:h.context.renderNotePreviewReference});
  h.context.openNotePreview();assert.equal(h.elements.notePreviewDialog.open,true);assert.equal(h.elements.notePreviewTitle.textContent,"未保存の下書き");assert.equal(h.reads,0);
  waiting.resolve({sources:h.sources,notice:""});await tick();
  h.elements.notePreviewWorkSelect.value=h.sources[1].key;h.context.notePreviewWorkController.chooseSource();await tick();
  assert.equal(h.elements.notePreviewTypeSelect.value,"plot");assert.equal(h.elements.notePreviewTypeSelect.options[0].disabled,true);
  assert.equal(h.rendered.at(-1).data.title,"作品Bplot");assert.match(h.elements.notePreviewReferenceStatus.textContent,/作品B（読み取り専用）/);
  h.elements.notePreviewWorkSelect.value=h.sources[0].key;h.context.notePreviewWorkController.chooseSource();
  assert.equal(h.elements.notePreviewTypeSelect.value,"current");assert.equal(h.elements.notePreviewTitle.textContent,"未保存の下書き");
  assert.equal(h.state.currentNote,h.note);assert.equal(h.state.selectedWork,h.sources[0].work);assert.equal(h.state.dirty,true);assert.equal(h.state.originalContent,"保存前");
});
test("参照中の編集・保存描画では参照元・本文・表示位置を保つ",async()=>{
  const h=fixture();await h.open();h.choose(1);await tick();const before=h.reads;
  h.elements.notePreviewContent.scrollTop=90;h.note.data.title="追加入力";h.context.openNotePreview({refresh:true});
  assert.equal(h.elements.notePreviewWorkSelect.value,h.sources[1].key);assert.equal(h.elements.notePreviewContent.scrollTop,90);assert.equal(h.reads,before);assert.equal(h.elements.notePreviewTitle.textContent,"作品Bplot");
});
for(const change of ["source","type","close","work","provider","scope","note"])test(change+"切替後に遅い関連本文を反映しない",async()=>{
  const h=fixture(),waiting=deferred();await h.open();
  // Route the next load through a second controller with a delayed note reader.
  h.context.notePreviewWorkController=createNotePreviewWorkController({...h.options,readNotes:()=>waiting.promise,isNotePreviewOwnerCurrent:h.context.isNotePreviewOwnerCurrent,openNotePreview:h.context.openNotePreview,renderNotePreviewReference:h.context.renderNotePreviewReference});
  h.context.notePreviewWorkController.prepare(h.state.notePreviewOwner);await tick();
  h.elements.notePreviewWorkSelect.value=h.sources[1].key;h.context.notePreviewWorkController.chooseSource();
  if(change==="source"){h.elements.notePreviewWorkSelect.value=h.sources[0].key;h.context.notePreviewWorkController.chooseSource();}
  if(change==="type")h.type("reference");if(change==="close")h.elements.notePreviewDialog.close();
  if(change==="work")h.state.selectedWork={id:"other"};if(change==="provider")h.state.provider={};
  if(change==="scope")h.setScope("other/root");if(change==="note")h.state.currentNote={item:{id:"different"},data:{type:"plot"}};
  waiting.resolve([{item:{id:"late"},data:{title:"遅い本文"},referenceKey:"late"}]);await tick();
  // A type change starts a newer request: only that request may render.
  assert.equal(h.rendered.length,change==="type"?1:0);
  if(change==="close"){assert.equal(h.state.notePreviewEntries.length,0);assert.equal(h.elements.notePreviewReferenceStatus.textContent,"");}
});
test("取得失敗と空一覧から編集中の下書きへ戻れる",async()=>{
  for(const fail of [false,true]){
    const h=fixture();h.context.notePreviewWorkController=createNotePreviewWorkController({...h.options,readNotes:async()=>{if(fail)throw Error("追加許可が必要です");return [];},isNotePreviewOwnerCurrent:h.context.isNotePreviewOwnerCurrent,openNotePreview:h.context.openNotePreview,renderNotePreviewReference:h.context.renderNotePreviewReference});
    await h.open();h.elements.notePreviewWorkSelect.value=h.sources[1].key;h.context.notePreviewWorkController.chooseSource();await tick();
    assert.equal(h.elements.notePreviewSelect.disabled,true);assert.match(h.elements.notePreviewContent.textContent,fail?/追加許可/:/ノートがありません/);
    h.elements.notePreviewWorkSelect.value=h.sources[0].key;h.context.notePreviewWorkController.chooseSource();assert.equal(h.elements.notePreviewTitle.textContent,"未保存の下書き");assert.equal(h.state.dirty,true);
  }
});
test("閉じて再度開くと参照元は自作品となり関連候補を再確認する",async()=>{
  const h=fixture();await h.open();h.choose(1);await tick();h.elements.notePreviewDialog.close();await h.open();
  assert.equal(h.elements.notePreviewWorkSelect.value,h.sources[0].key);assert.equal(h.elements.notePreviewTypeSelect.value,"current");assert.equal(h.state.notePreviewEntries.length,0);
});
test("閉じた後の候補応答を捨て、同じ編集ノートでも次のスコープで再確認する",async()=>{
  const h=fixture(),waiting=deferred();
  h.context.notePreviewWorkController=createNotePreviewWorkController({...h.options,readSources:()=>waiting.promise,isNotePreviewOwnerCurrent:h.context.isNotePreviewOwnerCurrent,openNotePreview:h.context.openNotePreview,renderNotePreviewReference:h.context.renderNotePreviewReference});
  h.context.openNotePreview();await tick();h.elements.notePreviewDialog.close();waiting.resolve({sources:h.sources,notice:"古い候補"});await tick();assert.equal(h.elements.notePreviewReferenceStatus.textContent,"");
  h.setScope("new/root");await h.open();assert.equal(h.elements.notePreviewWorkSelect.options.length,2);assert.equal(h.elements.notePreviewTypeSelect.value,"current");
});

test('ノートの参照元も作品タイトルのみ表示し、空ならフォルダ名へ戻す',async()=>{
  const h=fixture();h.sources[0].work.name='own-folder';h.sources[1].work.name='peer-folder';await h.open();
  assert.deepEqual(h.elements.notePreviewWorkSelect.options.map(o=>o.text),['作品A（この作品）','作品B']);
  h.elements.notePreviewDialog.close();h.sources[1].work.title='';await h.open();assert.equal(h.elements.notePreviewWorkSelect.options[1].text,'peer-folder');
});

test('候補待ちを参照元だけに表示し、編集中のプレビューと更新を妨げない',async()=>{
 const h=fixture(),waiting=deferred();h.context.notePreviewWorkController=createNotePreviewWorkController({...h.options,readSources:()=>waiting.promise});await h.open();
 assert.equal(h.elements.notePreviewSourceLoading.hidden,false);assert.equal(h.elements.notePreviewSourceLoadingHelp.hidden,false);assert.equal(h.elements.notePreviewWorkSelect.attributes['aria-busy'],'true');assert.equal(h.elements.notePreviewWorkSelect.disabled,true);
 assert.equal(h.elements.notePreviewTypeSelect.options[0].disabled,false);assert.equal(h.elements.notePreviewTitle.textContent,'未保存の下書き');h.context.openNotePreview({refresh:true});assert.equal(h.elements.notePreviewSourceLoading.hidden,false);
 waiting.resolve({sources:h.sources,notice:''});await tick();assert.equal(h.elements.notePreviewSourceLoading.hidden,true);assert.equal(h.elements.notePreviewSourceLoadingHelp.hidden,true);assert.equal(h.elements.notePreviewWorkSelect.attributes['aria-busy'],'false');assert.equal(h.state.currentNote,h.note);assert.equal(h.state.dirty,true);
});
test('候補取得の失敗でもバッジを消し、ノートの下書きと案内を保つ',async()=>{
 const h=fixture();h.context.notePreviewWorkController=createNotePreviewWorkController({...h.options,readSources:async()=>{throw Error('network');}});await h.open();
 assert.equal(h.elements.notePreviewSourceLoading.hidden,true);assert.equal(h.elements.notePreviewSourceLoadingHelp.hidden,true);assert.equal(h.elements.notePreviewTitle.textContent,'未保存の下書き');assert.match(h.elements.notePreviewReferenceStatus.textContent,/関連作品を確認できません/);
});
test('プレビューの開き直しでは古い候補応答が新しい読み込み表示を消さない',async()=>{
 const h=fixture(),first=deferred(),second=deferred();let reads=0;h.context.notePreviewWorkController=createNotePreviewWorkController({...h.options,readSources:()=>++reads===1?first.promise:second.promise});await h.open();h.elements.notePreviewDialog.close();assert.equal(h.elements.notePreviewSourceLoading.hidden,true);
 await h.open();first.resolve({sources:h.sources,notice:''});await tick();assert.equal(h.elements.notePreviewSourceLoading.hidden,false);second.resolve({sources:h.sources,notice:''});await tick();assert.equal(h.elements.notePreviewSourceLoading.hidden,true);
});

test('折りたたみ用の要約は自作品・種類・関連作品の参照状態へ追従し、下書きを保持する',async()=>{
 const h=fixture();await h.open();assert.equal(h.elements.notePreviewSelectionSummary.textContent,'この作品・編集中');
 h.type('reference');await tick();assert.equal(h.elements.notePreviewSelectionSummary.textContent,'この作品・資料');
 h.choose(1);await tick();assert.equal(h.elements.notePreviewSelectionSummary.textContent,'作品B（参照のみ）・資料');
 h.elements.notePreviewOptions.open=true;h.context.openNotePreview({refresh:true});assert.equal(h.elements.notePreviewOptions.open,true);assert.equal(h.elements.notePreviewSelectionSummary.textContent,'作品B（参照のみ）・資料');
 h.choose(0);assert.equal(h.elements.notePreviewSelectionSummary.textContent,'この作品・編集中');assert.equal(h.state.currentNote,h.note);assert.equal(h.state.dirty,true);
});
test('折りたたみ側にも読み込みと確認事項を表示し、失敗・閉じるで読み込みを終了する',async()=>{
 const h=fixture(),waiting=deferred();h.context.notePreviewWorkController=createNotePreviewWorkController({...h.options,readSources:()=>waiting.promise});await h.open();
 assert.equal(h.elements.notePreviewOptionsLoading.hidden,false);assert.equal(h.elements.notePreviewSelectionSummary.textContent,'この作品・編集中');
 waiting.reject(Error('network'));await tick();assert.equal(h.elements.notePreviewOptionsLoading.hidden,true);assert.match(h.elements.notePreviewSelectionSummary.textContent,/確認事項あり/);assert.match(h.elements.notePreviewSelectionSummary.title,/関連作品を確認できません/);
 h.elements.notePreviewDialog.close();assert.equal(h.elements.notePreviewOptionsLoading.hidden,true);assert.doesNotMatch(h.elements.notePreviewSelectionSummary.textContent,/確認事項あり/);
});
