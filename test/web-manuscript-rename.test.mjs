import test from "node:test";
import assert from "node:assert/strict";
import { manuscriptNameParts, renamedManuscriptName, renameManuscriptItem, renameManuscriptReferences, createManuscriptRenameController } from "../web/lib/manuscript-rename.mjs";
import { OneDriveProvider } from "../web/storage/onedrive-provider.mjs";
import { GoogleDriveProvider } from "../web/storage/google-drive-provider.mjs";
import { DropboxProvider } from "../web/storage/dropbox-provider.mjs";

const item = { id: "f", name: "第一話.MD", file: {}, eTag: "1" };
const parent = { id: "p" };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
function providerFixture() {
  const writes = [];
  const provider = {
    getItemMetadata: async () => ({ ...item }), listChildren: async () => [item],
    renameItem: async (source, name) => { writes.push({ source, name }); return { ...source, name, eTag: "2" }; },
  };
  return { provider, writes };
}
const rename = (provider, input = "第二話", extra = {}) => renameManuscriptItem({ provider, item, parent, input, ...extra });

test("原稿名と拡張子を分離し、元の拡張子・大文字小文字を維持する", () => {
  assert.deepEqual(manuscriptNameParts(item), { base: "第一話", extension: ".MD" });
  assert.equal(renamedManuscriptName(item, " 次の話 "), "次の話.MD");
  assert.equal(renamedManuscriptName({ ...item, name: "章.txt" }, "幕"), "幕.txt");
  assert.equal(renamedManuscriptName({ ...item, folder: {}, name: "第一章" }, "第二章"), "第二章");
});
for (const invalid of ["", "..", "../別原稿", "a/b", "a\\b", "末尾.", "nul", "con.txt", "改\n行"]) {
  test("不正な名前を通信前に拒否する: " + JSON.stringify(invalid), async () => {
    const h = providerFixture();
    await assert.rejects(rename(h.provider, invalid));
    assert.equal(h.writes.length, 0);
  });
}
test("変更がなければ通信せず閉じる", async () => {
  const result = await rename({}, "第一話");
  assert.equal(result.changed, false);
});
test("最新の版情報を使い、本文を書き込まず名前だけ変更する", async () => {
  const h = providerFixture();
  h.provider.getItemMetadata = async () => ({ ...item, eTag: "3" });
  const result = await rename(h.provider);
  assert.equal(h.writes[0].source.eTag, "3");
  assert.equal(h.writes[0].name, "第二話.MD");
  assert.equal(result.item.id, item.id);
});
for (const reason of ["duplicate", "renamed", "moved", "stale"]) {
  test("書込前に拒否する: " + reason, async () => {
    const h = providerFixture(); let current = true;
    if (reason === "duplicate") h.provider.listChildren = async () => [item, { id: "other", name: "第二話.md" }];
    if (reason === "renamed") h.provider.getItemMetadata = async () => ({ ...item, name: "外部.MD" });
    if (reason === "moved") h.provider.listChildren = async () => [];
    if (reason === "stale") h.provider.listChildren = async () => { current = false; return [item]; };
    await assert.rejects(rename(h.provider, "第二話", { current: () => current }));
    assert.equal(h.writes.length, 0);
  });
}
test("履歴の名前と階層を更新し、ピン・日時・別作品・ノートを保持する", () => {
  const folder = { id: "chapter", name: "旧章", folder: {} }, saved = { ...folder, name: "新章" };
  const route = { kind: "manuscript-file", workId: "w", item, folder, trail: [folder] };
  const entries = [{ pinned: true, openedAt: "date", route }, { route: { ...route, workId: "other" } }, { route: { ...route, kind: "note-editor" } }];
  const result = renameManuscriptReferences(entries, folder, saved, (e) => e.route.workId === "w");
  assert.equal(result[0].route.trail[0].name, "新章");
  assert.equal(result[0].route.folder.name, "新章");
  assert.equal(result[0].pinned, true);
  assert.equal(result[0].openedAt, "date");
  assert.equal(result[1], entries[1]);
  assert.equal(result[2], entries[2]);
  assert.equal(entries[0].route.folder.name, "旧章");
});

