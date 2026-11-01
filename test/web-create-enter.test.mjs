import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bindCreateDialogForm } from "../web/lib/create-dialog-form.mjs";

function fixture() {
  const node = () => ({ open: true, listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; }, close() { this.open = false; } });
  const form = node(), dialog = node(), cancel = node();
  form.querySelector = () => cancel;
  let busy = false;
  bindCreateDialogForm({ form, dialog, isBusy: () => busy });
  const event = (extra = {}) => ({ prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...extra });
  return { form, dialog, cancel, event, setBusy(value) { busy = value; } };
}

test("新規作成3フォームは作成だけをsubmitにし、閉じるを独立させる", async () => {
  const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
  for (const kind of ["File", "Folder", "Note"]) {
    const form = html.match(new RegExp('<form id="new' + kind + 'Form"[^]*?</form>'))?.[0];
    assert.ok(form);
    assert.match(form, /<button[^>]*type="button"[^>]*value="cancel"/);
    assert.match(form, /<button[^>]*type="submit"[^>]*value="create"/);
  }
});
test("通常のEnterはブラウザのフォーム送信へ渡す", () => {
  const h = fixture(), e = h.event({ key: "Enter" });
  h.form.listeners.keydown(e);
  assert.equal(e.prevented, false);
});
for (const mode of ["composition", "isComposing", "keyCode229"]) {
  test("日本語変換確定のEnterを作成へ渡さない: " + mode, () => {
    const h = fixture();
    if (mode === "composition") h.form.listeners.compositionstart();
    const e = h.event({ key: "Enter", isComposing: mode === "isComposing", keyCode: mode === "keyCode229" ? 229 : 13 });
    h.form.listeners.keydown(e);
    assert.equal(e.prevented, true);
  });
}
test("変換中のsubmitも止め、変換後は送信できる", () => {
  const h = fixture();
  h.form.listeners.compositionstart();
  const during = h.event(); h.form.listeners.submit(during);
  assert.equal(during.prevented, true);
  assert.equal(during.stopped, true);
  h.form.listeners.compositionend();
  const after = h.event(); h.form.listeners.submit(after);
  assert.equal(after.prevented, false);
});
test("閉じるとEscapeは作成処理を送信せず、作成中は閉じない", () => {
  const h = fixture(); h.setBusy(true);
  h.cancel.listeners.click(); assert.equal(h.dialog.open, true);
  const e = h.event(); h.dialog.listeners.cancel(e); assert.equal(e.prevented, true);
  h.setBusy(false); h.cancel.listeners.click(); assert.equal(h.dialog.open, false);
});
test("閉鎖後は変換状態を戻すが、遅いcloseで再オープン中の状態を消さない", () => {
  const h = fixture(); h.form.listeners.compositionstart();
  h.dialog.listeners.close(); const open = h.event({ key: "Enter" }); h.form.listeners.keydown(open);
  assert.equal(open.prevented, true);
  h.dialog.open = false; h.dialog.listeners.close();
  const closed = h.event({ key: "Enter" }); h.form.listeners.keydown(closed);
  assert.equal(closed.prevented, false);
});


test("フォルダ一覧の取得中にEnterを連打しても作成は一度だけ", async () => {
  const { default: vm } = await import("node:vm");
  const source = await readFile(new URL("../web/app.mjs", import.meta.url), "utf8");
  const start = source.indexOf('elements.newFolderForm.addEventListener("submit"');
  const end = source.indexOf('async function collectManuscriptMoveDestinations', start);
  let submit, release, lists = 0, creates = 0;
  const wait = new Promise((resolve) => { release = resolve; });
  const elements = { newFolderForm: { addEventListener(_name, fn) { submit = fn; } },
    newFolderError: {}, createFolderButton: {}, newFolderNameInput: { value: "新規章" }, newFolderDialog: { close() {} } };
  const state = { manuscriptFolder: { id: "parent" }, manuscriptTrail: [], provider: {
    listChildren: async () => { lists++; await wait; return []; },
    createFolder: async (_parent, name) => { creates++; return { id: "new", name, folder: {} }; },
  } };
  vm.runInNewContext("let creatingFolder = false;" + source.slice(start, end), {
    state, elements, normalizeManuscriptFolderName: (name) => name,
    setBusy: (button, busy) => { button.disabled = busy; }, invalidateFolderListing() {},
    openManuscriptFolder: async () => {}, notify() {},
  });
  const event = () => ({ preventDefault() {} });
  const first = submit(event()); await submit(event());
  assert.equal(lists, 1);
  assert.equal(elements.createFolderButton.disabled, true);
  release(); await first;
  assert.equal(creates, 1);
  assert.equal(elements.createFolderButton.disabled, false);
});
