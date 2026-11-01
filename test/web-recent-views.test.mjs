import { createRecentViewHistory, createRecentViewRestorer } from "../web/lib/recent-view-history.mjs";
import { createWorkCatalogSnapshot, safeDriveItemSnapshot } from "../web/lib/work-discovery.mjs";
import { createManuscriptLoadController } from "../web/lib/manuscript-load.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { groupRecentViews, homeRecentViews, isRecentViewEntry, isRecentEditorRoute, normalizeRecentViews, normalizeWorkRecentViews, recentViewKey, recentViewLabel, recentViewsForWork, recentWorkDestination, updateRecentViews, updateWorkRecentViews, setWorkRecentViewPinned } from "../web/lib/recent-views.mjs";

const app = fs.readFileSync(new URL("../web/app.mjs", import.meta.url), "utf8");
function historyDependencies(sandbox) {
  return Object.fromEntries(Object.entries(sandbox).map(([key, value]) => [key, typeof value === "function" ? (...args) => sandbox[key](...args) : value]));
}
function attachHistory(sandbox) { Object.assign(sandbox, createRecentViewHistory(historyDependencies(sandbox))); }
const entry = (id, cloudKind = "oneDrive", kind = "manuscript-file") => ({
  cloudKind, root: { id: "root", name: "作品" }, openedAt: "2026-09-30T00:00:00Z",
  route: { kind, workId: "a", work: { id: "a", title: "A作品", folder: { id: "a" } }, item: { id, name: `${id}.txt` } },
});

test("閲覧順に5件保存し、再訪した画面を先頭へ移す", () => {
  let entries = [];
  for (let id = 1; id <= 7; id++) entries = updateRecentViews(entries, entry(String(id)));
  assert.deepEqual(entries.map((item) => item.route.item.id), ["7", "6", "5", "4", "3"]);
  entries = updateRecentViews(entries, { ...entry("5"), openedAt: "new" });
  assert.deepEqual(entries.map((item) => item.route.item.id), ["5", "7", "6", "4", "3"]);
  assert.equal(entries[0].openedAt, "new");
  assert.deepEqual(normalizeRecentViews(JSON.parse(JSON.stringify(entries))), entries);
});

test("作品の履歴はクラウド・ルート・作品で絞り込んでから5件に制限する", () => {
  const others = Array.from({ length: 6 }, (_, i) => ({ ...entry(`other-${i}`), route: { ...entry(`other-${i}`).route, workId: "b", work: { id: "b" } } }));
  const own = entry("own");
  assert.deepEqual(recentViewsForWork([...others, own], "oneDrive", own.root.id, "a"), [own]);
  assert.deepEqual(recentViewsForWork([own], "googleDrive", own.root.id, "a"), []);
  assert.deepEqual(recentViewsForWork([own], "oneDrive", "other-root", "a"), []);
});

test("ピン留め2件を履歴更新後も先頭に残し、通常履歴5件を別に保持する", () => {
  let views = updateWorkRecentViews([], entry("pin-a"));
  views = updateWorkRecentViews(views, entry("pin-b"));
  views = setWorkRecentViewPinned(views, recentViewKey(entry("pin-a")), true);
  views = setWorkRecentViewPinned(views, recentViewKey(entry("pin-b")), true);
  for (let i = 0; i < 10; i++) views = updateWorkRecentViews(views, {
    ...entry(`recent-${i}`), openedAt: `2026-10-07T00:00:0${i}Z`,
  });
  assert.equal(views.length, 7);
  assert.deepEqual(views.slice(0, 2).map((view) => view.route.item.id), ["pin-a", "pin-b"]);
  assert.ok(views.slice(0, 2).every((view) => view.pinned));
  assert.deepEqual(views.slice(2).map((view) => view.route.item.id), ["recent-9", "recent-8", "recent-7", "recent-6", "recent-5"]);
  assert.deepEqual(normalizeWorkRecentViews(JSON.parse(JSON.stringify(views))), views);
});

