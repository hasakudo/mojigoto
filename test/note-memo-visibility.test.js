const test = require("node:test");
const assert = require("node:assert/strict");
const { createPreviewClientHarness } = require("./fixtures/note-preview-harness.cjs");
const { createNoteEditorHarness } = require("./fixtures/note-editor-harness.cjs");
const note = () => ({ title: "ノート", groups: [{ id: "g", title: "分類", items: [
  { id: "a", kind: "entry", heading: "項目A", memo: { body: "海辺での思いつき" } },
  { id: "b", kind: "entry", heading: "項目B", memo: { tags: ["重要資料"] } },
  { id: "empty", kind: "entry", heading: "空メモ" }, { id: "d", kind: "divider", label: "区分" },
] }] });

test("編集・リストの一括開閉は本文／タグのあるメモを連動させ、保存や大分類開閉を変更しない", () => {
  const h = createPreviewClientHarness(note()), c = h.context;
  c.renderPreview();
  assert.ok(h.nodes.previewRoot.details.every(detail => !detail.open));
  const before = JSON.stringify(c.state);
  c.collapsedGroupIds.add("g");
  h.element("openEditorMemos").handlers.click();
  assert.equal(c.isNoteItemMemoOpen("a"), true); assert.equal(c.isNoteItemMemoOpen("b"), true);
  assert.equal(c.isNoteItemMemoOpen("empty"), false); assert.equal(c.isNoteItemMemoOpen("d"), false);
  assert.equal(c.collapsedGroupIds.has("g"), true);
  c.collapsedGroupIds.clear(); c.renderPreview();
  assert.ok(h.nodes.previewRoot.details.every(detail => detail.open));
  assert.equal(h.element("openPreviewMemos").disabled, true);
  h.element("closePreviewMemos").handlers.click();
  assert.ok(h.nodes.previewRoot.details.every(detail => !detail.open));
  assert.equal(c.isNoteItemMemoOpen("a"), false); assert.equal(c.isNoteItemMemoOpen("b"), false);
  assert.equal(h.element("closeEditorMemos").disabled, true);
  assert.equal(JSON.stringify(c.state), before);
  assert.equal(h.calls.some(([type]) => type === "dirty" || type === "save"), false);
});

test("リストの個別開閉と編集側の開閉は連動し、他のメモを勝手に畳まない", () => {
  const h = createPreviewClientHarness(note()), c = h.context; c.renderPreview();
  const root = h.nodes.previewRoot, first = root.details[0]; first.open = true;
  root.handlers.toggle({ target: first });
  assert.equal(c.isNoteItemMemoOpen("a"), true);
  c.toggleItemMemo("g", "b");
  assert.equal(c.isNoteItemMemoOpen("a"), true); assert.equal(c.isNoteItemMemoOpen("b"), true);
  assert.ok(root.details.every(detail => detail.open));
  const a = root.details[0]; a.open = false; root.handlers.toggle({ target: a });
  assert.equal(c.isNoteItemMemoOpen("a"), false); assert.equal(c.isNoteItemMemoOpen("b"), true);
  c.renderPreview();
  assert.deepEqual(root.details.map(detail => detail.open), [false, true]);
  const renders = h.calls.filter(([type]) => type === "renderEditor").length;
  root.handlers.toggle({ target: root.details[1] });
  first.open = false; root.handlers.toggle({ target: first });
  assert.equal(h.calls.filter(([type]) => type === "renderEditor").length, renders);
  assert.equal(h.calls.some(([type]) => type === "dirty"), false);
});

test("項目メモの本文・タグだけに一致する検索でも対象が残り、一括操作後に内容を読める", () => {
  for (const [query, id] of [["海辺", "a"], ["重要資料", "b"]]) {
    const h = createPreviewClientHarness(note()), c = h.context; c.searchQuery = query; c.renderPreview();
    assert.match(h.nodes.previewRoot.innerHTML, new RegExp(query));
    assert.equal(h.nodes.previewRoot.details.length, 1);
    h.element("openPreviewMemos").handlers.click();
    assert.equal(h.nodes.previewRoot.details[0].open, true);
    assert.equal(c.isNoteItemMemoOpen(id), true);
    c.searchQuery = ""; c.renderPreview();
    assert.ok(h.nodes.previewRoot.details.every(detail => detail.open));
  }
});

test("ボードの個別開閉は維持し、リストに戻っても連動状態を失わない", () => {
  const h = createPreviewClientHarness(note()), c = h.context;
  h.element("openEditorMemos").handlers.click();
  c.previewMode = "board"; c.renderPreview();
  assert.equal(h.element("previewMemoTools").hidden, true);
  h.nodes.previewBoardRoot.details[0].open = true; c.renderPreview();
  assert.equal(h.nodes.previewBoardRoot.details[0].open, true);
  c.previewMode = "list"; c.renderPreview();
  assert.equal(h.element("previewMemoTools").hidden, false);
  assert.ok(h.nodes.previewRoot.details.every(detail => detail.open));
});

test("空メモの個別表示も一括で畳め、削除された項目の開閉状態を残さない", () => {
  const h = createPreviewClientHarness(note()), c = h.context;
  c.toggleItemMemo("g", "empty"); assert.equal(c.isNoteItemMemoOpen("empty"), true);
  h.element("closeEditorMemos").handlers.click(); assert.equal(c.isNoteItemMemoOpen("empty"), false);
  h.element("openEditorMemos").handlers.click(); c.state.groups[0].items = [];
  c.renderPreview();
  assert.equal(c.isNoteItemMemoOpen("a"), false); assert.equal(c.isNoteItemMemoOpen("b"), false);
  assert.equal(h.element("openPreviewMemos").disabled, true); assert.equal(h.element("closePreviewMemos").disabled, true);
});

test("目次は右上のアイコンボタン1個になり、編集とリストに一括操作を配置する", async () => {
  const h = createNoteEditorHarness(), p = await h.open(); const html = p.webview.html;
  assert.equal((html.match(/id="toggleNoteTocBtn"/g) || []).length, 1);
  const right = html.slice(html.indexOf('<div class="paneHeaderRight">'), html.indexOf('id="toastStatus"'));
  assert.match(right, /id="toggleNoteTocBtn"[^>]*aria-controls="noteTocPanel"/);
  assert.match(right, /title="ノートの目次を開閉"/); assert.match(right, /<svg/);
  const previewHeader = html.slice(html.indexOf('<div class="previewHead">'), html.indexOf('id="previewMemoTools"'));
  assert.doesNotMatch(previewHeader, /id="toggleNoteTocBtn"/);
  const markup = html.slice(0, html.indexOf('<script nonce='));
  assert.equal((markup.match(/data-note-memo-action="open"/g) || []).length, 2);
  assert.equal((markup.match(/data-note-memo-action="close"/g) || []).length, 2);
});
