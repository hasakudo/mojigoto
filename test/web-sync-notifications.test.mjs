import { autoReflectSelection, setAutoReflectSelection, conceptAutoReflectEnabled } from "../web/lib/memo-auto-reflect.mjs";
import { createConceptSaveController } from "../web/lib/concept-save.mjs";
import { createConceptMemoSyncController } from "../web/lib/concept-memo-sync.mjs";
import { createNoteSaveController } from "../web/lib/note-save.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { hasExternalVersion, hasSameExternalContent } from "../web/lib/editor-sync.mjs";
import { normalizeNote, createNoteEntry } from "../web/lib/notes.mjs";
import { normalizeConceptDocument, memoEditableText } from "../web/lib/concept-memos.mjs";
import { analyzeConceptNoteSync, applyNotePayloadToConcept, notePayloadFromConcept, noteMemoPayload, syncFingerprint } from "../web/lib/concept-sync.mjs";

const app = await readFile(new URL("../web/app.mjs", import.meta.url), "utf8");
function appFunction(name) {
  const start = new RegExp(`^(?:async )?function ${name}\\(`, "m").exec(app)?.index ?? -1;
  assert.ok(start >= 0, name);
  const end = /\r?\n}\r?\n/.exec(app.slice(start));
  return app.slice(start, start + end.index + end[0].length);
}
function harness() {
  const notices = [];
  const writes = [];
  const note = normalizeNote({ id: "note", title: "資料", groups: [{ id: "group", items: [{
    id: "item", kind: "entry", body: "本文", memo: { body: "旧メモ", tags: [] },
  }] }] });
  const item = note.groups[0].items[0];
  const fingerprint = syncFingerprint(item.memo);
  item.memo.conceptMemoSyncFingerprint = fingerprint;
  const memo = { id: "memo", type: "text", title: "構想", body: "旧メモ", tags: [], createdAt: "2026-10-01", source: {
    kind: "noteItem", syncFingerprint: fingerprint, autoSyncToNoteItem: true,
  } };
  const doc = normalizeConceptDocument({ memos: [memo] });
  const state = { dirty: true, saving: false, externalConflict: false, currentNote: {
    item: { id: "note-file", eTag: "old" }, data: note, raw: JSON.stringify(note),
  }, currentConceptMemo: doc.memos[0], conceptDocument: doc, conceptOriginalContent: JSON.stringify(doc),
    conceptFile: { id: "concept-file", eTag: "old" }, selectedWork: { id: "work", mojigoto: { id: "mojigoto" } },
    noteEntriesCache: new Map(), noteType: "reference",
  };
  const context = { state, notices, writes, structuredClone, hasExternalVersion, hasSameExternalContent, autoReflectSelection, setAutoReflectSelection, conceptAutoReflectEnabled,
    createNoteEntry, normalizeConceptDocument, analyzeConceptNoteSync, applyNotePayloadToConcept,
    notePayloadFromConcept, noteMemoPayload, syncFingerprint, memoEditableText,
    elements: { saveNoteButton: {}, saveConceptMemoButton: {}, conceptMemoTypeSelect: {}, conceptMemoBodyInput: {}, conceptMemoTagsInput: {}, conflictDialog: { showModal() {} } },
    notify: (...args) => notices.push(args), cloudLabel: () => "Drive",
    cancelAutoSave() {}, setNoteStatus: (...args) => (state.noteStatuses ||= []).push(args), setConceptStatus: (...args) => (state.conceptStatuses ||= []).push(args), scheduleAutoSave: () => { state.scheduled = (state.scheduled || 0) + 1; },
    recordRecentView() {}, routeForWork() {}, rememberTags() {}, updateSharedWorkMetrics() {}, updateNoteIndex() {},
    refreshNoteDerivedViews() {}, renderConceptEditorList() {},
    maybeCreateWebAutomaticBackup: async () => {}, noteBackupTarget() {}, conceptMemoBackupTarget() {},
    updateConceptBodyLabel() {}, setConceptSyncStatus(_message, tone = "") { state.conceptSyncBlocked = tone === "error"; }, OneDriveConflictError: class extends Error {},
    writeTextWithBaseline: async (_, file, content) => { writes.push([file.id, content]); return { eTag: "saved" }; },
    findConceptSourceEntry: async () => ({ entry: state.currentNote, item, group: note.groups[0] }),
  };
  state.provider = { writeText: async (file, content) => { writes.push([file.id, content]); return { eTag: "saved" }; },
    listChildren: async () => [{ id: "concept-file", file: {}, name: "concept-memos.json", eTag: "old" }],
    readText: async () => JSON.stringify(state.conceptDocument),
    getItemMetadata: async () => ({ eTag: "saved" }) };
  vm.createContext(context);
  Object.assign(context, createConceptSaveController({ ...context,
    writeTextWithBaseline: (...args) => context.writeTextWithBaseline(...args),
    scheduleAutoSave: (...args) => context.scheduleAutoSave(...args),
    maybeCreateWebAutomaticBackup: (...args) => context.maybeCreateWebAutomaticBackup(...args),
    syncCurrentConceptMemo: (...args) => context.syncCurrentConceptMemo(...args),
  }));
  Object.assign(context, createConceptMemoSyncController({ ...context,
    findConceptSourceEntry: (...args) => context.findConceptSourceEntry(...args),
  }));
  Object.assign(context, createNoteSaveController({ ...context,
    cancelAutoSave: (...args) => context.cancelAutoSave(...args),
    scheduleAutoSave: (...args) => context.scheduleAutoSave(...args),
    maybeCreateWebAutomaticBackup: (...args) => context.maybeCreateWebAutomaticBackup(...args),
    writeTextWithBaseline: context.writeTextWithBaseline ? (...args) => context.writeTextWithBaseline(...args) : undefined,
  }));
  context.window = { confirm: () => { throw new Error("Unexpected discard prompt"); } };
  for (const name of ["canDiscardDraft", "markNoteDirty"]) vm.runInContext(appFunction(name), context);
  return { context, state, notices, writes, item };
}

