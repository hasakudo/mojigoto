import assert from "node:assert/strict";
import test from "node:test";
import { readReferenceSources, readReferenceNotes, referenceWorkKey } from "../web/lib/shared-note-reader.mjs";

function fixture(){
  const works=["A","B","C"].map(id=>({id:"folder-"+id,title:"同じ作品名",mojigoto:{id:"meta-"+id},settingsFile:{id:"settings-"+id,file:{}}}));
  const data=new Map(works.flatMap((work,i)=>[[work.settingsFile.id,{workId:"stable-"+i,relatedWorkIds:i===0?["stable-1","unavailable"]:i===1?["stable-0","stable-2"]:[]}],...["plot","reference"].map(type=>[type+"-"+i,{id:"same-note-id",type,title:type+"の作品"+i,groups:[]}])]));
  const calls=[];let active=true;
  const provider={async listChildren(id){calls.push(["list",id]);const i=works.findIndex(work=>work.mojigoto.id===id);if(i>=0)return [{id:"plots-"+i,name:"plots",folder:{}},{id:"references-"+i,name:"references",folder:{}}];const match=/^(plots|references)-(\d)$/.exec(id);return match?[{id:(match[1]==="plots"?"plot":"reference")+"-"+match[2],name:"note.json",file:{}}]:[];},async readText(item){calls.push(["read",item.id]);const value=data.get(item.id);if(value instanceof Error)throw value;return typeof value==="string"?value:JSON.stringify(value);}};
  for(const name of ["createFolder","createTextFile","writeText","deleteItem"])provider[name]=async()=>{calls.push(["MUTATION",name]);throw Error("書込禁止");};
  const context={provider,work:works[0],works,cloudKind:"oneDrive",isCurrent:()=>active};
  return {works,data,calls,provider,context,deactivate:()=>{active=false;}};
}

test("保存済みの直接関連だけを照合し、同名作品・推移的関連と未確認IDを混同しない",async()=>{
  const h=fixture(),result=await readReferenceSources(h.context);
  assert.deepEqual(result.sources.map(s=>s.work.id),["folder-A","folder-B"]);assert.equal(result.sources[1].relation,"mutual");assert.match(result.notice,/1件の関連作品を確認できません/);
  assert.ok(!h.calls.some(row=>row[0]==="MUTATION"));
});
test("クラウドのフォルダIDを設定内workIdの代わりに使わない",async()=>{
  const h=fixture();h.data.get("settings-A").relatedWorkIds=["folder-B"];
  assert.equal((await readReferenceSources(h.context)).sources.length,1);
});
test("欠損した作品IDを生成・保存せず、自作品の参照を残す",async()=>{
  const h=fixture();delete h.data.get("settings-A").workId;const before=JSON.stringify([...h.data]);
  const result=await readReferenceSources(h.context);assert.equal(result.sources.length,1);assert.equal(JSON.stringify([...h.data]),before);assert.equal(h.calls.length,1);
});
for(const target of ["current","peer"])test(target+"のworkIdが重複すると曖昧な作品を参照しない",async()=>{
  const h=fixture();h.data.get("settings-C").workId=target==="current"?"stable-0":"stable-1";
  const result=await readReferenceSources(h.context);assert.equal(result.sources.length,1);assert.match(result.notice,/重複/);
});
test("片側の直接関連は区別し、相手にだけある関連を自動追加しない",async()=>{
  const h=fixture();h.data.get("settings-B").relatedWorkIds=[];
  const result=await readReferenceSources(h.context);assert.equal(result.sources[1].relation,"outgoing");assert.match(result.notice,/片側/);
  h.data.get("settings-A").relatedWorkIds=[];h.data.get("settings-B").relatedWorkIds=["stable-0"];
  assert.equal((await readReferenceSources(h.context)).sources.length,1);
});
test("設定読込失敗や破損は未確認として扱い、設定の関連IDを削除しない",async()=>{
  const h=fixture();h.data.set("settings-B",Error("permission denied"));const ids=[...h.data.get("settings-A").relatedWorkIds];
  const result=await readReferenceSources(h.context);assert.equal(result.sources.length,1);assert.match(result.notice,/一部作品の設定/);assert.deepEqual(h.data.get("settings-A").relatedWorkIds,ids);
});
test("自作品と関連作品のプロット・資料を読み取り、所有作品込みのキーで識別する",async()=>{
  const h=fixture(),before=JSON.stringify(h.works),sources=(await readReferenceSources(h.context)).sources;
  const own=await readReferenceNotes(h.context,sources[0],"plot"),peer=await readReferenceNotes(h.context,sources[1],"plot"),refs=await readReferenceNotes(h.context,sources[1],"reference");
  assert.equal(peer[0].data.title,"plotの作品1");assert.equal(refs[0].data.type,"reference");assert.equal(own[0].data.id,peer[0].data.id);assert.notEqual(own[0].referenceKey,peer[0].referenceKey);
  assert.equal(JSON.stringify(h.works),before);assert.ok(!h.calls.some(row=>row[0]==="MUTATION"));
});
test("欠損フォルダを作らず、Google Driveの未許可は空一覧と区別する",async()=>{
  const h=fixture();h.provider.listChildren=async()=>[];const source={key:referenceWorkKey(h.works[0]),work:h.works[0]};
  assert.deepEqual(await readReferenceNotes(h.context,source,"plot"),[]);h.context.cloudKind="googleDrive";
  await assert.rejects(readReferenceNotes(h.context,source,"plot"),/追加許可/);assert.ok(!h.calls.some(row=>row[0]==="MUTATION"));
});
test("破損ノートを別の本文で補わず失敗を返す",async()=>{
  const h=fixture();h.data.set("plot-0","{broken");await assert.rejects(readReferenceNotes(h.context,{key:referenceWorkKey(h.works[0]),work:h.works[0]},"plot"));
});
test("参照前に関連解除や相手IDの変更があれば元の候補で読み進めない",async()=>{
  for(const change of [h=>{h.data.get("settings-A").relatedWorkIds=[];},h=>{h.data.get("settings-B").workId="changed";}]){
    const h=fixture(),source=(await readReferenceSources(h.context)).sources[1];change(h);h.calls.length=0;
    await assert.rejects(readReferenceNotes(h.context,source,"plot"),/設定が変わりました/);assert.ok(!h.calls.some(row=>row[0]==="list"));
  }
});
test("遅い一覧の完了前に参照画面が変わるとノート本文を読まず中止する",async()=>{
  const h=fixture();let release;h.provider.listChildren=()=>new Promise(resolve=>{release=resolve;});
  const loading=readReferenceNotes(h.context,{key:referenceWorkKey(h.works[0]),work:h.works[0]},"plot");h.deactivate();release([]);
  await assert.rejects(loading,/中止/);assert.equal(h.calls.length,0);
});
test("設定ファイルの探索も読取専用で行いsingleWork.jsonを扱う",async()=>{
  const h=fixture();delete h.works[0].settingsFile;h.provider.listChildren=async()=>[{id:"settings-A",name:"singleWork.json",file:{}}];
  assert.equal((await readReferenceSources(h.context)).sources.length,2);assert.ok(!h.calls.some(row=>row[0]==="MUTATION"));
});

