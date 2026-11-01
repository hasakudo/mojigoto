import assert from "node:assert/strict";
import test from "node:test";
import { createProgressActions } from "../web/lib/progress-actions.mjs";

function harness() {
  const calls=[], timers=[], input=[{value:"title",checked:false},{value:"today",checked:true}];
  const elements={progressShareCanvas:{toBlob:cb=>cb(new Blob(["png"],{type:"image/png"})),toDataURL:()=>"data:image/png;base64,cG5n"},progressShareOptions:{querySelector:()=>input[0],querySelectorAll:()=>input},progressShareStatus:{},progressShareMode:{value:"daily"}};
  const state={progressSummary:{period:{date:"2026-10-27"},work:{title:"PRIVATE:作品"}}};
  const link={click(){calls.push(["download",this.download,this.href]);}};
  class ClipboardItem { constructor(value){this.value=value;} }
  const navigator={clipboard:{write:async value=>calls.push(["image",value]),writeText:async value=>calls.push(["text",value])},canShare:()=>true,share:async value=>calls.push(["share",value])};
  const options={state,elements,document:{createElement:()=>link},navigator,URL:{createObjectURL:()=>"blob:qa",revokeObjectURL:url=>calls.push(["revoke",url])},Blob,File,atob,ClipboardItem,globalThis:{ClipboardItem},setTimeout:cb=>timers.push(cb),createProgressShareText:(_summary,values,mode)=>JSON.stringify({values,mode})};
  return {controller:createProgressActions(options),options,elements,input,calls,timers};
}

test("PNG保存は画像Blobと作品名OFFのファイル名を使いURLを後で解放する",async()=>{
  const h=harness();await h.controller.saveProgressImage();
  assert.deepEqual(h.calls[0],["download","もじごと進捗_20261027_作品.png","blob:qa"]);
  assert.match(h.elements.progressShareStatus.textContent,/保存しました/);assert.equal(h.timers.length,1);
  h.timers[0]();assert.deepEqual(h.calls[1],["revoke","blob:qa"]);
});

test("PNG変換失敗ではダウンロードせず失敗を表示する",async()=>{
  const h=harness();h.elements.progressShareCanvas.toBlob=cb=>cb(null);
  await h.controller.saveProgressImage();assert.equal(h.calls.length,0);assert.match(h.elements.progressShareStatus.textContent,/PNG画像を作成できません/);
});

test("画像コピーはPNGだけを渡し、未対応時は保存へ案内する",async()=>{
  const h=harness();await h.controller.copyProgressImage();
  const blob=h.calls[0][1][0].value["image/png"];assert.equal(blob.type,"image/png");assert.equal(await blob.text(),"png");
  const unsupported=harness();unsupported.options.globalThis.ClipboardItem=null;await unsupported.controller.copyProgressImage();
  assert.equal(unsupported.calls.length,0);assert.match(unsupported.elements.progressShareStatus.textContent,/PNG保存をご利用/);
});

test("投稿文コピーは現在の表示設定とモードを使い、拒否は失敗表示にする",async()=>{
  const h=harness();await h.controller.copyProgressText();
  assert.deepEqual(JSON.parse(h.calls[0][1]),{values:{title:false,today:true},mode:"daily"});
  h.options.navigator.clipboard.writeText=async()=>{throw Error("clipboard denied");};await h.controller.copyProgressText();
  assert.equal(h.elements.progressShareStatus.textContent,"clipboard denied");
});

test("画像共有はユーザー操作の同じ呼出内でPNGと投稿文を共有APIへ渡す",async()=>{
  const h=harness();const sharing=h.controller.shareProgress();
  assert.equal(h.calls[0][0],"share","非同期のPNG変換を待たずに共有APIを呼ぶ");
  const payload=h.calls[0][1];assert.equal(payload.files[0].type,"image/png");assert.equal(payload.files[0].name,"もじごと進捗_20261027_作品.png");
  assert.equal(await payload.files[0].text(),"png");await sharing;assert.match(h.elements.progressShareStatus.textContent,/画像と投稿文を共有/);
});

test("ファイル共有非対応時は投稿文だけを渡し画像追加を案内する",async()=>{
  const h=harness();h.options.navigator.canShare=()=>false;await h.controller.shareProgress();
  assert.equal(h.calls[0][1].files,undefined);assert.match(h.elements.progressShareStatus.textContent,/画像は保存またはコピー/);
});

test("共有キャンセルは失敗と区別し、通常の拒否は理由を表示する",async()=>{
  const h=harness();h.options.navigator.share=async()=>{throw Object.assign(Error("cancel"),{name:"AbortError"});};
  await h.controller.shareProgress();assert.equal(h.elements.progressShareStatus.textContent,"共有をキャンセルしました。");
  h.options.navigator.share=async()=>{throw Error("share denied");};await h.controller.shareProgress();
  assert.equal(h.elements.progressShareStatus.textContent,"share denied");
});

test("File未対応でも投稿文は共有でき、共有APIがない場合は案内する",async()=>{
  const h=harness();const controller=createProgressActions({...h.options,File:undefined});await controller.shareProgress();
  assert.equal(h.calls[0][1].files,undefined);
  h.options.navigator.share=undefined;await controller.shareProgress();assert.match(h.elements.progressShareStatus.textContent,/共有機能に対応していません/);
});
