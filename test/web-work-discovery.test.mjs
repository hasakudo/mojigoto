import assert from "node:assert/strict";
import test from "node:test";
import {
  findManuscriptFolder,
  findMojigotoFolder,
  discoverWorks,
  collectWorkIndex,
  collectWorkIndexes,
  collectWorkMetrics,
  createWorkCatalogSnapshot,
  inspectWork,
  isManuscriptFile,
  sortDriveItems,
  workMetricSummaryKey,
} from "../web/lib/work-discovery.mjs";

function makeProvider(childrenById, settingsById = {}) {
  return {
    async listChildren(id) { return childrenById[id] || []; },
    async readText(item) { return JSON.stringify(settingsById[item.id] || {}); },
  };
}

test("もじごと作品の標準フォルダを検出する", () => {
  const items = [
    { id: "1", name: "原稿", folder: {} },
    { id: "2", name: ".mojigoto", folder: {} },
  ];
  assert.equal(findManuscriptFolder(items)?.id, "1");
  assert.equal(findMojigotoFolder(items)?.id, "2");
});

test("原稿としてtxtとmdだけを認識する", () => {
  assert.equal(isManuscriptFile({ name: "01.txt", file: {} }), true);
  assert.equal(isManuscriptFile({ name: "02.MD", file: {} }), true);
  assert.equal(isManuscriptFile({ name: "work.json", file: {} }), false);
  assert.equal(isManuscriptFile({ name: "03.txt", folder: {} }), false);
});

test("フォルダを先にして自然順で並べる", () => {
  const sorted = sortDriveItems([
    { name: "10.txt", file: {} },
    { name: "2.txt", file: {} },
    { name: "第二章", folder: {} },
  ]);
  assert.deepEqual(sorted.map((item) => item.name), ["第二章", "2.txt", "10.txt"]);
});

test("作品一覧キャッシュへ期限付きURLを保存しない", () => {
  const [snapshot] = createWorkCatalogSnapshot([{
    id: "work",
    name: "作品",
    title: "作品名",
    manuscript: {
      id: "manuscript",
      name: "manuscript",
      folder: {},
      parentReference: { id: "work", driveId: "drive" },
      "@microsoft.graph.downloadUrl": "https://secret.example/download",
    },
    mojigotoChildren: [{
      id: "settings",
      name: "work.json",
      file: {},
      eTag: '"v1"',
      "@microsoft.graph.downloadUrl": "https://secret.example/settings",
    }],
    sharedMetrics: { totalChars: 100, noteCount: 2 },
  }]);

  assert.equal(snapshot.manuscript.parentReference.driveId, "drive");
  assert.equal(snapshot.mojigotoChildren[0].eTag, '"v1"');
  assert.equal(JSON.stringify(snapshot).includes("secret.example"), false);
  assert.deepEqual(snapshot.metrics, { totalChars: 100, noteCount: 2 });
});

test("Single用フォルダを作品として検出し設定ファイルを保持する", async () => {
  const root = { id: "single", name: "Single作品", folder: {} };
  const provider = makeProvider({
    single: [{ id: "meta", name: ".mojigoto", folder: {} }, { id: "manuscript", name: "manuscript", folder: {} }],
    meta: [{ id: "settings", name: "singleWork.json", file: {} }],
  }, { settings: { title: "単独作品" } });
  const work = await inspectWork(provider, root);
  assert.equal(work.title, "単独作品");
  assert.equal(work.settingsFile.id, "settings");
});

test("Multi用ルート配下の作品を検出する", async () => {
  const root = { id: "root", name: "作品ルート", folder: {} };
  const workFolder = { id: "work", name: "作品A", folder: {} };
  const provider = makeProvider({
    root: [workFolder],
    work: [{ id: "meta", name: ".mojigoto", folder: {} }, { id: "manuscript", name: "原稿", folder: {} }],
    meta: [{ id: "settings", name: "work.json", file: {} }],
  }, { settings: { title: "作品A設定" } });
  const works = await discoverWorks(provider, root);
  assert.deepEqual(works.map((work) => work.title), ["作品A設定"]);
  assert.equal(works[0].settingsFile.name, "work.json");
});

