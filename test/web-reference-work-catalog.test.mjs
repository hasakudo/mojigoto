import assert from "node:assert/strict";
import test from "node:test";
import { createReferenceWorkCatalog } from "../web/lib/reference-work-catalog.mjs";
import { discoverWorks, discoverReferenceWorks } from "../web/lib/work-discovery.mjs";
import { readReferenceSources, readReferenceNotes } from "../web/lib/shared-note-reader.mjs";
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(){
  const item=(id,name,folder=true)=>({id,name,[folder?'folder':'file']:{}});
  const a={id:'a',folder:item('a','作品A'),mojigoto:item('ma','.mojigoto'),settingsFile:item('sa','work.json',false),title:'作品A'};
  const b={id:'b',folder:item('b','作品B'),mojigoto:item('mb','.mojigoto'),settingsFile:item('sb','work.json',false),title:'作品B'};
  const files=new Map([['sa',{workId:'stable-a',relatedWorkIds:['stable-b']}],['sb',{workId:'stable-b',relatedWorkIds:['stable-a']}],['note-b',{title:'Bの未訪問ノート',groups:[]}]]);
  const calls=[],writeCalls=[];
  const provider={async listChildren(id){calls.push(['list',id]);return ({root:[a.folder,b.folder],a:[a.mojigoto],b:[b.mojigoto],ma:[a.settingsFile],mb:[b.settingsFile,item('plots-b','plots')],'plots-b':[item('note-b','note.json',false)]})[id]||[];},async readText(file){calls.push(['read',file.id]);return JSON.stringify(files.get(file.id));}};
  for(const name of ['createFolder','createTextFile','writeText','deleteItem'])provider[name]=async()=>{writeCalls.push(name);throw Error('参照時の書込は禁止');};
  const state={provider,workRoot:{id:'root'},works:[],recentWorkCatalogPending:true,worksLoadToken:1,selectedWork:a,dirty:true,currentNote:{item:{id:'edit-a'},data:{title:'未保存のA'}},currentFile:{id:'draft-a'}};
  let scope='owner/root',active=true;
  const context={provider,work:a,works:[],cloudKind:'oneDrive',isCurrent:()=>active&&state.provider===provider};
  const options={state,scopeKey:()=>scope,discoverWorks};
  const make=()=>{const resolver=createReferenceWorkCatalog(options);context.getWorks=()=>resolver.resolve(context);return resolver;};
  return {state,context,options,make,a,b,calls,writeCalls,setScope:value=>{scope=value;},close:()=>{active=false;}};
}
for(const initial of ['empty','own-only'])test(initial+'の履歴復元から、未訪問の関連作品とノートを読み取り、編集状態を変えない',async()=>{
  const h=fixture();if(initial==='own-only')h.state.works=[h.a];h.context.works=[...h.state.works];const before=JSON.stringify(h.state);h.make();
  const result=await readReferenceSources(h.context);
  assert.deepEqual(result.sources.map(s=>s.work.id),['a','b']);assert.equal(result.notice,'');
  assert.equal((await readReferenceNotes(h.context,result.sources[1],'plot'))[0].data.title,'Bの未訪問ノート');
  assert.equal(JSON.stringify(h.state),before);assert.deepEqual(h.writeCalls,[]);
});
test('一覧の取得完了を待って候補を確定し、不完全なスナップショットで未確認を表示しない',async()=>{
  const h=fixture(),waiting=deferred();h.options.discoverWorks=()=>waiting.promise;h.make();let done=false;
  const loading=readReferenceSources(h.context).then(result=>{done=true;return result;});await new Promise(setImmediate);assert.equal(done,false);
  waiting.resolve([h.a,h.b]);assert.equal((await loading).sources.length,2);
});
test('既に進行中の作品検出を共有し、文字数集計の完了には依存しない',async()=>{
  const h=fixture(),waiting=deferred();let extra=0;h.options.discoverWorks=async()=>{extra++;return [];};
  h.state.referenceWorkDiscovery={provider:h.state.provider,scope:'owner/root',token:1,promise:waiting.promise};h.make();
  const loading=readReferenceSources(h.context);await new Promise(setImmediate);waiting.resolve([h.a,h.b]);
  assert.equal((await loading).sources.length,2);assert.equal(extra,0);
});
test('同じ接続の複数プレビューは未訪問作品の検出を共有する',async()=>{
  const h=fixture(),waiting=deferred();let discoveries=0;h.options.discoverWorks=()=>{discoveries++;return waiting.promise;};const r=h.make();
  const first=r.resolve(h.context),second=r.resolve(h.context);waiting.resolve([h.a,h.b]);await Promise.all([first,second]);await r.resolve(h.context);assert.equal(discoveries,1);
});
for(const change of ['provider','scope','token','close'])test(change+'の変更後は接続前の一覧を返さない',async()=>{
  const h=fixture(),waiting=deferred();h.options.discoverWorks=()=>waiting.promise;const r=h.make(),loading=r.resolve(h.context);
  if(change==='provider')h.state.provider={};if(change==='scope')h.setScope('other/root');if(change==='token')h.state.worksLoadToken++;if(change==='close')h.close();
  waiting.resolve([h.a,h.b]);await assert.rejects(loading,/中止/);
});
test('読込失敗を空一覧で保存せず、開き直しで再取得できる',async()=>{
  const h=fixture();let calls=0;h.options.discoverWorks=async()=>{if(++calls===1)throw Error('network');return [h.a,h.b];};h.make();
  await assert.rejects(readReferenceSources(h.context),/network/);assert.equal((await readReferenceSources(h.context)).sources.length,2);assert.equal(calls,2);
});
test('取得済みの同一接続カタログがある場合は再検出しない',async()=>{
  const h=fixture();h.state.recentWorkCatalogPending=false;h.state.works=[h.a,h.b];h.options.discoverWorks=async()=>{throw Error('重複検出');};h.make();
  assert.equal((await readReferenceSources(h.context)).sources.length,2);
});
test('接続先または一覧再読み込みの世代が変わると参照用の検出をやり直す',async()=>{
  const h=fixture();let calls=0;h.options.discoverWorks=async()=>{calls++;return [h.a,h.b];};const r=h.make();
  await r.resolve(h.context);h.state.worksLoadToken++;await r.resolve(h.context);h.setScope('new/root');await r.resolve(h.context);assert.equal(calls,3);
});

