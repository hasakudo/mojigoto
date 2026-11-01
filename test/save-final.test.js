const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { createBackupStorageHarness: fixture } = require('./fixtures/backup-storage-harness.cjs');
const key = file => process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file);
const raw = (h, file) => h.files.get(key(file));
const temporaryFiles = h => [...h.files.keys()].filter(file => file.includes('.new-'));

test('an existing temporary file is preserved when exclusive creation fails', async () => {
  const h = fixture(), file = path.resolve('data.json'), temporary = file + '.new-collision';
  h.seed(file, 'original'); h.seed(temporary, 'other operation'); h.hooks.uuid = () => 'collision';
  await assert.rejects(h.writer().writeRawFile(file, 'new', h.writer().storageRevision('original')), { code: 'EEXIST' });
  assert.equal(raw(h, file), 'original'); assert.equal(raw(h, temporary), 'other operation');
  assert.equal(h.trace.filter(x => x[0] === 'close').length, 0);
});

test('a partial temporary write is closed and removed without changing the original', async () => {
  const h = fixture(), file = path.resolve('data.json'); h.seed(file, 'original');
  h.hooks.write = target => { if (target.includes('.new-')) { h.seed(target, 'partial'); throw Object.assign(Error('write failed'), { code: 'EIO' }); } };
  await assert.rejects(h.writer().writeRawFile(file, 'new', h.writer().storageRevision('original')), { code: 'EIO' });
  assert.equal(raw(h, file), 'original'); assert.deepEqual(temporaryFiles(h), []);
  assert.equal(h.trace.filter(x => x[0] === 'close').length, 1);
});

test('rename failure preserves the original, cleans its temporary and permits retry', async () => {
  const h = fixture(), file = path.resolve('data.json'); h.seed(file, 'original');
  h.hooks.rename = () => { throw Object.assign(Error('rename failed'), { code: 'EACCES' }); };
  await assert.rejects(h.writer().writeRawFile(file, 'new', h.writer().storageRevision('original')), { code: 'EACCES' });
  assert.equal(raw(h, file), 'original'); assert.deepEqual(temporaryFiles(h), []);
  delete h.hooks.rename; await h.writer().writeRawFile(file, 'retry', h.writer().storageRevision('original'));
  assert.equal(raw(h, file), 'retry'); assert.deepEqual(temporaryFiles(h), []);
});

test('an external change during temporary writing is retained', async () => {
  const h = fixture(), file = path.resolve('data.json'); h.seed(file, 'original');
  h.hooks.write = target => { if (target.includes('.new-')) h.seed(file, 'external'); };
  await assert.rejects(h.writer().writeRawFile(file, 'new', h.writer().storageRevision('original')), { code: 'conflict' });
  assert.equal(raw(h, file), 'external'); assert.deepEqual(temporaryFiles(h), []);
});

test('protection changes do not overwrite an externally updated snapshot for either backup type', async () => {
  for (const type of ['manuscript', 'note']) {
    const h = fixture(), doc = h.document(), filePath = path.join(h.mojigoto, 'plots/a.json');
    const result = type === 'manuscript' ? await h.manuscript.createManuscriptBackup(doc) : await h.structured.createStructuredBackup({ filePath, targetType: 'note', content: '{}' });
    const snapshotPath = path.join(result.context.snapshotsRoot, result.entry.snapshotFile);
    const external = JSON.stringify({ ...JSON.parse(raw(h, snapshotPath)), external: '保持' }); let changed = false;
    h.hooks.read = file => { if (file === snapshotPath && !changed) { changed = true; h.seed(file, external); } };
    h.hooks.pick = choices => choices.find(x => x.value === 'protect') || choices.find(x => x.entry);
    if (type === 'manuscript') {
      h.manuscript.registerManuscriptBackupCommands({ subscriptions: [] }); await h.commands.get('mojigoto.openManuscriptBackupHistory')();
      assert.equal(h.trace.filter(x => x[0] === 'error').length, 1);
    } else {
      await assert.rejects(h.structured.openStructuredBackupHistory({ filePath, targetType: 'note', label: 'ノート' }), { code: 'conflict' });
    }
    assert.equal(raw(h, snapshotPath), external);
    assert.equal((await h.readIndex()).snapshots[0].protected, false);
  }
});

