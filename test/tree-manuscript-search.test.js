const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createTreeMetadataHarness } = require('./fixtures/tree-metadata-harness.cjs');
const manifest = require('../package.json');

async function fixture() {
  const stats = [];
  const h = await createTreeMetadataHarness({ fileSystem: { async stat(folder) { stats.push(folder); return { isDirectory: () => folder !== '/not-a-directory' }; } } });
  return { ...h, stats };
}

test('作品ツリーの原稿・章から指定フォルダーのURIをVS Code標準検索へ渡す', async () => {
  for (const single of [false, true]) for (const [kind, command] of [['manuscriptRoot','searchManuscriptFolder'], ['chapterFolder','searchChapterFolder']]) {
    const h = await fixture(); h.model.single = single;
    const folder = '/別の作品/原稿 [第一稿], #/第一章';
    await h.run(command, { kind, fsPath: folder, workDir: '/別の作品' });
    assert.deepEqual(h.stats, [folder]);
    assert.equal(h.trace.length, 1);
    assert.deepEqual(h.trace[0], ['command','filesExplorer.findInFolder',{fsPath:folder}]);
  }
});

test('深い章内の原稿ファイルからは親の章でなく対象原稿ルートを検索する', async () => {
  const h = await fixture();h.model.manuscriptRoot='/works/B/原稿';
  const item={kind:'manuscriptFile',fsPath:'/works/B/原稿/第一章/節/一話.md',workDir:'/works/B'};
  await h.run('searchManuscriptFolder', item);
  assert.deepEqual(h.stats, ['/works/B/原稿']);
  assert.deepEqual(h.trace[0], ['manuscript.resolve',item,item.fsPath]);
  assert.deepEqual(h.trace[1], ['command','filesExplorer.findInFolder',{fsPath:'/works/B/原稿'}]);
});

test('対象不明・相対パス・原稿ルート不明・非フォルダーでは検索全体へフォールバックしない', async () => {
  for(const item of [undefined,{kind:'referenceRoot',fsPath:'/notes'},{kind:'manuscriptRoot',fsPath:''},{kind:'manuscriptRoot',fsPath:'relative'},
    {kind:'manuscriptRoot',fsPath:'/not-a-directory'},{kind:'manuscriptFile',fsPath:'/unknown/file.txt'}]){
    const h=await fixture();h.model.manuscriptRoot='';await h.run('searchManuscriptFolder',item);
    assert.ok(!h.trace.some(([kind])=>kind==='command'));
    assert.equal(h.trace.at(-1)[0],'warning');
  }
  const h=await fixture();await h.run('searchChapterFolder',{kind:'manuscriptFile',fsPath:'/a.txt'});
  assert.equal(h.trace.at(-1)[0],'warning');
});

test('フォルダー取得と標準検索コマンドの失敗を報告し、書込みや別範囲の検索をしない', async () => {
  const h=await fixture();h.hooks.command=()=>{throw Error('起動失敗')};
  await h.run('searchManuscriptFolder',{kind:'manuscriptRoot',fsPath:'/manuscript'});
  assert.equal(h.trace.filter(([kind])=>kind==='command').length,1);assert.equal(h.trace.at(-1)[0],'error');
  const failed=await createTreeMetadataHarness({fileSystem:{async stat(){throw Error('読込失敗')}}});
  await failed.run('searchChapterFolder',{kind:'chapterFolder',fsPath:'/manuscript/chapter'});
  assert.equal(failed.trace.length,1);assert.equal(failed.trace[0][0],'error');
});

test('右クリックだけに検索メニューを出し、ノート・ごみ箱・倉庫には追加しない',()=>{
  const commands=['mojigoto.searchManuscriptFolder','mojigoto.searchChapterFolder'];
  for(const command of commands){
    assert.ok(manifest.contributes.commands.some(entry=>entry.command===command));
    assert.ok(manifest.contributes.menus.commandPalette.some(entry=>entry.command===command&&entry.when==='false'));
  }
  const menus=manifest.contributes.menus['view/item/context'].filter(entry=>commands.includes(entry.command));
  assert.equal(menus.length,2);assert.ok(menus.every(entry=>!entry.group.startsWith('inline')));
  assert.match(menus[0].when,/currentViewManuscriptRoot\|manuscriptRoot\|manuscriptFile/);
  assert.match(menus[1].when,/chapterFolder/);
});

test('実際の原稿ルート解決はツリーの親を優先し、別作品へViewの範囲を混ぜない',()=>{
  const viewRoot=path.resolve('/View/manuscript'),otherRoot=path.resolve('/works/B/manuscript');
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../src/writing-memo/writing-memo-tracker.js'),'utf8'),{
    module,process,require:name=>name==='path'?path:name==='./writing-memo-resolver'?{
      normalizeFsPath:value=>path.normalize(value),getConfiguredManuscriptRoot:()=>viewRoot,
      isSameOrChildPath:(file,root)=>{const rel=path.relative(root,file);return rel===''||(!rel.startsWith('..')&&!path.isAbsolute(rel));},
    }:name==='../core/mojigoto-paths'?{getWorkManuscriptRoot:dir=>path.join(dir,'manuscript')}:{},
  });
  for(const root of [viewRoot,otherRoot]){
    const rootItem={kind:'manuscriptRoot',fsPath:root};
    const chapter={kind:'chapterFolder',fsPath:path.join(root,'章'),parent:rootItem};
    const item={kind:'manuscriptFile',fsPath:path.join(chapter.fsPath,'節','原稿.md'),workDir:path.dirname(otherRoot),parent:chapter};
    assert.equal(module.exports.resolveManuscriptRootForTreeItem(item,item.fsPath),root);
  }
});