test("3件目のピン留めは制限し、解除後は別の画面をピン留めできる", () => {
  let views = normalizeWorkRecentViews([entry("a"), entry("b"), entry("c")]);
  views = setWorkRecentViewPinned(views, recentViewKey(entry("a")), true);
  views = setWorkRecentViewPinned(views, recentViewKey(entry("b")), true);
  assert.throws(() => setWorkRecentViewPinned(views, recentViewKey(entry("c")), true), /2件まで/);
  views = setWorkRecentViewPinned(views, recentViewKey(entry("a")), false);
  views = setWorkRecentViewPinned(views, recentViewKey(entry("c")), true);
  assert.deepEqual(views.filter((view) => view.pinned).map((view) => view.route.item.id), ["b", "c"]);
});

test("ピン留めした原稿・プロット・資料・構想メモを再訪しても固定を維持し情報を更新する", () => {
  for (const [kind, extra] of [["manuscript-file", {}], ["note-editor", { noteType: "plot" }],
    ["note-editor", { noteType: "reference" }], ["concept-editor", { memoId: "memo" }]]) {
    const target = entry("target", "oneDrive", kind);
    Object.assign(target.route, extra);
    let views = setWorkRecentViewPinned([target], recentViewKey(target), true);
    const refreshed = { ...target, openedAt: "2026-10-07T01:00:00Z", route: { ...target.route, memoTitle: "変更後" } };
    views = updateWorkRecentViews(views, refreshed);
    assert.equal(views.length, 1);
    assert.equal(views[0].pinned, true);
    assert.equal(views[0].route.memoTitle, "変更後");
    assert.equal(recentViewsForWork(views, "oneDrive", "root", "a")[0].pinned, true);
    assert.equal(recentViewsForWork(views, "googleDrive", "root", "a").length, 0);
    assert.equal(recentViewsForWork(views, "oneDrive", "root", "b").length, 0);
  }
});

test("古いピンを解除したときは閲覧日時順の最新5件へ戻す", () => {
  const pinned = { ...entry("old"), pinned: true };
  const recent = Array.from({ length: 5 }, (_, i) => ({ ...entry(`new-${i}`), openedAt: `2026-10-07T00:00:0${i}Z` }));
  const views = setWorkRecentViewPinned([pinned, ...recent], recentViewKey(pinned), false);
  assert.deepEqual(views.map((view) => view.route.item.id), ["new-4", "new-3", "new-2", "new-1", "new-0"]);
});

test("HOMEへ全作品のピン留めと通常履歴5件を反映し、重複を除く", () => {
  const histories = Array.from({ length: 8 }, (_, index) => {
    const workId = `work-${index}`;
    return [0, 1, 2].map((item) => ({ ...entry(`${index}-${item}`), pinned: item < 2,
      openedAt: `2026-10-0${index + 1}T00:00:0${item}Z`,
      route: { ...entry(`${index}-${item}`).route, workId, work: { id: workId } },
    }));
  });
  const home = homeRecentViews([histories[7][0], histories[7][2]], histories);
  assert.equal(home.filter((view) => view.pinned).length, 16);
  assert.equal(home.filter((view) => !view.pinned).length, 5);
  assert.equal(new Set(home.map(recentViewKey)).size, home.length);
  assert.equal(groupRecentViews(home, Infinity).length, 8);
  const unpinned = histories.map((items) => items.map((view) => ({ ...view, pinned: false })));
  assert.equal(homeRecentViews([], unpinned).length, 5);
});

