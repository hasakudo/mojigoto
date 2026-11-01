import test from 'node:test';
import assert from 'node:assert/strict';
import { createManuscriptSearchController } from '../web/lib/manuscript-search-controller.mjs';
class Node {
 constructor(tag='div'){Object.assign(this,{tagName:tag.toUpperCase(),textContent:'',children:[],listeners:{},checked:false,value:'',hidden:false,open:false,disabled:false,isConnected:true});}
 append(...v){this.children.push(...v);} replaceChildren(...v){this.children=v;} addEventListener(k,f){this.listeners[k]=f;} showModal(){this.open=true;} close(){this.open=false;this.listeners.close?.();} focus(){this.focused=true;} setSelectionRange(a,b){this.selection=[a,b];} scrollIntoView(){this.scrolled=true;} closest(){return null;}
}
const all=n=>[n,...n.children.flatMap(all)];
function fixture(text='😀猫の本文\n猫 |猫《ねこ》 《《猫》》'){
 const keys=['openManuscriptSearchButton','closeManuscriptSearchButton','manuscriptSearchDialog','manuscriptSearchTitle','manuscriptSearchQuery','manuscriptSearchNames','manuscriptSearchDetails','manuscriptSearchMemos','manuscriptSearchCase','manuscriptSearchResults','manuscriptSearchStatus','manuscriptSearchPrev','manuscriptSearchNext','manuscriptSearchPage','manuscriptSearchFilter','manuscriptSearchFilterSummary','manuscriptReplaceMode','manuscriptReplaceFields','manuscriptReplaceText','manuscriptReplaceActions','manuscriptReplaceSelectAll','manuscriptReplaceClear','manuscriptReplaceApply','manuscriptReplaceUndo','readerSection','readerContent','manuscriptPreviewDialog'];
 const e=Object.fromEntries(keys.map(k=>[k,new Node()]));e.readerContent.tagName='TEXTAREA';e.readerContent.value=text;
 const state={provider:{},selectedWork:{id:'work'},currentFile:{id:'file',name:'猫の原稿.txt',eTag:'1'},originalContent:text,dirty:false,saving:false,currentNote:{data:{keep:true}}};
 let scope='owner/cloud/root',inputs=0;const frames=[],timers=new Map();let c;
 const input=()=>{inputs++;state.dirty=e.readerContent.value!==state.originalContent;c.changed();};
 c=createManuscriptSearchController({state,elements:e,document:{createElement:t=>new Node(t)},scopeKey:()=>scope,notifyInput:input,frame:f=>frames.push(f),schedule:f=>{timers.set(1,f);return 1;},unschedule:id=>timers.delete(id)});
 const flush=()=>{for(const f of timers.values())f();timers.clear();};
 const search=q=>{e.manuscriptSearchQuery.value=q;e.manuscriptSearchQuery.listeners.input();flush();};
 const one=()=>all(e.manuscriptSearchResults).find(n=>n.textContent==='この箇所を置換'&&n.tagName==='BUTTON');
 const replace=()=>{e.manuscriptReplaceMode.checked=true;e.manuscriptReplaceText.value='犬';e.manuscriptReplaceMode.listeners.change();};
 return {e,state,c,frames,search,flush,one,replace,input,setScope:s=>{scope=s;},inputs:()=>inputs};
}
test('原稿検索はファイル名やノートを検索せず、本文の未保存入力と保護箇所を読み取り表示する',()=>{
 const h=fixture(),note=JSON.stringify(h.state.currentNote);h.e.readerContent.value+=' 未保存の猫';h.input();h.c.open();h.search('猫');
 assert.equal(h.e.manuscriptSearchNames.checked,false);assert.equal(h.e.manuscriptSearchMemos.checked,false);assert.equal(all(h.e.manuscriptSearchResults).filter(n=>n.tagName==='BUTTON').length,5);assert.equal(h.inputs(),1);assert.equal(h.state.dirty,true);assert.equal(JSON.stringify(h.state.currentNote),note);assert.equal(h.e.manuscriptSearchFilterSummary.textContent,'条件：本文');
});
test('原稿の一致位置から本文を選択し、プレビューを閉じて入力先を維持する',()=>{
 const h=fixture();h.c.open();h.search('猫');h.e.manuscriptPreviewDialog.open=true;all(h.e.manuscriptSearchResults).find(n=>n.tagName==='BUTTON').listeners.click();h.frames[0]();
 assert.deepEqual(h.e.readerContent.selection,[2,3]);assert.equal(h.e.readerContent.focused,true);assert.equal(h.e.manuscriptPreviewDialog.open,false);assert.equal(h.inputs(),0);assert.equal(h.state.dirty,false);
});
test('原稿1箇所の置換は通常の入力を1回呼び、ルビや別ノートを変更しない',()=>{
 const h=fixture(),before=JSON.stringify(h.state.currentNote);h.c.open();h.search('猫');h.replace();h.one().listeners.click();assert.equal(h.inputs(),1);assert.match(h.e.readerContent.value,/😀犬の本文/);assert.match(h.e.readerContent.value,/\|猫《ねこ》 《《猫》》/);assert.equal(JSON.stringify(h.state.currentNote),before);assert.equal(h.state.originalContent.startsWith('😀猫'),true);
});
test('手動保存後も同じファイルの直前の置換を戻し、元データを通常の未保存状態へ戻す',()=>{
 const h=fixture('猫 猫');h.c.open();h.search('猫');h.replace();h.e.manuscriptReplaceSelectAll.listeners.click();h.e.manuscriptReplaceApply.listeners.click();assert.equal(h.e.readerContent.value,'犬 犬');assert.equal(h.inputs(),1);
 h.state.currentFile={...h.state.currentFile,eTag:'2'};h.state.originalContent=h.e.readerContent.value;h.state.dirty=false;h.c.close();h.c.open();h.e.manuscriptReplaceUndo.listeners.click();assert.equal(h.e.readerContent.value,'猫 猫');assert.equal(h.inputs(),2);assert.equal(h.state.dirty,true);
});
test('原稿本文へ追加入力した後は置換を戻さず、追加入力を保持する',()=>{
 const h=fixture('猫 猫');h.c.open();h.search('猫');h.replace();h.one().listeners.click();h.e.readerContent.value+=' 追加入力';h.input();h.flush();const body=h.e.readerContent.value;h.e.manuscriptReplaceUndo.listeners.click();assert.equal(h.e.readerContent.value,body);assert.equal(h.inputs(),2);assert.match(h.e.manuscriptSearchStatus.textContent,/戻せません/);
});
test('原稿のファイル・作品・利用者・表示先の切替後に候補と取り消しを使わない',()=>{
 for(const change of [h=>{h.state.currentFile={id:'other',name:'other.txt'};},h=>{h.state.provider={};},h=>h.setScope('different'),h=>{h.e.readerSection.hidden=true;},h=>{h.e.readerContent.disabled=true;}]){
  const h=fixture();h.c.open();h.search('猫');h.replace();change(h);h.c.changed();assert.equal(h.e.manuscriptSearchDialog.open,false);assert.equal(h.e.manuscriptSearchQuery.value,'');assert.equal(h.inputs(),0);
 }
});
test('保存・競合・IME中の原稿置換を拒否し、新しい本文には古い候補を適用しない',()=>{
 for(const key of ['saving','syncing','externalConflict']){const h=fixture();h.c.open();h.search('猫');h.replace();const button=h.one();h.state[key]=true;h.c.updateAvailability();assert.equal(button.disabled,true);button.listeners.click();assert.equal(h.inputs(),0);}
 const ime=fixture();ime.c.open();ime.search('猫');ime.replace();const pending=ime.one();ime.e.manuscriptReplaceText.listeners.compositionstart();pending.listeners.click();assert.equal(ime.inputs(),0);ime.e.manuscriptReplaceText.listeners.compositionend();assert.ok(ime.one());
 const h=fixture();h.c.open();h.search('猫');h.replace();const old=h.one();h.e.readerContent.value='外部からの新しい本文';old.listeners.click();assert.equal(h.e.readerContent.value,'外部からの新しい本文');assert.equal(h.inputs(),0);
});
test('再読込・復元時には取り消し履歴を破棄し、本文を元に戻した場合は元の保存状態になる',()=>{
 const h=fixture('猫');h.c.open();h.search('猫');h.replace();h.one().listeners.click();h.e.manuscriptReplaceUndo.listeners.click();assert.equal(h.e.readerContent.value,'猫');assert.equal(h.state.dirty,false);
 h.search('猫');h.replace();h.one().listeners.click();h.c.clearUndo();assert.equal(h.e.manuscriptReplaceUndo.hidden,true);h.e.manuscriptReplaceUndo.listeners.click();assert.equal(h.e.readerContent.value,'犬');
});
