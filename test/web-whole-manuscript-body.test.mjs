import test from 'node:test';
import assert from 'node:assert/strict';
import { createWholeManuscriptBody, manuscriptBodyKey } from '../web/lib/whole-manuscript-body.mjs';
import { createWholeManuscriptReader } from '../web/lib/whole-manuscript-reader.mjs';
const files=Array.from({length:6},(_,i)=>({item:{id:String(i),file:{},parentReference:{driveId:'d'}},path:`章 / ${i}.txt`}));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('本文を必要時だけ読み、入力スナップショットは同じドライブ・IDだけに採用する',async()=>{
 const reads=[], snapshot={key:manuscriptBodyKey(files[1].item),text:'未保存',dirty:true};
 const session=createWholeManuscriptBody({provider:{readText:async item=>{reads.push(item.id);return 'クラウド';}},files,snapshot});
 assert.deepEqual(reads,[]);snapshot.text='固定した入力';
 const local=await session.get({index:1,part:0});assert.equal(local.dirty,true);assert.equal(local.blocks[0].tokens[0].text,'固定した入力');assert.deepEqual(reads,[]);
 await session.get({index:0});await session.get({index:0});assert.deepEqual(reads,['0']);
 const other=createWholeManuscriptBody({provider:{readText:async()=> '別ドライブ'},files:[{...files[1],item:{...files[1].item,parentReference:{driveId:'other'}}}],snapshot});
 assert.equal((await other.get({index:0})).local,false);
});
test('長い原稿を行境界で分割しルビ・傍点・空行を保持し、前後の原稿へ移る',async()=>{
 const session=createWholeManuscriptBody({provider:{readText:async item=>item.id==='0'?'# 見出し\r\n|漢字《かんじ》\r\n\r\n《《強調》》':'次'},files,maxLines:2});
 const a=await session.get({index:0});assert.equal(a.parts,2);assert.equal(a.blocks[0].type,'heading');assert.equal(a.blocks[1].tokens[0].type,'ruby');assert.equal(a.previous,null);
 const b=await session.get(a.next);assert.equal(b.startLine,2);assert.equal(b.blocks[0].type,'blank');assert.equal(b.blocks[1].tokens[0].type,'emphasis');assert.deepEqual(b.next,{index:1,part:0});
 const c=await session.get(b.next);const back=await session.get(c.previous);assert.equal(back.part,1);
});
test('本文キャッシュは件数と文字数で古いファイルを破棄し、戻ると再取得する',async()=>{
 const calls=[];const session=createWholeManuscriptBody({provider:{readText:async item=>{calls.push(item.id);return 'x'.repeat(10);}},files,maxCacheFiles:2,maxCacheCharacters:20});
 for(let i=0;i<4;i++)await session.get({index:i});assert.deepEqual(session.stats(),{files:2,characters:20});await session.get({index:0});assert.deepEqual(calls,['0','1','2','3','0']);session.cancel();assert.equal(session.stats().characters,0);
});
test('空の本文と通信失敗を区別し、失敗はキャッシュせず再試行する。上限は切り捨てない',async()=>{
 let fail=true;const session=createWholeManuscriptBody({provider:{readText:async()=>{if(fail)throw Error('通信');return '';}},files});
 await assert.rejects(session.get({index:0}),/通信/);fail=false;assert.equal((await session.get({index:0})).blocks[0].type,'blank');
 for(const options of [{maxFileCharacters:2},{maxLineCharacters:2}]){const limited=createWholeManuscriptBody({provider:{readText:async()=> '長い本文'},files,...options});await assert.rejects(limited.get({index:0}),/上限/);assert.equal(limited.stats().files,0);}
});
test('閉じた後の本文応答を捨て、再開しても同じproviderの同時読込を2件以内にする',async()=>{
 const wait=deferred();let count=0,max=0;const provider={readText:async()=>{count++;max=Math.max(max,count);await wait.promise;count--;return '本文';}};
 const a=createWholeManuscriptBody({provider,files}),b=createWholeManuscriptBody({provider,files});
 const p=a.get({index:0}),q=b.get({index:1});a.cancel();const c=createWholeManuscriptBody({provider,files}),r=c.get({index:2});
 wait.resolve();const results=await Promise.allSettled([p,q,r]);assert.equal(results[0].status,'rejected');assert.equal(max,2);assert.equal(a.stats().files,0);assert.equal(results[2].status,'fulfilled');
});
class Node{constructor(){Object.assign(this,{children:[],listeners:{},hidden:false,disabled:false,textContent:'',offsetTop:0,style:{setProperty(){}},scrollTop:0});}setAttribute(k,v){(this.attributes ||= {})[k]=v;}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}addEventListener(k,fn){this.listeners[k]=fn;}}
function fixture(provider){const elements=Object.fromEntries(['wholeBodyMode','wholeBodyFont','wholeBodyFontSize','wholeBodyAutoFit','wholeBodyLineCharacters','wholeBodyLineHeight','wholeBodyVerticalSettings','wholeBodyPane','wholeBodyContent','wholeBodyStatus','wholeBodyPrevious','wholeBodyNext','wholeBodyRetry','wholeBodyStop'].map(k=>[k,new Node()]));let current=true;const state={dirty:true,originalContent:'original',currentFile:{id:'editing'},manuscriptPreviewFontSize:17};const doc={activeElement:null,createElement:()=>new Node(),createTextNode:text=>({textContent:text})};const reader=createWholeManuscriptReader({elements,document:doc,state,current:()=>current});return {elements,reader,state,document:doc,changed:()=>current=false};}
test('連続表示の保持範囲は3区間まで。前へ戻れ、編集状態を変えない',async()=>{
 const h=fixture({readText:async item=>`# ${item.id}\n|語《ご》と《《強調》》`}),before=JSON.stringify(h.state);
 await h.reader.open({provider:{readText:async item=>item.id},rows:files});
 for(let i=0;i<4;i++)await h.elements.wholeBodyNext.listeners.click();assert.equal(h.elements.wholeBodyContent.children.length,3);
 await h.elements.wholeBodyPrevious.listeners.click();assert.equal(h.elements.wholeBodyContent.children.length,3);assert.match(h.elements.wholeBodyContent.children[0].attributes['aria-label'],/1.txt/);assert.equal(JSON.stringify(h.state),before);
});
test('取得失敗の原稿を残して次へ進め、再試行は失敗した原稿だけを取得する',async()=>{
 let fail=true;const reads=[],provider={readText:async item=>{reads.push(item.id);if(fail&&item.id==='0')throw Error('未許可');return '<script>本文</script>';}};
 const h=fixture(provider);await h.reader.open({provider,rows:files});assert.equal(h.elements.wholeBodyRetry.hidden,false);assert.match(h.elements.wholeBodyStatus.textContent,/取得失敗/);fail=false;
 await h.elements.wholeBodyRetry.listeners.click();assert.deepEqual(reads,['0','0']);assert.equal(h.elements.wholeBodyRetry.hidden,true);await h.elements.wholeBodyNext.listeners.click();assert.deepEqual(reads,['0','0','1']);
});
test('中止・閉じる・範囲変更後の遅い本文が画面へ戻らない',async()=>{
 for(const action of ['stop','leave','change']){const wait=deferred(),provider={readText:async()=>wait.promise};const h=fixture(provider),pending=h.reader.open({provider,rows:files});
 if(action==='stop')h.elements.wholeBodyStop.listeners.click();if(action==='leave')h.reader.leave();if(action==='change')h.changed();wait.resolve('古い本文');await pending;assert.equal(h.elements.wholeBodyContent.children.length,0);
 if(action==='stop')assert.equal(h.elements.wholeBodyNext.disabled,true);
 }
});

