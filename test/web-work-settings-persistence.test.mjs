import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { createWorkSettingsPersistence } from "../web/lib/work-settings-persistence.mjs";
import { normalizeWorkSettings } from "../web/lib/work-settings.mjs";
function deferred(){let resolve;const promise=new Promise(yes=>{resolve=yes;});return{promise,resolve};}
function harness(){
 const data=normalizeWorkSettings({title:"元タイトル",genres:["SF"],custom:{keep:true},exportOptions:{includeSubtitle:false}},"folder");
 const item={id:"settings",name:"work.json",eTag:"v1"};
 const calls={statuses:[],notices:[],writes:[],renders:[],catalog:[],scheduled:0,monitor:0,dialogs:0};
 const state={currentSettings:{item,data,raw:JSON.stringify(data)},selectedWork:{id:"work",name:"folder",title:"元タイトル",mojigoto:{id:"meta"}},workRoot:{id:"root"},works:[],dirty:true,workSettingsDocuments:new Map()};
 const provider={readText:async()=>JSON.stringify(data),writeText:async(file,content,expected)=>{calls.writes.push({file,content,expected});await provider.beforeWrite?.();return{eTag:"v2",lastModifiedDateTime:"2026-10-27T00:00:00Z"};}};state.provider=provider;
 const elements={saveWorkSettingsButton:{},conflictDialog:{open:false,showModal(){this.open=true;calls.dialogs++;}}};
 const controller=createWorkSettingsPersistence({state,elements,cancelAutoSave(){},scheduleAutoSave(){calls.scheduled++;},setWorkSettingsStatus:(...args)=>calls.statuses.push(args),renderWorkSettings:()=>calls.renders.push(structuredClone(state.currentSettings.data)),startExternalMonitor(){calls.monitor++;},persistWorkCatalog:(...args)=>calls.catalog.push(args),renderWorksList(){},notify:(...args)=>calls.notices.push(args),cloudLabel:()=>"検証クラウド"});
 return{state,provider,elements,calls,...controller};
}
test("作品設定保存は未知項目と書出設定を保持し一覧・キャッシュを更新する",async()=>{
 const h=harness();Object.assign(h.state.currentSettings.data,{title:"  新タイトル  ",genres:["SF","sf","歴史",""],targetChars:-10,status:"draft"});
 await h.saveCurrentWorkSettings();const saved=JSON.parse(h.calls.writes[0].content);
 assert.equal(saved.title,"新タイトル");assert.deepEqual(saved.genres,["SF","歴史"]);assert.equal(saved.genre,"SF, 歴史");assert.equal(saved.targetChars,0);
 assert.deepEqual(saved.custom,{keep:true});assert.equal(saved.exportOptions.includeSubtitle,false);
 assert.equal(h.calls.writes[0].expected,"v1");assert.equal(h.state.currentSettings.item.eTag,"v2");
 assert.equal(h.state.selectedWork.title,"新タイトル");assert.equal(h.state.selectedWork.status,"draft");
 assert.equal(h.state.workSettingsDocuments.get("work").value,h.state.currentSettings);assert.equal(h.calls.catalog.length,1);
 assert.equal(h.state.dirty,false);assert.equal(h.calls.statuses.at(-1)[0],"保存済み");assert.match(h.calls.notices[0][0],/作品設定を検証クラウドへ保存/);
});
test("保存中の追加入力は保存した本文に混ぜず画面と下書きに保持する",async()=>{
 const h=harness(),entered=deferred(),release=deferred();h.provider.beforeWrite=async()=>{entered.resolve();await release.promise;};
 const saving=h.saveCurrentWorkSettings({automatic:true});await entered.promise;
 h.state.currentSettings.data.title="通信中の追記";h.state.currentSettings.data.memo="新しいメモ";h.state.dirty=true;
 release.resolve();await saving;
 assert.equal(JSON.parse(h.state.currentSettings.raw).title,"元タイトル");assert.equal(h.state.currentSettings.data.title,"通信中の追記");
 assert.equal(h.state.selectedWork.title,"元タイトル");assert.equal(h.calls.renders.at(-1).memo,"新しいメモ");
 assert.equal(h.state.dirty,true);assert.equal(h.calls.scheduled,1);assert.equal(h.calls.statuses.at(-1)[0],"未保存");assert.equal(h.calls.notices.length,0);
});
test("自動保存も条件付き保存を通し通常の成功通知を省略する",async()=>{
 const h=harness();await h.saveCurrentWorkSettings({automatic:true});assert.equal(h.calls.writes.length,1);assert.equal(h.calls.notices.length,0);assert.equal(h.state.dirty,false);
});
test("設定保存の競合は下書きと保存済み基準を保持し再保存を止める",async()=>{
 const h=harness(),raw=h.state.currentSettings.raw;h.provider.writeText=async()=>{throw Object.assign(new Error("conflict"),{code:"conflict"});};
 await h.saveCurrentWorkSettings();assert.equal(h.state.currentSettings.raw,raw);assert.equal(h.state.currentSettings.item.eTag,"v1");assert.equal(h.state.dirty,true);assert.equal(h.state.externalConflict,true);assert.equal(h.calls.dialogs,1);assert.equal(h.calls.catalog.length,0);
 h.provider.writeText=async()=>{throw new Error("保存しない");};await h.saveCurrentWorkSettings();assert.equal(h.calls.statuses.at(-1)[0],"外部更新あり");
});
test("通信失敗では本文・一覧キャッシュを進めず保存失敗を表示する",async()=>{
 const h=harness(),raw=h.state.currentSettings.raw;h.provider.writeText=async()=>{throw new Error("offline");};
 await h.saveCurrentWorkSettings();assert.equal(h.state.currentSettings.raw,raw);assert.equal(h.state.dirty,true);assert.equal(h.state.saving,false);assert.equal(h.calls.catalog.length,0);assert.equal(h.calls.statuses.at(-1)[0],"保存失敗");assert.equal(h.calls.notices[0][0],"offline");
});
test("設定読込と再読込は正規化した最新版を表示し外部監視を再開する",async()=>{
 const h=harness();h.provider.readText=async item=>JSON.stringify({title:item.eTag==="external"?"外部更新":"読込タイトル",custom:{keep:7},exportOptions:{includeSubtitle:false}});
 await h.loadWorkSettings(h.state.currentSettings.item);assert.equal(h.state.currentSettings.data.title,"読込タイトル");assert.equal(h.state.dirty,false);assert.equal(h.calls.monitor,1);assert.equal(h.calls.renders.at(-1).custom.keep,7);
 await h.reloadWorkSettings({...h.state.currentSettings.item,eTag:"external"});assert.equal(h.state.currentSettings.data.title,"外部更新");assert.equal(h.calls.monitor,2);assert.equal(h.state.currentSettings.data.exportOptions.includeSubtitle,false);
});
test("設定読込の失敗では既存の下書きを置き換えない",async()=>{
 const h=harness(),current=h.state.currentSettings;h.provider.readText=async()=>"{broken";await assert.rejects(h.loadWorkSettings(current.item));assert.equal(h.state.currentSettings,current);assert.equal(h.state.dirty,true);assert.equal(h.calls.monitor,0);
});
test("初期化時は保存タイマーの宣言前でもコールバックを実行しない",async()=>{
 const app=await readFile(new URL("../web/app.mjs",import.meta.url),"utf8");
 const start=app.indexOf("const { ensureWorkSettingsFile, loadWorkSettings, reloadWorkSettings, saveCurrentWorkSettings }");
 const end=app.indexOf("\n});",start)+4;assert.ok(start>=0&&end>start);
 const h=harness();
 const context={createWorkSettingsPersistence,state:h.state,elements:h.elements,setWorkSettingsStatus(){},renderWorkSettings(){},persistWorkCatalog(){},renderWorksList(){},notify(){},cloudLabel(){return "test";}};
 vm.runInNewContext(app.slice(start,end)+"\nconst cancelAutoSave = () => {}; const scheduleAutoSave = () => {}; const startExternalMonitor = () => {};",context);
});
