import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createProgressSummary as createWebProgressSummary } from "../web/lib/progress-summary.mjs";
import { createProgressSummaryFromWebData, mergeProgressDailyRecords, progressTotalAtDate, writingEventsToDailyRecords } from "../web/lib/progress-data.mjs";

const require = createRequire(import.meta.url);
const {
  createProgressSummary: createDesktopProgressSummary,
  createProgressSummaryFromStatsState,
} = require("../src/progress/progress-summary");
const {
  decodeProgressImageDataUrl,
  sanitizeProgressImageFileNamePart,
} = require("../src/progress/progress-image");
const { renderDashboardNoteModal, renderProgressShareModal, renderProgressSummaryDataScript, renderDashboardTab } = require("../src/stats/stats-html/stats-html-dashboard");
const { makeStatsScript } = require("../src/stats/stats-html/stats-html-script");

test("SNS進捗画像のファイル名に使えない文字を安全に整形する", () => {
  assert.equal(
    sanitizeProgressImageFileNamePart('  星:空/海?  '),
    "星 空 海",
  );
  assert.equal(sanitizeProgressImageFileNamePart("...", "作品"), "作品");
});

test("SNS進捗画像はPNGデータだけを保存対象として受け付ける", () => {
  const pngBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  const dataUrl = `data:image/png;base64,${pngBytes.toString("base64")}`;
  assert.deepEqual(decodeProgressImageDataUrl(dataUrl), pngBytes);
  assert.throws(
    () => decodeProgressImageDataUrl("data:image/jpeg;base64,AAAA"),
    /PNG画像の形式/,
  );
});

const input = {
  generatedAt: "2026-09-23T06:30:00.000Z",
  timeZone: "Asia/Tokyo",
  date: "2026-09-23",
  workTitle: "星を渡る舟",
  totalCharacters: 54321,
  dailyRecords: {
    "2026-09-17": { deltaTotal: 120 },
    "2026-09-19": { deltaTotal: -20 },
    "2026-09-23": { deltaTotal: 850 },
  },
  noteUpdates: [
    { id: "note-a", updatedAt: "2026-09-23T00:00:00.000Z" },
    { id: "note-a", updatedAt: "2026-09-23T01:00:00.000Z" },
    { id: "note-b", summary: { id: "note-b", updatedAt: "2026-09-22T23:30:00.000Z" } },
  ],
  conceptMemoUpdates: [
    { id: "memo-a", updatedAt: "2026-09-23T14:59:00+09:00" },
    { id: "memo-b", updatedAt: "2026-09-22T14:59:00+09:00" },
  ],
};

test("VS Code版とWeb版で同じSNS進捗概要を生成する", () => {
  const desktop = createDesktopProgressSummary(input);
  const web = createWebProgressSummary(input);

  assert.deepEqual(web, desktop);
  assert.equal(desktop.stats.totalCharacters, 54321);
  assert.equal(desktop.stats.todayCharacters, 850);
  assert.equal(desktop.stats.last7DaysCharacters, 950);
  assert.equal(desktop.stats.notesUpdatedToday, 2);
  assert.equal(desktop.stats.conceptMemosUpdatedToday, 1);
  assert.equal(desktop.stats.monthCharacters, 950);
  assert.equal(desktop.stats.notesUpdatedThisMonth, 2);
  assert.equal(desktop.stats.conceptMemosUpdatedThisMonth, 2);
  assert.equal(desktop.stats.yearCharacters, 950);
  assert.equal(desktop.stats.notesUpdatedThisYear, 2);
  assert.equal(desktop.stats.conceptMemosUpdatedThisYear, 2);
  assert.equal(desktop.monthly.length, 6);
  assert.equal(desktop.annual.length, 12);
  assert.equal(desktop.monthly.at(-1).month, "2026-09");
  assert.deepEqual(desktop.daily.map((row) => row.date), [
    "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23",
  ]);
});