test("保存済み設定はカタログの古いダウンロード情報でなく確認後の項目から読む",async()=>{
  const h=fixture(),read=h.provider.readText;let verified=0;
  h.provider.getItemMetadata=async item=>{verified++;return {...item,verified:true};};
  h.provider.readText=async item=>{if(item.id.startsWith("settings-"))assert.equal(item.verified,true);return read(item);};
  assert.equal((await readReferenceSources(h.context)).sources.length,2);assert.equal(verified,3);
});

test('候補設定の一括確認結果で本文を読み、現在作品の確認と関連解除の再確認を維持する',async()=>{
 const h=fixture(),read=h.provider.readText;const single=[],batches=[];
 h.provider.getItemMetadata=async item=>{single.push(item.id);return {...item,verified:true};};
 h.provider.getItemMetadataBatch=async items=>{batches.push(items.map(i=>i.id));return new Map(items.map(item=>[item,{...item,verified:true}]));};
 h.provider.readText=async item=>{if(item.id.startsWith('settings-'))assert.equal(item.verified,true);return read(item);};
 const result=await readReferenceSources(h.context);assert.deepEqual(single,['settings-A']);assert.deepEqual(batches,[['settings-B','settings-C']]);assert.equal(result.sources.length,2);
 h.data.get('settings-A').relatedWorkIds=[];await assert.rejects(readReferenceNotes(h.context,result.sources[1],'plot'),/設定が変わりました/);
});
test('設定一括確認のエラーはその作品の本文を読まず、古い設定で補わない',async()=>{
 const h=fixture();h.provider.getItemMetadataBatch=async items=>new Map(items.map(item=>[item,item.id==='settings-B'?Error('permission'):item]));
 const result=await readReferenceSources(h.context);assert.equal(result.sources.length,1);assert.match(result.notice,/一部作品の設定/);
 assert.ok(!h.calls.some(([kind,id])=>kind==='read'&&id==='settings-B'));
});