test('方向や文字サイズを変えても本文を再取得せず、編集中の本文の状態を変更しない',async()=>{
 let reads=0;const provider={readText:async()=>{reads++;return '原稿';}},h=fixture(provider);await h.reader.open({provider,rows:files});
 h.elements.wholeBodyMode.value='vertical';h.elements.wholeBodyMode.listeners.change();assert.match(h.elements.wholeBodyContent.className,/vertical/);assert.equal(h.state.manuscriptPreviewMode,'vertical');
 h.elements.wholeBodyFontSize.value='18';h.elements.wholeBodyFontSize.listeners.change();assert.equal(h.state.manuscriptPreviewFontSize,18);assert.equal(reads,1);assert.equal(h.state.dirty,true);assert.equal(h.state.originalContent,'original');
});
test('画面再調整では入力途中の行文字数を上書きせず、確定後に設定を反映する',async()=>{
 const provider={readText:async()=> '原稿'},h=fixture(provider);h.state.manuscriptPreviewLineCharacters=40;await h.reader.open({provider,rows:files});
 h.document.activeElement=h.elements.wholeBodyLineCharacters;h.elements.wholeBodyLineCharacters.value='20';h.reader.settingsChanged();assert.equal(h.elements.wholeBodyLineCharacters.value,'20');assert.equal(h.state.manuscriptPreviewLineCharacters,40);
 h.elements.wholeBodyLineCharacters.listeners.change();assert.equal(h.state.manuscriptPreviewLineCharacters,20);
});