function controllerFixture() {
  const names = ["filesSection", "renameManuscriptTitle", "renameManuscriptInput", "renameManuscriptExtension", "renameManuscriptHelp", "renameManuscriptError", "renameManuscriptForm", "renameManuscriptDialog", "cancelRenameManuscriptButton", "renameManuscriptButton"];
  const elements = Object.fromEntries(names.map((name) => [name, { hidden: false, value: "", listeners: {},
    addEventListener(event, fn) { this.listeners[event] = fn; }, focus() {}, select() {}, showModal() { this.open = true; }, close() { this.open = false; } }]));
  const h = providerFixture(), calls = [], state = { provider: h.provider, selectedWork: {}, workRoot: {}, manuscriptFolder: parent, manuscriptTrail: [] };
  const controller = createManuscriptRenameController({ state, elements, setBusy: (button, busy) => { button.disabled = busy; },
    onRenamed: (before, saved) => calls.push([before, saved]), refresh: async () => {}, notify: () => {} });
  return { ...h, elements, state, calls, controller, submit: () => elements.renameManuscriptForm.listeners.submit({ submitter: { value: "rename" }, preventDefault() {} }) };
}
test("変更中は二重送信・Escapeを防ぎ、完了時に一覧と履歴へ反映する", async () => {
  const h = controllerFixture(), wait = deferred();
  h.provider.renameItem = async (_item, name) => { await wait.promise; return { ...item, name }; };
  h.controller.open(item); h.elements.renameManuscriptInput.value = "新しい話";
  const operation = h.submit();
  let prevented = false;
  h.elements.renameManuscriptDialog.listeners.cancel({ preventDefault() { prevented = true; } });
  await h.submit();
  assert.equal(prevented, true);
  assert.equal(h.state.saving, true);
  assert.equal(h.elements.cancelRenameManuscriptButton.disabled, true);
  wait.resolve(); await operation;
  assert.equal(h.calls.length, 1);
  assert.equal(h.elements.renameManuscriptDialog.open, false);
  assert.equal(h.state.saving, false);
});
test("通信失敗は入力とダイアログを残し、履歴を更新せず再試行できる", async () => {
  const h = controllerFixture();
  h.provider.renameItem = async () => { throw new Error("通信失敗"); };
  h.controller.open(item); h.elements.renameManuscriptInput.value = "再試行"; await h.submit();
  assert.equal(h.elements.renameManuscriptDialog.open, true);
  assert.equal(h.elements.renameManuscriptInput.value, "再試行");
  assert.equal(h.elements.renameManuscriptError.textContent, "通信失敗");
  assert.equal(h.calls.length, 0);
  assert.equal(h.state.saving, false);
});

