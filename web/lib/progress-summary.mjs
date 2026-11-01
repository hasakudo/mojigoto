export const PROGRESS_SUMMARY_SCHEMA_VERSION = 1;
export const PROGRESS_SUMMARY_KIND = "mojigoto-progress-summary";
export const DEFAULT_TIME_ZONE = "Asia/Tokyo";

function safeInteger(value, { minimum = Number.MIN_SAFE_INTEGER } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return Math.max(0, minimum);
  return Math.max(minimum, Math.round(number));
}

export function dateInTimeZone(value, timeZone = DEFAULT_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  const validDate = Number.isNaN(date.getTime()) ? new Date() : date;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(validDate).reduce((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    return dateInTimeZone(validDate, DEFAULT_TIME_ZONE);
  }
}

export function recentDateKeys(endDate, count = 7) {
  const [year, month, day] = String(endDate || "").split("-").map(Number);
  const end = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(end.getTime())) return recentDateKeys(dateInTimeZone(new Date()), count);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (count - index - 1));
    return date.toISOString().slice(0, 10);
  });
}

export function recentMonthKeys(endDate, count = 6) {
  const [year, month] = String(endDate || "").split("-").map(Number);
  const end = new Date(Date.UTC(year, month - 1, 1));
  if (Number.isNaN(end.getTime())) return recentMonthKeys(dateInTimeZone(new Date()), count);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (count - index - 1), 1));
    return date.toISOString().slice(0, 7);
  });
}

function dailyValue(row) {
  if (typeof row === "number") return safeInteger(row);
  return safeInteger(row?.characters ?? row?.deltaTotal ?? row?.delta ?? 0);
}

function dailyMap(records) {
  if (!records || typeof records !== "object") return new Map();
  if (Array.isArray(records)) {
    return new Map(records.map((row) => [String(row?.date || ""), dailyValue(row)]).filter(([date]) => date));
  }
  return new Map(Object.entries(records).map(([date, row]) => [date, dailyValue(row)]));
}

function updateTimestamp(record) {
  if (typeof record === "string" || record instanceof Date) return record;
  return record?.updatedAt || record?.summary?.updatedAt || record?.data?.updatedAt || record?.item?.lastModifiedDateTime || "";
}

function countUpdatesOnDate(records, targetDate, timeZone) {
  const seen = new Set();
  let count = 0;
  (Array.isArray(records) ? records : []).forEach((record, index) => {
    const timestamp = updateTimestamp(record);
    if (!timestamp || dateInTimeZone(timestamp, timeZone) !== targetDate) return;
    const id = typeof record === "object" && record
      ? String(record.id || record.summary?.id || record.data?.id || record.item?.id || index)
      : String(index);
    if (seen.has(id)) return;
    seen.add(id);
    count += 1;
  });
  return count;
}

function countUpdatesInMonth(records, targetMonth, timeZone) {
  const seen = new Set();
  (Array.isArray(records) ? records : []).forEach((record, index) => {
    const timestamp = updateTimestamp(record);
    if (!timestamp || !dateInTimeZone(timestamp, timeZone).startsWith(`${targetMonth}-`)) return;
    const id = typeof record === "object" && record
      ? String(record.id || record.summary?.id || record.data?.id || record.item?.id || index)
      : String(index);
    seen.add(id);
  });
  return seen.size;
}

function countUpdatesInYear(records, targetYear, timeZone) {
  const seen = new Set();
  (Array.isArray(records) ? records : []).forEach((record, index) => {
    const timestamp = updateTimestamp(record);
    if (!timestamp || !dateInTimeZone(timestamp, timeZone).startsWith(`${targetYear}-`)) return;
    const id = typeof record === "object" && record
      ? String(record.id || record.summary?.id || record.data?.id || record.item?.id || index)
      : String(index);
    seen.add(id);
  });
  return seen.size;
}

export function createProgressSummary(input = {}) {
  const generatedDate = input.generatedAt instanceof Date ? input.generatedAt : new Date(input.generatedAt || Date.now());
  const validGeneratedDate = Number.isNaN(generatedDate.getTime()) ? new Date() : generatedDate;
  const timeZone = String(input.timeZone || DEFAULT_TIME_ZONE);
  const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(String(input.date || ""))
    ? String(input.date)
    : dateInTimeZone(validGeneratedDate, timeZone);
  const dateKeys = recentDateKeys(targetDate, 7);
  const values = dailyMap(input.dailyRecords);
  const daily = dateKeys.map((date) => ({ date, characters: values.get(date) || 0 }));
  const monthKeys = recentMonthKeys(targetDate, 6);
  const monthly = monthKeys.map((month) => ({
    month,
    characters: [...values.entries()].reduce((total, [date, value]) => date.startsWith(`${month}-`) ? total + value : total, 0),
  }));
  const targetMonth = targetDate.slice(0, 7);
  const targetYear = targetDate.slice(0, 4);
  const annual = Array.from({ length: 12 }, (_, index) => {
    const month = `${targetYear}-${String(index + 1).padStart(2, "0")}`;
    return {
      month,
      characters: [...values.entries()].reduce((total, [date, value]) => date.startsWith(`${month}-`) ? total + value : total, 0),
    };
  });
  const workBreakdown = (Array.isArray(input.workBreakdown) ? input.workBreakdown : [])
    .map((row) => ({ title: String(row?.title || "").trim(), characters: safeInteger(row?.characters || 0) }))
    .filter((row) => row.title && row.characters !== 0);
  const annualWorkBreakdown = (Array.isArray(input.annualWorkBreakdown) ? input.annualWorkBreakdown : [])
    .map((row) => ({ title: String(row?.title || "").trim(), characters: safeInteger(row?.characters || 0) }))
    .filter((row) => row.title && row.characters !== 0);
  const titleVisible = input.titleVisible !== false;
  return {
    schemaVersion: PROGRESS_SUMMARY_SCHEMA_VERSION,
    kind: PROGRESS_SUMMARY_KIND,
    generatedAt: validGeneratedDate.toISOString(),
    timeZone,
    period: {
      date: targetDate,
      startDate: dateKeys[0],
      endDate: dateKeys.at(-1),
      days: 7,
    },
    work: {
      titleVisible,
      title: titleVisible ? String(input.workTitle || "").trim() : "",
    },
    stats: {
      totalCharacters: safeInteger(input.totalCharacters, { minimum: 0 }),
      todayCharacters: daily.at(-1).characters,
      last7DaysCharacters: daily.reduce((total, row) => total + row.characters, 0),
      notesUpdatedToday: countUpdatesOnDate(input.noteUpdates, targetDate, timeZone),
      conceptMemosUpdatedToday: countUpdatesOnDate(input.conceptMemoUpdates, targetDate, timeZone),
      monthCharacters: monthly.find((row) => row.month === targetMonth)?.characters || 0,
      notesUpdatedThisMonth: countUpdatesInMonth(input.noteUpdates, targetMonth, timeZone),
      conceptMemosUpdatedThisMonth: countUpdatesInMonth(input.conceptMemoUpdates, targetMonth, timeZone),
      yearCharacters: annual.reduce((total, row) => total + row.characters, 0),
      notesUpdatedThisYear: countUpdatesInYear(input.noteUpdates, targetYear, timeZone),
      conceptMemosUpdatedThisYear: countUpdatesInYear(input.conceptMemoUpdates, targetYear, timeZone),
    },
    daily,
    monthly,
    annual,
    workBreakdown,
    annualWorkBreakdown,
  };
}
