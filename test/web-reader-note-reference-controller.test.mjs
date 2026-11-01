import assert from "node:assert/strict";
import test from "node:test";
import { createReaderNoteReferenceController } from "../web/lib/reader-note-reference-controller.mjs";
import { referenceWorkKey } from "../web/lib/shared-note-reader.mjs";

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=()=>new Promise(setImmediate);
function fixture(){
  const node=()=>({hidden:false,value:"",disabled:false,textContent:"",options:[],classList:{add(){},remove(){}},setAttribute(name,value){(this.attributes ||= {})[name]=value;},replaceChildren(...options){this.options=options;}});
  const a={id:"a",title:"編集中の作品"},b={id:"b",title:"関連作品"};const sources=[{key:referenceWorkKey(a),work:a,relation:"current"},{key:referenceWorkKey(b),work:b,relation:"mutual"}];
  const state={provider:{},selectedWork:a,works:[a,b],cloudKind:"oneDrive",readerNoteReferenceLoadToken:0,readerNoteReferenceEntries:[],dirty:true,currentFile:{id:"manuscript"},originalContent:"保存前の原稿"};
  const elements=Object.fromEntries(["readerNoteReferencePanel","readerSection","readerNoteReferenceButton","readerNoteOptions", "readerNoteOptionsLoading", "readerNoteSelectionSummary", "readerNoteSourceLoading","readerNoteSourceLoadingHelp","readerNoteWorkSelect","readerNoteTypeSelect","readerNoteSelect","readerNoteReferenceContent","readerNoteReferenceStatus"].map(key=>[key,node()]));elements.readerNoteTypeSelect.value="plot";elements.readerNoteReferencePanel.hidden=true;
  let scope="owner/root";const renders=[];
  const options={state,elements,Option:class{constructor(text,value){Object.assign(this,{text,value});}},scopeKey:()=>scope,renderReaderNoteReference:entry=>renders.push(entry?.data.title),showLoading:(el,text)=>{el.textContent=text;},showEmpty:(el,text)=>{el.textContent=text;},readSources:async()=>({sources,notice:""}),readNotes:async(_ctx,source,type)=>[{item:{id:"note",name:"note.json"},data:{title:source.work.title+type},referenceKey:source.key+type}]};
  return {state,elements,options,sources,renders,setScope:value=>{scope=value;},make:()=>createReaderNoteReferenceController(options)};
}
test("関連作品の設定確認を待つ間も自作品を表示し、原稿・未保存状態を変えない",async()=>{
  const h=fixture(),waiting=deferred();h.options.readSources=()=>waiting.promise;const c=h.make(),opening=c.open();await tick();
  assert.deepEqual(h.renders,["編集中の作品plot"]);assert.equal(h.state.dirty,true);assert.equal(h.state.currentFile.id,"manuscript");assert.equal(h.state.originalContent,"保存前の原稿");
  waiting.resolve({sources:h.sources,notice:""});await opening;assert.equal(h.elements.readerNoteWorkSelect.options.length,2);
});
test("遅い関連作品の本文は参照元を戻した後に表示しない",async()=>{
  const waiting=deferred();
  const g=fixture();g.options.readNotes=async(_ctx,source,type)=>source.work.id==="b"?waiting.promise:[{item:{name:"a"},data:{title:"自作品"},referenceKey:"a"}];const controller=g.make();await controller.open();
  g.elements.readerNoteWorkSelect.value=g.sources[1].key;const loading=controller.chooseSource();g.elements.readerNoteWorkSelect.value=g.sources[0].key;await controller.chooseSource();
  waiting.resolve([{item:{name:"b"},data:{title:"遅い他作品"},referenceKey:"b"}]);await loading;
  assert.equal(g.renders.at(-1),"自作品");assert.ok(!g.renders.includes("遅い他作品"));
});
test("種類切替後は以前のプロットの応答を資料へ混ぜない",async()=>{
  const h=fixture(),waiting=deferred();let slow=false;h.options.readNotes=async(_ctx,_source,type)=>slow&&type==="plot"?waiting.promise:[{item:{name:type},data:{title:type},referenceKey:type}];
  const c=h.make();await c.open();slow=true;const loading=c.load("plot");h.elements.readerNoteTypeSelect.value="reference";await c.load("reference");waiting.resolve([{item:{name:"plot"},data:{title:"古いplot"},referenceKey:"plot"}]);await loading;assert.equal(h.renders.at(-1),"reference");
});
test("パネルを閉じた後は設定と本文の遅い応答を反映せず参照データを捨てる",async()=>{
  const h=fixture(),settings=deferred(),notes=deferred();h.options.readSources=()=>settings.promise;h.options.readNotes=()=>notes.promise;
  const c=h.make(),opening=c.open();c.close();settings.resolve({sources:h.sources,notice:"遅い設定"});notes.resolve([{data:{title:"遅い本文"}}]);await opening;
  assert.equal(h.elements.readerNoteReferencePanel.hidden,true);assert.equal(h.state.readerNoteReferenceEntries.length,0);assert.deepEqual(h.renders,[]);assert.equal(h.elements.readerNoteReferenceContent.options.length,0);
});
for(const change of ["work","provider","scope"])test(change+"変更後は参照の応答を反映しない",async()=>{
  const h=fixture(),waiting=deferred();h.options.readNotes=()=>waiting.promise;const c=h.make(),opening=c.open();
  if(change==="work")h.state.selectedWork={id:"another"};if(change==="provider")h.state.provider={};if(change==="scope")h.setScope("other/root");
  waiting.resolve([{data:{title:"以前の接続の本文"}}]);await opening;assert.deepEqual(h.renders,[]);
});
test("参照先の取得失敗は無効な選択と案内を表示し、自作品へ戻れる",async()=>{
  const h=fixture();h.options.readNotes=async(_ctx,source)=>{if(source.work.id==="b")throw Error("追加許可してください");return [{item:{name:"a"},data:{title:"自作品"},referenceKey:"a"}];};
  const c=h.make();await c.open();h.elements.readerNoteWorkSelect.value=h.sources[1].key;await c.chooseSource();assert.equal(h.elements.readerNoteSelect.disabled,true);assert.match(h.elements.readerNoteReferenceContent.textContent,/追加許可/);assert.equal(h.state.readerNoteReferenceEntries.length,0);
  h.elements.readerNoteWorkSelect.value=h.sources[0].key;await c.chooseSource();assert.equal(h.elements.readerNoteSelect.disabled,false);assert.equal(h.renders.at(-1),"自作品");
});