test("月間まとめは6か月を月別集計し0文字の作品を内訳から除く", () => {
  const summary = createDesktopProgressSummary({
    ...input,
    dailyRecords: {
      "2026-04-30": { deltaTotal: 100 },
      "2026-05-01": { deltaTotal: 200 },
      "2026-08-31": { deltaTotal: 300 },
      "2026-09-01": { deltaTotal: 400 },
      "2026-09-23": { deltaTotal: 500 },
    },
    workBreakdown: [
      { title: "星を渡る舟", characters: 900 },
      { title: "休載中", characters: 0 },
    ],
    annualWorkBreakdown: [
      { title: "星を渡る舟", characters: 1500 },
      { title: "休載中", characters: 0 },
    ],
  });
  assert.deepEqual(summary.monthly.map((row) => row.month), [
    "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09",
  ]);
  assert.deepEqual(summary.monthly.map((row) => row.characters), [100, 200, 0, 0, 300, 900]);
  assert.equal(summary.stats.monthCharacters, 900);
  assert.deepEqual(summary.workBreakdown, [{ title: "星を渡る舟", characters: 900 }]);
  assert.equal(summary.stats.yearCharacters, 1500);
  assert.deepEqual(summary.annualWorkBreakdown, [{ title: "星を渡る舟", characters: 1500 }]);
});

test("年間まとめに必要な進捗履歴を400日保持する", async () => {
  const [packageJson, statsConfig, statsState, sharedMetrics] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../src/stats/stats-config.js", import.meta.url), "utf8"),
    readFile(new URL("../src/stats/stats-state.js", import.meta.url), "utf8"),
    readFile(new URL("../src/stats/shared-work-metrics.js", import.meta.url), "utf8"),
  ]);
  assert.equal(packageJson.contributes.configuration.properties["mojigoto.dailyRetentionDays"].default, 400);
  assert.match(statsConfig, /dailyRetentionDays", 400/);
  assert.match(statsState, /buildRecentDailyRows\(daily, dateJst, 400\)/);
  assert.match(sharedMetrics, /slice\(-400\)/);
});

test("作品名を非表示にすると共通データにも作品名を残さない", () => {
  const summary = createDesktopProgressSummary({ ...input, titleVisible: false });
  assert.deepEqual(summary.work, { titleVisible: false, title: "" });
  assert.equal(JSON.stringify(summary).includes(input.workTitle), false);
});

