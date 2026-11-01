import test from "node:test";
import assert from "node:assert/strict";
import { readVerifiedFile } from "../web/lib/verified-file-read.mjs";
function harness() {
 const item={id:"file",name:"note.json",file:{},eTag:"v1",parentReference:{id:"folder",driveId:"drive"}};
 const cached={item:structuredClone(item),raw:"saved"};let reads=0;
 const provider={supportsVersionedContentCache:true,getItemMetadata:async()=>structuredClone(item),readText:async()=>{reads++;return "latest";}};
 return {item,cached,provider,reads:()=>reads};
}
test("版が同じなら本文を取得せず、変更時だけ新しい本文を読む",async()=>{
 const h=harness();assert.equal((await readVerifiedFile(h.provider,h.cached,"folder","note.json")).raw,"saved");assert.equal(h.reads(),0);
 h.item.eTag="v2";const result=await readVerifiedFile(h.provider,h.cached,"folder","note.json");assert.equal(result.raw,"latest");assert.equal(result.item.eTag,"v2");assert.equal(h.reads(),1);
});
test("ファイルの移動・改名・版不明・別ドライブなら再探索を要求する",async()=>{
 for(const change of [h=>{h.item.parentReference.id="other";},h=>{h.item.parentReference.driveId="other";},h=>{h.item.name="other.json";},h=>{delete h.item.eTag;},h=>{h.item.id="other";}]){
 const h=harness();change(h);assert.equal(await readVerifiedFile(h.provider,h.cached,"folder","note.json"),null);assert.equal(h.reads(),0);}
});
test("削除は再探索、通信・認証エラーは停止する",async()=>{
 for(const status of [404,403,500]){const h=harness();h.provider.getItemMetadata=async()=>{throw Object.assign(new Error("request failed"),{status});};
 if(status===404)assert.equal(await readVerifiedFile(h.provider,h.cached,"folder","note.json"),null);else await assert.rejects(readVerifiedFile(h.provider,h.cached,"folder","note.json"));}
});
test("対応を宣言しない接続先では保存した本文を再利用しない",async()=>{
 const h=harness();h.provider.supportsVersionedContentCache=false;h.provider.getItemMetadata=()=>{throw new Error("unused");};assert.equal(await readVerifiedFile(h.provider,h.cached,"folder","note.json"),null);
});
