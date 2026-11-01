const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { createNoteEditorHarness } = require("./fixtures/note-editor-harness.cjs");
const operations = require("../src/views/note-webview/item-operations");
const posts = (h) => h.events.filter(([name]) => name === "post").map(([, message]) => message);
const count = (h, name) => h.events.filter(([event]) => event === name).length;

test("ノートHTMLは設定・特殊文字・初期位置を保ち、生成スクリプトが構文解析できる", async () => {
  for (const type of ["plot", "reference"]) {
    const h = createNoteEditorHarness({ settings: { webviewFontScalePercent: 999, webviewAutoSaveEnabled: false },
      note: { title: '<テスト> & "引用" </script>\u2028', groups: [] } });
    const panel = await h.open({ type, skipEditorScrollRestore: true });
    const html = panel.webview.html;
    assert.match(html, /--mojigoto-content-font-scale: 1.6/);
    assert.ok(!html.includes('</script>\u2028'));
    assert.match(html, /&lt;テスト&gt;/);
    const script = html.match(/<script nonce="fixed-nonce">([\s\S]*?)<\/script>/)[1];
    assert.doesNotThrow(() => new vm.Script(script));
    assert.ok(html.includes('id="autoSaveBadge" class="autoSaveBadge" hidden'));
  }
});

test("操作受付は表示タブ連携と呼び名一覧の既存受付順を保つ", async () => {
  const h = createNoteEditorHarness(), p = await h.open();
  for (const message of [
    { type: "noteDisplay.editorReady" }, { type: "noteDisplay.open", mode: "board", returnToEditor: true },
    { type: "noteDisplay.snapshot", note: {} }, { type: "dirtyStateChanged", dirty: true },
    { type: "addressBook.load" }, { type: "openAddressBookTab" },
  ]) await p.receive(message);
  assert.equal(count(h, "editorReady"), 1);
  assert.equal(count(h, "accept"), 1);
  assert.equal(count(h, "openDisplay"), 1);
  assert.match(p.title, /^● /);
  assert.equal(posts(h).find((m) => m.type === "noteDisplay.opened").returnToEditor, true);
  assert.equal(count(h, "addressHandle"), 1);
  assert.equal(count(h, "openAddress"), 1);
});

test("更新とバックアップは未保存確認・保存・読込の順を保ち、取消では保存しない", async () => {
  for (const type of ["requestRefreshNote", "openNoteBackupHistory"]) {
    const h = createNoteEditorHarness({ restore: true }), p = await h.open();
    await p.receive({ type, dirty: true, payload: { title: "更新前", groups: [] }, revision: 1 });
    assert.equal(count(h, "write"), 1);
    assert.equal(posts(h).at(-1).type, "noteReloaded");
    assert.equal(posts(h).at(-1).payload.title, "更新前");
    assert.ok(h.events.findIndex(([name]) => name === "confirm") < h.events.findIndex(([name]) => name === "write"));
    const cancelled = createNoteEditorHarness({ confirm: () => undefined }), q = await cancelled.open();
    await q.receive({ type, dirty: true });
    assert.equal(count(cancelled, "write"), 0);
    assert.equal(count(cancelled, "history"), 0);
  }
});

test("自動保存は最新入力を使い、手動保存と設定OFFで同じ待機タイマーを解除する", async () => {
  const h = createNoteEditorHarness(), p = await h.open();
  for (const title of ["先の入力", "次の入力"]) await p.receive({ type: "scheduleAutoSave", payload: { title }, revision: 1 });
  assert.equal(h.jobs.size, 1);
  await h.tick();
  assert.equal(h.data.title, "次の入力");
  await p.receive({ type: "scheduleAutoSave", payload: { title: "待機" } });
  await p.receive({ type: "save", payload: { title: "手動保存" }, revision: 2 });
  assert.equal(h.jobs.size, 0);
  assert.equal(h.data.title, "手動保存");
  await p.receive({ type: "scheduleAutoSave", payload: { title: "破棄する待機" } });
  h.changeSetting("webviewAutoSaveEnabled", false);
  assert.equal(h.jobs.size, 0);
  await p.receive({ type: "scheduleAutoSave", payload: { title: "OFF中" } });
  assert.equal(h.jobs.size, 0);
  assert.equal(h.data.title, "手動保存");
});

test("保存後の操作受付は更新されたノートを参照し、関連ノートの種別と移動先を渡す", async () => {
  const h = createNoteEditorHarness({ relatedTarget: { filePath: "/other.json", note: { type: "reference" }, group: { id: "rg" }, item: { id: "ri" } } });
  const p = await h.open();
  await p.receive({ type: "save", payload: { title: "保存後の名前", id: "saved-note" } });
  await p.receive({ type: "dirtyStateChanged", dirty: true });
  assert.match(p.title, /保存後の名前/);
  await p.receive({ type: "searchReferences", requestId: 7 });
  assert.equal(h.events.find(([name]) => name === "search")[4].excludeNoteId, "saved-note");
  await p.receive({ type: "openRelatedNoteTarget" });
  assert.equal(h.panels.length, 2);
  assert.match(h.panels[1].title, /^資料/);
  await h.tick();
  assert.deepEqual(JSON.parse(JSON.stringify(posts(h).find((m) => m.type === "focusNoteItem").payload)), { groupId: "rg", itemId: "ri" });
});