test("共通スキーマは7日分と個人情報を含まない構造を定義する", async () => {
  const schema = JSON.parse(await readFile(new URL("../docs/progress-summary.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.properties.schemaVersion.const, 1);
  assert.equal(schema.properties.daily.minItems, 7);
  assert.equal(schema.properties.daily.maxItems, 7);
  assert.equal(schema.properties.monthly.minItems, 6);
  assert.equal(schema.properties.monthly.maxItems, 6);
  assert.ok(schema.properties.workBreakdown);
  assert.equal(schema.properties.annual.minItems, 12);
  assert.equal(schema.properties.annual.maxItems, 12);
  assert.ok(schema.properties.annualWorkBreakdown);
  for (const privateKey of ["email", "userId", "cloudId", "fileId", "path", "content"]) {
    assert.equal(JSON.stringify(schema).includes(`\"${privateKey}\"`), false);
  }
});

test("VS CodeのDashboard実データを共通形式へ変換する", () => {
  const summary = createProgressSummaryFromStatsState({
    currentWorkTitle: "星を渡る舟",
    today: { totalSaved: 54321 },
    last7: Object.entries(input.dailyRecords).map(([date, row]) => ({ date, ...row })),
  }, {
    generatedAt: input.generatedAt,
    date: input.date,
    noteUpdates: input.noteUpdates,
    conceptMemoUpdates: input.conceptMemoUpdates,
  });
  assert.equal(summary.stats.totalCharacters, 54321);
  assert.equal(summary.stats.todayCharacters, 850);
  assert.equal(summary.work.title, "星を渡る舟");
});

test("選択した前日を基準に当日差分・7日間・総文字数を生成する", () => {
  const dailyRecords = Object.fromEntries([
    ["2026-09-16", 10, 900], ["2026-09-17", 20, 920], ["2026-09-18", 30, 950],
    ["2026-09-19", 40, 990], ["2026-09-20", 50, 1040], ["2026-09-21", 60, 1100],
    ["2026-09-22", 70, 1170], ["2026-09-23", 80, 1250],
  ].map(([date, deltaTotal, totalSaved]) => [date, { deltaTotal, totalSaved }]));
  const summary = createProgressSummaryFromStatsState({
    currentWorkTitle: "星を渡る舟",
    today: { totalSaved: 1250 },
    progressDailyRecords: dailyRecords,
  }, { generatedAt: input.generatedAt, date: "2026-09-22" });
  assert.equal(summary.period.date, "2026-09-22");
  assert.equal(summary.stats.todayCharacters, 70);
  assert.equal(summary.stats.last7DaysCharacters, 280);
  assert.equal(summary.stats.totalCharacters, 1170);
});

test("Webの共有記録・索引・構想メモを共通形式へ変換する", () => {
  const writingEventsDocument = {
    events: [
      { id: "a", dateJst: "2026-09-23", delta: 500 },
      { id: "b", dateJst: "2026-09-23", delta: 350 },
      { id: "invalid", dateJst: "invalid", delta: 999 },
    ],
  };
  assert.deepEqual(writingEventsToDailyRecords(writingEventsDocument), {
    "2026-09-23": { deltaTotal: 850 },
  });
  const summary = createProgressSummaryFromWebData({
    generatedAt: input.generatedAt,
    date: input.date,
    work: { title: input.workTitle, sharedMetrics: { totalChars: 54321 } },
    writingEventsDocument,
    noteIndex: { plots: input.noteUpdates, references: [] },
    conceptDocument: { memos: input.conceptMemoUpdates },
  });
  assert.equal(summary.stats.totalCharacters, 54321);
  assert.equal(summary.stats.todayCharacters, 850);
  assert.equal(summary.stats.notesUpdatedToday, 2);
  assert.equal(summary.stats.conceptMemosUpdatedToday, 1);
});

test("WebはVS Code共有進捗へ未取込のWeb差分だけを加える", () => {
  const summary = createProgressSummaryFromWebData({
    generatedAt: input.generatedAt,
    date: input.date,
    work: {
      title: input.workTitle,
      sharedMetrics: {
        totalChars: 54321,
        progress: {
          dailyRecords: {
            "2026-09-22": { deltaTotal: 100 },
            "2026-09-23": { deltaTotal: 800 },
          },
          includedWebEventIds: ["web_imported"],
        },
      },
    },
    writingEventsDocument: { events: [
      { id: "web_imported", dateJst: "2026-09-23", delta: 50 },
      { id: "web_pending", dateJst: "2026-09-23", delta: 25 },
    ] },
  });
  assert.equal(summary.stats.todayCharacters, 825);
  assert.equal(summary.stats.last7DaysCharacters, 925);
  assert.deepEqual(mergeProgressDailyRecords(
    { "2026-09-23": { deltaTotal: 800 } },
    { "2026-09-23": { deltaTotal: 25 } },
  )["2026-09-23"].deltaTotal, 825);
});

test("Webの前日総文字数は保存のない日も直前の記録を引き継ぐ", () => {
  const dailyRecords = {
    "2026-09-20": { deltaTotal: 100, totalSaved: 1000 },
    "2026-09-23": { deltaTotal: 250, totalSaved: 1250 },
  };
  assert.equal(progressTotalAtDate(dailyRecords, "2026-09-22"), 1000);
  const summary = createProgressSummaryFromWebData({
    generatedAt: input.generatedAt,
    date: "2026-09-22",
    work: {
      title: input.workTitle,
      sharedMetrics: { totalChars: 1250, progress: { dailyRecords } },
    },
  });
  assert.equal(summary.stats.totalCharacters, 1000);
  assert.equal(summary.stats.todayCharacters, 0);
});

test("VS Code DashboardでSNS進捗の表示項目を選んでプレビューできる", () => {
  const summary = createDesktopProgressSummary(input);
  const modal = renderProgressShareModal();
  const data = renderProgressSummaryDataScript({ progressSummary: summary });

  assert.match(modal, /id="progressShareModal"/);
  assert.match(modal, /data-progress-share-option="title"/);
  assert.match(modal, /data-progress-share-option="graph"/);
  assert.match(modal, /data-progress-share-option="concepts"/);
  assert.match(modal, /id="progressShareDateSelect"/);
  assert.match(modal, /id="progressShareMode"/);
  assert.match(modal, /data-progress-share-option="works"/);
  assert.match(modal, /月間（直近6か月）/);
  assert.match(modal, /年間（指定年1～12月）/);
  assert.match(modal, /id="progressShareYearSelect"/);
  assert.match(modal, /保持期間を過ぎた履歴は集計できません/);
  assert.match(modal, /400日程度/);
  assert.match(modal, /Webからは保持日数を確認・変更できません/);
  assert.match(modal, /id="progressShareDateSelect" type="date"/);
  assert.match(modal, /対象日の進捗/);
  assert.doesNotThrow(() => new Function(makeStatsScript()));
  assert.match(modal, /id="progressShareCopyButton"/);
  assert.match(modal, /id="progressShareSaveButton"/);
  assert.match(modal, /id="progressShareTextButton"/);
  assert.equal(modal.match(/id="progressShareTextButton"/g)?.length, 1);
  assert.match(makeStatsScript(), /function createProgressShareText/);
  assert.match(makeStatsScript(), /progressShareBars .*is-monthly/);
  assert.match(require("../src/stats/stats-html/stats-html-styles").makeStatsStyles(), /\.progressShareBars\.is-monthly[\s\S]*?repeat\(6/);
  assert.match(modal, /id="progressSharePreviewScaler"/);
  assert.match(modal, /幅720px/);
  assert.match(modal, /内容に合わせた縦長/);
  assert.match(data, /星を渡る舟/);
  assert.match(data, /"last7DaysCharacters":950/);
  assert.match(renderDashboardNoteModal(), /id="dashboardNoteModal"/);

  const dashboard = renderDashboardTab({
    currentWorkTitle: "星を渡る舟",
    today: { deltaTotal: 850, totalSaved: 54321 },
    last7: [],
    dashboardNotes: {},
    dashboardVisibility: {},
  }, (value) => String(value ?? ""));
  const firstGroup = dashboard.indexOf('<section class="dashboardSummaryCol">');
  const secondGroup = dashboard.indexOf('<section class="dashboardSummaryCol">', firstGroup + 1);
  const previewButton = dashboard.indexOf('id="btnOpenProgressSharePreview"');
  assert.ok(previewButton > firstGroup && previewButton < secondGroup);
  assert.equal(dashboard.match(/id="btnOpenProgressSharePreview"/g)?.length, 1);
});

test("WebでもSNS進捗画像をプレビュー・保存・コピーできる", async () => {
  const [html, app, styles, statsState, progressData, serviceWorker] = await Promise.all([
    readFile(new URL("../web/index.html", import.meta.url), "utf8"),
    readFile(new URL("../web/app.mjs", import.meta.url), "utf8"),
    readFile(new URL("../web/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../src/stats/stats-state.js", import.meta.url), "utf8"),
    readFile(new URL("../web/lib/progress-data.mjs", import.meta.url), "utf8"),
    readFile(new URL("../web/sw.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /id="openProgressShareButton"/);
  assert.match(html, /id="progressShareCanvas"/);
  assert.match(html, /id="saveProgressShareButton"/);
  assert.match(html, /id="copyProgressShareButton"/);
  assert.match(html, /id="copyProgressShareTextButton"/);
  assert.match(html, />投稿文</);
  assert.match(html, />保存</);
  assert.match(html, />コピー</);
  assert.match(html, /id="shareProgressButton"/);
  assert.match(html, />共有</);
  assert.match(html, /id="progressShareDateSelect"/);
  assert.match(html, /id="progressShareMode"/);
  assert.match(html, /年間（指定年1～12月）/);
  assert.match(html, /id="progressShareYearSelect"/);
  assert.match(html, /class="progress-share-display-options"/);
  assert.match(html, /保持期間を過ぎた履歴は集計できません/);
  assert.match(html, /VS CodeのDashboard/);
  assert.match(html, /value="works"/);
  assert.match(app, /loadMonthlyOverallSummary/);
  assert.match(await readFile(new URL("../web/lib/progress-rendering.mjs", import.meta.url), "utf8"), /直近6か月の執筆/);
  assert.match(await readFile(new URL("../web/lib/progress-rendering.mjs", import.meta.url), "utf8"), /年間の執筆/);
  assert.match(await readFile(new URL("../web/lib/progress-rendering.mjs", import.meta.url), "utf8"), /summary\.annual/);
  assert.match(await readFile(new URL("../web/lib/progress-loading.mjs", import.meta.url), "utf8"), /progress-data\.mjs\?v=1\.0\.1/);
  assert.match(progressData, /progress-summary\.mjs\?v=1\.0\.1/);
  assert.match(serviceWorker, /progress-data\.mjs\?v=1\.0\.1/);
  assert.match(serviceWorker, /progress-summary\.mjs\?v=1\.0\.1/);
  assert.match(await readFile(new URL("../web/lib/progress-loading.mjs", import.meta.url), "utf8"), /requiredSeries = \["daily", "monthly", "annual"\]/);
  assert.match(await readFile(new URL("../web/lib/progress-loading.mjs", import.meta.url), "utf8"), /進捗集計データを更新できませんでした。ページを再読み込み/);
  assert.match(styles, /\.progress-share-display-options > div \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /@media \(max-width: 680px\)[\s\S]*\.progress-share-display-options > div \{ grid-template-columns: 1fr/);
  assert.match(html, /id="progressShareDateSelect" type="date"/);
  assert.match(await readFile(new URL("../web/lib/progress-loading.mjs", import.meta.url), "utf8"), /createProgressSummaryFromWebData/);
  assert.match(app, /recentProgressDates/);
  assert.match(app, /normalizeProgressShareDate/);
  assert.match(await readFile(new URL("../web/lib/progress-rendering.mjs", import.meta.url), "utf8"), /function createProgressShareText/);
  assert.match(await readFile(new URL("../web/lib/progress-actions.mjs", import.meta.url), "utf8"), /SNS投稿文をクリップボードへコピーしました/);
  assert.match(await readFile(new URL("../web/lib/progress-actions.mjs", import.meta.url), "utf8"), /navigator\.share\(shareData\)/);
  assert.match(await readFile(new URL("../web/lib/progress-actions.mjs", import.meta.url), "utf8"), /navigator\.canShare\(\{ files: \[file\] \}\)/);
  assert.match(await readFile(new URL("../web/lib/progress-actions.mjs", import.meta.url), "utf8"), /function progressShareBlobSync/);
  assert.match(app, /parentElement\?\.classList\.toggle\("has-share"/);
  assert.match(statsState, /byDate: progressSummariesByDate/);
  assert.match(await readFile(new URL("../web/lib/progress-actions.mjs", import.meta.url), "utf8"), /navigator\.clipboard\.write/);
  assert.match(await readFile(new URL("../web/lib/progress-rendering.mjs", import.meta.url), "utf8"), /image\.src = "\.\/logo\.png"/);
  assert.match(await readFile(new URL("../web/lib/progress-rendering.mjs", import.meta.url), "utf8"), /drawImage\(logo, padding \+ 11, 45, 38, 38\)/);
  assert.match(await readFile(new URL("../web/lib/progress-rendering.mjs", import.meta.url), "utf8"), /contentAreaTop = 108/);
  assert.match(await readFile(new URL("../web/lib/progress-rendering.mjs", import.meta.url), "utf8"), /graphBlockHeight = options\.graph \? 248 : 0/);
  assert.match(await readFile(new URL("../web/lib/progress-rendering.mjs", import.meta.url), "utf8"), /metricHeight = 126/);
  assert.match(await readFile(new URL("../web/lib/progress-actions.mjs", import.meta.url), "utf8"), /link\.download = `もじごと進捗_/);
  assert.match(styles, /dialog\.progress-share-dialog/);
  assert.match(styles, /> div\.has-share \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.progress-share-action \{ width: 100%/);
});
