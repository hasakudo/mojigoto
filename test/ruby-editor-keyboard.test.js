const test=require('node:test');
const assert=require('node:assert/strict');
const {initializeRubyEditor}=require('../src/editor/ruby-editor-html');
const {resolveRubyTarget}=require('../src/editor/ruby-edit-core');

// Small DOM/event stand-in for the real initializer; native Tab traversal is
// checked separately in the browser, not simulated here.
function ui(source='｜運命《デスティニー》') {
  const saved={document:global.document,window:global.window,acquireVsCodeApi:global.acquireVsCodeApi,Date:global.Date};
  let clock=1000;
  class Events {
    constructor(){this.listeners={};}
    addEventListener(type,callback){(this.listeners[type]??=[]).push(callback);}
    emit(type,event={}){event={target:this,preventDefault(){this.prevented=true;},...event};for(const callback of this.listeners[type]||[])callback(event);return event;}
  }
  class Element extends Events {
    constructor(tag){super();this.tag=tag;this.children=[];this.textContent='';this.classList={toggle(){}};}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=children;}
    setAttribute(key,value){this[key]=value;}
    matches(selector){return selector==='input'?this.tag==='input':selector==='input[type="text"]'?this.tag==='input'&&this.type==='text':false;}
    querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches?.(selector)?[child]:[]),...(child.querySelectorAll?.(selector)||[])]);}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    focus(){document.activeElement=this;}
    select(){}
  }
  const elements=Object.fromEntries(['targets','notice','apply','cancel','settings','defaultMode'].map(id=>[id,new Element(id==='apply'||id==='cancel'||id==='settings'?'button':'div')]));
  const document=Object.assign(new Events(),{createElement:tag=>new Element(tag),createTextNode:text=>Object.assign(new Element('#text'),{textContent:text}),getElementById:id=>elements[id]});
  const window=new Events(),messages=[];
  Object.assign(global,{document,window,Date:{now:()=>clock},acquireVsCodeApi:()=>({postMessage:message=>messages.push(structuredClone(message))})});
  initializeRubyEditor();
  const target=resolveRubyTarget(source,0,source.length);
  window.emit('message',{data:{type:'ruby.init',defaultMode:'group',targets:[target]}});
  return {elements,messages,document,window,field:()=>elements.targets.querySelector('input[type="text"]'),
    mode(value){const radios=elements.targets.querySelectorAll('input').filter(input=>input.type==='radio');for(const radio of radios)radio.checked=radio.value===value;radios.find(radio=>radio.checked).emit('change');},
    enter(extra={}){return document.emit('keydown',{key:'Enter',target:document.activeElement,...extra});},
    advance(ms){clock+=ms;},restore(){Object.assign(global,saved);}};
}

test('パネルは1欄の単一入力からEnterで適用し、処理中の入力や連打を止める',()=>{
  const f=ui();try{
    assert.equal(f.document.activeElement,f.field());
    f.mode('mono');assert.equal(f.field().value,'/');
    assert.equal(f.elements.apply.disabled,true);
    f.field().value='デス/ティニー';f.field().emit('input');
    assert.equal(f.elements.apply.disabled,false);
    const event=f.enter();assert.equal(event.prevented,true);
    assert.deepEqual(f.messages.at(-1).drafts[0].readings,['デス','ティニー']);
    assert.equal(f.elements.apply.disabled,true);assert.equal(f.field().readOnly,true);assert.equal(f.elements.cancel.disabled,true);
    const count=f.messages.length;f.enter();assert.equal(f.messages.length,count);
    f.window.emit('message',{data:{type:'ruby.error',message:'適用失敗'}});
    assert.equal(f.field().value,'デス/ティニー');assert.equal(f.field().readOnly,false);
  }finally{f.restore();}
});

test('IME変換の確定Enter・keyCode229・キーリピートは適用に使わない',()=>{
  const f=ui();try{
    const input=f.field(),count=f.messages.length;
    input.emit('compositionstart');f.enter({isComposing:true});assert.equal(f.messages.length,count);
    input.emit('compositionend');f.advance(100);f.enter();assert.equal(f.messages.length,count);
    f.advance(101);f.enter({keyCode:229});f.enter({repeat:true});assert.equal(f.messages.length,count);
    f.enter();assert.equal(f.messages.at(-1).type,'ruby.apply');
  }finally{f.restore();}
});

test('区切り数の不一致や原稿変更時はEnterで適用せず、入力内容を保持する',()=>{
  const f=ui();try{
    f.mode('mono');f.field().value='区切りなし';f.field().emit('input');
    const count=f.messages.length;f.enter();assert.equal(f.messages.length,count);assert.equal(f.elements.apply.disabled,true);
    f.field().value='デス/ティニー';f.field().emit('input');
    f.window.emit('message',{data:{type:'ruby.stale',message:'原稿変更'}});
    f.enter();assert.equal(f.messages.length,count);assert.equal(f.field().value,'デス/ティニー');assert.equal(f.field().readOnly,true);
  }finally{f.restore();}
});

test('グループへ戻すと入力を連結し、変更しなければ単一の対応も戻る',()=>{
  const f=ui();try{
    f.mode('mono');f.field().value='デス/ティニー';f.field().emit('input');
    f.mode('group');assert.equal(f.field().value,'デスティニー');
    f.mode('mono');assert.equal(f.field().value,'デス/ティニー');
  }finally{f.restore();}
});
