const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createAddressClientHarness, createAddressHostHarness } = require("./fixtures/address-book-harness.cjs");
const character = (id, label) => ({ id, noteType: "reference", noteId: "note", sourceKind: "item", sourceId: id, label });
const book = () => ({ storageRevision: "base", characters: [character("a", '長い名前<&"'), character("b", "相手")], firstPerson: { a: "私" }, calls: { "a::b": "あなた", "b::a": "私" } });
const candidate = (sourceKind, sourceId, noteType = "reference") => ({ key: `${noteType}:note:${sourceKind}:${sourceId}`, noteType, noteId: "note", sourceKind, sourceId,
  label: sourceId, dividerLabel: "役職", dividerValue: "王様", path: "人物/分類", noteTitle: "人物", groupTitle: "分類" });

test("行・列の絞り込みと全体プレビューは表示範囲を分け、名前の省略用タイトルと呼び名を保つ", () => {
  const h = createAddressClientHarness(); h.load(book());
  assert.match(h.node("addressMatrixRoot").innerHTML, /title="長い名前&lt;&amp;&quot;"/);
  assert.equal(h.node("addressMatrixRoot").querySelectorAll("[data-address-from]").length, 4);
  const checkbox = h.node("addressVisibleOptionsEl").querySelectorAll("[data-address-visible-id]")[1];
  checkbox.checked = false; checkbox.handlers.change();
  assert.equal(h.node("addressMatrixRoot").querySelectorAll("[data-address-from]").length, 1);
  h.node("addressFocusSelect").value = "b"; h.node("addressFocusSelect").handlers.change();
  const input = h.node("addressMatrixRoot").querySelectorAll("[data-address-from]")[0];
  assert.equal(input.dataset.addressFrom, "b"); assert.equal(input.dataset.addressTo, "a");
  h.node("addressPreviewBtn").handlers.click();
  assert.equal(h.node("addressPreviewPanel").hidden, false);
  assert.match(h.node("addressPreviewRoot").innerHTML, /あなた/);
  assert.match(h.node("addressPreviewRoot").innerHTML, /長い名前&lt;&amp;&quot;/);
  h.node("addressShowAllBtn").handlers.click();
  assert.equal(h.run("addressVisibleIds.size"), 2);
  assert.equal(h.messages.filter(m => m.type === "saveAddressBook").length, 0);
});

test("候補は登録済み人物・ノート種別・分類種類・検索と区分名の選択を反映する", () => {
  const h = createAddressClientHarness();
  h.load(book(), [candidate("item", "a"), candidate("divider", "divider"), candidate("group", "group", "plot")]);
  assert.match(h.node("addressCandidateCount").textContent, /候補 1件/);
  assert.match(h.node("addressCandidateSelect").innerHTML, /王様/);
  h.node("addressDividerNameSource").value = "label"; h.node("addressDividerNameSource").handlers.change();
  assert.match(h.node("addressCandidateSelect").innerHTML, /：役職/);
  h.node("addressCandidateSearch").value = "人物 役職"; h.node("addressCandidateSearch").handlers.input();
  assert.match(h.node("addressCandidateCount").textContent, /候補 1件/);
  h.node("addressKindDivider").checked = false; h.node("addressKindDivider").handlers.change();
  assert.match(h.node("addressCandidateCount").textContent, /候補 0件/);
  h.node("addressCandidateSearch").value = ""; h.node("addressSourcePlot").checked = true; h.node("addressSourcePlot").handlers.change();
  assert.match(h.node("addressCandidateSelect").innerHTML, /group/);
});

test("セル入力は一人称と呼び方を区別し、連続入力を最新の1回にまとめて保存する", () => {
  const h = createAddressClientHarness(); h.load(book());
  const cells = h.node("addressMatrixRoot").querySelectorAll("[data-address-from]");
  const self = cells.find(input => input.dataset.addressFrom === "a" && input.dataset.addressTo === "a");
  self.value = "僕"; self.handlers.input();
  const call = cells.find(input => input.dataset.addressFrom === "a" && input.dataset.addressTo === "b");
  call.value = "君"; call.handlers.input(); call.value = "あなたさま"; call.handlers.input();
  assert.equal(h.timers.size, 1);
  h.tick();
  const save = h.messages.at(-1);
  assert.equal(save.type, "saveAddressBook"); assert.equal(save.payload.firstPerson.a, "僕");
  assert.equal(save.payload.calls["a::b"], "あなたさま"); assert.equal(save.payload.storageRevision, "base");
  self.value = ""; self.handlers.input();
  h.receive({ type: "addressBookSaved", requestId: save.requestId, book: { storageRevision: "saved" } });
  assert.equal(h.messages.at(-1).payload.storageRevision, "saved");
  assert.equal(Object.hasOwn(h.messages.at(-1).payload.firstPerson, "a"), false);
});

