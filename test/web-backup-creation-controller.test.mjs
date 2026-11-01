import assert from "node:assert/strict";
import test from "node:test";
import { createBackupCreation } from "../web/lib/backup-creation.mjs";
import { createBackupStorage } from "../web/lib/backup-storage.mjs";

function harness() {
  const records = new Map([["index", { snapshots: [] }]]), requests = [], notices = [], times = new Map();
  const indexFile = { id: "index", name: "index.json", file: {}, eTag: "1" };
  let failIndex = false;
  const provider = {
    async listChildren(id) { requests.push(["list", id]); return id === "meta" ? [{ id: "backups", name: "backups", folder: {} }] : [{ id: "snapshots", name: "snapshots", folder: {} }, indexFile]; },
    async readText(item) { return JSON.stringify(records.get(item.id)); },
    async createTextFile(parent, name, raw) { requests.push(["create", name]); records.set(name, JSON.parse(raw)); return { id: name, name, file: {}, eTag: "1" }; },
    async writeText(item, raw, eTag) { requests.push(["write", item.id, eTag]); if (failIndex) throw Error("index conflict"); records.set(item.id, JSON.parse(raw)); return { ...item, eTag: "2" }; },
  };
  const target = { targetType: "manuscript", relativePath: "chapter.txt", fileName: "chapter.txt", item: { id: "file" }, content: "保存した本文" };
  const state = { provider, cloudKind: "oneDrive", workRoot: { id: "root" }, selectedWork: { mojigoto: { id: "meta" } }, manuscriptBackupIntervalMinutes: 5, manuscriptAutomaticBackups: new Map() };
  const common = { state, currentBackupTarget: () => target, beginPerformanceMeasurement: () => () => {} };
  const storage = createBackupStorage(common);
  const session = { getItem: key => times.get(key), setItem: (key, value) => times.set(key, value) };
  const controller = createBackupCreation({ ...common, ...storage, workCatalogOwner: () => "owner", manuscriptBackupTarget: () => target, backupSessionStorage: () => session, notify: (...args) => notices.push(args) });
  return { controller, state, target, requests, records, notices, times, setIndexFailure(value) { failIndex = value; } };
}

test("分離した作成処理は本文を保存して索引へ追加し、手動の同内容重複を増やさない", async () => {
  const h = harness();
  const first = await h.controller.createWebManuscriptBackup();
  assert.equal(first.duplicate, false);
  const snapshot = [...h.records.values()].find(row => row.content);
  assert.equal(snapshot.content, h.target.content);
  assert.equal(snapshot.relativePath, h.target.relativePath);
  const second = await h.controller.createWebManuscriptBackup();
  assert.equal(second.duplicate, true);
  assert.equal(h.records.get("index").snapshots.length, 1);
  assert.equal(h.requests.filter(row => row[0] === "create").length, 1);
});

test("自動作成の成功を確認した間隔内は保存先へ問い合わせず、手動作成は確認する", async () => {
  const h = harness();
  await h.controller.createWebManuscriptBackup("automatic");
  const count = h.requests.length;
  const second = await h.controller.createWebManuscriptBackup("automatic");
  assert.equal(second.interval, true);
  assert.equal(h.requests.length, count);
  assert.equal(h.times.size, 1);
  await h.controller.createWebManuscriptBackup("manual");
  assert.ok(h.requests.length > count);
});

test("自動バックアップ無効でも復元前の退避は作成する", async () => {
  const h = harness(); h.state.manuscriptBackupIntervalMinutes = 0;
  assert.equal((await h.controller.createWebManuscriptBackup("automatic")).disabled, true);
  assert.equal(h.requests.length, 0);
  const result = await h.controller.createWebManuscriptBackup("before-restore");
  assert.equal(result.duplicate, false);
  assert.equal(h.records.get("index").snapshots[0].reason, "before-restore");
});

test("自動作成の索引保存失敗は通知して再試行可能にし、成功前の時間を記録しない", async () => {
  const h = harness(); h.setIndexFailure(true);
  await h.controller.maybeCreateWebAutomaticBackup(h.target.content);
  assert.equal(h.state.manuscriptAutomaticBackups.size, 0);
  assert.equal(h.times.size, 0);
  assert.match(h.notices[0][0], /本文は保存しましたが.*自動バックアップ/s);
  assert.equal(h.notices[0][1], true);
  h.setIndexFailure(false);
  await h.controller.maybeCreateWebAutomaticBackup(h.target.content);
  assert.equal(h.state.manuscriptAutomaticBackups.size, 1);
  assert.equal(h.times.size, 1);
  assert.equal(h.records.get("index").snapshots.length, 1);
});
