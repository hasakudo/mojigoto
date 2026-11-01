const test = require('node:test');
const assert = require('node:assert/strict');
const { createRestoredLifecycleHarness: fixture } = require('./fixtures/restored-lifecycle-harness.cjs');
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const cancelled = error => error.code === 'cancelled';

test('disposing a restoration registration cancels an in-flight serializer and queued opens', async () => {
  const h = fixture(), release = gate(); h.hooks.deserialize = () => release.promise;
  const registration = h.register(); const handler = h.handlers.get('notes');
  const restoring = handler.deserializeWebviewPanel(h.panel().panel, { id: 1 });
  let opened = 0;
  const first = h.open(() => ++opened), second = h.open(() => ++opened);
  const settled = [restoring, first, second].map(job => assert.rejects(job, cancelled));
  registration.dispose(); await Promise.all(settled); release.resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(opened, 0); assert.equal(h.timers.size, 0);
  await assert.rejects(handler.deserializeWebviewPanel(h.panel().panel, { id: 2 }), cancelled);
  assert.equal(h.trace.filter(x => x[0] === 'deserialize').length, 1);
});

test('disposal stops a pending activation command, clears its timeout and releases the shared queue', async () => {
  const h = fixture(), entered = gate(), release = gate();
  const registration = h.register();
  h.hooks.command = () => { entered.resolve(); return release.promise; };
  let opened = 0; const opening = h.open(() => ++opened);
  const settled = assert.rejects(opening, cancelled); await entered.promise;
  assert.equal(h.timers.size, 1); registration.dispose(); assert.equal(h.timers.size, 0);
  await settled;
  h.register('other'); assert.equal(await h.open(() => 'next', 'other'), 'next');
  release.resolve(); assert.equal(opened, 0);
});

test('disposal of unmatched restored records removes both temporary listeners once', async () => {
  const h = fixture({ names: ['同名', '同名'] }), registration = h.register();
  const p = h.panel(); await h.handlers.get('notes').deserializeWebviewPanel(p.panel, { id: 1 });
  assert.equal(typeof p.events.change, 'function'); assert.equal(typeof p.events.close, 'function');
  registration.dispose(); registration.dispose();
  assert.deepEqual(Object.keys(p.events), []);
  assert.equal(h.trace.filter(x => x[0] === 'remove').length, 2);
  assert.equal(h.trace.filter(x => x[0] === 'unregister').length, 1);
});

test('closing an unmatched restored panel releases both listeners', async () => {
  const h = fixture({ names: ['同名', '同名'] }), registration = h.register();
  const p = h.panel(); await h.handlers.get('notes').deserializeWebviewPanel(p.panel, {});
  p.events.close(); assert.deepEqual(Object.keys(p.events), []);
  const removed = h.trace.filter(x => x[0] === 'remove').length;
  registration.dispose(); assert.equal(h.trace.filter(x => x[0] === 'remove').length, removed);
});

test('failed serializer registration does not create phantom restoration state', async () => {
  const h = fixture(); const error = Error('registration failed'); h.hooks.register = () => { throw error; };
  assert.throws(() => h.register(), e => e === error);
  assert.equal(await h.open(() => 'opened'), 'opened');
  assert.equal(h.trace.filter(x => x[0] === 'command').length, 0);
});

test('disposing an older registration does not remove a newer registration of the same type', async () => {
  const h = fixture(), old = h.register(); h.register(); old.dispose();
  h.hooks.command = async () => {
    await h.handlers.get('notes').deserializeWebviewPanel(h.panel().panel, { id: 2 });
  };
  assert.equal(await h.open(() => 'new registration'), 'new registration');
  assert.equal(h.trace.filter(x => x[0] === 'command').length, 1);
});

test('deserialize return values and retry after a failed serializer are retained', async () => {
  const h = fixture({ names: [] }); h.register(); const handler = h.handlers.get('notes');
  h.hooks.deserialize = () => { throw Error('read failed'); };
  await assert.rejects(handler.deserializeWebviewPanel(h.panel('note').panel, {}), /read failed/);
  delete h.hooks.deserialize;
  const saved = { id: 3 }; assert.equal(await handler.deserializeWebviewPanel(h.panel('note').panel, saved), saved);
  assert.equal(await h.open(() => 'retry'), 'retry');
});
