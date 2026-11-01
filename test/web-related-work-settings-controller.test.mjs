import assert from "node:assert/strict";
import test from "node:test";
import { createRelatedWorkSettingsController } from "../web/lib/related-work-settings-controller.mjs";
import { referenceWorkKey } from "../web/lib/shared-note-reader.mjs";
const tick=()=>new Promise(setImmediate);
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
class Node {constructor(tag='div'){Object.assign(this,{tag,textContent:'',className:'',children:[],listeners:{},dataset:{},disabled:false,open:false,attributes:{}});}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}setAttribute(k,v){this.attributes[k]=v;}addEventListener(t,f){this.listeners[t]=f;}showModal(){this.open=true;}close(){this.open=false;this.listeners.close?.();}}
const all=node=>[node,...node.children.flatMap(all)];
function fixture(){
 const work={id:'a',title:'A'},peer={id:'b',title:'B'};
 const state={provider:{},selectedWork:work,workRoot:{id:'root'},currentSettings:{data:{}},dirty:false,saving:false};
 const elements=Object.fromEntries(['relatedWorksDialog','closeRelatedWorksButton','reloadRelatedWorksButton','relatedWorksList','relatedWorksStatus','relatedWorksNotice'].map(k=>[k,new Node()]));
 let scope='owner/root',saved=0,closed=0;const accepted=[],changes=[];
 const own={work,key:referenceWorkKey(work),item:{id:'sa'},data:{workId:'a'}},row={work:peer,key:referenceWorkKey(peer),data:{workId:'b',title:'B'},problem:'',outgoing:false,incoming:false};
 const options={state,elements,document:{createElement:tag=>new Node(tag)},scopeKey:()=>scope,getWorks:async()=>[work,peer],beforeOpen:async()=>{},onOwnRecord:record=>accepted.push(record),onPendingChange:()=>changes.push(true),onClose:()=>{closed++;},readCatalog:async()=>({own,peers:[row],ownProblem:'',unresolved:0}),saveRelation:async()=>{saved++;return {complete:true,own,writes:[]};}};
 const controller=createRelatedWorkSettingsController(options);return {state,elements,options,controller,own,row,accepted,changes,setScope:v=>{scope=v;},get closed(){return closed;},get saved(){return saved;},button:label=>all(elements.relatedWorksList).find(n=>n.tag==='button'&&n.textContent===label)};
}
test('設定一覧の表示では保存せず、明示操作だけで双方保存を確定する',async()=>{
 const h=fixture();await h.controller.open();assert.equal(h.saved,0);await h.button('関連付ける').listeners.click();assert.equal(h.saved,1);assert.equal(h.accepted.length,1);assert.match(h.elements.relatedWorksStatus.textContent,/完了/);assert.equal(h.state.dirty,false);assert.equal(h.state.saving,false);
});
test('保存中は閉じる・重ね操作を止め、完了後は解除する',async()=>{
 const h=fixture(),waiting=deferred();h.options.saveRelation=()=>waiting.promise;
 const c=createRelatedWorkSettingsController(h.options);await c.open();const saving=h.button('関連付ける').listeners.click();assert.equal(h.state.saving,true);assert.equal(h.elements.closeRelatedWorksButton.disabled,true);
 let prevented=false;h.elements.relatedWorksDialog.listeners.cancel({preventDefault(){prevented=true;}});assert.equal(prevented,true);c.close();assert.equal(h.elements.relatedWorksDialog.open,true);
 waiting.resolve({complete:true,own:h.own,writes:[]});await saving;assert.equal(h.state.saving,false);assert.equal(h.elements.closeRelatedWorksButton.disabled,false);c.close();assert.equal(h.elements.relatedWorksDialog.open,false);
});
test('読込中は閉じられ、開き直した後に古い候補を反映しない',async()=>{
 const h=fixture(),first=deferred();let reads=0;h.options.readCatalog=()=>++reads===1?first.promise:Promise.resolve({own:h.own,peers:[],ownProblem:'',unresolved:0});const c=createRelatedWorkSettingsController(h.options),old=c.open();await tick();assert.equal(h.elements.closeRelatedWorksButton.disabled,false);c.close();await c.open();
 first.resolve({own:h.own,peers:[h.row],ownProblem:'',unresolved:0});await old;assert.equal(h.elements.relatedWorksList.children.length,1);assert.equal(h.elements.relatedWorksList.children[0].tag,'p');
});
test('部分保存を未完了と表示し、同じ関連操作を再試行できる',async()=>{
 const h=fixture();let calls=0;const intents=[];h.options.saveRelation=async(_context,key,related)=>{calls++;intents.push([key,related]);return calls===1?{complete:false,own:h.own,writes:[{key:h.own.key}],error:Error('network')}:{complete:true,own:h.own,writes:[]};};
 const c=createRelatedWorkSettingsController(h.options);await c.open();await h.button('関連付ける').listeners.click();assert.equal(c.hasPending(),true);assert.match(h.elements.relatedWorksStatus.textContent,/未完了/);assert.equal(h.accepted.length,1);
 await h.button('再試行').listeners.click();assert.equal(c.hasPending(),false);assert.deepEqual(intents,[[h.row.key,true],[h.row.key,true]]);assert.equal(h.accepted.length,2);
});
test('保存待ちにスコープが変わっても別作品の設定へ結果を反映しない',async()=>{
 const h=fixture(),waiting=deferred();h.options.saveRelation=()=>waiting.promise;const c=createRelatedWorkSettingsController(h.options);await c.open();const saving=h.button('関連付ける').listeners.click();h.setScope('another/root');waiting.resolve({complete:true,own:h.own,writes:[]});await saving;assert.equal(h.accepted.length,0);assert.equal(h.state.saving,false);
});
test('読込不可・ID重複の候補は操作不可とし、未解決関連の保持を案内する',async()=>{
 const h=fixture();h.row.problem='作品IDが重複しています。';h.options.readCatalog=async()=>({own:h.own,peers:[h.row],ownProblem:'',unresolved:2});const c=createRelatedWorkSettingsController(h.options);await c.open();assert.equal(h.button('関連付ける').disabled,true);assert.match(h.elements.relatedWorksNotice.textContent,/2件/);assert.equal(h.saved,0);
});

