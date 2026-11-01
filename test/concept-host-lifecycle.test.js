const test = require("node:test");
const assert = require("node:assert/strict");
const { createConceptHostHarness } = require("./fixtures/concept-host-harness.cjs");
const { createConceptMemoPanelLifecycle } = require("../src/views/concept-memo/host-lifecycle");
const draft = (body, revision = "initial") => ({ payload: { storageRevision: revision, memos: [{ id: "memo", type: "text", body }], folders: [], commonTodoItems: [] } });
const writes = (h) => h.events.filter(([type]) => type === "write");
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }

test("実ホストは自動保存の連打を最後の入力にまとめ、手動保存は待機タイマーを取り消す", async () => {
  const h = createConceptHostHarness(), p = await h.open();
  await p.receive({ type: "scheduleConceptMemosSave", ...draft("一度目") });
  await p.receive({ type: "scheduleConceptMemosSave", ...draft("最新") });
  assert.equal(h.jobs.size, 1); await h.tick();
  assert.equal(writes(h).length, 1); assert.equal(h.data.memos[0].body, "最新");
  await p.receive({ type: "scheduleConceptMemosSave", ...draft("待機中", h.data.storageRevision) });
  await p.receive({ type: "saveConceptMemos", ...draft("手動", h.data.storageRevision) });
  assert.equal(h.jobs.size, 0); await h.tick();
  assert.equal(writes(h).length, 2); assert.equal(h.data.memos[0].body, "手動");
});

test("通常のタブ終了は受け付け済み自動保存を一度完了し、閉じた画面へ応答しない", async () => {
  const h = createConceptHostHarness(), p = await h.open();
  await p.receive({ type: "scheduleConceptMemosSave", ...draft("最後の入力") });
  p.dispose(); await h.settle(); await h.tick();
  assert.equal(h.jobs.size, 0); assert.equal(writes(h).length, 1);
  assert.equal(h.data.memos[0].body, "最後の入力");
  assert.equal(h.events.filter(([type]) => type === "settingsDisposed").length, 1);
  assert.equal(h.events.some(([type]) => type === "post"), false);
});

test("未保存で閉じる確認は待機保存を破棄し、キャンセルなら自動保存を継続する", async () => {
  for (const choice of ["閉じる", "キャンセル"]) {
    const h = createConceptHostHarness({ confirm: async () => choice }), p = await h.open();
    await p.receive({ type: "scheduleConceptMemosSave", ...draft("未保存") });
    await p.receive({ type: "confirmCloseConceptMemos", payload: { isDirty: true } });
    await h.tick();
    assert.equal(writes(h).length, choice === "閉じる" ? 0 : 1);
  }
});

test("保存途中でタブを閉じても受け付け済みの保存とバックアップを完了する", async () => {
  const gate = deferred(), h = createConceptHostHarness({ write: () => gate.promise }), p = await h.open();
  const saving = p.receive({ type: "saveConceptMemos", ...draft("保存途中") });
  await h.settle(); assert.equal(writes(h).length, 1); p.dispose(); gate.resolve(); await saving;
  assert.equal(h.data.memos[0].body, "保存途中");
  assert.equal(h.events.some(([type]) => type === "backup"), true);
  assert.equal(h.events.some(([type]) => type === "post"), false);
});

test("更新確認の待機中に閉じたタブは、確認結果から追加保存しない", async () => {
  const gate = deferred(), h = createConceptHostHarness({ confirm: () => gate.promise }), p = await h.open();
  const refreshing = p.receive({ type: "requestRefreshConceptMemos", dirty: true, ...draft("変更") });
  await h.settle(); p.dispose(); gate.resolve("保存して更新"); await refreshing;
  assert.equal(writes(h).length, 0);
  assert.equal(h.events.filter(([type]) => type === "read").length, 1);
});

test("再読込中に閉じたタブへ表示やタイトルの更新を続けない", async () => {
  const gate = deferred(); let delayed = false;
  const h = createConceptHostHarness({ read: () => delayed ? gate.promise : { storageRevision: "initial", memos: [] } });
  const p = await h.open(); delayed = true;
  const refreshing = p.receive({ type: "requestRefreshConceptMemos" });
  await h.settle(); p.dispose(); gate.resolve({ storageRevision: "next", memos: [] }); await refreshing;
  assert.equal(h.events.some(([type]) => type === "post"), false);
});

test("自動保存OFFはタイマーを解除し、閉じたタブの設定変更・操作は無視する", async () => {
  const h = createConceptHostHarness(), p = await h.open();
  await p.receive({ type: "scheduleConceptMemosSave", ...draft("待機") });
  h.changeSetting("webviewAutoSaveEnabled", false); assert.equal(h.jobs.size, 0);
  await p.receive({ type: "scheduleConceptMemosSave", ...draft("OFF中") });
  p.dispose(); const count = h.events.length;
  h.changeSetting("webviewAutoSaveEnabled", true);
  await p.receive({ type: "createMemo" }); await p.receive({ type: "saveConceptMemos", ...draft("終了後") });
  await h.tick(); assert.equal(h.events.length, count); assert.equal(writes(h).length, 0);
});

test("バックアップ復元後に元タブが閉じても、画面応答を省いて集計更新を完了する", async () => {
  const gate = deferred(); let delayed = false;
  const h = createConceptHostHarness({ restore: true, read: () => delayed ? gate.promise : { storageRevision: "initial", memos: [] } });
  const p = await h.open(); delayed = true;
  const restoring = p.receive({ type: "openConceptMemoBackupHistory" });
  await h.settle(); p.dispose(); gate.resolve({ storageRevision: "restored", memos: [] }); await restoring;
  assert.equal(h.events.some(([type]) => type === "post"), false);
  assert.equal(h.events.filter(([type]) => type === "stats").length, 1);
});

test("手動保存の失敗は従来のエラー応答を返し、その後の保存を妨げない", async () => {
  let fail = true;
  const h = createConceptHostHarness({ write: async () => { if (fail) throw Error("write failed"); } }), p = await h.open();
  await p.receive({ type: "saveConceptMemos", ...draft("失敗") });
  assert.ok(h.events.some(([type, value]) => type === "post" && value.type === "conceptMemosSaveError"));
  fail = false; await p.receive({ type: "saveConceptMemos", ...draft("再試行") });
  assert.equal(h.data.memos[0].body, "再試行");
});

test("バックアップ前の保存失敗も未処理例外にせず、バックアップを開かない", async () => {
  const h = createConceptHostHarness({ write: async () => { throw Error("write failed"); } }), p = await h.open();
  await p.receive({ type: "openConceptMemoBackupHistory", dirty: true, ...draft("未保存") });
  assert.equal(h.events.some(([type]) => type === "history"), false);
  assert.ok(h.events.some(([type, value]) => type === "post" && value.type === "showToast" && value.isError));
});

test("Webviewへの送信失敗は同期throw・非同期rejectとも処理し、終了後は送信しない", async () => {
  for (const send of [() => { throw Error("disposed"); }, () => Promise.reject(Error("disposed"))]) {
    let calls = 0;
    const lifecycle = createConceptMemoPanelLifecycle({ webview: { postMessage() { calls++; return send(); } } });
    assert.equal(await lifecycle.postMessage({}), false);
    lifecycle.dispose(); assert.equal(await lifecycle.postMessage({}), false); assert.equal(calls, 1);
  }
});