test("Webの反映OFFでも手動保存・自動保存は成功し、連携先へは書き込まない", async () => {
  for (const automatic of [false, true]) {
    const h = harness();
    h.state.noteToConceptAutoReflect = false;
    h.item.memo.autoSyncToConceptMemo = true;
    h.item.memo.linkedConceptMemoIds = ["memo"];
    h.item.memo.body = "保存する項目メモ";
    await h.context.saveCurrentNote({ automatic });
    assert.deepEqual(h.writes.map(([id]) => id), ["note-file"]);
    assert.equal(h.state.dirty, false);
    assert.equal(h.item.memo.autoSyncToConceptMemo, true, "作品データの設定は変更しない");

    const c = harness();
    c.state.conceptToNoteAutoReflect = false;
    c.state.currentConceptMemo.body = "保存する構想";
    await c.context.saveCurrentConceptMemo({ automatic });
    assert.deepEqual(c.writes.map(([id]) => id), ["concept-file"]);
    assert.equal(c.item.memo.body, "旧メモ");
    assert.equal(c.state.dirty, false);
    assert.equal(c.state.currentConceptMemo.source.autoSyncToNoteItem, true);
  }
});

test("Web反映ONでも個別OFF・未連携の項目は自動反映せず、連携は作らない", async () => {
  const h = harness();
  h.state.noteToConceptAutoReflect = true;
  h.item.memo.body = "反映しない";
  await h.context.saveCurrentNote();
  assert.deepEqual(h.writes.map(([id]) => id), ["note-file"]);
  assert.equal(h.item.memo.linkedConceptMemoIds.length, 0);
});

test("両方向OFFでも構想と項目からの手動反映は使える", async () => {
  const h = harness();
  h.state.noteToConceptAutoReflect = false; h.state.conceptToNoteAutoReflect = false;
  h.state.currentConceptMemo.body = "手動の構想";
  await h.context.syncCurrentConceptMemo({ forceDirection: "concept-to-note" });
  assert.equal(h.item.memo.body, "手動の構想");

  const n = harness();
  n.state.dirty = false; n.state.noteToConceptAutoReflect = false; n.state.conceptToNoteAutoReflect = false;
  n.item.memo.linkedConceptMemoIds = ["memo"]; n.item.memo.body = "手動の項目メモ";
  await n.context.reflectNoteItemToConceptMemos(0, 0);
  assert.equal(JSON.parse(n.writes[0][1]).memos[0].body, "手動の項目メモ");
});

test("構想画面から起きる項目→構想の自動反映にも、その方向のWeb設定が効く", async () => {
  const h = harness();
  h.state.noteToConceptAutoReflect = false; h.state.conceptToNoteAutoReflect = true;
  h.item.memo.autoSyncToConceptMemo = true; h.item.memo.body = "項目で変更";
  await h.context.syncCurrentConceptMemo({ automatic: true });
  assert.equal(h.writes.length, 0);
  h.state.noteToConceptAutoReflect = true;
  await h.context.syncCurrentConceptMemo({ automatic: true });
  assert.equal(h.state.currentConceptMemo.body, "項目で変更");
});

test("初回同期で両方向の個別設定がONなら、片側のWeb設定をOFFにしても反映方向を推測しない", async () => {
  const h = harness();
  delete h.state.currentConceptMemo.source.syncFingerprint;
  delete h.item.memo.conceptMemoSyncFingerprint;
  h.item.memo.autoSyncToConceptMemo = true;
  h.item.memo.body = "項目側に残す";
  h.state.conceptToNoteAutoReflect = false;
  await h.context.syncCurrentConceptMemo({ automatic: true });
  assert.equal(h.writes.length, 0);
  assert.equal(h.state.currentConceptMemo.body, "旧メモ");
});

test("連携先の読込中に反映をOFFにしたら、送信前に再確認して停止する", async () => {
  const h = harness(); h.state.currentConceptMemo.body = "送信しない";
  const find = h.context.findConceptSourceEntry;
  h.context.findConceptSourceEntry = async () => { h.state.conceptToNoteAutoReflect = false; return find(); };
  await h.context.syncCurrentConceptMemo({ automatic: true });
  assert.equal(h.writes.length, 0);

  const n = harness();
  n.item.memo.autoSyncToConceptMemo = true; n.item.memo.linkedConceptMemoIds = ["memo"]; n.item.memo.body = "送信しない";
  const read = n.state.provider.readText;
  n.state.provider.readText = async (...args) => { n.state.noteToConceptAutoReflect = false; return read(...args); };
  await n.context.syncSavedNoteToConceptMemos(n.state.currentNote);
  assert.equal(n.writes.length, 0);
});

test("手動保存と自動反映では保存通知1回だけを表示し、自分の同期を再通知しない", async () => {
  const h = harness();
  h.state.currentConceptMemo.body = "新しいメモ";
  await h.context.saveCurrentConceptMemo();
  assert.equal(h.item.memo.body, "新しいメモ");
  assert.equal(h.notices.length, 1);
  assert.equal(h.notices[0][0], "構想メモをDriveへ保存しました。");
  assert.equal(h.state.conceptSyncContext.entry.item.eTag, "saved");
  await h.context.checkConceptSourceUpdate();
  assert.equal(h.notices.length, 1);
});

