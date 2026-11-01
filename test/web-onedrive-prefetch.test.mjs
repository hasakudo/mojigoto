import test from "node:test";
import assert from "node:assert/strict";
import { oneDrivePrefetchFixture as fixture } from "./fixtures/onedrive-prefetch-fixture.mjs";

const metadataMeasure = h => h.measures.find(row => row.label === "作品検出・管理フォルダ一覧");
test("タグなし10作品でも子と管理の20件を一度のbatchで毎回取り直す", async () => {
  const h = fixture(10), cache = await h.seed();
  const result = await h.load(cache);
  assert.equal(result.length, 10); assert.equal(h.batches.length, 1); assert.equal(h.batches[0].length, 20);
  assert.equal(h.paths.length, 1); assert.equal(h.reads.length, 0);
  assert.equal(metadataMeasure(h).prefetchedFolders, 10); assert.equal(metadataMeasure(h).folders, 0);
  assert.equal(metadataMeasure(h).reusedFolders, 0); assert.equal(metadataMeasure(h).currentTags, 0);
  for (const request of h.batches[0]) assert.equal(request.method, "GET");
});
test("先行取得でも設定の新しい版と本文を反映する", async () => {
  const h = fixture(2), cache = await h.seed();
  h.data.get("meta-work-0")[0].eTag = "v2"; h.titles.set("settings-work-0", "新しい作品名");
  const result = await h.load(cache);
  assert.equal(result.find(work => work.id === "work-0").title, "新しい作品名");
  assert.deepEqual(h.reads, ["settings-work-0"]);
});
test("古い管理フォルダが消えても、新しい配置で再取得して設定を失わない", async () => {
  const h = fixture(2), cache = await h.seed();
  h.data.delete("meta-work-0");
  h.data.get("work-0")[0] = h.folder("new-meta", ".mojigoto", "work-0");
  h.data.set("new-meta", [h.file("new-settings", "singleWork.json", "new-meta")]);
  h.titles.set("new-settings", "移動後の設定");
  const result = await h.load(cache);
  assert.equal(result.find(work => work.id === "work-0").title, "移動後の設定");
  assert.equal(h.batches.length, 2); assert.equal(h.batches[1].length, 1);
  assert.match(h.batches[1][0].url, /new-meta\/children/);
  assert.equal(metadataMeasure(h).prefetchedFolders, 1);
  assert.ok(!h.paths.some(path => path.includes("meta-work-0")));
});
test("管理側が空になった場合、前の設定を成功扱いで残さない", async () => {
  const h = fixture(1), cache = await h.seed(); h.data.set("meta-work-0", []);
  const result = await h.load(cache);
  assert.equal(result[0].settingsFile, null); assert.equal(result[0].title, "作品0");
});
for (const invalid of ["id", "driveId"]) {
  test("先行した一覧の親" + invalid + "が違えば現在の保存先を取り直す", async () => {
    const h = fixture(2), cache = await h.seed(); h.wrongOnce.set("meta-work-0", invalid);
    const result = await h.load(cache);
    assert.equal(result.length, 2); assert.equal(h.batches.length, 2); assert.equal(h.batches[1].length, 1);
    assert.equal(metadataMeasure(h).prefetchedFolders, 1);
  });
}
test("先行した管理一覧だけが失敗した場合は、現在の管理一覧を取り直せる", async () => {
  const h = fixture(2), cache = await h.seed(); h.batchFailOnce.set("meta-work-0", 403);
  assert.equal((await h.load(cache)).length, 2); assert.equal(h.batches.length, 2);
});
for (const invalid of ["parent", "drive"]) {
  test("前回管理フォルダの" + invalid + "が不正なら先行取得を使わない", async () => {
    const h = fixture(1), cache = await h.seed();
    cache[0].mojigoto.parentReference[invalid === "parent" ? "id" : "driveId"] = "other";
    await h.load(cache); assert.equal(h.batches.length, 2); assert.equal(h.batches[0].length, 1);
    assert.equal(metadataMeasure(h).prefetchedFolders, 0);
  });
}
test("前回一覧のない初回は従来の2段階で取得する", async () => {
  const h = fixture(3); await h.load([]);
  assert.equal(h.batches.length, 2); assert.equal(metadataMeasure(h).prefetchedFolders, 0);
});
test("先行取得がないproviderの動作を変えない", async () => {
  const h = fixture(2), cache = await h.seed(); h.provider.listChildrenBatchSettled = undefined;
  assert.equal((await h.load(cache)).length, 2); assert.equal(h.batches.length, 2);
});
test("追加作品は探索し、削除された前回作品の管理先を要求しない", async () => {
  const h = fixture(3), cache = await h.seed();
  h.data.set("root", [h.works[1], h.folder("new", "新作品", "root")]);
  h.data.set("new", [h.folder("new-meta", ".mojigoto", "new")]);
  h.data.set("new-meta", [h.file("new-settings", "work.json", "new-meta")]);
  const result = await h.load(cache);
  assert.deepEqual(result.map(work => work.id).sort(), ["new", "work-1"]);
  assert.ok(!JSON.stringify(h.batches).includes("meta-work-0"));
  assert.equal(h.batches[0].length, 3); assert.equal(h.batches[1].length, 1);
});
test("20件上限と返答順に関係なく全作品の先行一覧を照合する", async () => {
  const h = fixture(23), cache = await h.seed(); const result = await h.load(cache);
  assert.equal(result.length, 23); assert.deepEqual(h.batches.map(rows => rows.length), [20, 20, 6]);
  assert.equal(metadataMeasure(h).prefetchedFolders, 23);
});
test("先行一覧の継続ページにある設定も取得してから採用する", async () => {
  const h = fixture(1), cache = await h.seed(); h.paged.add("meta-work-0");
  const result = await h.load(cache);
  assert.equal(result[0].settingsFile.id, "settings-work-0");
  assert.ok(h.paths.includes("/next/meta-work-0")); assert.equal(metadataMeasure(h).prefetchedFolders, 1);
});
test("子フォルダの一括応答失敗は通常の一括取得で確認し、空の作品として隠さない", async () => {
  const h = fixture(2), cache = await h.seed(); h.batchFailOnce.set("work-0", 403);
  const result = await h.load(cache); assert.equal(result.length, 2);
  assert.equal(h.batches.length, 2); assert.equal(h.batches[1].length, 1);
});
test("現在の子一覧が本当に取得できなければ全体の成功にしない", async () => {
  const h = fixture(2), cache = await h.seed(); h.data.delete("work-0"); h.singleFailures.set("work-0", 403);
  await assert.rejects(h.load(cache), /403/);
});
test("429では先行取得から即座に個別要求を連打しない", async () => {
  const h = fixture(2), cache = await h.seed(); h.batchFailOnce.set("work-0", 429);
  await assert.rejects(h.load(cache), { status: 429 }); assert.equal(h.paths.length, 1);
});
test("cTag一致で再利用できる作品には先行GETも追加しない", async () => {
  const h = fixture(2);
  for (const rows of h.data.values()) for (const row of rows) if (row.folder) row.cTag = "content-" + row.id;
  const cache = await h.seed(); await h.load(cache);
  assert.equal(h.batches.length, 0); assert.equal(metadataMeasure(h).reusedFolders, 2);
});


test("先行batch全体の失敗でも通常の一括取得へ戻り、個別要求を連打しない", async () => {
  const h = fixture(3), cache = await h.seed(), request = h.provider.request;
  let failed = false;
  h.provider.request = async (url, options) => {
    if (url === "/$batch" && !failed) { failed = true; throw new Error("temporary batch failure"); }
    return request(url, options);
  };
  assert.equal((await h.load(cache)).length, 3);
  assert.equal(h.batches.length, 2); assert.equal(h.paths.length, 1);
  assert.equal(metadataMeasure(h).prefetchedFolders, 0);
});
test("現在の管理フォルダの429も直ちに再送しない", async () => {
  const h = fixture(2), cache = await h.seed(); h.batchFailOnce.set("meta-work-0", 429);
  await assert.rejects(h.load(cache), { status: 429 }); assert.equal(h.batches.length, 1);
});
