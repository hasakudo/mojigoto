const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createMemoSettingsHarness: fixture } = require('./fixtures/memo-settings-harness.cjs');
const noteKey = 'noteMemoAutoSyncEnabled', conceptKey = 'conceptMemoAutoSyncEnabled';
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('queued settings and an unanswered confirmation cannot enable sync after disposal', async () => {
  const h = fixture(), entered = gate(), release = gate(); h.register(); await h.drain();
  h.hooks.prompt = () => { entered.resolve(); return release.promise; };
  const first = h.set(noteKey, true), second = h.set(conceptKey, true);
  const settled = [first, second].map(job => assert.rejects(job, error => error.code === 'cancelled'));
  await entered.promise; h.dispose(); release.resolve('すべてONにする'); await Promise.all(settled);
  h.change(noteKey, true); await h.drain();
  assert.ok(!h.trace.some(x => ['flag', 'config.start', 'write', 'error'].includes(x[0])));
  assert.equal(h.trace.filter(x => x[0] === 'prompt').length, 1);
});

test('disposal while reading a memo stops migration before writing or confirming settings', async () => {
  for (const key of [noteKey, conceptKey]) {
    const h = fixture(), entered = gate(), release = gate(); h.register(); await h.drain();
    h.model.decision = '既存はOFFのまま';
    const file = path.join(h.directory, key === noteKey ? 'plots/a.json' : 'concept-memos.json');
    const raw = JSON.stringify(key === noteKey ? { groups: [{ items: [{ memo: { text: '保持' } }] }] } : { memos: [{ source: { kind: 'noteItem' } }] });
    h.files.set(file, raw); h.hooks.read = () => { entered.resolve(); return release.promise; };
    const running = h.set(key, true), settled = assert.rejects(running, error => error.code === 'cancelled');
    await entered.promise; h.dispose(); release.resolve(); await settled;
    assert.equal(h.files.get(file), raw); assert.equal(h.flags.size, 0);
    assert.ok(!h.trace.some(x => ['write', 'config.start', 'info'].includes(x[0])));
  }
});

test('an already started migration write may finish but cannot start the next file after disposal', async () => {
  const h = fixture(), entered = gate(), release = gate(); h.register(); await h.drain();
  h.model.decision = '既存はOFFのまま';
  const first = path.join(h.directory, 'plots/a.json'), second = path.join(h.directory, 'plots/b.json');
  const raw = JSON.stringify({ groups: [{ items: [{ memo: { text: '保持' } }] }] });
  h.files.set(first, raw); h.files.set(second, raw);
  h.hooks.write = () => { entered.resolve(); return release.promise; };
  const running = h.set(noteKey, true), settled = assert.rejects(running, error => error.code === 'cancelled');
  await entered.promise; h.dispose(); release.resolve(); await settled;
  assert.equal(JSON.parse(h.files.get(first)).groups[0].items[0].memo.autoSyncToConceptMemoOverride, false);
  assert.equal(h.files.get(second), raw); assert.equal(h.flags.size, 0);
  assert.ok(!h.trace.some(x => ['notify.note', 'config.start', 'info'].includes(x[0])));
});

test('failure rollback completes before a newer request to enable sync', async () => {
  const h = fixture(), entered = gate(), release = gate(); h.register(); await h.drain();
  h.hooks.prompt = () => { throw Error('confirmation failed'); };
  h.hooks.configUpdate = (key, value) => { if (!value) { entered.resolve(); return release.promise; } };
  h.change(noteKey, true); await entered.promise; delete h.hooks.prompt;
  let finished = false; const newer = h.set(noteKey, true).then(() => { finished = true; });
  await h.drain(); assert.equal(finished, false);
  release.resolve(); await newer; await h.drain();
  assert.equal(h.model.values[noteKey], true);
  assert.deepEqual(h.trace.filter(x => x[0] === 'config.end').map(x => x[2]), [false, true]);
  assert.equal(h.trace.filter(x => x[0] === 'error').length, 1);
});

test('a failed rollback is reported once and does not block the next setting operation', async () => {
  const h = fixture(); h.register(); await h.drain();
  h.hooks.prompt = () => { throw Error('confirmation failed'); };
  h.hooks.configUpdate = () => { throw Error('storage failed'); };
  h.change(noteKey, true); await h.drain();
  const errors = h.trace.filter(x => x[0] === 'error'); assert.equal(errors.length, 1);
  assert.match(errors[0][1], /confirmation failed.*storage failed/);
  delete h.hooks.configUpdate; await h.set(noteKey, false); assert.equal(h.model.values[noteKey], false);
});

test('disposal during rollback suppresses the late error notification', async () => {
  const h = fixture(), entered = gate(), release = gate(); h.register(); await h.drain();
  h.hooks.prompt = () => { throw Error('confirmation failed'); };
  h.hooks.configUpdate = () => { entered.resolve(); return release.promise; };
  h.change(noteKey, true); await entered.promise; h.dispose(); release.resolve(); await h.drain();
  assert.ok(!h.trace.some(x => x[0] === 'error'));
});

test('invalid requests are rejected and independent contexts do not share confirmation queues', async () => {
  const a = fixture(), b = fixture(), entered = gate(), release = gate();
  a.hooks.prompt = () => { entered.resolve(); return release.promise; };
  const first = a.set(noteKey, true); await entered.promise; await b.set(conceptKey, true);
  assert.equal(b.model.values[conceptKey], true); assert.equal(a.model.values[noteKey], false);
  for (const args of [['unknown', true], [noteKey, 'true']]) await assert.rejects(a.set(...args), /確認してください/);
  release.resolve('すべてONにする'); await first;
});
