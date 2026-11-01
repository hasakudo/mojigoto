import assert from "node:assert/strict";
import test from "node:test";
import { createEditorSaveScheduler } from "../web/lib/editor-save-scheduler.mjs";
import { createManuscriptSaveController } from "../web/lib/manuscript-save.mjs";

function clock() {
  let id=0;
  const timeouts=new Map(),intervals=new Map();
  return {timeouts,intervals,
    setTimeout(callback,delay){timeouts.set(++id,{callback,delay});return id;},
    clearTimeout(key){timeouts.delete(key);},
    setInterval(callback,delay){intervals.set(++id,{callback,delay});return id;},
    clearInterval(key){intervals.delete(key);},
    fire(key){const timer=timeouts.get(key);timeouts.delete(key);return timer.callback();},
  };
}
function fixture(extra={}) {
  const state={autoSaveEnabled:true,dirty:true,cloudKind:"oneDrive",...extra};
  const timers=clock(),calls=[];
  const controller=createEditorSaveScheduler({state,timers,autoSaveDelay:2000,externalCheckInterval:3000,
    updateGoogleDriveConnectionNotice:()=>calls.push("reconnect"),checkExternalUpdate:()=>calls.push("check"),
    saveCurrentFile:options=>calls.push(["file",options]),saveCurrentNote:options=>calls.push(["note",options]),
    saveCurrentConceptMemo:options=>calls.push(["concept",options]),saveCurrentWorkSettings:options=>calls.push(["settings",options]),
  });
  return {state,timers,calls,...controller};
}

for(const [field,kind] of [[null,"file"],["currentNote","note"],["currentConceptMemo","concept"],["currentSettings","settings"]]) {
  test(`${kind}の自動保存は連続入力の予約を一つにまとめ、従来の待ち時間と自動保存指定を保つ`,()=>{
    const f=fixture(field?{[field]:{}}:{});
    assert.equal(f.timers.timeouts.size,0,"生成だけでは保存を始めない");
    f.scheduleAutoSave();const first=f.state.autoSaveTimer;
    f.scheduleAutoSave();
    assert.equal(f.timers.timeouts.size,1);
    assert.equal(f.timers.timeouts.has(first),false);
    assert.equal(f.timers.timeouts.get(f.state.autoSaveTimer).delay,2000);
    f.timers.fire(f.state.autoSaveTimer);
    assert.deepEqual(f.calls,[[kind,{automatic:true}]]);
    f.cancelAutoSave();assert.equal(f.state.autoSaveTimer,null);
  });
}

test("保存・同期・競合・画面切替の抑止条件では、既存の予約を取り消して新しく保存しない",()=>{
  for(const change of [{autoSaveEnabled:false},{dirty:false},...['saving','syncing','externalConflict','conceptSwitchPending','relatedOpening','openingRecentManuscript'].map(key=>({[key]:true}))]) {
    const f=fixture();f.scheduleAutoSave();Object.assign(f.state,change);f.scheduleAutoSave();
    assert.equal(f.timers.timeouts.size,0);
    assert.equal(f.state.autoSaveTimer,null);
    assert.deepEqual(f.calls,[]);
  }
});

test("Google Driveの期限切れでは予約を止め、接続回復後に通常の予約へ戻る",()=>{
  let connected=false;
  const f=fixture({cloudKind:"googleDrive",googleDriveAuth:{connectionStatus:()=>({connected})}});
  f.scheduleAutoSave();assert.equal(f.timers.timeouts.size,0);assert.deepEqual(f.calls,["reconnect"]);
  connected=true;f.scheduleAutoSave();assert.equal(f.timers.timeouts.size,1);
});

test("外部監視は二重起動せず従来の間隔で確認し、停止時に解除する",()=>{
  const f=fixture();f.startExternalMonitor();const first=f.state.externalCheckTimer;f.startExternalMonitor();
  assert.equal(f.timers.intervals.size,1);assert.equal(f.timers.intervals.has(first),false);
  const interval=f.timers.intervals.get(f.state.externalCheckTimer);
  assert.equal(interval.delay,3000);interval.callback();assert.deepEqual(f.calls,["check"]);
  f.stopExternalMonitor();assert.equal(f.timers.intervals.size,0);assert.equal(f.state.externalCheckTimer,null);
});

test("実際の保存コントローラーと組み合わせても、保存中の追加入力だけを次の自動保存へ回す",async()=>{
  const state={autoSaveEnabled:true,dirty:true,currentFile:{id:"file",name:"原稿.txt",eTag:"v1"},originalContent:"保存済み",manuscriptTrail:[],selectedWork:{mojigoto:{}}};
  const timers=clock(),writes=[];
  let resolve,savePromise,controller;
  const pending=new Promise(yes=>{resolve=yes;});
  state.provider={writeText:async(_file,content)=>{writes.push(content);return writes.length===1?pending:{eTag:"v3"};}};
  const elements={readerContent:{value:"最初の下書き"},saveFileButton:{},conflictDialog:{open:false,showModal(){this.open=true;}}};
  const scheduler=createEditorSaveScheduler({state,timers,autoSaveDelay:2000,externalCheckInterval:3000,
    saveCurrentFile:options=>{savePromise=controller.saveCurrentFile(options);},checkExternalUpdate(){},updateGoogleDriveConnectionNotice(){},
  });
  controller=createManuscriptSaveController({state,elements,...scheduler,setEditorStatus(){},updateReaderMeta(){},
    captureRecentManuscriptContext(){},recordRecentManuscript(){},countCharacters:value=>value.length,makeWritingEvent:value=>value,
    appendWritingEvent:async()=>{},updateSharedWorkMetrics(){},maybeCreateWebAutomaticBackup(){},notify(){},cloudLabel:()=>"Drive",
  });
  scheduler.scheduleAutoSave();timers.fire(state.autoSaveTimer);
  assert.equal(state.saving,true);
  elements.readerContent.value="保存中に追加入力";
  resolve({eTag:"v2"});await savePromise;
  assert.deepEqual(writes,["最初の下書き"]);
  assert.equal(state.originalContent,"最初の下書き");assert.equal(state.dirty,true);
  assert.equal(timers.timeouts.size,1);
  timers.fire(state.autoSaveTimer);await savePromise;
  assert.deepEqual(writes,["最初の下書き","保存中に追加入力"]);
  assert.equal(state.originalContent,"保存中に追加入力");assert.equal(state.dirty,false);
  assert.equal(timers.timeouts.size,0);
});
