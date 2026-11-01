import test from 'node:test';
import assert from 'node:assert/strict';
import { createManuscriptCatalogJob } from '../web/lib/manuscript-catalog.mjs';
const folder=(id,name,parent)=>({id,name,folder:{},parentReference:{id:parent,driveId:'drive'}});
const file=(id,name,parent)=>({id,name,file:{},parentReference:{id:parent,driveId:'drive'}});
const root=folder('root','原稿');
const wait=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(r=>setImmediate(r));
test('章を深さ優先・数値順で並べ、直下の原稿を最後にし本文を読まない',async()=>{
 const calls=[],map={root:[file('p','00.txt','root'),folder('b','10 章','root'),folder('a','2 章','root')],a:[file('a2','10.txt','a'),file('a1','2.txt','a'),folder('sub','小章','a')],sub:[file('s','本文.md','sub')],b:[file('b1','本文.TXT','b'),file('png','画像.png','b')]};
 const provider={listChildren:async id=>{calls.push(id);return map[id];},readText:()=>assert.fail('本文を読まない'),writeText:()=>assert.fail('保存しない')};
 const result=await createManuscriptCatalogJob({provider,root}).promise;
 assert.deepEqual(result.rows.map(x=>x.name),['2 章','小章','本文.md','2.txt','10.txt','10 章','本文.TXT','00.txt']);assert.equal(result.files,5);assert.equal(result.complete,true);assert.equal(result.checked,4);
});
test('失敗した章だけ再試行し、取得済み一覧を読み直さない',async()=>{
 const counts=new Map();const provider={listChildren:async id=>{counts.set(id,(counts.get(id)||0)+1);if(id==='root')return [folder('a','A','root'),folder('b','B','root')];if(id==='b'&&counts.get(id)===1)throw Error('権限がありません');return [file(id+'-file',id+'.txt',id)];}};
 const first=await createManuscriptCatalogJob({provider,root}).promise;assert.equal(first.complete,false);assert.equal(first.files,1);assert.equal(first.issues[0].retryable,true);
 const second=await createManuscriptCatalogJob({provider,root,cachedListings:first.listings}).promise;assert.equal(second.complete,true);assert.equal(second.files,2);assert.equal(counts.get('root'),1);assert.equal(counts.get('a'),1);assert.equal(counts.get('b'),2);
});
test('中止は直ちに取得済みの状態を返し、待機中の応答から新しい章を取得しない',async()=>{
 const pending=wait(),calls=[];const provider={listChildren:async id=>{calls.push(id);if(id==='root')return [folder('a','A','root'),folder('b','B','root'),folder('c','C','root')];await pending.promise;return [folder('child','子',id)];}};
 const job=createManuscriptCatalogJob({provider,root});await tick();const partial=job.cancel();assert.equal(partial.cancelled,true);assert.equal(partial.rows.length,3);pending.resolve();const final=await job.promise;assert.deepEqual(calls,['root','a','b']);assert.equal(final.cancelled,true);assert.equal(final.rows.length,3);
});
test('中止したHTTP応答が残る場合も、新しいジョブとの同時一覧取得を2件以内に保つ',async()=>{
 const pending=wait(),calls=[];let active=0,max=0;
 const provider={listChildren:async id=>{calls.push(id);active++;max=Math.max(max,active);try{if(id==='root')return [folder('a','A','root'),folder('b','B','root')];if(id==='a'||id==='b')await pending.promise;return [];}finally{active--;}}};
 const first=createManuscriptCatalogJob({provider,root});await tick();first.cancel();const second=createManuscriptCatalogJob({provider,root:folder('other','別の原稿')});await tick();assert.equal(calls.includes('other'),false);pending.resolve();await Promise.all([first.promise,second.promise]);assert.equal(max,2);assert.equal(calls.includes('other'),true);
});
test('範囲が変わった応答を採用せず、新たな取得や進捗通知を止める',async()=>{
 const pending=wait();let current=true,progress=0;const calls=[];const provider={listChildren:async id=>{calls.push(id);await pending.promise;return [folder('child','子','root')];}};
 const job=createManuscriptCatalogJob({provider,root,current:()=>current,onProgress:()=>progress++});current=false;pending.resolve();const result=await job.promise;assert.equal(result.cancelled,true);assert.equal(result.rows.length,0);assert.equal(progress,0);assert.deepEqual(calls,['root']);
});
test('重複・管理フォルダ・参照リンクを追わず、確認できないIDや親を区別する',async()=>{
 const calls=[];const provider={listChildren:async id=>{calls.push(id);return [folder('root','循環','root'),folder('meta','.mojigoto','root'),{...folder('link','リンク','root'),remoteItem:{}},file('one','1.txt','root'),file('one','別名.txt','root'),file('foreign','別親.txt','other'),{file:{},name:'IDなし.txt'}];}};
 const r=await createManuscriptCatalogJob({provider,root}).promise;assert.deepEqual(calls,['root']);assert.equal(r.files,1);assert.equal(r.excluded,4);assert.equal(r.complete,false);assert.equal(r.issues.length,2);
});
test('フォルダ数・階層・項目数の上限は部分取得とし、完了扱いにしない',async()=>{
 for(const limits of [{maxFolders:1},{maxDepth:0},{maxEntries:1}]){const calls=[];const provider={listChildren:async id=>{calls.push(id);return id==='root'?[folder('a','A','root'),file('b','B.txt','root')]:[];}};const r=await createManuscriptCatalogJob({provider,root,...limits}).promise;assert.equal(r.complete,false);assert.ok(r.issues.some(x=>!x.retryable));assert.deepEqual(calls,['root']);}
});
test('原稿なしとルートの取得失敗を区別し、未知の総件数を空として完了しない',async()=>{
 const empty=await createManuscriptCatalogJob({provider:{listChildren:async()=>[]},root}).promise;assert.equal(empty.complete,true);assert.equal(empty.files,0);
 const failed=await createManuscriptCatalogJob({provider:{listChildren:async()=>{throw Error('通信失敗');}},root}).promise;assert.equal(failed.complete,false);assert.equal(failed.issues[0].path,'原稿');assert.equal(failed.issues[0].retryable,true);
});

