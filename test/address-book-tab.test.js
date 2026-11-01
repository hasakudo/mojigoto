const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const Module = require("node:module");
const vm = require("node:vm");
const { getAddressBookScript } = require("../src/views/note-webview/script-address-book");
let mode = "multi", workspaceRoot = "", activePath = "";
const created = [];
function panel() {
  const disposals = [], listeners = [];
  return { messages: [], webview: {
    postMessage(message) { this.owner.messages.push(structuredClone(message)); },
    onDidReceiveMessage(listener) { listeners.push(listener); },
  }, onDidDispose(listener) { disposals.push(listener); }, reveal() { this.revealed = true; },
  dispose() { disposals.forEach((listener) => listener()); },
  receive(message) { return Promise.all(listeners.map((listener) => listener(message))); },
  };
}
function newPanel() { const p = panel(); p.webview.owner = p; return p; }
const originalLoad = Module._load;
let store, createAddressBookSession, openAddressBook;
try {
  Module._load = function (request, parent, isMain) {
    if (request === "vscode") return {
      workspace: {
        get workspaceFolders() { return [{ uri: { fsPath: workspaceRoot } }]; },
        getConfiguration: () => ({ get: (key, fallback) => key === "mode" ? mode : fallback }),
      },
      Uri: { file: (fsPath) => ({ fsPath }) }, ViewColumn: { Active: 1, Beside: 2 },
      window: {
        get activeTextEditor() { return { document: { uri: { fsPath: activePath } } }; },
        createWebviewPanel(_kind, title, column) { const p = newPanel(); Object.assign(p, { title, column }); created.push(p); return p; },
        showWarningMessage: async () => undefined, showErrorMessage: (message) => assert.fail(message),
      },
    };
    return originalLoad.call(this, request, parent, isMain);
  };
  store = require("../src/data/address-book-store");
  ({ createAddressBookSession } = require("../src/views/address-book-session"));
  ({ openAddressBook } = require("../src/views/address-book-webview"));
} finally { Module._load = originalLoad; }

