import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const app=await readFile(new URL('../web/app.mjs',import.meta.url),'utf8');
const source=[...app.matchAll(/document\.addEventListener\("keydown", \(event\) => \{[^]*?\r?\n\}\);/g)].map(match=>match[0]).find(source=>source.includes("const dialogs ="));
function handler(dialogs,modal=null){let callback;const document={activeElement:null,addEventListener:(_name,fn)=>callback=fn,querySelector:selector=>selector==='dialog:modal'?modal:null,querySelectorAll:()=>dialogs};vm.runInNewContext(source,{document,elements:{headerMenu:{classList:{contains:()=>false}}},closeEditorOptions(){},closeHeaderMenu(){}});return callback;}
test('modalのEscapeはnative cancelへ任せ、保存中のcancel拒否をcloseで迂回しない',()=>{
 let closed=0,prevented=false;const modal={close:()=>closed++};handler([modal],modal)({key:'Escape',preventDefault(){prevented=true;}});assert.equal(closed,0);assert.equal(prevented,false);
});
test('子のプレビューが処理済みのEscapeで、別のダイアログを重ねて閉じない',()=>{
 let closed=0;handler([{close:()=>closed++}])({key:'Escape',defaultPrevented:true,preventDefault(){}});assert.equal(closed,0);
});
test('非modalはフォーカス元を閉じ、DOM上で後ろの別プレビューを閉じない',()=>{
 const calls=[],focused={close:()=>calls.push('focused')},other={close:()=>calls.push('other')};handler([focused,other])({key:'Escape',target:{closest:()=>focused},preventDefault(){}});assert.deepEqual(calls,['focused']);
});