test("呼び名候補の非表示・復帰と候補入力は、入力済みセルを不用意に変更しない", () => {
  const h = createAddressClientHarness(); h.load(book());
  const hidden = h.node("addressTermManagerList").querySelectorAll("[data-address-term-action]").find(button => button.dataset.addressTerm === "私");
  hidden.handlers.click();
  assert.deepEqual(h.state().hiddenTerms, ["私"]); assert.equal(h.state().firstPerson.a, "私");
  const restore = h.node("addressTermManagerList").querySelectorAll("[data-address-term-action]").find(button => button.dataset.addressTerm === "私");
  assert.equal(restore.dataset.addressTermAction, "restore"); restore.handlers.click();
  const input = h.node("addressMatrixRoot").querySelectorAll("[data-address-from]")[0];
  input.value = "僕"; input.handlers.focus();
  const pick = h.node("addressTermPicker").querySelectorAll("[data-address-term-pick]")[0];
  assert.equal(pick.dataset.addressTermPick, "僕"); pick.handlers.click();
  assert.equal(h.state().firstPerson.a, "僕"); assert.equal(h.node("addressTermPicker").hidden, true);
});

test("下の行の候補は入力欄の上へ開き、入力欄と画面端に重ならない", () => {
  for (const standalone of [false, true]) {
    const h = createAddressClientHarness({ standalone }); h.load(book());
    const input = h.node("addressMatrixRoot").querySelectorAll("[data-address-from]")[0];
    const picker = h.node("addressTermPicker");
    const rect = { left: 700, top: 490, bottom: 520, width: 200, height: 30 };
    input.getBoundingClientRect = () => rect;
    picker.getBoundingClientRect = () => ({ height: 220 });
    input.handlers.focus();
    assert.equal(picker.hidden, false);
    const top = Number.parseFloat(picker.style.top), left = Number.parseFloat(picker.style.left);
    assert.ok(top + 220 <= rect.top - 4);
    assert.ok(top >= 8); assert.ok(left >= 8);
    assert.ok(left + Number.parseFloat(picker.style.width) <= 792);
    input.value = "僕"; input.handlers.input();
    assert.equal(h.state().firstPerson.a, "僕");
    assert.ok(Number.parseFloat(picker.style.top) + 220 <= rect.top - 4);
  }
});

test("候補は空きに応じて下側・上側・高さ制限を選び、余地がなければ入力を優先する", () => {
  for (const [height, rect, expected] of [
    [600, { top: 50, bottom: 80 }, "below"],
    [600, { top: 490, bottom: 520 }, "above"],
    [260, { top: 115, bottom: 145 }, "below"],
    [260, { top: 150, bottom: 180 }, "above"],
    [70, { top: 20, bottom: 50 }, "hidden"],
  ]) {
    const h = createAddressClientHarness(); h.load(book());
    h.context.window.innerHeight = height; h.context.window.innerWidth = 160;
    const input = h.node("addressMatrixRoot").querySelectorAll("[data-address-from]")[0];
    input.getBoundingClientRect = () => ({ left: -10, width: 200, ...rect });
    const picker = h.node("addressTermPicker"); picker.getBoundingClientRect = () => ({ height: 220 });
    input.handlers.focus();
    if (expected === "hidden") { assert.equal(picker.hidden, true); continue; }
    assert.equal(picker.hidden, false);
    const top = Number.parseFloat(picker.style.top), maximum = Number.parseFloat(picker.style.maxHeight);
    assert.ok(top >= 8); assert.ok(top + maximum <= height - 8);
    assert.ok(expected === "below" ? top >= rect.bottom + 4 : top + maximum <= rect.top - 4);
    assert.equal(Number.parseFloat(picker.style.width), 144);
    assert.equal(Number.parseFloat(picker.style.left), 8);
  }
});

test("人物の追加と削除は候補・表示対象・一人称・両方向の呼び方を更新する", () => {
  const h = createAddressClientHarness(), source = candidate("divider", "new"); h.load(book(), [source]);
  h.node("addressCandidateSelect").value = source.key; h.node("addressAddBtn").handlers.click();
  const added = h.state().characters.at(-1);
  assert.equal(added.label, "王様"); assert.equal(added.dividerNameSource, "value");
  assert.equal(h.run(`addressVisibleIds.has('${added.id}')`), true);
  h.node("addressMatrixRoot").querySelectorAll("[data-address-remove]").find(button => button.dataset.addressRemove === "a").handlers.click();
  assert.equal(h.state().characters.some(person => person.id === "a"), false);
  assert.deepEqual(h.state().firstPerson, {}); assert.deepEqual(h.state().calls, {});
});

