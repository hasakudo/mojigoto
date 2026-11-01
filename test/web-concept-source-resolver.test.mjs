import test from "node:test";
import assert from "node:assert/strict";
import { createConceptSourceResolver } from "../web/lib/concept-source-resolver.mjs";
function deferred() { let resolve; const promise=new Promise(yes=>{resolve=yes;}); return {promise,resolve}; }
function harness(count=13) {
  const files=Array.from({length:count},(_,index)=>({id:`file-${index}`,name:index===0?"target.json":`other-${index}.json`,file:{},eTag:`v${index}`}));
  const bodies=new Map(files.map((file,index)=>[file.id,JSON.stringify({id:`note-${index}`,type:"plot",groups:[{id:"group",items:[{id:index===0?"target":"other",kind:"entry",memo:{body:`body-${index}`}}]}]})]));
  const calls={lists:[],reads:[],folders:[],metrics:[]};
  const provider={listChildren:async id=>{calls.lists.push(id);return files;},readText:async file=>{calls.reads.push(file.id);await provider.beforeRead?.(file);return bodies.get(file.id);}};
  const source={kind:"noteItem",noteType:"plot",notePath:"C:\\work\\.mojigoto\\plots\\target.json",itemId:"target",groupId:"group"};
  const state={provider,selectedWork:{id:"work"},workRoot:{id:"root"},currentConceptMemo:{source}};
  const controller=createConceptSourceResolver({state,ensureNoteFolder:async(type,options)=>{calls.folders.push({type,...options});return{id:"notes"};},beginPerformanceMeasurement:(label,details)=>extra=>calls.metrics.push({label,...details,...extra})});
  return{state,provider,source,files,bodies,calls,...controller};
}
test("13ノートあっても出典のファイル名が分かれば本文は1ファイルだけ取得する",async()=>{
  const h=harness();const result=await h.findConceptSourceEntry();
  assert.equal(result.entry.item.id,"file-0");assert.equal(result.entry.item.eTag,"v0");
  assert.deepEqual(h.calls.reads,["file-0"]);assert.deepEqual(h.calls.lists,["notes"]);
  assert.equal(h.calls.folders[0].create,false);assert.equal(h.calls.metrics[0].reads,1);assert.equal(h.calls.metrics[0].listedFiles,13);assert.equal(h.calls.metrics[0].fallback,false);
});
test("次の同期は保存済み本文をキャッシュせず最新の版と本文を読む",async()=>{
  const h=harness();await h.findConceptSourceEntry();
  const changed=JSON.parse(h.bodies.get("file-0"));changed.groups[0].items[0].memo.body="外部で更新";
  h.bodies.set("file-0",JSON.stringify(changed));h.files[0]={...h.files[0],eTag:"latest"};
  const result=await h.findConceptSourceEntry();
  assert.equal(result.item.memo.body,"外部で更新");assert.equal(result.entry.item.eTag,"latest");assert.equal(h.calls.reads.length,2);
});
test("同時の出典参照と同期は取得を共有し、編集用の結果は共有しない",async()=>{
  const h=harness(),entered=deferred(),release=deferred();
  h.provider.beforeRead=async()=>{entered.resolve();await release.promise;};
  const one=h.findConceptSourceEntry();await entered.promise;const two=h.findConceptSourceEntry();release.resolve();
  const[a,b]=await Promise.all([one,two]);
  assert.equal(h.calls.reads.length,1);assert.equal(h.calls.metrics[0].sharedWaiters,1);
  a.item.memo.body="ローカル変更";assert.equal(b.item.memo.body,"body-0");
  assert.equal(a.item,a.entry.data.groups[0].items[0]);
});
test("改名後はIDによる探索へ戻り、同じ項目を発見できる",async()=>{
  const h=harness(4);h.files[0].name="renamed.json";
  const result=await h.findConceptSourceEntry();assert.equal(result.entry.item.name,"renamed.json");
  assert.equal(h.calls.reads.length,4);assert.equal(h.calls.metrics[0].fallback,true);
});
test("指定ファイルから項目が移動した場合も二度読みせず探索する",async()=>{
  const h=harness(3);const first=JSON.parse(h.bodies.get("file-0"));first.groups[0].items=[];h.bodies.set("file-0",JSON.stringify(first));
  const moved=JSON.parse(h.bodies.get("file-1"));moved.groups[0].items[0].id="target";h.bodies.set("file-1",JSON.stringify(moved));
  const result=await h.findConceptSourceEntry();assert.equal(result.entry.item.id,"file-1");assert.equal(h.calls.reads.filter(id=>id==="file-0").length,1);
});
test("同じ項目IDが他ファイルにもあっても指定ファイルを優先する",async()=>{
  const h=harness(3);const duplicate=JSON.parse(h.bodies.get("file-1"));duplicate.groups[0].items[0].id="target";h.bodies.set("file-1",JSON.stringify(duplicate));
  const result=await h.findConceptSourceEntry();assert.equal(result.entry.item.id,"file-0");assert.deepEqual(h.calls.reads,["file-0"]);
});
test("出典ファイルの破損は他ファイルへの自動反映で代用しない",async()=>{
  const h=harness();h.bodies.set("file-0","{broken");await assert.rejects(h.findConceptSourceEntry());
  assert.deepEqual(h.calls.reads,["file-0"]);assert.equal(h.calls.metrics[0].failed,true);
});
test("取得失敗後の再試行は失敗したPromiseを再利用しない",async()=>{
  const h=harness();h.provider.beforeRead=async()=>{throw new Error("offline");};await assert.rejects(h.findConceptSourceEntry(),/offline/);
  h.provider.beforeRead=null;const result=await h.findConceptSourceEntry();assert.equal(result.entry.item.id,"file-0");assert.equal(h.calls.reads.length,2);
});
for(const target of ["provider","work","root"]){
  test(`出典取得中に${target}が変わったら古い結果を返さない`,async()=>{
    const h=harness();h.provider.beforeRead=async()=>{if(target==="provider")h.state.provider={};if(target==="work")h.state.selectedWork={id:"other"};if(target==="root")h.state.workRoot={id:"other"};};
    await assert.rejects(h.findConceptSourceEntry(),/切り替わった/);assert.equal(h.calls.metrics[0].failed,true);
  });
}
test("出典なし・項目IDなしではノートを列挙しない",async()=>{
  const h=harness();await assert.rejects(h.findConceptSourceEntry({source:null}));await assert.rejects(h.findConceptSourceEntry({source:{kind:"noteItem"}}));assert.equal(h.calls.lists.length,0);
});

