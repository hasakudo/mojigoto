import assert from "node:assert/strict";
import test from "node:test";
import { readRelatedWorkCatalog, saveWorkRelation, removeUnresolvedWorkRelation } from "../web/lib/related-work-settings.mjs";
import { referenceWorkKey } from "../web/lib/shared-note-reader.mjs";
function fixture() {
  const works=['a','b','c'].map(id=>({id,folder:{id,folder:{}},title:'作品'+id,name:'folder-'+id,mojigoto:{id:'meta-'+id},settingsFile:{id:'settings-'+id,name:'work.json',file:{}}}));
  const store=new Map(works.map((work,i)=>[work.settingsFile.id,{version:1,data:{workId:work.id,relatedWorkIds:i===0?['unknown-a']:i===1?['unknown-b']:[],title:work.title,extra:{keep:i},memo:'memo-'+i}}]));
  const writes=[],reads=[],fresh=[];let active=true,hook=null;
  const provider={getItemMetadata:async item=>{const row=store.get(item.id);if(!row)throw Error('not found');return {...item,eTag:String(row.version)};},readText:async item=>{reads.push(item.id);const row=store.get(item.id);if(row.error)throw row.error;return JSON.stringify(row.data);},listChildren:async()=>[],writeText:async(item,raw,expected)=>{const row=store.get(item.id),next=JSON.parse(raw);await hook?.(item,next);if(String(row.version)!==expected){const error=Error('conflict');error.code='conflict';throw error;}row.data=next;row.version++;writes.push({id:item.id,data:structuredClone(next),expected});return {...item,eTag:String(row.version)};},createTextFile:async()=>{throw Error('creation forbidden');},createFolder:async()=>{throw Error('creation forbidden');}};
  const context={provider,work:works[0],isCurrent:()=>active,getWorks:async refresh=>{fresh.push(refresh);return works;}};
  let sequence=0;const options={makeId:()=>`generated-${sequence++}`,now:()=> '2026-10-28T00:00:00.000Z'};
  return {works,store,writes,reads,fresh,provider,context,options,peer:referenceWorkKey(works[1]),save:related=>saveWorkRelation(context,referenceWorkKey(works[1]),related,options),stop:()=>{active=false;},setHook:value=>{hook=value;}};
}
test('候補の表示では設定を作成・更新せず未登録IDを生成しない',async()=>{
 const h=fixture();delete h.store.get('settings-b').data.workId;const before=JSON.stringify([...h.store]);const result=await readRelatedWorkCatalog(h.context);
 assert.equal(result.peers.length,2);assert.equal(result.peers[0].problem,'');assert.equal(JSON.stringify([...h.store]),before);assert.equal(h.writes.length,0);assert.equal(result.unresolved,1);
});
test('関連付けは両側を条件付き更新し未知項目・未解決ID・第三作品を保持する',async()=>{
 const h=fixture(),third=JSON.stringify(h.store.get('settings-c'));const result=await h.save(true);
 assert.equal(result.complete,true);assert.deepEqual(h.store.get('settings-a').data.relatedWorkIds,['unknown-a','b']);assert.deepEqual(h.store.get('settings-b').data.relatedWorkIds,['unknown-b','a']);assert.deepEqual(h.store.get('settings-a').data.extra,{keep:0});assert.equal(h.store.get('settings-b').data.memo,'memo-1');assert.equal(JSON.stringify(h.store.get('settings-c')),third);assert.deepEqual(h.writes.map(w=>w.expected),['1','1']);assert.equal(h.fresh.at(-1),true);
});
test('解除は相手のIDだけを両側から除き、未解決や別作品の関連を残す',async()=>{
 const h=fixture();h.store.get('settings-a').data.relatedWorkIds=['unknown-a','b','c'];h.store.get('settings-b').data.relatedWorkIds=['unknown-b','a','c'];assert.equal((await h.save(false)).complete,true);
 assert.deepEqual(h.store.get('settings-a').data.relatedWorkIds,['unknown-a','c']);assert.deepEqual(h.store.get('settings-b').data.relatedWorkIds,['unknown-b','c']);
});
for(const target of ['a','b'])test(target+'のID重複時は関連を変更しない',async()=>{
 const h=fixture();h.store.get('settings-c').data.workId=target;const result=await h.save(true);assert.equal(result.complete,false);assert.match(result.error.message,/重複/);assert.equal(h.writes.length,0);
});
test('保存時に不足IDを先に確定してから相互関連を登録する',async()=>{
 const h=fixture();delete h.store.get('settings-a').data.workId;delete h.store.get('settings-b').data.workId;const result=await h.save(true);
 assert.equal(result.complete,true);assert.deepEqual(result.writes.map(w=>w.kind),['identity','identity','relation','relation']);assert.deepEqual(h.store.get('settings-a').data.relatedWorkIds,['unknown-a','generated-1']);assert.deepEqual(h.store.get('settings-b').data.relatedWorkIds,['unknown-b','generated-0']);
});
test('ID確定が途中で失敗しても再試行で未保存の生成IDへの関連を残さない',async()=>{
 const h=fixture();delete h.store.get('settings-a').data.workId;delete h.store.get('settings-b').data.workId;h.setHook((item,next)=>{if(item.id==='settings-b'&&next.workId==='generated-1')throw Error('network');});
 const first=await h.save(true);assert.equal(first.complete,false);assert.equal(first.writes.length,1);assert.deepEqual(h.store.get('settings-a').data.relatedWorkIds,['unknown-a']);
 h.setHook(null);assert.equal((await h.save(true)).complete,true);assert.deepEqual(h.store.get('settings-a').data.relatedWorkIds,['unknown-a','generated-2']);assert.ok(!JSON.stringify([...h.store]).includes('generated-1'));
});
test('片側だけ保存されたときは未完了と最新の自作品を返し、再試行は残る側だけを更新する',async()=>{
 const h=fixture();h.setHook(item=>{if(item.id==='settings-b')throw Error('network');});const first=await h.save(true);assert.equal(first.complete,false);assert.equal(first.writes.length,1);assert.deepEqual(first.own.data.relatedWorkIds,['unknown-a','b']);
 h.setHook(null);const second=await h.save(true);assert.equal(second.complete,true);assert.deepEqual(second.writes.map(w=>w.key),[h.peer]);assert.equal(h.writes.length,2);
});
test('保存直前の外部変更は競合にし、無条件の巻き戻しを行わず再試行で最新項目を保持する',async()=>{
 const h=fixture();let once=true;h.setHook(item=>{if(once&&item.id==='settings-a'){once=false;h.store.get('settings-a').data.external='preserve';h.store.get('settings-a').version++;}});
 const first=await h.save(true);assert.equal(first.complete,false);assert.equal(first.error.code,'conflict');assert.equal(h.writes.length,0);
 assert.equal((await h.save(true)).complete,true);assert.equal(h.store.get('settings-a').data.external,'preserve');assert.equal(h.writes[0].expected,'2');
});
test('保存途中に接続が変わったら次の作品へ書かず部分保存を返す',async()=>{
 const h=fixture();h.setHook(item=>{if(item.id==='settings-a')h.stop();});const result=await h.save(true);assert.equal(result.complete,false);assert.equal(h.writes.length,1);assert.match(result.error.message,/中止/);assert.deepEqual(h.store.get('settings-b').data.relatedWorkIds,['unknown-b']);
});
test('未許可・欠損設定と候補外の作品へは書き込まない',async()=>{
 const h=fixture();h.store.get('settings-b').error=Error('permission');assert.equal((await h.save(true)).complete,false);assert.equal(h.writes.length,0);
 const outside=await saveWorkRelation(h.context,'outside',true,h.options);assert.equal(outside.complete,false);assert.equal(h.writes.length,0);
 delete h.store.get('settings-b').error;h.works[1].settingsFile=null;assert.equal((await h.save(true)).complete,false);assert.equal(h.writes.length,0);
});
test('片側のみの関連は検出し、相互登録と解除のどちらでも修復できる',async()=>{
 const h=fixture();h.store.get('settings-b').data.relatedWorkIds=['a','unknown-b'];const catalog=await readRelatedWorkCatalog(h.context);assert.equal(catalog.peers[0].incoming,true);assert.equal(catalog.peers[0].outgoing,false);
 assert.equal((await h.save(true)).complete,true);assert.equal((await h.save(false)).complete,true);assert.deepEqual(h.store.get('settings-b').data.relatedWorkIds,['unknown-b']);
});
test('破損した現在設定や版情報のない設定を保存で補わない',async()=>{
 const h=fixture();h.store.get('settings-a').data=[];assert.equal((await h.save(true)).complete,false);assert.equal(h.writes.length,0);
 const f=fixture();f.provider.getItemMetadata=async item=>({...item});const result=await f.save(true);assert.equal(result.complete,false);assert.match(result.error.message,/版情報/);assert.equal(f.writes.length,0);
});

