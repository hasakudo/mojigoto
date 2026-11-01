const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const { createNoteEditorHarness } = require('./fixtures/note-editor-harness.cjs');
const { createNoteNamesClientHarness } = require('./fixtures/note-names-client-harness.cjs');
const { createConceptHostHarness } = require('./fixtures/concept-host-harness.cjs');
const { refreshConceptSourceStatuses } = require('../src/data/concept-source-status');
const { getConceptMemoEventsScript } = require('../src/views/concept-memo/script-events');
const { noteMemoPayload, syncFingerprint } = require('../src/data/concept-sync');

function note(withMemo = false) {
  return { id: 'note', title: 'ノート', storageRevision: 'initial', groups: [{ id: 'g', title: '大分類', images: [], items: [
    { id: 'd', kind: 'divider', label: '区分', value: '補足' },
    { id: 'i', kind: 'entry', heading: '項目', body: '詳細', ...(withMemo ? { memo: { body: 'メモ', type: 'text', updatedAt: 'before', linkedConceptMemoIds: ['linked'], conceptMemoSyncFingerprint: syncFingerprint(noteMemoPayload({ body: 'メモ' })) } } : {}) },
  ] }] };
}

test('renaming existing note/group/item/divider fields marks dirty and reaches the real autosave host', async () => {
  for (const withMemo of [false, true]) for (const field of ['noteTitle', 'groupTitle', 'itemHeading', 'dividerLabel', 'dividerValue']) {
    let client;
    const h = createNoteEditorHarness({ note: note(withMemo), settings: { webviewAutoSaveEnabled: true, noteMemoAutoSyncEnabled: true },
      onPost: message => { if (client && message.type === 'noteSaved') client.receive(message); } });
    const panel = await h.open(); client = createNoteNamesClientHarness(panel.webview.html, h.data);
    client.edit(field, '変更後');
    assert.equal(client.context.dirty, true, field); assert.equal(client.dirtyBadgeEl.hidden, false);
    assert.equal(client.dirtyMarkEl.hidden, false); assert.equal(client.boardDirtyBadgeEl.hidden, false);
    for (const message of client.messages.splice(0)) await panel.receive(message);
    await h.tick();
    const saved = h.data, group = saved.groups[0];
    const value = { noteTitle: saved.title, groupTitle: group.title, itemHeading: group.items[1].heading, dividerLabel: group.items[0].label, dividerValue: group.items[0].value }[field];
    assert.equal(value, '変更後'); assert.equal(client.context.dirty, false); assert.equal(client.dirtyBadgeEl.hidden, true);
    assert.equal(group.items[1].memo?.updatedAt, withMemo ? 'before' : undefined);
    assert.ok(!h.events.some(x => x[0] === 'createConcept'));
  }
});

test('autosave OFF retains unsaved names until an explicit save and metadata notification does not enable body sync', async () => {
  const h = createNoteEditorHarness({ note: note(), settings: { webviewAutoSaveEnabled: false, noteMemoAutoSyncEnabled: false } });
  const panel = await h.open(), client = createNoteNamesClientHarness(panel.webview.html, h.data, { defaultSync: false });
  client.edit('itemHeading', '手動保存する項目');
  for (const message of client.messages.splice(0)) await panel.receive(message);
  await h.tick(); assert.equal(h.data.groups[0].items[1].heading, '項目'); assert.equal(client.context.dirty, true);
  await panel.receive({ type: 'save', payload: client.context.collectPayload(), revision: client.context.changeRevision });
  assert.equal(h.data.groups[0].items[1].heading, '手動保存する項目');
  assert.ok(h.events.some(x => x[0] === 'notifyConcept' && x[2]?.sourceNamesOnly === true));
});

test('detail and reading edits still reach autosave without being treated as name changes', async () => {
  for (const field of ['itemBody', 'itemHeadingRuby']) {
    const h = createNoteEditorHarness({ note: note(), settings: { webviewAutoSaveEnabled: true } });
    const panel = await h.open(), client = createNoteNamesClientHarness(panel.webview.html, h.data);
    client.edit(field, '変更'); for (const message of client.messages.splice(0)) await panel.receive(message); await h.tick();
    assert.equal(h.data.groups[0].items[1][field === 'itemBody' ? 'body' : 'headingRuby'], '変更');
    assert.ok(!h.events.some(x => x[0] === 'notifyConcept' && x[2]?.sourceNamesOnly));
  }
});

test('source labels derive from the saved note without rewriting memo contents or restoring detached links', async () => {
  const saved = note(true); saved.title = '新ノート'; saved.groups[0].title = '新大分類'; saved.groups[0].items[1].heading = '新項目';
  const source = { kind: 'noteItem', notePath: '/note.json', groupId: 'g', itemId: 'i', noteTitle: '旧ノート', groupTitle: '旧大分類', itemHeading: '旧項目', status: 'active' };
  const data = { memos: [{ id: 'linked', title: '独自タイトル', body: '構想の独自本文', source }, { id: 'old', body: '旧本文', source: { ...source, status: 'cleared' } }] };
  const before = JSON.stringify(data); const result = await refreshConceptSourceStatuses(data, { resolveNotePath: x => x, readNoteFile: async () => saved });
  assert.equal(JSON.stringify(data), before); assert.equal(result.memos[0].source.noteTitle, '新ノート');
  assert.equal(result.memos[0].source.groupTitle, '新大分類'); assert.equal(result.memos[0].source.itemHeading, '新項目');
  assert.equal(result.memos[0].title, '独自タイトル'); assert.equal(result.memos[0].body, '構想の独自本文');
  assert.equal(result.memos[1].source.noteTitle, '旧ノート'); assert.equal(result.memos[1].source.status, 'cleared');
});

