const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createBackupStorageHarness: fixture } = require('./fixtures/backup-storage-harness.cjs');
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const emptyIndex = JSON.stringify({ schemaVersion: 1, snapshots: [] });

test('manuscript, note and concept operations share the index read-modify-write queue', async () => {
  const h = fixture(), entered = gate(), release = gate(); h.seed(h.indexPath, emptyIndex);
  let held = false;
  h.hooks.read = file => { if (file === h.indexPath && !held) { held = true; entered.resolve(); return release.promise; } };
  const first = h.manuscript.createManuscriptBackup(h.document()); await entered.promise;
  let finished = false;
  const rest = Promise.all([
    h.structured.createStructuredBackup({ filePath: path.join(h.mojigoto, 'plots/a.json'), targetType: 'note', content: '{"title":"人物"}' }),
    h.structured.createStructuredBackup({ filePath: path.join(h.mojigoto, 'concept-memos.json'), targetType: 'conceptMemo', content: '{"memos":[]}' }),
  ]).then(value => { finished = true; return value; });
  await h.drain(); assert.equal(finished, false); release.resolve(); await Promise.all([first, rest]);
  assert.deepEqual((await h.readIndex()).snapshots.map(x => x.targetType).sort(), ['conceptMemo', 'manuscript', 'note']);
});

test('parallel manual backups deduplicate identical manuscript content', async () => {
  const h = fixture(); const doc = h.document();
  const results = await Promise.all([h.manuscript.createManuscriptBackup(doc), h.manuscript.createManuscriptBackup(doc)]);
  assert.deepEqual(results.map(x => x.duplicate), [false, true]); assert.equal((await h.readIndex()).snapshots.length, 1);
});

test('automatic interval checks are serialized with creation', async () => {
  const h = fixture(); h.model.intervalMinutes = 5; const doc = h.document();
  await Promise.all([h.manuscript.maybeCreateAutomaticBackup(doc), h.manuscript.maybeCreateAutomaticBackup(doc)]);
  doc.setText('変更した本文'); await h.manuscript.maybeCreateAutomaticBackup(doc);
  assert.equal((await h.readIndex()).snapshots.length, 1);
});

test('manuscript content is captured at the manual request before it waits for the queue', async () => {
  const h = fixture(), entered = gate(), release = gate();
  const lock = h.storage().enqueueBackupOperation(h.indexPath, async () => { entered.resolve(); await release.promise; });
  await entered.promise; const doc = h.document('a.txt', '要求時の本文');
  const backup = h.manuscript.createManuscriptBackup(doc); doc.setText('待機中の編集'); release.resolve(); await lock;
  const result = await backup;
  const snapshotPath = path.join(result.context.snapshotsRoot, result.entry.snapshotFile);
  const snapshot = JSON.parse(h.files.get(process.platform === 'win32' ? snapshotPath.toLowerCase() : snapshotPath));
  assert.equal(snapshot.content, '要求時の本文');
});

test('a failed operation does not block following backups and independent works do not wait', async () => {
  const h = fixture(), entered = gate(), release = gate();
  const failure = h.storage().enqueueBackupOperation(h.indexPath, async () => { entered.resolve(); await release.promise; throw Error('failed'); });
  const checked = assert.rejects(failure, /failed/); await entered.promise;
  assert.equal(await h.storage().enqueueBackupOperation(path.resolve('other/index.json'), () => 'independent'), 'independent');
  const backup = h.manuscript.createManuscriptBackup(h.document()); release.resolve(); await checked; await backup;
  assert.equal((await h.readIndex()).snapshots.length, 1);
});

test('relative paths and Windows case variants use the same queue', async () => {
  const h = fixture(), entered = gate(), release = gate(); const events = [];
  const first = h.storage().enqueueBackupOperation(h.indexPath, async () => { entered.resolve(); await release.promise; events.push('first'); });
  await entered.promise;
  const alias = process.platform === 'win32' ? h.indexPath.toUpperCase() : path.relative(process.cwd(), h.indexPath);
  const second = h.storage().enqueueBackupOperation(alias, () => events.push('second'));
  await h.drain(); assert.deepEqual(events, []); release.resolve(); await Promise.all([first, second]);
  assert.deepEqual(events, ['first', 'second']);
});

