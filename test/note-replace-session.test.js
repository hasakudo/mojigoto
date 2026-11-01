const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../web/lib/note-search-replace');
const { createNoteReplaceSession } = require('../src/views/note-webview/search-replace-session');
function fixture() {
  let note={id:'n',groups:[{id:'g',title:'猫',items:[{id:'i',kind:'entry',heading:'猫',body:'猫 猫',memo:{body:'猫',tags:['保持'],updatedAt:'before',linkedConceptMemoIds:['cm'],conceptMemoSyncFingerprint:'保持'}}]}]},revision=0,changes=0;
  const session=createNoteReplaceSession({core,getNote:()=>note,getRevision:()=>revision,onChange:()=>{revision++;changes++;},now:()=> 'new-time'});
  return {session,get note(){return note},set note(value){note=value},get changes(){return changes},edit(){revision++},
    plan:()=>core.buildReplacePlan(note,{query:'猫',replacement:'犬',revision,fields:{memos:true}}),
    applyAll(plan){return session.apply(plan,plan.candidates.map(row=>row.id))}};
}
test('複数フィールドを一操作で適用・戻し、メモ更新時刻とリンク情報を保持する',()=>{
  const h=fixture(),plan=h.plan();assert.equal(h.applyAll(plan).count,5);assert.equal(h.changes,1);
  const item=h.note.groups[0].items[0];assert.equal(item.body,'犬 犬');assert.equal(item.memo.updatedAt,'new-time');
  assert.deepEqual(item.memo.linkedConceptMemoIds,['cm']);assert.equal(item.memo.conceptMemoSyncFingerprint,'保持');
  assert.equal(h.session.canUndo,true);assert.equal(h.session.undo().count,5);assert.equal(h.changes,2);
  assert.equal(item.body,'猫 猫');assert.equal(item.memo.body,'猫');assert.equal(h.session.canUndo,false);
});
test('候補生成後のリビジョン・元文字列・IDの不一致では一部も変更しない',()=>{
  for(const change of [h=>h.edit(),h=>{h.note.groups[0].items[0].body='別の入力'},h=>{h.note.groups[0].id='new'},h=>{h.note.id='別ノート'}]){
    const h=fixture(),plan=h.plan();change(h);const before=JSON.stringify(h.note);
    assert.equal(h.applyAll(plan).ok,false);assert.equal(JSON.stringify(h.note),before);assert.equal(h.changes,0);
  }
});
test('取り消しは別フィールドと同期メタデータの更新を保持し、対象を編集済みなら全体を戻さない',()=>{
  const h=fixture(),plan=h.plan();h.session.apply(plan,[plan.candidates.find(row=>plan.fields[row.fieldIndex].field==='body').id]);
  const item=h.note.groups[0].items[0];item.heading='別の項目名';item.memo.conceptMemoSyncFingerprint='保存後の指紋';h.edit();
  assert.equal(h.session.undo().ok,true);assert.equal(item.heading,'別の項目名');assert.equal(item.memo.conceptMemoSyncFingerprint,'保存後の指紋');
  h.applyAll(h.plan());item.body='後の本文';const before=JSON.stringify(h.note);
  assert.equal(h.session.undo().reason,'undo_conflict');assert.equal(JSON.stringify(h.note),before);
});
test('危険な記法・不正な選択・未選択では保存通知せず、次の置換だけを戻す',()=>{
  const h=fixture();let plan=h.plan();plan.replacement='《';
  assert.equal(h.applyAll(plan).reason,'notation_change');assert.equal(h.changes,0);
  plan=h.plan();assert.equal(h.session.apply(plan,['不明']).ok,false);assert.equal(h.session.apply(plan,[]).count,0);assert.equal(h.changes,0);
  const bodyIds=plan.candidates.filter(row=>plan.fields[row.fieldIndex].field==='body').map(row=>row.id);
  h.session.apply(plan,[bodyIds[0]]);plan=h.plan();
  h.session.apply(plan,[plan.candidates.find(row=>plan.fields[row.fieldIndex].field==='body').id]);
  h.session.undo();assert.equal(h.note.groups[0].items[0].body,'犬 猫');
  h.session.clearUndo();assert.equal(h.session.undo().reason,'nothing_to_undo');
});
