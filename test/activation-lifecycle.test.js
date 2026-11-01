const test = require('node:test');
const assert = require('node:assert/strict');
const { createActivationHarness: fixture } = require('./fixtures/activation-harness.cjs');
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('activation registers save logging and active-editor count refresh once', async () => {
  const h = fixture(); await h.activate();
  assert.equal(h.callbacks.save.length, 2); // One statistics logger and one count refresh.
  assert.equal(h.callbacks.active.length, 1);
  const before = h.trace.length; await h.emit('save', {}); await h.emit('active');
  assert.equal(h.trace.slice(before).filter(x => x[0] === 'logSave').length, 1);
  assert.equal(h.trace.slice(before).filter(x => x[0] === 'timer' && x[1] === 400).length, 2);
  await h.flush(); h.dispose();
});

test('disposing the activation context cancels startup focus and count timers', async () => {
  const h = fixture(); await h.activate(); await new Promise(resolve => setImmediate(resolve));
  const queued = [...h.timerHistory]; h.dispose(); const before = h.trace.length;
  for (const fn of queued) await fn(); await h.emit('active'); await h.emit('edit'); await h.flush();
  assert.equal(h.timers.size, 0);
  assert.ok(!h.trace.slice(before).some(x => ['text', 'command', 'show', 'hide'].includes(x[0])));
  assert.deepEqual(h.trace.filter(x => x[0] === 'disposeItem').map(x => x[1]), [2, 1, 0]);
});

test('counts retain normal display, progress and save baseline updates', async () => {
  const h = fixture(); h.setEditor(); const counts = h.createCounts(); counts.initialize();
  await counts.recalcAll('save');
  assert.equal(counts.items.itemFile.text, '$(file) 2');
  assert.equal(counts.items.itemChap.text, '$(file-directory) 2 (+2)');
  assert.equal(counts.items.itemTotal.text, '$(book) 2 (+2) 進捗 2.0%');
  assert.equal(h.model.state.get('chap:chapter'), 2); assert.equal(h.model.state.get('total:all'), 2);
  await counts.recalcAll('edit'); assert.equal(counts.items.itemTotal.text, '$(book) 2 進捗 2.0%');
  h.dispose();
});

test('count updates awaiting state persistence do not write to disposed items', async () => {
  for (const key of ['chap:chapter', 'total:all']) {
    const h = fixture(); h.setEditor(); const counts = h.createCounts();
    const entered = gate(), release = gate();
    h.hooks.update = name => { if (name === key) { entered.resolve(); return release.promise; } };
    const running = counts.recalcAll('save'); await entered.promise; h.dispose();
    const before = h.trace.length; release.resolve(); await running;
    assert.ok(!h.trace.slice(before).some(x => x[0] === 'text'));
  }
});

test('counts reject public update calls and late configuration callbacks after disposal', async () => {
  const h = fixture(); const counts = h.createCounts(); counts.initialize(); h.dispose();
  const before = h.trace.length; counts.dispose(); counts.initialize(); counts.updateVisibility();
  counts.scheduleRecalc('late'); await counts.recalcAll('late');
  await h.emit('config', { affectsConfiguration: () => true }); await h.flush();
  assert.deepEqual(h.trace.slice(before), []);
});

test('an older count update does not overwrite a newer display after persistence completes', async () => {
  const h = fixture(); h.setEditor(); const counts = h.createCounts();
  const entered = gate(), release = gate();
  h.hooks.update = () => { entered.resolve(); return release.promise; };
  const running = counts.recalcAll('save'); await entered.promise;
  h.model.content = '新しい本文'; await counts.recalcAll('edit');
  const before = h.trace.length; release.resolve(); await running;
  assert.ok(!h.trace.slice(before).some(x => x[0] === 'text')); h.dispose();
});

test('overlapping activations retain their own shared-record importer', async () => {
  const h = fixture(), entered = gate(), release = gate(); let setupCount = 0;
  h.hooks.setup = () => { if (++setupCount === 1) { entered.resolve(); return release.promise; } };
  await h.activate(); await entered.promise; await h.activate();
  await new Promise(resolve => setImmediate(resolve)); release.resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.trace.filter(x => x[0] === 'import').map(x => x[1]), [2, 1]); h.dispose();
});
