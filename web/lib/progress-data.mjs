import { createProgressSummary } from "./progress-summary.mjs?v=1.0.1";

export function writingEventsToDailyRecords(document = {}, excludedIds = []) {
  const excluded = new Set((Array.isArray(excludedIds) ? excludedIds : []).map(String));
  const records = new Map();
  for (const event of Array.isArray(document?.events) ? document.events : []) {
    if (excluded.has(String(event?.id || ""))) continue;
    const date = String(event?.dateJst || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    records.set(date, (records.get(date) || 0) + (Number(event?.delta) || 0));
  }
  return Object.fromEntries([...records].map(([date, deltaTotal]) => [date, { deltaTotal }]));
}

export function mergeProgressDailyRecords(base = {}, additions = {}) {
  const dates = [...new Set([...Object.keys(base || {}), ...Object.keys(additions || {})])].sort();
  let lastTotal = null;
  return Object.fromEntries(dates.map((date) => {
    const pendingDelta = Number(additions?.[date]?.deltaTotal || 0);
    const row = {
      deltaTotal: Number(base?.[date]?.deltaTotal || 0) + pendingDelta,
    };
    if (Object.prototype.hasOwnProperty.call(base?.[date] || {}, "totalSaved")) {
      row.totalSaved = Number(base[date].totalSaved || 0) + pendingDelta;
      lastTotal = row.totalSaved;
    } else if (lastTotal !== null) {
      row.totalSaved = lastTotal + pendingDelta;
      lastTotal = row.totalSaved;
    }
    return [date, row];
  }));
}

export function progressTotalAtDate(dailyRecords = {}, targetDate = "") {
  const latest = Object.entries(dailyRecords || {})
    .filter(([date, row]) => date <= targetDate
      && Object.prototype.hasOwnProperty.call(row || {}, "totalSaved")
      && Number.isFinite(Number(row.totalSaved)))
    .sort(([left], [right]) => left.localeCompare(right))
    .at(-1);
  return latest ? Number(latest[1].totalSaved) : null;
}

export function createProgressSummaryFromWebData(input = {}) {
  const work = input.work || {};
  const noteIndex = input.noteIndex || {};
  const conceptDocument = input.conceptDocument || {};
  const metrics = work.sharedMetrics || work.metrics || {};
  const sharedProgress = metrics.progress || {};
  const webDailyRecords = writingEventsToDailyRecords(
    input.writingEventsDocument,
    sharedProgress.includedWebEventIds,
  );
  const dailyRecords = mergeProgressDailyRecords(sharedProgress.dailyRecords, webDailyRecords);
  const targetTotal = progressTotalAtDate(dailyRecords, String(input.date || ""));
  return createProgressSummary({
    generatedAt: input.generatedAt,
    timeZone: input.timeZone,
    date: input.date,
    workTitle: work.title,
    titleVisible: input.titleVisible,
    totalCharacters: targetTotal !== null ? targetTotal : metrics.totalChars,
    dailyRecords,
    noteUpdates: [...(noteIndex.plots || []), ...(noteIndex.references || [])],
    conceptMemoUpdates: conceptDocument.memos || [],
    workBreakdown: input.workBreakdown,
    annualWorkBreakdown: input.annualWorkBreakdown,
  });
}
