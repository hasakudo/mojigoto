import assert from "node:assert/strict";
import test from "node:test";
import { appendEventDocument, appendWritingEvent, makeWritingEvent } from "../web/lib/writing-records.mjs";

test("Web保存からVS Code取込用の執筆イベントを作る", () => {
  const event = makeWritingEvent({
    file: "第一章\\01.txt",
    beforeCount: 10,
    afterCount: 18,
    savedAt: new Date("2026-09-16T03:04:05.000Z"),
  });
  assert.match(event.id, /^web_/);
  assert.equal(event.source, "web");
  assert.equal(event.file, "第一章/01.txt");
  assert.equal(event.dateJst, "2026-09-16");
  assert.equal(event.savedAtJst, "2026-09-16 12:04:05");
  assert.equal(event.delta, 8);
});

test("執筆イベントは重複させず、古いものから上限整理する", () => {
  const base = { schemaVersion: 1, events: [{ id: "old" }, { id: "keep" }] };
  const event = { id: "new", savedAt: "2026-09-16T03:04:05.000Z" };
  const appended = appendEventDocument(base, event, 2);
  assert.deepEqual(appended.events.map((item) => item.id), ["keep", "new"]);
  assert.equal(appendEventDocument(appended, event, 2).events.length, 2);
  assert.deepEqual(base.events.map((item) => item.id), ["old", "keep"]);
});

function provider(raw = '{"events":[{"id":"old"}]}') {
  const writes = [];
  const item = { id: "events", name: "web-writing-events.json", file: {}, eTag: "1" };
  return { writes, async listChildren() { return [item]; }, async readText() { return raw; },
    async writeText(file, content) { writes.push(JSON.parse(content)); return file; },
    async createTextFile() { throw new Error("Unexpected creation"); } };
}

test("執筆記録の通信失敗・不正JSON・不正形式では空の記録を書き込まない", async () => {
  for (const raw of ["{broken", "{}", "null"]) {
    const p = provider(raw);
    await assert.rejects(appendWritingEvent(p, { id: "metadata" }, { id: "new" }));
    assert.equal(p.writes.length, 0);
  }
  const p = provider();
  p.readText = async () => { throw new Error("offline"); };
  await assert.rejects(appendWritingEvent(p, { id: "metadata" }, { id: "new" }), /offline/);
  assert.equal(p.writes.length, 0);
});

test("Google Driveの未許可執筆記録は作成せず、許可後は既存イベントを保持する", async () => {
  const p = provider();
  p.requiresExplicitFileAccess = true;
  const list = p.listChildren;
  p.listChildren = async () => [];
  await assert.rejects(appendWritingEvent(p, { id: "metadata" }, { id: "new" }), /追加許可/);
  assert.equal(p.writes.length, 0);
  p.listChildren = list;
  await appendWritingEvent(p, { id: "metadata" }, { id: "new" });
  assert.deepEqual(p.writes[0].events.map((event) => event.id), ["old", "new"]);
});

test("執筆記録の競合は最新版を読み直し、他端末のイベントを保持して再試行する", async () => {
  const p = provider();
  let attempts = 0;
  p.writeText = async (_file, content) => {
    if (!attempts++) {
      p.readText = async () => '{"events":[{"id":"old"},{"id":"other-device"}]}';
      throw Object.assign(new Error("conflict"), { code: "conflict" });
    }
    p.writes.push(JSON.parse(content));
  };
  await appendWritingEvent(p, { id: "metadata" }, { id: "new" });
  assert.deepEqual(p.writes[0].events.map((event) => event.id), ["old", "other-device", "new"]);
});