test('同名原稿の並びは一覧応答の順序に左右されずIDで安定させる',async()=>{
 const items=[file('b','同名.txt','root'),file('a','同名.txt','root')];
 const first=await createManuscriptCatalogJob({provider:{listChildren:async()=>items},root}).promise;
 const second=await createManuscriptCatalogJob({provider:{listChildren:async()=>[...items].reverse()},root}).promise;
 assert.deepEqual(first.rows.map(row=>row.key),second.rows.map(row=>row.key));assert.equal(first.files,2);
});

test('DropboxのIDと親パスが異なっても、章と原稿をページ送り込みで取得する', async () => {
 const { DropboxProvider } = await import('../web/storage/dropbox-provider.mjs');
 const requests=[];
 const entry=(tag,id,name,p)=>({'.tag':tag,id,name,path_lower:p.toLowerCase(),path_display:p});
 const provider=new DropboxProvider({getAccessToken:async()=>'synthetic'}, async(url, options)=>{
  const args=JSON.parse(options.body); requests.push([url.split('/').pop(),args]);
  if(url.endsWith('/continue')) return Response.json({entries:[entry('file','id:root-file','序章.txt','/作品/原稿/序章.txt')],has_more:false});
  assert.ok(url.endsWith('/list_folder'), '本文・保存・メタデータAPIを呼ばない');
  if(args.path==='id:root')return Response.json({entries:[entry('folder','id:chapter','第一章','/作品/原稿/第一章')],has_more:true,cursor:'page2'});
  assert.equal(args.path,'id:chapter');
  return Response.json({entries:[entry('file','id:body','本文.md','/作品/原稿/第一章/本文.md')],has_more:false});
 });
 const result=await createManuscriptCatalogJob({provider,root:{id:'id:root',name:'原稿',folder:{}}}).promise;
 assert.equal(result.complete,true); assert.equal(result.files,2); assert.equal(result.checked,2);
 assert.deepEqual(result.issues,[]); assert.deepEqual(result.rows.map(r=>r.name),['第一章','本文.md','序章.txt']);
 assert.equal(requests.length,3); assert.equal(requests[1][1].cursor,'page2');
});