test("テンプレートの保存・一覧・削除はキャンセルと選択内容を維持する", async () => {
  const h = createNoteEditorHarness(), p = await h.open();
  await p.receive({ type: "requestTemplateList" });
  await p.receive({ type: "saveTemplate", payload: { title: "変更中" } });
  await p.receive({ type: "saveGroupTemplate", payload: { groupId: "g" } });
  await p.receive({ type: "deleteTemplate", templateId: "tpl" });
  assert.equal(count(h, "saveUserTemplate"), 1);
  assert.equal(count(h, "saveUserGroupTemplate"), 1);
  assert.equal(count(h, "deleteUserTemplateById"), 1);
  assert.equal(posts(h).at(-1).type, "templateDeleted");
  const cancelled = createNoteEditorHarness({ input: () => undefined }), q = await cancelled.open();
  await q.receive({ type: "saveTemplate" });
  assert.equal(count(cancelled, "saveUserTemplate"), 0);
  assert.equal(posts(cancelled).at(-1).type, "info");
});

test("新規／置換と選択インポートの分岐・画面内モード切替・メモの挿入を維持する", async () => {
  const h = createNoteEditorHarness({ importResult: { ok: true, parsedNote: { groups: [] } } }), p = await h.open();
  await p.receive({ type: "importNote" });
  assert.ok(h.partial, JSON.stringify(posts(h)));
  const result = await h.partial.onApply({ operation: "insert_entry", source: { heading: "追加", memo: { body: "メモ" } }, target: { groupId: "g", insertIndex: 1 } });
  assert.equal(result.noteData.groups[0].items[1].memo.body, "メモ");
  assert.equal(h.data.groups[0].items[1].memo.autoSyncToConceptMemoOverride, false);
  const replace = createNoteEditorHarness({ pick: () => ({ action: "replace_note" }) }), q = await replace.open();
  await q.receive({ type: "importNote" });
  assert.equal(count(replace, "runNoteImportFlow"), 1);
});

test("画像の追加・名前変更・削除は下書きと参照確認を保持する", async () => {
  const h = createNoteEditorHarness({ imageUris: [{ fsPath: "/images/test.png" }], input: () => "新しい画像名" }), p = await h.open();
  await p.receive({ type: "uploadGroupImage", payload: { groupId: "g", note: { title: "保存前タイトル" } } });
  assert.equal(h.data.title, "保存前タイトル");
  const image = h.data.groups[0].images[0];
  assert.equal(image.name, "test");
  assert.equal(count(h, "copyFile"), 1);
  await p.receive({ type: "renameGroupImage", payload: { groupId: "g", imageId: image.id, note: h.data } });
  assert.equal(h.data.groups[0].images[0].name, "新しい画像名");
  await p.receive({ type: "deleteGroupImage", payload: { groupId: "g", imageId: image.id, note: h.data } });
  assert.equal(h.data.groups[0].images.length, 0);
  assert.equal(count(h, "removeImage"), 1);
  const removal = h.events.findIndex(([name]) => name === "removeImage");
  assert.equal(h.events[removal - 1][0], "write");
});

test("保存・検索の失敗を画面へ返し、その後の再試行を受け付ける", async () => {
  let fail = true;
  const h = createNoteEditorHarness({ write: () => { if (fail) throw Error("offline"); }, searchError: Error("search failed") }), p = await h.open();
  await p.receive({ type: "save", payload: { title: "失敗" } });
  assert.match(posts(h).at(-1).message, /offline/);
  fail = false;
  await p.receive({ type: "save", payload: { title: "再試行" } });
  assert.equal(h.data.title, "再試行");
  await p.receive({ type: "searchReferences", requestId: 42 });
  assert.equal(posts(h).at(-2).requestId, 42);
  assert.match(posts(h).at(-1).message, /search failed/);
});

test("タブを再利用し、終了確認の二重表示を防いで破棄後の再表示を受け付ける", async () => {
  let answer;
  const h = createNoteEditorHarness({ confirm: () => new Promise((resolve) => { answer = resolve; }) }), p = await h.open();
  assert.equal(await h.open(), p);
  assert.equal(h.panels.length, 1);
  const closing = p.receive({ type: "requestClose" });
  await new Promise(setImmediate);
  await p.receive({ type: "requestClose" });
  assert.equal(count(h, "confirm"), 1);
  answer("閉じる"); await closing;
  assert.equal(count(h, "settingsDisposed"), 1);
  await h.open();
  assert.equal(h.panels.length, 2);
});

test("項目操作は対象不在・競合時に内容を変更せず、挿入位置とリンク解除を保つ", () => {
  const note = { groups: [{ id: "g", items: [{ id: "i", kind: "entry", body: "本文", memo: { body: "既存" } }] }] };
  const before = JSON.stringify(note);
  assert.throws(() => operations.insertEntriesAfterItem(note, "missing", "i", []), /大分類/);
  assert.throws(() => operations.replaceItemBody(note, "g", "i", "変更", { expectedTarget: { body: "古い本文" } }), /再読み込み/);
  assert.equal(JSON.stringify(note), before);
  operations.insertItemAtPosition(note, "g", -3, { heading: "先頭", memo: { body: "追加", linkedConceptMemoIds: ["old"], autoSyncToConceptMemoOverride: true } });
  assert.equal(note.groups[0].items[0].heading, "先頭");
  assert.deepEqual(note.groups[0].items[0].memo.linkedConceptMemoIds, []);
  assert.equal(note.groups[0].items[0].memo.autoSyncToConceptMemoOverride, false);
  operations.insertGroupAtPosition(note, 99, { title: "末尾", items: [{ kind: "divider", label: "区分" }] });
  assert.equal(note.groups[1].title, "末尾");
});