test('保存後の一覧再取得だけが失敗しても保存完了の結果を消さない',async()=>{
 const h=fixture();let reads=0;h.options.readCatalog=async()=>{if(++reads>1)throw Error('network');return {own:h.own,peers:[h.row],ownProblem:'',unresolved:0};};
 const c=createRelatedWorkSettingsController(h.options);await c.open();await h.button('関連付ける').listeners.click();assert.match(h.elements.relatedWorksStatus.textContent,/両作品の関連付けが完了/);assert.match(h.elements.relatedWorksStatus.textContent,/一覧を更新できません/);assert.equal(c.hasPending(),false);assert.equal(h.elements.reloadRelatedWorksButton.disabled,false);
});

test('保存結果の一覧を使い再取得なしで操作を終了する',async()=>{
 const h=fixture();let reads=0;h.options.readCatalog=async()=>{reads++;return {own:h.own,peers:[h.row],unresolved:0};};
 h.options.saveRelation=async()=>({complete:true,own:h.own,writes:[],catalog:{own:h.own,peers:[{...h.row,incoming:true,outgoing:true}],unresolved:0}});
 const c=createRelatedWorkSettingsController(h.options);await c.open();await h.button('関連付ける').listeners.click();assert.equal(reads,1);assert.ok(h.button('解除する'));assert.equal(h.state.saving,false);
});
test('参照できない関連は対象IDを表示し確認操作後だけ解除する',async()=>{
 const h=fixture();let removed=0;h.options.readCatalog=async()=>({own:h.own,peers:[h.row],unresolved:1,unresolvedIds:['gone-id']});
 h.options.removeUnresolved=async(_context,id)=>{assert.equal(id,'gone-id');removed++;return {complete:true,own:h.own,writes:[],catalog:{own:h.own,peers:[h.row],unresolved:0,unresolvedIds:[]}};};
 const c=createRelatedWorkSettingsController(h.options);await c.open();assert.equal(removed,0);h.button('この関連を整理').listeners.click();assert.equal(removed,0);assert.ok(all(h.elements.relatedWorksList).some(n=>n.textContent==='gone-id'));
 await h.button('この作品から解除する').listeners.click();assert.equal(removed,1);assert.match(h.elements.relatedWorksStatus.textContent,/この作品から解除しました/);
});
test('一覧を開かず作品名を取得し別作品へ切替時に前の名前を表示しない',async()=>{
 const h=fixture();h.state.currentSettings.data.relatedWorkIds=['b','unknown'];const c=createRelatedWorkSettingsController(h.options);
 assert.equal(c.summary(h.state.currentSettings.data).loaded,false);await c.loadSummary();assert.deepEqual(c.summary(h.state.currentSettings.data),{names:['B'],unknown:1,loaded:true});assert.equal(h.elements.relatedWorksDialog.open,false);assert.equal(h.saved,0);
 h.state.selectedWork={id:'other'};assert.equal(c.summary(h.state.currentSettings.data).loaded,false);
});