test('参照元の表示は作品タイトルのみで、タイトルがなければフォルダ名を使う',async()=>{
  const h=fixture();h.sources[0].work.name='own-folder';h.sources[1].work.name='peer-folder';const c=h.make();await c.open();
  assert.deepEqual(h.elements.readerNoteWorkSelect.options.map(o=>o.text),['編集中の作品（この作品）','関連作品']);
  c.close();h.sources[1].work.title='';await c.open();assert.equal(h.elements.readerNoteWorkSelect.options[1].text,'peer-folder');
});

test('参照元だけ読み込み中と表示し、自作品のノートと種類は先に操作できる',async()=>{
 const h=fixture(),waiting=deferred();h.options.readSources=()=>waiting.promise;const c=h.make(),opening=c.open();await tick();
 assert.equal(h.elements.readerNoteSourceLoading.hidden,false);assert.equal(h.elements.readerNoteSourceLoadingHelp.hidden,false);assert.equal(h.elements.readerNoteWorkSelect.attributes['aria-busy'],'true');
 assert.equal(h.elements.readerNoteWorkSelect.disabled,true);assert.equal(h.elements.readerNoteSelect.disabled,false);await c.load('reference');assert.equal(h.renders.at(-1),'編集中の作品reference');assert.equal(h.elements.readerNoteSourceLoading.hidden,false);
 waiting.resolve({sources:h.sources,notice:''});await opening;assert.equal(h.elements.readerNoteSourceLoading.hidden,true);assert.equal(h.elements.readerNoteSourceLoadingHelp.hidden,true);assert.equal(h.elements.readerNoteWorkSelect.attributes['aria-busy'],'false');assert.equal(h.elements.readerNoteWorkSelect.disabled,false);assert.equal(h.state.dirty,true);
});
test('参照元の取得失敗では読み込み表示を消し、自作品の参照と失敗案内を残す',async()=>{
 const h=fixture();h.options.readSources=async()=>{throw Error('network');};const c=h.make();await c.open();
 assert.equal(h.elements.readerNoteSourceLoading.hidden,true);assert.equal(h.elements.readerNoteSourceLoadingHelp.hidden,true);assert.equal(h.elements.readerNoteSelect.disabled,false);assert.match(h.elements.readerNoteReferenceStatus.textContent,/関連作品を確認できません/);
});
test('閉じて開き直した後に古い応答が完了しても新しい読み込み表示を消さない',async()=>{
 const h=fixture(),first=deferred(),second=deferred();let reads=0;h.options.readSources=()=>++reads===1?first.promise:second.promise;const c=h.make(),old=c.open();await tick();c.close();assert.equal(h.elements.readerNoteSourceLoading.hidden,true);
 const fresh=c.open();await tick();first.resolve({sources:h.sources,notice:''});await old;assert.equal(h.elements.readerNoteSourceLoading.hidden,false);
 second.resolve({sources:h.sources,notice:''});await fresh;assert.equal(h.elements.readerNoteSourceLoading.hidden,true);
});

