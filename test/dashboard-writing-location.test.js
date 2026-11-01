const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { getWritingMemoLocationLabel: label } = require('../src/stats/writing-memo-location');
const base = path.resolve('.review-baseline/test-temp/writing-location');
const view = path.join(base, 'View', 'manuscript'), a = path.join(base, 'A'), b = path.join(base, 'B');
const root = work => path.join(work, 'manuscript');
const memoPath = work => path.join(work, 'writing-memos.json');
const roots = { viewRoot: view, workRoots: [root(a), root(b)] };

test('表示区分は解決済み原稿の場所に従い、似た名前の隣接フォルダを含めない', () => {
  assert.equal(label(path.join(view, 'chapter', 'one.md'), roots), 'View側');
  assert.equal(label(path.join(root(a), 'one.txt'), roots), '作品元側');
  assert.equal(label(path.join(root(b), 'one.txt'), roots), '作品元側');
  assert.equal(label(path.join(view + '-other', 'one.txt'), roots), '参照先未確認');
  assert.equal(label('', roots), '参照先不明');
  assert.equal(label(path.join(base, 'outside.txt'), roots), '参照先未確認');
  if (process.platform === 'win32') assert.equal(label(path.join(view, 'one.txt').toUpperCase(), roots), 'View側');
});

test('包含する原稿フォルダが複数ある場合は最も具体的な場所を採用する', () => {
  assert.equal(label(path.join(root(a), 'one.txt'), { viewRoot: base, workRoots: [root(a)] }), '作品元側');
  assert.equal(label(path.join(view, 'one.txt'), { viewRoot: view, workRoots: [base] }), 'View側');
});

function fixture() {
  let current = 'A';
  const files = new Map([[path.join(view, 'one.txt'), '本文'], [path.join(root(a), 'one.txt'), '本文'], [path.join(root(b), 'one.txt'), '本文']]);
  const stores = new Map([[memoPath(a), { memos: [{ id: 'a', filePath: 'one.txt', fileName: 'one.txt', excerpt: '本文', targetLocation: 'view' }] }],
    [memoPath(b), { memos: [{ id: 'b', filePath: 'one.txt', fileName: 'one.txt', excerpt: '本文', targetLocation: 'view' }] }]]);
  const paths = { listWorkDirectories: () => [{ name: 'A', fsPath: a }, { name: 'B', fsPath: b }], getWritingMemosPathForWork: memoPath, getWorkManuscriptRoot: root };
  const vscode = { workspace: { getConfiguration: () => ({ get: (key, fallback) => key === 'manuscriptRoot' ? view : fallback }) } };
  const context = { globalState: { get: () => current } };
  const resolverModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/writing-memo/writing-memo-resolver.js'), 'utf8'), {
    module: resolverModule, process,
    require: name => name === 'path' ? path : name === 'vscode' ? vscode
      : name === 'fs' ? { existsSync: file => files.has(file), readFileSync: file => files.get(file), readdirSync: () => [] }
      : name === '../core/mojigoto-context' ? { isSingleMode: () => false } : paths,
  });
  const module = { exports: {} };
  let code = fs.readFileSync(path.join(__dirname, '../src/stats/stats-state.js'), 'utf8');
  // Expose the internal projection only in this VM, without extending the product API.
  code = code.replace('  return async function buildStatsState(', '  globalThis.selectedWork = buildWritingMemosForSelectedWork;\n  return async function buildStatsState(');
  const sandbox = { module, process, require: name => name === 'path' ? path : name === 'vscode' ? vscode
    : name === './writing-memo-location' ? require('../src/stats/writing-memo-location')
    : name === '../core/mojigoto-context' ? { isSingleMode: () => false }
    : name === '../core/mojigoto-paths' ? paths
    : name === '../writing-memo/writing-memo-resolver' ? resolverModule.exports
    : name === '../writing-memo/writing-memo-store' ? { readWritingMemos: async file => stores.get(file) }
    : name === '../reorder/reorder-display-names' ? { readDisplayNamesSync: () => ({}), getDisplayNameFromData: () => 'one.txt' } : {} };
  vm.createContext(sandbox); vm.runInContext(code, sandbox);
  sandbox.module.exports.createBuildStatsState({ getWorkName: () => current });
  return { files, stores, switchWork: name => { current = name; }, selected: name => sandbox.selectedWork(context, { selectedWritingMemoWorkId: name }) };
}

test('作品切り替えでView／作品元の表示だけが変わり、保存済み区分・ジャンプ情報は維持する', async () => {
  const h = fixture(), before = JSON.stringify([...h.stores]);
  let data = await h.selected('A');
  assert.equal(data.items[0].resolvedLocationLabel, 'View側'); assert.equal(data.items[0].absoluteFilePath, path.join(view, 'one.txt'));
  data = await h.selected('B');
  assert.equal(data.items[0].resolvedLocationLabel, '作品元側'); assert.equal(data.items[0].targetLocation, 'view');
  assert.equal(data.items[0].absoluteFilePath, path.join(root(b), 'one.txt'));
  h.switchWork('B');
  data = await h.selected('B'); assert.equal(data.items[0].resolvedLocationLabel, 'View側');
  data = await h.selected('A'); assert.equal(data.items[0].resolvedLocationLabel, '作品元側');
  assert.equal(JSON.stringify([...h.stores]), before);
});

test('原稿が見つからない場合は保存区分を表示せず、解決先が別作品ならその実際の場所を表示する', async () => {
  const h = fixture(); h.files.clear();
  let data = await h.selected('A');
  assert.equal(data.items[0].resolvedLocationLabel, '参照先不明'); assert.equal(data.items[0].targetLocation, 'view');
  h.files.set(path.join(root(b), 'one.txt'), '本文');
  data = await h.selected('A');
  assert.equal(data.items[0].resolvedLocationLabel, '作品元側'); assert.equal(data.items[0].absoluteFilePath, path.join(root(b), 'one.txt'));
});

test('一覧HTMLは現在の区分を優先し、操作用データの元の区分は保持する', () => {
  const sandbox = { module: { exports: {} } }; vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/stats/stats-html/stats-html-records.js'), 'utf8'), sandbox);
  for (const text of ['作品元側', 'View側', '参照先不明', '参照先未確認']) {
    const html = sandbox.renderWritingMemoItem({ id: 'm', fileName: 'one.txt', targetLocation: 'view', resolvedLocationLabel: text }, String, '', { showFileName: true });
    assert.ok(html.includes(`title="現在の参照先">${text}</span>`));
    assert.ok(html.includes('&quot;targetLocation&quot;:&quot;view&quot;'));
  }
});