test("HOMEの作品別ピン留めは利用者と接続中のクラウドで分離する", () => {
  const storage = new Map();
  const pinned = { ...entry("pinned"), pinned: true };
  for (const [owner, cloud] of [["owner", "oneDrive"], ["other", "oneDrive"], ["owner", "googleDrive"]]) {
    const value = { ...pinned, cloudKind: cloud };
    storage.set(`work-recent.${JSON.stringify([owner, cloud, "root", "a"])}`, JSON.stringify([value]));
  }
  const sandbox = vm.createContext({ state: { cloudKind: "oneDrive" }, WORK_RECENT_VIEWS_KEY: "work-recent",
    workCatalogOwner: () => "owner", readJson: (text) => JSON.parse(text), readRecentViews: () => [],
    recentViewsForWork, homeRecentViews,
    localStorage: { get length() { return storage.size; }, key: (index) => [...storage.keys()][index], getItem: (key) => storage.get(key) },
  });
  attachHistory(sandbox);
  assert.equal(sandbox.readHomeRecentViews().length, 1);
  assert.equal(sandbox.readHomeRecentViews()[0].cloudKind, "oneDrive");
});

test("HOMEから原稿一覧・原稿を開く際は作品一覧とフォルダ選択画面を隠す", async () => {
  for (const [name, endMarker] of [["openManuscriptFolder", "  const suffix ="], ["openFile", "  elements.readerTitle.textContent ="]]) {
    const elements = Object.fromEntries(["browserSection", "worksSection", "filesSection", "readerSection", "notesSection", "noteEditorSection", "readerContent", "readerTitle", "readerMeta", "saveFileButton", "readerJumpControls", "autoSaveToggle", "readerCountMode"]
      .map((key) => [key, { hidden: false, classList: { remove() {} }, focus() {}, setSelectionRange() {} }]));
    const sandbox = vm.createContext({ state: { folderListings: new Map(), fileLoadRequest: 0, provider: { readText: async () => "本文" } }, elements,
      folderListingKey: () => "folder", beginPerformanceMeasurement: () => () => {},
      cancelAutoSave() {}, stopExternalMonitor() {}, hideConceptViews() {}, renderInputAssistVisibility() {},
      formatSize: () => "", formatDate: () => "", updateReaderMeta() {}, setEditorStatus() {},
      startExternalMonitor() {}, commitRoute() {}, routeForWork() {}, requestAnimationFrame: callback => callback(),
    });
    if (name === "openFile") Object.assign(sandbox, createManuscriptLoadController(sandbox));
    else {
      const start = app.indexOf(`async function ${name}(`);
      vm.runInContext(`${app.slice(start, app.indexOf(endMarker, start))}\n}`, sandbox);
    }
    await sandbox[name]({ id: "folder" }, []);
    assert.equal(elements.worksSection.hidden, true);
    assert.equal(elements.browserSection.hidden, true);
    assert.equal(name === "openManuscriptFolder" ? elements.filesSection.hidden : elements.readerSection.hidden, false);
  }
});

test("別作品を開いても作品別の5件は残り、再読込後も利用者ごとに復元できる", () => {
  const storage = new Map();
  const state = { cloudKind: "oneDrive", workRoot: { id: "root", name: "作品" }, selectedWork: { id: "a" } };
  const sandbox = vm.createContext({ state, RECENT_VIEWS_KEY: "recent", WORK_RECENT_VIEWS_KEY: "work-recent",
    normalizeRecentViews, recentViewsForWork, updateRecentViews, updateWorkRecentViews, isRecentEditorRoute,
    workCatalogOwner: () => "owner", readJson: (text) => text ? JSON.parse(text) : null,
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    createWorkCatalogSnapshot: (works) => works, routeWorkSnapshot: (work) => work,
    safeDriveItemSnapshot: (item) => item, renderRecentViews() {},
  });
  attachHistory(sandbox);
  for (const workId of ["a", "b"]) {
    state.selectedWork = { id: workId };
    for (let i = 0; i < 7; i++) sandbox.recordRecentView({
      kind: "manuscript-file", workId, work: { id: workId }, item: { id: `${workId}-${i}` },
    });
  }
  assert.ok(sandbox.readRecentViews().every((view) => view.route.workId === "b"));
  state.selectedWork = { id: "a" };
  assert.deepEqual(sandbox.readWorkRecentViews().map((view) => view.route.item.id), ["a-6", "a-5", "a-4", "a-3", "a-2"]);
  sandbox.workCatalogOwner = () => "another-owner";
  assert.equal(sandbox.readWorkRecentViews().length, 0);
  sandbox.workCatalogOwner = () => "owner";
  state.workRoot = { id: "another-root" };
  assert.equal(sandbox.readWorkRecentViews().length, 0);
});