test("自動保存と自動反映の成功は通知せず、内容変更のない手動保存も通知しない", async () => {
  const h = harness();
  h.state.currentConceptMemo.body = "自動保存するメモ";
  await h.context.saveCurrentConceptMemo({ automatic: true });
  assert.equal(h.item.memo.body, "自動保存するメモ");
  assert.equal(h.notices.length, 0);
  h.state.dirty = true;
  await h.context.saveCurrentConceptMemo();
  assert.equal(h.notices.length, 0);
  h.state.currentNote.raw = JSON.stringify(h.state.currentNote.data);
  h.state.dirty = true;
  await h.context.saveCurrentNote({ skipConceptSync: true });
  assert.equal(h.notices.length, 0);
  h.state.currentNote.data.title = "変更した資料";
  h.state.dirty = true;
  await h.context.saveCurrentNote({ skipConceptSync: true });
  assert.equal(h.notices.length, 1);
});

test("反映ボタンによる同期は内容が変わったときだけ完了通知を表示する", async () => {
  const h = harness();
  await h.context.syncCurrentConceptMemo({ forceDirection: "concept-to-note" });
  assert.equal(h.notices.length, 0);
  h.state.currentConceptMemo.body = "手動反映するメモ";
  await h.context.syncCurrentConceptMemo({ forceDirection: "concept-to-note" });
  assert.equal(h.notices.length, 1);
  assert.match(h.notices[0][0], /安全に同期/);
});

test("メタデータだけの外部更新は通知せず、新しい同期競合だけを通知する", async () => {
  const h = harness();
  h.state.conceptSyncContext = { entry: h.state.currentNote, analysis: analyzeConceptNoteSync(h.state.currentConceptMemo, h.item.memo) };
  await h.context.checkConceptSourceUpdate();
  assert.equal(h.notices.length, 0);
  h.state.currentConceptMemo.body = "構想側の変更";
  h.item.memo.body = "項目側の変更";
  await h.context.checkConceptSourceUpdate();
  assert.equal(h.notices.length, 1);
  assert.equal(h.notices[0][1], true);
  await h.context.checkConceptSourceUpdate();
  assert.equal(h.notices.length, 1);
});

test("自動同期の書き込み失敗は黙らせず通知する", async () => {
  const h = harness();
  h.state.currentConceptMemo.body = "変更";
  h.state.provider.writeText = async () => { throw new Error("同期先へ保存できません"); };
  await h.context.saveCurrentConceptMemo({ automatic: true });
  assert.equal(h.notices.length, 1);
  assert.equal(h.notices[0][1], true);
  assert.match(h.notices[0][0], /同期先へ保存できません/);
});

test("項目メモの保存と構想メモへの自動反映も保存通知1回にまとめる", async () => {
  const h = harness();
  h.item.memo.autoSyncToConceptMemo = true;
  h.item.memo.linkedConceptMemoIds = ["memo"];
  h.item.memo.body = "項目側の変更";
  await h.context.saveCurrentNote();
  assert.equal(h.notices.length, 1);
  assert.equal(h.notices[0][0], "ノートをDriveへ保存しました。");
  assert.equal(JSON.parse(h.writes.at(-1)[1]).memos[0].body, "項目側の変更");
});

test("自動反映の両側変更は一度通知して停止し、同じ競合を再通知しない", async () => {
  const h = harness();
  h.item.memo.body = "項目側";
  h.state.currentConceptMemo.body = "構想側";
  await h.context.syncCurrentConceptMemo({ automatic: true });
  assert.equal(h.writes.length, 0);
  assert.equal(h.notices.length, 1);
  assert.equal(h.notices[0][1], true);
  await h.context.syncCurrentConceptMemo({ automatic: true });
  assert.equal(h.notices.length, 1);
});

test("構想メモの保存失敗は自動再試行せず、ノートの同期基準も更新しない", async () => {
  const h = harness();
  let retries = 0;
  h.context.scheduleAutoSave = () => retries++;
  h.context.writeTextWithBaseline = async () => { throw new Error("offline"); };
  const before = JSON.stringify(h.item.memo);
  h.item.memo.body = "ノート側の追記";
  const baseline = h.item.memo.conceptMemoSyncFingerprint;
  await assert.rejects(h.context.syncCurrentConceptMemo({ forceDirection: "note-to-concept" }), /更新を停止/);
  assert.equal(h.writes.length, 0);
  assert.equal(h.item.memo.conceptMemoSyncFingerprint, baseline);
  assert.equal(h.state.dirty, true);
  assert.equal(retries, 0);
  assert.equal(h.state.syncing, false);
});

test("構想からノートへの書き込み失敗はノートのキャッシュを変更しない", async () => {
  const h = harness();
  h.state.currentConceptMemo.body = "新しい構想";
  const before = JSON.stringify(h.state.currentNote);
  h.state.provider.writeText = async () => { throw new Error("offline"); };
  await assert.rejects(h.context.syncCurrentConceptMemo({ forceDirection: "concept-to-note" }), /offline/);
  assert.equal(JSON.stringify(h.state.currentNote), before);
});