test('設定ファイルが別の管理フォルダへ移動していたら保存しない',async()=>{
 const h=fixture(),metadata=h.provider.getItemMetadata;h.provider.getItemMetadata=async item=>({...await metadata(item),parentReference:{id:'other-folder'}});
 assert.equal((await h.save(true)).complete,false);assert.equal(h.writes.length,0);
});
test('Dropboxの親はフォルダIDではなく正規化したパスで照合する',async()=>{
 const h=fixture(),metadata=h.provider.getItemMetadata;h.context.cloudKind='dropbox';for(const work of h.works)work.mojigoto.path_lower='/works/'+work.id+'/.mojigoto';
 h.provider.getItemMetadata=async item=>({...await metadata(item),parentReference:{id:'/works/'+item.id.at(-1)+'/.mojigoto'}});
 assert.equal((await h.save(true)).complete,true);assert.equal(h.writes.length,2);
});

test('設定本文は最新メタデータの版が一致したときだけ再利用する',async()=>{
 const h=fixture();h.context.recordCache=new Map();await readRelatedWorkCatalog(h.context);assert.equal(h.reads.length,3);
 await readRelatedWorkCatalog(h.context);assert.equal(h.reads.length,3);
 h.store.get('settings-b').version++;h.store.get('settings-b').data.title='外部更新';
 const catalog=await readRelatedWorkCatalog(h.context);assert.equal(h.reads.length,4);assert.equal(catalog.peers[0].data.title,'外部更新');
 h.provider.getItemMetadata=async item=>({...item});await readRelatedWorkCatalog(h.context);assert.equal(h.reads.length,7);
});
test('候補設定の版確認をbatchし、失敗時は個別確認する',async()=>{
 const h=fixture();let batch=0,single=0;const metadata=h.provider.getItemMetadata;
 h.provider.getItemMetadata=async item=>{single++;return metadata(item);};
 h.provider.getItemMetadataBatch=async items=>{batch++;return new Map(await Promise.all(items.map(async item=>[item,await metadata(item)])));};
 await readRelatedWorkCatalog(h.context);assert.equal(batch,1);assert.equal(single,0);
 h.provider.getItemMetadataBatch=async()=>{throw Error('batch failure');};await readRelatedWorkCatalog(h.context);assert.equal(single,3);
});
test('保存結果に最新一覧を返して保存後の全件再取得を不要にする',async()=>{
 const h=fixture();const result=await h.save(true);assert.equal(result.catalog.peers[0].incoming,true);assert.equal(result.catalog.peers[0].outgoing,true);assert.deepEqual(result.catalog.unresolvedIds,['unknown-a']);assert.equal(h.fresh.length,1);
});
test('未解決IDは明示した1件だけ自作品から除き、相手や未知項目を保持する',async()=>{
 const h=fixture();h.store.get('settings-a').data.relatedWorkIds=['unknown-a','unknown-other','b'];const before=JSON.stringify(h.store.get('settings-b'));
 const result=await removeUnresolvedWorkRelation(h.context,'unknown-a',h.options);assert.equal(result.complete,true);assert.deepEqual(result.own.data.relatedWorkIds,['unknown-other','b']);assert.equal(JSON.stringify(h.store.get('settings-b')),before);assert.deepEqual(result.own.data.extra,{keep:0});assert.equal(h.writes.length,1);assert.equal(h.writes[0].expected,'1');
});
test('参照可能になったID、解除済みID、競合では未解決の整理を書かない',async()=>{
 const h=fixture();assert.equal((await removeUnresolvedWorkRelation(h.context,'b')).complete,false);assert.equal((await removeUnresolvedWorkRelation(h.context,'absent')).complete,false);assert.equal(h.writes.length,0);
 h.setHook(()=>{h.store.get('settings-a').version++;});const result=await removeUnresolvedWorkRelation(h.context,'unknown-a');assert.equal(result.complete,false);assert.equal(result.error.code,'conflict');assert.deepEqual(h.store.get('settings-a').data.relatedWorkIds,['unknown-a']);assert.equal(h.writes.length,0);
});