test('manuscript path migration checks the original snapshot revision', async () => {
  const h = fixture(), doc = h.document('a.txt'); const result = await h.manuscript.createManuscriptBackup(doc);
  const snapshotPath = path.join(result.context.snapshotsRoot, result.entry.snapshotFile);
  const external = JSON.stringify({ ...JSON.parse(raw(h, snapshotPath)), external: true }); let changed = false;
  h.hooks.read = file => { if (file === snapshotPath && !changed) { changed = true; h.seed(file, external); } };
  await assert.rejects(h.manuscript.migrateManuscriptBackupsForMove(doc.uri.fsPath, path.join(h.manuscriptRoot, 'b.txt')), { code: 'conflict' });
  assert.equal(raw(h, snapshotPath), external); assert.equal((await h.readIndex()).snapshots[0].relativePath, 'a.txt');
});

test('manuscript path migration retains an external index update during snapshot rewriting', async () => {
  const h = fixture(), doc = h.document('a.txt'); const result = await h.manuscript.createManuscriptBackup(doc);
  const snapshotPath = path.join(result.context.snapshotsRoot, result.entry.snapshotFile);
  const external = JSON.stringify({ ...await h.readIndex(), external: 'index update' }); let changed = false;
  h.hooks.read = file => { if (file === snapshotPath && !changed) { changed = true; h.seed(h.indexPath, external); } };
  await assert.rejects(h.manuscript.migrateManuscriptBackupsForMove(doc.uri.fsPath, path.join(h.manuscriptRoot, 'b.txt')), { code: 'conflict' });
  assert.equal(raw(h, h.indexPath), external);
});

async function legacyFixture() {
  const h = fixture(), doc = h.document('a.txt'); const result = await h.manuscript.createManuscriptBackup(doc);
  const oldRoot = path.resolve('legacy-view'), legacyRoot = path.join(oldRoot, '.mojigoto/backups');
  const legacySnapshot = { ...JSON.parse(raw(h, path.join(result.context.snapshotsRoot, result.entry.snapshotFile))), id: 'legacy' };
  const legacyEntry = { ...result.entry, id: 'legacy', snapshotFile: 'legacy.json' };
  h.seed(path.join(legacyRoot, 'index.json'), JSON.stringify({ schemaVersion: 1, snapshots: [legacyEntry] }));
  h.seed(path.join(legacyRoot, 'snapshots/legacy.json'), JSON.stringify(legacySnapshot));
  h.addDirectory(path.join(oldRoot, '.mojigoto'));
  const physical = doc.uri.fsPath; doc.uri.fsPath = path.join(oldRoot, 'manuscript/a.txt'); h.model.realPaths.set(doc.uri.fsPath, physical);
  return { h, doc, legacyRoot };
}

test('legacy import retains an index changed externally while snapshots are copied', async () => {
  const { h, doc } = await legacyFixture();
  const external = JSON.stringify({ ...await h.readIndex(), external: '保持' });
  h.hooks.copy = () => h.seed(h.indexPath, external);
  await assert.rejects(h.manuscript.listManuscriptBackups(doc), { code: 'conflict' });
  assert.equal(raw(h, h.indexPath), external);
});

test('legacy index IO errors are reported without treating the history as empty', async () => {
  const { h, doc, legacyRoot } = await legacyFixture(); const before = raw(h, h.indexPath);
  h.hooks.read = file => { if (file === path.join(legacyRoot, 'index.json')) throw Object.assign(Error('read failed'), { code: 'EIO' }); };
  await assert.rejects(h.manuscript.listManuscriptBackups(doc), { code: 'EIO' });
  assert.equal(raw(h, h.indexPath), before);
});

test('real structured saving removes temporary files after success and stale-revision rejection', async t => {
  const temp = path.resolve(os.tmpdir()), root = await fs.mkdtemp(path.join(temp, 'mojigoto-save-final-'));
  t.after(async () => { assert.equal(path.dirname(path.resolve(root)), temp); assert.ok(path.basename(root).startsWith('mojigoto-save-final-')); await fs.rm(root, { recursive: true, force: true }); });
  const h = fixture({ directory: root, realFiles: true }), file = path.join(root, 'data.json');
  const first = await h.writer().writeStructuredFile(file, { title: '初版' });
  await h.writer().writeStructuredFile(file, { ...first, title: '次版' }, first.storageRevision);
  await assert.rejects(h.writer().writeStructuredFile(file, { ...first, title: '古い版' }, first.storageRevision), { code: 'conflict' });
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).title, '次版');
  assert.deepEqual((await fs.readdir(root)).filter(name => name.includes('.new-')), []);
});