test("同期情報の二つ目の保存失敗を同期成功として通知しない", async () => {
  const h = harness();
  h.state.currentConceptMemo.body = "構想側";
  h.context.writeTextWithBaseline = async () => { throw new Error("offline"); };
  await assert.rejects(h.context.syncCurrentConceptMemo({ forceDirection: "concept-to-note" }), /同期情報は未保存/);
  assert.equal(h.item.memo.body, "構想側");
  assert.equal(h.state.dirty, true);
  assert.ok(!h.notices.some(([message]) => /安全に同期/.test(message)));
});

test("バックアップ失敗は構想メモ本体の保存成功を取り消さない", async () => {
  const h = harness();
  h.context.maybeCreateWebAutomaticBackup = async () => { throw new Error("backup offline"); };
  assert.equal(await h.context.saveCurrentConceptMemo({ skipSync: true }), true);
  assert.equal(h.state.dirty, false);
  assert.match(h.notices[0][0], /保存しましたが、バックアップ/);
});

test("バックアップ待ちの追加入力は自動同期に混ぜない", async () => {
  const h = harness();
  h.context.maybeCreateWebAutomaticBackup = async () => {
    h.state.currentConceptMemo.body = "まだ保存していない追記";
    h.state.dirty = true;
  };
  await h.context.saveCurrentConceptMemo();
  assert.equal(h.item.memo.body, "旧メモ");
  assert.equal(h.writes.length, 1);
  assert.equal(h.state.dirty, true);
});

test("出典の読み込み中に作品を移動した同期は書き込まない", async () => {
  const h = harness();
  h.context.findConceptSourceEntry = async () => {
    h.state.selectedWork = { id: "other-work" };
    return { entry: h.state.currentNote, item: h.item };
  };
  await h.context.syncCurrentConceptMemo({ forceDirection: "concept-to-note" });
  assert.equal(h.writes.length, 0);
});

test("ノート保存後の自動同期は保存時の内容とプロバイダーを使用する", async () => {
  const h = harness();
  h.item.memo.autoSyncToConceptMemo = true;
  h.item.memo.linkedConceptMemoIds = ["memo"];
  h.item.memo.body = "保存済みの変更";
  h.state.provider.listChildren = async () => {
    h.item.memo.body = "未保存の追記";
    h.state.provider = { writeText() { throw new Error("別の接続へ書き込み"); } };
    return [{ id: "concept-file", file: {}, name: "concept-memos.json", eTag: "old" }];
  };
  await h.context.syncSavedNoteToConceptMemos(h.state.currentNote);
  assert.equal(JSON.parse(h.writes[0][1]).memos[0].body, "保存済みの変更");
});

test("ノートへの反映中に入力した構想は未保存のまま保持する", async () => {
  const h = harness();
  h.state.currentConceptMemo.body = "反映開始時の構想";
  h.state.provider.writeText = async (file, content) => {
    h.writes.push([file.id, content]);
    h.state.currentConceptMemo.body = "通信中の追記";
    return { eTag: "saved" };
  };
  await assert.rejects(h.context.syncCurrentConceptMemo({ forceDirection: "concept-to-note" }), /追加入力は未保存/);
  assert.equal(h.item.memo.body, "反映開始時の構想");
  assert.equal(h.state.currentConceptMemo.body, "通信中の追記");
  assert.equal(h.state.dirty, true);
  assert.equal(h.writes.length, 1);
});

test("ノートの手動反映は先に未保存内容を保存し、その失敗時は反映しない", async () => {
  const h = harness();
  h.item.memo.linkedConceptMemoIds = ["memo"];
  h.context.writeTextWithBaseline = async () => { throw new Error("offline"); };
  await h.context.reflectNoteItemToConceptMemos(0, 0);
  assert.equal(h.writes.length, 0);
  assert.equal(h.state.dirty, true);
});

test("ノート手動反映の構想保存失敗ではノートの同期基準を更新しない", async () => {
  const h = harness();
  h.state.dirty = false;
  h.item.memo.linkedConceptMemoIds = ["memo"];
  h.item.memo.body = "反映対象";
  const before = JSON.stringify(h.item.memo);
  h.state.provider.writeText = async () => { throw new Error("offline"); };
  await assert.rejects(h.context.reflectNoteItemToConceptMemos(0, 0), /offline/);
  assert.equal(JSON.stringify(h.item.memo), before);
  assert.equal(h.state.syncing, false);
});

test("ノート手動反映の二つ目の保存失敗では未保存リンクを保持する", async () => {
  const h = harness();
  h.state.dirty = false;
  h.item.memo.linkedConceptMemoIds = ["memo"];
  h.item.memo.body = "反映対象";
  h.context.writeTextWithBaseline = async () => { throw new Error("offline"); };
  await assert.rejects(h.context.reflectNoteItemToConceptMemos(0, 0), /同期情報は未保存/);
  assert.equal(h.writes.length, 1);
  assert.equal(JSON.parse(h.writes[0][1]).memos[0].body, "反映対象");
  assert.equal(h.state.dirty, true);
  assert.ok(!h.notices.some(([message]) => /件の構想メモへ/.test(message)));
});

test("ノート手動反映中の追加入力を同期先へ混ぜず下書きとして保持する", async () => {
  const h = harness();
  h.state.dirty = false;
  h.item.memo.linkedConceptMemoIds = ["memo"];
  h.item.memo.body = "反映開始時";
  h.state.provider.writeText = async (file, content) => {
    h.writes.push([file.id, content]);
    h.item.memo.body = "通信中の追記";
    return { eTag: "saved" };
  };
  await assert.rejects(h.context.reflectNoteItemToConceptMemos(0, 0), /追加入力は未保存/);
  assert.equal(JSON.parse(h.writes[0][1]).memos[0].body, "反映開始時");
  assert.equal(h.item.memo.body, "通信中の追記");
  assert.equal(h.writes.length, 1);
  assert.equal(h.state.dirty, true);
});