test("Single用フォルダ内のMulti連携用_WORKを作品として検出しない", async () => {
  const root = { id: "root", name: "Single作品", folder: {} };
  const provider = makeProvider({
    root: [
      { id: "root-meta", name: ".mojigoto", folder: {} },
      { id: "root-manuscript", name: "manuscript", folder: {} },
      { id: "view-root", name: "_WORK", folder: {} },
    ],
    "root-meta": [{ id: "single-settings", name: "singleWork.json", file: {} }],
    "view-root": [{ id: "view-manuscript", name: "manuscript", folder: {} }],
  }, {
    "single-settings": { title: "Single作品設定" },
  });

  const works = await discoverWorks(provider, root);

  assert.deepEqual(works.map((work) => work.title), ["Single作品設定"]);
  assert.equal(works[0].folder.id, "root");
  assert.equal(works[0].manuscript.id, "root-manuscript");
});

test("Singleのmanuscript直下に原稿フォルダがあってもルート作品設定を読む", async () => {
  const root = { id: "root", name: "Singleフォルダ", folder: {} };
  const provider = makeProvider({
    root: [
      { id: "root-meta", name: ".mojigoto", folder: {} },
      { id: "root-manuscript", name: "manuscript", folder: {} },
    ],
    "root-meta": [{ id: "single-settings", name: "singleWork.json", file: {} }],
    "root-manuscript": [{ id: "chapter", name: "原稿", folder: {} }],
    chapter: [{ id: "text", name: "01.txt", file: {} }],
  }, {
    "single-settings": { title: "シングルテスト作品", penName: "葉月めいこ" },
  });

  const works = await discoverWorks(provider, root);

  assert.equal(works.length, 1);
  assert.equal(works[0].folder.id, "root");
  assert.equal(works[0].settingsFile.name, "singleWork.json");
  assert.equal(works[0].title, "シングルテスト作品");
});

test("複数作品のフォルダ取得をまとめ、設定読込前に仮一覧を返す", async () => {
  const events = [];
  const folders = [
    { id: "work-a", name: "作品A", folder: {} },
    { id: "work-b", name: "作品B", folder: {} },
  ];
  const provider = {
    async listChildren(id) {
      assert.equal(id, "root");
      return folders;
    },
    async listChildrenBatch(ids) {
      events.push(`batch:${ids.join(",")}`);
      return new Map(ids.map((id) => [id, id.startsWith("work-")
        ? [{ id: `meta-${id}`, name: ".mojigoto", folder: {} }]
        : [{ id: `settings-${id}`, name: "work.json", file: {} }]]));
    },
    async readText(item) {
      events.push(`read:${item.id}`);
      return JSON.stringify({ title: `設定 ${item.id}` });
    },
  };
  let provisional = [];
  const works = await discoverWorks(provider, { id: "root", name: "作品" }, {
    onSkeletons(items) {
      events.push("skeletons");
      provisional = items.map((item) => item.title);
    },
  });

  assert.deepEqual(provisional, ["作品A", "作品B"]);
  assert.ok(events.indexOf("skeletons") < events.findIndex((event) => event.startsWith("read:")));
  assert.deepEqual(works.map((work) => work.title), ["設定 settings-meta-work-a", "設定 settings-meta-work-b"]);
  assert.deepEqual(events.filter((event) => event.startsWith("batch:")), [
    "batch:work-a,work-b",
    "batch:meta-work-a,meta-work-b",
  ]);
});

