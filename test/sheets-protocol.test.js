const assert = require("node:assert/strict");
const test = require("node:test");
const {
  SHEETS_PROTOCOL_VERSION,
  createEventId,
  createPingPayload,
  createProgressPayload,
  createEventsBatchPayload,
  chunkSheetsEvents,
} = require("../src/stats/sheets-protocol");

const event = {
  savedAtJst: "2026-09-24 15:30:00",
  dateJst: "2026-09-24",
  file: "第一章/本文.txt",
  chapter: "第一章",
  deltaTotal: 120,
  totalSaved: 36120,
  deltaChap: 120,
  chapTotalSaved: 8120,
};

test("Sheets連携v2は進捗へ版・要求ID・送信日時を付ける", () => {
  const ping = createPingPayload("secret", { requestId: "ping_fixed", sentAt: 100 });
  assert.deepEqual(ping, {
    protocolVersion: SHEETS_PROTOCOL_VERSION,
    type: "ping",
    requestId: "ping_fixed",
    sentAt: 100,
    secret: "secret",
  });
  const payload = createProgressPayload("secret", {
    project: "作品",
    projectKey: "s_work",
    date: "2026-09-24",
    total: 36120,
    daily: 120,
    updatedAt: 123,
  }, { requestId: "req_fixed", sentAt: 456 });
  assert.equal(payload.protocolVersion, SHEETS_PROTOCOL_VERSION);
  assert.equal(payload.requestId, "req_fixed");
  assert.equal(payload.sentAt, 456);
  assert.equal(payload.secret, "secret");
});

test("同じ日時ログから再送しても変わらないイベントIDを作る", () => {
  const first = createEventId({ ...event, project: "作品", projectKey: "s_work" });
  const second = createEventId({ ...event, project: "作品", projectKey: "s_work" });
  assert.equal(first, second);
  assert.match(first, /^evt_[0-9a-f]{32}$/);
  assert.notEqual(first, createEventId({ ...event, totalSaved: 36121, project: "作品", projectKey: "s_work" }));
});

test("日時ログを50件単位のv2一括送信へ変換する", () => {
  const events = Array.from({ length: 101 }, (_, index) => ({ ...event, totalSaved: index }));
  const chunks = chunkSheetsEvents(events);
  assert.deepEqual(chunks.map((chunk) => chunk.length), [50, 50, 1]);
  const payload = createEventsBatchPayload("secret", chunks[0], {
    project: "作品",
    projectKey: "s_work",
    requestId: "batch_fixed",
    sentAt: 789,
  });
  assert.equal(payload.type, "mojigoto_events_batch");
  assert.equal(payload.events.length, 50);
  assert.equal(payload.events[0].secret, "");
  assert.equal(payload.events[0].project, "作品");
  assert.match(payload.events[0].eventId, /^evt_/);
});
