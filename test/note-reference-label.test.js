const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { getReferenceLinksScript } = require('../src/views/note-webview/script-reference-links');
const { createNoteEditorHarness } = require('./fixtures/note-editor-harness.cjs');

function client() {
  const messages = [], listeners = {};
  const source = { id: 'source', relatedReferences: [] };
  const target = { noteType: 'reference', noteId: 'target', groupId: 'tg', itemId: 'td', itemKind: 'divider', itemLabel: '剣士', dividerLabel: 'アリス', dividerValue: '剣士' };
  const context = vm.createContext({ state: { groups: [{ id: 'g', items: [source] }] }, dirtyCount: 0,
    markDirty() { context.dirtyCount++; }, renderGroups() {}, renderPreview() {}, setStatus() {},
    esc: value => String(value).replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
    vscode: { postMessage: message => messages.push(message) },
    document: { getElementById() { return null; }, querySelectorAll() { return []; }, addEventListener(name, fn) { listeners[name] = fn; } },
  });
  vm.runInContext(getReferenceLinksScript(), context);
  vm.runInContext('referenceSearchState.sourceGroupId="g";referenceSearchState.sourceItemId="source";registerReferenceLinkEvents();', context);
  context.handleReferenceSearchMessage({ type: 'referenceSearchResults', requestId: 0, results: [target] });
  return { context, source, target, messages,
    choose(value) { listeners.change({ target: { closest: () => ({ dataset: { referenceLabelIndex: '0' }, value }) } }); },
    requestLabel() { listeners.click({ target: { closest: () => ({ dataset: { referenceAction: 'choose-label', groupId: 'g', itemId: 'source', referenceKey: context.referenceLinkKey(target) } }) } }); return messages.at(-1); },
  };
}

test('関連付け時に区分名・補足を選び、リンク先IDと既存の補足優先を保つ', () => {
  const h = client();
  h.context.addOrRemoveReferenceLink(h.target);
  const link = h.source.relatedReferences[0];
  assert.equal(link.itemLabel, '剣士');
  const identity = h.context.referenceLinkKey(link);
  h.choose('label');
  assert.equal(link.itemLabel, 'アリス');
  assert.equal(h.context.referenceLinkKey(link), identity);
  assert.equal(h.context.dirtyCount, 2);
  h.choose('value');
  assert.equal(link.itemLabel, '剣士');
  h.context.addOrRemoveReferenceLink(h.target);
  h.choose('label');
  h.context.addOrRemoveReferenceLink(h.target);
  assert.equal(h.source.relatedReferences[0].itemLabel, 'アリス');
  assert.match(h.context.renderRelatedReferenceSummary(h.source, 'g'), /リンク名を区分名・補足から選ぶ/);
});

test('既存リンクの選び直しは取消・遅い応答・解除後の応答・別の編集を保持する', () => {
  const h = client(); h.context.addOrRemoveReferenceLink(h.target);
  const link = h.source.relatedReferences[0];
  let request = h.requestLabel();
  h.context.handleReferenceSearchMessage({ type: 'relatedNoteLabelChosen', requestId: request.requestId });
  assert.equal(link.itemLabel, '剣士');
  request = h.requestLabel();
  h.context.handleReferenceSearchMessage({ type: 'relatedNoteLabelChosen', requestId: request.requestId - 1, itemLabel: '古い応答' });
  assert.equal(link.itemLabel, '剣士');
  h.context.handleReferenceSearchMessage({ type: 'relatedNoteLabelChosen', requestId: request.requestId, itemLabel: 'アリス' });
  assert.equal(link.itemLabel, 'アリス');
  request = h.requestLabel(); link.itemLabel = '別の編集';
  h.context.handleReferenceSearchMessage({ type: 'relatedNoteLabelChosen', requestId: request.requestId, itemLabel: '古い応答' });
  assert.equal(link.itemLabel, '別の編集');
  request = h.requestLabel(); h.source.relatedReferences = [];
  h.context.handleReferenceSearchMessage({ type: 'relatedNoteLabelChosen', requestId: request.requestId, itemLabel: '復活させない' });
  assert.equal(h.source.relatedReferences.length, 0);
});

test('既存リンクは現在の参照先から名前候補を読み、選択・取消・参照切れを返す', async () => {
  for (const cancel of [false, true]) {
    const h = createNoteEditorHarness({ relatedTarget: { item: { kind: 'divider', label: '現在の区分名', value: '現在の補足' } },
      pick: (choices, options) => { assert.equal(choices[0].description, '現在の区分名'); assert.equal(choices[1].description, '現在の補足'); assert.match(options.title, /表示する名前/); return cancel ? undefined : choices[0]; } });
    const panel = await h.open();
    await panel.receive({ type: 'chooseRelatedNoteLabel', requestId: 7, target: { itemLabel: '古い名前' } });
    const message = h.events.filter(([name]) => name === 'post').at(-1)[1];
    assert.equal(message.type, 'relatedNoteLabelChosen'); assert.equal(message.requestId, 7);
    assert.equal(message.itemLabel, cancel ? undefined : '現在の区分名');
    assert.ok(!h.events.some(([name]) => name === 'save'));
  }
  const h = createNoteEditorHarness(), panel = await h.open();
  await panel.receive({ type: 'chooseRelatedNoteLabel', requestId: 8, target: {} });
  assert.equal(h.events.filter(([name]) => name === 'post').at(-1)[1].type, 'error');
});
