const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildReplacePlan, previewReplaceSelection, createNoteSearchReplace } = require('../web/lib/note-search-replace');
const note = (body = '猫') => ({ id:'n',title:'猫',groups:[{id:'g',title:'猫の分類',items:[
  {id:'d',kind:'divider',label:'猫の区分',value:'猫の補足'},
  {id:'i',kind:'entry',heading:'猫の項目',headingRuby:'猫',body,memo:{body:'猫のメモ',tags:['猫'],linkedConceptMemoIds:['猫'],updatedAt:'保持',conceptMemoSyncFingerprint:'保持'},relatedReferences:[{itemLabel:'猫'}]},
]}] });
function planFor(body, query='猫', replacement='犬', extra={}) {
  return buildReplacePlan(note(body), {query,replacement,fields:{names:false,details:true},...extra});
}
const previewAll = plan => previewReplaceSelection(plan,plan.candidates.map(candidate=>candidate.id));

test('対象名称と本文だけを列挙し、メモは選択式、ノートや同期情報を一切変更しない',()=>{
  const input=note(),original=JSON.stringify(input);
  const plan=buildReplacePlan(input,{query:'猫',replacement:'犬',revision:42});
  assert.equal(plan.candidates.length,5);assert.equal(plan.revision,42);
  assert.deepEqual(plan.fields.map(field=>field.field),['title','label','value','heading','body']);
  const withMemo=buildReplacePlan(input,{query:'猫',replacement:'犬',fields:{memos:true}});
  assert.equal(withMemo.candidates.length,6);assert.equal(withMemo.fields.at(-1).field,'memo.body');
  assert.equal(previewAll(withMemo).changes.length,6);
  assert.equal(JSON.stringify(input),original);
  assert.equal(buildReplacePlan(input,{query:'猫',fields:{names:false,details:false,memos:false}}).candidates.length,0);
});

test('一致は元文字列のUTF-16位置と行・文字位置を持ち、大小文字・絵文字・長さが変わる文字を扱う',()=>{
  let plan=planFor('😀İ猫\r\n猫\n猫','猫');
  assert.deepEqual(plan.candidates.map(({start,end,line,column})=>({start,end,line,column})),[
    {start:3,end:4,line:1,column:3},{start:6,end:7,line:2,column:1},{start:8,end:9,line:3,column:1},
  ]);
  plan=planFor('İA i\u0307a','i\u0307a','Z');
  assert.deepEqual(plan.candidates.map(c=>[c.start,c.end]),[[0,2],[3,6]]);
  assert.equal(previewAll(plan).changes[0].after,'Z Z');
  assert.equal(planFor('İ','i').candidates.length,0); // Do not replace half a folded character.
  assert.equal(planFor('😀','\ud83d').candidates.length,0);
  assert.equal(planFor('Aa aA','aa','x').candidates.length,2);
  assert.equal(planFor('Aa aA','aa','x',{caseSensitive:true}).candidates.length,0);
  assert.equal(planFor('Ａ','A').candidates.length,0);
});

test('文字列として非重複で照合し、置換文字のドルや正規表現記号をそのまま扱う',()=>{
  const plan=planFor('aaaa .+ .+','aa','$&$1');
  assert.equal(plan.candidates.length,2);assert.equal(previewAll(plan).changes[0].after,'$&$1$&$1 .+ .+');
  assert.equal(previewAll(planFor('a.+b','.+','[*]')).changes[0].after,'a[*]b');
  assert.equal(previewAll(planFor('猫猫','猫','')).changes[0].after,'');
  assert.equal(planFor('猫','猫','猫').candidates.length,0);
  assert.equal(planFor('猫','').valid,false);
  assert.equal(previewReplaceSelection(planFor('猫',''),[]).ok,false);
});

test('明示・暗黙ルビ、傍点、隣接モノルビと境界をまたぐ一致を保護する',()=>{
  const plan=planFor('猫 |猫《ねこ》 猫《ねこ》 《《猫》》 |人《レイ》|族《オン》 猫');
  assert.equal(plan.candidates.length,2);assert.equal(plan.excluded.length,3);
  assert.ok(plan.excluded.every(c=>c.reason==='protected_notation'));
  assert.equal(previewAll(plan).changes[0].after,'犬 |猫《ねこ》 猫《ねこ》 《《猫》》 |人《レイ》|族《オン》 犬');
  assert.equal(planFor('x|猫《ねこ》','x|猫').excluded.length,1);
  assert.equal(planFor('|人《レイ》|族《オン》','レイ').excluded.length,1);
  assert.equal(previewReplaceSelection(plan,[plan.excluded[0].id]).reason,'invalid_selection');
});

