import test from 'node:test';
import assert from 'node:assert/strict';
import { captureReadingPosition, restoreReadingPosition } from '../web/lib/whole-manuscript-position.mjs';

function fixture() {
 const c={scrollTop:0,scrollLeft:0,vertical:false,lineChars:10,unit:10,width:100,height:60};
 c.getBoundingClientRect=()=>({left:0,top:0,right:c.width,bottom:c.height,width:c.width,height:c.height});
 const rect=(index)=>c.vertical?{left:c.width-Math.floor(index/c.lineChars)*c.unit-c.scrollLeft-c.unit,right:c.width-Math.floor(index/c.lineChars)*c.unit-c.scrollLeft,top:(index%c.lineChars)*10,bottom:(index%c.lineChars)*10+10}:{left:(index%c.lineChars)*10,right:(index%c.lineChars)*10+10,top:Math.floor(index/c.lineChars)*c.unit-c.scrollTop,bottom:Math.floor(index/c.lineChars)*c.unit-c.scrollTop+c.unit};
 const text={textContent:'物語'.repeat(50),parentElement:{closest:()=>null},base:0};
 const doc={createTreeWalker:()=>{let i=0;return {nextNode:()=>[text][i++]||null};},createRange:()=>{let node,offset;return {setStart(n,o){node=n;offset=o;},setEnd(){},getBoundingClientRect:()=>rect(node.base+offset)};}};
 const block={dataset:{wholeFile:'file-key',wholeLine:'60',wholePart:'1'},ownerDocument:doc,getBoundingClientRect:()=>c.vertical?{left:c.width-10*c.unit-c.scrollLeft,right:c.width-c.scrollLeft,top:0,bottom:c.height}:{left:0,right:c.width,top:-c.scrollTop,bottom:10*c.unit-c.scrollTop}};
 c.querySelectorAll=()=>[block];
 return {c,block,text,doc,rect};
}
test('横書きの文字位置を保存し、折り返し・行高の変更後も同じ文字を同じ高さへ戻す',()=>{
 const {c,rect}=fixture();c.scrollTop=45;const position=captureReadingPosition(c);assert.equal(position.offset,40);assert.equal(position.line,60);
 c.lineChars=5;c.unit=16;assert.equal(restoreReadingPosition(c,position),true);assert.equal(rect(position.offset).top,position.delta * 1.6);
});
test('縦書きの負のscrollLeftで読み進めた文字位置を、列の高さ・幅変更後に復元する',()=>{
 const {c,rect}=fixture();c.vertical=true;c.scrollLeft=-45;const position=captureReadingPosition(c,true);assert.equal(position.offset,40);
 c.lineChars=5;c.unit=16;restoreReadingPosition(c,position,true);assert.equal(rect(position.offset).right-c.width,position.delta * 1.6);assert.ok(c.scrollLeft<0);
});
test('縦横を切り替えた場合も同じ文字を新しい方向の先頭付近に表示する',()=>{
 const {c,rect}=fixture();c.scrollTop=45;const position=captureReadingPosition(c);c.vertical=true;c.scrollTop=0;restoreReadingPosition(c,position,true);assert.equal(rect(position.offset).right-c.width,0);
 const verticalPosition=captureReadingPosition(c,true);c.vertical=false;c.scrollLeft=0;restoreReadingPosition(c,verticalPosition);assert.equal(rect(verticalPosition.offset).top,0);
});
test('ルビの読みは本文の文字位置に数えず、位置の対象から除く',()=>{
 const {c,doc,text}=fixture();const reading={textContent:'よみ'.repeat(20),parentElement:{closest:()=>({})},base:500};
 doc.createTreeWalker=()=>{let i=0;return {nextNode:()=>[reading,text][i++]||null};};c.scrollTop=45;assert.equal(captureReadingPosition(c).offset,40);
});
test('範囲外や非表示の原稿には復元せず、文字数減少時は本文末尾で止める',()=>{
 const {c,text,rect}=fixture();const position={key:'file-key',line:60,part:1,offset:999,vertical:false,delta:0};text.textContent='短文';restoreReadingPosition(c,position);assert.equal(rect(1).top,0);
 assert.equal(restoreReadingPosition(c,{...position,key:'another'}),false);c.width=0;assert.equal(captureReadingPosition(c),null);
});

test('縦横を繰り返し切り替えても読み始めの文字位置がずれ続けない',()=>{
 const {c}=fixture();c.scrollTop=45;let p=captureReadingPosition(c);const original=p.offset;
 for(let i=0;i<6;i++){c.vertical=!c.vertical;restoreReadingPosition(c,p,c.vertical);p=captureReadingPosition(c,c.vertical);assert.equal(p.offset,original);}
});

test('画面端で一部が見えている文字は、回転で文字が縮んでも表示範囲から外れない',()=>{
 const {c}=fixture();c.vertical=true;c.scrollLeft=-45;const position=captureReadingPosition(c,true);c.unit=2;restoreReadingPosition(c,position,true);assert.equal(captureReadingPosition(c,true).offset,position.offset);
});