const auth = { getAccessToken: async () => "synthetic-token" };
test("OneDriveは元ファイルのID・driveIdとIf-Matchで名前だけPATCHする", async () => {
  const calls = [], source = { ...item, parentReference: { driveId: "shared" } };
  const provider = new OneDriveProvider(auth, async (url, options) => {
    calls.push({ url, options }); return { ok: true, json: async () => ({ ...source, name: "次.MD" }) };
  });
  await provider.renameItem(source, "次.MD");
  assert.match(calls[0].url, /drives\/shared\/items\/f$/);
  assert.equal(calls[0].options.headers["If-Match"], "1");
  assert.deepEqual(JSON.parse(calls[0].options.body), { name: "次.MD", "@microsoft.graph.conflictBehavior": "fail" });
});
test("OneDriveは競合を成功扱いにしない", async () => {
  const provider = new OneDriveProvider(auth, async () => ({ ok: false, status: 412, json: async () => ({}) }));
  await assert.rejects(provider.renameItem(item, "次.MD"), { code: "conflict" });
});
test("Google Driveは実ETagで条件付きメタデータ更新し、versionを返す", async () => {
  const calls = [];
  const provider = new GoogleDriveProvider(auth, async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ id: "f", title: options.method === "PATCH" ? "次.MD" : item.name,
      version: options.method === "PATCH" ? "2" : "1", etag: '"real-etag"', mimeType: "text/plain", parents: [{ id: "p" }] }) };
  });
  const saved = await provider.renameItem(item, "次.MD");
  assert.equal(calls[1].options.headers["If-Match"], '"real-etag"');
  assert.deepEqual(JSON.parse(calls[1].options.body), { title: "次.MD" });
  assert.equal(saved.eTag, "2");
  assert.equal(saved.parentReference.id, "p");
});
test("Google Driveの外部更新はPATCH前に停止する", async () => {
  const calls = [];
  const provider = new GoogleDriveProvider(auth, async (_url, options) => {
    calls.push(options); return { ok: true, json: async () => ({ id: "f", title: item.name, version: "9", etag: '"etag"' }) };
  });
  await assert.rejects(provider.renameItem(item, "次.MD"), { code: "conflict" });
  assert.equal(calls.length, 1);
});
test("Dropboxは同じ親へ移動APIで変更し、上書き・自動改名しない", async () => {
  let args;
  const provider = new DropboxProvider(auth, async (_url, options) => {
    args = JSON.parse(options.body);
    return { ok: true, json: async () => ({ metadata: { ".tag": "file", id: "f", name: "次.MD", path_display: "/作品/次.MD", path_lower: "/作品/次.md", rev: "2" } }) };
  });
  const result = await provider.renameItem({ ...item, path_display: "/作品/第一話.MD" }, "次.MD");
  assert.deepEqual(args, { from_path: "f", to_path: "/作品/次.MD", autorename: false });
  assert.equal(result.name, "次.MD");
});
test("Dropboxの大文字小文字だけの改名は通信前に説明を返す", async () => {
  const provider = new DropboxProvider(auth, async () => { throw new Error("通信しない"); });
  await assert.rejects(provider.renameItem({ ...item, name: "Name.txt", path_display: "/Name.txt" }, "name.txt"), /大文字・小文字/);
});

test("OneDriveのフォルダ取得でも種類を取得し、原稿ファイルと誤認しない", async () => {
  const source = { id: "chapter", name: "第一章", folder: {}, eTag: "1" };
  const calls = [];
  const provider = new OneDriveProvider(auth, async (url) => {
    calls.push(url);
    const fields = new URL(url).searchParams.get("select").split(",");
    assert.ok(fields.includes("folder"));
    return { ok: true, json: async () => source };
  });
  provider.listChildren = async () => [source];
  provider.renameItem = async (item, name) => ({ ...item, name });
  const result = await renameManuscriptItem({ provider, item: source, parent, input: "第二章" });
  assert.equal(result.item.name, "第二章");
  assert.ok(result.item.folder);
  assert.equal(calls.length, 1);
});


test("前のcloseイベントが開き直したパネルへ遅れて届いても変更できる", async () => {
  const h = controllerFixture();
  h.controller.open(item);
  h.elements.renameManuscriptDialog.close();
  h.controller.open(item);
  h.elements.renameManuscriptDialog.listeners.close();
  h.elements.renameManuscriptInput.value = "連続変更";
  await h.submit();
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].name, "連続変更.MD");
});

test("送信元ボタン情報がないEnter送信でも改名できる", async () => {
  const h = controllerFixture();
  h.controller.open(item);
  h.elements.renameManuscriptInput.value = "Enterで変更";
  let prevented = false;
  await h.elements.renameManuscriptForm.listeners.submit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(h.writes.length, 1);
});

test("同じ親フォルダの参照を再取得しても名前変更を受け付ける", async () => {
  const h = controllerFixture();
  h.controller.open(item);
  h.state.manuscriptFolder = { ...parent };
  h.elements.renameManuscriptInput.value = "同じフォルダ";
  await h.submit();
  assert.equal(h.writes.length, 1);
});

test("パネルを開いてから保存状態が変わった場合も無反応にせず説明する", async () => {
  const h = controllerFixture();
  h.controller.open(item);
  h.state.syncing = true;
  h.elements.renameManuscriptInput.value = "待機";
  await h.submit();
  assert.equal(h.writes.length, 0);
  assert.match(h.elements.renameManuscriptError.textContent, /保存|同期/);
});
