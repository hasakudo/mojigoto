const test = require('node:test');
const assert = require('node:assert/strict');
const { createTreeWatchersHarness: fixture } = require('./fixtures/tree-watchers-harness.cjs');
const refreshCount = h => h.trace.filter(x => x[0] === 'refresh').length;

test('tree watchers retain ordinary workspace refresh and warehouse debounce', () => {
  const h = fixture(); h.register();
  for (const name of ['create', 'delete', 'rename', 'save']) h.callbacks[name]();
  assert.equal(refreshCount(h), 4);
  h.watchers[0].create(); h.watchers[0].delete(); h.watchers[0].create();
  assert.equal(h.timers.size, 1); assert.equal(refreshCount(h), 4);
  h.flush(); assert.equal(refreshCount(h), 5);
  assert.deepEqual(h.trace.find(x => x[0] === 'watcher.create')[3], [false, true, false]);
  assert.equal(h.trace.find(x => x[0] === 'timer')[1], 120);
});

test('all relevant settings replace the watcher while unrelated settings preserve it', () => {
  for (const key of ['mode', 'workRoot', 'manuscriptRoot', 'exportRoot']) {
    const h = fixture(); h.register(); h.config('unrelated');
    assert.equal(h.watchers.length, 1); assert.equal(refreshCount(h), 0);
    h.watchers[0].create(); const queued = h.timerHistory[0];
    h.model.root = '/new-root'; h.config(key);
    assert.equal(h.watchers[0].disposeCount, 1); assert.equal(h.watchers.length, 2);
    assert.equal(h.timers.size, 0); assert.equal(refreshCount(h), 1);
    h.watchers[0].create(); queued(); assert.equal(refreshCount(h), 1);
    h.watchers[1].delete(); h.flush(); assert.equal(refreshCount(h), 2);
  }
});

test('empty warehouse root retains workspace events and permits later configuration', () => {
  const h = fixture(); h.model.root = ''; h.register();
  assert.equal(h.watchers.length, 0); h.callbacks.save(); assert.equal(refreshCount(h), 1);
  h.model.root = '/warehouse'; h.config('exportRoot'); assert.equal(h.watchers.length, 1);
});

test('disposal cancels timers and rejects late workspace, configuration and warehouse callbacks', () => {
  const h = fixture(); h.register(); h.watchers[0].create();
  const queued = h.timerHistory[0]; h.dispose();
  for (const name of ['create', 'delete', 'rename', 'save']) h.callbacks[name]();
  h.config('exportRoot'); h.watchers[0].create(); h.watchers[0].delete(); queued(); h.flush();
  assert.equal(refreshCount(h), 0); assert.equal(h.watchers.length, 1);
  assert.equal(h.timers.size, 0);
  h.context.subscriptions[0].dispose(); assert.equal(h.watchers[0].disposeCount, 1);
});

test('partial registration failure disposes watcher and invalidates installed callbacks before retry', () => {
  const h = fixture(); h.hooks.register = () => { throw Error('register failure'); }; h.register();
  assert.equal(h.watchers[0].disposeCount, 1);
  h.watchers[0].create(); h.flush(); assert.equal(refreshCount(h), 0);
  assert.equal(h.trace.filter(x => x[0] === 'error').length, 1);
  delete h.hooks.register; h.config('exportRoot'); h.watchers[1].create(); h.flush();
  assert.equal(refreshCount(h), 2); h.dispose();
  assert.equal(h.watchers[0].disposeCount, 1); assert.equal(h.watchers[1].disposeCount, 1);
});

test('watcher creation failure permits later retry', () => {
  const h = fixture(); h.hooks.create = () => { throw Error('create failure'); }; h.register();
  assert.equal(h.watchers.length, 0); assert.equal(h.trace.filter(x => x[0] === 'error').length, 1);
  delete h.hooks.create; h.config('exportRoot'); h.watchers[0].delete(); h.flush();
  assert.equal(refreshCount(h), 2);
});

test('refresh failure is logged and does not stop later events', () => {
  const h = fixture(); h.register(); h.hooks.refresh = () => { throw Error('refresh failure'); };
  h.callbacks.save(); delete h.hooks.refresh; h.callbacks.rename();
  assert.equal(refreshCount(h), 2); assert.equal(h.trace.filter(x => x[0] === 'error').length, 1);
});

test('registration rejects missing refresh API', () => {
  const h = fixture();
  for (const args of [[null, h.provider], [h.context, null], [h.context, {}]]) {
    assert.throws(() => h.api.registerTreeRefreshWatchers(...args), /treeProvider.refresh is required/);
  }
});