test("同じIDでもクラウド・作品・画面・資料種別が異なる履歴は分ける", () => {
  const file = entry("same");
  const google = entry("same", "googleDrive");
  const note = { ...entry("same", "oneDrive", "note-editor"), route: { ...file.route, kind: "note-editor", noteType: "reference" } };
  const plot = { ...note, route: { ...note.route, noteType: "plot" } };
  assert.equal(normalizeRecentViews([file, google, note, plot, file]).length, 4);
  assert.equal(recentViewLabel({ ...note, route: { ...note.route, noteTitle: "人物設定" } }), "資料 / 人物設定");
  assert.equal(recentViewLabel({ ...plot, route: { ...plot.route, noteTitle: "第一幕" } }), "プロット / 第一幕");
  assert.doesNotMatch(recentViewLabel(note), /same\.txt/);
});

test("一覧や作品設定を開いても編集履歴5件を圧迫しない", () => {
  const editors = Array.from({ length: 5 }, (_, i) => entry(String(i)));
  for (const kind of ["manuscript-list", "notes-list", "concept-list", "settings"]) {
    const list = entry("list", "oneDrive", kind);
    assert.deepEqual(updateRecentViews(editors, list), editors);
    assert.deepEqual(normalizeRecentViews([list, ...editors]), editors);
  }
});

test("作品ごとに共通一覧を作り、再認証後の一覧も復元できる参照を保つ", () => {
  const a = entry("a");
  a.route.work.manuscript = { id: "manuscript" };
  const b = entry("b");
  const google = entry("c", "googleDrive");
  assert.deepEqual(groupRecentViews([a, b, google]).map((group) => group.entries.length), [2, 1]);
  for (const destination of ["manuscript", "plot", "reference", "concept", "settings"]) {
    const target = recentWorkDestination(a, destination);
    assert.equal(target.route.workId, "a");
    assert.equal(target.route.item, undefined);
    assert.equal(isRecentViewEntry(target), true);
    assert.equal(normalizeRecentViews([target]).length, 0);
  }
  assert.equal(recentWorkDestination(a, "reference").route.noteType, "reference");
  assert.equal(recentWorkDestination(a, "manuscript").route.folder.id, "manuscript");
});

test("破損データや移動先の参照が欠けた履歴を除く", () => {
  assert.deepEqual(normalizeRecentViews({ invalid: true }), []);
  assert.deepEqual(normalizeRecentViews([null, {}, entry(""), { ...entry("a"), cloudKind: "unknown" }]), []);
});

test("利用者ごとに履歴を保存し、別利用者の履歴を表示しない", () => {
  const storage = new Map();
  const sandbox = vm.createContext({ RECENT_VIEWS_KEY: "recent", normalizeRecentViews,
    state: { cloudKind: "oneDrive" },
    workCatalogOwner: () => "user-a", readJson: (value) => value ? JSON.parse(value) : null,
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  });
  attachHistory(sandbox);
  storage.set("recent.user-a", JSON.stringify([entry("file")]));
  assert.equal(sandbox.readRecentViews()[0].route.item.id, "file");
  assert.equal(JSON.parse(storage.get("recent.user-a.oneDrive"))[0].route.item.id, "file");
  sandbox.workCatalogOwner = () => "user-b";
  assert.equal(sandbox.readRecentViews().length, 0);
  storage.set("recent.user-b", "broken json");
  assert.equal(sandbox.readRecentViews().length, 0);
});