test("別タブ・書き出し・閉じるのボタンは保存完了を待ち、競合では入力を保持する", () => {
  for (const standalone of [false, true]) {
    const h = createAddressClientHarness({ standalone }); h.load(book());
    const input = h.node("addressMatrixRoot").querySelectorAll("[data-address-from]")[0]; input.value = "未保存"; input.handlers.input();
    h.node(standalone ? "closeAddressBookBtn" : "addressOpenTabBtn").handlers.click();
    const save = h.messages.at(-1); assert.equal(save.type, "saveAddressBook");
    h.receive({ type: "addressBookSaved", requestId: save.requestId, book: { storageRevision: "new" } });
    assert.equal(h.messages.at(-1).type, standalone ? "close" : "openAddressBookTab");
  }
  const h = createAddressClientHarness(); h.load(book());
  const input = h.node("addressMatrixRoot").querySelectorAll("[data-address-from]")[0]; input.value = "残す"; input.handlers.input();
  h.node("addressExportHtmlBtn").handlers.click(); const save = h.messages.at(-1);
  h.receive({ type: "addressBookFailed", operation: "saveAddressBook", requestId: save.requestId, conflict: true });
  h.tick(); assert.equal(h.messages.at(-1).type, "saveAddressBook"); assert.equal(h.state().firstPerson.a, "残す");
});

test("別タブの再利用・終了・有効な復元と重複復元の破棄を維持する", async () => {
  const h = createAddressHostHarness(); h.register();
  const workDir = path.resolve("/work"), options = { workDir, workTitle: "作品" };
  await h.open(options); const first = h.panels[0];
  await h.open(options); assert.equal(h.panels.length, 1);
  assert.equal(h.events.at(-1)[1].type, "addressBookRefreshRequested");
  const duplicate = h.panel(); await h.serializers[0].deserializeWebviewPanel(duplicate, options);
  assert.equal(duplicate.disposed, true);
  first.dispose(); const restored = h.panel(); await h.serializers[0].deserializeWebviewPanel(restored, options);
  assert.ok(restored.webview.html.includes("呼び名一覧"));
  await h.open(options); assert.equal(h.panels.length, 1);
  const invalid = h.panel(); await h.serializers[0].deserializeWebviewPanel(invalid, { workDir: "relative" });
  assert.equal(invalid.disposed, true);
});

test("作品選択はSingle・作業中の原稿・選択ダイアログの既存優先順を保つ", async () => {
  const a = path.resolve("/works/A"), b = path.resolve("/works/B"), works = [{ name: "A", title: "作品A", fsPath: a }, { name: "B", title: "作品B", fsPath: b }];
  for (const config of [{ single: true, workspaceRoot: a }, { works, activePath: path.join(a, "manuscript", "file.txt") }, { works, pick: items => items[0] }]) {
    const h = createAddressHostHarness(config); await h.open();
    assert.equal(h.events.find(([name]) => name === "session")[1], a);
  }
  const cancelled = createAddressHostHarness({ works, pick: () => undefined }); await cancelled.open();
  assert.equal(cancelled.panels.length, 0); assert.ok(cancelled.events.some(([name]) => name === "warning"));
});

test("ホスト受付は保存セッションへ委譲し、書き出し取消・失敗を通知する", async () => {
  for (const format of ["csv", "html"]) {
    const h = createAddressHostHarness(); await h.open({ workDir: "/work", workTitle: "作品/名前" }); const p = h.panels[0];
    await p.webview.receive({ type: "saveAddressBook", payload: {} });
    await p.webview.receive({ type: "exportAddressBook", format, payload: { storageRevision: "saved" } });
    assert.equal(h.events.find(([name]) => name === "format")[2], format);
    assert.equal(h.events.find(([name]) => name === "write")[2], format + ":作品/名前");
    assert.equal(h.events.at(-1)[1].type, "addressBookExported");
  }
  for (const config of [{ cancelExport: true }, { exportError: Error("競合") }, { writeError: Error("保存失敗") }]) {
    const h = createAddressHostHarness(config); await h.open({ workDir: "/work" });
    await h.panels[0].webview.receive({ type: "exportAddressBook" });
    assert.equal(h.events.some(([name]) => name === "post"), false);
    if (!config.cancelExport) assert.ok(h.events.some(([name]) => name === "error"));
  }
});