test('参照用探索は設定・集計本文を読まず、関連確認で設定を一度ずつ読む',async()=>{
  const h=fixture();h.options.discoverWorks=discoverReferenceWorks;h.make();
  const result=await readReferenceSources(h.context);assert.equal(result.sources.length,2);
  assert.equal(h.calls.filter(([kind,id])=>kind==='read'&&id==='sa').length,1);
  assert.equal(h.calls.filter(([kind,id])=>kind==='read'&&id==='sb').length,1);
  assert.deepEqual(h.writeCalls,[]);
});
test('通常の一覧探索は設定本文を読み、参照用探索は同じ作品・設定ファイルの候補だけを返す',async()=>{
  const h=fixture();const full=await discoverWorks(h.state.provider,h.state.workRoot);
  assert.equal(h.calls.filter(([kind])=>kind==='read').length,2);h.calls.length=0;
  const light=await discoverReferenceWorks(h.state.provider,h.state.workRoot);
  assert.deepEqual(light.map(w=>[w.id,w.settingsFile.id]),full.map(w=>[w.id,w.settingsFile.id]));
  assert.equal(h.calls.filter(([kind])=>kind==='read').length,0);
});
test('参照用探索でも保存済み作品タイトルを候補に表示し、カタログや下書きを書き換えない',async()=>{
  const h=fixture(),read=h.state.provider.readText;h.options.discoverWorks=discoverReferenceWorks;
  h.state.provider.readText=async file=>file.id==='sb'?JSON.stringify({workId:'stable-b',relatedWorkIds:['stable-a'],title:'フォルダ名と異なる作品タイトル'}):read(file);
  const before=JSON.stringify(h.state);h.make();const result=await readReferenceSources(h.context);
  assert.equal(result.sources[1].work.title,'フォルダ名と異なる作品タイトル');assert.equal(JSON.stringify(h.state),before);
});
test('候補取得の区間計測は件数だけを記録し、作品タイトルや本文を記録しない',async()=>{
  const h=fixture(),samples=[];h.make();h.context.measure=label=>details=>samples.push({label,...details});
  assert.equal((await readReferenceSources(h.context)).sources.length,2);
  assert.deepEqual(samples.map(s=>s.label),['関連作品・現在作品設定','関連作品・作品候補取得','関連作品・候補設定確認']);
  assert.doesNotMatch(JSON.stringify(samples),/作品A|作品B|未保存|stable-/);
});