test("履歴を3クラウドごとに5件保存し、切替・再読込しても他クラウドを混ぜない", () => {
  const storage = new Map();
  const sandbox = vm.createContext({ RECENT_VIEWS_KEY: "recent", normalizeRecentViews,
    state: { cloudKind: "oneDrive" }, workCatalogOwner: () => "owner",
    readJson: (value) => value ? JSON.parse(value) : null,
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  });
  attachHistory(sandbox);
  for (const kind of ["oneDrive", "googleDrive", "dropbox"]) {
    sandbox.state.cloudKind = kind;
    assert.equal(sandbox.readRecentViews().length, 0);
    for (let id = 0; id < 7; id++) {
      storage.set(sandbox.recentViewsStorageKey(), JSON.stringify(updateRecentViews(sandbox.readRecentViews(), entry(String(id), kind))));
    }
  }
  for (const kind of ["dropbox", "oneDrive", "googleDrive", "oneDrive"]) {
    sandbox.state.cloudKind = kind;
    const entries = sandbox.readRecentViews();
    assert.equal(entries.length, 5);
    assert(entries.every((item) => item.cloudKind === kind));
    assert.deepEqual(entries.map((item) => item.route.item.id), ["6", "5", "4", "3", "2"]);
  }
});

test("旧履歴は各クラウドへ分けて移行し、空の保存済み履歴は旧履歴から復活させない", () => {
  const legacy = [...Array.from({ length: 6 }, (_, i) => entry(`one-${i}`)), entry("google", "googleDrive"), entry("drop", "dropbox")];
  assert.equal(normalizeRecentViews(legacy, "googleDrive")[0].route.item.id, "google");
  const storage = new Map([["recent.owner", JSON.stringify(legacy)]]);
  const sandbox = vm.createContext({ RECENT_VIEWS_KEY: "recent", normalizeRecentViews,
    state: { cloudKind: "oneDrive" }, workCatalogOwner: () => "owner",
    readJson: (value) => value ? JSON.parse(value) : null,
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  });
  attachHistory(sandbox);
  for (const kind of ["oneDrive", "googleDrive", "dropbox"]) {
    sandbox.state.cloudKind = kind;
    assert(sandbox.readRecentViews().every((item) => item.cloudKind === kind));
    assert(storage.has(`recent.owner.${kind}`));
  }
  sandbox.state.cloudKind = "dropbox";
  storage.set("recent.owner.dropbox", "[]");
  assert.equal(sandbox.readRecentViews().length, 0);
  storage.set("recent.owner.dropbox", "broken json");
  assert.equal(sandbox.readRecentViews().length, 0);
  assert(storage.has("recent.owner"));
});

