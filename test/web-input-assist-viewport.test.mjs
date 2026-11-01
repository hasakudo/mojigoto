import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const app=fs.readFileSync(new URL('../web/app.mjs',import.meta.url),'utf8');
const source=app.slice(app.indexOf('function updateInputAssistViewport()'),app.indexOf('let inputAssistViewportFrame'));
function fixture(kind='note') {
  class TextArea { readOnly=false; disabled=false; }
  class Input { type='text'; readOnly=false; disabled=false; }
  const values={},classes=new Set();
  const section=()=>({hidden:true,contains:node=>node?.owner===kind});
  const elements={readerSection:section(),noteEditorSection:section(),conceptMemoEditorSection:section(),inputAssistBar:{hidden:false,getBoundingClientRect:()=>({top:450})}};
  const current={manuscript:elements.readerSection,note:elements.noteEditorSection,concept:elements.conceptMemoEditorSection}[kind];
  current.hidden=false;
  const active=new TextArea();active.owner=kind;
  const document={activeElement:active,documentElement:{style:{setProperty:(key,value)=>values[key]=value}},body:{classList:{toggle:(key,on)=>on?classes.add(key):classes.delete(key)}}};
  const window={innerHeight:800,visualViewport:{height:500,offsetTop:40}};
  const context=vm.createContext({document,window,elements,HTMLTextAreaElement:TextArea,HTMLInputElement:Input});
  vm.runInContext(source,context);
  return {document,window,elements,values,classes,active,Input,update:context.updateInputAssistViewport};
}

test('原稿・ノート・構想メモで入力補助を可視領域の下端へ合わせる',()=>{
  for(const kind of ['manuscript','note','concept']) {
    const f=fixture(kind);f.update();
    assert.equal(f.values['--keyboard-inset'],'260px');
    assert.equal(f.classes.has('keyboard-visible'),true);
    assert.equal(f.classes.has('input-assist-editing'),true);
    assert.equal(f.values['--preview-assist-bottom'],'358px');
    f.window.visualViewport.offsetTop=90;f.update();
    assert.equal(f.values['--keyboard-inset'],'210px');
  }
});

test('画面全体がキーボードに合わせて縮む端末でも入力中の補助バーはフッター分を空けない',()=>{
  const f=fixture();f.window.innerHeight=460;f.window.visualViewport={height:460,offsetTop:0};f.update();
  assert.equal(f.values['--keyboard-inset'],'0px');
  assert.equal(f.classes.has('input-assist-editing'),true);
  assert.equal(f.classes.has('keyboard-visible'),false);
  f.window.innerHeight=800;f.window.visualViewport={height:710,offsetTop:0};f.update();
  assert.equal(f.values['--keyboard-inset'],'90px');
});

test('入力補助OFF・フォーカス終了・設定画面・読み取り専用欄では入力中表示を解除する',()=>{
  const f=fixture();f.update();f.elements.inputAssistBar.hidden=true;f.update();
  assert.equal(f.values['--keyboard-inset'],'0px');
  assert.equal(f.values['--preview-assist-bottom'],'0px');
  assert.equal(f.classes.has('input-assist-editing'),false);
  f.elements.inputAssistBar.hidden=false;
  f.document.activeElement=null;f.update();assert.equal(f.classes.has('input-assist-editing'),false);
  f.document.activeElement=new f.Input();f.update();assert.equal(f.classes.has('input-assist-editing'),false);
  f.document.activeElement=f.active;f.active.readOnly=true;f.update();assert.equal(f.classes.has('input-assist-editing'),false);
});

test('ノート名等の文字入力にも追従し、チェックボックスには入力中扱いを残さない',()=>{
  const f=fixture();const input=new f.Input();input.owner='note';f.document.activeElement=input;f.update();
  assert.equal(f.classes.has('input-assist-editing'),true);
  input.type='checkbox';f.update();assert.equal(f.classes.has('input-assist-editing'),false);
});
