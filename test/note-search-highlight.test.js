const test = require('node:test');
const assert = require('node:assert/strict');
const { createNoteDisplayRenderer } = require('../src/views/note-webview/display-renderer');
const { createPreviewClientHarness } = require('./fixtures/note-preview-harness.cjs');
const { getGroupsScript } = require('../src/views/note-webview/script-groups');
const { getBoardRendererScript } = require('../src/views/note-webview/script-board-renderer');
const r = createNoteDisplayRenderer();
const mark = value => `<mark class="noteSearchMatch">${value}</mark>`;
const note = () => ({ title: '検索', groups: [{ id: 'g', title: '海辺', items: [
  { id: 'a', kind: 'entry', heading: '海辺', headingRuby: 'うみべ', body: '朝\n海辺を歩く', memo: { body: '夜\n海辺に戻る', tags: ['海辺'] } },
  { id: 'd', kind: 'divider', label: '海辺', value: '海辺の補足' },
] }] });

test('search text treats HTML and regex characters literally, with repeated case-insensitive matches', () => {
  assert.equal(r.text('Ab aB', 'ab'), `${mark('Ab')} ${mark('aB')}`);
  assert.equal(r.text('<img> & .*', '<img>'), `${mark('&lt;img&gt;')} &amp; .*`);
  assert.equal(r.text('a.*b', '.*'), `a${mark('.*')}b`);
  assert.equal(r.text('abc', ''), 'abc');
  assert.equal(r.text('İX', 'x'), `İ${mark('X')}`);
});

test('ruby, emphasis and escaped text keep their structure and attributes', () => {
  assert.equal(r.body('|海辺《うみべ》\n《《海辺》》 & <海辺>', '海辺'),
    `<ruby>${mark('海辺')}<rt>うみべ</rt></ruby><br><span class="previewSideDots">${mark('海辺')}</span> &amp; &lt;${mark('海辺')}&gt;`);
  assert.equal(r.body('|海辺《うみべ》', 'うみべ'), `<ruby>海辺<rt>${mark('うみべ')}</rt></ruby>`);
  assert.equal(r.body('&lt;', 'lt'), `&amp;${mark('lt')};`);
  assert.equal(r.body('', '詳細'), '<span class="muted">詳細未入力</span>');
  assert.equal(r.heading({ heading: '<名>', headingRuby: 'な' }, 'な'), `<ruby>&lt;名&gt;<rt>${mark('な')}</rt></ruby>`);
});

test('list and board highlight group, divider, entry, memo and tag without modifying data', () => {
  const data = note(), before = JSON.stringify(data);
  const h = createPreviewClientHarness(data), c = h.context;
  c.searchQuery = '海辺'; c.renderPreview();
  const list = h.nodes.previewRoot.innerHTML;
  assert.ok((list.match(/class="noteSearchMatch"/g) || []).length >= 7);
  assert.match(list, /data-nav-id="item:a"/);
  assert.match(list, /data-action="openPreviewItemMemo"/);
  c.previewMode = 'board'; c.renderPreview();
  assert.ok((h.nodes.previewBoardRoot.innerHTML.match(/class="noteSearchMatch"/g) || []).length >= 7);
  assert.equal(JSON.stringify(data), before);
  c.searchQuery = ''; c.previewMode = 'list'; c.renderPreview();
  assert.doesNotMatch(h.nodes.previewRoot.innerHTML, /noteSearchMatch/);
});

test('editor excerpts show field and line for closed memos, with bounded output and escaped markup', () => {
  const h = createPreviewClientHarness(note()), c = h.context;
  c.searchQuery = '海辺';
  const html = c.renderNoteSearchMatches(c.state.groups[0].items[0]);
  assert.match(html, /詳細・2行目/); assert.match(html, /項目メモ・2行目/); assert.match(html, /タグ・1行目/);
  assert.ok(html.includes(mark('海辺')));
  assert.equal(c.isNoteItemMemoOpen('a'), false);
  c.searchQuery = '<x>';
  const long = Array(8).fill('a'.repeat(200) + '<x>').join('\n');
  const result = c.renderNoteSearchMatches({ body: long });
  assert.ok(result.includes(mark('&lt;x&gt;'))); assert.doesNotMatch(result, /<x>/);
  assert.match(result, /ほか 3 行に一致/); assert.ok(result.length < 1500);
  c.searchQuery = ''; assert.equal(c.renderNoteSearchMatches({ body: long }), '');
});

test('editing refreshes only search annotations and generated templates leave input values intact', () => {
  const h = createPreviewClientHarness(note()), c = h.context;
  const root = { dataset: { searchGroup: 'g', searchItem: 'a' }, innerHTML: '' };
  h.nodes.groupsRoot.querySelectorAll = () => [root];
  c.searchQuery = '海辺'; c.refreshNoteSearchMatches(); assert.match(root.innerHTML, /項目メモ・2行目/);
  c.state.groups[0].items[0].memo.body = '変更'; c.refreshNoteSearchMatches(); assert.doesNotMatch(root.innerHTML, /項目メモ/);
  c.searchQuery = ''; c.refreshNoteSearchMatches(); assert.equal(root.innerHTML, '');
  const source = getGroupsScript();
  assert.match(source, /data-search-item/);
  assert.match(source, /value="\$\{esc\(item.heading \|\| ""\)\}"/);
  assert.match(source, />\$\{esc\(item.body \|\| ""\)\}<\/textarea>/);
  assert.doesNotMatch(getBoardRendererScript(), /(?:value|data-[\w-]+)="\$\{noteDisplayRenderer\.text/);
});
