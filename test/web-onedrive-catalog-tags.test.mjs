import test from "node:test";
import assert from "node:assert/strict";
import { discoverWorks, createWorkCatalogSnapshot } from "../web/lib/work-discovery.mjs";

function fixture(count = 3) {
  const driveId = "drive-a", data = new Map(), batches = [], reads = [], lists = [], measurements = [];
  const folder = (id, name, parent) => ({ id, name, folder: {}, cTag: "content-1-" + id, eTag: "properties-1-" + id, parentReference: { id: parent, driveId } });
  const file = (id, name, parent) => ({ id, name, file: {}, eTag: "file-1-" + id, parentReference: { id: parent, driveId } });
  const root = folder("root", "作品ルート", "drive-root");
  const works = Array.from({ length: count }, (_, i) => folder("work-" + i, "作品" + i, "root"));
  data.set(root.id, works);
  for (const work of works) {
    const meta = folder("meta-" + work.id, ".mojigoto", work.id), manuscript = folder("manuscript-" + work.id, "原稿", work.id);
    data.set(work.id, [meta, manuscript]);
    data.set(meta.id, [file("settings-" + work.id, "work.json", meta.id)]);
  }
  const provider = {
    supportsFolderContentTags: true,
    listChildren: async id => { lists.push(id); return structuredClone(data.get(id) || []); },
    listChildrenBatch: async ids => { batches.push([...ids]); return new Map(ids.map(id => [id, structuredClone(data.get(id) || [])])); },
    readText: async item => { reads.push(item.id); return JSON.stringify({ title: "表示名-" + item.id, status: "執筆中" }); },
  };
  const settingsCache = new Map(), options = { settingsCache, measure: label => details => measurements.push({ label, ...details }) };
  const load = cachedWorks => discoverWorks(provider, root, { ...options, cachedWorks });
  const reset = () => { batches.length = 0; reads.length = 0; lists.length = 0; measurements.length = 0; };
  return { provider, root, works, data, batches, reads, lists, measurements, load, reset };
}

test("最新の作品フォルダcTagが同じなら子と管理の一覧を省き、設定の版キャッシュを維持する", async () => {
  const h = fixture(), before = await h.load([]), cache = createWorkCatalogSnapshot(before), original = structuredClone(cache);
  h.reset(); const after = await h.load(cache);
  assert.deepEqual(h.lists, ["root"]);
  assert.equal(h.batches.length, 0); assert.equal(h.reads.length, 0);
  assert.deepEqual(after.map(w => [w.id, w.title, w.status]), before.map(w => [w.id, w.title, w.status]));
  assert.deepEqual(cache, original);
  assert.equal(h.measurements.find(m => m.label === "作品検出・子フォルダ一覧").reusedFolders, 3);
});
test("原稿側だけ更新された作品は子一覧を読み、変わらない管理一覧は再利用する", async () => {
  const h = fixture(), cache = createWorkCatalogSnapshot(await h.load([]));
  h.works[0].cTag = "changed"; h.data.get("work-0")[1].cTag = "new-manuscript";
  h.reset(); const result = await h.load(cache);
  assert.deepEqual(h.batches, [["work-0"]]);
  assert.equal(result.find(w => w.id === "work-0").manuscript.cTag, "new-manuscript");
});
test("管理フォルダの更新ならその作品を再取得し、最新設定を反映する", async () => {
  const h = fixture(), cache = createWorkCatalogSnapshot(await h.load([]));
  h.works[0].cTag = "changed"; h.data.get("work-0")[0].cTag = "new-meta";
  h.data.get("meta-work-0")[0].eTag = "new-settings";
  h.provider.readText = async () => JSON.stringify({ title: "変更後の作品名" });
  h.reset(); const result = await h.load(cache);
  assert.deepEqual(h.batches, [["work-0"], ["meta-work-0"]]);
  assert.equal(result.find(w => w.id === "work-0").title, "変更後の作品名");
});
for (const mode of ["no-ctag", "etag-only", "other-drive", "unsupported", "incomplete"]) {
  test(mode + "では安全を確認できないキャッシュを使わない", async () => {
    const h = fixture(1), cache = createWorkCatalogSnapshot(await h.load([]));
    if (mode === "no-ctag" || mode === "etag-only") { delete h.works[0].cTag; delete h.data.get("work-0")[0].cTag; }
    if (mode === "etag-only") h.works[0].eTag = cache[0].folder.eTag;
    if (mode === "other-drive") { cache[0].folder.parentReference.driveId = "other"; cache[0].mojigoto.parentReference.driveId = "other"; }
    if (mode === "unsupported") h.provider.supportsFolderContentTags = false;
    if (mode === "incomplete") cache[0].mojigotoChildren = [];
    h.reset(); await h.load(cache);
    assert.deepEqual(h.batches, [["work-0"], ["meta-work-0"]]);
  });
}
test("新規作品を探索し、削除作品は最新のルート一覧で除外する", async () => {
  const h = fixture(), cache = createWorkCatalogSnapshot(await h.load([]));
  h.data.set("root", h.works.slice(1));
  h.reset(); const result = await h.load(cache);
  assert.equal(result.length, 2); assert.ok(!result.some(w => w.id === "work-0"));
  assert.equal(h.batches.length, 0);
  const newer = fixture(4); newer.reset(); const added = await newer.load(cache);
  assert.equal(added.length, 4);
  assert.deepEqual(newer.batches, [["work-3"], ["meta-work-3"]]);
});
test("Single作品でも新しいルート一覧の管理cTagを確認して再利用する", async () => {
  const h = fixture(1), root = h.works[0];
  const options = { settingsCache: new Map() };
  const before = await discoverWorks(h.provider, root, options), cache = createWorkCatalogSnapshot(before);
  h.reset(); const after = await discoverWorks(h.provider, root, { ...options, cachedWorks: cache });
  assert.deepEqual(h.lists, [root.id]); assert.equal(h.batches.length, 0);
  assert.equal(after[0].title, before[0].title);
});
test("設定本文のキャッシュがなければフォルダを再利用しても本文を読む", async () => {
  const h = fixture(1), cache = createWorkCatalogSnapshot(await h.load([])); h.reset();
  await discoverWorks(h.provider, h.root, { cachedWorks: cache });
  assert.equal(h.batches.length, 0); assert.deepEqual(h.reads, ["settings-work-0"]);
});
test("再利用した一覧の変更で前回スナップショットを書き換えない", async () => {
  const h = fixture(1), cache = createWorkCatalogSnapshot(await h.load([]));
  const next = await h.load(cache); next[0].mojigotoChildren[0].name = "mutated"; next[0].manuscript.name = "mutated";
  assert.equal(cache[0].mojigotoChildren[0].name, "work.json"); assert.equal(cache[0].manuscript.name, "原稿");
});