async function fixture(t) {
  const root = path.resolve(__dirname, "../.review-baseline/test-temp");
  await fs.mkdir(root, { recursive: true });
  const dir = await fs.mkdtemp(path.join(root, "address-tab-"));
  t.after(async () => {
    assert.ok(path.resolve(dir).startsWith(root + path.sep));
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
}
const loadMessage = (requestId = "load") => ({ type: "requestAddressBook", requestId });

test("同じ作品の別画面へ保存を通知し、古い一覧による上書きを止める", async (t) => {
  const dir = await fixture(t), a = newPanel(), b = newPanel(), c = newPanel();
  const first = createAddressBookSession(a, dir), second = createAddressBookSession(b, dir);
  const other = createAddressBookSession(c, path.join(dir, "other"));
  t.after(() => [a, b, c].forEach((p) => p.dispose()));
  await first.handle(loadMessage()); await second.handle(loadMessage());
  const base = b.messages.at(-1).book;
  const payload = { ...base, firstPerson: { p: "私" } };
  await first.handle({ type: "saveAddressBook", requestId: 1, payload });
  assert.equal(a.messages.at(-1).type, "addressBookSaved");
  assert.equal(b.messages.at(-1).type, "addressBookUpdated");
  assert.equal(c.messages.length, 0);
  await second.handle({ type: "saveAddressBook", requestId: 2, payload: { ...base, firstPerson: { p: "古い入力" } } });
  assert.equal(b.messages.at(-1).type, "addressBookFailed");
  assert.equal(b.messages.at(-1).conflict, true);
  assert.equal((await store.loadWorkAddressBook(dir)).book.firstPerson.p, "私");
  first.dispose(); second.dispose(); other.dispose();
});

test("保存は実ファイルの版も照合し、同時保存の一方と外部変更後の保存を止める", async (t) => {
  const dir = await fixture(t), base = (await store.loadWorkAddressBook(dir)).book;
  const results = await Promise.allSettled([
    store.saveWorkAddressBook(dir, { ...base, firstPerson: { p: "A" } }),
    store.saveWorkAddressBook(dir, { ...base, firstPerson: { p: "B" } }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.find((result) => result.status === "rejected").reason.code, "conflict");
  const loaded = (await store.loadWorkAddressBook(dir)).book;
  const file = store.getAddressBookPath(dir);
  const external = JSON.stringify({ characters: [], firstPerson: { p: "外部" } });
  await fs.writeFile(file, external);
  await assert.rejects(store.saveWorkAddressBook(dir, loaded), { code: "conflict" });
  assert.equal(await fs.readFile(file, "utf8"), external);
  await fs.writeFile(file, "{broken");
  await assert.rejects(store.loadWorkAddressBook(dir), SyntaxError);
});

test("明示した作品はモード・現在の作品の変更後も同じ保存先と候補を使う", async (t) => {
  const dir = await fixture(t);
  const a = path.join(dir, "A"), b = path.join(dir, "B");
  await fs.mkdir(path.join(a, ".mojigoto", "references"), { recursive: true });
  await fs.writeFile(path.join(a, ".mojigoto", "references", "note.json"), JSON.stringify({ id: "a", groups: [{ id: "g", title: "Aの人物", items: [] }] }));
  workspaceRoot = b; mode = "single";
  const loaded = await store.loadWorkAddressBook(a);
  assert.equal(loaded.candidates[0].label, "Aの人物");
  mode = "multi";
  await store.saveWorkAddressBook(a, { ...loaded.book, firstPerson: { p: "私" } });
  assert.equal((await store.loadWorkAddressBook(a)).book.firstPerson.p, "私");
  await assert.rejects(fs.access(path.join(b, ".mojigoto", "address-book.json")), { code: "ENOENT" });
});

test("読み直しの取消と破棄確認、保存後の通知解除、書き出しは保存版を維持する", async (t) => {
  const dir = await fixture(t), p = newPanel();
  let confirm = false;
  const session = createAddressBookSession(p, dir, { confirmReload: async () => confirm });
  await session.handle({ ...loadMessage(), dirty: true });
  assert.equal(p.messages.length, 0);
  confirm = true;
  await session.handle({ ...loadMessage(), dirty: true });
  const loaded = p.messages.at(-1).book;
  const saved = await store.saveWorkAddressBook(dir, loaded);
  assert.equal((await session.exportBook({ payload: saved })).storageRevision, saved.storageRevision);
  assert.equal((await store.loadWorkAddressBook(dir)).book.storageRevision, saved.storageRevision);
  await assert.rejects(session.exportBook({ payload: loaded }), /更新されています/);
  p.dispose(); const count = p.messages.length;
  await store.saveWorkAddressBook(dir, saved);
  assert.equal(p.messages.length, count);
});

test("ノート指定の作品を隣のタブで開き、同じ作品のタブを再利用・閉鎖後再作成する", async (t) => {
  const dir = await fixture(t), ctx = { globalState: { get: () => "別作品" } };
  activePath = path.join(dir, "別作品", "manuscript", "file.txt");
  const options = { workDir: path.join(dir, "対象"), workTitle: "対象作品", viewColumn: 2 };
  const before = created.length;
  await openAddressBook(ctx, options);
  const p = created.at(-1);
  assert.equal(p.column, 2); assert.equal(p.title, "呼び名一覧: 対象作品");
  assert.ok(p.webview.html.includes("addressReloadBtn"));
  await openAddressBook(ctx, options);
  assert.equal(created.length, before + 1);
  assert.ok(p.revealed);
  assert.equal(p.messages.at(-1).type, "addressBookRefreshRequested");
  p.dispose();
  await openAddressBook(ctx, options);
  assert.equal(created.length, before + 2);
  created.at(-1).dispose();
});

function client(standalone = false) {
  const messages = [], timers = new Map();
  let serial = 0;
  const values = {
    makeId: () => "id", esc: String, addressStatusEl: { textContent: "" }, addressVisibleIds: new Set(),
    vscode: { postMessage: (message) => messages.push(structuredClone(message)) },
    setTimeout(fn) { timers.set(++serial, fn); return serial; }, clearTimeout(id) { timers.delete(id); },
  };
  const context = vm.createContext(values);
  vm.runInContext(getAddressBookScript({ standalone }) + '\nrenderAddressBook = () => {};', context);
  const run = (code) => vm.runInContext(code, context);
  const receive = (message) => { context.message = message; run("handleAddressBookMessage(message)"); };
  run("requestAddressBookLoad()");
  receive({ type: "addressBookLoaded", requestId: messages.at(-1).requestId, book: { characters: [], firstPerson: { p: "元" }, storageRevision: "base" } });
  return { run, receive, messages, values, context, edit(text) { context.text = text; run("workAddressBookState.firstPerson.p = text; scheduleAddressBookSave()"); },
    flush() { run("flushAddressBookSave()"); }, state() { return JSON.parse(run("JSON.stringify(workAddressBookState)")); } };
}

test("保存中の追加入力を古い保存結果で戻さず、次の保存に新しい版を渡す", () => {
  const c = client(); c.edit("最初"); c.flush();
  const first = c.messages.at(-1);
  c.edit("追加入力");
  c.receive({ type: "addressBookSaved", requestId: first.requestId, book: { firstPerson: { p: "最初" }, storageRevision: "first" } });
  assert.equal(c.state().firstPerson.p, "追加入力");
  const next = c.messages.at(-1);
  assert.equal(next.payload.firstPerson.p, "追加入力");
  assert.equal(next.payload.storageRevision, "first");
  c.receive({ type: "addressBookSaved", requestId: next.requestId, book: { storageRevision: "next" } });
  assert.equal(c.run("addressBookDirty()"), false);
});

test("別タブと書き出し・閉じるは保存を待ち、失敗時は操作を止め入力を保持する", () => {
  for (const action of ["openAddressBookTab", "exportAddressBook", "close"]) {
    const c = client(); c.edit("保存する入力"); c.run(`requestAddressBookAction({ type: '${action}' })`);
    const save = c.messages.at(-1);
    assert.equal(save.type, "saveAddressBook");
    c.receive({ type: "addressBookSaved", requestId: save.requestId, book: { storageRevision: "saved" } });
    assert.equal(c.messages.at(-1).type, action);
    assert.equal(c.messages.at(-1).payload.storageRevision, "saved");
  }
  const c = client(); c.edit("残す入力"); c.run("requestAddressBookAction({ type: 'openAddressBookTab' })");
  const save = c.messages.at(-1);
  c.receive({ type: "addressBookFailed", operation: "saveAddressBook", requestId: save.requestId, conflict: true });
  const count = c.messages.length;
  c.flush();
  assert.equal(c.messages.length, count);
  assert.equal(c.state().firstPerson.p, "残す入力");
  assert.match(c.values.addressStatusEl.textContent, /コピーしてから/);
});

test("別画面の保存は未編集時だけ反映し、編集中は古い読み直し応答も採用しない", () => {
  const c = client();
  c.receive({ type: "addressBookUpdated", book: { firstPerson: { p: "他の画面" }, storageRevision: "other" } });
  assert.equal(c.state().firstPerson.p, "他の画面");
  c.run("requestAddressBookLoad()"); const load = c.messages.at(-1);
  c.edit("手元の入力");
  c.receive({ type: "addressBookLoaded", requestId: load.requestId, book: { firstPerson: { p: "古い読込" } } });
  c.receive({ type: "addressBookUpdated", book: { firstPerson: { p: "別の保存" } } });
  assert.equal(c.state().firstPerson.p, "手元の入力");
  const count = c.messages.length;
  c.receive({ type: "addressBookRefreshRequested" });
  assert.equal(c.messages.length, count);
});

test("後から届いた読込で別画面の最新保存を戻さず、確認後の再読込で保存停止を解除する", () => {
  const c = client(); c.run("requestAddressBookLoad()"); const old = c.messages.at(-1);
  c.receive({ type: "addressBookUpdated", book: { firstPerson: { p: "最新" }, storageRevision: "latest" } });
  c.receive({ type: "addressBookLoaded", requestId: old.requestId, book: { firstPerson: { p: "古い" } } });
  assert.equal(c.state().firstPerson.p, "最新");
  c.edit("競合入力"); c.flush();
  c.receive({ type: "addressBookFailed", operation: "saveAddressBook", requestId: c.messages.at(-1).requestId, conflict: true });
  c.run("requestAddressBookLoad()");
  c.receive({ type: "addressBookLoaded", requestId: c.messages.at(-1).requestId, book: { storageRevision: "reload", firstPerson: { p: "最新" } } });
  assert.equal(c.run("addressBookSaveBlocked"), false);
  c.edit("再編集"); c.flush();
  assert.equal(c.messages.at(-1).payload.storageRevision, "reload");
});

test("独立タブの閉じるは保存失敗でも一覧を隠さず、読込前の未編集画面も閉じられる", () => {
  const c = client(true), listeners = [];
  const controls = ["addressAddBtn", "addressCandidateSelect", "addressCandidateSearch", "addressSourceReference", "addressSourcePlot", "addressKindGroup", "addressKindDivider", "addressKindItem", "addressDividerNameSource", "addressPreviewBtn", "closeAddressPreviewBtn", "addressPreviewPanel", "addressFocusSelect", "addressShowAllBtn", "addressMatrixRoot", "addressExportHtmlBtn", "addressExportCsvBtn"];
  controls.forEach((name) => { c.context[name] = null; });
  c.context.document = { getElementById: () => null, addEventListener() {} };
  c.context.window = { addEventListener() {} };
  c.context.closeAddressBookBtn = { addEventListener(_name, listener) { listeners.push(listener); } };
  c.context.addressBookPanel = { hidden: false, addEventListener() {} };
  c.run("registerAddressBookEvents()");
  c.edit("消さない入力");
  listeners[0]();
  assert.equal(c.context.addressBookPanel.hidden, false);
  const save = c.messages.at(-1);
  assert.equal(save.type, "saveAddressBook");
  c.receive({ type: "addressBookFailed", operation: "saveAddressBook", requestId: save.requestId, conflict: true });
  assert.equal(c.context.addressBookPanel.hidden, false);
  assert.equal(c.state().firstPerson.p, "消さない入力");
  const empty = client(true);
  empty.run("addressBookLoaded = false; requestAddressBookAction({ type: 'close' })");
  assert.equal(empty.messages.at(-1).type, "close");
});
