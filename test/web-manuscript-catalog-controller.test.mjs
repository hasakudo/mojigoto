import test from 'node:test';
import assert from 'node:assert/strict';
import { createManuscriptCatalogController } from '../web/lib/manuscript-catalog-controller.mjs';
import { createManuscriptCatalogJob } from '../web/lib/manuscript-catalog.mjs';
class Node { constructor(){Object.assign(this,{hidden:false,open:false,disabled:false,value:'',textContent:'',children:[],listeners:{},scrollTop:0});}addEventListener(k,f){this.listeners[k]=f;}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}showModal(){this.open=true;}close(){this.open=false;this.listeners.close?.();} }
function fixture(provider){
 const names=['wholeBodyPane','wholeBodyOpen','wholeBodyBack','wholeBodyPrevious','wholeBodyNext','wholeBodyRetry','wholeBodyStop','wholeBodyStatus','wholeBodyContent','readerContent','wholeManuscriptPagination','wholeManuscriptToolbar','wholeManuscriptHelp','filesSection','readerSection','readerPreviewLauncher','wholeManuscriptDialog','openWholeManuscriptButton','readerWholeManuscriptButton','closeWholeManuscriptButton','stopWholeManuscriptButton','refreshWholeManuscriptButton','retryWholeManuscriptButton','wholeManuscriptList','wholeManuscriptNotice','wholeManuscriptStatus','wholeManuscriptTitle','wholeManuscriptPrev','wholeManuscriptNext','wholeManuscriptPage'];
 const e=Object.fromEntries(names.map(k=>[k,new Node()]));e.readerSection.hidden=true;
 const state={provider,selectedWork:{id:'work',title:'作品',manuscript:{id:'root',name:'原稿',folder:{}}},manuscriptFolder:{id:'root'},dirty:true,currentFile:{id:'editing'},originalContent:'保存済み'};let scope='owner';const jobs=[],notices=[];
 const c=createManuscriptCatalogController({state,elements:e,document:{createElement:()=>new Node(),createTextNode:text=>({textContent:text})},scopeKey:()=>scope,notify:m=>notices.push(m),createJob:options=>{const job=createManuscriptCatalogJob(options);jobs.push(job);return job;}});
 return {e,state,c,jobs,notices,setScope:s=>scope=s};
}
test('目次を50件ずつ表示し、原稿・下書き・保存状態を変更しない',async()=>{
 const provider={listChildren:async()=>Array.from({length:120},(_,i)=>({id:String(i),name:(i+1)+'.txt',file:{}})),readText:()=>assert.fail('本文を読まない'),writeText:()=>assert.fail('保存しない')};
 const h=fixture(provider),before=JSON.stringify(h.state);h.c.open();await h.jobs[0].promise;
 assert.equal(h.e.wholeManuscriptList.children.length,50);assert.equal(h.e.wholeManuscriptPage.textContent,'1 / 3');assert.equal(JSON.stringify(h.state),before);
 h.e.wholeManuscriptNext.listeners.click();assert.equal(h.e.wholeManuscriptPage.textContent,'2 / 3');h.e.wholeManuscriptNext.listeners.click();assert.equal(h.e.wholeManuscriptList.children.length,20);
});
test('読み込み中の中止・閉じる操作は、遅い応答を待たずに反映する',async()=>{
 let resolve;const provider={listChildren:()=>new Promise(r=>resolve=r)};const h=fixture(provider);h.c.open();h.e.stopWholeManuscriptButton.listeners.click();assert.equal(h.e.refreshWholeManuscriptButton.disabled,false);assert.match(h.e.wholeManuscriptStatus.textContent,/中止/);h.c.close();assert.equal(h.e.wholeManuscriptDialog.open,false);resolve([]);await h.jobs[0].promise;assert.equal(h.e.wholeManuscriptDialog.open,false);
});
test('作品・利用者・表示画面が変わると閉じ、古い結果を描画しない',async()=>{
 for(const mutate of [h=>h.state.selectedWork={...h.state.selectedWork},h=>h.setScope('different'),h=>h.state.selectedWork.manuscript={...h.state.selectedWork.manuscript,parentReference:{driveId:"other-drive"}},h=>h.e.filesSection.hidden=true]){let resolve;const h=fixture({listChildren:()=>new Promise(r=>resolve=r)});h.c.open();mutate(h);h.c.changed();assert.equal(h.e.wholeManuscriptDialog.open,false);resolve([{id:'old',name:'旧.txt',file:{}}]);await h.jobs[0].promise;assert.equal(h.e.wholeManuscriptList.children.length,0);}
});
test('編集画面からも保存せず開き、ファイル名をHTMLとして解釈しない',async()=>{
 const h=fixture({listChildren:async()=>[{id:'safe',name:'<img src=x>.txt',file:{}}]});h.e.filesSection.hidden=true;h.e.readerSection.hidden=false;h.e.readerPreviewLauncher.open=true;h.e.readerWholeManuscriptButton.listeners.click();await h.jobs[0].promise;assert.equal(h.state.dirty,true);assert.equal(h.e.readerPreviewLauncher.open,false);assert.equal(h.e.wholeManuscriptList.children[0].children[0].children[1].textContent,'<img src=x>.txt');
});
test('ルート読込失敗を表示し、再試行後は空の原稿一覧として完了できる',async()=>{
 let failed=true;const h=fixture({listChildren:async()=>{if(failed)throw Error('未許可');return [];}});h.c.open();await h.jobs[0].promise;assert.equal(h.e.wholeManuscriptNotice.hidden,false);assert.match(h.e.wholeManuscriptNotice.textContent,/未許可/);assert.equal(h.e.retryWholeManuscriptButton.hidden,false);failed=false;h.e.retryWholeManuscriptButton.listeners.click();await h.jobs[1].promise;assert.equal(h.e.wholeManuscriptNotice.hidden,true);assert.match(h.e.wholeManuscriptStatus.textContent,/取得しました/);
});

test('目次を開いた時点の入力を固定し、読んだ後も未保存状態と編集内容を保持する',async()=>{
 const reads=[];const h=fixture({listChildren:async()=>[{id:'editing',name:'編集中.txt',file:{}},{id:'other',name:'別.txt',file:{}}],readText:async item=>{reads.push(item.id);return 'クラウド';}});
 h.e.filesSection.hidden=true;h.e.readerSection.hidden=false;h.e.readerContent.value='開いた時点の未保存';
 h.c.open();h.e.readerContent.value='その後の入力';await h.jobs[0].promise;
 await h.e.wholeManuscriptList.children.find(n=>n.children[0].children[1].textContent==='編集中.txt').children[0].children[2].listeners.click();
 const text=n=>(n.textContent||'')+(n.children||[]).map(text).join('');
 assert.match(text(h.e.wholeBodyContent),/開いた時点の未保存/);assert.deepEqual(reads,[]);assert.equal(h.e.wholeManuscriptList.hidden,true);
 h.e.wholeBodyBack.listeners.click();assert.equal(h.e.wholeManuscriptList.hidden,false);assert.equal(h.e.wholeBodyPane.hidden,true);h.c.close();assert.equal(h.state.dirty,true);assert.equal(h.e.readerContent.value,'その後の入力');
});
test('一覧から開いた場合は残存するcurrentFileの入力を本文に使わない',async()=>{
 let count=0;const h=fixture({listChildren:async()=>[{id:'editing',name:'本文.txt',file:{}}],readText:async()=>{count++;return '保存された本文';}});
 h.e.readerContent.value='別画面の入力';h.c.open();await h.jobs[0].promise;await h.e.wholeBodyOpen.listeners.click();assert.equal(count,1);
});
