const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { createDashboardWritingHarness: fixture } = require('./fixtures/dashboard-writing-harness.cjs');
const { renderWritingMemoTab } = require('../src/stats/stats-html/stats-html-records');
const { makeStatsScript } = require('../src/stats/stats-html/stats-html-script');
const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
const message = (h, overrides = {}) => ({type:'copyWritingMemoToConceptMemo',savedOnly:true,memoId:'m',writingMemoFilePath:h.sourcePath,body:'古い表示本文',excerpt:'古い抜粋',filePath:'古い原稿',...overrides});

test('一覧からは保存元を読み直し、最新の本文・出典をコピーして元の執筆メモを変更しない', async () => {
  const h=fixture(); await h.controller.open();
  Object.assign(h.stores.get(h.sourcePath).memos[0],{body:'最新の保存本文',excerpt:'最新の抜粋',filePath:'最新の原稿.txt'});
  const original=JSON.stringify([...h.stores]);
  await h.receive(message(h));
  const memo=h.conceptStores.get(h.conceptPath(h.workA)).memos[0];
  assert.equal(memo.body,'最新の保存本文');assert.equal(memo.title,'最新の抜粋');assert.equal(memo.source.filePath,'最新の原稿.txt');
  assert.equal(memo.source.writingMemoFilePath,h.sourcePath);assert.equal(JSON.stringify([...h.stores]),original);
  assert.equal(h.states.at(-1).editingWritingMemoId,'');
});

test('一覧からも既存更新・新規作成・比較ON/OFF・取消を共通の反映処理で扱う', async () => {
  const h=fixture();await h.controller.open();await h.receive(message(h));
  const destination=h.conceptPath(h.workA), id=h.conceptStores.get(destination).memos[0].id;
  h.stores.get(h.sourcePath).memos[0].body='保存した更新本文';
  h.hooks.quickPick=items=>items.find(item=>item.action==='update');
  h.confirm(undefined);await h.receive(message(h));
  assert.equal(h.conceptStores.get(destination).memos[0].body,'メモ');
  h.config.confirmWritingMemoConceptOverwrite=false;await h.receive(message(h));
  assert.equal(h.conceptStores.get(destination).memos.length,1);assert.equal(h.conceptStores.get(destination).memos[0].id,id);
  assert.equal(h.conceptStores.get(destination).memos[0].body,'保存した更新本文');
  h.hooks.quickPick=items=>items.find(item=>item.action==='create');await h.receive(message(h));
  assert.equal(h.conceptStores.get(destination).memos.length,2);
});

test('一覧の保存元・メモが不明、重複ID、空本文、読込失敗では古い画面の本文をコピーしない', async () => {
  for(const problem of ['path','missing','duplicate','empty','read']){
    const h=fixture();await h.controller.open();
    if(problem==='missing')h.stores.get(h.sourcePath).memos=[];
    if(problem==='duplicate')h.stores.get(h.sourcePath).memos.push({...h.sourceMemo});
    if(problem==='empty')h.stores.get(h.sourcePath).memos[0].body='  ';
    if(problem==='read')h.hooks.read=()=>{throw Error('読込失敗')};
    await h.receive(message(h,problem==='path'?{writingMemoFilePath:''}:{}));
    assert.equal(h.conceptStores.size,0,problem);assert.ok(['warning','error'].includes(h.notices.at(-1)[0]));
  }
});

test('別作品の同IDは保存元を区別し、保存元読込中の作品切替でも反映先を変えない', async () => {
  const h=fixture();await h.controller.open();
  const sourceB=h.memoPath(h.workB);h.stores.set(sourceB,{memos:[{id:'m',body:'作品Bのメモ',excerpt:'B',filePath:'B.txt'}]});
  await h.receive(message(h,{writingMemoFilePath:sourceB,returnWorkId:'B'}));
  assert.equal(h.conceptStores.get(h.conceptPath(h.workB)).memos[0].body,'作品Bのメモ');
  h.hooks.read=()=>{h.switchWork('B')};
  await h.receive(message(h));
  assert.equal(h.conceptStores.get(h.conceptPath(h.workA)).memos[0].body,'メモ');
});

test('一覧ボタンは編集を開かず保存済み指定を送り、原稿ジャンプを発火させない', () => {
  const script=makeStatsScript(),start=script.indexOf('      document.querySelectorAll("[data-writing-memo-copy-to-concept]")');
  const end=script.indexOf('      document.querySelectorAll("[data-writing-memo-edit-body]")',start);
  let click,stopped=false;const messages=[];
  const item={body:'保存済み',writingMemoFilePath:'保存元.json',filePath:'原稿.txt',returnWorkId:'B'};
  vm.runInNewContext(script.slice(start,end),{document:{querySelectorAll:()=>[{getAttribute:name=>name==='data-writing-memo-copy-saved'?'true':'m',addEventListener:(_name,fn)=>{click=fn}}],
    querySelector:selector=>{assert.ok(!selector.includes('edit-body'));return {getAttribute:()=>JSON.stringify(item)}}},vscode:{postMessage:msg=>messages.push(msg)}});
  click({stopPropagation(){stopped=true}});
  assert.equal(stopped,true);assert.equal(messages.length,1);assert.equal(messages[0].savedOnly,true);assert.equal(messages[0].returnWorkId,'B');
  assert.equal(messages[0].writingMemoFilePath,'保存元.json');
});

test('ファイル・作品別の未処理/完了/保管の一覧に反映ボタンがあり、編集中は既存ボタンだけを表示する', () => {
  const item=id=>({id,body:'本文',excerpt:'抜粋',writingMemoFilePath:'保存元.json'});
  for(const scope of ['file','work']){
    const state={writingMemoScope:scope,writingMemoSelectedWorkId:scope==='work'?'B':'',writingMemosActive:[item('a')],writingMemosDone:[item('d')],writingMemosArchived:[item('r')]};
    Object.assign(state,{writingMemosForSelectedWorkActive:state.writingMemosActive,writingMemosForSelectedWorkDone:state.writingMemosDone,writingMemosForSelectedWorkArchived:state.writingMemosArchived});
    let html=renderWritingMemoTab(state,esc);
    assert.equal((html.match(/data-writing-memo-copy-saved="true"/g)||[]).length,3);
    if(scope==='work')assert.equal((html.match(/&quot;returnWorkId&quot;:&quot;B&quot;/g)||[]).length,3);
    html=renderWritingMemoTab({...state,editingWritingMemoId:'a'},esc);
    assert.equal((html.match(/data-writing-memo-copy-saved="true"/g)||[]).length,2);
    assert.equal((html.match(/data-writing-memo-copy-to-concept=/g)||[]).length,3);
  }
});
