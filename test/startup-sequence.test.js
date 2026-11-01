const test = require('node:test');
const assert = require('node:assert/strict');
const { createStartupHarness: fixture } = require('./fixtures/startup-sequence-harness.cjs');
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('startup retains tree, setup, import, focus scheduling and reminder order', async () => {
  const h = fixture(); await h.run();
  assert.deepEqual(h.trace, [['tree'], ['setup'], ['import'], ['timer', 250], ['remind', 'activate']]);
  await h.flush(); assert.deepEqual(h.trace.at(-1), ['command', 'mojigoto.workTree.focus']);
});

test('startup preserves late binding of shared writing record import', async () => {
  const h = fixture(), entered = gate(), release = gate();
  h.hooks.tree = () => { entered.resolve(); return release.promise; };
  const running = h.run(); await entered.promise;
  h.replaceImport(async () => h.trace.push(['replacement-import'])); release.resolve(); await running;
  assert.ok(h.trace.some(x => x[0] === 'replacement-import'));
  assert.ok(!h.trace.some(x => x[0] === 'import'));
});

test('disposal at each await boundary prevents remaining startup effects', async () => {
  for (const stage of ['tree', 'setup', 'import']) {
    const h = fixture(), entered = gate(), release = gate();
    h.hooks[stage] = () => { entered.resolve(); return release.promise; };
    const running = h.run(); await entered.promise; const before = [...h.trace];
    h.dispose(); release.resolve(); await running;
    assert.deepEqual(h.trace, before); assert.equal(h.timers.size, 0);
  }
});

test('disposal clears delayed focus and rejects a callback already queued', async () => {
  const h = fixture(); await h.run(); const queued = h.timerHistory[0];
  h.dispose(); h.dispose(); await queued(); await h.flush();
  assert.equal(h.timers.size, 0); assert.ok(!h.trace.some(x => x[0] === 'command'));
});

test('startup exceptions keep the original error reporting and stop later stages', async () => {
  for (const stage of ['tree', 'setup', 'import', 'remind']) {
    const h = fixture(); h.hooks[stage] = () => { throw Error(stage + ' failed'); };
    await h.run();
    assert.equal(h.trace.filter(x => x[0] === 'error').length, 1);
    assert.deepEqual(h.trace.at(-1), ['error', 'Mojigoto activate error:', 'Error: ' + stage + ' failed']);
    assert.equal(h.timers.size, stage === 'remind' ? 1 : 0);
    h.dispose();
  }
});

test('rejected focus command is handled and registrations remain independent', async () => {
  const a = fixture(), b = fixture(); await a.run(); await b.run(); a.dispose();
  b.hooks.command = () => { throw Error('focus failed'); }; await b.flush();
  assert.ok(b.trace.some(x => x[0] === 'command')); assert.ok(!a.trace.some(x => x[0] === 'command'));
});
