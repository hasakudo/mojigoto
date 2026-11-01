import assert from "node:assert/strict";
import test from "node:test";
import { createProgressLoading } from "../web/lib/progress-loading.mjs";

function harness() {
  const requests = [], works = [
    { id: "a", title: "作品A", mojigoto: { id: "meta-a" }, metrics: { totalChars: 100 } },
    { id: "b", title: "作品B", mojigoto: { id: "meta-b" }, metrics: { totalChars: 200 } },
  ];
  const documents = new Map(works.flatMap((work, i) => [
    [work.mojigoto.id + "/work-metrics.json", { totalChars: (i + 1) * 100, progress: { dailyRecords: { "2026-10-10": { deltaTotal: (i + 1) * 10 } } } }],
    [work.mojigoto.id + "/notes-index.json", { plots: [{ id: "plot-" + i, title: "ノート", updatedAt: "2026-10-10T00:00:00Z" }], references: [] }],
    [work.mojigoto.id + "/concept-memos.json", { memos: [{ id: "memo-" + i, title: "構想", updatedAt: "2026-10-10T00:00:00Z" }] }],
  ]));
  const state = { works, selectedWork: works[0], provider: {
    async listChildren(id) { requests.push(["list", id]); return [...documents.keys()].filter(key => key.startsWith(id + "/")).map(key => ({ id: key, name: key.split("/").at(-1), file: {} })); },
    async readText(item) { requests.push(["read", item.id]); const raw = documents.get(item.id); return typeof raw === "string" ? raw : JSON.stringify(raw); },
  } };
  return { state, requests, documents, controller: createProgressLoading({ state }) };
}

test("進捗読込は選択作品だけを読み30日分の日別集計と前日を返す", async () => {
  const h = harness(), summary = await h.controller.loadProgressSummaries();
  assert.equal(Object.keys(summary.byDate).length, 30);
  assert.equal(summary.today.work.title, "作品A");
  assert.equal(summary.today.stats.totalCharacters, 100);
  assert.equal(summary.previous.period.date, h.controller.previousProgressDate(summary.today.period.date));
  assert.ok(h.requests.every(row => row[1].startsWith("meta-a")));
  assert.equal(h.state.selectedWork.sharedMetrics.totalChars, 100);
  assert.equal(h.state.selectedWork.metrics, h.state.selectedWork.sharedMetrics);
});

test("月間・年間の全作品集計は各作品の系列と内訳を加算する", async () => {
  const h = harness(), summary = await h.controller.loadMonthlyOverallSummary("2026-10-27");
  assert.equal(summary.work.title, "作品全体");
  assert.equal(summary.stats.totalCharacters, 300);
  assert.equal(summary.stats.monthCharacters, 30); assert.equal(summary.stats.yearCharacters, 30);
  assert.deepEqual(summary.workBreakdown, [{title:"作品A",characters:10},{title:"作品B",characters:20}]);
  assert.equal(summary.monthly.find(row => row.month === "2026-10").characters,30);
  assert.equal(summary.annual.find(row => row.month === "2026-10").characters,30);
});

test("欠損・破損・本文取得失敗は従来の代替値を使い、一覧取得失敗は呼出元へ返す", async () => {
  const h = harness(), fallback = { events: [] };
  assert.equal(await h.controller.readProgressDocument([], "absent.json", fallback), fallback);
  assert.equal(await h.controller.readProgressDocument([{name:"bad.json",id:"bad",file:{}}],"bad.json",fallback),fallback);
  h.state.provider.readText = async () => { throw Error("offline"); };
  assert.equal(await h.controller.readProgressDocument([{name:"work-metrics.json",id:"metrics",file:{}}],"work-metrics.json",fallback),fallback);
  h.state.provider.listChildren = async () => { throw Error("list offline"); };
  await assert.rejects(h.controller.loadProgressSummaries(), /list offline/);
});

test("作品一覧がない場合は選択作品を集計し、管理先がない作品を除く", async () => {
  const h = harness(); h.state.works = [];
  assert.equal((await h.controller.loadMonthlyOverallSummary("2026-10-27")).stats.totalCharacters,100);
  h.state.works = [{id:"unmanaged"},h.state.selectedWork];
  assert.equal((await h.controller.loadMonthlyOverallSummary("2026-10-27")).stats.monthCharacters,10);
  h.state.works = [{id:"unmanaged"}];
  await assert.rejects(h.controller.loadMonthlyOverallSummary("2026-10-27"),/集計できる作品がありません/);
});

test("日付範囲は月年と閏日をまたぎ、未対応の選択日は今日へ戻す", () => {
  const {previousProgressDate,recentProgressDates,normalizeProgressShareDate}=harness().controller;
  assert.equal(previousProgressDate("2024-03-01"),"2024-02-29");
  assert.deepEqual(recentProgressDates("2026-01-01",3),["2025-12-30","2025-12-31","2026-01-01"]);
  const summaries={today:{period:{date:"2026-10-27"}},previous:{period:{date:"2026-10-26"}},byDate:{"2026-10-27":{},"2026-10-26":{}}};
  assert.equal(normalizeProgressShareDate("previous",summaries),"2026-10-26");
  assert.equal(normalizeProgressShareDate("2020-01-01",summaries),"2026-10-27");
});