test("更新されていない作品設定は一覧用キャッシュを再利用する", async () => {
  let settingsReadCount = 0;
  const provider = makeProvider({
    root: [{ id: "work", name: "作品", folder: {} }],
    work: [{ id: "meta", name: ".mojigoto", folder: {} }],
    meta: [{ id: "settings", name: "work.json", file: {}, eTag: '"v1"' }],
  }, { settings: { title: "キャッシュ作品", status: "draft" } });
  const originalReadText = provider.readText;
  provider.readText = async (item) => {
    settingsReadCount += 1;
    return originalReadText(item);
  };
  const settingsCache = new Map();

  await discoverWorks(provider, { id: "root", name: "作品" }, { settingsCache });
  const works = await discoverWorks(provider, { id: "root", name: "作品" }, { settingsCache });

  assert.equal(settingsReadCount, 1);
  assert.equal(works[0].title, "キャッシュ作品");
  assert.equal(works[0].status, "draft");
});

test("VS Codeが保存した作品集計を作品情報として読み込む", async () => {
  const provider = makeProvider({
    root: [{ id: "work", name: "作品", folder: {} }],
    work: [{ id: "meta", name: ".mojigoto", folder: {} }, { id: "manuscript", name: "manuscript", folder: {} }],
    meta: [
      { id: "settings", name: "work.json", file: {} },
      { id: "metrics", name: "work-metrics.json", file: {}, eTag: '"m1"' },
    ],
  }, {
    settings: { title: "共有集計作品" },
    metrics: {
      schemaVersion: 1,
      totalChars: 54321,
      noteCount: 12,
      countMode: "default",
      updatedAt: "2026-09-19T00:00:00Z",
      manuscriptUpdatedAt: "2026-09-18T00:00:00Z",
    },
  });
  const metricsCache = new Map();

  const works = await discoverWorks(provider, { id: "root", name: "作品" }, { metricsCache });

  assert.deepEqual(works[0].sharedMetrics, {
    totalChars: 54321,
    noteCount: 12,
    updatedAt: "2026-09-18T00:00:00Z",
    manuscriptUpdatedAt: "2026-09-18T00:00:00Z",
    notesUpdatedAt: "",
    countMode: "default",
    source: "vscode",
  });
  assert.equal(metricsCache.size, 1);
});

test("共有集計キャッシュは同じ版だけ再利用し、更新後は読み直す", async () => {
  let metricsVersion = '"m1"';
  let metricsReadCount = 0;
  const provider = {
    async listChildren(id) {
      return {
        root: [{ id: "work", name: "作品", folder: {} }],
        work: [{ id: "meta", name: ".mojigoto", folder: {} }],
        meta: [{ id: "metrics", name: "work-metrics.json", file: {}, eTag: metricsVersion }],
      }[id] || [];
    },
    async readText(item) {
      if (item.id === "metrics") metricsReadCount += 1;
      return JSON.stringify({ schemaVersion: 1, totalChars: metricsVersion === '"m1"' ? 100 : 200, noteCount: 1 });
    },
  };
  const metricsCache = new Map();
  const root = { id: "root", name: "作品" };

  await discoverWorks(provider, root, { metricsCache });
  const [cachedWork] = await discoverWorks(provider, root, { metricsCache });
  metricsVersion = '"m2"';
  const [updatedWork] = await discoverWorks(provider, root, { metricsCache });

  assert.equal(metricsReadCount, 2);
  assert.equal(cachedWork.sharedMetrics.totalChars, 100);
  assert.equal(updatedWork.sharedMetrics.totalChars, 200);
});

