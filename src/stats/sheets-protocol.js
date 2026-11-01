const crypto = require("crypto");

const SHEETS_PROTOCOL_VERSION = 2;
const SHEETS_EVENT_BATCH_SIZE = 50;

function stringValue(value) {
  return String(value ?? "");
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function createRequestId(prefix = "req") {
  const id = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString("hex");
  return `${prefix}_${id}`;
}

function createEventId(event = {}) {
  if (String(event.eventId || "").trim()) return String(event.eventId).trim();
  const identity = [
    event.projectKey,
    event.project,
    event.savedAtJst,
    event.dateJst,
    event.file,
    event.chapter,
    finiteNumber(event.deltaTotal),
    finiteNumber(event.totalSaved),
    finiteNumber(event.deltaChap),
    finiteNumber(event.chapTotalSaved),
  ].map(stringValue);
  return `evt_${crypto.createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 32)}`;
}

function basePayload(type, secret, options = {}) {
  return {
    protocolVersion: SHEETS_PROTOCOL_VERSION,
    type,
    requestId: String(options.requestId || "").trim() || createRequestId(type),
    sentAt: Number(options.sentAt || Date.now()),
    secret: String(secret || ""),
  };
}

function createProgressPayload(secret, progress = {}, options = {}) {
  return {
    ...basePayload("progress", secret, options),
    project: stringValue(progress.project).trim(),
    projectKey: stringValue(progress.projectKey).trim(),
    date: stringValue(progress.date),
    total: finiteNumber(progress.total),
    daily: finiteNumber(progress.daily),
    updatedAt: Number(progress.updatedAt || Date.now()),
  };
}

function createPingPayload(secret, options = {}) {
  return basePayload("ping", secret, options);
}

function createEventPayload(secret, event = {}, options = {}) {
  return {
    ...basePayload("mojigoto_event", secret, options),
    eventId: createEventId(event),
    project: stringValue(event.project).trim(),
    projectKey: stringValue(event.projectKey).trim(),
    savedAtJst: stringValue(event.savedAtJst),
    dateJst: stringValue(event.dateJst),
    file: stringValue(event.file),
    chapter: stringValue(event.chapter),
    deltaTotal: finiteNumber(event.deltaTotal),
    totalSaved: finiteNumber(event.totalSaved),
    deltaChap: finiteNumber(event.deltaChap),
    chapTotalSaved: finiteNumber(event.chapTotalSaved),
  };
}

function createEventsBatchPayload(secret, events = [], options = {}) {
  if (!Array.isArray(events) || events.length === 0) {
    throw new Error("送信する日時ログがありません。");
  }
  if (events.length > SHEETS_EVENT_BATCH_SIZE) {
    throw new Error(`日時ログは一度に${SHEETS_EVENT_BATCH_SIZE}件まで送信できます。`);
  }
  const project = stringValue(options.project).trim();
  const projectKey = stringValue(options.projectKey).trim();
  return {
    ...basePayload("mojigoto_events_batch", secret, options),
    events: events.map((event) => createEventPayload("", {
      ...event,
      project: stringValue(event.project || project).trim(),
      projectKey: stringValue(event.projectKey || projectKey).trim(),
    }, {
      requestId: `event_${createEventId({ ...event, project: event.project || project, projectKey: event.projectKey || projectKey })}`,
      sentAt: options.sentAt,
    })),
  };
}

function chunkSheetsEvents(events = [], size = SHEETS_EVENT_BATCH_SIZE) {
  const chunks = [];
  for (let index = 0; index < events.length; index += size) {
    chunks.push(events.slice(index, index + size));
  }
  return chunks;
}

module.exports = {
  SHEETS_PROTOCOL_VERSION,
  SHEETS_EVENT_BATCH_SIZE,
  createRequestId,
  createEventId,
  createPingPayload,
  createProgressPayload,
  createEventPayload,
  createEventsBatchPayload,
  chunkSheetsEvents,
};