test('前回一覧の既知作品はルートの現存確認だけで候補を返す',async()=>{
 const h=fixture(),before=JSON.stringify([h.a,h.b]);const works=await discoverReferenceWorks(h.state.provider,h.state.workRoot,{cachedWorks:[h.a,h.b]});
 assert.deepEqual(works.map(w=>w.id),['a','b']);assert.deepEqual(h.calls,[['list','root']]);assert.equal(JSON.stringify([h.a,h.b]),before);
});
test('前回一覧から増えた作品だけを検出し、保存済みタイトルで関連先を照合する',async()=>{
 const h=fixture();h.options.discoverWorks=discoverReferenceWorks;h.options.readCachedWorks=()=>[h.a];h.make();
 const result=await readReferenceSources(h.context);assert.equal(result.sources.length,2);
 assert.ok(!h.calls.some(([kind,id])=>kind==='list'&&['a','ma'].includes(id)));
 assert.ok(h.calls.some(([kind,id])=>kind==='list'&&id==='b'));assert.ok(h.calls.some(([kind,id])=>kind==='list'&&id==='mb'));
});
test('ルートから削除・移動した前回作品を候補に残さない',async()=>{
 const h=fixture(),list=h.state.provider.listChildren;h.state.provider.listChildren=async id=>id==='root'?[h.a.folder]:list(id);
 assert.deepEqual((await discoverReferenceWorks(h.state.provider,h.state.workRoot,{cachedWorks:[h.a,h.b]})).map(w=>w.id),['a']);
});
test('設定ファイルの場所が欠けた前回作品はフォルダを再検出する',async()=>{
 const h=fixture();const cached=[{...h.a,settingsFile:null},h.b];await discoverReferenceWorks(h.state.provider,h.state.workRoot,{cachedWorks:cached});
 assert.ok(h.calls.some(([kind,id])=>kind==='list'&&id==='a'));assert.ok(h.calls.some(([kind,id])=>kind==='list'&&id==='ma'));
 assert.ok(!h.calls.some(([kind,id])=>kind==='list'&&id==='b'));
});
test('前回一覧にない通常フォルダも確認し、ノートを持たないフォルダを作品に加えない',async()=>{
 const h=fixture(),list=h.state.provider.listChildren;h.state.provider.listChildren=async id=>{if(id==='root')return [...await list(id),{id:'other',name:'other',folder:{}}];return list(id);};
 const works=await discoverReferenceWorks(h.state.provider,h.state.workRoot,{cachedWorks:[h.a,h.b]});
 assert.deepEqual(works.map(w=>w.id),['a','b']);assert.ok(h.calls.some(([kind,id])=>kind==='list'&&id==='other'));
});

test('キャッシュなしでも直接取得が成功すれば子フォルダと管理フォルダの列挙を省く',async()=>{
 const h=fixture(),calls=[];h.state.provider.inspectReferenceFolders=async folders=>{calls.push(folders.map(f=>f.id));return new Map(folders.map(f=>[f.id,{mojigoto:f.id==='a'?h.a.mojigoto:h.b.mojigoto,children:[f.id==='a'?h.a.settingsFile:h.b.settingsFile]}]));};
 const details=[];const works=await discoverReferenceWorks(h.state.provider,h.state.workRoot,{reportReferenceDiscovery:d=>details.push(d)});
 assert.deepEqual(works.map(w=>w.id),['a','b']);assert.deepEqual(h.calls,[['list','root']]);assert.deepEqual(calls,[['a','b']]);assert.deepEqual(details,[{cachedWorks:0,expandedFolders:2,fallbackFolders:0,managementFolders:0}]);
});
test('直接取得できない作品だけ通常探索に戻し、Single設定も失わない',async()=>{
 const h=fixture();h.state.provider.inspectReferenceFolders=async()=>new Map([['a',{mojigoto:h.a.mojigoto,children:[h.a.settingsFile]}]]);
 const works=await discoverReferenceWorks(h.state.provider,h.state.workRoot);assert.equal(works.length,2);
 assert.ok(!h.calls.some(([kind,id])=>kind==='list'&&['a','ma'].includes(id)));assert.ok(h.calls.some(([kind,id])=>kind==='list'&&id==='b'));assert.ok(h.calls.some(([kind,id])=>kind==='list'&&id==='mb'));
});
test('直接取得API自体が失敗しても従来と同じ作品を検出する',async()=>{
 const h=fixture();h.state.provider.inspectReferenceFolders=async()=>{throw Error('unsupported');};
 assert.deepEqual((await discoverReferenceWorks(h.state.provider,h.state.workRoot)).map(w=>w.id),['a','b']);
});
test('通常の作品一覧では参照専用の直接取得を使わない',async()=>{
 const h=fixture();h.state.provider.inspectReferenceFolders=async()=>{throw Error('呼んではいけない');};
 const works=await discoverWorks(h.state.provider,h.state.workRoot);assert.equal(works.length,2);assert.ok(h.calls.some(([kind,id])=>kind==='list'&&id==='a'));
});
test('候補取得の計測で初回探索とメモリ再利用・フォールバック件数を区別する',async()=>{
 const h=fixture();h.options.discoverWorks=discoverReferenceWorks;h.make();const samples=[];h.context.measure=label=>details=>samples.push({label,...details});
 await readReferenceSources(h.context);await readReferenceSources(h.context);
 const rows=samples.filter(s=>s.label==='関連作品・作品候補取得');assert.equal(rows[0].source,'discovery');assert.equal(rows[1].source,'memory');assert.equal(rows[0].fallbackFolders,2);assert.equal(rows[0].expandedFolders,0);assert.doesNotMatch(JSON.stringify(rows),/作品A|stable-a/);
});
