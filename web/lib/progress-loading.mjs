import { WRITING_EVENTS_FILE } from "./writing-records.mjs?v=1.0.1";
import { createProgressSummaryFromWebData } from "./progress-data.mjs?v=1.0.1";
import { normalizeNoteIndex } from "./note-index.mjs";
import { normalizeConceptDocument } from "./concept-memos.mjs";

// Load cloud progress documents and aggregate dates; image and share UI stay in the app.
export function createProgressLoading({ state }) {
  async function readProgressDocument(children, fileName, fallback) {
    const file = children.find((item) => item?.file && item.name === fileName);
    if (!file) return fallback;
    try { return JSON.parse(await state.provider.readText(file)); } catch { return fallback; }
  }

  function previousProgressDate(date) {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() - 1);
    return value.toISOString().slice(0, 10);
  }

  function recentProgressDates(endDate, count = 30) {
    const dates = [];
    let date = String(endDate || "");
    for (let index = 0; index < count && /^\d{4}-\d{2}-\d{2}$/.test(date); index += 1) {
      dates.unshift(date);
      date = previousProgressDate(date);
    }
    return dates;
  }

  function normalizeProgressShareDate(value, summaries) {
    const todayDate = String(summaries?.today?.period?.date || "");
    const previousDate = String(summaries?.previous?.period?.date || "");
    const requested = value === "previous"
      ? previousDate
      : value === "today"
        ? todayDate
        : String(value || "");
    return summaries?.byDate?.[requested] ? requested : todayDate;
  }

  async function loadProgressSummaries() {
    const work = state.selectedWork;
    if (!work?.mojigoto) throw new Error("作品の .mojigoto フォルダが見つかりません。");
    const children = await state.provider.listChildren(work.mojigoto.id);
    work.mojigotoChildren = children;
    const [writingEventsDocument, noteIndexRaw, conceptRaw, sharedMetrics] = await Promise.all([
      readProgressDocument(children, WRITING_EVENTS_FILE, { events: [] }),
      readProgressDocument(children, "notes-index.json", { plots: [], references: [] }),
      readProgressDocument(children, "concept-memos.json", { memos: [] }),
      readProgressDocument(children, "work-metrics.json", work.sharedMetrics || work.metrics || {}),
    ]);
    work.sharedMetrics = sharedMetrics;
    work.metrics = sharedMetrics;
    const input = {
      work,
      writingEventsDocument,
      noteIndex: normalizeNoteIndex(noteIndexRaw),
      conceptDocument: normalizeConceptDocument(conceptRaw),
    };
    const today = createProgressSummaryFromWebData(input);
    const byDate = Object.fromEntries(recentProgressDates(today.period.date).map((date) => [
      date,
      date === today.period.date
        ? today
        : createProgressSummaryFromWebData({ ...input, date }),
    ]));
    const previousDate = previousProgressDate(today.period.date);
    return {
      today,
      previous: byDate[previousDate],
      byDate,
    };
  }

  async function loadMonthlyOverallSummary(date) {
    const works = state.works.length ? state.works : [state.selectedWork].filter(Boolean);
    const summaries = (await Promise.all(works.map(async (work) => {
      if (!work?.mojigoto?.id) return null;
      const children = await state.provider.listChildren(work.mojigoto.id);
      work.mojigotoChildren = children;
      const [writingEventsDocument, noteIndexRaw, conceptRaw, sharedMetrics] = await Promise.all([
        readProgressDocument(children, WRITING_EVENTS_FILE, { events: [] }),
        readProgressDocument(children, "notes-index.json", { plots: [], references: [] }),
        readProgressDocument(children, "concept-memos.json", { memos: [] }),
        readProgressDocument(children, "work-metrics.json", work.sharedMetrics || work.metrics || {}),
      ]);
      work.sharedMetrics = sharedMetrics;
      work.metrics = sharedMetrics;
      return createProgressSummaryFromWebData({
        date,
        work,
        writingEventsDocument,
        noteIndex: normalizeNoteIndex(noteIndexRaw),
        conceptDocument: normalizeConceptDocument(conceptRaw),
      });
    }))).filter(Boolean);
    if (!summaries.length) throw new Error("月間進捗を集計できる作品がありません。");
    const base = summaries[0];
    const requiredSeries = ["daily", "monthly", "annual"];
    if (summaries.some((summary) => requiredSeries.some((key) => !Array.isArray(summary?.[key])))) {
      throw new Error("進捗集計データを更新できませんでした。ページを再読み込みして、もう一度お試しください。");
    }
    const monthly = base.monthly.map((row) => ({
      month: row.month,
      characters: summaries.reduce((total, summary) => total + Number(summary.monthly.find((item) => item.month === row.month)?.characters || 0), 0),
    }));
    const annual = base.annual.map((row) => ({
      month: row.month,
      characters: summaries.reduce((total, summary) => total + Number(summary.annual.find((item) => item.month === row.month)?.characters || 0), 0),
    }));
    const daily = base.daily.map((row) => ({
      date: row.date,
      characters: summaries.reduce((total, summary) => total + Number(summary.daily.find((item) => item.date === row.date)?.characters || 0), 0),
    }));
    return {
      ...base,
      work: { titleVisible: true, title: "作品全体" },
      stats: {
        ...base.stats,
        totalCharacters: summaries.reduce((total, summary) => total + Number(summary.stats.totalCharacters || 0), 0),
        monthCharacters: summaries.reduce((total, summary) => total + Number(summary.stats.monthCharacters || 0), 0),
        notesUpdatedThisMonth: summaries.reduce((total, summary) => total + Number(summary.stats.notesUpdatedThisMonth || 0), 0),
        conceptMemosUpdatedThisMonth: summaries.reduce((total, summary) => total + Number(summary.stats.conceptMemosUpdatedThisMonth || 0), 0),
        yearCharacters: summaries.reduce((total, summary) => total + Number(summary.stats.yearCharacters || 0), 0),
        notesUpdatedThisYear: summaries.reduce((total, summary) => total + Number(summary.stats.notesUpdatedThisYear || 0), 0),
        conceptMemosUpdatedThisYear: summaries.reduce((total, summary) => total + Number(summary.stats.conceptMemosUpdatedThisYear || 0), 0),
      },
      daily,
      monthly,
      annual,
      workBreakdown: summaries.map((summary) => ({
        title: summary.work.title || "作品名未設定",
        characters: Number(summary.stats.monthCharacters || 0),
      })).filter((row) => row.characters !== 0),
      annualWorkBreakdown: summaries.map((summary) => ({
        title: summary.work.title || "作品名未設定",
        characters: Number(summary.stats.yearCharacters || 0),
      })).filter((row) => row.characters !== 0),
    };
  }
  return { readProgressDocument, previousProgressDate, recentProgressDates, normalizeProgressShareDate, loadProgressSummaries, loadMonthlyOverallSummary };
}
