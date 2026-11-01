import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createNote, normalizeNote } from '../web/lib/notes.mjs';
const serializeNote=JSON.stringify;
const app=fs.readFileSync(new URL('../web/app.mjs',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
function source(name){const start=new RegExp(`^function ${name}\\(`,'m').exec(app).index;const tail=app.slice(start);return tail.slice(0,/\r?\n}\r?\n/.exec(tail).index+3);}
class Node {
 constructor(tag='div',className='',textContent=''){Object.assign(this,{tag,className,textContent,children:[],dataset:{},listeners:{},attributes:{},open:false,hidden:false,parent:null});this.classList={toggle(){},contains:()=>false};}
 append(...nodes){nodes.forEach(n=>{n.parent=this;this.children.push(n);});}
 replaceChildren(...nodes){this.children.forEach(n=>n.parent=null);this.children=[];this.append(...nodes);}
 addEventListener(kind,fn){(this.listeners[kind]||=[]).push(fn);}
 async emit(kind,event={}){for(const fn of this.listeners[kind]||[])await fn(event);}
 setAttribute(key,value){this.attributes[key]=value;}
 get isConnected(){return this.connected||Boolean(this.parent?.isConnected);}
 matches(selector){if(selector==='button[data-note-action]')return this.tag==='button'&&!!this.dataset.noteAction;const [tag,cl]=selector.split('.');return (!tag||this.tag===tag)&&(!cl||this.className.split(' ').includes(cl));}
 querySelectorAll(selector){return this.children.flatMap(n=>[...(n.matches(selector)?[n]:[]),...n.querySelectorAll(selector)]);}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 closest(selector){return this.matches(selector)?this:this.parent?.closest(selector);}
 scrollIntoView(){this.scrolled=true;}
 focus(){this.focused=true;}
}
function fixture(groups){
 const note=normalizeNote({title:'試験ノート',type:'plot',groups:groups||[
  {id:'a',title:'前の大分類',items:[{id:'i1',kind:'entry',heading:'一',body:'本文一',memo:{body:'メモ一',tags:['タグ'],linkedConceptMemoIds:['linked']}}]},
  {id:'b',title:'後の大分類',items:[{id:'i2',kind:'entry',heading:'二',body:'本文二',memo:{body:'メモ二'}},{id:'div',kind:'divider',label:'区分'}]},
 ]});
 const state={currentNote:{data:note},noteDisclosure:{},noteType:'plot'};
 const elements=Object.fromEntries(['noteTitleInput','noteEditorTypeBadge','noteGroups','toggleNoteItemsButton','toggleNoteMemosButton','noteEditorSection','addNoteGroupButton'].map(k=>[k,new Node()]));elements.noteGroups.connected=true;
 const frames=[],calls={dirty:0};
 const context=vm.createContext({state,elements,createNote,makeElement:(...args)=>new Node(...args),bindNoteField(){},autoReflectSelection:()=> 'inherit',renderNoteToc(){},updateCurrentNoteGroupIndicator(){},requestAnimationFrame:fn=>frames.push(fn),markNoteDirty(){state.dirty=true;calls.dirty++;},document:{getElementById:id=>elements.noteGroups.querySelectorAll('section').find(n=>n.id===id)}});
 for(const name of ['updateNoteDisclosureButtons','toggleNoteDisclosures','renderNoteEditor','insertNoteGroup','addNoteGroup'])vm.runInContext(source(name),context);
 for(const id of ['toggleNoteItemsButton','toggleNoteMemosButton','addNoteGroupButton']){
  const line=app.split('\n').find(s=>s.startsWith(`elements.${id}.addEventListener(`));vm.runInContext(line,context);
 }
 const start=app.indexOf('elements.noteGroups.addEventListener("click",');const end=app.indexOf('\n});',start)+4;vm.runInContext(app.slice(start,end),context);
 context.renderNoteEditor();
 const find=kind=>elements.noteGroups.querySelectorAll(`details.note-${kind}-details`);
 const flush=()=>{while(frames.length)frames.shift()();};
 return {note,state,elements,context,calls,find,flush};
}

test('each group footer inserts immediately after its group and preserves existing IDs, contents, links, and serialization order',async()=>{
 const h=fixture(),before=structuredClone(h.note.groups);
 const buttons=h.elements.noteGroups.querySelectorAll('button').filter(n=>n.dataset.noteAction==='insert-group-after');assert.equal(buttons.length,2);
 await h.elements.noteGroups.emit('click',{target:buttons[0]});
 assert.equal(h.note.groups.length,3);assert.deepEqual(h.note.groups[0],before[0]);assert.deepEqual(h.note.groups[2],before[1]);
 const inserted=h.note.groups[1];assert.ok(inserted.id);assert.notEqual(inserted.id,before[0].id);assert.deepEqual(inserted.items,[]);
 assert.equal(h.calls.dirty,1);h.flush();
 assert.equal(h.elements.noteGroups.children[1].querySelector('.note-group-title').focused,true);
 assert.deepEqual(JSON.parse(serializeNote(h.note)).groups.map(g=>g.id),h.note.groups.map(g=>g.id));
});

test('last group footer and top add button both append, including empty groups',async()=>{
 const h=fixture([{id:'only',title:'空の分類',items:[]}]);
 const button=h.elements.noteGroups.querySelectorAll('button').find(n=>n.dataset.noteAction==='insert-group-after');
 await h.elements.noteGroups.emit('click',{target:button});await h.elements.addNoteGroupButton.emit('click');
 assert.equal(h.note.groups.length,3);assert.equal(h.note.groups[0].id,'only');assert.equal(h.calls.dirty,2);
});

test('items and memos toggle independently in both directions without changing note data or marking dirty',async()=>{
 const h=fixture(),before=serializeNote(h.note);
 assert.equal(h.elements.toggleNoteItemsButton.textContent,'項目を閉じる');assert.equal(h.elements.toggleNoteMemosButton.textContent,'メモを開く');
 await h.elements.toggleNoteItemsButton.emit('click');assert.ok(h.find('entry').every(n=>!n.open));assert.ok(h.find('memo').every(n=>!n.open));
 await h.elements.toggleNoteMemosButton.emit('click');assert.ok(h.find('entry').every(n=>!n.open));assert.ok(h.find('memo').every(n=>n.open));
 await h.elements.toggleNoteItemsButton.emit('click');assert.ok(h.find('entry').every(n=>n.open));assert.ok(h.find('memo').every(n=>n.open));
 await h.elements.toggleNoteMemosButton.emit('click');assert.ok(h.find('memo').every(n=>!n.open));
 assert.equal(h.calls.dirty,0);assert.equal(serializeNote(h.note),before);
});

test('individual and mixed disclosure states update labels; next bulk action opens all',async()=>{
 const h=fixture();const body=h.find('entry')[0];body.open=false;await body.emit('toggle');
 assert.equal(h.elements.toggleNoteItemsButton.textContent,'項目を開く');assert.equal(h.state.noteDisclosure['i1:body'],false);
 await h.elements.toggleNoteItemsButton.emit('click');assert.ok(h.find('entry').every(n=>n.open));
 assert.equal(h.elements.toggleNoteItemsButton.attributes['aria-expanded'],'true');
 const memo=h.find('memo')[0];memo.open=true;await memo.emit('toggle');
 assert.equal(h.elements.toggleNoteMemosButton.textContent,'メモを開く');
 await h.elements.toggleNoteMemosButton.emit('click');assert.equal(h.elements.toggleNoteMemosButton.textContent,'メモを閉じる');
});

test('immediate re-render after bulk open/close preserves both states; detached toggle events cannot overwrite them',async()=>{
 const h=fixture(),old=h.find('entry')[0];
 await h.elements.toggleNoteItemsButton.emit('click');await h.elements.toggleNoteMemosButton.emit('click');
 h.context.insertNoteGroup(1);
 assert.ok(h.find('entry').every(n=>!n.open));assert.ok(h.find('memo').every(n=>n.open));
 old.open=true;await old.emit('toggle');assert.equal(h.state.noteDisclosure['i1:body'],false);
 assert.equal(h.elements.toggleNoteItemsButton.textContent,'項目を開く');
});

test('empty and divider-only notes disable both disclosure buttons',()=>{
 for(const items of [[],[{id:'d',kind:'divider',label:'区分'}]]){
  const h=fixture([{id:'g',title:'分類',items}]);assert.equal(h.elements.toggleNoteItemsButton.disabled,true);assert.equal(h.elements.toggleNoteMemosButton.disabled,true);
 }
});

test('insertion is blocked during save/sync/delete and ignores invalid positions',()=>{
 const h=fixture();for(const flag of ['saving','syncing','deleting']){h.state[flag]=true;h.context.insertNoteGroup(1);h.state[flag]=false;}
 for(const index of [-1,3,NaN,0.5])h.context.insertNoteGroup(index);
 assert.equal(h.note.groups.length,2);assert.equal(h.calls.dirty,0);
});

test('queued focus never jumps to another note or hidden editor',()=>{
 for(const change of ['note','hidden']){
  const h=fixture();h.context.insertNoteGroup(1);const title=h.elements.noteGroups.children[1].querySelector('.note-group-title');
  if(change==='note')h.state.currentNote={data:createNote('plot')};else h.elements.noteEditorSection.hidden=true;
  h.flush();assert.equal(title.focused,undefined);
 }
});

test('only two bulk controls and one top group button appear, without duplicate end-of-note add button',()=>{
 assert.match(html,/id="toggleNoteItemsButton"/);assert.match(html,/id="toggleNoteMemosButton"/);
 assert.doesNotMatch(html,/id="(?:expandAllNoteItemsButton|collapseAllNoteItemsButton|addNoteGroupBottomButton)"/);
});