test('metadata messages update source text while retaining an unsaved concept editor, focus and revision', () => {
  let receive, renders = 0; const summary = { textContent: '' };
  const source = { kind: 'noteItem', notePath: '/note.json', noteType: 'plot', groupId: 'g', itemId: 'i', noteTitle: '旧名', groupTitle: '旧分類', itemHeading: '旧項目', syncFingerprint: 'keep', status: 'active' };
  const memo = { id: 'linked', title: '編集中', body: '未保存の本文', source: { ...source } };
  const context = vm.createContext({ isDirty: true, changeRevision: 8, currentState: { data: { storageRevision: 'keep-revision', memos: [memo] } },
    window: { addEventListener: (_name, fn) => { receive = fn; } }, document: { getElementById: id => id === 'conceptMemoSourceSummary' ? summary : null },
    renderMemoList() { renders++; }, getSelectedMemo: () => memo, getSourceSummaryFull: value => value.source.noteTitle + '/' + value.source.groupTitle + '/' + value.source.itemHeading,
  });
  vm.runInContext(getConceptMemoEventsScript(), context);
  receive({ data: { type: 'conceptMemoSourceNamesUpdated', payload: { memos: [{ id: 'linked', source: { ...source, noteTitle: '新名', groupTitle: '新分類', itemHeading: '新項目', syncFingerprint: 'must-not-merge' } }] } } });
  assert.equal(summary.textContent, '新名/新分類/新項目'); assert.equal(renders, 1);
  assert.equal(memo.body, '未保存の本文'); assert.equal(memo.title, '編集中'); assert.equal(memo.source.syncFingerprint, 'keep');
  assert.equal(context.isDirty, true); assert.equal(context.changeRevision, 8); assert.equal(context.currentState.data.storageRevision, 'keep-revision');
  receive({ data: { type: 'conceptMemoSourceNamesUpdated', payload: { memos: [{ id: 'linked', source: { ...source, itemId: 'another', noteTitle: '無関係' } }] } } });
  assert.equal(summary.textContent, '新名/新分類/新項目'); assert.equal(renders, 1);
});

test('the real concept host publishes source-only updates without saving or full reloading', async () => {
  const saved = note(true);
  const source = { kind: 'noteItem', notePath: '/note.json', noteType: 'plot', groupId: 'g', itemId: 'i', noteTitle: '古い出典', status: 'active' };
  const h = createConceptHostHarness({ data: { memos: [{ id: 'linked', body: '構想の本文', source }], folders: [] }, noteStore: { readNoteFile: async () => saved } });
  await h.open(); const before = h.events.length;
  saved.title = '保存後のノート'; saved.groups[0].title = '保存後の大分類';
  await h.host.notifyConceptMemoUpdated('/work/.mojigoto/concept-memos.json', { sourceNamesOnly: true });
  const events = h.events.slice(before), message = events.find(x => x[0] === 'post')[1];
  assert.equal(message.type, 'conceptMemoSourceNamesUpdated'); assert.equal(message.payload.memos[0].source.noteTitle, '保存後のノート');
  assert.equal(message.payload.memos[0].source.groupTitle, '保存後の大分類');
  assert.ok(!events.some(x => x[0] === 'write' || x[1]?.type === 'conceptMemosReloaded'));
  assert.equal(h.data.memos[0].body, '構想の本文');
});

test('generated name inputs autosave through the real note store and can be read back from disk', { timeout: 5000 }, async t => {
  const temp = path.resolve(os.tmpdir()), root = await fs.mkdtemp(path.join(temp, 'mojigoto-note-names-'));
  t.after(async () => { assert.equal(path.dirname(path.resolve(root)), temp); assert.ok(path.basename(root).startsWith('mojigoto-note-names-')); await fs.rm(root, { recursive: true, force: true }); });
  const originalLoad = Module._load; let store;
  try {
    Module._load = function(request, ...args) {
      if (request === 'vscode') return { workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }), workspaceFolders: [] } };
      return originalLoad.call(this, request, ...args);
    };
    store = require('../src/data/note-store');
  } finally { Module._load = originalLoad; }
  const file = path.join(root, '.mojigoto/plots/note.json');
  const fresh = note(); delete fresh.storageRevision;
  await store.saveNoteFile(file, fresh); const initial = await store.readNoteFile(file);
  let resolveSaved, client; const saved = new Promise(resolve => { resolveSaved = resolve; });
  const h = createNoteEditorHarness({ note: initial, noteStore: store, settings: { webviewAutoSaveEnabled: true, noteMemoAutoSyncEnabled: true },
    onPost: message => { if (message.type === 'noteSaved' || message.type === 'error') { if (client && message.type === 'noteSaved') client.receive(message); resolveSaved(message); } } });
  const panel = await h.open({ filePath: file, workDir: root }); client = createNoteNamesClientHarness(panel.webview.html, initial);
  client.edit('noteTitle', '保存するノート名'); client.edit('groupTitle', '保存する大分類'); client.edit('itemHeading', '保存する項目名');
  for (const message of client.messages.splice(0)) await panel.receive(message);
  await h.tick(); assert.equal((await saved).type, 'noteSaved');
  const disk = await store.readNoteFile(file);
  assert.equal(disk.title, '保存するノート名'); assert.equal(disk.groups[0].title, '保存する大分類');
  assert.equal(disk.groups[0].items.find(x => x.id === 'i').heading, '保存する項目名');
  assert.equal(client.context.dirty, false); assert.equal(client.dirtyBadgeEl.hidden, true);
});