test("再利用できたときの計測は一致件数と有効なスナップショットを示す", async () => {
  const h = fixture(), cache = createWorkCatalogSnapshot(await h.load([])); h.reset(); await h.load(cache);
  const children = h.measurements.find(m => m.label === "作品検出・子フォルダ一覧");
  const metadata = h.measurements.find(m => m.label === "作品検出・管理フォルダ一覧");
  for (const row of [children, metadata]) {
    assert.equal(row.tagCacheEnabled, true);
    assert.equal(row.cachedFolders, 3); assert.equal(row.currentTags, 3); assert.equal(row.cachedTags, 3);
    assert.equal(row.matchingTags, 3); assert.equal(row.matchingDrives, 3); assert.equal(row.snapshotIssues, "none");
  }
});
for (const mode of ["missing-tag", "changed-tag", "missing-parent", "missing-drive", "old-provider"]) {
  test("再利用0件を理由で切り分ける: " + mode, async () => {
    const h = fixture(1), cache = createWorkCatalogSnapshot(await h.load([]));
    if (mode === "missing-tag") delete h.works[0].cTag;
    if (mode === "changed-tag") h.works[0].cTag = "different-tag";
    if (mode === "missing-parent") delete cache[0].mojigotoChildren[0].parentReference;
    if (mode === "missing-drive") delete cache[0].folder.parentReference.driveId;
    if (mode === "old-provider") delete h.provider.supportsFolderContentTags;
    h.reset(); await h.load(cache);
    const row = h.measurements.find(m => m.label === "作品検出・子フォルダ一覧");
    assert.equal(row.reusedFolders, 0);
    if (mode === "missing-tag") { assert.equal(row.currentTags, 0); assert.equal(row.cachedTags, 1); }
    if (mode === "changed-tag") { assert.equal(row.currentTags, 1); assert.equal(row.matchingTags, 0); }
    if (mode === "missing-parent") assert.equal(row.snapshotIssues, "child-location:1");
    if (mode === "missing-drive") assert.equal(row.snapshotIssues, "work-drive:1");
    if (mode === "old-provider") assert.equal(row.tagCacheEnabled, false);
  });
}
test("計測に作品名・ID・更新タグの値を含めない", async () => {
  const h = fixture(1), cache = createWorkCatalogSnapshot(await h.load([]));
  h.works[0].name = "PRIVATE-TITLE"; h.works[0].cTag = "PRIVATE-CTAG";
  cache[0].folder.cTag = "PRIVATE-CACHED-TAG";
  h.reset(); await h.load(cache);
  const json = JSON.stringify(h.measurements);
  for (const secret of ["PRIVATE-TITLE", "PRIVATE-CTAG", "PRIVATE-CACHED-TAG", "work-0", "meta-work-0", "drive-a"]) assert.ok(!json.includes(secret));
});