test("同名ファイルが複数ある場合は従来のグループIDによる優先順位で探索する", async () => {
  const h=harness(3); h.files[1].name="target.json";
  const wrong=JSON.parse(h.bodies.get("file-0")); wrong.groups[0].id="different-group"; h.bodies.set("file-0",JSON.stringify(wrong));
  const correct=JSON.parse(h.bodies.get("file-1")); correct.groups[0].items[0].id="target"; h.bodies.set("file-1",JSON.stringify(correct));
  const result=await h.findConceptSourceEntry();
  assert.equal(result.entry.item.id,"file-1"); assert.equal(h.calls.metrics[0].fallback,true);
});
function enableVerifiedRead(h) {
  h.provider.supportsVersionedContentCache = true;
  for (const file of h.files) file.parentReference = { id: "notes" };
  h.calls.metadata = [];
  h.provider.getItemMetadata = async item => { h.calls.metadata.push(item.id); await h.provider.beforeMetadata?.(); return structuredClone(h.files.find(file => file.id === item.id)); };
}
test("OneDriveの同じ版の出典は毎回版確認し一覧と本文の再取得を省く", async () => {
  const h = harness(); enableVerifiedRead(h); await h.findConceptSourceEntry();
  const result = await h.findConceptSourceEntry(); result.item.memo.body = "入力を混ぜない";
  assert.equal(h.calls.lists.length, 1); assert.equal(h.calls.reads.length, 1); assert.equal(h.calls.metadata.length, 1);
  assert.equal(h.calls.metrics.at(-1).bodyCacheHit, true);
  assert.equal(h.calls.metrics.at(-1).reads, 0);
  assert.equal((await h.findConceptSourceEntry()).item.memo.body, "body-0");
});
test("版が変わった出典は最新本文を取得して一覧は省く", async () => {
  const h = harness(); enableVerifiedRead(h); await h.findConceptSourceEntry();
  h.files[0].eTag = "new"; const data = JSON.parse(h.bodies.get("file-0")); data.groups[0].items[0].memo.body = "外部更新"; h.bodies.set("file-0", JSON.stringify(data));
  const result = await h.findConceptSourceEntry();
  assert.equal(result.item.memo.body, "外部更新"); assert.equal(result.entry.item.eTag, "new");
  assert.equal(h.calls.lists.length, 1); assert.equal(h.calls.reads.length, 2);
  assert.equal(h.calls.metrics.at(-1).bodyCacheHit, false);
});
test("確認中の改名は以前の本文を使わずID探索へ戻す", async () => {
  const h = harness(3); enableVerifiedRead(h); await h.findConceptSourceEntry(); h.files[0].name = "renamed.json";
  const result = await h.findConceptSourceEntry(); assert.equal(result.entry.item.name, "renamed.json");
  assert.equal(h.calls.lists.length, 2); assert.equal(h.calls.metrics.at(-1).fallback, true);
});
test("削除された出典は再探索し同名で作り直されたファイルを取得する", async () => {
  const h = harness(1); enableVerifiedRead(h); await h.findConceptSourceEntry();
  h.provider.getItemMetadata = async () => { throw Object.assign(new Error("not found"), { status: 404 }); };
  h.files[0] = { ...h.files[0], id: "replacement", eTag: "replacement-v1" }; h.bodies.set("replacement", h.bodies.get("file-0"));
  assert.equal((await h.findConceptSourceEntry()).entry.item.id, "replacement"); assert.equal(h.calls.lists.length, 2);
});
test("版確認の通信失敗では以前の本文で同期を進めない", async () => {
  const h = harness(); enableVerifiedRead(h); await h.findConceptSourceEntry();
  h.provider.getItemMetadata = async () => { throw new Error("offline"); };
  await assert.rejects(h.findConceptSourceEntry(), /offline/); assert.equal(h.calls.reads.length, 1);
});
test("版確認中の作品切替では再利用した本文を返さない", async () => {
  const h = harness(); enableVerifiedRead(h); await h.findConceptSourceEntry();
  h.provider.beforeMetadata = async () => { h.state.selectedWork = { id: "other" }; };
  await assert.rejects(h.findConceptSourceEntry(), /切り替わった/);
});
test("自分で書き込んだ出典も次の版確認後に再利用する", async () => {
  const h = harness(); enableVerifiedRead(h); const result = await h.findConceptSourceEntry();
  result.entry.item.eTag = h.files[0].eTag = "saved"; result.item.memo.body = "反映した本文"; result.entry.raw = JSON.stringify(result.entry.data);
  h.cacheConceptSourceEntry(h.state.currentConceptMemo, result.entry);
  assert.equal((await h.findConceptSourceEntry()).item.memo.body, "反映した本文"); assert.equal(h.calls.reads.length, 1);
});

test("ルート情報が未設定でも初回は未確認の本文を再利用しない", async () => {
  const h = harness(); enableVerifiedRead(h); h.state.workRoot = undefined;
  assert.equal((await h.findConceptSourceEntry()).entry.item.id, "file-0");
  assert.equal(h.calls.lists.length, 1); assert.equal(h.calls.metadata.length, 0);
});