test("内容が0件の共有集計日時を作品の最終更新に使わない", async () => {
  const provider = makeProvider({
    root: [{ id: "work", name: "準備中作品", folder: {}, lastModifiedDateTime: "2026-07-28T00:00:00Z" }],
    work: [{ id: "meta", name: ".mojigoto", folder: {} }],
    meta: [
      { id: "settings", name: "work.json", file: {}, lastModifiedDateTime: "2026-09-15T00:00:00Z" },
      { id: "metrics", name: "work-metrics.json", file: {}, lastModifiedDateTime: "2026-09-20T00:00:00Z" },
    ],
  }, {
    settings: { title: "準備中作品", status: "preparing" },
    metrics: { schemaVersion: 1, totalChars: 0, noteCount: 0, updatedAt: "2026-09-20T00:00:00Z", notesUpdatedAt: "2026-09-20T00:00:00Z" },
  });

  const [work] = await discoverWorks(provider, { id: "root", name: "作品" });
  assert.equal(work.contentUpdatedAt, "2026-09-15T00:00:00Z");
  assert.equal(work.sharedMetrics.updatedAt, "2026-09-15T00:00:00Z");
  assert.equal(work.sharedMetrics.notesUpdatedAt, "");
});

test("Multi用ルート自身が作品形式でも子作品があれば親を表示しない", async () => {
  const root = { id: "root", name: "novel_works", folder: {} };
  const child = { id: "child", name: "作品B", folder: {} };
  const provider = makeProvider({
    root: [{ id: "root-meta", name: ".mojigoto", folder: {} }, child],
    "root-meta": [{ id: "root-settings", name: "work.json", file: {} }],
    child: [{ id: "child-meta", name: ".mojigoto", folder: {} }, { id: "child-manuscript", name: "manuscript", folder: {} }],
    "child-meta": [{ id: "child-settings", name: "work.json", file: {} }],
  }, { "root-settings": { title: "親" }, "child-settings": { title: "子" } });
  assert.deepEqual((await discoverWorks(provider, root)).map((work) => work.title), ["子"]);
});

test("作品の総文字数・ノート数と対象ファイルだけの最終更新を集計する", async () => {
  const provider = {
    async listChildren(id) {
      return {
        manuscript: [{ id: "m1", name: "01.txt", file: {}, lastModifiedDateTime: "2026-09-10T00:00:00Z" }],
        meta: [{ id: "plots", name: "plots", folder: {} }, { id: "refs", name: "references", folder: {} }],
        plots: [{ id: "p1", name: "plot.json", file: {}, lastModifiedDateTime: "2026-09-12T00:00:00Z" }],
        refs: [{ id: "r1", name: "ref.json", file: {}, lastModifiedDateTime: "2026-09-11T00:00:00Z" }],
      }[id] || [];
    },
    async readText(item) { return item.id === "m1" ? "一 二\n三" : ""; },
  };
  const metrics = await collectWorkMetrics(provider, {
    manuscript: { id: "manuscript" },
    mojigoto: { id: "meta" },
    settingsFile: { name: "work.json", lastModifiedDateTime: "2026-09-13T00:00:00Z" },
    conceptFile: { name: "concept-memos.json", lastModifiedDateTime: "2026-09-14T00:00:00Z" },
    metricsFile: { name: "work-metrics.json", lastModifiedDateTime: "2026-09-20T00:00:00Z" },
    updatedAt: "2026-09-21T00:00:00Z",
  });
  assert.deepEqual(metrics, { totalChars: 3, noteCount: 2, updatedAt: "2026-09-14T00:00:00Z" });
});

test("本文を読まずに更新日時を先に確定する", async () => {
  let readCount = 0;
  const provider = {
    async listChildren(id) {
      return {
        manuscript: [{ id: "m1", name: "01.txt", file: {}, lastModifiedDateTime: "2026-09-15T00:00:00Z" }],
        meta: [],
      }[id] || [];
    },
    async readText() { readCount += 1; return "本文"; },
  };
  const index = await collectWorkIndex(provider, { manuscript: { id: "manuscript" }, mojigoto: { id: "meta" }, updatedAt: "" });
  assert.equal(index.updatedAt, "2026-09-15T00:00:00Z");
  assert.equal(readCount, 0);
  assert.equal((await collectWorkMetrics(provider, {}, index)).totalChars, 2);
  assert.equal(readCount, 1);
});