test('不完全な記法のフィールドは全体を保護し、他の正常なフィールドは候補になる',()=>{
  for(const body of ['猫 |猫《ねこ','猫 《《猫》','猫 》','猫《《猫》》》']){
    const plan=planFor(body);
    assert.equal(plan.candidates.length,0,body);assert.ok(plan.excluded.length>0,body);
    assert.ok(plan.excluded.every(c=>c.reason==='malformed_notation'));
  }
  assert.equal(buildReplacePlan(note('猫 |猫《ねこ'),{query:'猫',replacement:'犬'}).candidates.length,4);
});

test('選択した箇所だけを元文字列から一度で計算し、順不同・重複指定・空選択を扱う',()=>{
  const plan=planFor('猫 猫 猫','猫','猫猫');
  const selected=[plan.candidates[2].id,plan.candidates[0].id,plan.candidates[0].id];
  const result=previewReplaceSelection(plan,selected);
  assert.equal(result.count,2);assert.equal(result.changes[0].after,'猫猫 猫 猫猫');
  assert.deepEqual(previewReplaceSelection(plan,[]),{ok:true,changes:[],count:0});
  assert.equal(previewReplaceSelection(plan,['不明']).reason,'invalid_selection');
});

test('新しい記法や既存ルビの範囲変化を、複数箇所の組み合わせも含めて拒否する',()=>{
  for(const [body,query,replacement] of [
    ['猫','猫','|人《ひと》'],['猫','猫','《'],['x人《ひと》','x','超'],
    ['a猫a','a','《'],
  ])assert.equal(previewAll(planFor(body,query,replacement)).reason,'notation_change');
  const plan=planFor('ab','a','人');
  assert.equal(previewAll(plan).ok,true);
  // Deletion can join plain Han text to the base of an implicit ruby.
  assert.equal(previewAll(planFor('超x人《ひと》','x','')).reason,'notation_change');
  const combined=planFor('超xx人《ひと》','x','');
  assert.equal(previewReplaceSelection(combined,[combined.candidates[0].id]).ok,true);
  assert.equal(previewReplaceSelection(combined,[combined.candidates[1].id]).ok,true);
  assert.equal(previewAll(combined).reason,'notation_change');
  const multi=buildReplacePlan(note('猫'),{query:'猫',replacement:'《'});
  assert.equal(previewAll(multi).ok,false);assert.deepEqual(previewAll(multi).changes,[]);
});

test('候補は入力から独立したスナップショットで、IDの欠落・重複を適用候補にしない',()=>{
  const input=note('猫');const plan=buildReplacePlan(input,{query:'猫',replacement:'犬',fields:{names:false}});
  input.groups[0].items[1].body='後の編集';
  assert.equal(previewAll(plan).changes[0].before,'猫');
  const missing=note();missing.groups[0].id='';
  assert.equal(buildReplacePlan(missing,{query:'猫'}).candidates.length,0);
  const duplicate=note();duplicate.groups[0].items.push({...duplicate.groups[0].items[1]});
  const blocked=buildReplacePlan(duplicate,{query:'猫'});
  assert.ok(blocked.issues.some(issue=>issue.reason==='ambiguous_identity'));
  assert.ok(blocked.candidates.every(c=>blocked.fields[c.fieldIndex].itemId!=='i'));
  assert.equal(buildReplacePlan({...note(),id:''},{query:'猫'}).valid,false);
});

test('Node以外の環境と自己完結したfactoryでも同じ結果になる',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../web/lib/note-search-replace.js'),'utf8');
  const context=vm.createContext({});vm.runInContext(source,context);
  const input=note('猫 |猫《ねこ》');const options={query:'猫',replacement:'犬'};
  const expected=JSON.stringify(buildReplacePlan(input,options));
  assert.equal(JSON.stringify(context.MojigotoNoteSearchReplace.buildReplacePlan(input,options)),expected);
  const factory=vm.runInNewContext('('+createNoteSearchReplace.toString()+')()');
  assert.equal(JSON.stringify(factory.buildReplacePlan(input,options)),expected);
});

test('長い単一行と多数のモノルビでも全候補・保護範囲を落とさず計算する',()=>{
  const body=('猫 |人《ひと》 ').repeat(5000);
  const plan=planFor(body);assert.equal(plan.candidates.length,5000);
  const result=previewAll(plan);assert.equal(result.ok,true);assert.equal(result.count,5000);
  assert.equal(result.changes[0].after,body.replaceAll('猫','犬'));
});
