const test = require("node:test");
const assert = require("node:assert/strict");
const preview = require("../src/import/note-import-preview");
const content = require("../src/import/note-import-content");
const { createImportHarness } = require("./fixtures/note-import-harness.cjs");

const memo = { type: "list", body: "メモ", tags: ["資料"], linkedConceptMemoIds: ["source"], autoSyncToConceptMemoOverride: true };
function imported() {
  return { groups: [{ id: "g", title: "", items: [
    { id: "d", kind: "divider", label: "", value: "補足" },
    { id: "e", kind: "entry", heading: "", body: "\n 一行目\n二行目", memo, importMeta: { supplemented: true } },
    { id: "other", kind: "unknown" },
  ] }, { id: "empty", items: [] }] };
}

test("読込候補は区分・項目の順序、空欄の補完と対象範囲を保ち、入力を変更しない", () => {
  const note = imported(), before = JSON.stringify(note);
  const source = preview.flattenSourceInsertables(note);
  assert.deepEqual(source.map((item) => item.sourceType), ["group", "divider", "entry", "group"]);
  assert.deepEqual(source[0].counts, { dividers: 1, entries: 1 });
  assert.equal(source[2].heading, "無題項目 2");
  assert.equal(source[2].previewLine, "一行目");
  assert.equal(source[2].memo.body, "メモ");
  assert.deepEqual(source[2].memo.linkedConceptMemoIds, []);
  assert.equal(source[2].memo.autoSyncToConceptMemoOverride, false);
  assert.equal(preview.flattenTargetEntries(note.groups)[0].heading, "無題項目 1");
  assert.equal(preview.flattenTargetEntries(note.groups)[0].memo, memo);
  assert.deepEqual(preview.flattenTargetEntries(note.groups, "empty"), []);
  assert.deepEqual(preview.flattenTargetGroups(note.groups, "g").map((group) => group.groupId), ["g"]);
  assert.equal(JSON.stringify(note), before);
});

test("再読込後は内容一致を優先し、本文変更時は見出しと冒頭行で選択を復元する", () => {
  const entries = preview.flattenSourceEntries(imported());
  const snapshot = entries[0];
  assert.equal(preview.findSourceItemIdBySnapshot(snapshot, [{ ...snapshot, sourceItemId: "new" }]), "new");
  assert.equal(preview.findSourceItemIdBySnapshot(snapshot, [{ ...snapshot, body: "変更", sourceItemId: "loose" }]), "loose");
  assert.equal(preview.findSourceItemIdBySnapshot(snapshot, [{ ...snapshot, heading: "別項目" }]), "");
  assert.equal(preview.findSourceItemIdBySnapshot(null, entries), "");
  assert.equal(preview.findSourceItemIdBySnapshot(snapshot, []), "");
});

test("新規と置換えのタイトル優先順位を区別し、置換先のID・順序・保存基準を保持する", () => {
  const options = { existingNoteTitle: "既存", previewData: { titleCandidate: "生成元" } };
  assert.equal(content.getImportedNoteTitle(options, { title: " 指定 " }), "指定");
  assert.equal(content.getImportedNoteTitle(options, {}), "生成元");
  assert.equal(content.getImportedNoteTitle(options, {}, true), "既存");
  assert.equal(content.getImportedNoteTitle({}, {}), "インポートノート");
  const source = imported(), before = JSON.stringify(source);
  const target = { id: "target", order: 4, storageRevision: "revision", custom: "対象外" };
  for (const include of [true, false]) {
    const result = content.buildImportedNoteReplacement(target, source, "reference", "新題", include);
    assert.equal(result.id, "target"); assert.equal(result.order, 4); assert.equal(result.storageRevision, "revision");
    assert.equal(result.type, "reference"); assert.equal(result.custom, undefined);
    assert.equal(Boolean(result.groups[0].items[1].memo), include);
  }
  assert.equal(JSON.stringify(source), before);
});

test("実ホストの新規・置換えはメモ選択を保存へ渡し、再利用と保存後の通知順を維持する", async () => {
  for (const type of ["confirmImportCreate", "confirmImportReplace"]) {
    for (const include of [true, false]) {
      const h = createImportHarness("full");
      const options = { parsedNote: imported(), existingNotePath: "/target.json", previewData: { titleCandidate: "生成元" } };
      const p = await h.open(options);
      assert.equal(await h.open(options), p);
      await p.receive({ type, payload: { includeItemMemos: include } });
      assert.equal(h.events.some(([type]) => type === "error"), false);
      const event = h.events.find(([kind]) => kind === (type === "confirmImportCreate" ? "create" : "save"));
      const groups = type === "confirmImportCreate" ? event[5].initialGroups : event[2].groups;
      assert.equal(Boolean(groups[0].items[1].memo), include);
      if (type === "confirmImportReplace") {
        assert.equal(event[2].storageRevision, "revision");
        assert.ok(h.events.findIndex(([kind]) => kind === "save") < h.events.findIndex(([kind]) => kind === "notify"));
      }
      assert.equal(p.disposed, true);
    }
  }
});

test("取消と保存失敗は読込画面を残し、保存後の編集画面を開かない", async () => {
  for (const config of [{ cancel: true }, { saveError: true }]) {
    const h = createImportHarness("full", config);
    const p = await h.open({ existingNotePath: "/target.json", parsedNote: imported() });
    await p.receive({ type: "confirmImportReplace", payload: {} });
    assert.equal(p.disposed, false);
    assert.equal(h.events.some(([type]) => type === "notify" || type === "openNote"), false);
    assert.equal(h.events.some(([type]) => type === "error"), !!config.saveError);
  }
});

test("実ホストの選択インポートは再読込・メモ選択・反映後の候補更新を維持する", async () => {
  const h = createImportHarness("partial", { note: imported() });
  const p = await h.open({ parsedNote: imported(), noteData: imported(), sourceFilePath: "/source.md", notePath: "/target.json", onApply: h.apply });
  await p.receive({ type: "reloadImportSource", payload: { currentMode: "replace_entry_body", includeItemMemos: false, replaceItemMemo: true } });
  assert.match(p.html, /"includeItemMemos":false/);
  assert.match(p.html, /"replaceItemMemo":true/);
  await p.receive({ type: "applyPartialInsertItem", payload: { keepOpen: true, includeItemMemos: false, source: { sourceType: "entry", memo } } });
  assert.equal(h.events.find(([type]) => type === "apply")[1].source.memo, undefined);
  const post = h.events.find(([type]) => type === "post")[1];
  assert.equal(post.type, "partialImportApplied");
  assert.equal(post.payload.replaceTargetEntries.length, 1);
  assert.equal(p.disposed, false);
  await p.receive({ type: "applyPartialReplaceImport", payload: { replaceItemMemo: true, source: { memo } } });
  assert.equal(h.events.filter(([type]) => type === "apply").at(-1)[1].replaceItemMemo, true);
  assert.equal(p.disposed, true);
  assert.equal(h.events.some(([type]) => type === "error"), false);
});