test("対象ファイルがない作品は作品フォルダの日時を最終更新に使う", async () => {
  const provider = {
    async listChildren() { return []; },
  };
  const index = await collectWorkIndex(provider, {
    manuscript: { id: "manuscript" },
    mojigoto: { id: "meta" },
    updatedAt: "2026-09-20T00:00:00Z",
  });
  assert.equal(index.updatedAt, "2026-09-20T00:00:00Z");
});

test("更新されていない原稿は文字数キャッシュを再利用する", async () => {
  let readCount = 0;
  const item = {
    id: "m1",
    name: "01.txt",
    file: {},
    eTag: '"version-1"',
    size: 12,
    lastModifiedDateTime: "2026-09-19T00:00:00Z",
  };
  const provider = {
    async readText() { readCount += 1; return "一 二\n三"; },
  };
  const characterCounts = new Map();
  const index = { manuscriptFiles: [item], noteFiles: [], updatedAt: item.lastModifiedDateTime };

  assert.equal((await collectWorkMetrics(provider, {}, index, { characterCounts })).totalChars, 3);
  assert.equal((await collectWorkMetrics(provider, {}, index, { characterCounts })).totalChars, 3);
  assert.equal(readCount, 1);
  assert.equal(characterCounts.size, 1);
});

test("OneDriveの内容タグから作品集計キャッシュキーを作る", () => {
  const work = {
    id: "work",
    manuscript: { id: "manuscript", cTag: '"manuscript-v1"' },
    mojigoto: { id: "meta", cTag: '"meta-v1"' },
    settingsFile: { id: "settings", eTag: '"settings-v1"' },
  };
  const before = workMetricSummaryKey(work);
  work.manuscript.cTag = '"manuscript-v2"';
  assert.notEqual(workMetricSummaryKey(work), before);
  assert.equal(workMetricSummaryKey({ id: "google", manuscript: { eTag: "1" } }), "");
});

test("作品検出時に取得した管理フォルダ情報を集計で再利用する", async () => {
  const listed = [];
  const provider = {
    async listChildren(id) {
      listed.push(id);
      return {
        manuscript: [],
        plots: [{ id: "p1", name: "plot.json", file: {} }],
      }[id] || [];
    },
    async readText() { return ""; },
  };
  const metrics = await collectWorkMetrics(provider, {
    manuscript: { id: "manuscript" },
    mojigoto: { id: "meta" },
    mojigotoChildren: [{ id: "plots", name: "plots", folder: {} }],
    updatedAt: "",
  });
  assert.equal(metrics.noteCount, 1);
  assert.deepEqual(listed, ["manuscript", "plots"]);
});

test("複数作品の原稿・ノート一覧を一括取得する", async () => {
  const batches = [];
  const provider = {
    async listChildrenBatch(ids) {
      batches.push([...ids]);
      return new Map(ids.map((id) => [id, id.startsWith("manuscript")
        ? [{ id: `file-${id}`, name: "01.txt", file: {}, lastModifiedDateTime: "2026-09-18T00:00:00Z" }]
        : [{ id: `note-${id}`, name: "note.json", file: {}, lastModifiedDateTime: "2026-09-19T00:00:00Z" }]]));
    },
  };
  const works = ["a", "b"].map((suffix) => ({
    manuscript: { id: `manuscript-${suffix}` },
    mojigotoChildren: [{ id: `plots-${suffix}`, name: "plots", folder: {} }],
    updatedAt: "",
  }));

  const indexes = await collectWorkIndexes(provider, works);

  assert.deepEqual(batches, [
    ["manuscript-a", "manuscript-b"],
    ["plots-a", "plots-b"],
  ]);
  assert.deepEqual(indexes.map((index) => index.noteFiles.length), [1, 1]);
  assert.deepEqual(indexes.map((index) => index.updatedAt), ["2026-09-19T00:00:00Z", "2026-09-19T00:00:00Z"]);
});