test("ノート保存の競合は本文と基準を保持し再保存・自動反映も止める", async () => {
  const h = harness();
  const original = h.state.currentNote.raw;
  h.item.memo.body = "未保存の追記";
  h.item.memo.autoSyncToConceptMemo = true;
  h.item.memo.linkedConceptMemoIds = ["memo"];
  let attempts = 0;
  h.context.writeTextWithBaseline = async () => { attempts++; const error = new Error("conflict"); error.code = "conflict"; throw error; };
  assert.equal(await h.context.saveCurrentNote(), false);
  assert.equal(h.state.externalConflict, true);
  assert.equal(h.state.dirty, true);
  assert.equal(h.state.saving, false);
  assert.equal(h.state.currentNote.raw, original);
  assert.equal(h.item.memo.body, "未保存の追記");
  await h.context.saveCurrentNote({ automatic: true });
  assert.equal(attempts, 1);
  assert.equal(h.writes.length, 0);
});

test("ノート保存待ちの追加入力は構想へ送らず次の保存で初めて反映する", async () => {
  const h = harness();
  h.item.memo.autoSyncToConceptMemo = true;
  h.item.memo.linkedConceptMemoIds = ["memo"];
  h.item.memo.body = "送信した本文";
  let resume;
  const normalWrite = h.context.writeTextWithBaseline;
  h.context.writeTextWithBaseline = async (...args) => {
    await new Promise(resolve => { resume = resolve; });
    return normalWrite(...args);
  };
  const saving = h.context.saveCurrentNote();
  h.item.memo.body = "通信待ち中の追記";
  resume();
  assert.equal(await saving, false);
  assert.equal(JSON.parse(h.writes[0][1]).groups[0].items[0].memo.body, "送信した本文");
  assert.equal(h.state.currentNote.data.groups[0].items[0].memo.body, "通信待ち中の追記");
  assert.equal(h.state.dirty, true);
  assert.deepEqual(h.writes.map(([id]) => id), ["note-file"]);
  h.context.writeTextWithBaseline = normalWrite;
  assert.equal(await h.context.saveCurrentNote({ automatic: true }), true);
  assert.deepEqual(h.writes.map(([id]) => id), ["note-file", "note-file", "concept-file"]);
  assert.equal(JSON.parse(h.writes[2][1]).memos[0].body, "通信待ち中の追記");
  assert.equal(h.state.dirty, false);
});


