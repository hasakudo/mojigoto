const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mojigoto-trash-count-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('mojigoto-trash-count-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  const model = { work: path.join(root, '作品A'), single: false }, reads = [];
  const dataDir = dir => path.join(dir, '.mojigoto');
  const trashModule = { exports: {} };
  vm.runInNewContext(syncFs.readFileSync(path.resolve(__dirname, '../src/core/mojigoto-trash.js'), 'utf8'), {
    module: trashModule,
    require: name => name === 'fs/promises' ? new Proxy(fs, { get(target, key) {
      if (key === 'readdir' || key === 'readFile') return (...args) => { reads.push([key, ...args]); return target[key](...args); };
      return target[key];
    } }) : name === 'path' ? path : name === './mojigoto-context' ? { isSingleMode: () => model.single }
      : { getMojigotoDirForSingle: () => dataDir(model.work), getMojigotoDirForWork: dataDir },
  });
  const vscode = {
    TreeItem: class { constructor(label, collapsibleState) { Object.assign(this, { label, collapsibleState }); } },
    ThemeIcon: class { constructor(id) { this.id = id; } },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    EventEmitter: class { event() {} fire() {} },
  };
  const filename = path.resolve(__dirname, '../src/tree/work-tree-provider.js');
  const nativeRequire = createRequire(filename), providerModule = { exports: {} };
  const stubs = {
    vscode,
    '../core/mojigoto-context': { isSingleMode: () => model.single, getResolvedManuscriptRoot: () => path.join(model.work, 'manuscript'), getCurrentWorkName: () => path.basename(model.work), getWorkRoot: () => root },
    '../core/mojigoto-paths': { getWorkManuscriptRoot: dir => path.join(dir, 'manuscript'), listWorkDirectories: () => [], listManuscriptChildren: () => [] },
    '../data/note-store': {}, '../core/mojigoto-trash': trashModule.exports,
    '../data/settings-store': { WORK_STATUS_OPTIONS: [], normalizeWorkStatus: value => value || '' },
    '../work/work-settings': { getCurrentWorkDisplayName: () => path.basename(model.work) },
    '../core/chapter-labels': { getDisplayChapterLabel: name => name },
    '../reorder/reorder-display-names': { readDisplayNamesSync: () => ({}) },
  };
  vm.runInNewContext(syncFs.readFileSync(filename, 'utf8'), { module: providerModule, console,
    require: name => Object.hasOwn(stubs, name) ? stubs[name] : nativeRequire(name) });
  const tree = new providerModule.exports.MojigotoWorkTreeProvider({ globalState: { get: (_key, fallback) => fallback } });
  tree.resolveCurrentViewWork = () => ({ workDir: model.work, workName: path.basename(model.work) });
  return { root, model, tree, store: trashModule.exports, reads,
    trash: () => path.join(dataDir(model.work), 'trash'),
    async node(kind = 'currentViewRoot') {
      const children = await tree.getChildren({ kind, fsPath: model.work, workName: path.basename(model.work) });
      return children.find(item => item.kind === 'trashRoot');
    },
  };
}

test('単一・View連携中・作品別の閉じたごみ箱に件数を表示し、本文やメタデータを読まない', async t => {
  const h = await fixture(t);
  await fs.mkdir(h.trash(), { recursive: true });
  await fs.writeFile(path.join(h.trash(), '原稿.txt'), '本文');
  await fs.writeFile(path.join(h.trash(), '原稿.txt.mojigoto-trash.json'), '{}');
  await fs.writeFile(path.join(h.trash(), '孤立.mojigoto-trash.json'), '{}');
  await fs.mkdir(path.join(h.trash(), '章'));
  await fs.writeFile(path.join(h.trash(), '章', '第二話.txt'), 'フォルダー内は合算しない');
  for (const kind of ['singleViewRoot', 'currentViewRoot', 'work']) {
    h.model.single = kind === 'singleViewRoot';
    const node = await h.node(kind); h.reads.length = 0;
    const rendered = await h.tree.getTreeItem(node);
    assert.equal(rendered, node); assert.equal(node.label, 'ゴミ箱'); assert.equal(node.description, '2件');
    assert.equal(node.contextValue, 'trashRoot'); assert.equal(node.collapsibleState, 1);
    assert.match(node.tooltip, /フォルダーも1件/);
    assert.equal(h.reads.length, 1); assert.equal(h.reads[0][0], 'readdir'); assert.equal(h.reads[0][1], h.trash());
    const entries = await h.store.listTrashEntries(node);
    assert.equal(entries.length, 2);
  }
  const normal = { kind: 'manuscriptFile' };
  assert.equal(h.tree.getTreeItem(normal), normal);
});

test('削除・復元・空にした後の再描画で件数が変わり、別作品の件数を混ぜない', async t => {
  const h = await fixture(t), original = path.join(h.model.work, '第一話.txt');
  await fs.mkdir(h.model.work); await fs.writeFile(original, '原稿');
  const node = await h.node();
  assert.equal((await h.tree.getTreeItem(node)).description, '0件');
  await h.store.moveToTrash(original, { workDir: h.model.work }); h.tree.refresh();
  assert.equal((await h.tree.getTreeItem(node)).description, '1件');
  const entry = (await h.store.listTrashEntries(node))[0];
  await h.store.restoreTrashItem(entry); h.tree.refresh();
  assert.equal((await h.tree.getTreeItem(node)).description, '0件');
  const firstWork = h.model.work;
  await h.store.moveToTrash(original, { workDir: firstWork });
  h.model.work = path.join(h.root, '作品B');
  assert.equal((await h.tree.getTreeItem(await h.node())).description, '0件');
  h.model.work = firstWork;
  assert.equal((await h.tree.getTreeItem(await h.node())).description, '1件');
  // Only clear the verified temporary trash owned by this fixture.
  const trash = path.resolve(h.trash());
  assert.ok(trash.startsWith(path.resolve(h.root) + path.sep));
  await fs.rm(trash, { recursive: true }); h.tree.refresh();
  assert.equal((await h.tree.getTreeItem(node)).description, '0件');
});

test('ごみ箱の不在は0件で作成せず、読込エラーを0件と誤表示しない', async t => {
  const h = await fixture(t), node = await h.node();
  assert.equal((await h.tree.getTreeItem(node)).description, '0件');
  await assert.rejects(fs.access(h.trash()), { code: 'ENOENT' });
  await fs.mkdir(path.dirname(h.trash()), { recursive: true });
  await fs.writeFile(h.trash(), 'フォルダーではない');
  assert.equal((await h.tree.getTreeItem(node)).description, '件数不明');
  assert.match(node.tooltip, /取得できません/);
  await fs.unlink(h.trash());
  assert.equal((await h.tree.getTreeItem(node)).description, '0件');
});
