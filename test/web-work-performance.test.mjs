import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("作品一覧は保存済みの並び順で先行表示し、最新情報は並び順を確定して更新する", async () => {
  const [html, app, provider] = await Promise.all([
    readFile(new URL("../web/index.html", import.meta.url), "utf8"),
    readFile(new URL("../web/app.mjs", import.meta.url), "utf8"),
    readFile(new URL("../web/storage/onedrive-provider.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(html, /id="workMetricsToggle"/);
  assert.match(html, /id="copyPerformanceButton"/);
  assert.match(app, /onSkeletons\(works\)/);
  assert.match(app, /collectWorkIndexes\(provider, pendingWorks\)/);
  assert.match(app, /workMetricSummaryKey\(work\)/);
  assert.match(app, /WORK_CHARACTER_CACHE_KEY/);
  assert.match(app, /WORK_SHARED_METRICS_CACHE_KEY/);
  assert.match(app, /persistWorkSharedMetrics\(\)/);
  assert.match(app, /WORK_CATALOG_CACHE_KEY/);
  assert.match(app, /readWorkCatalog\(root\)/);
  assert.match(app, /const waitForDetailedSort = sortField === "totalChars" \|\| sortField === "noteCount"/);
  assert.match(app, /const waitForIndexSort = sortField === "updatedAt"/);
  assert.match(app, /if \(!waitForIndexSort && !waitForDetailedSort\) renderStableList\(\)/);
  assert.match(app, /if \(waitForIndexSort\) renderStableList\(\)/);
  assert.match(app, /if \(waitForDetailedSort\) renderStableList\(\)/);
  assert.match(app, /if \(state\.worksOrderPending\) return/);
  assert.match(app, /source: "cache"/);
  assert.match(app, /文字数・ノート数を集計しています/);
  assert.match(app, /const VIEW_CACHE_DURATION = 30000/);
  assert.match(app, /listChildrenCached\(folder\)/);
  assert.match(app, /state\.workSettingsDocuments\.get\(cacheKey\)/);
  assert.match(await readFile(new URL("../web/lib/view-navigation.mjs", import.meta.url), "utf8"), /openConceptMemos\(\{ reveal: false \}\)/);
  assert.match(app, /beginPerformanceMeasurement\("作品一覧・先行表示"/);
  assert.match(app, /beginPerformanceMeasurement\("作品一覧・全処理完了"/);
  assert.match(app, /beginPerformanceMeasurement\("原稿一覧"/);
  assert.match(app, /beginPerformanceMeasurement\("構想メモ一覧"/);
  assert.match(app, /formatPerformanceSamples\(\)/);
  assert.match(provider, /async listChildrenBatch\(folderIds\)/);
  assert.match(provider, /GRAPH_BATCH_LIMIT = 20/);
});
