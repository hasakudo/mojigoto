import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewManuscriptOpener, manuscriptCatalogLocation } from '../web/lib/preview-manuscript-navigation.mjs';
const folder=(id,parent)=>({id,name:id,folder:{},parentReference:{id:parent}}),file=(id,parent)=>({id,name:id+'.txt',file:{},eTag:'1',parentReference:{id:parent}});
function fixture(){
 const root=folder('root','work'),chapter=folder('chapter','root'),a=file('a','root'),b=file('b','chapter'),events=[];
 const state={selectedWork:{id:'work',manuscript:root},currentFile:a,dirty:true,originalContent:'old',fileLoadRequest:0};
 const elements={readerSection:{hidden:false},readerContent:{value:'draft',selectionStart:2}};let current=true;
 state.provider={getItemMetadata:async item=>{events.push('metadata:'+item.id);return item;},readText:async item=>{events.push('read:'+item.id);return 'fresh';}};
 const deps={state,elements,saveCurrentFile:async()=>{events.push('save');state.dirty=false;state.originalContent=elements.readerContent.value;state.currentFile={...a,eTag:'2'};},openFile:async(item,options)=>{events.push(['open',item,options]);return true;},cancelAutoSave:()=>events.push('cancel'),scheduleAutoSave:()=>events.push('schedule'),stopExternalMonitor:()=>events.push('stop'),startExternalMonitor:()=>events.push('monitor')};
 const request={file:b,folder:chapter,trail:[chapter],isCurrent:()=>current};return {state,elements,events,deps,request,root,chapter,a,b,close:()=>current=false,open:()=>createPreviewManuscriptOpener(deps)(request)};
}
test('目次の階層から原稿の章と履歴用のtrailを求め、別の章や直下へも正しく戻す',()=>{
 const root=folder('root'),a=folder('a','root'),sub=folder('sub','a'),b=folder('b','root');const rows=[{key:'a',kind:'folder',status:'loaded',depth:0,item:a},{key:'s',kind:'folder',status:'loaded',depth:1,item:sub},{key:'x',kind:'file',status:'listed',depth:2,item:file('x','sub')},{key:'b',kind:'folder',status:'loaded',depth:0,item:b},{key:'y',kind:'file',status:'listed',depth:1,item:file('y','b')},{key:'z',kind:'file',status:'listed',depth:0,item:file('z','root')}];
 assert.deepEqual(manuscriptCatalogLocation(rows,root,'x').trail,[a,sub]);assert.equal(manuscriptCatalogLocation(rows,root,'y').folder.id,'b');assert.deepEqual(manuscriptCatalogLocation(rows,root,'z').trail,[]);assert.throws(()=>manuscriptCatalogLocation(rows,root,'none'),/確認できません/);
});
test('同じ原稿なら未保存のまま再取得も保存もせず編集へ戻す',async()=>{const h=fixture();h.request.file=h.a;assert.equal(await h.open(),true);assert.deepEqual(h.events,[]);assert.equal(h.state.dirty,true);assert.equal(h.elements.readerContent.selectionStart,2);});
test('別原稿は保存成功後にメタデータ・最新本文を取得し、章を添えて開く',async()=>{const h=fixture();assert.equal(await h.open(),true);assert.ok(h.events.indexOf('save')<h.events.indexOf('read:b'));const entry=h.events.find(Array.isArray);assert.equal(entry[2].content,'fresh');assert.equal(entry[2].location.folder.id,'chapter');assert.deepEqual(entry[2].location.trail,[h.chapter]);assert.equal(h.state.openingPreviewManuscript,false);});
test('保存失敗・競合・保存中・非原稿の未保存状態では移動や対象本文取得をしない',async()=>{
 for(const mode of ['failure','conflict','saving','other-editor']){const h=fixture();if(mode==='failure')h.deps.saveCurrentFile=async()=>{};if(mode==='conflict')h.state.externalConflict=true;if(mode==='saving')h.state.saving=true;if(mode==='other-editor')h.elements.readerSection.hidden=true;await assert.rejects(h.open());assert.equal(h.events.some(Array.isArray),false);assert.equal(h.events.includes('read:b'),false);assert.equal(h.state.currentFile.id,'a');}
});
test('元原稿への入力・作品変更・プレビューを閉じる操作があれば遅い本文で遷移しない',async()=>{
 for(const mode of ['input','work','close']){const h=fixture();h.state.provider.readText=async()=>{if(mode==='input')h.elements.readerContent.value='new input';if(mode==='work')h.state.selectedWork={...h.state.selectedWork};if(mode==='close')h.close();return 'late';};assert.equal(await h.open(),false);assert.equal(h.events.some(Array.isArray),false);assert.equal(h.state.currentFile.id,'a');}
});
test('移動・削除・権限不足・本文取得失敗は元の編集を保ち、章を勝手に切り替えない',async()=>{
 for(const mode of ['moved','missing','body']){const h=fixture();if(mode==='moved')h.state.provider.getItemMetadata=async item=>item.id==='b'?{...item,parentReference:{id:'elsewhere'}}:item;if(mode==='missing')h.state.provider.getItemMetadata=async()=>{throw Error('権限不足');};if(mode==='body')h.state.provider.readText=async()=>{throw Error('本文失敗');};await assert.rejects(h.open());assert.equal(h.events.some(Array.isArray),false);assert.equal(h.state.currentFile.id,'a');assert.equal(h.state.originalContent,'draft');}
});
test('一覧からの原稿編集は保存せず最新本文を読み、並行した二重遷移を止める',async()=>{const h=fixture();h.elements.readerSection.hidden=true;h.state.dirty=false;let release;h.state.provider.readText=()=>new Promise(r=>release=r);const first=h.open();await new Promise(r=>setImmediate(r));await assert.rejects(h.open(),/処理中/);release('fresh');assert.equal(await first,true);assert.equal(h.events.includes('save'),false);});