test('history lists wait for earlier index updates for both backup types', async () => {
  for (const type of ['manuscript', 'note']) {
    const h = fixture(), entered = gate(), release = gate(); const doc = h.document();
    const filePath = path.join(h.mojigoto, 'plots/a.json');
    const lock = h.storage().enqueueBackupOperation(h.indexPath, async () => { entered.resolve(); await release.promise; });
    await entered.promise;
    const create = type === 'manuscript' ? h.manuscript.createManuscriptBackup(doc) : h.structured.createStructuredBackup({ filePath, targetType: 'note', content: '{}' });
    const listing = type === 'manuscript' ? h.manuscript.listManuscriptBackups(doc) : h.structured.listStructuredBackups(filePath, 'note');
    release.resolve(); await lock; await create; assert.equal((await listing).entries.length, 1);
  }
});

test('protection from both history menus preserves a concurrently added different backup type', async () => {
  for (const type of ['manuscript', 'note']) {
    const h = fixture(), entered = gate(), release = gate(); const doc = h.document();
    const filePath = path.join(h.mojigoto, 'plots/a.json');
    const initial = type === 'manuscript' ? await h.manuscript.createManuscriptBackup(doc) : await h.structured.createStructuredBackup({ filePath, targetType: 'note', content: '{}' });
    h.hooks.pick = choices => choices.find(x => x.value === 'protect') || choices.find(x => x.entry);
    h.manuscript.registerManuscriptBackupCommands({ subscriptions: [] });
    const lock = h.storage().enqueueBackupOperation(h.indexPath, async () => { entered.resolve(); await release.promise; }); await entered.promise;
    const history = type === 'manuscript' ? h.commands.get('mojigoto.openManuscriptBackupHistory')() : h.structured.openStructuredBackupHistory({ filePath, targetType: 'note', label: 'ノート' });
    const other = type === 'manuscript' ? h.structured.createStructuredBackup({ filePath, targetType: 'note', content: '{}' }) : h.manuscript.createManuscriptBackup(doc);
    release.resolve(); await Promise.all([lock, history, other]);
    const index = await h.readIndex(); assert.equal(index.snapshots.length, 2);
    assert.equal(index.snapshots.find(x => x.id === initial.entry.id).protected, true);
    assert.ok(!h.trace.some(x => x[0] === 'error'));
  }
});

test('manuscript move migration preserves a note history added to the same index', async () => {
  const h = fixture(); const doc = h.document('a.txt'); await h.manuscript.createManuscriptBackup(doc);
  await Promise.all([
    h.manuscript.migrateManuscriptBackupsForMove(doc.uri.fsPath, path.join(h.manuscriptRoot, 'b.txt')),
    h.structured.createStructuredBackup({ filePath: path.join(h.mojigoto, 'plots/a.json'), targetType: 'note', content: '{}' }),
  ]);
  const index = await h.readIndex(); assert.equal(index.snapshots.length, 2);
  assert.equal(index.snapshots.find(x => x.targetType === 'manuscript').relativePath, 'b.txt');
});

test('real shared index retains parallel manuscript and note histories', async t => {
  const temp = path.resolve(os.tmpdir()), root = await fs.mkdtemp(path.join(temp, 'mojigoto-backup-storage-'));
  t.after(async () => { assert.equal(path.dirname(path.resolve(root)), temp); assert.ok(path.basename(root).startsWith('mojigoto-backup-storage-')); await fs.rm(root, { recursive: true, force: true }); });
  const h = fixture({ directory: root, realFiles: true });
  await fs.mkdir(h.manuscriptRoot, { recursive: true }); await fs.mkdir(path.join(h.mojigoto, 'plots'), { recursive: true });
  const note = path.join(h.mojigoto, 'plots/a.json'); await fs.writeFile(note, '{"title":"人物"}');
  const results = await Promise.all([
    h.manuscript.createManuscriptBackup(h.document()), h.structured.createStructuredBackup({ filePath: note, targetType: 'note' }),
  ]);
  assert.equal((await h.readIndex()).snapshots.length, 2);
  for (const result of results) {
    const snapshot = JSON.parse(await fs.readFile(path.join(result.context.snapshotsRoot, result.entry.snapshotFile), 'utf8'));
    assert.ok(snapshot.contentHash); assert.equal(snapshot.id, result.entry.id);
  }
});
