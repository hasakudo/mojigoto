const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { createSharedNoteWatchersHarness: fixture } = require('./fixtures/shared-note-watchers-harness.cjs');
const indexes = h => h.trace.filter(x => x[0] === 'index').map(x => x[1]);
const metrics = h => h.trace.filter(x => x[0] === 'metrics');
const note = (work, folder = 'plots') => path.resolve(work, '.mojigoto', folder, 'nested', 'note.json');

test('shared note watchers retain both patterns and debounce create/change/delete at 500ms', () => {
  const h = fixture(); h.register();
  assert.deepEqual(h.watchers.map(x => x.pattern), ['**/.mojigoto/plots/**/*.json', '**/.mojigoto/references/**/*.json']);
  h.emit(0, 'create', note('a')); h.emit(0, 'change', note('a')); h.emit(1, 'delete', note('a', 'references'));
  assert.equal(h.timers.size, 1); assert.equal(metrics(h).length, 0);
  assert.ok(h.trace.filter(x => x[0] === 'timer').every(x => x[1] === 500));
  h.flush(); assert.deepEqual(metrics(h), [['metrics', 'notes']]);
  assert.deepEqual(indexes(h), [path.resolve('a/.mojigoto')]);
});

test('multiple works are indexed once in arrival order and cleared between bursts', () => {
  const h = fixture(); h.register();
  h.emit(0, 'change', note('b')); h.emit(1, 'change', note('a', 'references')); h.emit(0, 'delete', note('b'));
  h.flush(); h.emit(0, 'change', note('c')); h.flush();
  assert.deepEqual(indexes(h), ['b', 'a', 'c'].map(x => path.resolve(x, '.mojigoto')));
  assert.equal(metrics(h).length, 2);
});

test('fallback resolves the current work at execution time and skips an absent settings path', () => {
  const h = fixture(); h.register(); h.emit(0, 'change');
  h.model.settingsPath = path.resolve('changed/.mojigoto/work.json'); h.flush();
  assert.deepEqual(indexes(h), [path.dirname(h.model.settingsPath)]);
  h.emit(1, 'delete', path.resolve('unrelated/file.json')); h.model.settingsPath = ''; h.flush();
  assert.equal(indexes(h).length, 1); assert.equal(metrics(h).length, 2);
});

test('nested note paths and existing folder-name case handling are retained', () => {
  const h = fixture(); h.register();
  h.emit(0, 'change', note('a', 'PLOTS')); h.flush();
  assert.deepEqual(indexes(h), [path.resolve('a/.mojigoto')]);
  assert.equal(h.trace.filter(x => x[0] === 'settings').length, 0);
});

test('disposal cancels pending work and ignores queued timer and late watcher events', () => {
  const h = fixture(); h.register(); h.emit(0, 'change', note('a'));
  const queued = h.timerHistory[0]; h.dispose();
  for (const i of [0, 1]) for (const event of ['create', 'change', 'delete']) h.emit(i, event, note('b'));
  queued(); h.flush(); h.dispose();
  assert.equal(h.timers.size, 0); assert.equal(metrics(h).length, 0); assert.deepEqual(indexes(h), []);
  assert.deepEqual(h.watchers.map(x => x.disposeCount), [1, 1]);
});

test('partial registration failure cleans every created watcher, rejects stale events and rethrows', () => {
  const h = fixture(); const error = Error('registration failed');
  h.hooks.register = (index, event) => { if (index === 1 && event === 'delete') throw error; };
  assert.throws(() => h.register(), e => e === error);
  assert.deepEqual(h.watchers.map(x => x.disposeCount), [1, 1]);
  h.emit(0, 'create', note('a')); h.emit(1, 'change', note('b')); h.flush();
  assert.equal(metrics(h).length, 0); assert.equal(h.context.subscriptions.length, 0);
  delete h.hooks.register; h.register(); h.emit(2, 'change', note('c')); h.flush();
  assert.deepEqual(indexes(h), [path.resolve('c/.mojigoto')]);
});

test('second watcher creation failure cleans the first watcher and preserves the error', () => {
  const h = fixture(); const error = Error('creation failed');
  h.hooks.create = index => { if (index === 1) throw error; };
  assert.throws(() => h.register(), e => e === error);
  assert.equal(h.watchers[0].disposeCount, 1); assert.equal(h.context.subscriptions.length, 0);
});

test('disposing one registration does not affect another registration', () => {
  const a = fixture(), b = fixture(); a.register(); b.register();
  a.dispose(); b.emit(0, 'change', note('b')); b.flush();
  assert.equal(metrics(a).length, 0); assert.equal(metrics(b).length, 1);
});

test('real note index reflects create, edit and delete without changing the other work', t => {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(tempRoot, 'mojigoto-shared-note-watchers-'));
  t.after(() => {
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), tempRoot);
    assert.ok(path.basename(resolved).startsWith('mojigoto-shared-note-watchers-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  const { writeNoteIndex } = require('../src/data/note-index');
  const h = fixture({ writeIndex: writeNoteIndex }); h.register();
  const dir = path.join(root, 'a', '.mojigoto'), other = path.join(root, 'b', '.mojigoto');
  const file = path.join(dir, 'plots', 'note.json');
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.mkdirSync(other, { recursive: true });
  writeNoteIndex(other); const otherFile = path.join(other, 'notes-index.json');
  const otherBefore = fs.readFileSync(otherFile, 'utf8');
  const indexFile = path.join(dir, 'notes-index.json');
  fs.writeFileSync(file, JSON.stringify({ id: 'a', title: '初期', groups: [] }));
  h.emit(0, 'create', file); h.flush();
  assert.equal(JSON.parse(fs.readFileSync(indexFile, 'utf8')).plots[0].title, '初期');
  fs.writeFileSync(file, JSON.stringify({ id: 'a', title: '変更', groups: [] }));
  h.emit(0, 'change', file); h.flush();
  assert.equal(JSON.parse(fs.readFileSync(indexFile, 'utf8')).plots[0].title, '変更');
  fs.unlinkSync(file); h.emit(0, 'delete', file); h.flush();
  assert.deepEqual(JSON.parse(fs.readFileSync(indexFile, 'utf8')).plots, []);
  assert.equal(fs.readFileSync(otherFile, 'utf8'), otherBefore); h.dispose();
});