test('原稿の折りたたみ要約は参照元・種類・ノート名へ追従し原稿を保持する',async()=>{
 const h=fixture(),c=h.make();await c.open();assert.equal(h.elements.readerNoteSelectionSummary.textContent,'この作品・プロット／編集中の作品plot');
 h.elements.readerNoteTypeSelect.value='reference';await c.load();assert.equal(h.elements.readerNoteSelectionSummary.textContent,'この作品・資料／編集中の作品reference');
 h.elements.readerNoteOptions.open=true;h.elements.readerNoteWorkSelect.value=h.sources[1].key;await c.chooseSource();assert.equal(h.elements.readerNoteOptions.open,true);assert.equal(h.elements.readerNoteSelectionSummary.textContent,'関連作品（参照のみ）・資料／関連作品reference');
 h.state.readerNoteReferenceEntries.push({item:{id:'second',name:'second.json'},data:{title:'別の資料'},referenceKey:'second'});h.elements.readerNoteSelect.value='second';c.chooseNote();assert.match(h.elements.readerNoteSelectionSummary.textContent,/別の資料/);
 assert.equal(h.state.dirty,true);assert.equal(h.state.currentFile.id,'manuscript');assert.equal(h.state.originalContent,'保存前の原稿');
});
test('原稿の折りたたみ側も読み込み中と確認事項を表示し、閉じるとリセットする',async()=>{
 const h=fixture(),waiting=deferred();h.options.readSources=()=>waiting.promise;const c=h.make(),opening=c.open();await tick();assert.equal(h.elements.readerNoteOptionsLoading.hidden,false);
 waiting.reject(Error('network'));await opening;assert.equal(h.elements.readerNoteOptionsLoading.hidden,true);assert.match(h.elements.readerNoteSelectionSummary.textContent,/確認事項あり/);assert.match(h.elements.readerNoteSelectionSummary.title,/関連作品を確認できません/);
 c.close();assert.equal(h.elements.readerNoteOptionsLoading.hidden,true);assert.doesNotMatch(h.elements.readerNoteSelectionSummary.textContent,/確認事項あり/);
});