function enableLinkedNote(h) {
  h.state.currentConceptMemo = null;
  h.item.memo.autoSyncToConceptMemo = true;
  h.item.memo.linkedConceptMemoIds = ["memo"];
  h.item.memo.body = "反映する項目メモ";
}
function pendingReflection() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
for (const phase of ["listChildren", "readText", "writeText"]) {
  test("ノート自動反映の" + phase + "待ちでは反映中を表示し移動とページ離脱を保護する", async () => {
    const h = harness(); enableLinkedNote(h);
    const wait = pendingReflection(), entered = pendingReflection();
    const original = h.state.provider[phase];
    h.state.provider[phase] = async (...args) => { entered.resolve(); await wait.promise; return original(...args); };
    const saving = h.context.saveCurrentNote({ automatic: true });
    await entered.promise;
    assert.equal(h.state.dirty, false, "ノート本体は保存済み");
    assert.equal(h.state.saving, false);
    assert.equal(h.state.syncing, true);
    assert.equal(h.state.noteConceptSyncPending, true);
    assert.equal(h.context.elements.saveNoteButton.disabled, true);
    assert.deepEqual(h.state.noteStatuses.at(-1), ["構想メモへ反映中…", "saving"]);
    assert.equal(h.context.canDiscardDraft(), false);
    assert.match(h.notices.at(-1)[0], /反映が終わってから移動/);
    let unload;
    h.context.window.addEventListener = (name, callback) => { if (name === "beforeunload") unload = callback; };
    h.context.rememberCurrentRoutePosition = () => {};
    const start = app.indexOf('window.addEventListener("beforeunload"');
    vm.runInContext(app.slice(start, app.indexOf("\n});", start) + 5), h.context);
    let prevented = false;
    unload({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    wait.resolve(); await saving;
    assert.equal(h.state.syncing, false);
    assert.equal(h.state.noteConceptSyncPending, false);
    assert.deepEqual(h.state.noteStatuses.at(-1), ["保存済み", ""]);
    assert.equal(h.context.canDiscardDraft(), true);
    prevented = false; unload({ preventDefault() { prevented = true; } });
    assert.equal(prevented, false);
  });
}

test("ノート自動反映失敗は保存済み本文を保ち反映失敗を表示して移動保護を解除する", async () => {
  const h = harness(); enableLinkedNote(h);
  h.state.provider.writeText = async () => { throw new Error("offline"); };
  assert.equal(await h.context.saveCurrentNote({ automatic: true }), true, "ノート本体の保存は成功");
  assert.equal(JSON.parse(h.state.currentNote.raw).groups[0].items[0].memo.body, "反映する項目メモ");
  assert.equal(h.state.dirty, false);
  assert.equal(h.state.syncing, false);
  assert.equal(h.state.noteConceptSyncPending, false);
  assert.deepEqual(h.state.noteStatuses.at(-1), ["ノート保存済み・反映失敗", "error"]);
  assert.equal(h.context.canDiscardDraft(), true);
  assert.ok(h.notices.some(([message]) => message === "offline"));
});

test("ノート自動反映待ちの追記は表示を保ち終了後に自動保存を予約し直す", async () => {
  const h = harness(); enableLinkedNote(h);
  let scheduled = 0;
  h.context.scheduleAutoSave = () => { if (!h.state.syncing) scheduled++; };
  const wait = pendingReflection(), entered = pendingReflection();
  h.state.provider.writeText = async (file, content) => {
    h.writes.push([file.id, content]); entered.resolve(); await wait.promise; return { eTag: "saved" };
  };
  const saving = h.context.saveCurrentNote({ automatic: true }); await entered.promise;
  h.state.currentNote.data.groups[0].items[0].memo.body = "反映待ち中の未保存追記";
  h.context.markNoteDirty();
  assert.match(h.state.noteStatuses.at(-1)[0], /反映中.*未保存/);
  assert.equal(h.context.elements.saveNoteButton.disabled, true);
  assert.equal(scheduled, 0);
  await h.context.saveCurrentNote({ skipConceptSync: true });
  assert.equal(h.writes.length, 2, "自動反映中に手動反映用の保存を並行実行しない");
  wait.resolve(); await saving;
  assert.equal(h.state.dirty, true);
  assert.equal(h.state.currentNote.data.groups[0].items[0].memo.body, "反映待ち中の未保存追記");
  assert.equal(JSON.parse(h.writes[1][1]).memos[0].body, "反映する項目メモ");
  assert.equal(scheduled, 1);
  assert.equal(h.context.elements.saveNoteButton.disabled, false);
  assert.deepEqual(h.state.noteStatuses.at(-1), ["未保存", "dirty"]);
});

test("自動反映OFFと未連携ノートでは反映中表示や追加通信を行わない", async () => {
  for (const linked of [false, true]) {
    const h = harness();
    if (linked) { enableLinkedNote(h); h.state.noteToConceptAutoReflect = false; }
    let listed = 0;
    h.state.provider.listChildren = async () => { listed++; return []; };
    await h.context.saveCurrentNote({ automatic: true });
    assert.equal(listed, 0);
    assert.equal(h.state.syncing || false, false);
    assert.ok(!h.state.noteStatuses.some(([label]) => label.includes("反映中")));
  }
});


function attachConceptAutoReflectSetting(h) {
  const elements = h.context.elements;
  elements.conceptMemoAutoReflectInput = { value: "inherit", addEventListener(_name, callback) { h.changeAutoReflect = callback; } };
  elements.conceptMemoAutoReflectHelp = {};
  for (const name of ["renderConceptAutoReflectSetting", "markConceptDirty"]) vm.runInContext(appFunction(name), h.context);
  const start = app.indexOf('elements.conceptMemoAutoReflectInput.addEventListener("change"');
  vm.runInContext(app.slice(start, app.indexOf("\n});", start) + 5), h.context);
  h.context.renderConceptAutoReflectSetting();
}

test("端末の自動反映ON・メモ個別OFFの停止理由を表示し、個別ONの保存から反映する", async () => {
  const h = harness();
  h.state.conceptToNoteAutoReflect = true;
  h.state.currentConceptMemo.source.autoSyncToNoteItem = false;
  h.state.currentConceptMemo.body = "構想側で編集した本文";
  attachConceptAutoReflectSetting(h);
  assert.equal(h.context.elements.conceptMemoAutoReflectInput.value, "inherit");
  assert.match(h.context.elements.conceptMemoAutoReflectHelp.textContent, /全体設定は未設定/);
  await h.context.saveCurrentConceptMemo();
  assert.deepEqual(h.writes.map(([id]) => id), ["concept-file"]);
  assert.equal(h.item.memo.body, "旧メモ");
  h.context.elements.conceptMemoAutoReflectInput.value = "on";
  h.changeAutoReflect();
  assert.equal(h.state.dirty, true);
  await h.context.saveCurrentConceptMemo();
  assert.equal(h.item.memo.body, "構想側で編集した本文");
  assert.equal(h.state.currentConceptMemo.source.autoSyncToNoteItem, true);
  assert.equal(JSON.parse(h.state.conceptOriginalContent).memos[0].source.autoSyncToNoteItem, true);
  assert.equal(h.state.conceptSyncBlocked, false);
  assert.equal(h.state.dirty, false);
});

test("端末側OFFでは個別ONを保存しても自動反映せず端末側の停止理由を表示する", async () => {
  const h = harness();
  h.state.conceptToNoteAutoReflect = false;
  h.state.currentConceptMemo.body = "構想側の変更";
  attachConceptAutoReflectSetting(h);
  assert.match(h.context.elements.conceptMemoAutoReflectHelp.textContent, /全体設定は未設定/);
  await h.context.saveCurrentConceptMemo();
  assert.deepEqual(h.writes.map(([id]) => id), ["concept-file"]);
  assert.equal(h.item.memo.body, "旧メモ");
});

test("個別ONにしても両側変更を自動上書きせず、他のメモのOFF設定は保持する", async () => {
  const h = harness();
  h.state.conceptDocument.memos.push({ id: "other", source: { autoSyncToNoteItem: false } });
  h.state.currentConceptMemo.source.autoSyncToNoteItem = false;
  h.state.currentConceptMemo.body = "構想側で変更";
  h.item.memo.body = "項目側で変更";
  attachConceptAutoReflectSetting(h);
  h.context.elements.conceptMemoAutoReflectInput.value = "on";
  h.changeAutoReflect(); await h.context.saveCurrentConceptMemo();
  assert.equal(h.item.memo.body, "項目側で変更");
  assert.equal(h.state.currentConceptMemo.body, "構想側で変更");
  assert.equal(h.state.conceptSyncBlocked, true);
  assert.deepEqual(h.writes.map(([id]) => id), ["concept-file"]);
  assert.equal(h.state.conceptDocument.memos[1].source.autoSyncToNoteItem, false);
});

test("連携先のない構想メモでは個別設定を変更しても出典を作らない", () => {
  const h = harness(); delete h.state.currentConceptMemo.source; h.state.dirty = false;
  attachConceptAutoReflectSetting(h);
  h.context.elements.conceptMemoAutoReflectInput.value = "on"; h.changeAutoReflect();
  assert.equal(h.state.currentConceptMemo.source, undefined);
  assert.equal(h.context.elements.conceptMemoAutoReflectHelp.textContent, "");
  assert.equal(h.state.dirty, false);
});


test("ノート本体保存後のバックアップ待ちで保存済みを先に表示しない", async () => {
  const h = harness(); enableLinkedNote(h);
  const wait = pendingReflection(), entered = pendingReflection();
  h.context.maybeCreateWebAutomaticBackup = async () => { entered.resolve(); await wait.promise; };
  const saving = h.context.saveCurrentNote({ automatic: true }); await entered.promise;
  assert.equal(Boolean(h.state.saving || h.state.syncing), true);
  assert.match(h.state.noteStatuses.at(-1)[0], /保存中|反映中/);
  assert.equal(h.context.canDiscardDraft(), false);
  wait.resolve(); await saving;
  assert.equal(h.state.noteStatuses.at(-1)[0], "保存済み");
});

test("項目メモの手動反映が差分なしでも古い同期競合バッヂを解除する", async () => {
  const h = harness(); h.state.dirty = false;
  h.item.memo.linkedConceptMemoIds = ["memo"];
  h.state.noteStatuses = [["同期競合あり", "error"]];
  await h.context.reflectNoteItemToConceptMemos(0, 0);
  assert.deepEqual(h.state.noteStatuses.at(-1), ["保存済み", ""]);
  assert.equal(h.writes.length, 0);
  assert.equal(h.state.noteManualSyncPending, false);
});

test("項目メモの手動反映後も別項目に競合があればバッヂを維持する", async () => {
  const h = harness(); h.state.dirty = false;
  h.item.memo.autoSyncToConceptMemo = true; h.item.memo.linkedConceptMemoIds = ["memo"];
  const other = structuredClone(h.item); other.id = "other-item";
  other.memo.body = "項目側の別変更"; other.memo.linkedConceptMemoIds = ["other-memo"];
  h.state.currentNote.data.groups[0].items.push(other);
  const memo = structuredClone(h.state.conceptDocument.memos[0]); memo.id = "other-memo"; memo.body = "構想側の別変更";
  h.state.conceptDocument.memos.push(memo);
  await h.context.reflectNoteItemToConceptMemos(0, 0);
  assert.deepEqual(h.state.noteStatuses.at(-1), ["同期競合あり", "error"]);
  assert.equal(h.writes.length, 0);
});

test("構想メモの出典読込を待つ時点から反映中を表示し移動を保護する", async () => {
  const h = harness(); h.state.dirty = false; h.state.currentConceptMemo.body = "構想側の変更";
  const wait = pendingReflection(), entered = pendingReflection(), find = h.context.findConceptSourceEntry;
  h.context.findConceptSourceEntry = async (...args) => { entered.resolve(); await wait.promise; return find(...args); };
  const syncing = h.context.syncCurrentConceptMemo({ automatic: true }); await entered.promise;
  assert.equal(h.state.conceptSyncPending, true); assert.equal(h.state.syncing, true);
  assert.deepEqual(h.state.conceptStatuses.at(-1), ["項目メモへ反映中…", "saving"]);
  assert.equal(h.context.canDiscardDraft(), false);
  assert.match(h.notices.at(-1)[0], /項目メモへ反映中/);
  wait.resolve(); await syncing;
  assert.equal(h.state.conceptSyncPending, false); assert.equal(h.state.syncing, false);
  assert.deepEqual(h.state.conceptStatuses.at(-1), ["保存済み", ""]);
});

test("構想メモのバックアップ待ちも保存中を保ち、反映完了後だけ保存済みに戻す", async () => {
  const h = harness(); h.state.currentConceptMemo.body = "構想側の保存対象";
  const wait = pendingReflection(), entered = pendingReflection();
  h.context.maybeCreateWebAutomaticBackup = async () => { entered.resolve(); await wait.promise; };
  const saving = h.context.saveCurrentConceptMemo(); await entered.promise;
  assert.match(h.state.conceptStatuses.at(-1)[0], /保存中|反映中|バックアップ中/);
  assert.equal(h.context.canDiscardDraft(), false);
  wait.resolve(); await saving;
  assert.deepEqual(h.state.conceptStatuses.at(-1), ["保存済み", ""]);
  assert.equal(h.item.memo.body, "構想側の保存対象");
});

test("構想メモの出典読込中に追記したら反映を停止して次の保存を予約する", async () => {
  const h = harness(); h.state.dirty = false;
  const wait = pendingReflection(), entered = pendingReflection(), find = h.context.findConceptSourceEntry;
  h.context.findConceptSourceEntry = async (...args) => { entered.resolve(); await wait.promise; return find(...args); };
  const syncing = h.context.syncCurrentConceptMemo({ automatic: true }); await entered.promise;
  h.state.currentConceptMemo.body = "読込待ち中の追記"; h.state.dirty = true;
  wait.resolve(); await syncing;
  assert.equal(h.writes.length, 0); assert.equal(h.state.dirty, true);
  assert.equal(h.state.scheduled, 1);
  assert.deepEqual(h.state.conceptStatuses.at(-1), ["未保存", "dirty"]);
});

test("反映中の内部保存や入力更新で両画面のバッヂを保存済みに戻さない", () => {
  const h = harness(); h.context.elements.noteStatus = {}; h.context.elements.conceptMemoStatus = {}; h.context.elements.conceptListStatus = {}; h.context.elements.conceptListSaveButton = {}; h.context.conceptBatchSave = { hasPending: () => false };
  for (const name of ["setNoteStatus", "setConceptStatus"]) vm.runInContext(appFunction(name), h.context);
  h.state.noteManualSyncPending = true; h.state.conceptSyncPending = true; h.state.dirty = false;
  h.context.setNoteStatus("保存済み"); h.context.setConceptStatus("保存済み");
  assert.equal(h.context.elements.noteStatus.textContent, "構想メモへ反映中…");
  assert.equal(h.context.elements.conceptMemoStatus.textContent, "項目メモへ反映中…");
  h.state.dirty = true; h.context.setConceptStatus("未保存", "dirty");
  assert.equal(h.context.elements.conceptMemoStatus.textContent, "反映中・未保存あり");
  h.context.setConceptStatus("競合あり", "error");
  assert.equal(h.context.elements.conceptMemoStatus.textContent, "競合あり");
});

test("自動反映失敗と追加入力が重なっても失敗バッヂを未保存だけの表示で消さない", async () => {
  const h = harness(); enableLinkedNote(h);
  h.state.provider.writeText = async () => {
    h.state.currentNote.data.groups[0].items[0].memo.body = "反映待ち中の追記";
    h.state.dirty = true;
    throw new Error("offline");
  };
  await h.context.saveCurrentNote();
  assert.equal(h.state.dirty, true);
  assert.deepEqual(h.state.noteStatuses.at(-1), ["ノート保存済み・反映失敗", "error"]);
  assert.equal(h.state.syncing, false);
});
test("項目メモはバックアップ完了を待たず構想へ反映し、最後まで移動を保護する", async () => {
  const h = harness(); enableLinkedNote(h);
  const wait = pendingReflection(), reflected = pendingReflection();
  h.context.maybeCreateWebAutomaticBackup = async () => wait.promise;
  const write = h.state.provider.writeText;
  h.state.provider.writeText = async (...args) => { const result = await write(...args); if (args[0].id === "concept-file") reflected.resolve(); return result; };
  const saving = h.context.saveCurrentNote({ automatic: true });
  await reflected.promise;
  assert.equal(h.context.canDiscardDraft(), false);
  assert.equal(h.state.noteConceptSyncPending, true);
  wait.resolve(); await saving;
  assert.equal(h.state.noteStatuses.at(-1)[0], "保存済み");
});
test("構想メモはバックアップ待ち中に項目へ反映し、同期後のバックアップ待ちも保護する", async () => {
  const h = harness(); h.state.currentConceptMemo.body = "並行反映";
  const wait = pendingReflection(), reflected = pendingReflection(); let backups = 0;
  h.context.maybeCreateWebAutomaticBackup = async () => { if (++backups === 1) await wait.promise; };
  const write = h.context.writeTextWithBaseline;
  h.context.writeTextWithBaseline = async (...args) => { const result = await write(...args); if (h.writes.some(([id]) => id === "note-file")) reflected.resolve(); return result; };
  const saving = h.context.saveCurrentConceptMemo({ automatic: true });
  await reflected.promise;
  // Let the completed sync return to the outer backup wait.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.item.memo.body, "並行反映");
  assert.equal(h.state.saving, true);
  assert.equal(h.context.canDiscardDraft(), false);
  assert.equal(h.state.conceptStatuses.at(-1)[0], "バックアップ中…");
  h.state.currentConceptMemo.body = "待機中の追記"; h.state.dirty = true;
  wait.resolve(); await saving;
  assert.equal(h.state.conceptStatuses.at(-1)[0], "未保存");
  assert.ok(h.state.scheduled > 0);
});

test("バックアップが先に完了しても構想の反映完了までは移動を保護する", async () => {
  const h = harness(); h.state.currentConceptMemo.body = "反映待ち";
  const wait = pendingReflection(), entered = pendingReflection(), find = h.context.findConceptSourceEntry;
  h.context.findConceptSourceEntry = async (...args) => { entered.resolve(); await wait.promise; return find(...args); };
  const saving = h.context.saveCurrentConceptMemo({ automatic: true }); await entered.promise;
  assert.equal(h.context.canDiscardDraft(), false);
  assert.equal(h.state.conceptSyncPending, true);
  wait.resolve(); await saving;
  assert.equal(h.state.conceptStatuses.at(-1)[0], "保存済み");
});
test("バックアップ失敗時も構想から項目への反映を完了して通知する", async () => {
  const h = harness(); h.state.currentConceptMemo.body = "本文保存と反映は成功";
  h.context.maybeCreateWebAutomaticBackup = async () => { throw new Error("backup offline"); };
  await h.context.saveCurrentConceptMemo({ automatic: true });
  assert.equal(h.item.memo.body, "本文保存と反映は成功");
  assert.equal(h.state.conceptStatuses.at(-1)[0], "保存済み");
  assert.ok(h.notices.some(([message]) => /バックアップを作成できませんでした/.test(message)));
});
