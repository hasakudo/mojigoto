import test from 'node:test';
import assert from 'node:assert/strict';
import { createConceptSearchController } from '../web/lib/concept-search-controller.mjs';
import { memoEditableText } from '../web/lib/concept-memos.mjs';
class Node{constructor(tag='div'){Object.assign(this,{tagName:tag.toUpperCase(),textContent:'',children:[],listeners:{},checked:false,value:'',hidden:false,open:false,disabled:false,isConnected:true});}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}addEventListener(k,f){this.listeners[k]=f;}showModal(){this.open=true;}close(){this.open=false;this.listeners.close?.();}focus(){this.focused=true;}setSelectionRange(a,b){this.selection=[a,b];}scrollIntoView(){this.scrolled=true;}closest(){return null;}}
const all=n=>[n,...n.children.flatMap(all)];

function fixture(){
 const keys=['openConceptSearchButton','closeConceptSearchButton','conceptSearchDialog','conceptSearchTitle','conceptSearchQuery','conceptSearchNames','conceptSearchDetails','conceptSearchMemos','conceptSearchCase','conceptSearchResults','conceptSearchStatus','conceptSearchPrev','conceptSearchNext','conceptSearchPage','conceptSearchFilter','conceptSearchFilterSummary','conceptReplaceMode','conceptReplaceFields','conceptReplaceText','conceptReplaceActions','conceptReplaceSelectAll','conceptReplaceClear','conceptReplaceApply','conceptReplaceUndo','conceptMemosSection'];
 const e=Object.fromEntries(keys.map(k=>[k,new Node()]));
 const state={provider:{},selectedWork:{id:'work'},conceptFile:{id:'file'},conceptDocument:{memos:[
 {id:'a',type:'text',title:'猫A',body:'😀猫 |猫《ねこ》',tags:['猫'],source:{kind:'noteItem',fingerprint:'keep'}},
 {id:'b',type:'list',title:'猫B',listItems:[{id:'l1',text:'猫',checked:true,extra:1},{id:'l2',text:'犬'}],isArchived:true},
 {id:'c',type:'todo',title:'TODO',todoItems:[{id:'t1',text:'猫',done:true,extra:2},{id:'t2',text:'犬',done:false}]}]},dirty:false};
 let scope='s',commits=0,jumps=[],c;const timers=new Map();
 c=createConceptSearchController({state,elements:e,document:{createElement:t=>new Node(t)},scopeKey:()=>scope,frame:f=>f(),schedule:f=>{timers.set(1,f);return 1;},unschedule:id=>timers.delete(id),commit:ids=>{commits++;state.dirty=true;c.changed();},jumpToMemo:(...args)=>jumps.push(args)});
 const flush=()=>{for(const f of timers.values())f();timers.clear();};
 const search=q=>{e.conceptSearchQuery.value=q;e.conceptSearchQuery.listeners.input();flush();};
 const replace=(text='犬')=>{e.conceptReplaceMode.checked=true;e.conceptReplaceText.value=text;e.conceptReplaceMode.listeners.change();};
 const apply=()=>{e.conceptReplaceSelectAll.listeners.click();e.conceptReplaceApply.listeners.click();};
 const bodyOnly=()=>{e.conceptSearchNames.checked=false;e.conceptSearchNames.listeners.change();};
 return {e,state,c,flush,search,replace,apply,bodyOnly,jumps,commits:()=>commits,setScope:v=>scope=v};
}
test('一覧で現在メモなしでも全メモを検索しタグ・出典は含めず未保存状態を変えない',()=>{
 const h=fixture();h.c.open();h.search('猫');assert.equal(all(h.e.conceptSearchResults).filter(n=>n.tagName==='ARTICLE').length,6);assert.equal(h.commits(),0);assert.equal(h.state.dirty,false);assert.match(h.e.conceptSearchResults.children[3].children[0].textContent,/猫B/);
});
test('複数メモのタイトルと本文を1操作で置換しメタ情報・行ID・チェック状態を保持する',()=>{
 const h=fixture();h.c.open();h.search('猫');h.replace();h.apply();assert.equal(h.commits(),1);const [a,b,c]=h.state.conceptDocument.memos;assert.equal(a.title,'犬A');assert.equal(a.body,'😀犬 |猫《ねこ》');assert.deepEqual(a.tags,['猫']);assert.equal(a.source.fingerprint,'keep');assert.equal(b.title,'犬B');assert.equal(b.isArchived,true);assert.deepEqual(b.listItems[0],{id:'l1',text:'犬',checked:true,extra:1});assert.deepEqual(c.todoItems[0],{id:'t1',text:'犬',done:true,extra:2});
 h.e.conceptReplaceUndo.listeners.click();assert.equal(a.body,'😀猫 |猫《ねこ》');assert.equal(b.listItems[0].text,'猫');assert.equal(c.todoItems[0].text,'猫');
});
test('結果のメモ名・本文位置から該当メモへジャンプする',()=>{
 const h=fixture();h.c.open();h.bodyOnly();h.search('猫');all(h.e.conceptSearchResults).find(n=>n.tagName==='BUTTON').listeners.click();assert.deepEqual(h.jumps[0],['a','body','😀猫 |猫《ねこ》',2,3]);assert.equal(h.e.conceptSearchDialog.open,false);assert.equal(h.commits(),0);
});
test('選択した1箇所だけを置換し別メモの候補を変更しない',()=>{
 const h=fixture();h.c.open();h.search('猫');h.replace();all(h.e.conceptSearchResults).find(n=>n.textContent==='この箇所を置換').listeners.click();assert.equal(h.state.conceptDocument.memos[0].title,'犬A');assert.equal(h.state.conceptDocument.memos[1].title,'猫B');
});
test('1メモの行削除・チェック記号・タイトル改行が不正なら一括操作全体を拒否する',()=>{
 for(const [q,r] of [['猫',''],['猫','猫\n追加'],['x',' ']]){const h=fixture(),before=JSON.stringify(h.state.conceptDocument);h.c.open();h.search(q);h.replace(r);h.apply();assert.equal(JSON.stringify(h.state.conceptDocument),before);assert.equal(h.commits(),0);assert.match(h.e.conceptSearchStatus.textContent,/できません/);}
});
test('保存後の実データ差し替えでも一括取り消しでき、別フィールドと同期情報を保持する',()=>{
 const h=fixture();h.c.open();h.bodyOnly();h.search('猫');h.replace();h.apply();h.state.conceptDocument=structuredClone(h.state.conceptDocument);const a=h.state.conceptDocument.memos[0];a.title='追加タイトル';a.source.fingerprint='new';h.c.changed();h.flush();h.e.conceptReplaceUndo.listeners.click();assert.equal(a.body,'😀猫 |猫《ねこ》');assert.equal(a.title,'追加タイトル');assert.equal(a.source.fingerprint,'new');
});
test('対象の1フィールドが後から編集された場合は全メモの取り消しを止める',()=>{
 const h=fixture();h.c.open();h.bodyOnly();h.search('猫');h.replace();h.apply();h.state.conceptDocument.memos[0].body+='追記';h.c.changed();h.flush();h.e.conceptReplaceUndo.listeners.click();assert.equal(h.state.conceptDocument.memos[1].listItems[0].text,'犬');assert.match(h.e.conceptSearchStatus.textContent,/戻せません/);
});
test('scope・メモ削除・型の変更と一覧を離れたときは履歴を破棄する',()=>{
 for(const change of [h=>h.setScope('other'),h=>h.state.conceptDocument.memos.pop(),h=>h.state.conceptDocument.memos[0].type='todo',h=>h.e.conceptMemosSection.hidden=true]){const h=fixture();h.c.open();h.search('猫');h.replace();h.apply();change(h);h.c.changed();assert.equal(h.e.conceptSearchDialog.open,false);assert.equal(h.e.conceptSearchQuery.value,'');}
});
test('保存・一括反映・競合・IME変換中は置換を抑止する',()=>{
 for(const flag of ['saving','externalConflict','conceptSyncPending','conceptSwitchPending','conceptSyncBlocked','conceptBatchSaving']){const h=fixture();h.c.open();h.search('猫');h.replace();h.state[flag]=true;h.apply();assert.equal(h.commits(),0);}
 const h=fixture();h.c.open();h.search('猫');h.replace();h.e.conceptReplaceText.listeners.compositionstart();h.apply();assert.equal(h.commits(),0);
});