function context({ token = "token", cloudKind = "oneDrive", discard = true } = {}) {
  const calls = [];
  const storage = new Map();
  const auth = { clientId: "test", getAccessToken: async () => token, signIn: async () => calls.push("signIn") };
  const state = { microsoftAuth: auth, googleDriveAuth: auth, dropboxAuth: auth, worksLoadToken: 0, workMetricsLoadToken: 0, notesLoadToken: 0,
    viewRoutes: new Map(), noteEntriesCache: new Map(), relatedNoteEntries: new Map(), workSettingsDocuments: new Map(), works: [{ id: "stale" }] };
  const sandbox = vm.createContext({ state, normalizeRecentViews, PENDING_RECENT_VIEW_KEY: "pending", CLOUD_KIND_KEY: "cloud",
    localStorage: { setItem: (key, value) => storage.set(key, value) },
    sessionStorage: { setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    canDiscardDraft: () => discard, cancelAutoSave: () => {}, stopExternalMonitor: () => {},
    workCatalogOwner: () => "owner", activateCloud: (kind) => {
      calls.push(kind);
      state.provider = { getItemMetadata: async (folder) => calls.push(folder.id) };
    }, rootStorageKey: () => "root", renderConnectedCloud: () => {},
    restoreRoute: async (route) => calls.push(route.item?.id || route.kind), showWorksHome: () => calls.push("home"),
  });
  const authStart = app.indexOf("function cloudAuth(");
  vm.runInContext(app.slice(authStart, app.indexOf("function beginPerformanceMeasurement(", authStart)), sandbox);
  Object.assign(sandbox, createRecentViewRestorer(historyDependencies(sandbox)));
  return { sandbox, state, storage, calls, entry: entry("file", cloudKind) };
}

test("有効な接続は作品一覧を探索せず、履歴のクラウドとファイルへ直接戻る", async () => {
  const ctx = context();
  await ctx.sandbox.openRecentView(ctx.entry);
  assert.deepEqual(ctx.calls, ["oneDrive", "a", "file"]);
  assert.equal(ctx.state.works.length, 0);
  assert.equal(ctx.state.historyInitialized, true);
  assert.equal(ctx.state.openingRecentView, false);
});

test("OneDrive再認証の前に利用者と復元先を保存する", async () => {
  const ctx = context({ token: "" });
  await ctx.sandbox.openRecentView(ctx.entry);
  assert.deepEqual(ctx.calls, ["signIn"]);
  assert.equal(JSON.parse(ctx.storage.get("pending")).owner, "owner");
  assert.equal(JSON.parse(ctx.storage.get("pending")).entry.route.item.id, "file");
});

test("共通リンクの一覧は直接復元でき、OneDrive再認証を挟んでも参照を保持する", async () => {
  const ctx = context();
  const target = recentWorkDestination(ctx.entry, "reference");
  await ctx.sandbox.openRecentView(target);
  assert.deepEqual(ctx.calls, ["oneDrive", "a", "notes-list"]);
  const pending = context({ token: "" });
  await pending.sandbox.openRecentView(recentWorkDestination(pending.entry, "concept"));
  const stored = JSON.parse(pending.storage.get("pending")).entry;
  assert.equal(isRecentViewEntry(stored), true);
  assert.equal(stored.route.kind, "concept-list");
});

test("Google Drive再認証後は直接履歴へ戻る", async () => {
  const ctx = context({ token: "", cloudKind: "googleDrive" });
  await ctx.sandbox.openRecentView(ctx.entry);
  assert.deepEqual(ctx.calls, ["signIn", "googleDrive", "a", "file"]);
});

test("Dropbox履歴を独立して保存し有効な接続で直接復元する", async () => {
  const ctx = context({ cloudKind: "dropbox" });
  assert.equal(isRecentViewEntry(ctx.entry), true);
  assert.equal(normalizeRecentViews([ctx.entry, entry("file")]).length, 2);
  await ctx.sandbox.openRecentView(ctx.entry);
  assert.deepEqual(ctx.calls, ["dropbox", "a", "file"]);
});

test("Dropbox再認証の前にクラウドと復元先を保存する", async () => {
  const ctx = context({ token: "", cloudKind: "dropbox" });
  await ctx.sandbox.openRecentView(ctx.entry);
  assert.deepEqual(ctx.calls, ["signIn"]);
  assert.equal(ctx.storage.get("cloud"), "dropbox");
  assert.equal(JSON.parse(ctx.storage.get("pending")).entry.cloudKind, "dropbox");
});

test("再認証キャンセルと存在しないファイルを扱い再操作できる", async () => {
  const ctx = context({ token: "" });
  ctx.state.microsoftAuth.signIn = async () => { throw new Error("cancel"); };
  await assert.rejects(ctx.sandbox.openRecentView(ctx.entry), /cancel/);
  assert.equal(ctx.storage.has("pending"), false);
  assert.equal(ctx.state.openingRecentView, false);
  const failed = context();
  failed.sandbox.restoreRoute = async () => { throw new Error("deleted"); };
  await assert.rejects(failed.sandbox.openRecentView(failed.entry), /移動・削除/);
  assert.equal(failed.calls.at(-1), "home");
});

test("未保存の編集を破棄しない場合は復元しない", async () => {
  const ctx = context({ discard: false });
  await ctx.sandbox.openRecentView(ctx.entry);
  assert.deepEqual(ctx.calls, []);
});

function recordingHarness(failWrites = false) {
  const storage = new Map(), state = { cloudKind: "oneDrive", workRoot: { id: "root", name: "作品", accessToken: "private-token" }, selectedWork: { id: "a" }, currentNote: { data: { title: "最新ノート", body: "private-body" } } };
  let renders = 0;
  const controller = createRecentViewHistory({ state, RECENT_VIEWS_KEY: "recent", WORK_RECENT_VIEWS_KEY: "work-recent", workCatalogOwner: () => "owner", readJson: value => JSON.parse(value || "null"), routeWorkSnapshot: value => value, createWorkCatalogSnapshot, safeDriveItemSnapshot, renderRecentViews: () => renders++,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem(key, value) { if (failWrites) throw new Error("quota"); storage.set(key, value); }, get length() { return storage.size; }, key: index => [...storage.keys()][index] } });
  return { state, storage, renders: () => renders, ...controller };
}
test("編集履歴には本文・トークン・ダウンロードURLを残さず安全な参照を保存する", () => {
  const h = recordingHarness(), target = entry("note", "oneDrive", "note-editor"); target.route.noteType = "plot";
  Object.assign(target.route.item, { file: {}, body: "private-body", accessToken: "private-token", "@microsoft.graph.downloadUrl": "https://private.invalid/download" });
  target.route.work.folder = { id: "a", folder: {}, accessToken: "private-token" };
  h.recordRecentView(target.route);
  assert.equal(h.readRecentViews()[0].route.noteTitle, "最新ノート");
  assert.equal(h.readWorkRecentViews().length, 1); assert.equal(h.renders(), 1);
  assert.doesNotMatch([...h.storage.values()].join(""), /private-body|private-token|private.invalid|downloadUrl/);
});
test("履歴の保存領域が一杯でも入力と描画を止めない", () => {
  const h = recordingHarness(true), current = h.state.currentNote;
  assert.doesNotThrow(() => h.recordRecentView(entry("file").route));
  assert.equal(h.state.currentNote, current); assert.equal(h.renders(), 1);
});
test("保存から読み直してもピン留めと最新の項目参照を保持する", () => {
  const h = recordingHarness(), target = entry("file"); h.recordRecentView(target.route);
  const pinned = setWorkRecentViewPinned(h.readWorkRecentViews(), recentViewKey(target), true);
  h.storage.set(h.workRecentViewsStorageKey(), JSON.stringify(pinned)); target.route.item.name = "renamed.txt";
  h.recordRecentView(target.route);
  assert.equal(h.readWorkRecentViews()[0].pinned, true); assert.equal(h.readWorkRecentViews()[0].route.item.name, "renamed.txt");
});
test("履歴復元では別クラウドの作品・ノート・設定キャッシュを使わない", async () => {
  const ctx = context({ cloudKind: "dropbox" });
  for (const key of ["viewRoutes", "noteEntriesCache", "relatedNoteEntries", "workSettingsDocuments"]) ctx.state[key].set("old", { id: "a" });
  ctx.state.selectedWork = { id: "a", title: "別クラウド" };
  ctx.sandbox.restoreRoute = async () => {
    assert.equal(ctx.state.works.length, 0); assert.equal(ctx.state.selectedWork, null);
    for (const key of ["viewRoutes", "noteEntriesCache", "relatedNoteEntries", "workSettingsDocuments"]) assert.equal(ctx.state[key].size, 0);
  };
  assert.equal(await ctx.sandbox.openRecentView(ctx.entry), true); assert.equal(ctx.state.historyInitialized, true);
});
test("履歴の認証待ち中に同じ画面を重ねて開かない", async () => {
  const ctx = context(); let release, entered; const started = new Promise(resolve => { entered = resolve; });
  ctx.state.microsoftAuth.getAccessToken = () => { entered(); return new Promise(resolve => { release = resolve; }); };
  const opening = ctx.sandbox.openRecentView(ctx.entry); await started;
  assert.equal(await ctx.sandbox.openRecentView(ctx.entry), false);
  release("token"); await opening;
  assert.equal(ctx.calls.filter(call => call === "oneDrive").length, 1); assert.equal(ctx.state.openingRecentView, false);
});
