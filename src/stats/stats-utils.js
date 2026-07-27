function nowJstParts(d = new Date()) {
  return {
    dateJst: formatJstDate(d).replaceAll("/", "-"),
    dateTimeJst: formatJstDateTime(d).replaceAll("/", "-"),
  };
}

function createJstFormatter(options = {}) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    ...options,
  });
}

function formatJstDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");

  return createJstFormatter({
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatJstDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");

  return createJstFormatter({
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatJstDateTimeMinutes(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");

  return createJstFormatter({
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatJstDateTimeShort(value = new Date(), now = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");

  const current = now instanceof Date ? now : new Date(now);
  const sameYear =
    !Number.isNaN(current.getTime()) &&
    date.getFullYear() === current.getFullYear();

  return createJstFormatter({
    ...(sameYear ? {} : { year: "numeric" }),
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function gsGet(context, key, fallback) {
  try {
    return context.globalState.get(key, fallback);
  } catch {
    return fallback;
  }
}

async function gsSet(context, key, value) {
  try {
    await context.globalState.update(key, value);
  } catch {}
}

function parseJstDateKeyToMs(dateStr) {
  const m = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return NaN;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);

  return Date.UTC(y, mo - 1, d, 0, 0, 0) - 9 * 60 * 60 * 1000;
}

function parseJstDateTimeToMs(dateTimeStr) {
  const m = String(dateTimeStr || "").match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/,
  );
  if (!m) return NaN;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const hh = Number(m[4]);
  const mm = Number(m[5]);
  const ss = Number(m[6]);

  return Date.UTC(y, mo - 1, d, hh, mm, ss) - 9 * 60 * 60 * 1000;
}

function pruneDateMapByRetentionDays(obj, retentionDays) {
  if (!obj || typeof obj !== "object") return {};
  if (!retentionDays || retentionDays <= 0) return { ...obj };

  const nowMs = Date.now();
  const limitMs = retentionDays * 24 * 60 * 60 * 1000;
  const out = {};

  for (const [dateStr, value] of Object.entries(obj)) {
    const ts = parseJstDateKeyToMs(dateStr);

    if (!Number.isFinite(ts)) {
      out[dateStr] = value;
      continue;
    }

    if (nowMs - ts <= limitMs) {
      out[dateStr] = value;
    }
  }

  return out;
}

function pruneEventsByPolicy(events, maxCount, retentionDays) {
  let out = Array.isArray(events) ? [...events] : [];

  if (retentionDays > 0) {
    const nowMs = Date.now();
    const limitMs = retentionDays * 24 * 60 * 60 * 1000;

    out = out.filter((ev) => {
      const ts = parseJstDateTimeToMs(ev?.savedAtJst || "");
      if (!Number.isFinite(ts)) return true;
      return nowMs - ts <= limitMs;
    });
  }

  if (maxCount > 0 && out.length > maxCount) {
    out.splice(0, out.length - maxCount);
  }

  return out;
}

function ensureDailyObj(daily, dateJst) {
  if (!daily[dateJst] || typeof daily[dateJst] !== "object") {
    daily[dateJst] = {
      deltaTotal: 0,
      totalSaved: 0,
      goal: 0,
      pct: 0,
      chapters: {},
      updatedAtJst: "",
    };
  }

  if (!daily[dateJst].chapters || typeof daily[dateJst].chapters !== "object") {
    daily[dateJst].chapters = {};
  }

  if (typeof daily[dateJst].deltaTotal !== "number") {
    daily[dateJst].deltaTotal = 0;
  }
  if (typeof daily[dateJst].totalSaved !== "number") {
    daily[dateJst].totalSaved = 0;
  }
  if (typeof daily[dateJst].goal !== "number") {
    daily[dateJst].goal = 0;
  }
  if (typeof daily[dateJst].pct !== "number") {
    daily[dateJst].pct = 0;
  }
  if (typeof daily[dateJst].updatedAtJst !== "string") {
    daily[dateJst].updatedAtJst = "";
  }

  return daily[dateJst];
}

function ensureFilesObj(files, dateJst) {
  if (!files[dateJst] || typeof files[dateJst] !== "object") {
    files[dateJst] = {};
  }
  return files[dateJst];
}

let _refreshStatsHandler = null;

function setStatsRefreshHandler(fn) {
  _refreshStatsHandler = typeof fn === "function" ? fn : null;
}

async function triggerStatsRefresh() {
  if (typeof _refreshStatsHandler !== "function") {
    return false;
  }

  await _refreshStatsHandler();
  return true;
}

function createEscaper() {
  return (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
}

module.exports = {
  nowJstParts,
  formatJstDate,
  formatJstDateTime,
  formatJstDateTimeMinutes,
  formatJstDateTimeShort,
  gsGet,
  gsSet,
  parseJstDateKeyToMs,
  parseJstDateTimeToMs,
  pruneDateMapByRetentionDays,
  pruneEventsByPolicy,
  ensureDailyObj,
  ensureFilesObj,
  setStatsRefreshHandler,
  triggerStatsRefresh,
  createEscaper,
};
